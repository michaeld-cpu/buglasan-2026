/**
 * Auth and segment scoping.
 *
 * The filtering tested here is the whole point of the app: a judge must see
 * exactly the segments they are seated for, and must be refused everything
 * else even when they type the URL by hand.
 *
 * The first test is the one that earns its keep, a typo in a segment key in
 * `SEGMENT_ASSIGNMENTS` does not throw, it just hands that judge an empty
 * sheet, which nobody notices until the judge says "there's nothing here" on
 * the night.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PAGEANTS, configFor, resetPageant, setSegmentStatus } from '../store/store';
import {
  allAccounts,
  assignedSegments,
  can,
  canScoreSegment,
  currentAccount,
  isSeatedOn,
  scoreBlockReason,
  signIn,
  signOut,
  visiblePageants,
} from './auth';

const HARA = 'hara-negros-oriental-2026';
const GANDANG = 'gandang-negorense-2026';
const BOOTHS = 'lgu-booth-contest-2026';
const FESTIVAL = 'festival-of-festivals-2026';

const account = (username: string) =>
  allAccounts().find((a) => a.username === username)!;

beforeEach(() => {
  signOut();
  for (const p of PAGEANTS) resetPageant(p.slug);
});

// ---------------------------------------------------------------------------
// Account integrity
// ---------------------------------------------------------------------------

describe('account wiring', () => {
  it('references only segment keys that exist in the config', () => {
    for (const acct of allAccounts()) {
      if (!acct.segmentKeys || !acct.pageantSlug) continue;
      const config = configFor(acct.pageantSlug)!;
      const known = new Set(config.segments.map((s) => s.key));
      for (const key of acct.segmentKeys) {
        expect(known, `${acct.username} is assigned unknown segment "${key}"`).toContain(key);
      }
    }
  });

  it('gives every account a unique username and PIN', () => {
    const accts = allAccounts();
    expect(new Set(accts.map((a) => a.username)).size).toBe(accts.length);
    // A shared PIN means two people can sign in as each other.
    expect(new Set(accts.map((a) => a.pin)).size).toBe(accts.length);
  });

  it('seats a judge account on every program', () => {
    for (const p of PAGEANTS) {
      const seated = allAccounts().filter((a) => a.pageantSlug === p.slug);
      expect(seated.length, `${p.slug} has no judges`).toBeGreaterThan(0);
      // Seat 1 is the chairman on every panel; several rules key off it.
      expect(seated.some((a) => a.judgeId === 'judge-1')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

describe('signIn', () => {
  it('accepts a correct username and PIN', () => {
    const result = signIn('hara1', '7011');
    expect(result.ok).toBe(true);
    expect(currentAccount()?.username).toBe('hara1');
  });

  it('is case-insensitive on the username', () => {
    expect(signIn('HARA1', '7011').ok).toBe(true);
  });

  it('refuses a wrong PIN without saying which half was wrong', () => {
    const bad = signIn('hara1', '0001');
    const missing = signIn('nobody', '0001');
    expect(bad.ok).toBe(false);
    expect(missing.ok).toBe(false);
    // Identical messages, so the form cannot be used to enumerate usernames.
    expect(bad.ok || missing.ok ? '' : bad.error).toBe(
      bad.ok || missing.ok ? '' : missing.error);
  });

  /* Empty input used to come back as "Incorrect username or PIN", which told
     a judge their card was wrong when they had simply not typed yet. Being
     specific about a blank field leaks nothing: they know what they left
     empty. */
  it('asks for the missing field instead of calling it incorrect', () => {
    const both = signIn('', '');
    const noUser = signIn('', '7011');
    const noPin = signIn('hara1', '');

    for (const r of [both, noUser, noPin]) {
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.error).not.toMatch(/incorrect/i);
    }
    expect(both.ok ? '' : both.error).toMatch(/username and PIN/i);
    expect(noUser.ok ? '' : noUser.error).toMatch(/username/i);
    expect(noPin.ok ? '' : noPin.error).toMatch(/PIN/i);
  });

  it('treats whitespace-only input as missing, not incorrect', () => {
    const r = signIn('   ', '  ');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).not.toMatch(/incorrect/i);
  });

  /* A real credential typed with a stray space, easy on a phone keyboard,
     must still sign in, so the trim has to survive any validation change. */
  it('trims padding around a valid username and PIN', () => {
    expect(signIn(' hara1 ', ' 7011 ').ok).toBe(true);
  });

  it('clears the session on sign out', () => {
    signIn('hara1', '7011');
    signOut();
    expect(currentAccount()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Program scoping
// ---------------------------------------------------------------------------

describe('program scoping', () => {
  it('limits a judge to the one program they are seated on', () => {
    expect(visiblePageants(account('hara1'))).toEqual([HARA]);
    expect(visiblePageants(account('booth2'))).toEqual([BOOTHS]);
    expect(isSeatedOn(account('hara1'), GANDANG)).toBe(false);
    expect(isSeatedOn(account('fest3'), FESTIVAL)).toBe(true);
  });

  /* Staff accounts are not seeded in this app at all — they belong to the
     tabulation app. This asserts the REMOVAL rather than the old behaviour: a
     vacuous version (`account('admin')` returning undefined) would pass
     whether or not the accounts existed. */
  it('seeds no staff accounts', () => {
    expect(allAccounts().every((a) => a.role === 'JUDGE')).toBe(true);
    expect(allAccounts().find((a) => a.username === 'admin')).toBeUndefined();
    expect(allAccounts().find((a) => a.username === 'tabulator')).toBeUndefined();
  });

  it('refuses the removed staff logins', () => {
    expect(signIn('admin', '0000').ok).toBe(false);
    expect(signIn('tabulator', '1111').ok).toBe(false);
  });

  it('shows a signed-out visitor nothing', () => {
    expect(visiblePageants(null)).toEqual([]);
    expect(can(null, 'score')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Segment scoping
// ---------------------------------------------------------------------------

describe('segment scoping', () => {
  it('gives a full-panel judge every scorable segment', () => {
    const segs = assignedSegments(account('hara1'), HARA);
    const config = configFor(HARA)!;
    const scorable = config.segments.filter((s) => !s.awardOnly);
    expect(segs).toHaveLength(scorable.length);
  });

  it('never puts an awardOnly segment on a judge sheet', () => {
    // Hara's tourism reel and the booth contest's Public Choice tally are both
    // fed from outside the panel; a judge must never be asked to score them.
    for (const [slug, user] of [[HARA, 'hara1'], [BOOTHS, 'booth1']] as const) {
      const keys = assignedSegments(account(user), slug).map((a) => a.segment.key);
      const awardOnly = configFor(slug)!.segments.filter((s) => s.awardOnly);
      expect(awardOnly.length).toBeGreaterThan(0);
      for (const s of awardOnly) expect(keys).not.toContain(s.key);
    }
  });

  it('limits an interview-panel judge to their two segments', () => {
    const keys = assignedSegments(account('hara6'), HARA).map((a) => a.segment.key);
    expect(keys).toEqual(['interview', 'final_qa']);
  });

  it('limits the Gandang closed-door judge to their assignment', () => {
    const keys = assignedSegments(account('gno5'), GANDANG).map((a) => a.segment.key);
    expect(keys).toEqual(['beauty_closed', 'interview']);
  });

  it('returns segments in running order', () => {
    const segs = assignedSegments(account('hara1'), HARA);
    const orders = segs.map((s) => s.segment.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('gives a judge nothing on a program they are not seated on', () => {
    expect(assignedSegments(account('hara1'), GANDANG)).toEqual([]);
  });

  /* A staff session can still ARRIVE here from the tabulation app, so the
     scoping rules for a non-judge role still matter — they just cannot be
     created by signing in here. Built inline for that reason. */
  it('gives a staff role no sheets, they are not seated judges', () => {
    const staff = {
      id: 'ext-admin',
      username: 'ext',
      pin: '----',
      displayName: 'Tabulation Head',
      role: 'SUPER_ADMIN',
      title: 'Super admin',
    } as const;
    expect(assignedSegments(staff, HARA)).toEqual([]);
    expect(can(staff, 'score')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Write authorization
// ---------------------------------------------------------------------------

describe('canScoreSegment', () => {
  it('refuses a segment that has not been opened', () => {
    // Everything seeds as DRAFT.
    expect(canScoreSegment(account('hara1'), HARA, 'aquatic')).toBe(false);
    expect(scoreBlockReason(account('hara1'), HARA, 'aquatic')).toMatch(/not been opened/i);
  });

  it('allows an assigned judge once the admin opens it', () => {
    setSegmentStatus(HARA, 'aquatic', 'OPEN');
    expect(canScoreSegment(account('hara1'), HARA, 'aquatic')).toBe(true);
    expect(scoreBlockReason(account('hara1'), HARA, 'aquatic')).toBeNull();
  });

  it('refuses an open segment the judge is not assigned to', () => {
    setSegmentStatus(HARA, 'aquatic', 'OPEN');
    // hara6 is interview-only. This is the deep-link case: the segment is
    // genuinely open, so only the assignment stops them.
    expect(canScoreSegment(account('hara6'), HARA, 'aquatic')).toBe(false);
    expect(scoreBlockReason(account('hara6'), HARA, 'aquatic')).toMatch(/not assigned/i);
  });

  it('refuses a closed and a certified segment', () => {
    setSegmentStatus(HARA, 'aquatic', 'CLOSED');
    expect(canScoreSegment(account('hara1'), HARA, 'aquatic')).toBe(false);
    expect(scoreBlockReason(account('hara1'), HARA, 'aquatic')).toMatch(/closed/i);

    setSegmentStatus(HARA, 'aquatic', 'CERTIFIED');
    expect(canScoreSegment(account('hara1'), HARA, 'aquatic')).toBe(false);
    expect(scoreBlockReason(account('hara1'), HARA, 'aquatic')).toMatch(/certified|locked/i);
  });

  it('refuses a judge on another program even when the segment is open', () => {
    setSegmentStatus(HARA, 'aquatic', 'OPEN');
    expect(canScoreSegment(account('gno1'), HARA, 'aquatic')).toBe(false);
    expect(scoreBlockReason(account('gno1'), HARA, 'aquatic')).toMatch(/not seated/i);
  });

  it('refuses staff a score write', () => {
    setSegmentStatus(HARA, 'aquatic', 'OPEN');
    // Staff can open and close segments but must not score. Encoding on a
    // judge's behalf is a separate, audit-logged action.
    const staff = {
      id: 'ext-admin',
      username: 'ext',
      pin: '----',
      displayName: 'Tabulation Head',
      role: 'SUPER_ADMIN',
      title: 'Super admin',
    } as const;
    expect(canScoreSegment(staff, HARA, 'aquatic')).toBe(false);
  });

  it('refuses a signed-out visitor', () => {
    setSegmentStatus(HARA, 'aquatic', 'OPEN');
    expect(canScoreSegment(null, HARA, 'aquatic')).toBe(false);
  });

  it('refuses an unknown segment key', () => {
    expect(canScoreSegment(account('hara1'), HARA, 'no_such_segment')).toBe(false);
  });
});
