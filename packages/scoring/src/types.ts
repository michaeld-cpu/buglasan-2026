/**
 * Pageant Tabulator, core types.
 *
 * Framework-agnostic. No React, no DB, no I/O. Everything here is plain data so
 * the scoring math can be unit-tested exhaustively.
 */

export type ScoringMode = 'POINTS' | 'RANKING';

/** How a judge enters a score for a segment. */
export type InputMode =
  /** One score per sub-criterion; segment score = weighted mean of criteria. */
  | 'CRITERIA_MEAN'
  /** One score per sub-criterion; segment score = sum of criteria points. */
  | 'CRITERIA_SUM'
  /** A single score for the whole segment; criteria are on-screen guidance only. */
  | 'SEGMENT_SINGLE';

export interface Criterion {
  key: string;
  name: string;
  /** Maximum awardable score for this criterion. */
  maxScore: number;
  /** Relative weight within the segment. Defaults to 1. */
  weight?: number;
}

export interface Segment {
  key: string;
  name: string;
  /** Phase this segment belongs to; drives carryover and cuts. */
  phaseKey: string;
  order: number;
  inputMode: InputMode;
  criteria: Criterion[];
  /**
   * Max total for the segment. For CRITERIA_SUM this should equal the sum of
   * criterion maxScores. For SEGMENT_SINGLE / CRITERIA_MEAN it is the scale top
   * (e.g. 10 for Hara).
   */
  maxTotal: number;
  /** Relative weight of this segment when aggregating a phase. Defaults to 1. */
  weight?: number;
  /** If true, this segment feeds only its own award, never a phase total. */
  awardOnly?: boolean;
  /** Restrict scoring to candidates who advanced to this cut (e.g. 'TOP_10'). */
  requiresCut?: string;
}

export interface PhaseDef {
  key: string;
  name: string;
  order: number;
  /** Segment keys aggregated into this phase's score. */
  segmentKeys: string[];
}

/**
 * A cut (Top 10 / Top 8 / Top 5) and how the score entering it is composed.
 *
 * carry: { fromPhase, pct } blends a previous phase's score with this phase's own.
 * A cut with `reset: true` ignores all history, Hara's Top 5 works this way.
 */
export interface CutDef {
  key: string;
  name: string;
  size: number;
  order: number;
  /** Phases whose scores compose the standing used for THIS cut's selection. */
  sourcePhaseKeys: string[];
  /** Blend weights, e.g. [{ phaseKey: 'PRELIM', pct: 40 }, { phaseKey: 'TOP8_INT', pct: 60 }]. */
  blend?: Array<{ phaseKey: string; pct: number }>;
  /** Ignore all prior scores; this cut is decided by its own phases alone. */
  reset?: boolean;
  /**
   * Slots filled by non-score means (e.g. People's Choice auto-inclusion).
   * These consume slots from `size`.
   */
  autoSlots?: Array<{ reason: string; metricKey: string }>;
}

export type AwardSource = 'DERIVED' | 'PANEL' | 'EXTERNAL' | 'COMPOSITE';

export interface AwardDef {
  key: string;
  name: string;
  source: AwardSource;
  /** For DERIVED: the segment whose standing decides the award. */
  fromSegmentKey?: string;
  /**
   * For COMPOSITE (e.g. tourism video 70% judges + 30% social):
   * parts must sum to 100.
   */
  composite?: Array<
    | { kind: 'segment'; segmentKey: string; pct: number }
    | { kind: 'metric'; metricKeys: string[]; pct: number }
  >;
  prize?: number;
}

export interface PageantConfig {
  slug: string;
  name: string;
  edition?: string;
  scoringMode: ScoringMode;
  segments: Segment[];
  phases: PhaseDef[];
  cuts: CutDef[];
  awards: AwardDef[];
  /** Tie-break ladder, applied in order. */
  tieBreakers?: TieBreaker[];
  /** Automatic, rule-derived penalties. */
  autoPenalties?: AutoPenaltyRule[];
}

export type TieBreaker =
  | 'CHAIRMAN_SCORE'
  | 'HIGHEST_RAW_TOTAL'
  | 'PRIOR_PHASE_STANDING'
  | 'CHAIRMAN_DECLARATION';

/**
 * A rule that generates penalties from candidate attributes rather than admin
 * entry. Hara's sub-5'2" swimwear deduction is the motivating case.
 */
export interface AutoPenaltyRule {
  key: string;
  description: string;
  /** Attribute compared, e.g. 'heightCm'. */
  attribute: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  threshold: number;
  /** Points deducted (positive number = deduction). */
  points: number;
  /** Limit the deduction to one segment. */
  scopeSegmentKey?: string;
  /** Limit the deduction to the chairman's sheet only. */
  chairmanOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Runtime data
// ---------------------------------------------------------------------------

export type CandidateStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED';

export interface Candidate {
  id: string;
  number: number;
  name: string;
  lgu: string;
  heightCm?: number;
  status: CandidateStatus;
  /**
   * Portrait for the score sheet's avatar, as a public URL.
   *
   * Optional and currently unset for every seeded candidate, this repo ships
   * no contestant photography (`public/assets/` holds programme logos and the
   * skyline only). The avatar falls back to the entry number, which is what a
   * judge calls the candidate over the microphone anyway, so an absent photo
   * costs nothing. Populate this when real portraits are supplied.
   */
  photo?: string;
}

export interface Judge {
  id: string;
  displayName: string;
  isChairman: boolean;
  seatNo?: number;
  active: boolean;
}

export interface ScoreRow {
  segmentKey: string;
  /** Null for SEGMENT_SINGLE input. */
  criterionKey: string | null;
  judgeId: string;
  candidateId: string;
  value: number;
}

export interface PenaltyRow {
  candidateId: string;
  /** Positive number = points deducted. */
  points: number;
  reason: string;
  segmentKey?: string;
  judgeId?: string;
}

export interface MetricRow {
  candidateId: string;
  key: string;
  value: number;
}

export interface TabulationInput {
  config: PageantConfig;
  candidates: Candidate[];
  judges: Judge[];
  scores: ScoreRow[];
  penalties?: PenaltyRow[];
  metrics?: MetricRow[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface JudgeSegmentScore {
  judgeId: string;
  candidateId: string;
  segmentKey: string;
  /** Raw score after penalties, before any ranking. */
  raw: number;
  /** Raw normalized to 0-100 against segment maxTotal. */
  normalized: number;
  /** Rank within this judge's sheet for this segment (RANKING mode). */
  rank?: number;
  complete: boolean;
}

export interface SegmentStanding {
  segmentKey: string;
  rows: Array<{
    candidateId: string;
    /** POINTS: mean normalized score across judges. RANKING: total of ranks. */
    score: number;
    /** RANKING only: sum of judge ranks (lower is better). */
    rankTotal?: number;
    /** Mean raw score across judges, always populated (used for tie-breaks). */
    rawMean: number;
    place: number;
    judgeCount: number;
  }>;
  /** True when every active judge has a complete sheet for every candidate. */
  complete: boolean;
}

export interface PhaseStanding {
  phaseKey: string;
  rows: Array<{
    candidateId: string;
    score: number;
    place: number;
    /** Per-segment contributions, for the printable cut sheet. */
    breakdown: Record<string, number>;
  }>;
}

export interface CutResult {
  cutKey: string;
  name: string;
  size: number;
  advancing: Array<{
    candidateId: string;
    score: number;
    place: number;
    /** Set when the slot was granted by autoSlots rather than by score. */
    autoReason?: string;
    tieBreakApplied?: string;
  }>;
  eliminated: Array<{ candidateId: string; score: number; place: number }>;
}

export interface AwardResult {
  awardKey: string;
  name: string;
  source: AwardSource;
  winners: Array<{ candidateId: string; score: number }>;
  /** True when the award needs human input we don't have yet. */
  pending: boolean;
}

export interface TabulationResult {
  scoringMode: ScoringMode;
  judgeSegmentScores: JudgeSegmentScore[];
  segmentStandings: SegmentStanding[];
  phaseStandings: PhaseStanding[];
  cuts: CutResult[];
  awards: AwardResult[];
  finalPlacements: Array<{ candidateId: string; place: number; score: number }>;
  warnings: string[];
}
