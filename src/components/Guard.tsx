/**
 * Route guards.
 *
 * These stop the *navigation*. They are not the authorization check, that is
 * `canScoreSegment`, re-run inside the sheet before every write. A guard that
 * only hides a route is a guard that a typed URL walks straight past, so the
 * two layers are deliberately separate: the guard is for the honest judge who
 * tapped the wrong thing, and `canScoreSegment` is for everything else.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Shell } from './Shell';
import { useAccount } from '../auth/auth';

/** Requires any session. Sends a signed-out visitor to sign in. */
export function RequireAuth() {
  const account = useAccount();
  const location = useLocation();

  if (!account) {
    /* `state.from` so signing in returns them to where they were aiming,
       a judge who reopens a bookmarked sheet after their phone locked should
       land back on that sheet, not on a generic home screen. */
    return <Navigate replace state={{ from: location.pathname }} to="/sign-in" />;
  }
  return <Outlet />;
}

/**
 * Requires a seated judge.
 *
 * Staff accounts stop here rather than being redirected. The tabulation head
 * signing in on a judge's device is a real thing that happens on the night,
 * and bouncing them to a login loop with no explanation is worse than telling
 * them plainly that this app only holds score sheets.
 */
export function RequireJudge() {
  const account = useAccount();

  if (account && account.role !== 'JUDGE') {
    return (
      <Shell>
        <div className="empty-state">
          <strong>This account is not seated as a judge.</strong>
          <p>
            You are signed in as {account.displayName} ({account.title}). This app holds
            judges’ score sheets only, segments are opened, closed and certified in the
            tabulator’s control room, and results are read there.
          </p>
        </div>
      </Shell>
    );
  }
  return <Outlet />;
}
