/**
 * Presentation metadata for the four programs.
 *
 * The scoring rules live in `packages/scoring/src/presets`, this file holds
 * only what a screen needs to *look* right: the accent colour, the logo, the
 * venue line, and the noun for what is being judged.
 *
 * The titles are copied from `contestArenas` on the public site
 * (`src/data/pageant.ts` in buglasan-2026). If the public site rebrands a
 * programme, this is the one file to update.
 *
 * The ACCENTS deliberately no longer follow the public site. Each programme
 * used to carry its public colour, Hara gold, Gandang sky, Booth violet,
 * Festival orange, so the accent bar and score figures changed hue depending
 * on which panel a judge was seated on. On this side of the login that read as
 * four different products rather than one tool, and none of the non-gold ones
 * agreed with the Sign in button or the gold header wordmark. All four now use
 * the button's own gold (`--frame-mid`, effectively `--gold`), so a judge sees
 * one accent everywhere. `PUBLIC_ACCENT` below keeps the original values, for
 * anything that genuinely needs to match the public site.
 */

/**
 * The single accent for every judge screen: the Sign in button's face colour,
 * `--frame-mid: oklch(0.79 0.135 82)`, converted to sRGB.
 *
 * Hex rather than the CSS token because `accent` is handed to an inline style
 * on `Shell`, which sets `--program`, so it cannot itself be a `var()`
 * reference to a variable declared in the same cascade.
 *
 * NOT Hara's old `#f7d377`. That was the obvious value to reuse, and it is
 * wrong: it is a paler, less saturated gold that sits visibly lighter than the
 * button's metal. The two have to be the same alloy as the header wordmark and
 * the button, so this is the button's mid stop exactly.
 */
const JUDGE_GOLD = '#e5b147';

/**
 * The programmes' public-site colours, kept for reference and for any surface
 * that must match the public branding. Nothing on the judge screens reads this
 * today, `--program` is gold everywhere.
 */
export const PUBLIC_ACCENT: Record<string, string> = {
  'hara-negros-oriental-2026': '#f7d377',
  'gandang-negorense-2026': '#38bdf8',
  'lgu-booth-contest-2026': '#c084fc',
  'festival-of-festivals-2026': '#f97316',
};

export interface ProgramMeta {
  slug: string;
  /** The name on screen. Matches the public site's `shortTitle`. */
  title: string;
  subtitle: string;
  /** Drives `--program` on judge screens. Gold for every programme, see
   *  the note on accents at the top of this file. */
  accent: string;
  logo?: string;
  venue: string;
  dateRange: string;
  /** What one entry is, for counts and empty states. */
  noun: string;
  nounPlural: string;
  /**
   * Column header for the entry's origin, a town, or a district.
   *
   * Currently unused. The score sheet dropped its "Town: Dumaguete City"
   * prefix — a place name needs no label, and it repeated on every row of a
   * 26-candidate sheet. Kept because it is the correct header the moment the
   * origin appears in an actual TABLE, where a bare column of place names does
   * need naming.
   */
  originLabel: string;
}

export const PROGRAMS: ProgramMeta[] = [
  {
    slug: 'hara-negros-oriental-2026',
    title: 'Hara sa Negros Oriental',
    subtitle: 'The Premier Festival Queen Pageant · Reef to Ridge',
    accent: JUDGE_GOLD,
    logo: '/assets/program-logos/hara-sa-negros-oriental-2026-transparent.png',
    venue: 'L.L. Macias Sports and Cultural Center',
    dateRange: 'Pre-competition 15 Oct · Grand 23 Oct 2026',
    noun: 'candidate',
    nounPlural: 'candidates',
    originLabel: 'Town',
  },
  {
    slug: 'gandang-negorense-2026',
    title: 'Gandang NegOrense',
    subtitle: 'The Queen Size Pageant',
    accent: JUDGE_GOLD,
    logo: '/assets/program-logos/gandang-negorense-queen-size.webp',
    venue: 'L.L. Macias Sports and Cultural Center',
    dateRange: 'Grand coronation 18 Oct 2026',
    noun: 'candidate',
    nounPlural: 'candidates',
    originLabel: 'Town',
  },
  {
    slug: 'lgu-booth-contest-2026',
    title: 'LGU Booth Contest',
    subtitle: 'Freedom Park Architectural Expo',
    accent: JUDGE_GOLD,
    // The public site has no mark for this programme either.
    venue: 'Freedom Park, Provincial Capitol Grounds',
    dateRange: '3 – 24 October 2026',
    noun: 'booth',
    nounPlural: 'booths',
    originLabel: 'Municipality',
  },
  {
    slug: 'festival-of-festivals-2026',
    title: 'Festival of Festivals',
    subtitle: 'Province-Wide Cultural Showdown',
    accent: JUDGE_GOLD,
    logo: '/assets/program-logos/festival-of-festivals-2026.webp',
    venue: 'Dumaguete City Streets & Lamberto Macias Sports Complex',
    dateRange: '20 – 21 October 2026',
    noun: 'contingent',
    nounPlural: 'contingents',
    originLabel: 'Municipality',
  },
];

const BY_SLUG = new Map(PROGRAMS.map((p) => [p.slug, p]));

/**
 * Metadata for a program. Falls back to a neutral gold-accented entry rather
 * than returning undefined, a missing logo must not blank a judge's screen
 * mid-segment.
 */
export function programMeta(slug: string): ProgramMeta {
  return (
    BY_SLUG.get(slug) ?? {
      slug,
      title: slug,
      subtitle: '',
      accent: JUDGE_GOLD,
      venue: '',
      dateRange: '',
      noun: 'entry',
      nounPlural: 'entries',
      originLabel: 'Origin',
    }
  );
}
