/**
 * Routes.
 *
 * Deliberately shallow. A judge's whole night is two screens, the list of
 * their segments, and one score sheet, so the route table is short enough to
 * read in one go, and every judge route is wrapped in the same `RequireJudge`
 * guard rather than each screen re-implementing its own check.
 *
 * The sheet route carries the program slug even though a judge is only ever
 * seated on one program. That keeps the URL honest (a tabulation head reading
 * a judge's screen over their shoulder can see which program it is) and means
 * `canScoreSegment` has both halves of the key it needs to authorize a write.
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireJudge } from './components/Guard';
import { RouteLoader } from './components/RouteLoader';

/*
 * Screens are code-split, one chunk each.
 *
 * The win is not the screen code, these are four small files, it is what
 * each one drags behind it. `SignIn` pulls the whole sign-in composition: the
 * fireworks canvas and the three.js hero mark, which together are the biggest
 * thing in the build by an order of magnitude. `JudgeSegment` pulls the
 * scoring engine and the segment presets. Neither belongs in the bundle a
 * judge parses to see the OTHER screen.
 *
 * `Guard` stays a static import: it decides WHICH lazy chunk to fetch, so
 * splitting it would just add a round trip before that decision.
 *
 * Named exports, so each import maps the name onto `default`, `lazy` requires
 * a module whose default export is the component.
 */
const SignIn = lazy(() => import('./screens/SignIn').then((m) => ({ default: m.SignIn })));
const JudgeHome = lazy(() => import('./screens/JudgeHome').then((m) => ({ default: m.JudgeHome })));
const JudgeSegment = lazy(() =>
  import('./screens/JudgeSegment').then((m) => ({ default: m.JudgeSegment })));
const NotFound = lazy(() => import('./screens/NotFound').then((m) => ({ default: m.NotFound })));

export default function App() {
  return (
    /* One boundary around the whole table rather than one per route: every
       route resolves to the same loader, and a single `Suspense` means a
       navigation between two lazy screens does not unmount and remount the
       fallback. */
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />

        {/* Everything below requires a session. */}
        <Route element={<RequireAuth />}>
          {/* Sends a judge to their own program; staff get a plain message. */}
          <Route index element={<Navigate replace to="/judge" />} />

          <Route element={<RequireJudge />}>
            <Route path="/judge" element={<JudgeHome />} />
            <Route path="/judge/:slug/:segmentKey" element={<JudgeSegment />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
