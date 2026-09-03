/**
 * The two contests with no cuts: LGU Booth Contest and Festival of Festivals.
 *
 * Both differ from the pageants in the same structural way, nobody is
 * eliminated, so there is no final cut to read placements from. These tests
 * exist mainly to pin that behaviour down, because the engine originally
 * returned an empty placement list for a config with `cuts: []` and would have
 * computed a full standing and discarded it.
 *
 * Every expected number below is hand-derived from the published criteria
 * weights, not captured from a run.
 */

import { describe, expect, it } from 'vitest';
import { tabulate } from '../src/engine';
import { festivalOfFestivals2026 } from '../src/presets/festival-of-festivals-2026';
import { lguBoothContest2026 } from '../src/presets/lgu-booth-contest-2026';
import type { Candidate, Judge, ScoreRow } from '../src/types';

const judges: Judge[] = [
  { id: 'j1', displayName: 'Chairman', isChairman: true, seatNo: 1, active: true },
  { id: 'j2', displayName: 'Judge 2', isChairman: false, seatNo: 2, active: true },
  { id: 'j3', displayName: 'Judge 3', isChairman: false, seatNo: 3, active: true },
];

const entries = (n: number): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    number: i + 1,
    name: `Entry ${i + 1}`,
    lgu: `Town ${i + 1}`,
    status: 'ACTIVE' as const,
  }));

// ---------------------------------------------------------------------------
// LGU Booth Contest
// ---------------------------------------------------------------------------

describe('LGU Booth Contest, published weights', () => {
  it('judged criteria sum to 85, leaving 15 for Public Choice', () => {
    const walkthrough = lguBoothContest2026.segments.find((s) => s.key === 'walkthrough')!;
    const total = walkthrough.criteria.reduce((a, c) => a + c.maxScore, 0);
    expect(total).toBe(85);
    expect(walkthrough.maxTotal).toBe(85);

    const publicChoice = lguBoothContest2026.segments.find((s) => s.key === 'public_choice')!;
    // 85 judged + 15 public = the 100 the public site advertises.
    expect(total + publicChoice.maxTotal).toBe(100);
  });

  it('keeps Public Choice off every judge sheet', () => {
    const publicChoice = lguBoothContest2026.segments.find((s) => s.key === 'public_choice')!;
    // awardOnly segments never feed a phase total, and the judge UI filters on
    // this flag to decide what to show. If it ever flips, judges are asked to
    // score the online vote tally by hand.
    expect(publicChoice.awardOnly).toBe(true);
  });

  it('ranks booths by the mean of judge sheets, highest first', () => {
    const cands = entries(3);
    const scores: ScoreRow[] = [];

    /* Sheet totals, chosen so the ordering is unambiguous:
         e1: 30 + 25 + 15 = 70
         e2: 35 + 30 + 20 = 85   <- best
         e3: 20 + 20 + 10 = 50
       Every judge scores identically, so the mean equals the sheet and the
       normalized score is total/85*100. */
    const sheet: Record<string, [number, number, number]> = {
      e1: [30, 25, 15],
      e2: [35, 30, 20],
      e3: [20, 20, 10],
    };

    for (const j of judges) {
      for (const c of cands) {
        const [architecture, trade, hospitality] = sheet[c.id];
        scores.push(
          { segmentKey: 'walkthrough', criterionKey: 'architecture', judgeId: j.id, candidateId: c.id, value: architecture },
          { segmentKey: 'walkthrough', criterionKey: 'trade', judgeId: j.id, candidateId: c.id, value: trade },
          { segmentKey: 'walkthrough', criterionKey: 'hospitality', judgeId: j.id, candidateId: c.id, value: hospitality });
      }
    }

    const result = tabulate({
      config: lguBoothContest2026,
      candidates: cands,
      judges,
      scores,
    });

    const standing = result.segmentStandings.find((s) => s.segmentKey === 'walkthrough')!;
    expect(standing.complete).toBe(true);

    const byId = new Map(standing.rows.map((r) => [r.candidateId, r]));
    expect(byId.get('e2')!.place).toBe(1);
    expect(byId.get('e1')!.place).toBe(2);
    expect(byId.get('e3')!.place).toBe(3);

    // Raw means are the sheet totals, unchanged by judge count.
    expect(byId.get('e2')!.rawMean).toBe(85);
    expect(byId.get('e1')!.rawMean).toBe(70);
    expect(byId.get('e3')!.rawMean).toBe(50);
  });

  it('produces placements despite having no cuts', () => {
    const cands = entries(3);
    const scores: ScoreRow[] = [];
    const totals: Record<string, [number, number, number]> = {
      e1: [30, 25, 15], // 70
      e2: [35, 30, 20], // 85
      e3: [20, 20, 10], // 50
    };
    for (const j of judges) {
      for (const c of cands) {
        const [a, t, h] = totals[c.id];
        scores.push(
          { segmentKey: 'walkthrough', criterionKey: 'architecture', judgeId: j.id, candidateId: c.id, value: a },
          { segmentKey: 'walkthrough', criterionKey: 'trade', judgeId: j.id, candidateId: c.id, value: t },
          { segmentKey: 'walkthrough', criterionKey: 'hospitality', judgeId: j.id, candidateId: c.id, value: h });
      }
    }

    const result = tabulate({ config: lguBoothContest2026, candidates: cands, judges, scores });

    // This is the regression the engine fix addresses: cuts is empty, so the
    // final phase standing has to become the placement list.
    expect(result.cuts).toHaveLength(0);
    expect(result.finalPlacements).toHaveLength(3);

    const winner = result.finalPlacements.find((p) => p.place === 1)!;
    expect(winner.candidateId).toBe('e2');
  });
});

// ---------------------------------------------------------------------------
// Festival of Festivals
// ---------------------------------------------------------------------------

describe('Festival of Festivals, two equally weighted segments', () => {
  it('carries the published 100-point sheet on both segments', () => {
    for (const key of ['street_dancing', 'showdown']) {
      const seg = festivalOfFestivals2026.segments.find((s) => s.key === key)!;
      const total = seg.criteria.reduce((a, c) => a + c.maxScore, 0);
      expect(total).toBe(100);
      expect(seg.maxTotal).toBe(100);
      // Equal weight is the documented default; this test is what fails loudly
      // if someone changes one segment's weight without the other.
      expect(seg.weight).toBe(1);
    }
  });

  it('averages the two segments into one standing', () => {
    const cands = entries(2);
    const scores: ScoreRow[] = [];

    /* e1 is stronger on the street, e2 in the arena:
         e1: street 100, showdown 60  -> phase mean 80
         e2: street  60, showdown 100 -> phase mean 80   (a deliberate tie)
       Equal weights mean these must come out level, which is the property
       worth pinning: if the weights silently stop being equal, this breaks. */
    const sheets: Record<string, { street: number; show: number }> = {
      e1: { street: 100, show: 60 },
      e2: { street: 60, show: 100 },
    };

    for (const j of judges) {
      for (const c of cands) {
        const { street, show } = sheets[c.id];
        // Split each total across the four criteria in proportion to weight,
        // so the sheet sums exactly to the intended figure.
        const split = (total: number): [number, number, number, number] => [
          (total * 35) / 100,
          (total * 30) / 100,
          (total * 20) / 100,
          (total * 15) / 100,
        ];
        const [sc, ss, sco, sp] = split(street);
        const [dc, ds, dco, dp] = split(show);
        scores.push(
          { segmentKey: 'street_dancing', criterionKey: 'choreography', judgeId: j.id, candidateId: c.id, value: sc },
          { segmentKey: 'street_dancing', criterionKey: 'story', judgeId: j.id, candidateId: c.id, value: ss },
          { segmentKey: 'street_dancing', criterionKey: 'costume', judgeId: j.id, candidateId: c.id, value: sco },
          { segmentKey: 'street_dancing', criterionKey: 'presentation', judgeId: j.id, candidateId: c.id, value: sp },
          { segmentKey: 'showdown', criterionKey: 'choreography', judgeId: j.id, candidateId: c.id, value: dc },
          { segmentKey: 'showdown', criterionKey: 'story', judgeId: j.id, candidateId: c.id, value: ds },
          { segmentKey: 'showdown', criterionKey: 'costume', judgeId: j.id, candidateId: c.id, value: dco },
          { segmentKey: 'showdown', criterionKey: 'presentation', judgeId: j.id, candidateId: c.id, value: dp });
      }
    }

    const result = tabulate({ config: festivalOfFestivals2026, candidates: cands, judges, scores });

    const phase = result.phaseStandings.find((p) => p.phaseKey === 'COMPETITION')!;
    const byId = new Map(phase.rows.map((r) => [r.candidateId, r]));
    expect(byId.get('e1')!.score).toBe(byId.get('e2')!.score);
    // Equal scores must share a place, not be ordered arbitrarily.
    expect(byId.get('e1')!.place).toBe(1);
    expect(byId.get('e2')!.place).toBe(1);
  });

  it('ranks the arena winner first when the street round is level', () => {
    const cands = entries(2);
    const scores: ScoreRow[] = [];
    const sheets: Record<string, { street: number; show: number }> = {
      e1: { street: 80, show: 90 }, // mean 85 <- best
      e2: { street: 80, show: 70 }, // mean 75
    };

    for (const j of judges) {
      for (const c of cands) {
        const { street, show } = sheets[c.id];
        const split = (t: number): [number, number, number, number] => [
          (t * 35) / 100, (t * 30) / 100, (t * 20) / 100, (t * 15) / 100,
        ];
        const s = split(street);
        const d = split(show);
        const keys = ['choreography', 'story', 'costume', 'presentation'] as const;
        keys.forEach((k, i) => {
          scores.push(
            { segmentKey: 'street_dancing', criterionKey: k, judgeId: j.id, candidateId: c.id, value: s[i] },
            { segmentKey: 'showdown', criterionKey: k, judgeId: j.id, candidateId: c.id, value: d[i] });
        });
      }
    }

    const result = tabulate({ config: festivalOfFestivals2026, candidates: cands, judges, scores });
    const winner = result.finalPlacements.find((p) => p.place === 1)!;
    expect(winner.candidateId).toBe('e1');
    expect(result.finalPlacements).toHaveLength(2);
  });

  it('flags a partially scored contest rather than reporting a winner as final', () => {
    const cands = entries(2);
    // Only one judge, only the street round, only one entry scored.
    const scores: ScoreRow[] = [
      { segmentKey: 'street_dancing', criterionKey: 'choreography', judgeId: 'j1', candidateId: 'e1', value: 30 },
      { segmentKey: 'street_dancing', criterionKey: 'story', judgeId: 'j1', candidateId: 'e1', value: 25 },
      { segmentKey: 'street_dancing', criterionKey: 'costume', judgeId: 'j1', candidateId: 'e1', value: 15 },
      { segmentKey: 'street_dancing', criterionKey: 'presentation', judgeId: 'j1', candidateId: 'e1', value: 10 },
    ];

    const result = tabulate({ config: festivalOfFestivals2026, candidates: cands, judges, scores });
    expect(result.warnings.some((w) => w.includes('partially scored'))).toBe(true);
  });
});
