/**
 * LGU Booth Contest 2026, Freedom Park Architectural Expo
 * Freedom Park Provincial Capitol Grounds, 3–24 October 2026.
 *
 * POINTS mode. Unlike the two pageants, an entry here is a *building* judged
 * by a walkthrough, not a person on a stage: 23 LGU pavilions, judged once,
 * with no cuts and no coronation night. That shape is why this preset has a
 * single scoring phase and an empty `cuts` array, the standing after the
 * walkthrough IS the result.
 *
 * The weights come from the published criteria on the public site
 * (`contestArenas` in the festival repo's `src/data/pageant.ts`), so the
 * percentages judges see here match what the public was told:
 *
 *   Indigenous Architecture & Design  35%
 *   Agri-Tourism & Trade Showcase     30%
 *   Hospitality & Presentation        20%
 *   Public Choice Votes               15%
 *
 * Those percentages are encoded as criterion `maxScore` values summing to 100
 * with `inputMode: 'CRITERIA_SUM'`, so a judge awards points directly out of
 * each criterion's published weight and the sheet totals 100. That is easier
 * to judge under a tent than a 1-10 scale plus a weight table, and it means
 * the number a judge writes is the number that counts.
 *
 * IMPORTANT, Public Choice (15%) is NOT a judge input. It is the online vote
 * tally, which lives on the public site and is owned by the voting API. It is
 * carried here as an `awardOnly` segment fed by the `publicVotes` metric so
 * the 100-point total stays honest and visibly accounts for all four published
 * criteria. Judges never see or score it; the tabulation head enters the final
 * tally once voting closes on 24 October.
 */

import { PageantConfig } from '../types';

export const lguBoothContest2026: PageantConfig = {
  slug: 'lgu-booth-contest-2026',
  name: 'LGU Booth Contest',
  edition: '2026, Freedom Park Architectural Expo',
  scoringMode: 'POINTS',

  segments: [
    {
      key: 'walkthrough',
      name: 'Booth Walkthrough',
      phaseKey: 'JUDGING',
      order: 1,
      // Points out of each criterion's published weight; the sheet sums to 85
      // for the judged portion (the remaining 15 is Public Choice, below).
      inputMode: 'CRITERIA_SUM',
      maxTotal: 85,
      criteria: [
        {
          key: 'architecture',
          name: 'Indigenous Architecture & Design',
          maxScore: 35,
        },
        {
          key: 'trade',
          name: 'Agri-Tourism & Trade Showcase',
          maxScore: 30,
        },
        {
          key: 'hospitality',
          name: 'Hospitality & Presentation',
          maxScore: 20,
        },
      ],
    },
    {
      key: 'public_choice',
      name: 'Public Choice Votes',
      phaseKey: 'JUDGING',
      order: 2,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 15,
      // Not a judge input, the online tally, entered by the tabulation head.
      // Kept in the JUDGING phase so the phase total reaches the published 100.
      awardOnly: true,
      criteria: [
        { key: 'votes', name: 'Verified online votes', maxScore: 15 },
      ],
    },
  ],

  phases: [
    {
      key: 'JUDGING',
      name: 'Booth Judging',
      order: 1,
      segmentKeys: ['walkthrough'],
    },
  ],

  // No cuts. Every booth is judged once and ranked; there is no Top 10 round.
  cuts: [],

  awards: [
    {
      key: 'best_booth',
      name: 'Best LGU Booth',
      source: 'DERIVED',
      fromSegmentKey: 'walkthrough',
    },
    {
      key: 'best_architecture',
      name: 'Best in Indigenous Architecture & Design',
      source: 'DERIVED',
      fromSegmentKey: 'walkthrough',
    },
    {
      key: 'best_trade',
      name: 'Best Agri-Tourism & Trade Showcase',
      source: 'DERIVED',
      fromSegmentKey: 'walkthrough',
    },
    {
      key: 'best_hospitality',
      name: 'Best in Hospitality & Presentation',
      source: 'DERIVED',
      fromSegmentKey: 'walkthrough',
    },
    {
      key: 'peoples_choice_booth',
      name: 'People’s Choice Booth',
      source: 'EXTERNAL',
    },
  ],

  tieBreakers: ['CHAIRMAN_SCORE', 'HIGHEST_RAW_TOTAL', 'CHAIRMAN_DECLARATION'],
};

/** Placements announced for this contest. */
export const lguBoothTitles = [
  'Champion',
  '1st Runner-up',
  '2nd Runner-up',
  '3rd Runner-up',
  '4th Runner-up',
];
