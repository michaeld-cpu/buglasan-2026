/**
 * Sign-in backdrop, static light shafts, animated fireworks.
 *
 * Two layers with deliberately different costs:
 *
 *   Shafts     STATIC. Painted once into an offscreen canvas and blitted with
 *              one `drawImage` per frame.
 *   Fireworks  ANIMATED. The repo's shell envelope, played through in real
 *              time, shells rise, detonate, droop and cool.
 *   Skyline    STATIC, CSS. The Dumaguete silhouette across the bottom edge,
 *              full-bleed. One background image, no canvas involvement.
 *
 * The shafts used to animate too: the public site's `crownShafts()` fan warped
 * by drifting `fbm` noise, for the underwater caustic movement. It looked
 * right and cost too much, ~80 gradient fills through a canvas
 * `filter: blur()` every frame, which is the most expensive thing on this
 * screen and a bad trade on the phones the panel actually runs on. Caching it
 * to a bitmap keeps the look for free. A dedicated open-source ray effect is
 * expected to replace this layer later; what it needs to keep is
 * `aria-hidden` and `pointer-events: none` on the wrapper, sign-in only (the
 * score sheets stay still), and a `prefers-reduced-motion` path.
 *
 * The shells are a faithful port of `fireworksFragmentShader` in the
 * buglasan-2026 repo: the same 7 positions, colours and seeds, the same
 * 11s/3.4s/6.6s envelope, gravity droop, ember cooling and 34/17-ray double
 * crown. Dropped from the port: per-pixel `fbm` haze, the star field and
 * pointer parallax, texture rather than structure.
 *
 * Decorative only: `aria-hidden`, `pointer-events: none`, behind the card, and
 * on the sign-in screen alone.
 */

import { useEffect, useRef } from 'react';

/**
 * The instant used for the single reduced-motion frame, in shader seconds.
 *
 * Chosen so several shells are mid-bloom at once and one is still rising: at
 * t=0 the sky is empty, and late in the cycle everything is a faint ember.
 */
const FROZEN_AT = 5.6;

/* Envelope constants, from fireworksFragmentShader. */
const CYCLE = 11.0;
const RISE = 3.4;
const BLOOM = 6.6;

/**
 * The seven shells, verbatim from the shader's `main()`.
 *
 * `[x, y]` are in the shader's space: `p = (vUv - 0.5) * (2.4, 2.0)`, so x
 * spans ±1.2 and y ±1.0 with +y up. Colours are linear-light RGB.
 */
const SHELLS: Array<{
  center: [number, number];
  start: number;
  color: [number, number, number];
  seed: number;
}> = [
  { center: [-0.62, 0.52], start: 0.0, color: [1.0, 0.78, 0.22], seed: 1.1 }, // gold
  { center: [0.65, 0.58], start: 3.2, color: [0.22, 0.78, 1.0], seed: 2.3 }, // azure
  { center: [-0.75, 0.08], start: 6.4, color: [1.0, 0.28, 0.65], seed: 3.7 }, // rose
  { center: [0.72, -0.04], start: 9.0, color: [0.25, 0.95, 0.55], seed: 4.9 }, // emerald
  { center: [-0.48, -0.45], start: 4.8, color: [1.0, 0.52, 0.18], seed: 5.5 }, // coral
  { center: [0.5, -0.42], start: 8.0, color: [0.68, 0.45, 1.0], seed: 6.8 }, // violet
  { center: [0.02, 0.72], start: 1.6, color: [1.0, 0.92, 0.6], seed: 7.4 }, // white-gold
];

/** `hash12` from the shader's noise block, same constants, same output. */
function hash12(x: number, y: number): number {
  const px = x * 0.1031;
  const py = y * 0.103;
  let fx = px - Math.floor(px);
  let fy = py - Math.floor(py);
  const pz = fx * 0.0973;
  const fz = pz - Math.floor(pz);
  const dot = fx * (fy + 33.33) + fy * (fz + 33.33) + fz * (fx + 33.33);
  fx += dot;
  fy += dot;
  const v = (fx + fy) * fz;
  return v - Math.floor(v);
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Linear-light 0..1 → an `rgba()` string. */
function rgb(c: [number, number, number], alpha: number): string {
  /* Several call sites build colours above 1.0 the way the shader does (the
     detonation flash is `color * 0.7 + 0.55`). Clipping each channel at 1
     independently turns those flat white and throws the shell's hue away,
     it showed up as a hard white ring. Normalising by the largest channel
     keeps the hue and lets alpha carry the brightness. */
  let [r, g, b] = c;
  const peak = Math.max(r, g, b, 1);
  r /= peak;
  g /= peak;
  b /= peak;
  const enc = (v: number) => Math.round(Math.min(255, Math.max(0, Math.sqrt(Math.max(0, v)) * 255)));
  return `rgba(${enc(r)}, ${enc(g)}, ${enc(b)}, ${Math.min(0.94, Math.max(0, alpha))})`;
}

/**
 * `fireworks` is opt-OUT, and the judge screens opt out.
 *
 * The rays and the skyline are static, so they cost one `drawImage` per
 * resize and nothing per frame, they are safe to put behind anything. The
 * shells are not: they are a real animation loop, and this app's own guidance
 * is that a score sheet must show no motion a judge could mistake for a
 * loading state, let alone coloured lights travelling over the numbers they
 * are entering. So `Shell` renders `<AuthBackdrop fireworks={false} />` and
 * gets the light without the show.
 *
 * With `fireworks: false` the component never starts a `requestAnimationFrame`
 * loop at all, it composes one frame and stops.
 */
export function AuthBackdrop({ fireworks = true }: { fireworks?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const setup = () => {
      /* Capped at 1.5. This is a decorative full-screen canvas; painting it
         at 3x on a phone costs 4x the fill for no visible gain. */
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /**
     * Shader space → canvas pixels.
     *
     * `spread` pushes the shells outward as the viewport narrows: the layout
     * is authored for the public site's landscape stage, and mapped literally
     * almost every burst detonated behind the sign-in card on a phone. There
     * is a floor to this, at 320x700 the card is 288x660 with 8-32px of
     * margin, so most of the burst area is hidden whatever we do, and the
     * card rightly wins.
     */
    const spread = () => {
      const aspect = width / Math.max(1, height);
      return 1 + smoothstep(1.3, 0.5, aspect) * 0.5;
    };

    const toX = (x: number) => (Math.max(-1.16, Math.min(1.16, x * spread())) / 2.4 + 0.5) * width;
    const toY = (y: number) => (0.5 - y / 2.0) * height;

    /** One shader unit of radius, in pixels. `min` so a burst is never wider
        than a tall phone's screen. */
    const scale = () => Math.min(width / 2.4, height / 2.0);

    // ---------------------------------------------------------------
    // Static light shafts
    // ---------------------------------------------------------------

    /**
     * A soft fan of shafts raking down over the card.
     *
     * Called once per resize into the cached bitmap, never per frame.
     *
     * Each beam is a stack of thin slices weighted by a `sin²` bell across
     * its width, so it has a bright core falling to nothing at both edges.
     * A single flat-filled wedge per beam left hard straight boundaries, and
     * with additive blending the neighbours summed into a visible slab.
     */
    const drawShafts = (g: CanvasRenderingContext2D) => {
      const cx = width * 0.5;
      // Above the top edge, so light rakes down across the card rather than
      // radiating from behind it.
      const cy = -height * 0.18;
      const R = Math.hypot(width, height) * 1.25;

      const BEAMS = 11;
      const CONE = Math.PI * 0.86;
      const A0 = Math.PI / 2 - CONE / 2;

      g.save();
      g.globalCompositeOperation = 'lighter';
      // One blur for the whole layer, set once, not per beam.
      g.filter = 'blur(12px)';

      for (let i = 0; i < BEAMS; i++) {
        const f = (i + 0.5) / BEAMS;
        const a = A0 + f * CONE;

        /* The source's angular fan at t=0, with a floor so no beam vanishes
           entirely. Evaluated once, not per frame, the drifting version of
           this is what got cut. */
        let s = Math.sin(a * 9.0) * 0.5 + 0.5;
        s *= Math.sin(a * 5.0) * 0.5 + 0.5;
        s = 0.3 + 0.7 * Math.pow(s, 1.5);

        // A fixed per-beam offset stands in for the noise warp, so the fan is
        // irregular rather than mechanically even.
        const jitter = (hash12(i * 3.1, 7.0) - 0.5) * 0.16;

        const halfW = (CONE / BEAMS) * 1.15;
        const e0 = a - halfW + jitter;
        const e1 = a + halfW + jitter;

        const SLICES = 7;
        for (let k = 0; k < SLICES; k++) {
          const u = (k + 0.5) / SLICES;
          const bell = Math.pow(Math.sin(u * Math.PI), 1.6);
          const w = s * bell;
          if (w < 0.006) continue;

          const sa0 = e0 + (e1 - e0) * (k / SLICES);
          const sa1 = e0 + (e1 - e0) * ((k + 1) / SLICES);

          /* Cool blue-white. The ground is green, so emerald beams were
             invisible against it, the shafts have to be the cool thing in
             the frame to register at all. */
          const grad = g.createLinearGradient(cx, cy, cx, cy + R);
          grad.addColorStop(0, `rgba(224, 234, 255, 0)`);
          grad.addColorStop(0.07, `rgba(218, 230, 255, ${0.062 * w})`);
          grad.addColorStop(0.32, `rgba(202, 218, 250, ${0.042 * w})`);
          grad.addColorStop(0.62, `rgba(214, 214, 206, ${0.017 * w})`);
          grad.addColorStop(1, `rgba(190, 205, 210, 0)`);

          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(sa0) * R, cy + Math.sin(sa0) * R);
          g.lineTo(cx + Math.cos(sa1) * R, cy + Math.sin(sa1) * R);
          g.closePath();
          g.fillStyle = grad;
          g.fill();
        }
      }

      g.filter = 'none';
      g.restore();
    };

    // ---------------------------------------------------------------
    // One shell, shell() from fireworksFragmentShader, at a fixed t
    // ---------------------------------------------------------------

    const drawShell = (
      now: number,
      center: [number, number],
      startTime: number,
      color: [number, number, number],
      seed: number) => {
      const t = (((now - startTime) % CYCLE) + CYCLE) % CYCLE;
      if (t > RISE + BLOOM) return;

      const life = smoothstep(RISE + BLOOM, RISE + BLOOM - 0.9, t);
      const startX = center[0] + Math.sin(seed * 7.7) * 0.12;
      const S = scale();

      if (t < RISE) {
        // --- ascent: a rocket climbing from below the sea line ---
        const launch = t / RISE;
        const e = Math.pow(launch, 0.72);
        const rx = mix(startX, center[0], e);
        const ry = mix(-1.22, center[1], e);
        const fadeIn = smoothstep(0.0, 0.18, t);

        const px = toX(rx);
        const py = toY(ry);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // A short sparking streak behind the head, not a line to the frame
        // edge, the shader windows the trail to about half a unit.
        const tailLen = S * 0.26;
        const flicker = 0.62 + 0.38 * Math.sin(ry * 58.0 - now * 13.0 + seed * 10.0);
        const tail = ctx.createLinearGradient(px, py, px, py + tailLen);
        tail.addColorStop(0, rgb([1.0, 0.88, 0.5], 0.44 * fadeIn * life * flicker));
        tail.addColorStop(0.45, rgb(color, 0.16 * fadeIn * life * flicker));
        tail.addColorStop(1, rgb(color, 0));
        ctx.strokeStyle = tail;
        ctx.lineWidth = S * 0.009;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + tailLen);
        ctx.stroke();

        const head = ctx.createRadialGradient(px, py, 0, px, py, S * 0.026);
        head.addColorStop(0, rgb([1.0, 0.94, 0.68], 0.9 * fadeIn * life));
        head.addColorStop(0.35, rgb([color[0] + 0.3, color[1] + 0.25, color[2] + 0.1], 0.4 * fadeIn * life));
        head.addColorStop(1, rgb(color, 0));
        ctx.fillStyle = head;
        ctx.beginPath();
        ctx.arc(px, py, S * 0.026, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      // --- bloom ---
      const bt = t - RISE;
      const progress = bt / BLOOM;
      const fade = smoothstep(1.0, 0.1, progress);

      // Gravity droop: the shader adds progress² * 0.135 to d.y.
      const droop = progress * progress * 0.135;
      const cx = toX(center[0]);
      const cy = toY(center[1] - droop);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Detonation flash, tight and short; a wide soft disc reads as a lens
      // smudge rather than an explosion.
      const flash = Math.exp(-bt * 7.5) * 0.3;
      if (flash > 0.002) {
        const fr = S * 0.2;
        const hot: [number, number, number] = [
          color[0] * 0.7 + 0.55,
          color[1] * 0.7 + 0.48,
          color[2] * 0.7 + 0.3,
        ];
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
        fg.addColorStop(0, rgb(hot, flash * 2.6 * life));
        fg.addColorStop(0.35, rgb(hot, flash * 1.1 * life));
        fg.addColorStop(0.7, rgb(color, flash * 0.3 * life));
        fg.addColorStop(1, rgb(color, 0));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy, fr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Two nested crowns: a wide outer shell of 34 rays and a tighter inner
      // pistil of 17, the shader's SHELL_LAYERS loop.
      for (let layer = 0; layer < 2; layer++) {
        const rays = layer === 0 ? 34 : 17;
        const step = (Math.PI * 2) / rays;

        for (let index = 0; index < rays; index++) {
          const snapped = index * step;
          const rs = hash12(index, seed + layer * 5.1);

          const v0 = (layer === 0 ? 0.36 : 0.2) + rs * (layer === 0 ? 0.17 : 0.07);
          const radius = v0 * (1.0 - Math.exp(-bt * 0.58));

          const sx = cx + Math.cos(snapped) * radius * S;
          const sy = cy - Math.sin(snapped) * radius * S;

          const twinkle = 0.7 + 0.3 * Math.sin(bt * 9.0 + rs * 25.0);

          // Streamers cool from their own hue toward ember as they fall.
          const k = smoothstep(0.25, 1.0, progress) * 0.7;
          const ember: [number, number, number] = [
            mix(color[0], 1.0, k),
            mix(color[1], 0.46, k),
            mix(color[2], 0.13, k),
          ];

          const a = fade * twinkle * life * (layer === 0 ? 0.6 : 0.42);
          if (a < 0.004) continue;

          /* The shader's `streak` term, a smear along the ray. Without it
             each spark is an isolated dot and the burst reads as a ring of
             pips rather than a crown of streamers. */
          const tailLen = radius * S * 0.42;
          const ix = cx + Math.cos(snapped) * (radius * S - tailLen);
          const iy = cy - Math.sin(snapped) * (radius * S - tailLen);
          const sg = ctx.createLinearGradient(ix, iy, sx, sy);
          sg.addColorStop(0, rgb(ember, 0));
          sg.addColorStop(1, rgb(ember, a * 0.5));
          ctx.strokeStyle = sg;
          ctx.lineWidth = S * (layer === 0 ? 0.0075 : 0.006);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(sx, sy);
          ctx.stroke();

          const pr = S * (layer === 0 ? 0.016 : 0.012);
          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr);
          g.addColorStop(0, rgb(ember, a));
          g.addColorStop(0.4, rgb(ember, a * 0.4));
          g.addColorStop(1, rgb(ember, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(sx, sy, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    /**
     * The shafts are painted ONCE into an offscreen canvas and blitted every
     * frame, rather than redrawn.
     *
     * This is what makes the two layers cost what they should. The shafts were
     * the expensive half: ~80 gradient fills through a canvas `filter:
     * blur()`, which is the single most costly operation here. Rendering them
     * to a bitmap turns that into one `drawImage` per frame, effectively
     * free, while the fireworks keep animating on top.
     */
    let shaftLayer: HTMLCanvasElement | null = null;

    const buildShaftLayer = () => {
      const layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const lctx = layer.getContext('2d');
      if (!lctx) return null;

      const dpr = canvas.width / Math.max(1, width);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawShafts(lctx);
      return layer;
    };

    let raf = 0;
    const start = performance.now();

    const frame = (elapsed: number) => {
      ctx.clearRect(0, 0, width, height);

      // The static shaft bitmap, drawn in CSS pixels over the whole canvas.
      if (shaftLayer) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(shaftLayer, 0, 0);
        ctx.restore();
      }

      if (!fireworks) return;

      /* Shells at reduced opacity so the light is the ground and the
         fireworks read as punctuation over it. */
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (const s of SHELLS) drawShell(elapsed, s.center, s.start, s.color, s.seed);
      ctx.restore();
    };

    const loop = (nowMs: number) => {
      frame((nowMs - start) / 1000);
      raf = window.requestAnimationFrame(loop);
    };

    /* Honour the OS setting, and keep honouring it if it changes mid-session.
       Reduced motion still gets a composed frame rather than a blank panel. */
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const begin = () => {
      window.cancelAnimationFrame(raf);
      setup();
      shaftLayer = buildShaftLayer();

      /* No shells means nothing changes over time, so draw once and leave the
         GPU alone, the same reason reduced motion takes this path. */
      if (!fireworks || motion.matches) {
        // One frame, at an instant where several shells are mid-bloom.
        frame(FROZEN_AT);
        return;
      }
      raf = window.requestAnimationFrame(loop);
    };

    begin();

    /* Rebuild on resize: the canvas is sized in device pixels, so a rotation
       or a window drag would otherwise stretch the cached shaft bitmap.
       Debounced, because a drag fires this continuously and rebuilding the
       layer is the one expensive operation left. */
    let debounce = 0;
    const onResize = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(begin, 150);
    };
    window.addEventListener('resize', onResize);
    motion.addEventListener('change', begin);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(debounce);
      window.removeEventListener('resize', onResize);
      motion.removeEventListener('change', begin);
    };
  }, [fireworks]);

  return (
    <div aria-hidden="true" className="auth-backdrop">
      <canvas className="auth-backdrop__canvas" ref={canvasRef} />
      {/* Grounds the shafts so the light appears to come from above a stage
          rather than floating mid-viewport. */}
      <div className="auth-horizon" />
      {/* Dumaguete skyline, full-bleed along the bottom edge. Decorative, so
          it lives inside this already-`aria-hidden` wrapper rather than in the
          page markup. */}
      <div className="auth-skyline" />
    </div>
  );
}
