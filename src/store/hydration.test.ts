/**
 * Hydrating a stored roster over a newer seed.
 *
 * The state merge in `load()` is shallow, so a `candidates` array saved by an
 * earlier build replaced the freshly-seeded one outright and kept that build's
 * shape forever. Adding `photo` to the seed then had no effect on any device
 * that had already opened the app, the portraits were seeded and immediately
 * discarded.
 *
 * These tests need localStorage to be populated BEFORE the store module first
 * loads, hence `vi.resetModules()`, the module caches state in a module-level
 * `Map` on first read, so importing it once per scenario is the only way to
 * exercise the hydration path.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

const SLUG = 'hara-negros-oriental-2026';

describe('roster hydration', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  /* The reported bug: "I only see numbers still". */
  it('re-applies seeded photos over a roster saved without them', async () => {
    const a = await import('./store');
    const old = a.getState(SLUG).candidates.map((c: any) => {
      const { photo, ...rest } = c; return rest;
    });
    expect(old.every((c: any) => c.photo === undefined)).toBe(true);
    localStorage.setItem(`judges:v1:${SLUG}`, JSON.stringify({ candidates: old }));

    vi.resetModules();
    const b = await import('./store');
    const c = b.getState(SLUG).candidates as any[];
    console.log('with photo:', c.filter((x) => x.photo).length, '/', c.length);
    expect(c.every((x) => x.photo === '/assets/candidate-03.webp')).toBe(true);
  });

  /* The other half of the contract: refreshing presentation must not revert
     data an admin owns. */
  it('keeps stored name and status while refreshing the photo', async () => {
    const a = await import('./store');
    const rows = a.getState(SLUG).candidates.map((c: any, i: number) =>
      i === 0 ? { ...c, name: 'Renamed Person', status: 'WITHDRAWN', photo: undefined } : c);
    localStorage.setItem(`judges:v1:${SLUG}`, JSON.stringify({ candidates: rows }));

    vi.resetModules();
    const b = await import('./store');
    const first = (b.getState(SLUG).candidates as any[])[0];
    console.log('edited row ->', first.name, '|', first.status, '| photo', first.photo);
    expect(first.name).toBe('Renamed Person');
    expect(first.status).toBe('WITHDRAWN');
    expect(first.photo).toBe('/assets/candidate-03.webp');
  });
});
