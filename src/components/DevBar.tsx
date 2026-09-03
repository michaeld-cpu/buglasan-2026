/**
 * Rehearsal controls, DEV BUILD ONLY.
 *
 * On the night, segments are opened, closed and certified from the tabulator's
 * control room, one at a time, deliberately: opening a segment is what puts it
 * in front of seven judges, and that should be a decision someone makes rather
 * than a button someone finds. This bar exists so a dry run does not need the
 * control room running alongside it, or a hand-written localStorage command in
 * the browser console.
 *
 * `import.meta.env.DEV` is a compile-time constant, so in `npm run build` the
 * `return null` below is all that survives, Vite eliminates the rest of the
 * component as dead code and it cannot be reached in production even by
 * someone who knows it is here. Verified against the bundle: zero occurrences
 * of "devbar", "Open all segments" or `setAllProgramsSegmentStatus` in the
 * production JS. That is the whole reason it is safe to put a bulk "open
 * everything" control on a judge-facing screen.
 *
 * The `.devbar` CSS rules do survive (~1.2KB), because Vite does not
 * tree-shake stylesheets. They are unreachable, nothing in the production
 * bundle ever renders an element with those class names.
 *
 * It also carries an ACCOUNT SWITCHER. A dry run means checking what seat 3
 * sees, then what the chairman sees, then what a tabulator sees, and doing
 * that through the sign-in form means typing a username and a four-digit PIN
 * every time, for 20+ seeded accounts whose PINs are generated from a
 * per-program block. The switcher signs in directly through the same
 * `signIn()` the form calls, so it exercises the real code path rather than
 * writing a session behind its back.
 *
 * FORM: a floating circular handle that can be dragged anywhere on screen,
 * mounted both inside the shell and on the sign-in page. Sign-in needed it
 * because a dry run starts there, with every segment seeded DRAFT, a judge
 * signing in lands on a home screen of closed sheets and the only way to open
 * them was to sign in as admin first. Draggable because it is fixed over live
 * UI on two very different layouts, and wherever it is parked it will be over
 * something on one of them: the sign-in card's PIN field, or a score row's
 * inputs.
 *
 * The position persists in localStorage, so it stays where it was put across
 * a reload and across the sign-in -> panel transition.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Wrench } from '@phosphor-icons/react/dist/icons/Wrench';
import { X } from '@phosphor-icons/react/dist/icons/X';
import { useNavigate } from 'react-router-dom';
import {
  PAGEANTS,
  configFor,
  getState,
  setAllProgramsSegmentStatus,
  usePageantState,
} from '../store/store';
import { ROLE_LABEL, allAccounts, signIn, useAccount } from '../auth/auth';
import { programMeta } from '../data/programs';
import type { SegmentStatus } from '../store/types';
import type { Account } from '../auth/auth';

export function DevBar() {
  if (!import.meta.env.DEV) return null;
  return <DevBarInner />;
}

/** Where the handle was last parked. */
const POS_KEY = 'judges:devbar-pos';

const HANDLE = 46;
const EDGE = 12;

type Pos = { x: number; y: number };

/** Keep the handle fully on screen, after a drag, and after a resize. */
function clamp(p: Pos): Pos {
  const maxX = Math.max(EDGE, window.innerWidth - HANDLE - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - HANDLE - EDGE);
  return {
    x: Math.min(Math.max(EDGE, p.x), maxX),
    y: Math.min(Math.max(EDGE, p.y), maxY),
  };
}

function loadPos(): Pos {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pos;
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) return clamp(p);
    }
  } catch {
    /* fall through to the default corner */
  }
  // Bottom left, where the old fixed bar lived.
  return clamp({ x: EDGE, y: window.innerHeight - HANDLE - EDGE });
}

/** Group the seeded accounts for the switcher: staff first, then by program. */
function accountGroups(): Array<{ label: string; accounts: Account[] }> {
  const all = allAccounts();
  const staff = all.filter((a) => a.role !== 'JUDGE');
  const groups: Array<{ label: string; accounts: Account[] }> = [];
  if (staff.length) groups.push({ label: 'Staff', accounts: staff });
  for (const p of PAGEANTS) {
    const judges = all.filter((a) => a.role === 'JUDGE' && a.pageantSlug === p.slug);
    if (judges.length) groups.push({ label: programMeta(p.slug).title, accounts: judges });
  }
  return groups;
}

function DevBarInner() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(loadPos);
  const [tab, setTab] = useState<'segments' | 'accounts'>('segments');
  const navigate = useNavigate();
  const account = useAccount();

  /* Sign in through the real `signIn()` rather than writing a session
     directly, so the switcher cannot drift from what the form does, if PIN
     handling or the session shape changes, this changes with it or fails
     loudly. */
  const switchTo = (target: Account) => {
    const result = signIn(target.username, target.pin);
    if (!result.ok) return;
    setOpen(false);
    /* `replace` so the dev bar does not litter the history stack, and always
       to the root: `RequireAuth` then routes the new account to wherever it
       belongs, a judge to their program, staff to the staff message,
       instead of this component duplicating that decision. */
    navigate('/', { replace: true });
  };

  /* A drag must not also fire the click that opens the panel. This tracks
     whether the pointer actually moved past a small threshold, so a tap still
     toggles and a drag does not. */
  const dragging = useRef(false);
  const moved = useRef(false);
  const origin = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Left button / touch only, and never start a drag from the panel.
      if (e.button !== 0) return;
      dragging.current = true;
      moved.current = false;
      origin.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current || !origin.current) return;
    const dx = e.clientX - origin.current.px;
    const dy = e.clientY - origin.current.py;
    // 4px of slop, so a slightly imprecise tap is still a tap.
    if (!moved.current && Math.hypot(dx, dy) < 4) return;
    moved.current = true;
    setPos(clamp({ x: origin.current.x + dx, y: origin.current.y + dy }));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (moved.current) {
        try {
          window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
        } catch {
          /* position is a convenience; never break the app over it */
        }
      } else {
        setOpen((v) => !v);
      }
    },
    [pos]);

  /* A rotated phone or a resized window can leave the handle off screen. */
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Subscribe to every program so the counts below stay live as segments are
     opened, including from another tab. Hooks cannot be called in a loop over
     a dynamic list, but PAGEANTS is a module-level constant of fixed length,
     so the call order is stable across renders. */
  for (const p of PAGEANTS) usePageantState(p.slug);

  const counts = PAGEANTS.map((p) => {
    const config = configFor(p.slug);
    const state = getState(p.slug);
    const scorable = (config?.segments ?? []).filter((s) => !s.awardOnly);
    const openCount = scorable.filter((s) => state.segmentStatus[s.key] === 'OPEN').length;
    return { slug: p.slug, title: programMeta(p.slug).title, openCount, total: scorable.length };
  });

  const totalOpen = counts.reduce((a, c) => a + c.openCount, 0);
  const totalSegments = counts.reduce((a, c) => a + c.total, 0);

  const apply = (status: SegmentStatus) => setAllProgramsSegmentStatus(status);

  /* Anchored top-left and moved with `left`/`top`, so one coordinate system
     covers the whole viewport, a corner-anchored bar would need its offsets
     flipped depending on which half the handle was dragged into. */
  const side = pos.x > window.innerWidth / 2 ? 'is-left' : 'is-right';
  const vert = pos.y > window.innerHeight / 2 ? 'is-up' : 'is-down';

  return (
    <div className={`devbar ${side} ${vert}`} style={{ left: pos.x, top: pos.y }}>
      <button
        aria-expanded={open}
        aria-label={`Rehearsal controls, ${totalOpen} of ${totalSegments} segments open`}
        className="devbar__handle"
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Rehearsal controls (drag to move)"
        type="button"
      >
        {open ? (
          <X aria-hidden="true" size={18} />
        ) : (
          <Wrench aria-hidden="true" size={18} />
        )}
        {/* The open-segment count as a ring badge, so the handle still reports
            state at a glance without the old bar's label. */}
        {!open && totalOpen > 0 && <span className="devbar__count">{totalOpen}</span>}
      </button>

      {open && (
        <div className="devbar__panel">
          <p className="devbar__note">
            Dev build only, this bar is compiled out of <code>npm run build</code>. On the
            night, segments are opened from the tabulator’s control room.
          </p>

          <div className="devbar__tabs" role="tablist">
            <button
              aria-selected={tab === 'segments'}
              className="devbar__tab"
              onClick={() => setTab('segments')}
              role="tab"
              type="button"
            >
              Segments
            </button>
            <button
              aria-selected={tab === 'accounts'}
              className="devbar__tab"
              onClick={() => setTab('accounts')}
              role="tab"
              type="button"
            >
              Accounts
            </button>
          </div>

          {tab === 'accounts' ? (
            <>
              <p className="devbar__who">
                Signed in as{' '}
                <b>{account ? account.displayName : 'nobody'}</b>
                {account?.title ? ` · ${account.title}` : ''}
              </p>
              {accountGroups().map((group) => (
                <div className="devbar__group" key={group.label}>
                  <span className="devbar__group-label">{group.label}</span>
                  {group.accounts.map((a) => (
                    <button
                      aria-current={a.id === account?.id ? 'true' : undefined}
                      className="devbar__account"
                      key={a.id}
                      onClick={() => switchTo(a)}
                      type="button"
                    >
                      <span className="devbar__account-name">
                        {a.displayName}
                        {a.title ? <em>{a.title}</em> : null}
                      </span>
                      {/* The credentials, because a dry run sometimes needs
                          them typed into the real form rather than clicked. */}
                      <span className="devbar__account-creds">
                        {a.username} · {a.pin}
                      </span>
                      <span className="devbar__account-role">
                        {a.role === 'JUDGE' ? 'Judge' : ROLE_LABEL[a.role]}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <>
          <div className="devbar__actions">
            <button className="button button--primary" onClick={() => apply('OPEN')} type="button">
              Open all segments
            </button>
            <button className="button" onClick={() => apply('CLOSED')} type="button">
              Close all
            </button>
            <button className="button button--ghost" onClick={() => apply('DRAFT')} type="button">
              Reset to draft
            </button>
          </div>

          <ul className="devbar__list">
            {counts.map((c) => (
              <li key={c.slug}>
                <span>{c.title}</span>
                <b className={c.openCount === c.total ? 'is-open' : undefined}>
                  {c.openCount}/{c.total} open
                </b>
              </li>
            ))}
          </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
