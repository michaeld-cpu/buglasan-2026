/**
 * Gandang NegOrense 2026, "Queensize Edition"
 * Grand Competition: 8:00 PM, Sunday, 18 October 2026, L.L. Macias Sports and Cultural Center
 *
 * POINTS mode. Official criteria total exactly 100 points (rulebook §5).
 *
 * Segment `weight` is deliberately set equal to `maxTotal`. The phase aggregator
 * takes a weighted mean of normalized (0-100) segment scores, so weighting by
 * max points makes the PRELIM phase score come out as the literal 0-100 point
 * total from the rulebook table. Do not "tidy" these weights to 1.
 */

import { PageantConfig } from '../types';

export const gandangNegOrense2026: PageantConfig = {
  slug: 'gandang-negorense-2026',
  name: 'Gandang NegOrense',
  edition: '2026, Queensize Edition',
  scoringMode: 'POINTS',

  segments: [
    // --- The 100-point official criteria (rulebook §5) ---
    {
      key: 'beauty_closed',
      name: 'Beauty of Face, Closed-Door',
      phaseKey: 'PRELIM',
      order: 1,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 10,
      weight: 10,
      criteria: [{ key: 'beauty', name: 'Beauty of Face', maxScore: 10 }],
    },
    {
      key: 'beauty_stage',
      name: 'Beauty of Face, Stage Final',
      phaseKey: 'PRELIM',
      order: 2,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 10,
      weight: 10,
      criteria: [{ key: 'beauty', name: 'Beauty of Face', maxScore: 10 }],
    },
    {
      key: 'filipiniana',
      name: 'Visayan Filipiniana Costume',
      phaseKey: 'PRELIM',
      order: 3,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 10,
      weight: 10,
      criteria: [{ key: 'costume', name: 'Costume & Presentation', maxScore: 10 }],
    },
    {
      key: 'talent',
      name: 'Talent Competition',
      phaseKey: 'PRELIM',
      order: 4,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 15,
      weight: 15,
      criteria: [{ key: 'talent', name: 'Talent (Disney Princess theme, max 2:00)', maxScore: 15 }],
    },
    {
      key: 'interview',
      name: 'One-on-One Interview',
      phaseKey: 'PRELIM',
      order: 5,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 15,
      weight: 15,
      criteria: [{ key: 'interview', name: 'Interview', maxScore: 15 }],
    },
    {
      key: 'gown',
      name: 'Evening Gown',
      phaseKey: 'PRELIM',
      order: 6,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 15,
      weight: 15,
      criteria: [{ key: 'gown', name: 'Evening Gown (Aqua Blue & Gold AB)', maxScore: 15 }],
    },
    {
      key: 'swimsuit',
      name: 'Swimsuit Competition (Plus Size Figure)',
      phaseKey: 'PRELIM',
      order: 7,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 15,
      weight: 15,
      criteria: [{ key: 'figure', name: 'Plus Size Figure', maxScore: 15 }],
    },
    {
      key: 'professionalism',
      name: 'Professionalism',
      phaseKey: 'PRELIM',
      order: 8,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: 10,
      weight: 10,
      criteria: [{ key: 'professionalism', name: 'Professionalism', maxScore: 10 }],
    },

    // --- Top 8 interview (rulebook §4, Phase IV) ---
    {
      key: 'top8_interview',
      name: 'Top 8 Interview',
      phaseKey: 'TOP8_INTERVIEW',
      order: 9,
      inputMode: 'CRITERIA_SUM',
      maxTotal: 100,
      weight: 100,
      requiresCut: 'TOP_8',
      criteria: [
        { key: 'content', name: 'Wit & Content', maxScore: 40 },
        { key: 'delivery', name: 'Projection & Delivery', maxScore: 30 },
        { key: 'presence', name: 'Stage Presence', maxScore: 30 },
      ],
    },

    // --- Final Q&A: one standardized question from the Chairman ---
    {
      key: 'final_qa',
      name: 'Final Question & Answer',
      phaseKey: 'FINAL_QA',
      order: 10,
      inputMode: 'CRITERIA_SUM',
      maxTotal: 100,
      weight: 100,
      requiresCut: 'TOP_5',
      criteria: [
        { key: 'content', name: 'Wit & Content', maxScore: 50 },
        { key: 'delivery', name: 'Projection & Delivery', maxScore: 50 },
      ],
    },

    // --- Award-only: Tourism Gastronomy (Mukbang) video, 70% judges / 30% social ---
    {
      key: 'tourism_video',
      name: 'Tourism Gastronomy (Mukbang) Video',
      phaseKey: 'AWARDS',
      order: 11,
      inputMode: 'CRITERIA_SUM',
      maxTotal: 100,
      awardOnly: true,
      criteria: [
        { key: 'concept', name: 'Concept & Storytelling', maxScore: 30 },
        { key: 'production', name: 'Production Quality', maxScore: 25 },
        { key: 'jingle', name: 'Jingle Integration', maxScore: 20 },
        { key: 'promotion', name: 'Tourism Promotion Value', maxScore: 25 },
      ],
    },
  ],

  phases: [
    {
      key: 'PRELIM',
      name: 'Preliminary (100-point criteria)',
      order: 1,
      segmentKeys: [
        'beauty_closed',
        'beauty_stage',
        'filipiniana',
        'talent',
        'interview',
        'gown',
        'swimsuit',
        'professionalism',
      ],
    },
    { key: 'TOP8_INTERVIEW', name: 'Top 8 Interview', order: 2, segmentKeys: ['top8_interview'] },
    { key: 'FINAL_QA', name: 'Final Q&A', order: 3, segmentKeys: ['final_qa'] },
    { key: 'AWARDS', name: 'Awards', order: 4, segmentKeys: ['tourism_video'] },
  ],

  cuts: [
    {
      key: 'TOP_8',
      name: 'Top 8 Finalists',
      size: 8,
      order: 1,
      sourcePhaseKeys: ['PRELIM'],
      // "The People's Choice Award will automatically be part of the TOP 8."
      // Read as 7 by score + 1 auto slot. See ARCHITECTURE.md open question 1.
      autoSlots: [{ reason: "People's Choice Award", metricKey: 'peoplesChoice' }],
    },
    {
      key: 'TOP_5',
      name: 'Top 5 Finalists',
      size: 5,
      order: 2,
      sourcePhaseKeys: ['TOP8_INTERVIEW'],
      // "40% carried over from previous phases + 60% from the Top 8 interview"
      blend: [
        { phaseKey: '__PRIOR_CUT__', pct: 40 },
        { phaseKey: 'TOP8_INTERVIEW', pct: 60 },
      ],
    },
    {
      key: 'FINAL',
      name: 'Final Placements',
      size: 5,
      order: 3,
      sourcePhaseKeys: ['FINAL_QA'],
      // "50% carried over from the Top 8 score + 50% from the final interview"
      blend: [
        { phaseKey: '__PRIOR_CUT__', pct: 50 },
        { phaseKey: 'FINAL_QA', pct: 50 },
      ],
    },
  ],

  awards: [
    // Derived straight from segment standings
    { key: 'best_swimsuit', name: 'Best in Swimsuit', source: 'DERIVED', fromSegmentKey: 'swimsuit', prize: 5000 },
    { key: 'best_gown', name: 'Best in Evening Gown', source: 'DERIVED', fromSegmentKey: 'gown', prize: 5000 },
    { key: 'best_filipiniana', name: 'Best in Filipiniana Costume', source: 'DERIVED', fromSegmentKey: 'filipiniana', prize: 5000 },
    { key: 'best_talent', name: 'Best in Talent', source: 'DERIVED', fromSegmentKey: 'talent', prize: 5000 },
    { key: 'best_speaker', name: 'Best Speaker', source: 'DERIVED', fromSegmentKey: 'interview', prize: 5000 },

    // 70% judges + 30% social engagement (rulebook §3)
    {
      key: 'best_tourism_video',
      name: 'Best Tourism Video',
      source: 'COMPOSITE',
      prize: 5000,
      composite: [
        { kind: 'segment', segmentKey: 'tourism_video', pct: 70 },
        { kind: 'metric', metricKeys: ['socialLikes', 'socialShares'], pct: 30 },
      ],
    },

    // Panel / committee input required
    { key: 'best_arrival', name: 'Best Arrival Outfit', source: 'PANEL', prize: 5000 },
    { key: 'best_production', name: 'Best in Production Number', source: 'PANEL', prize: 5000 },
    { key: 'best_designer', name: 'Best Filipiniana Costume Designer', source: 'PANEL', prize: 5000 },
    { key: 'best_escort', name: 'Best Escort Award', source: 'PANEL', prize: 5000 },
    { key: 'miss_photogenic', name: 'Miss Photogenic', source: 'PANEL', prize: 3000 },
    { key: 'miss_congeniality', name: 'Miss Congeniality', source: 'PANEL', prize: 3000 },
    { key: 'miss_professionalism', name: 'Miss Professionalism', source: 'PANEL', prize: 3000 },
    { key: 'miss_social_media', name: 'Miss Social Media', source: 'EXTERNAL', prize: 3000 },
    { key: 'peoplesChoice', name: "People's Choice Award", source: 'EXTERNAL' },
  ],

  tieBreakers: ['CHAIRMAN_SCORE', 'HIGHEST_RAW_TOTAL', 'PRIOR_PHASE_STANDING', 'CHAIRMAN_DECLARATION'],
};

/** Major titles, in placement order, for the results screen. */
export const gandangTitles = [
  { place: 1, title: 'Gandang NegOrense Universe', prize: 35000 },
  { place: 2, title: 'Gandang NegOrense World (1st Runner-up)', prize: 30000 },
  { place: 3, title: 'Gandang NegOrense International (2nd Runner-up)', prize: 25000 },
  { place: 4, title: 'Gandang NegOrense Earth (3rd Runner-up)', prize: 20000 },
  { place: 5, title: 'Gandang NegOrense Tourism (4th Runner-up)', prize: 15000 },
];
