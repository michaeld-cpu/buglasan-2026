/**
 * Score round-trip.
 *
 * Pins the one thing the review dialog depends on: a score written for a
 * candidate must come back keyed to THAT candidate. A regression here is
 * silent and lands at the worst moment, the submit checkpoint read a
 * fully-scored sheet as "not saved" for every candidate, because
 * `scoresFor` destructured the four-part score key one position short and
 * returned rows keyed by judgeId.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasEverSubmitted,
  hasSubmitted,
  resetPageant,
  saveScores,
  scoresFor,
  submitSheet,
  unsubmitSheet,
} from './store';

const SLUG = 'hara-negros-oriental-2026';

describe('scoresFor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetPageant(SLUG);
  });

  it('returns each score under the candidate it was written for', () => {
    saveScores(SLUG, 'aquatic', 'judge-1', [
      { candidateId: 'cand-a', criterionKey: null, value: 7 },
      { candidateId: 'cand-b', criterionKey: null, value: 9 },
    ]);

    const rows = scoresFor(SLUG, 'aquatic', 'judge-1');
    const byCandidate = new Map(rows.map((r) => [r.candidateId, r.value]));

    expect(byCandidate.get('cand-a')).toBe(7);
    expect(byCandidate.get('cand-b')).toBe(9);
    // The judgeId must never leak into the candidate slot.
    expect(byCandidate.has('judge-1')).toBe(false);
  });

  it('preserves the criterion key, and maps the single-score sentinel to null', () => {
    saveScores(SLUG, 'gown', 'judge-2', [
      { candidateId: 'cand-a', criterionKey: 'poise', value: 8 },
      { candidateId: 'cand-a', criterionKey: null, value: 5 },
    ]);

    const rows = scoresFor(SLUG, 'gown', 'judge-2');
    expect(rows.every((r) => r.candidateId === 'cand-a')).toBe(true);
    expect(rows.find((r) => r.criterionKey === 'poise')?.value).toBe(8);
    expect(rows.find((r) => r.criterionKey === null)?.value).toBe(5);
  });

  it('does not return another judge’s or another segment’s scores', () => {
    saveScores(SLUG, 'aquatic', 'judge-1', [
      { candidateId: 'cand-a', criterionKey: null, value: 7 },
    ]);
    saveScores(SLUG, 'aquatic', 'judge-2', [
      { candidateId: 'cand-a', criterionKey: null, value: 2 },
    ]);
    saveScores(SLUG, 'gown', 'judge-1', [
      { candidateId: 'cand-a', criterionKey: null, value: 3 },
    ]);

    const rows = scoresFor(SLUG, 'aquatic', 'judge-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(7);
  });
});

describe('submitSheet — first vs resubmission', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetPageant(SLUG);
  });

  it('reports the first submission as first, and later ones as not', () => {
    expect(submitSheet(SLUG, 'aquatic', 'judge-1')).toBe(true);
    expect(submitSheet(SLUG, 'aquatic', 'judge-1')).toBe(false);
  });

  it('stays "not first" across reopen and edit — the celebration is once only', () => {
    expect(submitSheet(SLUG, 'aquatic', 'judge-1')).toBe(true);
    unsubmitSheet(SLUG, 'aquatic', 'judge-1');
    expect(hasSubmitted(SLUG, 'aquatic', 'judge-1')).toBe(false);
    // reopened, corrected, sent again: housekeeping, not an achievement
    expect(submitSheet(SLUG, 'aquatic', 'judge-1')).toBe(false);
    expect(hasEverSubmitted(SLUG, 'aquatic', 'judge-1')).toBe(true);
  });

  it('tracks first submission per judge and per segment', () => {
    expect(submitSheet(SLUG, 'aquatic', 'judge-1')).toBe(true);
    // a different seat on the same segment is still a first
    expect(submitSheet(SLUG, 'aquatic', 'judge-2')).toBe(true);
    // the same seat on a different segment is still a first
    expect(submitSheet(SLUG, 'gown', 'judge-1')).toBe(true);
  });
});

describe('decimal scores', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetPageant(SLUG);
  });

  /* Half-points are legal on several segments — the rulebook allows them —
     so the store has to round-trip them exactly. This was briefly broken by
     an integers-only guard added for a button-pad UI that has since been
     reverted; the test stays so the guard cannot come back by accident. */
  it('round-trips half-points without rounding them', () => {
    saveScores(SLUG, 'aquatic', 'judge-1', [
      { candidateId: 'cand-a', criterionKey: null, value: 7.5 },
      { candidateId: 'cand-b', criterionKey: null, value: 9.5 },
    ]);
    const byCandidate = new Map(
      scoresFor(SLUG, 'aquatic', 'judge-1').map((r) => [r.candidateId, r.value]),
    );
    expect(byCandidate.get('cand-a')).toBe(7.5);
    expect(byCandidate.get('cand-b')).toBe(9.5);
  });

  it('keeps one-decimal precision across the range', () => {
    const values = [0.5, 1.5, 4.5, 8.5, 9.9];
    values.forEach((v, i) =>
      saveScores(SLUG, 'aquatic', 'judge-1', [
        { candidateId: `c-${i}`, criterionKey: null, value: v },
      ]),
    );
    const got = scoresFor(SLUG, 'aquatic', 'judge-1')
      .map((r) => r.value)
      .sort((a, b) => a - b);
    expect(got).toEqual(values);
  });
});
