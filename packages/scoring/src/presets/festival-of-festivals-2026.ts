/**
 * Festival of Festivals 2026, Province-Wide Cultural Showdown
 * Dumaguete City streets & Lamberto Macias Sports Complex, 20–21 October 2026.
 *
 * POINTS mode. An entry is a *contingent*, thirty-plus dancers performing
 * once, so like the booth contest there are no cuts: each contingent performs,
 * is scored, and the standing is the result. Unlike the booth contest, the
 * performance happens twice in two different formats, which is why there are
 * two judged segments:
 *
 *   Street Dancing, the parade route, judged on the move
 *   Showdown, the arena field demonstration
 *
 * The published criteria on the public site (`contestArenas` in the festival
 * repo's `src/data/pageant.ts`) are given once, for the programme as a whole:
 *
 *   Choreography & Synchronicity          35%
 *   Cultural Story & Folklore             30%
 *   Costume, Props & Visual Impact        20%
 *   Presentation & Audience Impact        15%
 *
 * Both segments carry that same four-criterion sheet out of 100, and the phase
 * weights them equally. Equal weighting is a DEFAULT, not a published rule,
 * the public criteria table says nothing about street dancing versus showdown.
 * Confirm with the organizers before the dry run; if the showdown is meant to
 * dominate, change `weight` on the two segments below and nothing else.
 */

import { PageantConfig } from '../types';

/** The published criteria, shared by both judged segments. */
const CRITERIA = [
  { key: 'choreography', name: 'Choreography & Synchronicity', maxScore: 35 },
  { key: 'story', name: 'Cultural Story & Folklore', maxScore: 30 },
  { key: 'costume', name: 'Costume, Props & Visual Impact', maxScore: 20 },
  { key: 'presentation', name: 'Presentation & Audience Impact', maxScore: 15 },
];

export const festivalOfFestivals2026: PageantConfig = {
  slug: 'festival-of-festivals-2026',
  name: 'Festival of Festivals',
  edition: '2026, Province-Wide Cultural Showdown',
  scoringMode: 'POINTS',

  segments: [
    {
      key: 'street_dancing',
      name: 'Street Dancing (Parade Route)',
      phaseKey: 'COMPETITION',
      order: 1,
      inputMode: 'CRITERIA_SUM',
      maxTotal: 100,
      // Equal weight with the showdown, a default, not a published rule.
      weight: 1,
      criteria: CRITERIA,
    },
    {
      key: 'showdown',
      name: 'Showdown (Arena Field Demonstration)',
      phaseKey: 'COMPETITION',
      order: 2,
      inputMode: 'CRITERIA_SUM',
      maxTotal: 100,
      weight: 1,
      criteria: CRITERIA,
    },
  ],

  phases: [
    {
      key: 'COMPETITION',
      name: 'Street Dancing & Showdown',
      order: 1,
      segmentKeys: ['street_dancing', 'showdown'],
    },
  ],

  // No cuts. Every contingent performs both segments and is ranked once.
  cuts: [],

  awards: [
    {
      key: 'grand_champion',
      name: 'Grand Champion',
      source: 'DERIVED',
      fromSegmentKey: 'showdown',
    },
    {
      key: 'best_street_dancing',
      name: 'Best in Street Dancing',
      source: 'DERIVED',
      fromSegmentKey: 'street_dancing',
    },
    {
      key: 'best_showdown',
      name: 'Best in Showdown',
      source: 'DERIVED',
      fromSegmentKey: 'showdown',
    },
    {
      key: 'best_costume',
      name: 'Best in Costume & Props',
      source: 'DERIVED',
      fromSegmentKey: 'showdown',
    },
    {
      key: 'best_musicality',
      name: 'Best in Musicality',
      source: 'PANEL',
    },
    {
      key: 'peoples_choice_festival',
      name: 'People’s Choice Contingent',
      source: 'EXTERNAL',
    },
  ],

  tieBreakers: ['CHAIRMAN_SCORE', 'HIGHEST_RAW_TOTAL', 'CHAIRMAN_DECLARATION'],
};

/** Placements announced for this contest. */
export const festivalTitles = [
  'Grand Champion',
  '1st Runner-up',
  '2nd Runner-up',
  '3rd Runner-up',
  '4th Runner-up',
];
