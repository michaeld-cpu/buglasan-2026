import type { Candidate, Judge, ScoreRow, PenaltyRow, MetricRow } from '@judges/scoring';

export type SegmentStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CERTIFIED';

/** Everything one pageant needs, as plain JSON. This is the whole "database". */
export interface PageantState {
  candidates: Candidate[];
  judges: Judge[];
  /** Keyed `${segmentKey}|${judgeId}|${candidateId}|${criterionKey ?? '_'}`. */
  scores: Record<string, number>;
  /** Keyed `${segmentKey}|${judgeId}` -> ISO timestamp of submission. */
  submissions: Record<string, string>;
  /**
   * Keyed `${segmentKey}|${judgeId}` -> ISO timestamp of the FIRST submission.
   *
   * Separate from `submissions` because that record is deleted by
   * `unsubmitSheet`, so it cannot answer "has this judge ever submitted this
   * sheet?" — only "is it submitted right now?". This one is never removed
   * once written, which is what lets the confirmation screen celebrate a first
   * submission and stay plain on a resubmission, including after a reload.
   *
   * Optional: state persisted before this field existed will not have it.
   */
  firstSubmissions?: Record<string, string>;
  segmentStatus: Record<string, SegmentStatus>;
  penalties: PenaltyRow[];
  metrics: MetricRow[];
}

export const scoreKey = (
  segmentKey: string,
  judgeId: string,
  candidateId: string,
  criterionKey: string | null,
): string => `${segmentKey}|${judgeId}|${candidateId}|${criterionKey ?? '_'}`;

export const submissionKey = (segmentKey: string, judgeId: string): string =>
  `${segmentKey}|${judgeId}`;

export type { Candidate, Judge, ScoreRow };
