/**
 * RANKING engine, Hara sa Negros Oriental 2026.
 *
 * The ranking system is the part organizers most often get wrong in a
 * spreadsheet: raw scores must be converted to ranks *per judge* before
 * anything is summed. These tests pin that behaviour down.
 */

import { describe, expect, it } from 'vitest';
import { haraNegrosOriental2026 } from '../src/presets/hara-negros-oriental-2026';
import { tabulate, computeJudgeSegmentScores, deriveAutoPenalties } from '../src/engine';
import { averageTieRanks } from '../src/util';
import { Candidate, Judge, ScoreRow } from '../src/types';

const SEMI = ['aquatic', 'production', 'swimwear', 'terno'];

function candidates(n: number, heightCm = 165): Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    number: i + 1,
    name: `Candidate ${i + 1}`,
    lgu: `LGU ${i + 1}`,
    heightCm,
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

function segScores(
  segmentKeys: string[],
  js: Judge[],
  valueFor: (candidateId: string, judgeId: string, segmentKey: string) => number,
  cands: Candidate[]
): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const segmentKey of segmentKeys) {
    for (const j of js) {
      for (const c of cands) {
        rows.push({
          segmentKey,
          criterionKey: null,
          judgeId: j.id,
          candidateId: c.id,
          value: valueFor(c.id, j.id, segmentKey),
        });
      }
    }
  }
  return rows;
}

describe('averageTieRanks', () => {
  it('ranks descending with 1 as best', () => {
    const items = [{ v: 7 }, { v: 10 }, { v: 8 }];
    const ranks = averageTieRanks(items, (i) => i.v);
    expect(ranks.get(items[1])).toBe(1); // 10
    expect(ranks.get(items[2])).toBe(2); // 8
    expect(ranks.get(items[0])).toBe(3); // 7
  });

  it('averages tied ranks so every judge sheet sums identically', () => {
    const items = [{ v: 10 }, { v: 9 }, { v: 9 }, { v: 8 }];
    const ranks = averageTieRanks(items, (i) => i.v);
    expect(ranks.get(items[0])).toBe(1);
    expect(ranks.get(items[1])).toBe(2.5);
    expect(ranks.get(items[2])).toBe(2.5);
    expect(ranks.get(items[3])).toBe(4);

    // n(n+1)/2 = 10 regardless of ties. This is the fairness property: a judge
    // cannot gain influence over the aggregate by tying candidates.
    const total = [...ranks.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(10);
  });

  it('keeps the sheet total invariant even when everything is tied', () => {
    const items = [{ v: 5 }, { v: 5 }, { v: 5 }, { v: 5 }, { v: 5 }];
    const ranks = averageTieRanks(items, (i) => i.v);
    expect([...ranks.values()]).toEqual([3, 3, 3, 3, 3]);
    expect([...ranks.values()].reduce((a, b) => a + b, 0)).toBe(15);
  });
});

describe('RANKING engine, Hara sa Negros Oriental 2026', () => {
  it('converts raw scores to per-judge ranks and sums them, lowest wins', () => {
    const cands = candidates(3);
    const js = judges(3);

    // Deliberately give judge 3 an outlier sheet. Under a raw-average system
    // c3 would benefit hugely; under the ranking system it is worth one rank.
    const raw: Record<string, Record<string, number>> = {
      j1: { c1: 10, c2: 9, c3: 8 },
      j2: { c1: 9, c2: 10, c3: 8 },
      j3: { c1: 1, c2: 2, c3: 10 },
    };

    const result = tabulate({
      config: haraNegrosOriental2026,
      candidates: cands,
      judges: js,
      scores: segScores(['aquatic'], js, (cid, jid) => raw[jid][cid], cands),
    });

    const standing = result.segmentStandings.find((s) => s.segmentKey === 'aquatic')!;
    const byId = new Map(standing.rows.map((r) => [r.candidateId, r]));

    // Ranks: c1 -> 1,2,3 = 6   c2 -> 2,1,2 = 5   c3 -> 3,3,1 = 7
    expect(byId.get('c1')!.rankTotal).toBe(6);
    expect(byId.get('c2')!.rankTotal).toBe(5);
    expect(byId.get('c3')!.rankTotal).toBe(7);

    // Lowest total wins.
    expect(byId.get('c2')!.place).toBe(1);
    expect(byId.get('c1')!.place).toBe(2);
    expect(byId.get('c3')!.place).toBe(3);
  });

  it('resists a single judge tanking a front-runner', () => {
    const cands = candidates(4);
    const js = judges(5);
    // c1 is everyone's favourite except j5, who gives c1 a 1.
    const result = tabulate({
      config: haraNegrosOriental2026,
      candidates: cands,
      judges: js,
      scores: segScores(
        ['aquatic'],
        js,
        (cid, jid) => {
          if (jid === 'j5') return cid === 'c1' ? 1 : 9;
          return cid === 'c1' ? 10 : 6;
        },
        cands
      ),
    });
    const standing = result.segmentStandings.find((s) => s.segmentKey === 'aquatic')!;
    const c1 = standing.rows.find((r) => r.candidateId === 'c1')!;
    // c1: ranks 1,1,1,1,4 = 8. Others: 3,3,3,3,2 = 14 each. c1 still wins.
    expect(c1.rankTotal).toBe(8);
    expect(c1.place).toBe(1);
  });

  it('aggregates the four semi-final segments equally into the Top 10 cut', () => {
    const cands = candidates(15);
    const js = judges(5);
    // Candidate number drives quality: c1 best, c15 worst, consistently.
    const result = tabulate({
      config: haraNegrosOriental2026,
      candidates: cands,
      judges: js,
      scores: segScores(SEMI, js, (cid) => 10 - (Number(cid.slice(1)) - 1) * 0.5, cands),
    });

    const top10 = result.cuts.find((c) => c.cutKey === 'TOP_10')!;
    expect(top10.advancing).toHaveLength(10);
    expect(top10.advancing.map((a) => a.candidateId)).toEqual([
      'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10',
    ]);
    expect(top10.eliminated.map((e) => e.candidateId)).toEqual(['c11', 'c12', 'c13', 'c14', 'c15']);

    // Each of 4 segments, 5 judges, rank 1 -> 4 * 5 * 1 = 20 for c1.
    expect(top10.advancing[0].score).toBe(20);
  });

  it('never lets an unscored candidate top a ranking standing', () => {
    // The trap: a rank total of 0 is numerically "best" when lower wins.
    const cands = candidates(4);
    const js = judges(2);
    // c4 is not scored at all.
    const scores = segScores(['aquatic'], js, (cid) => (cid === 'c1' ? 10 : 7), cands).filter(
      (r) => r.candidateId !== 'c4'
    );

    const result = tabulate({ config: haraNegrosOriental2026, candidates: cands, judges: js, scores });
    const standing = result.segmentStandings.find((s) => s.segmentKey === 'aquatic')!;
    const c4 = standing.rows.find((r) => r.candidateId === 'c4')!;
    const c1 = standing.rows.find((r) => r.candidateId === 'c1')!;

    expect(c4.judgeCount).toBe(0);
    expect(c4.place).toBe(0); // 0 means "unscored", not "first"
    expect(c1.place).toBe(1);
  });

  it('selects the Top 5 from the interview alone, then resets scoring to zero for the final', () => {
    const cands = candidates(10);
    const js = judges(3);

    // Semi-final: c1 best .. c10 worst -> all 10 advance (cut size is 10).
    const scores = segScores(SEMI, js, (cid) => 10 - (Number(cid.slice(1)) - 1) * 0.5, cands);

    // Interview REVERSES the order: c10 best, c1 worst.
    scores.push(
      ...segScores(['interview'], js, (cid) => Number(cid.slice(1)) * 0.9, cands)
    );

    // Final Q&A reverses again: c6 best of the five finalists.
    scores.push(
      ...segScores(
        ['final_qa'],
        js,
        (cid) => ({ c10: 6, c9: 7, c8: 8, c7: 9, c6: 10 } as Record<string, number>)[cid] ?? 1,
        cands
      )
    );

    const result = tabulate({ config: haraNegrosOriental2026, candidates: cands, judges: js, scores });

    const top5 = result.cuts.find((c) => c.cutKey === 'TOP_5')!;
    // Interview alone decides: c10, c9, c8, c7, c6.
    expect(top5.advancing.map((a) => a.candidateId)).toEqual(['c10', 'c9', 'c8', 'c7', 'c6']);

    const final = result.cuts.find((c) => c.cutKey === 'FINAL')!;
    // Scoring resets: the final Q&A alone decides, so c6 takes the crown
    // despite being 5th into the round.
    expect(final.advancing[0].candidateId).toBe('c6');
    expect(result.finalPlacements[0].candidateId).toBe('c6');
    expect(result.finalPlacements.map((p) => p.candidateId)).toEqual([
      'c6', 'c7', 'c8', 'c9', 'c10',
    ]);
  });

  it('derives Best Speaker from the Top 10 interview segment', () => {
    const cands = candidates(10);
    const js = judges(3);
    const scores = segScores(SEMI, js, () => 8, cands);
    scores.push(...segScores(['interview'], js, (cid) => (cid === 'c7' ? 10 : 6), cands));

    const result = tabulate({ config: haraNegrosOriental2026, candidates: cands, judges: js, scores });
    const speaker = result.awards.find((a) => a.awardKey === 'best_speaker')!;
    expect(speaker.winners.map((w) => w.candidateId)).toEqual(['c7']);
  });

  it("deducts 1 point from the Chairman's Swimwear score for a candidate under 5'2\"", () => {
    // 5'2" = 157.48 cm. c2 is 155 cm (about 5'1").
    const cands = candidates(3);
    cands[1].heightCm = 155;
    const js = judges(3);

    const derived = deriveAutoPenalties({ config: haraNegrosOriental2026, candidates: cands, judges: js });
    expect(derived).toHaveLength(1);
    expect(derived[0]).toMatchObject({
      candidateId: 'c2',
      points: 1,
      segmentKey: 'swimwear',
      judgeId: 'j1', // the chairman
    });

    const scores = segScores(SEMI, js, () => 8, cands);
    const judgeScores = computeJudgeSegmentScores({
      config: haraNegrosOriental2026,
      candidates: cands,
      judges: js,
      scores,
    });

    const chairmanSwimwear = judgeScores.filter(
      (s) => s.segmentKey === 'swimwear' && s.judgeId === 'j1'
    );
    expect(chairmanSwimwear.find((s) => s.candidateId === 'c2')!.raw).toBe(7);
    expect(chairmanSwimwear.find((s) => s.candidateId === 'c1')!.raw).toBe(8);

    // Scoped correctly: no other judge and no other segment is touched.
    const otherJudge = judgeScores.find(
      (s) => s.segmentKey === 'swimwear' && s.judgeId === 'j2' && s.candidateId === 'c2'
    )!;
    expect(otherJudge.raw).toBe(8);
    const otherSegment = judgeScores.find(
      (s) => s.segmentKey === 'terno' && s.judgeId === 'j1' && s.candidateId === 'c2'
    )!;
    expect(otherSegment.raw).toBe(8);

    // And because the deduction lands before ranking, it must move the rank.
    expect(chairmanSwimwear.find((s) => s.candidateId === 'c2')!.rank).toBe(3);
  });

  it('applies no height deduction at exactly 5\'2"', () => {
    const cands = candidates(2, 157.48);
    const js = judges(2);
    const derived = deriveAutoPenalties({ config: haraNegrosOriental2026, candidates: cands, judges: js });
    expect(derived).toHaveLength(0);
  });

  it('flags a tie at the cut line for the chairman instead of resolving it silently', () => {
    const cands = candidates(6);
    const js = judges(3);
    // Two candidates land on identical rank totals right at a 5-way boundary.
    const cfg = {
      ...haraNegrosOriental2026,
      cuts: haraNegrosOriental2026.cuts.map((c) =>
        c.key === 'TOP_10' ? { ...c, size: 5, name: 'Top 5 Semi-finalists' } : c
      ),
    };
    const result = tabulate({
      config: cfg,
      candidates: cands,
      judges: js,
      // c5 and c6 identical; everyone else distinct and better.
      scores: segScores(
        SEMI,
        js,
        (cid) => ({ c1: 10, c2: 9, c3: 8, c4: 7, c5: 6, c6: 6 } as Record<string, number>)[cid],
        cands
      ),
    });

    expect(result.warnings.some((w) => w.includes('tie at the cut line'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Chairman must confirm'))).toBe(true);
  });

  it('warns when no chairman is designated', () => {
    const cands = candidates(3);
    const js = judges(2).map((j) => ({ ...j, isChairman: false }));
    const result = tabulate({
      config: haraNegrosOriental2026,
      candidates: cands,
      judges: js,
      scores: segScores(['aquatic'], js, () => 8, cands),
    });
    expect(result.warnings.some((w) => w.includes('No chairman'))).toBe(true);
  });

  it('keeps the Tourism Reel out of the Top 10 cut by default', () => {
    const reel = haraNegrosOriental2026.segments.find((s) => s.key === 'tourism_reel')!;
    expect(reel.awardOnly).toBe(true);
    const semi = haraNegrosOriental2026.phases.find((p) => p.key === 'SEMI')!;
    expect(semi.segmentKeys).not.toContain('tourism_reel');
  });

  it('supports CRITERIA_MEAN so a segment can be scored per sub-criterion', () => {
    const cands = candidates(2);
    const js = judges(1);
    const cfg = {
      ...haraNegrosOriental2026,
      segments: haraNegrosOriental2026.segments.map((s) =>
        s.key === 'terno' ? { ...s, inputMode: 'CRITERIA_MEAN' as const } : s
      ),
    };
    // Terno has 4 sub-criteria: 10, 8, 9, 9 -> mean 9.
    const scores: ScoreRow[] = [
      { segmentKey: 'terno', criterionKey: 'elegance', judgeId: 'j1', candidateId: 'c1', value: 10 },
      { segmentKey: 'terno', criterionKey: 'design', judgeId: 'j1', candidateId: 'c1', value: 8 },
      { segmentKey: 'terno', criterionKey: 'beauty', judgeId: 'j1', candidateId: 'c1', value: 9 },
      { segmentKey: 'terno', criterionKey: 'impact', judgeId: 'j1', candidateId: 'c1', value: 9 },
    ];
    const judgeScores = computeJudgeSegmentScores({
      config: cfg,
      candidates: cands,
      judges: js,
      scores,
    });
    const c1 = judgeScores.find((s) => s.segmentKey === 'terno' && s.candidateId === 'c1')!;
    expect(c1.raw).toBe(9);
    expect(c1.complete).toBe(true);

    const c2 = judgeScores.find((s) => s.segmentKey === 'terno' && s.candidateId === 'c2')!;
    expect(c2.complete).toBe(false);
  });
});
