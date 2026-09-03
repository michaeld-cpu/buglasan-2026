/**
 * Judge authentication and segment scoping, CLIENT-ONLY.
 *
 * ⚠️  This is NOT security. Accounts and roles are enforced in the browser, so
 * anyone with devtools can edit localStorage and become a super admin, and each
 * browser holds its own scores. It exists so the panel can be rehearsed with
 * realistic sign-in, roles and permissions, and so the shape of the code is
 * ready for a real server.
 *
 * To make it real: move `ACCOUNTS` and `signIn` behind an HTTP API, hash the
 * PINs, issue an httpOnly session cookie, and re-check `can()` and
 * `assignedSegments()` on the server for every write. The screens do not need
 * to change, they only ever call this module.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS ADDS OVER A PLAIN LOGIN
 * ---------------------------------------------------------------------------
 * A judge is not "a judge of the festival". A judge is seated on ONE program
 * and, within it, is often assigned only SOME segments, the closed-door
 * interview panel is not the same people as the coronation panel, and the
 * booth walkthrough judges never see a stage. `Account.segmentKeys` carries
 * that assignment:
 *
 *   undefined  → every segment of the program (the common case: a full panel)
 *   [...]      → only these segment keys
 *
 * `assignedSegments()` is the one function that answers "what may this person
 * score?", and it intersects three things: the judge's program, their segment
 * assignment, and whether the admin has actually opened the segment. Every
 * screen funnels through it, so a judge cannot reach a sheet by editing the
 * URL, JudgeSegment re-checks it on load rather than trusting the route.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { PageantConfig, Segment } from '@judges/scoring';
import { PAGEANTS, configFor, segmentStatusOf } from '../store/store';

export type Role = 'SUPER_ADMIN' | 'TABULATOR' | 'JUDGE';

export interface Account {
  id: string;
  /** Sign-in handle. Case-insensitive. */
  username: string;
  /** Demo-only. A real system stores a hash, server-side, never this. */
  pin: string;
  displayName: string;
  role: Role;
  /** JUDGE only: which program and seat this account scores for. */
  pageantSlug?: string;
  judgeId?: string;
  /**
   * JUDGE only: the segments this judge is assigned to.
   * `undefined` means the whole program, a judge seated for every segment.
   */
  segmentKeys?: string[];
  /** Shown under the name on screen: "Chairman", "Seat 3", "Super admin". */
  title?: string;
}

const SESSION_KEY = 'judges:session';

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** Per-program PIN block, so no two accounts anywhere share a PIN. */
const PIN_BLOCK: Record<string, number> = {
  'hara-negros-oriental-2026': 7000,
  'gandang-negorense-2026': 3000,
  'lgu-booth-contest-2026': 5000,
  'festival-of-festivals-2026': 9000,
};

/** Sign-in prefix per program. */
const USER_PREFIX: Record<string, string> = {
  'hara-negros-oriental-2026': 'hara',
  'gandang-negorense-2026': 'gno',
  'lgu-booth-contest-2026': 'booth',
  'festival-of-festivals-2026': 'fest',
};

/**
 * Segment assignments that are NOT the full panel.
 *
 * Keyed `<slug>|<seatNo>`. Anything absent gets the whole program, which is
 * the normal case. These two entries exist to make the filtering visible in
 * the demo, and because they mirror how the panels actually differ: Hara
 * seats 6 and 7 are the interview panel, and Gandang seat 5 judges only the
 * closed-door rounds.
 *
 * Replace this map with the real panel assignments before the dry run.
 */
const SEGMENT_ASSIGNMENTS: Record<string, string[]> = {
  'hara-negros-oriental-2026|6': ['interview', 'final_qa'],
  'hara-negros-oriental-2026|7': ['interview', 'final_qa'],
  'gandang-negorense-2026|5': ['beauty_closed', 'interview'],
};

/** Judge accounts, derived from each program's seeded panel. */
function judgeAccounts(): Account[] {
  const out: Account[] = [];

  for (const p of PAGEANTS) {
    const prefix = USER_PREFIX[p.slug] ?? p.slug.slice(0, 4);
    const block = PIN_BLOCK[p.slug] ?? 1000;
    const seats = seatCount(p);

    for (let i = 1; i <= seats; i++) {
      out.push({
        id: `${prefix}-judge-${i}`,
        username: `${prefix}${i}`,
        // A per-program block plus the seat, so PINs never collide across
        // programs or with the staff logins.
        pin: String(block + i * 11),
        displayName: i === 1 ? 'Chairman of the Board' : `Judge ${i}`,
        role: 'JUDGE',
        pageantSlug: p.slug,
        judgeId: `judge-${i}`,
        segmentKeys: SEGMENT_ASSIGNMENTS[`${p.slug}|${i}`],
        title: i === 1 ? 'Chairman' : `Seat ${i}`,
      });
    }
  }
  return out;
}

/**
 * Panel size per program. Mirrors `seed.ts`, the two must agree, because a
 * judge account whose `judgeId` is not in the seeded panel can sign in and
 * then find nothing to score.
 */
function seatCount(config: PageantConfig): number {
  return config.slug === 'hara-negros-oriental-2026' ? 7 : 5;
}

/**
 * NO STAFF ACCOUNTS.
 *
 * `admin` / `0000` and `tabulator` / `1111` used to be seeded here. They are
 * gone: this app holds judges' score sheets, and every staff capability those
 * accounts implied — opening and certifying segments, reading results,
 * managing users — belongs to the tabulation app. A staff login that can sign
 * in here but do nothing except read a "not seated as a judge" message is not
 * a feature, and it put two publicly-known PINs into a build whose whole
 * threat model is that a PIN is what stands between a stranger and a score.
 *
 * The `SUPER_ADMIN` / `TABULATOR` roles and the permission matrix REMAIN, and
 * so does `RequireJudge`'s staff branch. The two apps share this auth model,
 * so a staff session created by the tabulation app can still arrive here — a
 * tabulation head picking up a judge's phone is a real thing on the night, and
 * they must still be told plainly what this app is rather than hitting a login
 * loop. What is removed is the ability to originate a staff session HERE.
 */

/**
 * Built once and never rebuilt. `useSyncExternalStore` compares snapshots by
 * reference, so `currentAccount()` must return the *same* object each call,
 * rebuilding this list per call sends React into an infinite render loop.
 */
const ACCOUNTS: Account[] = judgeAccounts();
const BY_ID = new Map(ACCOUNTS.map((a) => [a.id, a]));

export function allAccounts(): Account[] {
  return ACCOUNTS;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface Session {
  accountId: string;
  at: string;
}

let cached: Session | null | undefined;
const listeners = new Set<() => void>();

function read(): Session | null {
  if (cached !== undefined) return cached;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    cached = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function write(s: Session | null) {
  cached = s;
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* in-memory session still applies for this tab */
  }
  for (const l of listeners) l();
}

/* Signing out in one tab signs out the others. A judge who hands their phone
   back should not leave a live session open in a second tab. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY) {
      cached = undefined;
      for (const l of listeners) l();
    }
  });
}

export type SignInResult = { ok: true; account: Account } | { ok: false; error: string };

export function signIn(username: string, pin: string): SignInResult {
  const u = username.trim().toLowerCase();
  const p = pin.trim();

  /* Missing input is reported separately from wrong input, and it is safe to
     be specific here: naming a field the judge left blank tells an attacker
     nothing they did not already type. The old code answered an empty form
     with "Incorrect username or PIN", which was both untrue, nothing was
     incorrect, the fields were empty, and misleading on the night, since it
     points a judge at the card in their hand instead of at the form. */
  if (!u && !p) return { ok: false, error: 'Enter your username and PIN.' };
  if (!u) return { ok: false, error: 'Enter your username.' };
  if (!p) return { ok: false, error: 'Enter your PIN.' };

  /* Past this point the message must NOT distinguish a wrong username from a
     wrong PIN: identical text is what stops the form being used to enumerate
     which seats exist. Covered by the "without saying which half was wrong"
     test, keep the two branches returning one shared string. */
  const account = ACCOUNTS.find((a) => a.username.toLowerCase() === u);
  if (!account || account.pin !== p) {
    return { ok: false, error: 'Incorrect username or PIN.' };
  }

  write({ accountId: account.id, at: new Date().toISOString() });
  return { ok: true, account };
}

export function signOut(): void {
  write(null);
}

export function currentAccount(): Account | null {
  const s = read();
  if (!s) return null;
  return BY_ID.get(s.accountId) ?? null;
}

export function useAccount(): Account | null {
  return useSyncExternalStore(
    useCallback((fn: () => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    }, []),
    currentAccount,
    () => null);
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type Permission =
  /** See the control room, results and standings for any program. */
  | 'view:admin'
  /** Open, close, certify segments. */
  | 'manage:segments'
  /** Score as a seated judge. */
  | 'score'
  /** Destructive: reset a program, simulate scores. */
  | 'manage:data'
  /** Manage accounts. */
  | 'manage:users';

const MATRIX: Record<Role, Permission[]> = {
  SUPER_ADMIN: ['view:admin', 'manage:segments', 'manage:data', 'manage:users'],
  TABULATOR: ['view:admin', 'manage:segments'],
  JUDGE: ['score'],
};

export function can(account: Account | null, permission: Permission): boolean {
  if (!account) return false;
  return MATRIX[account.role].includes(permission);
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  TABULATOR: 'Tabulator',
  JUDGE: 'Judge',
};

// ---------------------------------------------------------------------------
// Scoping, which programs, and which segments within them
// ---------------------------------------------------------------------------

/** Judges are scoped to one program; staff see all of them. */
export function visiblePageants(account: Account | null): string[] {
  if (!account) return [];
  if (account.role === 'JUDGE') return account.pageantSlug ? [account.pageantSlug] : [];
  return PAGEANTS.map((p) => p.slug);
}

/** Is this account seated on this program at all? */
export function isSeatedOn(account: Account | null, slug: string): boolean {
  return visiblePageants(account).includes(slug);
}

export interface AssignedSegment {
  segment: Segment;
  /** OPEN means the judge may write to it right now. */
  status: ReturnType<typeof segmentStatusOf>;
  /** True when the admin has opened it for scoring. */
  open: boolean;
}

/**
 * THE scoping function: every segment this account may score on one program,
 * in running order, each tagged with whether it is open right now.
 *
 * Three filters, in this order:
 *   1. the account is seated on this program at all
 *   2. the segment is in the account's assignment (or the account has none,
 *      meaning the full panel)
 *   3. the segment is judge-scorable, `awardOnly` segments are fed by the
 *      tabulation head from outside the panel and must never appear on a sheet
 *
 * Segment *status* is returned rather than filtered on, because a judge needs
 * to see "Evening Gown, not open yet" to know the night has not skipped them.
 * Only `open` grants a writable sheet.
 */
export function assignedSegments(account: Account | null, slug: string): AssignedSegment[] {
  if (!account || !isSeatedOn(account, slug)) return [];

  const config = configFor(slug);
  if (!config) return [];

  // Staff are not seated judges; they score nothing.
  if (account.role !== 'JUDGE') return [];

  const assigned = account.segmentKeys;

  return config.segments
    .filter((s) => !s.awardOnly)
    .filter((s) => assigned === undefined || assigned.includes(s.key))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((segment) => {
      const status = segmentStatusOf(slug, segment.key);
      return { segment, status, open: status === 'OPEN' };
    });
}

/**
 * May this account write scores for this exact segment right now?
 *
 * The single authorization check before any score is saved. `JudgeSegment`
 * calls it on load and again before every write, so a judge who deep-links to
 * a segment they are not assigned to, or one the admin has since closed,
 * gets a refusal rather than a live sheet.
 */
export function canScoreSegment(
  account: Account | null,
  slug: string,
  segmentKey: string): boolean {
  if (!can(account, 'score')) return false;
  const found = assignedSegments(account, slug).find((a) => a.segment.key === segmentKey);
  return Boolean(found?.open);
}

/**
 * Why a judge cannot score a segment, in words for the screen.
 * Returns null when they can.
 */
export function scoreBlockReason(
  account: Account | null,
  slug: string,
  segmentKey: string): string | null {
  if (!account) return 'You are signed out.';
  if (account.role !== 'JUDGE') return 'This account is not seated as a judge.';
  if (!isSeatedOn(account, slug)) return 'You are not seated on this program.';

  const found = assignedSegments(account, slug).find((a) => a.segment.key === segmentKey);
  if (!found) return 'You are not assigned to this segment.';

  switch (found.status) {
    case 'OPEN':
      return null;
    case 'DRAFT':
      return 'This segment has not been opened for scoring yet.';
    case 'CLOSED':
      return 'Scoring for this segment is closed.';
    case 'CERTIFIED':
      return 'This segment has been certified and is locked.';
    default:
      return 'This segment is not open for scoring.';
  }
}
