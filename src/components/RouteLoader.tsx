/**
 * The fallback shown while a lazily-loaded route chunk arrives.
 *
 * Every route in `App.tsx` is code-split, so this is what a judge sees in the
 * gap between tapping a segment and its screen being parsed. On a warm cache
 * that gap is a frame or two; on venue wifi with a cold cache it is long
 * enough that showing nothing would read as a dead tap.
 *
 * Two decisions worth keeping:
 *
 *   1. It is DELAYED. Rendering a spinner immediately means a fast navigation
 *      produces a flash of spinner, which looks more broken than a brief
 *      pause. Nothing paints for `SPINNER_DELAY_MS`; below that threshold the
 *      screen simply stays as it was.
 *   2. It is only a spinner. No text, no progress bar (there is no honest
 *      percentage to show for a script fetch) and no "please wait", the
 *      guidance in styles.css is that this panel must never show motion a
 *      judge could mistake for a broken state, so the one thing on screen is
 *      small, slow and obviously a spinner. The accessible name moves to
 *      `aria-label` so nothing is lost for a screen reader.
 *
 * The gold is `--frame-mid`, the same token the Sign in button's base metal
 * uses, so the loader belongs to the same product as the thing it precedes.
 */

import { useEffect, useState } from 'react';

/**
 * How long to wait before showing anything.
 *
 * 180ms is under the ~200ms at which a delay starts to feel like a response
 * rather than an instant reaction, so a cache-warm navigation never flashes.
 */
const SPINNER_DELAY_MS = 180;

export function RouteLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  /* `role="status"` rather than `alert`: this is a polite progress
     announcement, not something that should interrupt a screen reader
     mid-sentence. `aria-busy` marks the region as still filling in.
     
     The visible "Loading" text is gone, the spinner carries the meaning on
     its own, so `aria-label` supplies the name a screen reader would
     otherwise have read from it. Without that the status region announces as
     an empty container. */
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="route-loader"
      data-visible={visible}
      role="status"
    >
      <span aria-hidden="true" className="route-loader__spinner" />
    </div>
  );
}
