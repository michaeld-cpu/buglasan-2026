/**
 * The page frame: brand, who is signed in, sign out.
 *
 * Showing the judge's own name and seat in the header is not decoration. Two
 * judges sharing a tablet, or a judge handed the wrong phone, is the failure
 * mode that silently corrupts a whole segment, so whose sheet this is stays
 * on screen at all times, at every scroll position.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SignOut } from '@phosphor-icons/react/dist/icons/SignOut';
import { AuthBackdrop } from './AuthBackdrop';
import { ROLE_LABEL, signOut, useAccount } from '../auth/auth';
import { DevBar } from './DevBar';

export function Shell({
  children,
  accent,
  celebrate = false,
}: {
  children: ReactNode;
  /** Per-program accent, applied to `--program` for everything inside. */
  accent?: string;
  /**
   * Play the backdrop's fireworks. Off everywhere except the confirmation
   * screen after a judge's FIRST submission of a sheet — see JudgeSegment.
   */
  celebrate?: boolean;
}) {
  const account = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);

  /**
   * Publish the header's real height as `--header-h` so the score sheet's own
   * sticky title can sit directly beneath it.
   *
   * Measured rather than hardcoded because the height moves with the signed-in
   * judge's name length and the viewport width. A ResizeObserver rather than a
   * one-shot read, so a rotated phone or a font that loads late re-measures
   * instead of leaving the sheet title hidden under the bar.
   */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const publish = () => {
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    };
    publish();

    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const leave = () => {
    signOut();
    navigate('/sign-in', { replace: true });
  };

  return (
    <div className="shell" style={accent ? ({ ['--program' as string]: accent }) : undefined}>
      {/* The same light shafts and Dumaguete skyline the sign-in screen opens
          on, so a judge does not cross a visual break signing in.

          Fireworks are off by default: the rays and skyline are static and
          cost nothing per frame, but the shells are an animation loop, and
          moving coloured lights over a score sheet is exactly the motion this
          app avoids. The one exception is `celebrate` — the screen shown after
          a judge finishes a segment for the first time, where there is no
          sheet left to read. See the note on the prop in AuthBackdrop.tsx. */}
      <AuthBackdrop fireworks={celebrate} />

      <header className="shell-header" ref={headerRef}>
        {/* The wordmark beside the logo is hidden under 560px, where it would
            collide with the judge's name. The logo carries the alt text so the
            header keeps an accessible name at every width rather than becoming
            an unlabelled image.

            The gold variant, not the full-colour one: the sign-in screen opens
            on the gold 3D wordmark, so a rainbow logo in the header of the
            very next screen read as a different product. It is the same
            artwork recoloured onto the Sign in button's gold ramp
            (`--frame-lo/mid/hi`), so the header, the button and the hero mark
            are all the same alloy. */}
        <div className="shell-brand">
          <img
            alt="Judges’ Panel, Buglasan Festival 2026"
            src="/assets/buglasan-festival-2026-logo-gold.webp"
          />
          <div aria-hidden="true">
            <strong>Judges’ Panel</strong>
            <span>Buglasan Festival 2026</span>
          </div>
        </div>

        {account && (
          <div className="shell-who">
            <div className="shell-who__name">
              <strong>{account.displayName}</strong>
              <span>
                {account.title ?? ROLE_LABEL[account.role]}
              </span>
            </div>
            <button className="button button--ghost" onClick={leave} type="button">
              <SignOut aria-hidden="true" size={17} />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        )}
      </header>

      {/* Keyed on the path so React remounts it on navigation, which restarts
          the entrance animation. A CSS animation only runs when an element is
          inserted; without the key, moving between two sheets would swap the
          content in place and the new screen would appear with no transition
          at all. The header and footer are deliberately outside this, they
          are the frame, and re-animating them on every navigation is exactly
          the fidgeting this is meant to avoid. */}
      <main className="shell-main" key={location.pathname}>
        {children}
      </main>

      {/* The festival line, plus the same PlanOut credit the sign-in screen
          carries. Attribution used to stop at the login: a judge spends the
          whole night on these pages and never saw it. Same lockup, same
          `.planout-credit` treatment and the same intrinsic dimensions as
          SignIn.tsx, so the two products attribute PlanOut identically. */}
      <footer className="shell-footer">
        <p>Buglasan Festival 2026 · Negros Oriental · Judges’ scoring panel</p>

        <a
          className="planout-credit"
          href="https://planout.io"
          rel="noreferrer noopener"
          target="_blank"
        >
          <span>Powered by</span>
          <img
            alt="planout.io"
            height={109}
            src="/assets/sponsors/planout-lockup-horizontal.webp"
            width={480}
          />
        </a>
      </footer>

      {/* Compiled out of production builds. See DevBar.tsx. */}
      <DevBar />
    </div>
  );
}
