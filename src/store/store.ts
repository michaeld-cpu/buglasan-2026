import { useCallback, useSyncExternalStore } from 'react';
import {
  festivalOfFestivals2026,
  gandangNegOrense2026,
  haraNegrosOriental2026,
  lguBoothContest2026,
  type PageantConfig,
  type ScoreRow,
  type TabulationInput,
} from '@judges/scoring';
import { seedFor } from './seed';
import { scoreKey, submissionKey, type PageantState, type SegmentStatus } from './types';

export const PAGEANTS: PageantConfig[] = [
  haraNegrosOriental2026,
  gandangNegOrense2026,
  lguBoothContest2026,
  festivalOfFestivals2026,
];

export const configFor = (slug: string): PageantConfig | undefined =>
  PAGEANTS.find((p) => p.slug === slug);

const KEY = (slug: string) => `judges:v1:${slug}`;

// ---------------------------------------------------------------------------
// Storage. Every read is defensive: a corrupt or unavailable localStorage must
// degrade to a working in-memory app, never a blank screen.
// ---------------------------------------------------------------------------

const memory = new Map<string, PageantState>();

function load(slug: string): PageantState {
  const cached = memory.get(slug);
  if (cached) return cached;

  const config = configFor(slug);
  const fresh = config ? seedFor(config) : emptyState();

  let state = fresh;
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PageantState>;
      // Merge over a fresh seed so a state saved by an older build still opens.
      state = { ...fresh, ...parsed, candidates: mergeCandidates(fresh, parsed) };
    }
  } catch {
    /* fall through to the seeded state */
  }

  memory.set(slug, state);
  return state;
}

/**
 * Re-apply the seed's PRESENTATION fields to a stored roster.
 *
 * The outer merge is shallow, so `...parsed` used to replace `candidates`
 * wholesale, and a roster saved by an earlier build keeps that build's shape
 * forever. Adding `photo` to the seed therefore changed nothing on any device
 * that had already opened the app: the portraits were in the fresh seed and
 * then thrown away. It presents as "I only see numbers still", with the seed
 * and the tests both correct, because a test environment has no localStorage
 * and always takes the fresh path.
 *
 * Identity and scoring data stay with the STORED row, an admin may have
 * renamed a candidate or marked one WITHDRAWN, and a refresh must not revert
 * that. Only fields that are presentation, and are owned by the seed rather
 * than editable in the app, are refreshed from it.
 *
 * Matched on `id`. A stored candidate with no matching seed row (added through
 * the admin screens) is kept exactly as saved.
 */
function mergeCandidates(
  fresh: PageantState,
  parsed: Partial<PageantState>): PageantState['candidates'] {
  const stored = parsed.candidates;
  if (!stored) return fresh.candidates;

  const seeded = new Map(fresh.candidates.map((c) => [c.id, c]));
  return stored.map((c) => {
    const seed = seeded.get(c.id);
    if (!seed) return c;
    // `photo` is seed-owned presentation; everything else stays as stored.
    return seed.photo === undefined ? c : { ...c, photo: seed.photo };
  });
}

function emptyState(): PageantState {
  return {
    candidates: [],
    judges: [],
    scores: {},
    submissions: {},
    segmentStatus: {},
    penalties: [],
    metrics: [],
  };
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Commit a new state for one pageant. Writes through to localStorage, then
 * notifies. A storage failure (quota, private mode) still updates the in-memory
 * copy so the night can continue.
 */
function commit(slug: string, next: PageantState) {
  memory.set(slug, next);
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(next));
  } catch {
    /* keep going on the in-memory copy */
  }
  emit();
}

/** Another tab changed the data, pick it up. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith('judges:v1:')) return;
    const slug = e.key.slice('judges:v1:'.length);
    memory.delete(slug);
    emit();
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getState(slug: string): PageantState {
  return load(slug);
}

/** Subscribe a component to one pageant's state. */
export function usePageantState(slug: string): PageantState {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => load(slug), [slug]));
}

/** The engine's input, assembled from stored state. */
export function toTabulationInput(slug: string): TabulationInput | null {
  const config = configFor(slug);
  if (!config) return null;
  const s = load(slug);

  const scores: ScoreRow[] = Object.entries(s.scores).map(([k, value]) => {
    const [segmentKey, judgeId, candidateId, criterionKey] = k.split('|');
    return {
      segmentKey,
      judgeId,
      candidateId,
      criterionKey: criterionKey === '_' ? null : criterionKey,
      value,
    };
  });

  return {
    config,
    candidates: s.candidates,
    judges: s.judges,
    scores,
    penalties: s.penalties,
    metrics: s.metrics,
  };
}

export function segmentStatusOf(slug: string, segmentKey: string): SegmentStatus {
  return load(slug).segmentStatus[segmentKey] ?? 'DRAFT';
}

export function hasSubmitted(slug: string, segmentKey: string, judgeId: string): boolean {
  return Boolean(load(slug).submissions[submissionKey(segmentKey, judgeId)]);
}

export function submittedCount(slug: string, segmentKey: string): number {
  const s = load(slug);
  return s.judges.filter((j) => j.active && s.submissions[submissionKey(segmentKey, j.id)]).length;
}

/** This judge's existing entries for a segment, in the sheet's shape. */
export function scoresFor(
  slug: string,
  segmentKey: string,
  judgeId: string): Array<{ candidateId: string; criterionKey: string | null; value: number }> {
  const s = load(slug);
  const prefix = `${segmentKey}|${judgeId}|`;
  return Object.entries(s.scores)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, value]) => {
      /* `scoreKey` is `segmentKey|judgeId|candidateId|criterionKey`, FOUR
         parts. Destructuring one hole (`[, candidateId, criterionKey]`) read
         index 1 and 2, which are judgeId and candidateId, so every row came
         back keyed by the judge: the review dialog looked candidates up by an
         id that was never in the map and reported a fully-scored sheet as
         "not saved" for every candidate. Two holes, matching the two leading
         segments that the `prefix` filter has already pinned. */
      const [, , candidateId, criterionKey] = k.split('|');
      return { candidateId, criterionKey: criterionKey === '_' ? null : criterionKey, value };
    });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function saveScores(
  slug: string,
  segmentKey: string,
  judgeId: string,
  entries: Array<{ candidateId: string; criterionKey: string | null; value: number }>): void {
  const s = load(slug);
  const scores = { ...s.scores };
  for (const e of entries) {
    scores[scoreKey(segmentKey, judgeId, e.candidateId, e.criterionKey)] = e.value;
  }
  commit(slug, { ...s, scores });
}

/**
 * Submit a sheet. Returns whether this was the judge's FIRST submission of it.
 *
 * The caller needs that answer to decide whether to celebrate: fireworks for
 * finishing a segment, nothing for correcting one. It is derived from
 * `firstSubmissions`, which — unlike `submissions` — is never deleted by
 * `unsubmitSheet`, so the answer survives reopen/edit/resubmit and a reload.
 */
export function submitSheet(slug: string, segmentKey: string, judgeId: string): boolean {
  const s = load(slug);
  const key = submissionKey(segmentKey, judgeId);
  const now = new Date().toISOString();
  const firstSubmissions = s.firstSubmissions ?? {};
  const isFirst = firstSubmissions[key] === undefined;

  commit(slug, {
    ...s,
    submissions: { ...s.submissions, [key]: now },
    firstSubmissions: isFirst ? { ...firstSubmissions, [key]: now } : firstSubmissions,
  });

  return isFirst;
}

/** Has this judge ever submitted this sheet, even if it is reopened now? */
export function hasEverSubmitted(slug: string, segmentKey: string, judgeId: string): boolean {
  return load(slug).firstSubmissions?.[submissionKey(segmentKey, judgeId)] !== undefined;
}

export function unsubmitSheet(slug: string, segmentKey: string, judgeId: string): void {
  const s = load(slug);
  const submissions = { ...s.submissions };
  delete submissions[submissionKey(segmentKey, judgeId)];
  commit(slug, { ...s, submissions });
}

export function setSegmentStatus(slug: string, segmentKey: string, status: SegmentStatus): void {
  const s = load(slug);
  commit(slug, { ...s, segmentStatus: { ...s.segmentStatus, [segmentKey]: status } });
}

export function setCandidates(slug: string, candidates: PageantState['candidates']): void {
  const s = load(slug);
  commit(slug, { ...s, candidates });
}

export function setMetric(slug: string, candidateId: string, key: string, value: number): void {
  const s = load(slug);
  const metrics = s.metrics.filter((m) => !(m.candidateId === candidateId && m.key === key));
  metrics.push({ candidateId, key, value });
  commit(slug, { ...s, metrics });
}

export function addPenalty(slug: string, penalty: PageantState['penalties'][number]): void {
  const s = load(slug);
  commit(slug, { ...s, penalties: [...s.penalties, penalty] });
}

export function removePenalty(slug: string, index: number): void {
  const s = load(slug);
  commit(slug, { ...s, penalties: s.penalties.filter((_, i) => i !== index) });
}

/** Wipe a pageant back to its seeded roster. */
export function resetPageant(slug: string): void {
  const config = configFor(slug);
  commit(slug, config ? seedFor(config) : emptyState());
}

/**
 * Set every scorable segment of one program to a status, in a single commit.
 *
 * One commit rather than a loop of `setSegmentStatus` calls: each of those
 * writes to localStorage and notifies every subscriber, so opening 26 segments
 * one at a time means 26 serialisations and 26 re-renders. It also means a
 * failure halfway leaves the program half-open.
 *
 * `awardOnly` segments are skipped. They are fed by the tabulation head from
 * outside the panel (the online vote tally, the tourism reel), so opening one
 * would put a sheet on a judge's screen that they are not meant to score.
 */
export function setAllSegmentStatus(slug: string, status: SegmentStatus): void {
  const config = configFor(slug);
  if (!config) return;

  const s = load(slug);
  const segmentStatus = { ...s.segmentStatus };
  for (const segment of config.segments) {
    if (segment.awardOnly) continue;
    segmentStatus[segment.key] = status;
  }
  commit(slug, { ...s, segmentStatus });
}

/** The same, across all four programs. */
export function setAllProgramsSegmentStatus(status: SegmentStatus): void {
  for (const p of PAGEANTS) setAllSegmentStatus(p.slug, status);
}

/** Fill every judge's sheet for a segment with plausible scores. */
export function simulateSegment(slug: string, segmentKey: string): void {
  const config = configFor(slug);
  if (!config) return;
  const segment = config.segments.find((sg) => sg.key === segmentKey);
  if (!segment) return;

  const s = load(slug);
  const scores = { ...s.scores };
  const submissions = { ...s.submissions };
  const single = segment.inputMode === 'SEGMENT_SINGLE';
  const fields = single ? [null] : segment.criteria.map((c) => c.key);

  for (const judge of s.judges.filter((j) => j.active)) {
    for (const c of s.candidates.filter((x) => x.status === 'ACTIVE')) {
      for (const f of fields) {
        const max = single
          ? segment.maxTotal
          : (segment.criteria.find((x) => x.key === f)?.maxScore ?? segment.maxTotal);
        // Cluster in the upper band, the way real panels score, with a little
        // per-judge and per-candidate variation.
        const base = 0.72 + Math.random() * 0.26;
        const raw = max * base;
        /* Whole numbers only. This used to emit half-points on any criterion
           out of 10 or less, which was fine while judges typed into a number
           field — but the score pad can only produce integers, so a simulated
           7.5 renders as an unscored cell and shows a decimal total on a sheet
           that cannot contain one. */
        const value = Math.round(raw);
        scores[scoreKey(segmentKey, judge.id, c.id, f)] = Math.min(max, Math.max(0, value));
      }
    }
    submissions[submissionKey(segmentKey, judge.id)] = new Date().toISOString();
  }

  commit(slug, {
    ...s,
    scores,
    submissions,
    segmentStatus: { ...s.segmentStatus, [segmentKey]: 'CLOSED' },
  });
}
