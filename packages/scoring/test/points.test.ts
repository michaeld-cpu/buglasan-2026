/**
 * POINTS engine, Gandang NegOrense 2026.
 *
 * These tests exist because a tabulation bug on coronation night cannot be
 * fixed after the fact. Every number asserted here is hand-derived from the
 * rulebook, not from a previous run of the code.
 */

import { describe, expect, it } from 'vitest';
import { gandangNegOrense2026 } from '../src/presets/gandang-negorense-2026';
import { tabulate } from '../src/engine';
import { Candidate, Judge, ScoreRow, TabulationInput } from '../src/types';

const PRELIM_SEGMENTS: Array<[string, number]> = [
  ['beauty_closed', 10],
  ['beauty_stage', 10],
  ['filipiniana', 10],
  ['talent', 15],
  ['interview', 15],
  ['gown', 15],
  ['swimsuit', 15],
  ['professionalism', 10],
];

function candidates(n: number): Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    number: i + 1,
    name: `Candidate ${i + 1}`,
    lgu: `LGU ${i + 1}`,
    status: 'ACTIVE' as const,
  }));
}

function judges(n: number): Judge[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `j${i + 1}`,
    displayName: `Judge ${i + 1}`,
    isChairman: i === 0,
    seatNo: i + 1,
    active: true,
  }));
}

/** Every judge gives every candidate `pct` of the max in every prelim segment. */
function prelimScores(cands: Candidate[], js: Judge[], pctFor: (c: Candidate) => number): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const [segmentKey, max] of PRELIM_SEGMENTS) {
    for (const j of js) {
      for (const c of cands) {
        rows.push({
          segmentKey,
          criterionKey: null,
          judgeId: j.id,
          candidateId: c.id,
          value: (pctFor(c) / 100) * max,
        });
      }
    }
  }
  return rows;
}

describe('POINTS engine, Gandang NegOrense 2026', () => {
  it('official criteria sum to exactly 100 points', () => {
    const total = PRELIM_SEGMENTS.reduce((a, [, m]) => a + m, 0);
    expect(total).toBe(100);

    // And the config's weights must mirror the max points, or the phase mean
    // silently stops reproducing the rulebook total.
    for (const [key, max] of PRELIM_SEGMENTS) {
      const seg = gandangNegOrense2026.segments.find((s) => s.key === key)!;
      expect(seg.maxTotal).toBe(max);
      expect(seg.weight).toBe(max);
    }
  });

  it('a perfect sheet from every judge yields a 100.00 preliminary score', () => {
    const cands = candidates(3);
    const js = judges(5);
    const input: TabulationInput = {
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores: prelimScores(cands, js, () => 100),
    };
    const result = tabulate(input);
    const prelim = result.phaseStandings.find((p) => p.phaseKey === 'PRELIM')!;
    for (const row of prelim.rows) expect(row.score).toBeCloseTo(100, 4);
  });

  it('reproduces the rulebook point total for a mixed sheet', () => {
    // One candidate, one judge, hand-picked raw points.
    const cands = candidates(1);
    const js = judges(1);
    const raw: Record<string, number> = {
      beauty_closed: 9,
      beauty_stage: 8,
      filipiniana: 7,
      talent: 13,
      interview: 12,
      gown: 14,
      swimsuit: 11,
      professionalism: 9,
    };
    // Hand total: 9+8+7+13+12+14+11+9 = 83
    const expected = 83;

    const scores: ScoreRow[] = Object.entries(raw).map(([segmentKey, value]) => ({
      segmentKey,
      criterionKey: null,
      judgeId: 'j1',
      candidateId: 'c1',
      value,
    }));

    const result = tabulate({
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores,
    });
    const prelim = result.phaseStandings.find((p) => p.phaseKey === 'PRELIM')!;
    expect(prelim.rows[0].score).toBeCloseTo(expected, 4);
  });

  it('averages across judges rather than summing, so a missing judge does not deflate the field', () => {
    const cands = candidates(2);
    const js = judges(3);
    // Judges 1 and 2 give 80%, judge 3 gives 80% too, score must be 80, not 240.
    const result = tabulate({
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores: prelimScores(cands, js, () => 80),
    });
    const prelim = result.phaseStandings.find((p) => p.phaseKey === 'PRELIM')!;
    expect(prelim.rows[0].score).toBeCloseTo(80, 4);
  });

  it('applies the Top 8 cut and the 40/60 then 50/50 carryover exactly', () => {
    // 12 candidates with descending prelim percentages: 95, 90, 85... 40
    const cands = candidates(12);
    const js = judges(1);
    const pct = (c: Candidate) => 95 - (c.number - 1) * 5;

    const scores = prelimScores(cands, js, pct);

    // Top 8 interview: give c1..c8 raw interview totals out of 100.
    // c1 gets 50, c8 gets 100, enough to overturn the prelim order, which is
    // the whole point of testing a weighted carryover.
    const top8Interview: Record<string, [number, number, number]> = {
      c1: [20, 15, 15], // 50
      c2: [24, 18, 18], // 60
      c3: [28, 21, 21], // 70
      c4: [32, 24, 24], // 80
      c5: [36, 27, 27], // 90
      c6: [40, 30, 30], // 100
      c7: [36, 27, 27], // 90
      c8: [40, 30, 30], // 100
    };
    for (const [cid, [content, delivery, presence]] of Object.entries(top8Interview)) {
      scores.push(
        { segmentKey: 'top8_interview', criterionKey: 'content', judgeId: 'j1', candidateId: cid, value: content },
        { segmentKey: 'top8_interview', criterionKey: 'delivery', judgeId: 'j1', candidateId: cid, value: delivery },
        { segmentKey: 'top8_interview', criterionKey: 'presence', judgeId: 'j1', candidateId: cid, value: presence }
      );
    }

    const result = tabulate({
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores,
    });

    const top8 = result.cuts.find((c) => c.cutKey === 'TOP_8')!;
    expect(top8.advancing).toHaveLength(8);
    expect(top8.advancing.map((a) => a.candidateId)).toEqual([
      'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
    ]);

    const top5 = result.cuts.find((c) => c.cutKey === 'TOP_5')!;
    // Hand-computed 0.4 * prelim + 0.6 * interview:
    //   c1: .4*95 + .6*50  = 38 + 30 = 68
    //   c2: .4*90 + .6*60  = 36 + 36 = 72
    //   c3: .4*85 + .6*70  = 34 + 42 = 76
    //   c4: .4*80 + .6*80  = 32 + 48 = 80
    //   c5: .4*75 + .6*90  = 30 + 54 = 84
    //   c6: .4*70 + .6*100 = 28 + 60 = 88
    //   c7: .4*65 + .6*90  = 26 + 54 = 80
    //   c8: .4*60 + .6*100 = 24 + 60 = 84
    const allTop5Rows: Array<{ candidateId: string; score: number }> = [
      ...top5.advancing, ...top5.eliminated,
    ];
    const byId = new Map(allTop5Rows.map((r) => [r.candidateId, r.score]));
    expect(byId.get('c1')).toBeCloseTo(68, 4);
    expect(byId.get('c6')).toBeCloseTo(88, 4);
    expect(byId.get('c5')).toBeCloseTo(84, 4);
    expect(byId.get('c4')).toBeCloseTo(80, 4);

    // Top 5 = highest five of {68,72,76,80,84,88,80,84} -> 88,84,84,80,80
    expect(top5.advancing).toHaveLength(5);
    expect(top5.advancing[0].candidateId).toBe('c6');
    expect(top5.advancing.map((a) => a.score)).toEqual([88, 84, 84, 80, 80]);
  });

  it("grants a Top 8 slot to the People's Choice winner who would not otherwise advance", () => {
    const cands = candidates(12);
    const js = judges(1);
    // c12 is last on score but wins People's Choice.
    const result = tabulate({
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores: prelimScores(cands, js, (c) => 95 - (c.number - 1) * 5),
      metrics: [
        { candidateId: 'c12', key: 'peoplesChoice', value: 9000 },
        { candidateId: 'c3', key: 'peoplesChoice', value: 120 },
      ],
    });

    const top8 = result.cuts.find((c) => c.cutKey === 'TOP_8')!;
    expect(top8.advancing).toHaveLength(8);
    const ids = top8.advancing.map((a) => a.candidateId);
    expect(ids).toContain('c12');
    // The auto slot consumes one of the eight, so the 8th-best on score is out.
    expect(ids).not.toContain('c8');
    expect(top8.advancing.find((a) => a.candidateId === 'c12')!.autoReason).toBe(
      "People's Choice Award"
    );
  });

  it('computes the tourism video award as 70% judges + 30% social engagement', () => {
    const cands = candidates(2);
    const js = judges(1);
    const scores: ScoreRow[] = [];

    // c1: judge total 80/100. c2: judge total 100/100.
    const put = (cid: string, vals: [number, number, number, number]) => {
      const keys = ['concept', 'production', 'jingle', 'promotion'];
      vals.forEach((v, i) =>
        scores.push({
          segmentKey: 'tourism_video',
          criterionKey: keys[i],
          judgeId: 'j1',
          candidateId: cid,
          value: v,
        })
      );
    };
    put('c1', [24, 20, 16, 20]); // 80
    put('c2', [30, 25, 20, 25]); // 100

    // c1 dominates social: 900 combined vs c2's 100 -> c1 = 100, c2 = 11.11
    const result = tabulate({
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores,
      metrics: [
        { candidateId: 'c1', key: 'socialLikes', value: 800 },
        { candidateId: 'c1', key: 'socialShares', value: 100 },
        { candidateId: 'c2', key: 'socialLikes', value: 80 },
        { candidateId: 'c2', key: 'socialShares', value: 20 },
      ],
    });

    const award = result.awards.find((a) => a.awardKey === 'best_tourism_video')!;
    // c1: .7*80 + .3*100    = 56 + 30    = 86
    // c2: .7*100 + .3*11.11 = 70 + 3.333 = 73.33
    expect(award.pending).toBe(false);
    expect(award.winners[0].candidateId).toBe('c1');
    expect(award.winners[0].score).toBeCloseTo(86, 2);
  });

  it('derives minor awards from their own segment standings', () => {
    const cands = candidates(3);
    const js = judges(3);
    const scores = prelimScores(cands, js, () => 50);
    // Boost c2 in swimsuit only.
    for (const j of js) {
      const row = scores.find(
        (r) => r.segmentKey === 'swimsuit' && r.judgeId === j.id && r.candidateId === 'c2'
      )!;
      row.value = 15;
    }

    const result = tabulate({ config: gandangNegOrense2026, candidates: cands, judges: js, scores });
    const best = result.awards.find((a) => a.awardKey === 'best_swimsuit')!;
    expect(best.winners.map((w) => w.candidateId)).toEqual(['c2']);
  });

  it('excludes withdrawn and disqualified candidates from every standing', () => {
    const cands = candidates(3);
    cands[1].status = 'DISQUALIFIED';
    const js = judges(1);
    const result = tabulate({
      config: gandangNegOrense2026,
      candidates: cands,
      judges: js,
      scores: prelimScores(cands, js, () => 90),
    });
    const prelim = result.phaseStandings.find((p) => p.phaseKey === 'PRELIM')!;
    expect(prelim.rows.map((r) => r.candidateId)).toEqual(['c1', 'c3']);
  });

  it('warns when a segment is only partially scored', () => {
    const cands = candidates(3);
    const js = judges(3);
    const scores = prelimScores(cands, js, () => 70).filter(
      (r) => !(r.segmentKey === 'gown' && r.judgeId === 'j3')
    );
    const result = tabulate({ config: gandangNegOrense2026, candidates: cands, judges: js, scores });
    expect(result.warnings.some((w) => w.includes('gown'))).toBe(true);
  });
});
