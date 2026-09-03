/**
 * Hara sa Negros Oriental 2026, theme "Reef to Ridge"
 * Pre-Competition:   8:00 PM, Thursday, 15 October 2026, Freedom Park Stage
 * Grand Competition: 8:00 PM, Friday, 23 October 2026, L.L. Macias Sports and Cultural Center
 *
 * RANKING mode (rulebook §B): candidates are rated on a scale of 10 (10 highest,
 * 1 lowest) in every segment; winners are then determined by the ranking system
 * applied to each judge's score sheet. LOWER rank totals win.
 *
 * `inputMode: 'SEGMENT_SINGLE'` is the literal reading of §B, one 1-10 score per
 * segment, with the named sub-criteria shown to judges as guidance. Switch a
 * segment to 'CRITERIA_MEAN' to score each sub-criterion separately; the criteria
 * arrays below are already populated for that. See ARCHITECTURE.md open question 7.
 */

import { PageantConfig } from '../types';

const SCALE = 10;

export const haraNegrosOriental2026: PageantConfig = {
  slug: 'hara-negros-oriental-2026',
  name: 'Hara sa Negros Oriental',
  edition: '2026, Reef to Ridge',
  scoringMode: 'RANKING',

  segments: [
    {
      key: 'aquatic',
      name: 'Aquatic Fantasy Costume',
      phaseKey: 'SEMI',
      order: 1,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      criteria: [
        { key: 'design', name: 'Creative Design & Fitting', maxScore: SCALE },
        { key: 'presence', name: 'Stage Presence', maxScore: SCALE },
        { key: 'poise', name: 'Poise & Bearing', maxScore: SCALE },
      ],
    },
    {
      key: 'production',
      name: 'Production Performance',
      phaseKey: 'SEMI',
      order: 2,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      criteria: [
        { key: 'beauty', name: 'Beauty of Face & Figure', maxScore: SCALE },
        { key: 'impact', name: 'Stage Presence & Impact', maxScore: SCALE },
        { key: 'mastery', name: 'Mastery & Performance', maxScore: SCALE },
      ],
    },
    {
      key: 'swimwear',
      name: 'Swimwear, Flames of Confidence',
      phaseKey: 'SEMI',
      order: 3,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      criteria: [
        { key: 'beauty', name: 'Beauty of Face & Figure', maxScore: SCALE },
        { key: 'impact', name: 'Stage Presence & Impact', maxScore: SCALE },
      ],
    },
    {
      key: 'terno',
      name: 'Philippine Terno (White & Silver)',
      phaseKey: 'SEMI',
      order: 4,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      criteria: [
        { key: 'elegance', name: 'Elegance', maxScore: SCALE },
        { key: 'design', name: 'Creativity & Design', maxScore: SCALE },
        { key: 'beauty', name: 'Beauty of Face & Figure', maxScore: SCALE },
        { key: 'impact', name: 'Stage Presence & Impact', maxScore: SCALE },
      ],
    },
    {
      key: 'interview',
      name: 'Interview (Top 10 Semi-finalists)',
      phaseKey: 'SEMI_INTERVIEW',
      order: 5,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      requiresCut: 'TOP_10',
      criteria: [
        { key: 'content', name: 'Wit & Content', maxScore: SCALE },
        { key: 'presence', name: 'Stage Presence', maxScore: SCALE },
        { key: 'delivery', name: 'Projection & Delivery', maxScore: SCALE },
      ],
    },
    {
      key: 'final_qa',
      name: 'Final Question & Answer (Top 5)',
      phaseKey: 'FINAL_QA',
      order: 6,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      requiresCut: 'TOP_5',
      criteria: [
        { key: 'content', name: 'Wit & Content', maxScore: SCALE },
        { key: 'delivery', name: 'Projection & Delivery', maxScore: SCALE },
        { key: 'beauty', name: 'Beauty of Face & Figure', maxScore: SCALE },
        { key: 'presence', name: 'Stage Presence', maxScore: SCALE },
      ],
    },
    {
      key: 'tourism_reel',
      name: 'Best Tourism Reel',
      phaseKey: 'AWARDS',
      order: 7,
      inputMode: 'SEGMENT_SINGLE',
      maxTotal: SCALE,
      // Listed under the semi-finalist criteria heading but numbered after the
      // interview. Treated as a standalone award by default, see
      // ARCHITECTURE.md open question 6. Set awardOnly: false and add to the
      // SEMI phase to fold it into the Top 10 cut.
      awardOnly: true,
      criteria: [
        { key: 'story', name: 'Creativity & Storytelling', maxScore: SCALE },
        { key: 'quality', name: 'Visual & Technical Quality', maxScore: SCALE },
        { key: 'presence', name: "Candidate's Presence & Impact", maxScore: SCALE },
        { key: 'audience', name: 'Audience Impact', maxScore: SCALE },
      ],
    },
  ],

  phases: [
    {
      key: 'SEMI',
      name: 'Semi-final (to Top 10)',
      order: 1,
      // Equal weight, the rulebook gives no relative weighting between these
      // four segments. See ARCHITECTURE.md open question 5.
      segmentKeys: ['aquatic', 'production', 'swimwear', 'terno'],
    },
    { key: 'SEMI_INTERVIEW', name: 'Top 10 Interview', order: 2, segmentKeys: ['interview'] },
    { key: 'FINAL_QA', name: 'Top 5 Final Q&A', order: 3, segmentKeys: ['final_qa'] },
    { key: 'AWARDS', name: 'Awards', order: 4, segmentKeys: ['tourism_reel'] },
  ],

  cuts: [
    {
      key: 'TOP_10',
      name: 'Top 10 Semi-finalists',
      size: 10,
      order: 1,
      sourcePhaseKeys: ['SEMI'],
    },
    {
      key: 'TOP_5',
      name: 'Top 5 Finalists',
      size: 5,
      order: 2,
      // "The 10 Semi-finalists will be interviewed to determine the Top 5",
      // read as the interview alone deciding the cut.
      sourcePhaseKeys: ['SEMI_INTERVIEW'],
    },
    {
      key: 'FINAL',
      name: 'Final Placements',
      size: 5,
      order: 3,
      sourcePhaseKeys: ['FINAL_QA'],
      // "When the Top 5 Finalists shall have been chosen, the scoring for
      // judging will be back to zero."
      reset: true,
    },
  ],

  awards: [
    { key: 'best_aquatic', name: 'Best in Aquatic Fantasy Costume', source: 'DERIVED', fromSegmentKey: 'aquatic', prize: 5000 },
    { key: 'best_production', name: 'Best in Production Number', source: 'DERIVED', fromSegmentKey: 'production', prize: 5000 },
    { key: 'best_swimwear', name: 'Best in Swimwear', source: 'DERIVED', fromSegmentKey: 'swimwear', prize: 5000 },
    { key: 'best_terno', name: 'Best in Philippine Terno', source: 'DERIVED', fromSegmentKey: 'terno', prize: 5000 },
    { key: 'best_speaker', name: 'Best Speaker', source: 'DERIVED', fromSegmentKey: 'interview', prize: 5000 },
    { key: 'best_tourism_reel', name: 'Best Tourism Reel', source: 'DERIVED', fromSegmentKey: 'tourism_reel', prize: 20000 },

    { key: 'best_aquatic_designer', name: 'Best Aquatic Fantasy Costume Designer', source: 'PANEL', prize: 5000 },
    { key: 'best_terno_designer', name: 'Best Philippine Terno Designer', source: 'PANEL', prize: 5000 },
    { key: 'best_backpiece', name: 'Best Backpiece', source: 'PANEL', prize: 5000 },
    { key: 'miss_photogenic', name: 'Miss Photogenic', source: 'PANEL', prize: 5000 },
    { key: 'miss_professionalism', name: 'Miss Professionalism', source: 'PANEL', prize: 5000 },
    { key: 'miss_social_media', name: 'Miss Social Media', source: 'EXTERNAL', prize: 5000 },
  ],

  tieBreakers: ['CHAIRMAN_SCORE', 'HIGHEST_RAW_TOTAL', 'PRIOR_PHASE_STANDING', 'CHAIRMAN_DECLARATION'],

  autoPenalties: [
    {
      key: 'height_below_5ft2',
      description:
        "Height below 5'2\" barefoot, 1 point deducted from the Chairman's Swimwear score (rulebook §A.4)",
      attribute: 'heightCm',
      operator: 'lt',
      // 5'2" = 62 inches = 157.48 cm
      threshold: 157.48,
      points: 1,
      scopeSegmentKey: 'swimwear',
      chairmanOnly: true,
    },
  ],
};

/** Major titles, in placement order, for the results screen. */
export const haraTitles = [
  { place: 1, title: 'Hara sa Negros Oriental', prize: 100000 },
  { place: 2, title: '1st Runner-up', prize: 75000 },
  { place: 3, title: '2nd Runner-up', prize: 50000 },
  { place: 4, title: '3rd Runner-up', prize: 40000 },
  { place: 5, title: '4th Runner-up', prize: 30000 },
];
