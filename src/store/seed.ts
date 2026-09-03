import type { Candidate, PageantConfig } from '@judges/scoring';
import type { PageantState } from './types';

/**
 * Demo rosters for all four programs.
 *
 * The LGUs are the real cities and municipalities of Negros Oriental so the
 * screens look like the actual night. Every *person's* name is invented, do
 * not treat any of them as a real contestant. Booth and contingent entries are
 * keyed to their municipality, which is what they actually are.
 *
 * Chosen by slug, not by `scoringMode`. An earlier version branched on
 * RANKING vs POINTS, which silently handed the booth contest a roster of
 * pageant candidates the moment a third program existed.
 */

type PersonRow = [number, string, string, number];
type EntryRow = [number, string, string];

const HARA_ROSTER: PersonRow[] = [
  [1, 'Andrea Nicole Somoza', 'Dumaguete City', 170],
  [2, 'Bea Angelica Tubog', 'Bais City', 156],
  [3, 'Charlize Anne Diaz', 'Bayawan City', 167],
  [4, 'Denise Gabrielle Arnaiz', 'Canlaon City', 172],
  [5, 'Elaine Kirstie Poblete', 'Guihulngan City', 161],
  [6, 'Faith Angeline Cadalso', 'Tanjay City', 158],
  [7, 'Gwyneth Marie Baldado', 'Sibulan', 169],
  [8, 'Hazel Kim Dagoplo', 'Valencia', 165],
  [9, 'Ivy Rochelle Manaban', 'Siaton', 154],
  [10, 'Jenny Rose Calumba', 'Sta. Catalina', 168],
  [11, 'Katrina Belle Ymbong', 'Mabinay', 162],
  [12, 'Louise Anne Piñero', 'Manjuyod', 171],
  [13, 'Marianne Joy Elumba', 'Bindoy', 160],
  [14, 'Nicole Andrea Sagarino', 'Ayungon', 166],
];

const GANDANG_ROSTER: PersonRow[] = [
  [1, 'Althea Marie Bacong', 'Dumaguete City', 168],
  [2, 'Bianca Rose Villegas', 'Bais City', 171],
  [3, 'Camille Anne Tayko', 'Bayawan City', 165],
  [4, 'Danielle Faye Amores', 'Canlaon City', 160],
  [5, 'Erika Joy Patindol', 'Guihulngan City', 173],
  [6, 'Francine Mae Bandoquillo', 'Tanjay City', 157],
  [7, 'Gabrielle Nicole Ruiz', 'Sibulan', 169],
  [8, 'Hannah Bernadette Lajato', 'Valencia', 163],
  [9, 'Isabel Clarisse Bongco', 'Dauin', 166],
  [10, 'Jamaica Louise Ferrer', 'Zamboanguita', 159],
  [11, 'Kyla Margarette Solis', 'Bacong', 170],
  [12, 'Lorraine Beatrice Kadusale', 'Amlan', 164],
];

/**
 * The 23 LGU booths. `name` is the pavilion theme and `lgu` the municipality,
 * judges walking the expo look for the town first, so both appear on the card.
 */
const BOOTH_ROSTER: EntryRow[] = [
  [1, 'Bamboo Cathedral', 'Dumaguete City'],
  [2, 'Sugar & Dolphins Pavilion', 'Bais City'],
  [3, 'Harvest Gateway', 'Bayawan City'],
  [4, 'Highland Vegetable Terrace', 'Canlaon City'],
  [5, 'Northern Gateway Hall', 'Guihulngan City'],
  [6, 'Riverside Weavers’ Hut', 'Tanjay City'],
  [7, 'Lakeside Nipa Retreat', 'Sibulan'],
  [8, 'Mountain Spring Lodge', 'Valencia'],
  [9, 'Coral Garden Pavilion', 'Dauin'],
  [10, 'Whale Shark Cove', 'Zamboanguita'],
  [11, 'Potter’s Kiln House', 'Bacong'],
  [12, 'Mangrove Boardwalk', 'Amlan'],
  [13, 'Bat Cave Grotto', 'Mabinay'],
  [14, 'Seagrass Fisherfolk Hall', 'Manjuyod'],
  [15, 'Bamboo Organ Loft', 'Bindoy'],
  [16, 'Twin Falls Pavilion', 'Ayungon'],
  [17, 'Tuna Fisher’s Deck', 'Siaton'],
  [18, 'Salt Harvest Shed', 'Sta. Catalina'],
  [19, 'Abaca Weaver’s Wing', 'Jimalalud'],
  [20, 'Cliffside Lookout', 'La Libertad'],
  [21, 'Rice Terrace Granary', 'Tayasan'],
  [22, 'Cacao Grove Hut', 'Pamplona'],
  [23, 'Mountain Coffee Porch', 'Basay'],
];

/** The 10 festival contingents. `name` is the festival they bring. */
const FESTIVAL_ROSTER: EntryRow[] = [
  [1, 'Sandurot Festival', 'Dumaguete City'],
  [2, 'Hudyaka Festival', 'Bais City'],
  [3, 'Tawo-Tawo Festival', 'Bayawan City'],
  [4, 'Pasayaw Festival', 'Canlaon City'],
  [5, 'Hinugyaw Festival', 'Guihulngan City'],
  [6, 'Sinulog de Tanjay', 'Tanjay City'],
  [7, 'Yagyag Festival', 'Sibulan'],
  [8, 'Bulang-Bulang Festival', 'Valencia'],
  [9, 'Langub Festival', 'Mabinay'],
  [10, 'Sikad-Sikad Festival', 'Manjuyod'],
];

/** Judge seats. Seat 1 is always the chairman, several rules key off this. */
function judges(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `judge-${i + 1}`,
    displayName: i === 0 ? 'Chairman of the Board' : `Judge ${i + 1}`,
    isChairman: i === 0,
    seatNo: i + 1,
    active: true,
  }));
}

/**
 * PLACEHOLDER portrait, used for every pageant candidate.
 *
 * The repo ships one contestant image, so all candidates currently share it:
 * the avatar treatment (gold ring, circular crop, cover fit) is what this is
 * demonstrating, and it cannot be judged from a single filled disc among
 * thirty numbered ones.
 *
 * This is a stand-in, not data. Every roster name in this file is invented,
 * and one face across an entire panel is obviously not a real roster, on a
 * live night each candidate needs their own portrait, or none should have one,
 * because a wrong face next to a real name is worse than a number. Replace by
 * giving `person()` a per-candidate lookup (see PORTRAIT_BY_NUMBER below) once
 * real photography exists.
 *
 * Pageant rosters only. Booth and contingent entries are municipalities and
 * structures rather than people, so `entry()` stays photoless, a portrait on
 * "Harvest Gateway" would be wrong.
 */
const PLACEHOLDER_PORTRAIT = '/assets/candidate-03.webp';

/**
 * Per-candidate portraits, keyed by entry number. Empty for now.
 *
 * When real photography arrives, add it here, an entry in this map wins over
 * the shared placeholder, so the roster can be filled in a few candidates at a
 * time rather than all at once.
 */
const PORTRAIT_BY_NUMBER: Record<number, string> = {};

const person = ([number, name, lgu, heightCm]: PersonRow): Candidate => ({
  id: `c${number}`,
  number,
  name,
  lgu,
  heightCm,
  status: 'ACTIVE',
  photo: PORTRAIT_BY_NUMBER[number] ?? PLACEHOLDER_PORTRAIT,
});

const entry = ([number, name, lgu]: EntryRow): Candidate => ({
  id: `c${number}`,
  number,
  name,
  lgu,
  status: 'ACTIVE',
});

/** Roster and panel size per program. */
const PROGRAMS: Record<string, { candidates: () => Candidate[]; seats: number }> = {
  'hara-negros-oriental-2026': { candidates: () => HARA_ROSTER.map(person), seats: 7 },
  'gandang-negorense-2026': { candidates: () => GANDANG_ROSTER.map(person), seats: 5 },
  'lgu-booth-contest-2026': { candidates: () => BOOTH_ROSTER.map(entry), seats: 5 },
  'festival-of-festivals-2026': { candidates: () => FESTIVAL_ROSTER.map(entry), seats: 5 },
};

export function seedFor(config: PageantConfig): PageantState {
  const program = PROGRAMS[config.slug];
  const candidates = program ? program.candidates() : [];
  const seats = program ? program.seats : 5;

  // Every segment starts hidden from judges; the admin opens them one by one.
  const segmentStatus: PageantState['segmentStatus'] = {};
  for (const s of config.segments) segmentStatus[s.key] = 'DRAFT';

  /* Metrics the config references but that come from outside the judges'
     sheets, the online vote tally, social engagement, People's Choice.
     Seeded at zero so composite awards and auto-slots have something to read;
     the tabulation head enters the real figures once voting closes. */
  const metrics: PageantState['metrics'] = [];
  if (config.slug === 'gandang-negorense-2026') {
    if (candidates[4]) {
      metrics.push({ candidateId: candidates[4].id, key: 'peoplesChoice', value: 1 });
    }
    for (const c of candidates) {
      metrics.push({ candidateId: c.id, key: 'socialLikes', value: 0 });
      metrics.push({ candidateId: c.id, key: 'socialShares', value: 0 });
    }
  }
  if (config.slug === 'lgu-booth-contest-2026' || config.slug === 'festival-of-festivals-2026') {
    for (const c of candidates) {
      metrics.push({ candidateId: c.id, key: 'publicVotes', value: 0 });
    }
  }

  return {
    candidates,
    judges: judges(seats),
    scores: {},
    submissions: {},
    segmentStatus,
    penalties: [],
    metrics,
  };
}
