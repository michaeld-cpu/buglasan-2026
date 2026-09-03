/**
 * Sign in.
 *
 * Username + PIN rather than email + password, because the people using it are
 * seated at a judges' table with a paper panel list in front of them, and a
 * four-digit PIN is what they can be handed on a card and type once without a
 * password manager.
 *
 * Credentials are issued on paper to each seat, so nothing on this screen
 * lists them. An earlier rehearsal build printed every username and PIN
 * behind a disclosure here; that is gone.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signIn, useAccount } from '../auth/auth';
import { AuthBackdrop } from '../components/AuthBackdrop';
import { DevBar } from '../components/DevBar';
import { HeroMark } from '../components/HeroMark';

export function SignIn() {
  const account = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  /* The error is kept mounted for one beat after being cleared, so it has
     something to fade during, unmounting on the same tick as the state change
     is what made it blink out. `shown` is what renders; `error` is the truth.
     See `.form-error-slot` in styles.css. */
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      setShown(error);
      return;
    }
    if (shown === null) return;
    const t = window.setTimeout(() => setShown(null), 180); // matches --dur-1
    return () => window.clearTimeout(t);
  }, [error, shown]);

  /* Already signed in, bounce straight through. Runs in an effect rather than
     during render so React is not asked to navigate mid-render. */
  const from = (location.state as { from?: string } | null)?.from;
  useEffect(() => {
    if (account) navigate(from ?? '/judge', { replace: true });
  }, [account, from, navigate]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = signIn(username, pin);
    if (!result.ok) {
      setError(result.error);
      /* Only wipe the PIN on a genuine rejection. Clearing it when the judge
         simply left a field blank would delete digits they had already typed
         and make them start over. */
      if (!/^Enter your/.test(result.error)) setPin('');
      return;
    }
    setError(null);
    navigate(from ?? '/judge', { replace: true });
  };

  return (
    <main className="auth-page">
      {/* Decorative only, aria-hidden, behind the card, sign-in screen only.
          The score sheets deliberately get no backdrop. */}
      <AuthBackdrop />

      {/* The mark is anchored to the top of the page, independent of the card
, the same treatment as `.auth-footer` at the bottom. See
          `.hero-mark` in styles.css. */}
      <HeroMark />

      <div className="auth-card frosted">
        <h1>Judges’ Panel</h1>
        {/* Deliberately the conventional sign-in line rather than anything
            festival-flavoured. This replaced "You will see only the segments
            you are judging", which was scoping detail hoisted above the form:
            true, but it answered a question the judge does not have yet. At
            this point they want to know they are in the right place and what
            to type. The credentials are issued on a card at each seat, hence
            "issued to your seat" rather than a generic "your credentials". */}
        <p className="lede">Enter the credentials issued to your seat to continue.</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="username">Username</label>
          <input
            aria-describedby={error ? 'sign-in-error' : undefined}
            aria-invalid={error ? 'true' : undefined}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            id="username"
            onChange={(e) => {
              setUsername(e.target.value);
              /* Drop the error the moment they start correcting it, so the
                 message never sits under a field they have already fixed. */
              setError(null);
            }}
            placeholder="e.g. hara2"
            spellCheck={false}
            value={username}
          />

          <label htmlFor="pin">PIN</label>
          <input
            aria-describedby={error ? 'sign-in-error' : undefined}
            aria-invalid={error ? 'true' : undefined}
            autoComplete="current-password"
            className="pin"
            id="pin"
            /* `inputMode` brings up the numeric keypad on a phone; `type` stays
               password so the PIN is not readable over a judge's shoulder. */
            inputMode="numeric"
            maxLength={8}
            onChange={(e) => {
              setPin(e.target.value);
              setError(null);
            }}
            placeholder="••••"
            type="password"
            value={pin}
          />

          {shown && (
            <div className={`form-error-slot${error ? '' : ' is-leaving'}`}>
              <p className="form-error" id="sign-in-error" role="alert">
                {shown}
              </p>
            </div>
          )}

          <button className="button button--metal button--full" type="submit">
            Sign in
          </button>
        </form>
      </div>

      <div className="auth-footer">
        {/* The public site's hero line, reused verbatim so the judges' front
            door opens with the same sentence the festival's does. */}
        <p className="auth-footer-note">
          Celebrate Buglasan 2026 and the people, places, and traditions of Negros Oriental.
        </p>

        {/* Same lockup and treatment as the public site's hero credit, so the
            two products attribute PlanOut identically. `noreferrer noopener`
            because it opens in a new tab. */}
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
      </div>

      {/* Rehearsal controls, same component the shell mounts. A dry run starts
          here: every segment seeds DRAFT, so without this a judge signs in and
          finds nothing but closed sheets. Compiled out of production builds,
          see DevBar.tsx. */}
      <DevBar />
    </main>
  );
}
