/**
 * Bulk segment-status writes.
 *
 * The rehearsal bar's "Open all" is the only thing in the app that changes
 * many segments at once, and getting it wrong has a specific failure mode:
 * opening an `awardOnly` segment would put a sheet in front of a judge for
 * something they are not meant to score (the online vote tally). That is what
 * these tests pin down.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  PAGEANTS,
  configFor,
  getState,
  resetPageant,
  setAllProgramsSegmentStatus,
  setAllSegmentStatus,
} from './store';

const HARA = 'hara-negros-oriental-2026';
const BOOTHS = 'lgu-booth-contest-2026';

beforeEach(() => {
  for (const p of PAGEANTS) resetPageant(p.slug);
});

describe('setAllSegmentStatus', () => {
  it('seeds every segment as DRAFT', () => {
    const state = getState(HARA);
    const config = configFor(HARA)!;
    for (const s of config.segments) {
      expect(state.segmentStatus[s.key]).toBe('DRAFT');
    }
  });

  it('opens every scorable segment of one program', () => {
    setAllSegmentStatus(HARA, 'OPEN');
    const state = getState(HARA);
    const config = configFor(HARA)!;

    for (const s of config.segments.filter((x) => !x.awardOnly)) {
      expect(state.segmentStatus[s.key]).toBe('OPEN');
    }
  });

  it('leaves awardOnly segments alone', () => {
    setAllSegmentStatus(HARA, 'OPEN');
    const state = getState(HARA);
    const awardOnly = configFor(HARA)!.segments.filter((s) => s.awardOnly);

    // Hara's tourism reel is fed from outside the panel. Opening it would put
    // a sheet on a judge's screen for something they never score.
    expect(awardOnly.length).toBeGreaterThan(0);
    for (const s of awardOnly) {
      expect(state.segmentStatus[s.key]).toBe('DRAFT');
    }
  });

  it('keeps the booth contest’s Public Choice tally closed', () => {
    setAllSegmentStatus(BOOTHS, 'OPEN');
    const state = getState(BOOTHS);
    expect(state.segmentStatus.walkthrough).toBe('OPEN');
    expect(state.segmentStatus.public_choice).toBe('DRAFT');
  });

  it('closes and resets as well as opens', () => {
    setAllSegmentStatus(HARA, 'OPEN');
    setAllSegmentStatus(HARA, 'CLOSED');
    expect(getState(HARA).segmentStatus.aquatic).toBe('CLOSED');

    setAllSegmentStatus(HARA, 'DRAFT');
    expect(getState(HARA).segmentStatus.aquatic).toBe('DRAFT');
  });

  it('does not touch scores or submissions', () => {
    const before = getState(HARA);
    setAllSegmentStatus(HARA, 'OPEN');
    const after = getState(HARA);

    // Opening a segment must never disturb what judges have already entered.
    expect(after.scores).toEqual(before.scores);
    expect(after.submissions).toEqual(before.submissions);
    expect(after.candidates).toHaveLength(before.candidates.length);
  });

  it('ignores an unknown program rather than throwing', () => {
    expect(() => setAllSegmentStatus('no-such-program', 'OPEN')).not.toThrow();
  });
});

describe('setAllProgramsSegmentStatus', () => {
  it('opens the scorable segments of all four programs at once', () => {
    setAllProgramsSegmentStatus('OPEN');

    let opened = 0;
    for (const p of PAGEANTS) {
      const state = getState(p.slug);
      const scorable = configFor(p.slug)!.segments.filter((s) => !s.awardOnly);
      for (const s of scorable) {
        expect(state.segmentStatus[s.key]).toBe('OPEN');
        opened++;
      }
    }
    // The bar reports this number; if the roster changes, it should change too.
    expect(opened).toBe(19);
  });

  it('never opens an awardOnly segment on any program', () => {
    setAllProgramsSegmentStatus('OPEN');
    for (const p of PAGEANTS) {
      const state = getState(p.slug);
      for (const s of configFor(p.slug)!.segments.filter((x) => x.awardOnly)) {
        expect(state.segmentStatus[s.key]).not.toBe('OPEN');
      }
    }
  });
});
