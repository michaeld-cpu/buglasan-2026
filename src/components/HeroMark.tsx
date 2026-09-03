/**
 * The 3D Buglasan wordmark, in gold, above the sign-in card. STATIC, one
 * rendered frame, no animation loop; see the render call below.
 *
 * The model is the festival's hero asset (`buglasan-hero-2026.glb`, the file
 * dropped into `public/assets`). It is the same GLB the public site's hero
 * uses, so the judges' front door opens on the same mark the festival's does.
 *
 * WHY THIS IS LAZY-LOADED, AND WHY THAT IS NOT OPTIONAL HERE:
 *
 * The asset is 8.1MB (a 2.81MB embedded PNG plus 109k triangles) and three.js
 * is ~150KB gzipped on top of a bundle that was 214KB in total. This screen is
 * the first thing a judge hits, on their own phone, on venue wifi, and the
 * thing they need from it is a username and a four-digit PIN. So nothing here
 * is allowed to sit in front of that:
 *
 *   - `three` and the GLTF loader are imported dynamically, after mount, so
 *     they are a separate chunk that never blocks the sign-in form.
 *   - The box holds its space while the model loads, so the header never
 *     collapses or reflows when the mark arrives.
 *   - Any failure, decode error, WebGL unavailable, a `prefers-reduced-data`
 *     preference, a narrow viewport, collapses the slot instead. The 3D mark
 *     is an enhancement and never a requirement.
 *
 * The rest of the public site's hero pipeline is deliberately NOT ported: no
 * post-processing, no bloom, no sparkle layout, no pointer-tracked lighting,
 * no custom shader injection, and no animation at all. Those are marketing
 * chrome, which `styles.css` says outright is not carried into this product.
 * What is kept is the mesh and a material.
 *
 * A glow was tried twice and dropped both times: as CSS radial gradients
 * behind the box (the falloff traced a rectangle, see the note in
 * styles.css) and as an UnrealBloomPass on the rendered frame (it flooded the
 * whole box with flat gold and the wordmark disappeared into it). The mark's
 * light comes from its environment map, key/rim lights and glitter roughness
 * map instead, all of which follow the letterforms because they light the
 * actual mesh.
 */

import { useEffect, useRef, useState } from 'react';
/* Types only, erased at compile time, so this does NOT pull three.js into the
   main bundle. The runtime import is the dynamic one inside the effect. */
import type * as THREE from 'three';

/** Where the GLB lives. Renamed from the dropped filename, which had a space
    and parentheses in it, those survive a dev server but are a needless
    encoding hazard in a production URL. */
const MODEL_SRC = '/assets/buglasan-hero-2026.glb';

/**
 * The mesh we actually want.
 *
 * The GLB carries three meshes and 109k triangles, but two of them are named
 * `OLD_Buglasan_Festival_2026_-_Smooth_Extruded_Logo`, superseded revisions
 * left in the file, together worth ~57k triangles. Rendering all three would
 * nearly double the geometry cost to draw two marks stacked invisibly behind
 * the one we want.
 *
 * Matched by PREFIX and against the sanitised name. GLTFLoader rewrites node
 * names on import (spaces and punctuation become underscores), so the authored
 * `Buglasan Logo 3D` arrives as `Buglasan_Logo_3D`, an exact match on the
 * authored string silently finds nothing, and the `?? gltf.scene` fallback
 * then renders all three meshes. Discarding by the `OLD_` prefix is also more
 * robust than naming the keeper: if the asset is re-exported with a tweaked
 * name, we keep too much rather than dropping the mark entirely.
 */
const DISCARD_PREFIX = 'OLD_';

/**
 * Gold.
 *
 * The GLB's own materials are not gold and not metal, `metallicFactor` is
 * 0.02-0.08 across them, and the rainbow in the source art comes from two sets
 * of baked vertex colours (`COLOR_0`, `COLOR_1`) plus a 2.81MB base-colour
 * texture. So "make it gold" is a material replacement, not a tint: the vertex
 * colours have to stop contributing (`vertexColors: false`) or they multiply
 * the gold back toward the original rainbow and it reads muddy.
 *
 * Values are a standard polished-gold PBR set. `metalness: 1` because gold is
 * a conductor, anything less leaves a diffuse layer that reads as yellow
 * plastic. Roughness is low but not zero: a perfect mirror has nothing to say
 * on a dark screen, and a little roughness is what produces the soft falloff
 * along the letter shoulders.
 */
/**
 * Glitter on the gold.
 *
 * A sparkle map, not particles: a small tiling noise texture wired into the
 * material's `roughnessMap`, so tiny patches of the surface are polished to
 * near-mirror while the rest keeps its brushed finish. Where a polished speck
 * happens to catch the environment or the key light it flares, which is what
 * metallic flake actually is, and it costs one small texture rather than a
 * particle system.
 *
 * Generated procedurally at runtime (no asset to download) and deliberately
 * sparse: at high density the whole face goes glossy and the brushed look
 * that matches the Sign in button is lost.
 */
const GLITTER = {
  /** Texture edge, in px. Small, it tiles, and it is sampled per-fragment. */
  size: 256,
  /** Fraction of texels that become a polished speck. */
  density: 0.045,
  /** Roughness at a speck vs the material's base roughness elsewhere. */
  specRoughness: 0.05,
  /** How many times the map repeats across the mark. */
  repeat: 5,
} as const;

const GOLD = {
  /* 0xe5b147 is `--frame-mid` from styles.css, the base-metal stop of the
     brushed-gold Sign in button, converted from `oklch(0.79 0.135 82)` to
     sRGB. Taking the button's MID stop rather than its highlight is what makes
     the two read as the same alloy: the button's hi/lo stops are the shading
     of a flat gradient, whereas here the lighting and environment produce the
     highlights and shadows, so seeding with a highlight would come out pale.
     If the button's ramp is retuned, re-derive this from `--frame-mid`. */
  color: 0xe5b147,
  metalness: 1,
  /* Slightly rougher than a mirror finish, to match the button's brushed
     face rather than reading as polished bullion beside it. */
  roughness: 0.32,
  envMapIntensity: 1.4,
} as const;

/**
 * `loading` reserves the box, `live` shows the mark, `failed` collapses it.
 *
 * Three states, not two, and the distinction is load-bearing: an earlier
 * version collapsed the box whenever the phase was not `live`, which
 * deadlocked. The box started at `height: 0`, the effect measures
 * `mount.clientHeight` to size the renderer, a zero height bailed out before
 * `setPhase('live')` could run, so the mark never appeared at all. The box
 * must hold its space while loading and collapse only on a real failure.
 */
type Phase = 'loading' | 'live' | 'failed';

export function HeroMark() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    /* Bail before loading anything on the conditions where the 3D mark is the
       wrong call: a data-saver preference, or a viewport too narrow for the
       mark to be more than decoration behind a form. Either leaves the static
       logo up.

       No `prefers-reduced-motion` check any more, the mark is a single static
       frame, so there is no motion to reduce. */
    const reduceData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
    if (reduceData || window.innerWidth < 600) {
      setPhase('failed');
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        /* Dynamic, and both in one `Promise.all` so the two requests overlap
           rather than serialise. This is the whole reason the sign-in form is
           interactive while an 8MB asset is still in flight. */
        const [THREE, { GLTFLoader }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
        ]);
        if (disposed) return;

        const width = mount.clientWidth;
        const height = mount.clientHeight;
        if (width < 1 || height < 1) {
          setPhase('failed');
          return;
        }

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
        /* Capped at 2. This is a decorative canvas; a 3x buffer on a phone
           costs 9x the fragments for no visible gain, the same reasoning the
           backdrop canvas already applies to itself. */
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
        camera.position.set(0, 0, 30);

        /* Gold needs something to reflect or it renders as flat brown, this
           is the single most important part of the material looking like
           metal. `RoomEnvironment` is three's built-in studio: a box of
           emissive panels, generated on the GPU into a PMREM cubemap once, no
           HDR file to download. */
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        if (disposed) {
          renderer.dispose();
          return;
        }
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
        scene.environment = envRT.texture;
        pmrem.dispose();

        /* A warm key and a cool rim. The environment does most of the work;
           these two just put a definite highlight on the top bevel and separate
           the mark's silhouette from a near-black page. */
        const key = new THREE.DirectionalLight(0xfff0d0, 2.6);
        key.position.set(-4, 5, 8);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4);
        rim.position.set(5, -2, -6);
        scene.add(rim);

        const gltf = await new GLTFLoader().loadAsync(MODEL_SRC);
        if (disposed) {
          renderer.dispose();
          envRT.dispose();
          return;
        }

        /* Drop the superseded `OLD_` revisions, keep whatever remains. */
        for (const child of [...gltf.scene.children]) {
          if (child.name.startsWith(DISCARD_PREFIX)) {
            gltf.scene.remove(child);
            child.traverse((node) => {
              const mesh = node as THREE.Mesh;
              if (mesh.isMesh) mesh.geometry?.dispose();
            });
          }
        }
        const mark = gltf.scene;

        /* Build the sparkle map. One channel is enough, three reads
           roughness from green, and `DataTexture` skips any image decode. */
        const px = GLITTER.size * GLITTER.size;
        const data = new Uint8Array(px * 4);
        const base = Math.round(GOLD.roughness * 255);
        const spec = Math.round(GLITTER.specRoughness * 255);
        for (let i = 0; i < px; i++) {
          /* Deterministic hash rather than Math.random, so the flake pattern
             is identical on every load and cannot shimmer differently between
             a refresh and a resize re-render. */
          const h = Math.sin(i * 12.9898) * 43758.5453;
          const r = h - Math.floor(h);
          const v = r < GLITTER.density ? spec : base;
          data[i * 4] = v;
          data[i * 4 + 1] = v;
          data[i * 4 + 2] = v;
          data[i * 4 + 3] = 255;
        }
        const glitter = new THREE.DataTexture(data, GLITTER.size, GLITTER.size);
        glitter.wrapS = THREE.RepeatWrapping;
        glitter.wrapT = THREE.RepeatWrapping;
        glitter.repeat.set(GLITTER.repeat, GLITTER.repeat);
        /* Nearest, not linear: interpolating between a speck and its brushed
           neighbours smears each flake into a soft blob and the sparkle is
           lost. */
        glitter.magFilter = THREE.NearestFilter;
        glitter.minFilter = THREE.NearestFilter;
        glitter.needsUpdate = true;

        const gold = new THREE.MeshStandardMaterial({
          roughnessMap: glitter,
          color: new THREE.Color(GOLD.color),
          metalness: GOLD.metalness,
          roughness: GOLD.roughness,
          envMapIntensity: GOLD.envMapIntensity,
          /* Off, deliberately: the baked rainbow vertex colours would multiply
             against the gold and pull it back toward the source art. */
          vertexColors: false,
        });

        const originals: THREE.Material[] = [];
        mark.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          const prev = mesh.material;
          if (Array.isArray(prev)) originals.push(...prev);
          else if (prev) originals.push(prev);
          mesh.material = gold;
        });

        /* Squared to the viewer on Y, with only a slight tilt on X.
           
           The Y rotation is 0 deliberately. At -0.085 rad the mark read as
           off-centre, and the cause is perspective, not layout: turning the
           face away from the camera projects the near half wider than the far
           half, so a horizontally centred mesh no longer *looks* centred.
           Measured, that yaw skewed the two halves by 0.032 in NDC (left
           extent 0.451 vs right 0.483); at yaw 0 the skew is 0.0018, i.e.
           symmetric to within a rounding error.

           The small positive X tilt stays. It costs no horizontal symmetry,
           it rakes the face fractionally back, which keeps a highlight
           travelling along the top bevels so the letters still read as
           extruded metal rather than a flat gold cut-out.

           Applied BEFORE the mark is measured: rotating grows the
           silhouette's projected height, so measuring first and tilting
           afterwards clips the letters top and bottom (measured 105% of frame
           height when done in that order). */
        mark.rotation.y = 0;
        mark.rotation.x = 0.03;
        mark.updateMatrixWorld(true);

        /* Frame the mark: centre it on the origin and pull the camera back to
           fit its measured width, so the layout does not depend on how the
           asset happens to be authored. The model's own node sits at y≈6.99,
           which would otherwise render it off the top of the canvas. */
        const box = new THREE.Box3().setFromObject(mark);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        mark.position.sub(centre);

        /* Fit BOTH axes and take the binding one, so the mark is never
           cropped: `fitH` is the distance at which its width fills the frame,
           `fitV` the distance for its height. The mark is ~1.8:1, so in this
           box height binds and it sits centred with air either side.

           The 1.1 margin is measured, not guessed: at 1.04 the tilted
           silhouette projected to 105% of the frame height and clipped the
           letters top and bottom at every clamped box size. */
        const halfFov = Math.tan((camera.fov * Math.PI) / 360);
        const fitH = size.x / (2 * halfFov * camera.aspect);
        const fitV = size.y / (2 * halfFov);
        camera.position.z = Math.max(fitH, fitV) * 1.1;
        camera.lookAt(0, 0, 0);

        scene.add(gltf.scene);

        mount.appendChild(renderer.domElement);
        setPhase('live');

        /* STATIC. One frame, no animation loop, no `requestAnimationFrame`.
           
           A fixed slight tilt is baked into the mesh above instead of
           animated, so the gold still catches the key light across the letter
           bevels, that shading is what makes it read as metal rather than a
           flat gold cut-out, but nothing on this screen moves. That matters
           beyond taste here: this is the first screen a judge sees, and the
           rest of the app deliberately avoids motion that could be mistaken
           for a loading state. It also means the GPU goes idle immediately
           after the mark appears rather than holding a render loop open for
           as long as the sign-in screen is up.

           A resize re-renders once (see `onResize`); otherwise this is the
           only draw call the component ever makes. The tilt itself is applied
           further up, before the camera fit. */
        renderer.render(scene, camera);

        const onResize = () => {
          const w = mount.clientWidth;
          const h = mount.clientHeight;
          if (w < 1 || h < 1) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
          /* Unconditional: with no animation loop running, a resize would
             otherwise leave a stretched or stale buffer on screen. */
          renderer.render(scene, camera);
        };
        window.addEventListener('resize', onResize);

        cleanup = () => {
          window.removeEventListener('resize', onResize);
          renderer.domElement.remove();
          /* Explicit teardown. WebGL contexts and GPU buffers are not
             collected on unmount, and this component lives on a screen the
             judge leaves as soon as they sign in. */
          scene.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.isMesh) mesh.geometry?.dispose();
          });
          for (const m of originals) m.dispose();
          gold.dispose();
          glitter.dispose();
          envRT.dispose();
          renderer.dispose();
        };
      } catch {
        /* No WebGL, a decode failure, a blocked asset. Nothing to report and
           nothing a judge can act on, collapse the slot so the layout closes
           up cleanly rather than holding space for a mark that will not
           arrive. */
        if (!disposed) setPhase('failed');
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="hero-mark" data-phase={phase}>
      {/* NO placeholder image.
       *
       * This used to show `buglasan-festival-2026-logo.webp`, the full-colour
       * rainbow logo, until the first 3D frame was drawn. On a fast
       * connection that was invisible, but on a slow one (or any refresh
       * before the 8MB GLB is cached) the judge watched the colourful mark sit
       * there and then swap to gold. Two different marks in the same slot
       * reads as a bug, and it was one.
       *
       * The element keeps its reserved box either way (the `aspect-ratio` on
       * `.hero-mark`), so the header does not reflow when the model arrives,
       * the space is simply empty until the gold mark can be shown as gold.
       * If the model never loads, `data-phase` becomes `failed` and the slot
       * collapses; see the `[data-phase='failed']` rule in styles.css. That
       * is the correct failure: no mark at all, rather than the wrong mark.
       *
       * A pre-rendered gold still would be better than an empty box, but it
       * has to be rendered FROM this model to match it 1:1, a hand-made
       * approximation is the same mismatch in a different costume. That needs
       * a GPU rasteriser this environment does not have, so it is left as a
       * follow-up rather than faked. */}
      <div aria-hidden="true" className="hero-mark__canvas" ref={mountRef} />
    </div>
  );
}
