/**
 * THE scoring screen.
 *
 * Design constraints, all of them operational rather than aesthetic:
 *
 * - **Autosave every keystroke, explicit submit.** A judge's phone dying
 *   halfway through swimwear must not lose the sheet. Drafts persist; only
 *   Submit finalises.
 * - **Re-authorize on load and before every write.** The route is not trusted.
 *   `canScoreSegment` is checked when the screen mounts, and again inside the
 *   save path, so a segment the admin closes mid-sheet stops accepting writes
 *   immediately rather than at the next navigation.
 * - **Refuse an incomplete sheet, naming what is missing.** A judge who taps
 *   Submit with candidate 9 blank gets told "candidate 9", not "please
 *   complete the form".
 * - **No running totals across candidates, ever.** A judge sees their own
 *   per-candidate total (so they can sanity-check their own arithmetic) and
 *   nothing else. No standings, no other judges, no leaderboard.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react/dist/icons/ArrowLeft';
import { Check } from '@phosphor-icons/react/dist/icons/Check';
import type { Candidate, Criterion, Segment } from '@judges/scoring';
import { Shell } from '../components/Shell';
import {
  assignedSegments,
  canScoreSegment,
  scoreBlockReason,
  useAccount,
} from '../auth/auth';
import {
  hasSubmitted,
  saveScores,
  scoresFor,
  submitSheet,
  unsubmitSheet,
  usePageantState,
} from '../store/store';
import { programMeta } from '../data/programs';

/** A sheet cell key: one candidate, one criterion (or the segment itself). */
const cellKey = (candidateId: string, criterionKey: string | null) =>
  `${candidateId}|${criterionKey ?? '_'}`;

export function JudgeSegment() {
  const { slug = '', segmentKey = '' } = useParams();
  const account = useAccount();
  const navigate = useNavigate();
  const meta = programMeta(slug);

  const state = usePageantState(slug);
  const judgeId = account?.judgeId ?? '';

  const assignment = assignedSegments(account, slug).find((a) => a.segment.key === segmentKey);
  const segment = assignment?.segment;

  /* The authorization check, run on every render rather than once on mount.
     If the admin closes the segment while a judge has the sheet open, this
     flips and the inputs disable on the next store notification. */
  const writable = canScoreSegment(account, slug, segmentKey);
  const blocked = scoreBlockReason(account, slug, segmentKey);
  const submitted = hasSubmitted(slug, segmentKey, judgeId);

  /* Shown once, right after this judge submits, not whenever `submitted` is
     true. A judge who reopens a submitted sheet to check a score should land
     on the sheet, not be told again that they submitted it; the persistent
     notice below covers that case. This is the acknowledgement for the act.
   *
   * `'first'` vs `'again'` decides both the copy and whether the backdrop
   * celebrates. Finishing a segment is worth fireworks; correcting one is
   * housekeeping, and congratulating a judge for fixing a mistake would read
   * as odd. `submitSheet` returns which it was. */
  const [justSubmitted, setJustSubmitted] = useState<'first' | 'again' | null>(null);

  const candidates = useMemo(
    () => state.candidates.filter((c) => c.status === 'ACTIVE').sort((a, b) => a.number - b.number),
    [state.candidates]);

  /* Local draft, seeded from storage. Kept as strings so a half-typed "1"
     on the way to "10" is not clamped to 1 while the judge is still typing,
     parsing happens on commit, not on keystroke. */
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = scoresFor(slug, segmentKey, judgeId);
    const next: Record<string, string> = {};
    for (const row of saved) next[cellKey(row.candidateId, row.criterionKey)] = String(row.value);
    setDraft(next);
  }, [slug, segmentKey, judgeId]);

  const cells = useMemo(() => sheetCells(segment), [segment]);

  const commit = useCallback(
    (candidateId: string, criterionKey: string | null, raw: string) => {
      setDraft((d) => ({ ...d, [cellKey(candidateId, criterionKey)]: raw }));

      /* Re-check before the write, not just before the render. This is the
         line that makes a closed segment actually stop accepting scores. */
      if (!canScoreSegment(account, slug, segmentKey)) return;

      const value = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(value)) return;

      const max = maxFor(segment, criterionKey);
      if (value < 0 || value > max) return; // out of range: held locally, flagged, not saved

      /* Whole numbers only, for now.
       *
       * The score pad can only produce integers, so this cannot trip from the
       * UI — it is here for the other ways a value arrives: a draft rehydrated
       * from localStorage written by an earlier build that allowed halves, or
       * the rehearsal bar's `simulateSegment`. Rejecting rather than rounding,
       * because silently turning a judge's 7.5 into 8 is a changed score. */
      if (!Number.isInteger(value)) return;

      saveScores(slug, segmentKey, judgeId, [{ candidateId, criterionKey, value }]);
    },
    [account, slug, segmentKey, judgeId, segment]);

  if (!segment) {
    return (
      <Shell accent={meta.accent}>
        <div className="empty-state">
          <strong>That segment is not on your sheet.</strong>
          <p>{blocked ?? 'You are not assigned to this segment.'}</p>
          <p style={{ marginTop: '1rem' }}>
            <button className="button" onClick={() => navigate('/judge')} type="button">
              <ArrowLeft aria-hidden="true" size={16} /> Back to my segments
            </button>
          </p>
        </div>
      </Shell>
    );
  }

  const missing = missingRows(candidates, cells, draft);
  const complete = missing.length === 0;

  /* The success screen replaces the sheet rather than overlaying it. A judge
     has just finished a segment and the next thing they need is the way back
     to their list, showing the sheet again behind a banner invites them to
     keep editing a sheet they have already sent. */
  if (justSubmitted) {
    const isFirst = justSubmitted === 'first';
    return (
      <Shell accent={meta.accent} celebrate={isFirst}>
        <div className="submitted-state frosted">
          <span className="submitted-state__mark" aria-hidden="true">
            <Check size={30} weight="bold" />
          </span>
          <h1>{isFirst ? 'Sheet submitted' : 'Sheet resubmitted'}</h1>
          <p className="lede">
            {isFirst
              ? `${segment.name} is in. Your scores are recorded for this seat, and the tabulation head can see them now.`
              : `Your corrections to ${segment.name} are saved. The tabulation head sees the updated scores — the earlier version is replaced.`}
          </p>
          <p className="submitted-state__note">
            It stays editable until the segment is closed, reopen it if you spot a
            slip.
          </p>
          <div className="submitted-state__actions">
            <button
              className="button button--primary"
              onClick={() => navigate(`/judge`)}
              type="button"
            >
              Back to my segments
            </button>
            <button
              className="button button--ghost"
              onClick={() => setJustSubmitted(null)}
              type="button"
            >
              Review this sheet
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell accent={meta.accent}>
      {/* The arrow keeps its circle; the label sits outside it. Visible text
          again, so the `aria-label`/`sr-only` pair the icon-only version
          needed is gone, the button now reads its own name. The circle is a
          span rather than a nested element with its own semantics, so the
          whole thing stays one button and one tap target. */}
      <button className="back-button" onClick={() => navigate('/judge')} type="button">
        <span aria-hidden="true" className="back-button__ring">
          <ArrowLeft size={17} />
        </span>
        Return
      </button>

      <div className="sheet-head frosted">
        <div className="sheet-head__row">
          <h1>{segment.name}</h1>
          <span className="sheet-progress">
            <b>{candidates.length - missing.length}</b> / {candidates.length} scored
          </span>
        </div>
      </div>

      {blocked && <p className="notice" role="status">{blocked}</p>}

      {submitted && !blocked && (
        <p className="notice" role="status">
          You submitted this sheet. It stays editable until the tabulation head closes the
          segment, reopen it below if you need to correct a score.
        </p>
      )}


      <div className="score-rows">
        {candidates.map((candidate, i) => (
          <ScoreRow
            index={i}
            key={candidate.id}
            candidate={candidate}
            cells={cells}
            draft={draft}
            onCommit={commit}
            readOnly={!writable}
            segment={segment}
          />
        ))}
      </div>

      <SubmitBar
        complete={complete}
        judgeId={judgeId}
        missing={missing}
        onSubmitted={(isFirst) => setJustSubmitted(isFirst ? 'first' : 'again')}
        readOnly={!writable}
        segment={segment}
        segmentKey={segmentKey}
        slug={slug}
        submitted={submitted}
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Sheet shape
// ---------------------------------------------------------------------------

/**
 * The columns a judge fills for one candidate.
 *
 * SEGMENT_SINGLE is one unnamed cell scored out of the segment total, with the
 * criteria shown above as guidance, that is the literal reading of the Hara
 * rulebook. The other two modes give one cell per criterion.
 */
function sheetCells(segment: Segment | undefined): Array<{ key: string | null; label: string; max: number }> {
  if (!segment) return [];
  if (segment.inputMode === 'SEGMENT_SINGLE') {
    return [{ key: null, label: 'Score', max: segment.maxTotal }];
  }
  return segment.criteria.map((c: Criterion) => ({ key: c.key, label: c.name, max: c.maxScore }));
}

function maxFor(segment: Segment | undefined, criterionKey: string | null): number {
  if (!segment) return 0;
  if (criterionKey === null) return segment.maxTotal;
  return segment.criteria.find((c) => c.key === criterionKey)?.maxScore ?? segment.maxTotal;
}

/** Candidates with at least one blank or out-of-range cell. */
function missingRows(
  candidates: Candidate[],
  cells: Array<{ key: string | null; max: number }>,
  draft: Record<string, string>): Candidate[] {
  return candidates.filter((c) =>
    cells.some((cell) => {
      const raw = draft[cellKey(c.id, cell.key)];
      if (raw === undefined || raw.trim() === '') return true;
      const v = Number(raw);
      /* `v < 1`, not `v < 0`: the score pad's lowest button is 1, so a stored
         0 would show as nothing selected while counting the row as complete —
         a judge would be told the sheet was done with a visibly empty cell.
         Non-integers are incomplete too, for the same reason: the pad cannot
         display a 7.5, so it would render as unscored. */
      return !Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > cell.max;
    }));
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ScoreRow({
  candidate,
  segment,
  cells,
  draft,
  onCommit,
  readOnly,
  index,
}: {
  candidate: Candidate;
  segment: Segment;
  cells: Array<{ key: string | null; label: string; max: number }>;
  draft: Record<string, string>;
  onCommit: (candidateId: string, criterionKey: string | null, raw: string) => void;
  readOnly: boolean;
  /** Row position, feeding the list's staggered entrance (`--i`). */
  index: number;
}) {
  /* `Number('')` is 0, not NaN, so a cleared cell has to be treated as blank
     BEFORE it is coerced. Without this, re-tapping a score to clear it left
     the row's total reading "0 of 10" and counted the row as answered — a
     judge would see a total for a candidate they had deliberately unscored. */
  const values = cells.map((cell) => {
    const raw = draft[cellKey(candidate.id, cell.key)];
    return raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  });
  const anyBlank = values.some((v) => !Number.isFinite(v));

  /* The judge's own total for this candidate. On CRITERIA_SUM it is the sheet
     total; on CRITERIA_MEAN the weighted mean; on SEGMENT_SINGLE it is just
     the one number echoed back. Shown so a judge can check their own
     arithmetic, never a comparison against anyone else. */
  const total = anyBlank
    ? null
    : segment.inputMode === 'CRITERIA_MEAN'
      ? weightedMean(segment, cells, values)
      : values.reduce((a, b) => a + b, 0);

  return (
    <div
      className={`score-row frosted${anyBlank ? '' : ' score-row--done'}`}
      style={{ ['--i' as string]: index }}
    >
      <div className="score-row__head">
        {/* The entry number, always shown, not just when a portrait is
            missing.

            It used to live inside the avatar as the no-photo fallback, which
            meant that the moment candidates had photos the number vanished
            from the sheet entirely. The number is how a judge is told who is
            on stage ("number 7 please") and how they check they are scoring
            the right row, so it has to survive a portrait rather than be
            replaced by one, doubly so while every candidate shares one
            placeholder face.

            First in the row, ahead of the portrait: it is the index a judge
            scans by, so it reads down one fixed column at the card's leading
            edge rather than sitting behind a face. */}
        <span className="score-row__num" aria-hidden="true">
          {candidate.number}
        </span>

        {/* Photo container with a gold ring. The pageant rosters share ONE
            placeholder portrait today; booth and contingent entries have no
            photography at all.

            The number used to render inside this circle when there was no
            photo. It is gone: the gold index immediately to the left is the
            same digit, and showing it twice on one row made the avatar look
            like a second, competing identifier. A photoless entry now gets the
            empty ring, styled as a deliberate blank rather than a gap.

            Rendered only when a photo exists, so nothing is mounted for the
            33 booth and contingent entries.

            `alt=""` and `aria-hidden`: the number precedes this and the name
            follows it, so alt text here would announce the same entry a third
            time. */}
        <span className={`score-row__avatar${candidate.photo ? '' : ' is-empty'}`}>
          {candidate.photo && (
            <img alt="" aria-hidden="true" loading="lazy" src={candidate.photo} />
          )}
        </span>

        <span className="score-row__who">
          <strong>
            {/* Spoken as "No. 7, Althea Marie Bacong", the visible number is
                `aria-hidden` above, so this carries it for screen readers
                without the digit being announced twice. */}
            <span className="sr-only">No. {candidate.number}, </span>
            {candidate.name}
          </strong>
          {/* The place alone — no "Town:" / "Municipality:" prefix. A city
              name is self-evidently a place, and the label was repeated on
              every row of a 26-candidate sheet without ever telling a judge
              something they did not already know. */}
          <span>{candidate.lgu}</span>
        </span>
        <span className="score-row__total">
          <b>{total === null ? '—' : round1(total)}</b>
          <span>of {segment.maxTotal}</span>
        </span>
      </div>

      <div className="criteria-grid">
        {cells.map((cell) => {
          const raw = draft[cellKey(candidate.id, cell.key)] ?? '';
          const v = Number(raw);
          const invalid = raw.trim() !== '' && (!Number.isFinite(v) || v < 0 || v > cell.max);
          const id = `s-${candidate.id}-${cell.key ?? 'single'}`;

          return (
            <div className="criterion" key={cell.key ?? 'single'}>
              {/* A `fieldset`, not a `label` + input: the control is now a
                  group of radio-style buttons, and a group needs a legend for
                  a screen reader to announce what the buttons belong to. */}
              <fieldset className="criterion__set">
                <legend id={`${id}-legend`}>
                  {cell.label} <span>/ {cell.max}</span>
                </legend>

                {/* Whole numbers 1..max as buttons, in place of a typed field.
                    No decimals: the brief is integers only for now, and a row
                    of buttons cannot express a half-point, which is the point.

                    `role="radiogroup"` + `aria-checked` rather than real
                    radios, because a real radio group makes every option a tab
                    stop; with up to 50 options across several criteria that
                    would bury the Submit button behind hundreds of stops. The
                    group takes ONE stop and arrow keys move within it, which
                    is what the ARIA pattern prescribes anyway. */}
                <div
                  aria-labelledby={`${id}-legend`}
                  className="scorepad"
                  id={id}
                  /* Arrow keys move the selection, which is how a radiogroup
                     is expected to behave and what replaces the Up/Down the
                     old number input gave for free. Home/End jump to the ends
                     of the range. */
                  onKeyDown={(e) => {
                    if (readOnly) return;
                    const cur = Number.isFinite(v) ? v : 0;
                    let next: number | null = null;
                    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                      next = Math.min(cell.max, cur + 1);
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                      next = Math.max(1, cur - 1);
                    } else if (e.key === 'Home') {
                      next = 1;
                    } else if (e.key === 'End') {
                      next = cell.max;
                    }
                    if (next === null) return;
                    e.preventDefault();
                    onCommit(candidate.id, cell.key, String(next));
                    /* Move focus with the selection, so the roving tabindex
                       and the DOM focus stay in agreement. */
                    const group = e.currentTarget;
                    window.requestAnimationFrame(() => {
                      const btn = group.querySelector<HTMLButtonElement>(
                        `[data-n="${next}"]`,
                      );
                      btn?.focus();
                    });
                  }}
                  role="radiogroup"
                >
                  {Array.from({ length: cell.max }, (_, i) => i + 1).map((n) => {
                    const picked = v === n;
                    return (
                      <button
                        aria-checked={picked}
                        className="scorepad__btn"
                        data-n={n}
                        disabled={readOnly}
                        key={n}
                        onClick={() => {
                          /* Tapping the picked number again clears it, so a
                             judge who mis-taps is not forced to leave a wrong
                             score standing. */
                          onCommit(candidate.id, cell.key, picked ? '' : String(n));
                        }}
                        role="radio"
                        /* Only the selected button — or the first, when
                           nothing is picked yet — is in the tab order. That is
                           the roving-tabindex half of the radiogroup pattern. */
                        tabIndex={picked || (!Number.isFinite(v) && n === 1) ? 0 : -1}
                        type="button"
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {invalid && (
                <span className="criterion__error">Enter 1 – {cell.max}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubmitBar({
  slug,
  segment,
  segmentKey,
  judgeId,
  complete,
  missing,
  submitted,
  readOnly,
  onSubmitted,
}: {
  slug: string;
  segment: Segment;
  segmentKey: string;
  judgeId: string;
  complete: boolean;
  missing: Candidate[];
  submitted: boolean;
  readOnly: boolean;
  onSubmitted: (isFirst: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (readOnly) return null;

  return (
    <>
      <div className="submit-bar">
        <span className="submit-bar__status">
          {submitted ? (
            /* Once submitted, "awaiting submission" is simply false, and it
               sat beside a "Reopen to edit" button, so the bar contradicted
               itself: the line said the sheet still needed sending while the
               button said it had been sent. This states what is now true. */
            <span className="autosave">Sheet submitted to the tabulation head</span>
          ) : complete ? (
            /* Names both facts deliberately. "All scores saved on this device"
               stated only the first and sat beside a "Review & submit" button,
               so a judge could reasonably read a complete sheet as a finished
               one and leave the table without submitting. The second clause is
               the whole point of the line. */
            <span className="autosave">All scores recorded · awaiting submission</span>
          ) : (
            <>
              Still to score: <b>{missing.map((c) => c.number).join(', ')}</b>
            </>
          )}
        </span>

        {submitted ? (
          <button
            className="button"
            onClick={() => unsubmitSheet(slug, segmentKey, judgeId)}
            type="button"
          >
            Reopen to edit
          </button>
        ) : (
          <button
            className="button button--primary"
            disabled={!complete}
            onClick={() => setConfirming(true)}
            type="button"
          >
            Review &amp; submit
          </button>
        )}
      </div>

      {confirming && (
        <ReviewDialog
          judgeId={judgeId}
          onClose={() => setConfirming(false)}
          onSubmitted={onSubmitted}
          segment={segment}
          segmentKey={segmentKey}
          slug={slug}
        />
      )}
    </>
  );
}

/**
 * Review before submit.
 *
 * The sheet is read back from *storage*, not from the draft in memory. If a
 * keystroke failed to persist, this is where a judge sees it, reviewing the
 * same in-memory object they just typed into would confirm nothing.
 */
function ReviewDialog({
  slug,
  segment,
  segmentKey,
  judgeId,
  onClose,
  onSubmitted,
}: {
  slug: string;
  segment: Segment;
  segmentKey: string;
  judgeId: string;
  onClose: () => void;
  onSubmitted: (isFirst: boolean) => void;
}) {
  const state = usePageantState(slug);
  const saved = scoresFor(slug, segmentKey, judgeId);

  const byCandidate = new Map<string, number>();
  for (const row of saved) {
    byCandidate.set(row.candidateId, (byCandidate.get(row.candidateId) ?? 0) + row.value);
  }

  const candidates = state.candidates
    .filter((c) => c.status === 'ACTIVE')
    .sort((a, b) => a.number - b.number);

  /* Lock the page while this dialog is up.
   *
   * `body { position: fixed }` collapses the scroll offset to 0, so the offset
   * is captured first and written back as a negative `top` — that keeps the
   * sheet visually where it was behind the scrim, instead of snapping to the
   * top of the page under the dialog. On close both are undone and the scroll
   * position is restored.
   *
   * In the effect rather than the click handler so it is tied to the dialog
   * being mounted: an unmount for any reason (Escape, a route change, an error
   * boundary) still releases the page. */
  useEffect(() => {
    const y = window.scrollY;
    const { body } = document;
    /* The width the page scrollbar is about to give up. 0 on overlay-scrollbar
       platforms; ~15px with classic scrollbars. Only consumed by the Safari
       fallback in `body.is-dialog-open` — see the `@supports` note there. */
    const barWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.setProperty('--scrollbar-w', `${barWidth}px`);
    body.classList.add('is-dialog-open');
    body.style.top = `-${y}px`;
    return () => {
      body.classList.remove('is-dialog-open');
      body.style.top = '';
      body.style.removeProperty('--scrollbar-w');
      window.scrollTo(0, y);
    };
  }, []);

  return (
    <div
      aria-labelledby="review-title"
      aria-modal="true"
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
    >
      <div className="modal frosted" onClick={(e) => e.stopPropagation()}>
        <h2 id="review-title">Submit your sheet</h2>
        <p className="lede">
          Read back from this device’s saved scores. Check the totals, then submit.
        </p>

        <div className="review-list">
          {candidates.map((c) => {
            const total = byCandidate.get(c.id);
            return (
              <div
                className={`review-row${total === undefined ? ' review-row--missing' : ''}`}
                key={c.id}
              >
                <span className="review-row__num">{c.number}</span>
                <span className="review-row__name">{c.name}</span>
                <span className="review-row__score">
                  {total === undefined ? (
                    'not saved'
                  ) : (
                    <>
                      {round1(total)}
                      {/* The denominator, so a lone "2" is not mistaken for a
                          rank or a count. Dimmer than the score itself, the
                          number a judge is checking is the one they entered,
                          and the max is the context around it. */}
                      <span className="review-row__max"> / {segment.maxTotal}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="modal__actions">
          <button className="button button--ghost" onClick={onClose} type="button">
            Keep editing
          </button>
          <button
            className="button button--primary"
            onClick={() => {
              const isFirst = submitSheet(slug, segmentKey, judgeId);
              onSubmitted(isFirst);
              onClose();
            }}
            type="button"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function weightedMean(
  segment: Segment,
  cells: Array<{ key: string | null }>,
  values: number[]): number {
  let num = 0;
  let den = 0;
  cells.forEach((cell, i) => {
    const w = segment.criteria.find((c) => c.key === cell.key)?.weight ?? 1;
    num += values[i] * w;
    den += w;
  });
  return den === 0 ? 0 : num / den;
}

/** One decimal, without trailing ".0" on whole numbers. */
function round1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
