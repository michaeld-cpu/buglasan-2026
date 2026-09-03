/**
 * Pageant Tabulator, scoring engine.
 *
 * One entry point, `tabulate()`, handles both scoring modes:
 *   POINTS, absolute points, mean across judges  (Gandang NegOrense 2026)
 *   RANKING, 1-10 raw, converted to per-judge ranks, summed (Hara sa NegOr 2026)
 *
 * Everything is derived from raw score rows on every call. Nothing is cached and
 * no computed total is ever treated as a source of truth, so correcting one
 * judge's entry reflows every downstream phase correctly.
 */

import {
  AwardResult,
  CutDef,
  CutResult,
  JudgeSegmentScore,
  PenaltyRow,
  PhaseStanding,
  ScoreRow,
  Segment,
  SegmentStanding,
  TabulationInput,
  TabulationResult,
} from './types';
import {
  assignPlaces,
  averageTieRanks,
  mean,
  normalize,
  normalizeToLeader,
  round,
  sum,
} from './util';

// ---------------------------------------------------------------------------
// Penalties
// ---------------------------------------------------------------------------

/**
 * Expand config-declared automatic penalties into concrete penalty rows.
 *
 * Hara §A.4: a candidate under 5'2" barefoot loses 1 point from the Chairman's
 * score in the Swimwear competition. Deriving this from `heightCm` rather than
 * relying on someone to remember it at 11 PM is the whole point.
 */
export function deriveAutoPenalties(
  input: Pick<TabulationInput, 'config' | 'candidates' | 'judges'>
): PenaltyRow[] {
  const rules = input.config.autoPenalties ?? [];
  if (rules.length === 0) return [];

  const chairman = input.judges.find((j) => j.isChairman && j.active);
  const out: PenaltyRow[] = [];

  for (const rule of rules) {
    for (const c of input.candidates) {
      const attr = (c as unknown as Record<string, number | undefined>)[rule.attribute];
      if (typeof attr !== 'number') continue;

      const hit =
        (rule.operator === 'lt' && attr < rule.threshold) ||
        (rule.operator === 'lte' && attr <= rule.threshold) ||
        (rule.operator === 'gt' && attr > rule.threshold) ||
        (rule.operator === 'gte' && attr >= rule.threshold);
      if (!hit) continue;

      if (rule.chairmanOnly && !chairman) continue;

      out.push({
        candidateId: c.id,
        points: rule.points,
        reason: rule.description,
        segmentKey: rule.scopeSegmentKey,
        judgeId: rule.chairmanOnly ? chairman!.id : undefined,
      });
    }
  }
  return out;
}

function penaltyFor(
  penalties: PenaltyRow[],
  candidateId: string,
  segmentKey: string,
  judgeId: string
): number {
  return sum(
    penalties
      .filter(
        (p) =>
          p.candidateId === candidateId &&
          (p.segmentKey === undefined || p.segmentKey === segmentKey) &&
          (p.judgeId === undefined || p.judgeId === judgeId)
      )
      .map((p) => p.points)
  );
}

// ---------------------------------------------------------------------------
// Step 1, per judge, per candidate, per segment raw score
// ---------------------------------------------------------------------------

function segmentRawForJudge(
  segment: Segment,
  rows: ScoreRow[]
): { raw: number; complete: boolean } {
  if (segment.inputMode === 'SEGMENT_SINGLE') {
    const row = rows.find((r) => r.criterionKey === null);
    return { raw: row?.value ?? 0, complete: row !== undefined };
  }

  const byKey = new Map(rows.filter((r) => r.criterionKey).map((r) => [r.criterionKey!, r.value]));
  const complete = segment.criteria.every((c) => byKey.has(c.key));

  if (segment.inputMode === 'CRITERIA_SUM') {
    return { raw: round(sum(segment.criteria.map((c) => byKey.get(c.key) ?? 0))), complete };
  }

  // CRITERIA_MEAN, weighted mean, so a segment stays on the 1-10 scale even
  // though it is judged on three or four named aspects.
  const totalWeight = sum(segment.criteria.map((c) => c.weight ?? 1));
  const weighted = sum(segment.criteria.map((c) => (byKey.get(c.key) ?? 0) * (c.weight ?? 1)));
  return { raw: totalWeight > 0 ? round(weighted / totalWeight) : 0, complete };
}

export function computeJudgeSegmentScores(input: TabulationInput): JudgeSegmentScore[] {
  const { config, candidates, judges } = input;
  const penalties = [...(input.penalties ?? []), ...deriveAutoPenalties(input)];
  const activeJudges = judges.filter((j) => j.active);
  const scorable = candidates.filter((c) => c.status === 'ACTIVE');
  const out: JudgeSegmentScore[] = [];

  for (const segment of config.segments) {
    for (const judge of activeJudges) {
      // Ranks are computed per judge per segment, so gather the whole sheet first.
      const sheet: JudgeSegmentScore[] = [];

      for (const cand of scorable) {
        const rows = input.scores.filter(
          (r) =>
            r.segmentKey === segment.key &&
            r.judgeId === judge.id &&
            r.candidateId === cand.id
        );
        const { raw, complete } = segmentRawForJudge(segment, rows);
        const deduction = penaltyFor(penalties, cand.id, segment.key, judge.id);
        // Penalties apply to the raw score BEFORE ranking, the order the
        // Hara rule implies ("deducted from the over-all score ... from the
        // Swimwear Competition").
        const adjusted = Math.max(0, round(raw - deduction));

        sheet.push({
          judgeId: judge.id,
          candidateId: cand.id,
          segmentKey: segment.key,
          raw: adjusted,
          normalized: normalize(adjusted, segment.maxTotal),
          complete,
        });
      }

      if (config.scoringMode === 'RANKING') {
        // Only rank candidates this judge actually scored; an incomplete sheet
        // must not silently push unscored candidates to the bottom.
        const scored = sheet.filter((s) => s.complete);
        const ranks = averageTieRanks(scored, (s) => s.raw);
        for (const s of scored) s.rank = ranks.get(s) ?? undefined;
      }

      out.push(...sheet);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2, segment standings across judges
// ---------------------------------------------------------------------------

export function computeSegmentStandings(
  input: TabulationInput,
  judgeScores: JudgeSegmentScore[]
): SegmentStanding[] {
  const { config, candidates, judges } = input;
  const activeJudges = judges.filter((j) => j.active);
  const scorable = candidates.filter((c) => c.status === 'ACTIVE');
  const ranking = config.scoringMode === 'RANKING';

  return config.segments.map((segment) => {
    const rows = scorable.map((cand) => {
      const cells = judgeScores.filter(
        (s) => s.segmentKey === segment.key && s.candidateId === cand.id && s.complete
      );
      const rawMean = round(mean(cells.map((c) => c.raw)));

      if (ranking) {
        const rankTotal = round(sum(cells.map((c) => c.rank ?? 0)));
        return {
          candidateId: cand.id,
          score: rankTotal, // lower is better
          rankTotal,
          rawMean,
          judgeCount: cells.length,
          place: 0,
        };
      }
      // POINTS: mean of normalized scores. Mean rather than sum so a judge
      // no-showing does not deflate the whole field.
      return {
        candidateId: cand.id,
        score: round(mean(cells.map((c) => c.normalized))),
        rawMean,
        judgeCount: cells.length,
        place: 0,
      };
    });

    // Only candidates with at least one complete judge sheet are placed. In
    // RANKING mode an unscored candidate has a rank total of 0, which would
    // otherwise sort them into FIRST place (lower wins), a candidate who was
    // never judged must never top a standing. Unscored rows get place 0.
    const scoredRows = rows.filter((r) => r.judgeCount > 0);
    const unscoredRows = rows.filter((r) => r.judgeCount === 0).map((r) => ({ ...r, place: 0 }));
    const placed = [...assignPlaces(scoredRows, ranking), ...unscoredRows];

    const complete = scorable.every((c) =>
      activeJudges.every((j) =>
        judgeScores.some(
          (s) =>
            s.segmentKey === segment.key &&
            s.candidateId === c.id &&
            s.judgeId === j.id &&
            s.complete
        )
      )
    );

    return { segmentKey: segment.key, rows: placed, complete };
  });
}

// ---------------------------------------------------------------------------
// Step 3, phase standings
// ---------------------------------------------------------------------------

export function computePhaseStandings(
  input: TabulationInput,
  segmentStandings: SegmentStanding[]
): PhaseStanding[] {
  const { config, candidates } = input;
  const scorable = candidates.filter((c) => c.status === 'ACTIVE');
  const ranking = config.scoringMode === 'RANKING';
  const segByKey = new Map(config.segments.map((s) => [s.key, s]));

  return config.phases.map((phase) => {
    const keys = phase.segmentKeys.filter((k) => {
      const s = segByKey.get(k);
      return s && !s.awardOnly;
    });

    const rows = scorable.map((cand) => {
      const breakdown: Record<string, number> = {};
      let total = 0;
      let totalWeight = 0;
      let scoredSegments = 0;

      for (const key of keys) {
        const standing = segmentStandings.find((s) => s.segmentKey === key);
        const row = standing?.rows.find((r) => r.candidateId === cand.id);
        // judgeCount === 0 means nobody has scored this candidate in this
        // segment yet; contributing it would inject a phantom 0.
        if (!row || row.judgeCount === 0) continue;
        const weight = segByKey.get(key)?.weight ?? 1;
        breakdown[key] = row.score;
        total += row.score * weight;
        totalWeight += weight;
        scoredSegments++;
      }

      // POINTS phases take a weighted mean of normalized segment scores, so a
      // phase is always on a 0-100 scale and can be blended by percentage.
      // RANKING phases sum weighted rank totals (lower is better) as-is.
      const score = ranking
        ? round(total)
        : totalWeight > 0
          ? round(total / totalWeight)
          : 0;

      return { candidateId: cand.id, score, breakdown, scoredSegments, place: 0 };
    });

    const scored = rows.filter((r) => r.scoredSegments > 0).map(({ scoredSegments, ...r }) => r);
    const unscored = rows
      .filter((r) => r.scoredSegments === 0)
      .map(({ scoredSegments, ...r }) => ({ ...r, place: 0 }));

    return { phaseKey: phase.key, rows: [...assignPlaces(scored, ranking), ...unscored] };
  });
}

// ---------------------------------------------------------------------------
// Step 4, cuts, blending and tie-breaks
// ---------------------------------------------------------------------------

function standingForCut(
  cut: CutDef,
  phaseStandings: PhaseStanding[],
  priorCutScores: Map<string, number> | null,
  candidateIds: string[],
  ranking: boolean
): Map<string, number> {
  const out = new Map<string, number>();

  // A blend is the rulebook's "40% carried over + 60% from this phase" form.
  if (cut.blend && cut.blend.length > 0 && !cut.reset) {
    for (const id of candidateIds) {
      let acc = 0;
      for (const part of cut.blend) {
        const fromPrior = part.phaseKey === '__PRIOR_CUT__';
        const value = fromPrior
          ? (priorCutScores?.get(id) ?? 0)
          : (phaseStandings
              .find((p) => p.phaseKey === part.phaseKey)
              ?.rows.find((r) => r.candidateId === id)?.score ?? 0);
        acc += value * (part.pct / 100);
      }
      out.set(id, round(acc));
    }
    return out;
  }

  // Otherwise: straight aggregate of this cut's source phases. `reset: true`
  // lands here by design, Hara's Top 5 "scoring goes back to zero".
  for (const id of candidateIds) {
    const rows = cut.sourcePhaseKeys.map((pk) =>
      phaseStandings.find((p) => p.phaseKey === pk)?.rows.find((r) => r.candidateId === id)
    );
    // place === 0 marks "not scored in this phase yet". In RANKING mode that
    // must sort LAST, not first, so send it to +Infinity rather than 0.
    const anyScored = rows.some((r) => r && r.place > 0);
    if (!anyScored) {
      out.set(id, ranking ? Number.POSITIVE_INFINITY : 0);
      continue;
    }
    const parts = rows.map((r) => r?.score ?? 0);
    out.set(id, round(ranking ? sum(parts) : mean(parts)));
  }
  return out;
}

export function computeCuts(
  input: TabulationInput,
  phaseStandings: PhaseStanding[],
  segmentStandings: SegmentStanding[],
  judgeScores: JudgeSegmentScore[]
): { cuts: CutResult[]; warnings: string[] } {
  const { config, candidates, judges } = input;
  const ranking = config.scoringMode === 'RANKING';
  const warnings: string[] = [];
  const chairman = judges.find((j) => j.isChairman && j.active);

  const ordered = [...config.cuts].sort((a, b) => a.order - b.order);
  const cuts: CutResult[] = [];

  let pool = candidates.filter((c) => c.status === 'ACTIVE').map((c) => c.id);
  let priorCutScores: Map<string, number> | null = null;

  for (const cut of ordered) {
    const scores = standingForCut(cut, phaseStandings, priorCutScores, pool, ranking);

    const rows = pool.map((id) => ({ candidateId: id, score: scores.get(id) ?? 0 }));
    const placed = assignPlaces(rows, ranking);

    // Auto slots (People's Choice) consume slots before score-based selection.
    const autoIds: Array<{ candidateId: string; reason: string }> = [];
    for (const slot of cut.autoSlots ?? []) {
      const metrics = input.metrics ?? [];
      const relevant = metrics.filter((m) => m.key === slot.metricKey && pool.includes(m.candidateId));
      if (relevant.length === 0) {
        warnings.push(
          `Cut "${cut.name}": auto slot "${slot.reason}" has no "${slot.metricKey}" data yet.`
        );
        continue;
      }
      const winner = relevant.reduce((a, b) => (b.value > a.value ? b : a));
      autoIds.push({ candidateId: winner.candidateId, reason: slot.reason });
    }

    const advancing: CutResult['advancing'] = [];
    const taken = new Set<string>();

    for (const auto of autoIds) {
      const row = placed.find((r) => r.candidateId === auto.candidateId);
      if (!row || taken.has(auto.candidateId)) continue;
      advancing.push({ ...row, autoReason: auto.reason });
      taken.add(auto.candidateId);
    }

    for (const row of placed) {
      if (advancing.length >= cut.size) break;
      if (taken.has(row.candidateId)) continue;
      advancing.push(row);
      taken.add(row.candidateId);
    }

    // A tie straddling the cut line needs the tie-break ladder, and needs to be
    // flagged loudly, this is exactly the moment a chairman gets called over.
    const boundary = placed[cut.size - 1];
    const nextOut = placed[cut.size];
    if (boundary && nextOut && boundary.score === nextOut.score) {
      const resolved = applyTieBreak(
        [boundary.candidateId, nextOut.candidateId],
        cut,
        segmentStandings,
        judgeScores,
        chairman?.id,
        config.tieBreakers ?? ['CHAIRMAN_SCORE', 'HIGHEST_RAW_TOTAL'],
        ranking
      );
      warnings.push(
        `Cut "${cut.name}": tie at the cut line (score ${boundary.score}). ` +
          `Tie-break "${resolved.method}" favours candidate ${resolved.winnerId}. Chairman must confirm.`
      );
      const entry = advancing.find((a) => a.candidateId === resolved.winnerId);
      if (entry) entry.tieBreakApplied = resolved.method;
    }

    const eliminated = placed.filter((r) => !taken.has(r.candidateId));
    cuts.push({ cutKey: cut.key, name: cut.name, size: cut.size, advancing, eliminated });

    pool = advancing.map((a) => a.candidateId);
    priorCutScores = new Map(advancing.map((a) => [a.candidateId, a.score]));
  }

  return { cuts, warnings };
}

function applyTieBreak(
  ids: string[],
  _cut: CutDef,
  segmentStandings: SegmentStanding[],
  judgeScores: JudgeSegmentScore[],
  chairmanId: string | undefined,
  ladder: string[],
  ranking: boolean
): { winnerId: string; method: string } {
  for (const method of ladder) {
    if (method === 'CHAIRMAN_SCORE' && chairmanId) {
      const totals = ids.map((id) => ({
        id,
        v: sum(
          judgeScores
            .filter((s) => s.judgeId === chairmanId && s.candidateId === id && s.complete)
            .map((s) => (ranking ? (s.rank ?? 0) : s.normalized))
        ),
      }));
      const best = ranking
        ? totals.reduce((a, b) => (b.v < a.v ? b : a))
        : totals.reduce((a, b) => (b.v > a.v ? b : a));
      const distinct = new Set(totals.map((t) => t.v)).size > 1;
      if (distinct) return { winnerId: best.id, method };
    }

    if (method === 'HIGHEST_RAW_TOTAL') {
      const totals = ids.map((id) => ({
        id,
        v: sum(
          segmentStandings.flatMap((st) =>
            st.rows.filter((r) => r.candidateId === id).map((r) => r.rawMean)
          )
        ),
      }));
      const best = totals.reduce((a, b) => (b.v > a.v ? b : a));
      if (new Set(totals.map((t) => t.v)).size > 1) return { winnerId: best.id, method };
    }
  }
  return { winnerId: ids[0], method: 'CHAIRMAN_DECLARATION' };
}

// ---------------------------------------------------------------------------
// Step 5, awards
// ---------------------------------------------------------------------------

export function computeAwards(
  input: TabulationInput,
  segmentStandings: SegmentStanding[]
): AwardResult[] {
  const { config } = input;
  const ranking = config.scoringMode === 'RANKING';
  const metrics = input.metrics ?? [];

  return config.awards.map((award) => {
    if (award.source === 'DERIVED' && award.fromSegmentKey) {
      const standing = segmentStandings.find((s) => s.segmentKey === award.fromSegmentKey);
      const winners = (standing?.rows ?? []).filter((r) => r.place === 1 && r.judgeCount > 0);
      return {
        awardKey: award.key,
        name: award.name,
        source: award.source,
        winners: winners.map((w) => ({ candidateId: w.candidateId, score: w.score })),
        pending: winners.length === 0,
      };
    }

    if (award.source === 'COMPOSITE' && award.composite) {
      // Gandang's tourism video: 70% judges + 30% social engagement.
      const totals = new Map<string, number>();
      const candidateIds = input.candidates.filter((c) => c.status === 'ACTIVE').map((c) => c.id);

      for (const part of award.composite) {
        if (part.kind === 'segment') {
          const standing = segmentStandings.find((s) => s.segmentKey === part.segmentKey);
          for (const id of candidateIds) {
            const row = standing?.rows.find((r) => r.candidateId === id);
            // Ranking-mode segments are inverted so higher is always better here.
            const base = row
              ? ranking
                ? 100 - (row.score / Math.max(1, candidateIds.length * 10)) * 100
                : row.score
              : 0;
            totals.set(id, (totals.get(id) ?? 0) + base * (part.pct / 100));
          }
        } else {
          const raw = new Map<string, number>();
          for (const id of candidateIds) {
            raw.set(
              id,
              sum(
                metrics
                  .filter((m) => m.candidateId === id && part.metricKeys.includes(m.key))
                  .map((m) => m.value)
              )
            );
          }
          const norm = normalizeToLeader(raw);
          for (const id of candidateIds) {
            totals.set(id, (totals.get(id) ?? 0) + (norm.get(id) ?? 0) * (part.pct / 100));
          }
        }
      }

      const rows = candidateIds.map((id) => ({ candidateId: id, score: round(totals.get(id) ?? 0) }));
      const placed = assignPlaces(rows);
      const winners = placed.filter((r) => r.place === 1 && r.score > 0);
      return {
        awardKey: award.key,
        name: award.name,
        source: award.source,
        winners: winners.map((w) => ({ candidateId: w.candidateId, score: w.score })),
        pending: winners.length === 0,
      };
    }

    // PANEL / EXTERNAL awards need their own input screen.
    const entries = metrics.filter((m) => m.key === award.key);
    if (entries.length === 0) {
      return { awardKey: award.key, name: award.name, source: award.source, winners: [], pending: true };
    }
    const best = entries.reduce((a, b) => (b.value > a.value ? b : a));
    return {
      awardKey: award.key,
      name: award.name,
      source: award.source,
      winners: [{ candidateId: best.candidateId, score: best.value }],
      pending: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function tabulate(input: TabulationInput): TabulationResult {
  const warnings: string[] = [];

  const activeJudges = input.judges.filter((j) => j.active);
  if (activeJudges.length === 0) warnings.push('No active judges configured.');
  if (!activeJudges.some((j) => j.isChairman)) {
    warnings.push('No chairman designated, tie-breaks will fall through to declaration.');
  }

  const judgeSegmentScores = computeJudgeSegmentScores(input);
  const segmentStandings = computeSegmentStandings(input, judgeSegmentScores);
  const phaseStandings = computePhaseStandings(input, segmentStandings);
  const { cuts, warnings: cutWarnings } = computeCuts(
    input,
    phaseStandings,
    segmentStandings,
    judgeSegmentScores
  );
  const awards = computeAwards(input, segmentStandings);

  for (const s of segmentStandings) {
    if (!s.complete && s.rows.some((r) => r.judgeCount > 0)) {
      warnings.push(`Segment "${s.segmentKey}" is partially scored, standings are provisional.`);
    }
  }

  /**
   * Placements come from the last cut, the Top 5 on both pageants.
   *
   * A contest with NO cuts (the booth contest and Festival of Festivals: every
   * entry is judged once, nothing is eliminated) would otherwise finish with an
   * empty placement list, having computed a complete standing and thrown it
   * away. For those, the last phase's standing IS the result.
   */
  const last = cuts[cuts.length - 1];
  let finalPlacements: TabulationResult['finalPlacements'];

  if (last) {
    finalPlacements = last.advancing.map((a) => ({
      candidateId: a.candidateId,
      place: a.place,
      score: a.score,
    }));
  } else {
    const orderedPhases = [...input.config.phases].sort((a, b) => a.order - b.order);
    const finalPhase = orderedPhases[orderedPhases.length - 1];
    const standing = phaseStandings.find((p) => p.phaseKey === finalPhase?.key);
    finalPlacements = (standing?.rows ?? []).map((r) => ({
      candidateId: r.candidateId,
      place: r.place,
      score: r.score,
    }));
  }

  return {
    scoringMode: input.config.scoringMode,
    judgeSegmentScores,
    segmentStandings,
    phaseStandings,
    cuts,
    awards,
    finalPlacements,
    warnings: [...warnings, ...cutWarnings],
  };
}
