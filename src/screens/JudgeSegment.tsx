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
 * - **A judge sees their OWN scores and nothing else.** Never another judge's,
 *   never a panel aggregate, never a standing. What a judge cannot see is any
 *   number they did not enter themselves.
 *
 *   This originally read "no running totals across candidates, ever" and
 *   forbade any ordering of the sheet. Stakeholders asked for a leading/least
 *   view and that rule was retired deliberately — it is recorded here rather
 *   than deleted, because the reasoning behind it still constrains the
 *   feature:
 *
 *     - The ranked view is REVIEW ONLY and carries no input fields. A sheet
 *       that reorders under a judge mid-scoring is how a score lands on the
 *       wrong candidate, and "number 7 please" only works if row 7 stays put.
 *     - Sheet order is the default, and the toggle does not appear until two
 *       candidates are scored.
 *     - It ranks the judge's own draft, computed by the same
 *       `candidateTotal` the rows display, so the two cannot disagree.
 *
 *   Anchoring bias is the live risk here and this does not remove it — it
 *   confines it to a view a judge opts into after scoring rather than one
 *   they type into.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react/dist/icons/ArrowLeft";
import { CaretDown } from "@phosphor-icons/react/dist/icons/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/icons/CaretUp";
import { Check } from "@phosphor-icons/react/dist/icons/Check";
import type { Candidate, Criterion, Segment } from "@judges/scoring";
import { Shell } from "../components/Shell";
import {
  assignedSegments,
  canScoreSegment,
  scoreBlockReason,
  useAccount,
} from "../auth/auth";
import {
  hasSubmitted,
  saveScores,
  scoresFor,
  submitSheet,
  unsubmitSheet,
  usePageantState,
} from "../store/store";
import { programMeta } from "../data/programs";

/** A sheet cell key: one candidate, one criterion (or the segment itself). */
const cellKey = (candidateId: string, criterionKey: string | null) =>
  `${candidateId}|${criterionKey ?? "_"}`;

export function JudgeSegment() {
  const { slug = "", segmentKey = "" } = useParams();
  const account = useAccount();
  const navigate = useNavigate();
  const meta = programMeta(slug);

  const state = usePageantState(slug);
  const judgeId = account?.judgeId ?? "";

  const assignment = assignedSegments(account, slug).find(
    (a) => a.segment.key === segmentKey,
  );
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
  const [justSubmitted, setJustSubmitted] = useState<"first" | "again" | null>(
    null,
  );

  /**
   * Sheet order vs the judge's own ranking.
   *
   * `'sheet'` — by entry number, and the default. It is the order a judge is
   * called through ("number 7 please") and the only order that stays still
   * while they type, so it is what they score in.
   *
   * `'ranked'` — highest of their own scores first. A REVIEW view: it answers
   * "who am I leading, who am I placing last" without the sheet reordering
   * itself under a judge mid-scoring. Rows are read-only here, so a number
   * cannot be typed into a row that just moved.
   */
  const [order, setOrder] = useState<"sheet" | "ranked">("sheet");

  const candidates = useMemo(
    () =>
      state.candidates
        .filter((c) => c.status === "ACTIVE")
        .sort((a, b) => a.number - b.number),
    [state.candidates],
  );

  /* Local draft, seeded from storage. Kept as strings so a half-typed "1"
     on the way to "10" is not clamped to 1 while the judge is still typing,
     parsing happens on commit, not on keystroke. */
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = scoresFor(slug, segmentKey, judgeId);
    const next: Record<string, string> = {};
    for (const row of saved)
      next[cellKey(row.candidateId, row.criterionKey)] = String(row.value);
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
      if (raw.trim() === "" || !Number.isFinite(value)) return;

      const max = maxFor(segment, criterionKey);
      if (value < 0 || value > max) return; // out of range: held locally, flagged, not saved

      saveScores(slug, segmentKey, judgeId, [
        { candidateId, criterionKey, value },
      ]);
    },
    [account, slug, segmentKey, judgeId, segment],
  );

  if (!segment) {
    return (
      <Shell accent={meta.accent}>
        <div className="empty-state">
          <strong>That segment is not on your sheet.</strong>
          <p>{blocked ?? "You are not assigned to this segment."}</p>
          <p style={{ marginTop: "1rem" }}>
            <button
              className="button"
              onClick={() => navigate("/judge")}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={16} /> Back to my segments
            </button>
          </p>
        </div>
      </Shell>
    );
  }

  const missing = missingRows(candidates, cells, draft);

  /**
   * The judge's own ranking of the candidates they have scored.
   *
   * Highest total first. That direction is right on every program: Hara
   * converts raw scores to per-judge ranks via `averageTieRanks`, which
   * assigns rank 1 to the HIGHEST raw score, and the other three are
   * points-highest-wins. So "leading" means the same thing everywhere and
   * this needs no per-program branch.
   *
   * Unscored candidates are held out rather than sorted to the bottom: a
   * blank is not a low score, and listing them among the placings would
   * read as "last" for someone the judge simply has not reached yet.
   */
  const ranked = useMemo(() => {
    const scored: Array<{ candidate: Candidate; total: number }> = [];
    const unscored: Candidate[] = [];
    for (const c of candidates) {
      const total = candidateTotal(segment!, cells, draft, c.id);
      if (total === null) unscored.push(c);
      else scored.push({ candidate: c, total });
    }
    scored.sort(
      (a, b) => b.total - a.total || a.candidate.number - b.candidate.number,
    );

    /* Placings, computed once here rather than per row.
     *
     * Ties share a placing and the next placing skips: two candidates on 8.5
     * are both 1st and the third is 3rd. That matches `averageTieRanks` in
     * the scoring engine, so this view cannot imply an order the tabulation
     * will not produce.
     *
     * `sharedWithPrevious` lets a row render a blank placing instead of
     * repeating the number, which is what makes a tie legible. */
    const placed = scored.map((entry, i) => {
      const first = scored.findIndex((e) => e.total === entry.total);
      return {
        ...entry,
        place: first + 1,
        sharedWithPrevious: i > 0 && scored[i - 1].total === entry.total,
      };
    });

    return { scored: placed, unscored };
  }, [candidates, segment, cells, draft]);

  /**
   * The podium takes the first three PLACINGS, not the first three rows.
   *
   * With a tie for 1st the podium holds 1st, 1st, 3rd — three people across
   * two placings — and the row after them starts at 4th. Slicing the array at
   * 3 would do the same thing here only by luck; slicing by placing is what
   * keeps it correct when the tie is deeper (three on the same score fills
   * the podium and the next row is 4th).
   *
   * `rest` is everyone the podium did not take, so the two are always
   * disjoint and nobody is shown twice or dropped.
   */
  const topThree = ranked.scored.filter((e) => e.place <= 3);
  /* A deep tie can put more than three people in the top three placings —
     four candidates on the same score are all 1st. A three-step podium
     cannot show that honestly, so those fall through to the list, where
     shared placings render correctly. */
  const podium = topThree.length === 3 ? topThree : [];
  const rest = ranked.scored.slice(podium.length);
  /* A suppressed podium needs to say WHY when the reason is not obvious.
     With one or two candidates scored the absence explains itself; a tie
     deep enough to overflow three steps does not — it looks like the podium
     is broken. Only true when there was enough scored to have built one. */
  const podiumTiedOut = podium.length === 0 && ranked.scored.length >= 3;
  const complete = missing.length === 0;

  /* The success screen replaces the sheet rather than overlaying it. A judge
     has just finished a segment and the next thing they need is the way back
     to their list, showing the sheet again behind a banner invites them to
     keep editing a sheet they have already sent. */
  if (justSubmitted) {
    const isFirst = justSubmitted === "first";
    return (
      <Shell accent={meta.accent} celebrate={isFirst}>
        <div className="submitted-state frosted">
          <span className="submitted-state__mark" aria-hidden="true">
            <Check size={30} weight="bold" />
          </span>
          <h1>{isFirst ? "Sheet submitted" : "Sheet resubmitted"}</h1>
          <p className="lede">
            {isFirst
              ? `${segment.name} is in. Your scores are recorded for this seat, and the tabulation head can see them now.`
              : `Your corrections to ${segment.name} are saved. The tabulation head sees the updated scores — the earlier version is replaced.`}
          </p>
          <p className="submitted-state__note">
            It stays editable until the segment is closed, reopen it if you spot
            a slip.
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
      <button
        className="back-button"
        onClick={() => navigate("/judge")}
        type="button"
      >
        <span aria-hidden="true" className="back-button__ring">
          <ArrowLeft size={17} />
        </span>
        Return
      </button>

      <div className="sheet-head frosted">
        <div className="sheet-head__row">
          <h1>{segment.name}</h1>
          <span className="sheet-progress">
            <b>{candidates.length - missing.length}</b> / {candidates.length}{" "}
            scored
          </span>

          {/* One toggle, not a segmented control.
           *
           * A two-chip switch was tried and read as heavier than the segment
           * name it sat under — the same reason the status pill on the segment
           * list lost its box. This is a single button that names the view it
           * goes TO, which is how the rest of the app words its controls
           * ("Reopen to edit", "Keep editing").
           *
           * `aria-pressed` rather than a radiogroup: it is one control with an
           * on state, and that is what a screen reader should hear.
           *
           * Hidden until two candidates are scored — below that a "ranking" is
           * one row or none. */}
          {ranked.scored.length > 1 && (
            <button
              aria-pressed={order === "ranked"}
              className="sheet-view"
              onClick={() => setOrder(order === "ranked" ? "sheet" : "ranked")}
              type="button"
            >
              {order === "ranked" ? "Back to sheet" : "My ranking"}
            </button>
          )}
        </div>
      </div>

      {blocked && (
        <p className="notice" role="status">
          {blocked}
        </p>
      )}

      {submitted && !blocked && (
        <p className="notice" role="status">
          You submitted this sheet. It stays editable until the tabulation head
          closes the segment, reopen it below if you need to correct a score.
        </p>
      )}

      {order === "ranked" ? (
        /* REVIEW ONLY. Read-only rows, and deliberately not the scoring
         * surface: a judge types into an unmoving sheet, so the fields are
         * absent here rather than disabled — a field that moved between
         * keystrokes is how a score lands on the wrong candidate. Switch back
         * to Sheet order to edit. */
        <div className="rank-view">
          {/* THE PODIUM: the judge's top three.
           *
           * Only when three or more are scored. With one or two the podium
           * is a plinth with gaps in it, which reads as missing data rather
           * than as an early standing — those fall through to the list.
           *
           * Ordered 2 - 1 - 3 in the DOM so first place sits in the middle
           * at the tallest step, the way a real podium is arranged. Reading
           * order therefore differs from placing order, which is why each
           * step states its own placing rather than relying on position.
           */}
          {/* Stated, not silently omitted — see `podiumTiedOut`. */}
          {podiumTiedOut && (
            <p className="rank-view__note">
              Too many candidates share the top scores to show a podium. The
              full standing is below.
            </p>
          )}

          {podium.length === 3 && (
            <ol className="podium">
              {[podium[1], podium[0], podium[2]].map((entry) => (
                <li
                  className="podium__step"
                  data-place={entry.place}
                  key={entry.candidate.id}
                >
                  {/* The contestant STANDS ON the block, so they are a
                      separate element from it: the plinth below owns the
                      height, this owns the identity. */}
                  <span className="podium__who">
                    {/* The same avatar as the score sheet, so a photoless
                        roster degrades identically here — the booth and
                        festival entries are municipalities and structures,
                        and `.is-empty` styles that as a deliberate blank. */}
                    <span
                      className={`score-row__avatar${entry.candidate.photo ? "" : " is-empty"}`}
                    >
                      {entry.candidate.photo && (
                        <img
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          src={entry.candidate.photo}
                        />
                      )}
                      <span aria-hidden="true" className="score-row__badge">
                        {entry.candidate.number}
                      </span>
                    </span>

                    <strong className="podium__name">
                      <span className="sr-only">
                        No. {entry.candidate.number},{" "}
                      </span>
                      {entry.candidate.name}
                    </strong>
                    <span className="podium__lgu">{entry.candidate.lgu}</span>
                    <span className="podium__score">
                      {round1(entry.total)}
                      <span className="podium__max"> / {segment.maxTotal}</span>
                    </span>
                  </span>

                  {/* The block itself. Its HEIGHT is the ranking — that is
                      the one thing a podium communicates that a list cannot,
                      so the placing is engraved on the face rather than set
                      above it as a caption. */}
                  <span className="podium__plinth">
                    <span className="podium__place">
                      {entry.sharedWithPrevious ? "=" : ""}
                      {ordinal(entry.place)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {/* Everyone else, in placing order. When there is no podium this is
              the whole standing.

              Wrapped as its own SECTION with a heading, so the stage above
              and the standing below read as two different things rather than
              as one long ranked strip. The heading is omitted when there is
              no podium, because then this list IS the standing and labelling
              part of it "the rest" would be wrong. */}
          {rest.length > 0 && (
            <section className="rank-rest">
              {podium.length === 3 && (
                <h3 className="rank-rest__head">
                  <span>Fourth onward</span>
                </h3>
              )}
              <ol className="rank-list">
                {rest.map((entry) => (
                  <li className="rank-row frosted" key={entry.candidate.id}>
                    {/* Ordinal for the same reason as the podium: the avatar
                        badge beside it holds the CONTESTANT number, and two
                        bare numerals side by side read as one value.

                        EVERY row states its placing, including tied ones.
                        Blanking the repeats was meant to show a tied run as
                        one group, but a row with no placing beside a row
                        with one reads as missing data — as though that
                        candidate failed to rank. A tie is marked with "="
                        instead, which says "shared" without leaving a hole. */}
                    <span className="rank-row__place">
                      {entry.sharedWithPrevious ? '=' : ''}
                      {ordinal(entry.place)}
                    </span>

                    <span
                      className={`score-row__avatar rank-row__avatar${entry.candidate.photo ? "" : " is-empty"}`}
                    >
                      {entry.candidate.photo && (
                        <img
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          src={entry.candidate.photo}
                        />
                      )}
                      <span aria-hidden="true" className="score-row__badge">
                        {entry.candidate.number}
                      </span>
                    </span>

                    <span className="rank-row__name">
                      <strong>
                        <span className="sr-only">
                          No. {entry.candidate.number},{" "}
                        </span>
                        {entry.candidate.name}
                      </strong>
                      <span>{entry.candidate.lgu}</span>
                    </span>
                    <span className="rank-row__score">
                      {round1(entry.total)}
                      <span className="rank-row__max">
                        {" "}
                        / {segment.maxTotal}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Held out of the placings rather than ranked last — a blank is
              not a low score. Named, so a judge can see who is still
              outstanding without leaving this view. */}
          {ranked.unscored.length > 0 && (
            <p className="rank-list__pending">
              Not yet scored:{" "}
              <b>{ranked.unscored.map((c) => c.number).join(", ")}</b>
            </p>
          )}
        </div>
      ) : (
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
      )}

      <SubmitBar
        complete={complete}
        judgeId={judgeId}
        missing={missing}
        onSubmitted={(isFirst) => setJustSubmitted(isFirst ? "first" : "again")}
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
function sheetCells(
  segment: Segment | undefined,
): Array<{ key: string | null; label: string; max: number }> {
  if (!segment) return [];
  if (segment.inputMode === "SEGMENT_SINGLE") {
    return [{ key: null, label: "Score", max: segment.maxTotal }];
  }
  return segment.criteria.map((c: Criterion) => ({
    key: c.key,
    label: c.name,
    max: c.maxScore,
  }));
}

function maxFor(
  segment: Segment | undefined,
  criterionKey: string | null,
): number {
  if (!segment) return 0;
  if (criterionKey === null) return segment.maxTotal;
  return (
    segment.criteria.find((c) => c.key === criterionKey)?.maxScore ??
    segment.maxTotal
  );
}

/** Candidates with at least one blank or out-of-range cell. */
function missingRows(
  candidates: Candidate[],
  cells: Array<{ key: string | null; max: number }>,
  draft: Record<string, string>,
): Candidate[] {
  return candidates.filter((c) =>
    cells.some((cell) => {
      const raw = draft[cellKey(c.id, cell.key)];
      if (raw === undefined || raw.trim() === "") return true;
      const v = Number(raw);
      return !Number.isFinite(v) || v < 0 || v > cell.max;
    }),
  );
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
  onCommit: (
    candidateId: string,
    criterionKey: string | null,
    raw: string,
  ) => void;
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
  /* The judge's own total for this candidate. On CRITERIA_SUM it is the sheet
     total; on CRITERIA_MEAN the weighted mean; on SEGMENT_SINGLE it is just
     the one number echoed back. Shown so a judge can check their own
     arithmetic. */
  const total = candidateTotal(segment, cells, draft, candidate.id);
  const anyBlank = total === null;

  return (
    <div
      className={`score-row frosted${anyBlank ? "" : " score-row--done"}`}
      style={{ ["--i" as string]: index }}
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
        <span
          className={`score-row__avatar${candidate.photo ? "" : " is-empty"}`}
        >
          {candidate.photo && (
            <img
              alt=""
              aria-hidden="true"
              loading="lazy"
              src={candidate.photo}
            />
          )}
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
      <div
        className="criteria-grid"
        style={{ ["--cells" as string]: cells.length }}
      >
        {cells.map((cell) => {
          const raw = draft[cellKey(candidate.id, cell.key)] ?? "";
          const v = Number(raw);
          const invalid =
            raw.trim() !== "" && (!Number.isFinite(v) || v < 0 || v > cell.max);
          const id = `s-${candidate.id}-${cell.key ?? "single"}`;

          return (
            <div className="criterion" key={cell.key ?? "single"}>
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
                  aria-invalid={invalid ? "true" : undefined}
                  disabled={readOnly}
                  id={id}
                  /* `decimal` rather than `numeric`: half-points are legal on
                   several segments and a keypad without a decimal key makes
                   them unenterable. */
                  inputMode="decimal"
                  max={cell.max}
                  min={0}
                  onChange={(e) =>
                    onCommit(candidate.id, cell.key, e.target.value)
                  }
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
                        const next = Math.min(
                          cell.max,
                          Math.round(((v || 0) + 1) * 10) / 10,
                        );
                        onCommit(candidate.id, cell.key, String(next));
                      }}
                      tabIndex={-1}
                      type="button"
                    >
                      <CaretUp size={11} weight="bold" />
                    </button>
                    <button
                      className="criterion__step-btn"
                      disabled={raw.trim() === "" || v <= 0}
                      onClick={() => {
                        const next = Math.max(
                          0,
                          Math.round(((v || 0) - 1) * 10) / 10,
                        );
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
          <b>{total === null ? "—" : round1(total)}</b>
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
            <span className="autosave">
              Sheet submitted to the tabulation head
            </span>
          ) : complete ? (
            /* Names both facts deliberately. "All scores saved on this device"
               stated only the first and sat beside a "Review & submit" button,
               so a judge could reasonably read a complete sheet as a finished
               one and leave the table without submitting. The second clause is
               the whole point of the line. */
            <span className="autosave">
              All scores recorded · awaiting submission
            </span>
          ) : (
            <>
              Still to score: <b>{missing.map((c) => c.number).join(", ")}</b>
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
    byCandidate.set(
      row.candidateId,
      (byCandidate.get(row.candidateId) ?? 0) + row.value,
    );
  }

  const candidates = state.candidates
    .filter((c) => c.status === "ACTIVE")
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
    body.style.setProperty("--scrollbar-w", `${barWidth}px`);
    body.classList.add("is-dialog-open");
    body.style.top = `-${y}px`;
    return () => {
      body.classList.remove("is-dialog-open");
      body.style.top = "";
      body.style.removeProperty("--scrollbar-w");
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
          Read back from this device’s saved scores. Check the totals, then
          submit.
        </p>

        <div className="review-list">
          {candidates.map((c) => {
            const total = byCandidate.get(c.id);
            return (
              <div
                className={`review-row${total === undefined ? " review-row--missing" : ""}`}
                key={c.id}
              >
                <span className="review-row__num">{c.number}</span>
                <span className="review-row__name">{c.name}</span>
                <span className="review-row__score">
                  {total === undefined ? (
                    "not saved"
                  ) : (
                    <>
                      {round1(total)}
                      {/* The denominator, so a lone "2" is not mistaken for a
                          rank or a count. Dimmer than the score itself, the
                          number a judge is checking is the one they entered,
                          and the max is the context around it. */}
                      <span className="review-row__max">
                        {" "}
                        / {segment.maxTotal}
                      </span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="modal__actions">
          <button
            className="button button--ghost"
            onClick={onClose}
            type="button"
          >
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

/**
 * One candidate's total, from the judge's own draft. `null` if any cell is
 * blank or out of range.
 *
 * Extracted so the score row and the ranked review view cannot disagree: they
 * previously computed this the same way by coincidence, and a leaderboard
 * that ranks by a different number than the row displays would be a quiet
 * way to mislead a judge about their own sheet.
 */
function candidateTotal(
  segment: Segment,
  cells: Array<{ key: string | null; max: number }>,
  draft: Record<string, string>,
  candidateId: string,
): number | null {
  const values = cells.map((cell) => {
    const raw = draft[cellKey(candidateId, cell.key)];
    /* `Number('')` is 0, not NaN, so a cleared cell has to be caught before
       it is coerced. */
    return raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  });
  if (values.some((v) => !Number.isFinite(v))) return null;
  /* Out of range counts as unscored here too: the store refuses to save it,
     so ranking on it would order the sheet by a number nobody holds. */
  if (values.some((v, i) => v < 0 || v > cells[i].max)) return null;

  return segment.inputMode === "CRITERIA_MEAN"
    ? weightedMean(segment, cells, values)
    : values.reduce((a, b) => a + b, 0);
}

function weightedMean(
  segment: Segment,
  cells: Array<{ key: string | null }>,
  values: number[],
): number {
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

/**
 * A placing as an English ordinal: 1 -> "1st", 11 -> "11th", 23 -> "23rd".
 *
 * The suffix is not decoration. Every podium step and list row shows the
 * contestant's number in a solid gold avatar badge, and the placing sits
 * inches away in the same gold. Unlabelled, the two read as one value — on a
 * photoless roster (booth entries are structures, not people) the filled
 * badge is the louder of the two, so a judge looking at 1st place would take
 * the contestant number for the rank. "2nd" is self-evidently a placing in a
 * way "2" is not.
 *
 * Two irregularities, both reachable on a 23-entry booth roster:
 *
 *   - 11, 12 and 13 take "th", not "st"/"nd"/"rd" ("11th", never "11st").
 *     This is why the tens are checked first.
 *   - The pattern then repeats above 20, so it is the LAST digit that
 *     decides: 21 -> "21st", 22 -> "22nd".
 */
export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}
