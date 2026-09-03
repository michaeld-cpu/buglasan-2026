/**
 * A judge's night, on one screen: the segments they are assigned, in running
 * order, each showing whether it is open and whether they have submitted.
 *
 * Segments that are not open are shown greyed rather than hidden. A judge who
 * sees only "Interview" on their screen cannot tell whether the night has not
 * reached the earlier rounds or whether the app has lost them; a judge who
 * sees the whole running order with "not open yet" against it knows exactly
 * where they are. That is worth the extra rows.
 */

import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { assignedSegments, useAccount, type AssignedSegment } from '../auth/auth';
import { hasSubmitted, usePageantState } from '../store/store';
import { programMeta } from '../data/programs';
import type { SegmentStatus } from '../store/types';

const STATUS_BADGE: Record<SegmentStatus, { className: string; label: string }> = {
  OPEN: { className: 'badge badge--open', label: 'Open' },
  DRAFT: { className: 'badge badge--draft', label: 'Not open yet' },
  CLOSED: { className: 'badge badge--closed', label: 'Closed' },
  CERTIFIED: { className: 'badge badge--locked', label: 'Certified' },
};

export function JudgeHome() {
  const account = useAccount();
  const slug = account?.pageantSlug ?? '';
  const meta = programMeta(slug);

  /* Subscribing to the program's state is what makes the admin opening a
     segment appear here without a refresh, the store notifies, this
     re-renders, and the row flips from "Not open yet" to "Open". No polling. */
  usePageantState(slug);

  const segments = assignedSegments(account, slug);
  const judgeId = account?.judgeId ?? '';

  const openCount = segments.filter((s) => s.open).length;
  const doneCount = segments.filter((s) => hasSubmitted(slug, s.segment.key, judgeId)).length;

  return (
    <Shell accent={meta.accent}>
      <div className="page-head">
        <span className="eyebrow">Your score sheets</span>
        <h1>Good evening, {account?.displayName ?? 'Judge'}.</h1>
        <p className="lede">
          {segments.length === 0
            ? 'You have no segments assigned on this program.'
            : `You are judging ${segments.length} ${
                segments.length === 1 ? 'segment' : 'segments'
              } · ${doneCount} submitted · ${openCount} open now.`}
        </p>
      </div>

      <div className="program-strip frosted">
        {meta.logo && <img alt="" src={meta.logo} />}
        <div>
          <strong>{meta.title}</strong>
          <span>
            {meta.subtitle}
            {meta.venue ? ` · ${meta.venue}` : ''}
          </span>
        </div>
      </div>

      {segments.length === 0 ? (
        <div className="empty-state">
          <strong>Nothing assigned to your seat.</strong>
          <p>
            If you expected sheets here, check with the tabulation head that your seat is
            on the panel for this program.
          </p>
        </div>
      ) : (
        <div className="segment-list">
          {segments.map((entry, i) => (
            <SegmentRow
              index={i}
              key={entry.segment.key}
              entry={entry}
              judgeId={judgeId}
              slug={slug}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

function SegmentRow({
  entry,
  slug,
  judgeId,
  index,
}: {
  /** Row position, feeding the list's staggered entrance (`--i`). */
  index: number;
  entry: AssignedSegment;
  slug: string;
  judgeId: string;
}) {
  const navigate = useNavigate();
  const { segment, status, open } = entry;
  const submitted = hasSubmitted(slug, segment.key, judgeId);
  const badge = STATUS_BADGE[status];

  /* A submitted sheet stays reachable while the segment is open so a judge can
     review what they sent, and unsubmit if they spot a slip before the admin
     closes it. Once closed, the row is inert. */
  const reachable = open;

  return (
    <button
      className="segment-card frosted"
      disabled={!reachable}
      onClick={() => navigate(`/judge/${slug}/${segment.key}`)}
      style={{ ['--i' as string]: index }}
      type="button"
    >
      <span className="segment-card__order">{segment.order}</span>

      <span className="segment-card__body">
        <strong>{segment.name}</strong>
        <span>
          {segment.inputMode === 'SEGMENT_SINGLE'
            ? `One score out of ${segment.maxTotal}`
            : `${segment.criteria.length} criteria · ${segment.maxTotal} points total`}
        </span>
      </span>

      {/* The status label, straight on the card, no wrapper and no pill. It
          used to sit in a `__meta` column beside a caret; with the caret gone
          the column held one item, so the label is now the flex child. */}
      {submitted ? (
        <span className="badge badge--done">Submitted</span>
      ) : (
        <span className={badge.className}>{badge.label}</span>
      )}
    </button>
  );
}
