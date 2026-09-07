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
import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown';
import { CaretUp } from '@phosphor-icons/react/dist/icons/CaretUp';
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

  /**
   * A SUBMITTED sheet is locked until the judge reopens it.
   *
   * `writable` alone was not enough: it asks "may this seat score this
   * segment", which stays true after submitting (the segment is still open),
   * so every field on a submitted sheet still accepted typing. The screen
   * said "Sheet submitted" and offered "Reopen to edit" while quietly taking
   * edits anyway, and because each keystroke autosaves, those edits landed in
   * storage without the judge ever reopening — a submitted sheet could drift
   * from what the judge signed off on.
   *
   * Reopening is the deliberate unlock, which is what the button already
   * promised. `unsubmitSheet` clears the submission and this flips back.
   */
  const editable = writable && !submitted;

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

      /* And refuse a write to a SUBMITTED sheet. The inputs are disabled while
         submitted, so this is the second layer rather than the first, but it
         is the one that holds if a field is ever left enabled by mistake:
         every keystroke autosaves, so an ungated path here silently rewrites
         a sheet the judge has already signed off on. */
      if (hasSubmitted(slug, segmentKey, judgeId)) return;

      const value = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(value)) return;

      const max = maxFor(segment, criterionKey);
      if (value < 0 || value > max) return; // out of range: held locally, flagged, not saved

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
          You submitted this sheet, so the scores below are locked. Reopen it to correct
          a score, any time before the tabulation head closes the segment.
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
            /* `editable`, not `writable`: a submitted sheet is locked until
               the judge reopens it. */
            readOnly={!editable}
            segment={segment}
          />

        ))}
      </div>

      <SubmitBar
        complete={complete}
        judgeId={judgeId}
        missing={missing}
        onSubmitted={(isFirst) => setJustSubmitted(isFirst ? 'first' : 'again')}
        /* `writable`, NOT `editable`. The bar is what carries "Reopen to
           edit", so gating it on `editable` would hide the one control that
           unlocks a submitted sheet. */
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
      return !Number.isFinite(v) || v < 0 || v > cell.max;
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
     BEFORE it is coerced. Without this, clearing a field a judge had already
     scored left the row's total reading "0 of 10" and counted the row as
     answered — a judge would see a total for a candidate they had just
     emptied. `?? NaN` alone does not catch it: the draft holds `''`, not
     `undefined`, once the field has been touched. */
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
        {/* Photo with the entry number as a corner badge.
         *
         * The number used to be its own column to the LEFT of the portrait.
         * It is now pinned to the avatar itself, the way a presence dot sits on
         * a chat avatar: the two describe the same person, so binding them into
         * one object means a judge cannot read a number off one row while
         * looking at the face from the next. It also buys the portrait real
         * size, which is the point of the change, without the row growing to
         * fit a separate digit beside it.
         *
         * The number MUST survive a portrait. It is how a judge is told who is
         * on stage ("number 7 please") and how they confirm they are scoring
         * the right row. An earlier version drew it inside the circle as the
         * no-photo fallback, so it vanished the moment candidates had photos; a
         * badge is present whether or not there is a face under it.
         *
         * The pageant rosters share ONE placeholder portrait today, and booth
         * and contingent entries have no photography at all, which is what
         * `.is-empty` styles as a deliberate blank rather than a gap.
         *
         * `alt=""` and `aria-hidden` throughout: the name that follows already
         * announces "No. 7, Althea Marie Bacong", so labelling these would
         * repeat the same entry two more times. */}
        <span className={`score-row__avatar${candidate.photo ? '' : ' is-empty'}`}>
          {candidate.photo && (
            <img alt="" aria-hidden="true" loading="lazy" src={candidate.photo} />
          )}
          {/* The sash — a pageant strap across the portrait.
           *
           * Two elements: a round clipper that owns `overflow: hidden`, and
           * the band inside it. The clip cannot go on the avatar itself
           * because the number badge has to overhang that edge, and it cannot
           * go on the band because the band is rotated — a `clip-path` on it
           * would be rotated too, and `circle()` measured against its own
           * oversized box does not describe the portrait.
           *
           * Decorative: the number is announced by the `.sr-only` text with
           * the name below. */}
          <span aria-hidden="true" className="score-row__sash-clip">
            <span className="score-row__sash" />
          </span>
          <span aria-hidden="true" className="score-row__badge">
            {candidate.number}
          </span>
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
      </div>

      {/* `--cells` tells the CSS how many criteria there are. The inline
          layout needs an explicit column count — see the note on
          `.criteria-grid` — because `auto-fill` has no definite width to
          divide inside a shrink-to-fit flex item. */}
      <div className="criteria-grid" style={{ ['--cells' as string]: cells.length }}>
        {cells.map((cell) => {
          const raw = draft[cellKey(candidate.id, cell.key)] ?? '';
          const v = Number(raw);
          const invalid = raw.trim() !== '' && (!Number.isFinite(v) || v < 0 || v > cell.max);
          const id = `s-${candidate.id}-${cell.key ?? 'single'}`;

          return (
            <div className="criterion" key={cell.key ?? 'single'}>
              {/* The visible label is gone — the max now lives inside the
                  field as ghost text, so a criterion is its box and nothing
                  else. Kept for screen readers, which have no placeholder to
                  read once a value is typed over it. */}
              <label className="sr-only" htmlFor={id}>
                {cell.label} (out of {cell.max})
              </label>
              {/* The steppers are positioned against THIS box, not against the
                  criterion, so they stay centred on the field no matter how
                  many lines the label above wraps to. */}
              <span className="criterion__field">
              <input
                aria-invalid={invalid ? 'true' : undefined}
                disabled={readOnly}
                id={id}
                /* `decimal` rather than `numeric`: half-points are legal on
                   several segments and a keypad without a decimal key makes
                   them unenterable. */
                inputMode="decimal"
                max={cell.max}
                min={0}
                onChange={(e) => onCommit(candidate.id, cell.key, e.target.value)}
                /* Scrolling must never change a score.
                 *
                 * A focused `type=number` input treats wheel and two-finger
                 * trackpad scroll as increment/decrement, so a judge scrolling
                 * the sheet past the field they just typed into silently edits
                 * it, and the store commits on change, so the wrong number is
                 * saved without anyone touching a key. That is the single most
                 * damaging input bug this screen could have.
                 *
                 * Blurring rather than `preventDefault` because React attaches
                 * `onWheel` passively and cannot cancel the event; dropping
                 * focus removes the target the browser would have stepped.
                 * The page keeps scrolling normally, which is what the judge
                 * actually asked for by scrolling. */
                onWheel={(e) => e.currentTarget.blur()}
                type="number"
                value={raw}
              />

              {/* The max, INSIDE the field and always visible.
                *
                * This was the input's `placeholder`, which meant it vanished
                * the moment a judge typed — so the one time the ceiling is
                * worth checking against, "is 8 out of 10 or out of 35?", it
                * was gone. A real element persists.
                *
                * `aria-hidden`: the `.sr-only` label already says "out of 10",
                * so announcing this would repeat it on every field. */}
              <span aria-hidden="true" className="criterion__max">
                / {cell.max}
              </span>

              {/* Brand steppers, replacing the grey native spinners the CSS
                  above now suppresses.

                  `tabIndex={-1}` and `aria-hidden`: a keyboard user already
                  has Up/Down on the focused input, so exposing two more stops
                  per criterion would triple the tab path through a sheet of 26
                  candidates for no new capability. These are for thumbs.

                  Clamped and rounded to one decimal — `step` on a bare
                  `type=number` would let a judge hold the button past
                  `cell.max` and commit an out-of-range score. */}
              {!readOnly && (
                <span aria-hidden="true" className="criterion__step">
                  <button
                    className="criterion__step-btn"
                    disabled={v >= cell.max}
                    onClick={() => {
                      const next = Math.min(cell.max, Math.round(((v || 0) + 1) * 10) / 10);
                      onCommit(candidate.id, cell.key, String(next));
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    <CaretUp size={11} weight="bold" />
                  </button>
                  <button
                    className="criterion__step-btn"
                    disabled={raw.trim() === '' || v <= 0}
                    onClick={() => {
                      const next = Math.max(0, Math.round(((v || 0) - 1) * 10) / 10);
                      onCommit(candidate.id, cell.key, String(next));
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    <CaretDown size={11} weight="bold" />
                  </button>
                </span>
              )}
              </span>

              {invalid && (
                <span className="criterion__error">Enter 0 – {cell.max}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* The running total, ONLY where it is not a restatement.
       *
       * On a single-score sheet the total is the one field's value echoed
       * back, so showing both put the same number on the row twice — which is
       * what made this end of the card look cluttered. Dropped there.
       *
       * On a multi-criteria sheet it is a real computation the judge cannot do
       * at a glance (a sum on CRITERIA_SUM, a weighted mean on CRITERIA_MEAN),
       * so it stays. */}
      {cells.length > 1 && (
        <span className="score-row__total">
          <b>{total === null ? '—' : round1(total)}</b>
          <span>of {segment.maxTotal}</span>
        </span>
      )}
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
