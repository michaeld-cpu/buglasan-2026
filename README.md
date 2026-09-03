# Buglasan Festival 2026, Judges' Panel

Authenticated, segment-scoped score sheets for the four judged programs of the
2026 Buglasan Festival. A judge signs in and sees **only the segments their seat
is assigned to**, and only while the tabulation head has those segments open.

Front-end only, no server, no database. Every score lives in the browser's
`localStorage`, so it survives a refresh and works with the venue wifi down.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm test` (67 tests) · `npm run typecheck` · `npm run build`.

---

## The four programs

Two are pageants with cuts; two are single-round contests. They do not share a
scoring model, and that difference lives entirely in configuration
(`packages/scoring/src/presets/`) rather than in the UI.

| Program | Model | Sheet | Cuts |
|---|---|---|---|
| **Hara sa Negros Oriental** | Ranking, 1–10 raw → per-judge ranks summed, **lowest wins** | One score out of 10 | Top 10 → Top 5, score resets at Top 5 |
| **Gandang NegOrense** | Points, 100 max, highest wins | Per-criterion points | Top 8 → Top 5, 40/60 then 50/50 carryover |
| **LGU Booth Contest** | Points, 85 judged + 15 public | 3 criteria, 85 points | None, one walkthrough, one standing |
| **Festival of Festivals** | Points, two rounds, equally weighted | 4 criteria × 2 segments, 100 each | None, street dancing + showdown |

The booth and festival criteria weights are taken from the **published criteria
on the public site** (`contestArenas` in `buglasan-2026/src/data/pageant.ts`), so
what a judge scores matches what the public was told.

---

## Authentication and segment filtering

This is the part the app exists for.

A judge is not "a judge of the festival", they are seated on **one program**
and, within it, often only **some segments**. The closed-door interview panel is
not the same people as the coronation panel, and the booth walkthrough judges
never see a stage.

`src/auth/auth.ts` carries that in `Account.segmentKeys`:

```
undefined  → every scorable segment of the program (a full panel)
[...]      → only these segment keys
```

`assignedSegments(account, slug)` is the single function that answers *"what may
this person score?"*. It intersects three things:

1. the judge is seated on this program at all
2. the segment is in their assignment
3. the segment is judge-scorable, `awardOnly` segments (the online vote tally,
   the tourism reel) are fed by the tabulation head and never appear on a sheet

Segment **status** is returned rather than filtered out, deliberately: a judge
who sees only "Interview" cannot tell whether the night has not reached the
earlier rounds or whether the app has lost them. Seeing the whole running order
with *"Not open yet"* against it tells them exactly where they are.

### Two layers, not one

Route guards (`src/components/Guard.tsx`) stop *navigation*. They are **not** the
authorization check, `canScoreSegment()` is, and it runs when the sheet mounts
**and again inside the save path**. So:

- a judge who deep-links to a segment they are not assigned to gets a refusal,
  not a live sheet
- a segment the admin closes while a judge has it open stops accepting writes
  immediately, not at the next navigation

Both cases are covered by tests and were verified in a browser.

### Roles

| Role | Can |
|---|---|
| **Judge** | Score their own assigned sheets only. Never sees another judge, a total, or a standing. |
| **Tabulator** | Open/close/certify segments, read results. Cannot score. |
| **Super admin** | Everything, plus reset/simulate. Cannot score. |

The **Tabulator** and **Super admin** rows describe roles this app
*recognises*, not accounts it issues. No staff account is seeded here: staff
capabilities all live in the tabulation app, and a login that could sign in but
do nothing except read an explanation was two publicly-known PINs for no
feature. A staff session arriving from the tabulation app is still handled —
refused a score sheet with an explanation rather than redirected, because the
tabulation head picking up a judge's phone is a real thing that happens on the
night.

### Demo credentials

Judges only. Credentials are issued on paper per seat and are not listed on the
sign-in screen.

```
hara1..7   7011…  Hara judges    (7011, 7022, … 7077)
gno1..5    3011…  Gandang judges (3011, 3022, … 3055)
booth1..5  5011…  Booth judges   (5011, 5022, … 5055)
fest1..5   9011…  Festival judges (9011, 9022, … 9055)
```

Seat 1 is the chairman on every panel. Three accounts demonstrate partial
assignment: `hara6` and `hara7` see only the two interview segments, and `gno5`
only the two closed-door segments.

> **This is demo authentication, not security.** Roles are enforced in the
> browser, so anyone with devtools can edit `localStorage` and become a super
> admin, and each browser holds its own scores. It exists so the panel can be
> rehearsed with realistic sign-in and permissions.

---

## Trying it out

1. Sign in as `hara1` / `7011`, you'll see all 6 Hara segments, all closed.
2. Click **Rehearsal · 0/19 segments open** in the bottom-left corner, then
   **Open all segments**. Every scorable segment across all four programs goes
   OPEN at once and the rows become tappable. (**Close all** and **Reset to
   draft** undo it.)
3. Score a sheet. Every keystroke autosaves; reload mid-sheet and the numbers
   are still there.
4. **Review & submit** refuses an incomplete sheet, naming the missing numbers.
5. Sign in as `hara6` / `7066` and confirm you see only 2 segments, then try
   navigating to `/judge/hara-negros-oriental-2026/aquatic` by hand.

### The rehearsal bar

The bottom-left **Rehearsal** control exists so a dry run does not need the
tabulator's control room running alongside it. It opens, closes or resets every
segment of all four programs in one click, and shows a live per-program count.

It is **dev-build only.** `import.meta.env.DEV` is a compile-time constant, so
`npm run build` strips the whole component, verified against the bundle: zero
occurrences of `devbar`, `Open all segments` or `setAllProgramsSegmentStatus` in
the production JS. (~1.2KB of unreachable `.devbar` CSS survives, because Vite
does not tree-shake stylesheets.)

It never opens an `awardOnly` segment, the online vote tally and the tourism
reel are fed by the tabulation head, and putting either on a judge's sheet would
ask them to score something they are not meant to. There are tests for that.

On the night, segments are opened one at a time from the control room, because
opening a segment is what puts it in front of seven judges.

---

## Judge flow on the night

```
Admin opens a segment   →  it appears open on the assigned judges' screens
Judge scores            →  every keystroke autosaves to localStorage
Judge taps Submit       →  refuses an incomplete sheet, naming missing numbers
                        →  review reads back from STORAGE, not from memory
Admin closes the segment →  no further judge writes, mid-sheet or otherwise
Admin certifies         →  locked
```

Deliberate choices, all operational rather than aesthetic:

- **Autosave drafts, explicit submit.** A judge's phone dying halfway through
  swimwear must not lose the sheet.
- **The review dialog re-reads storage.** Reviewing the same in-memory object
  the judge just typed into would confirm nothing; if a keystroke failed to
  persist, this is where it shows.
- **A submitted sheet stays editable until the segment closes**, so a judge who
  spots their own slip can reopen it rather than needing an admin.
- **No running totals across candidates, ever.** A judge sees their own
  per-candidate total to check their arithmetic, and nothing else, no
  standings, no other judges, no leaderboard. Prevents strategic scoring.
- **48px minimum tap targets, 56px number inputs, `inputMode="decimal"`.** Older
  judges, own phones, stage lights, half-point scores.

---

## Layout

```
packages/scoring/          pure TS scoring core, no React, no storage, no I/O
  src/engine.ts            tabulate(), both scoring modes
  src/presets/             the four programs' rules, as data
  test/                    33 tests, every expected value hand-derived

src/auth/auth.ts           accounts, session, roles, SEGMENT SCOPING
src/auth/auth.test.ts      25 tests, the scoping and refusal cases
src/store/                 localStorage persistence + demo rosters
src/screens/
  SignIn.tsx               username + PIN
  JudgeHome.tsx            "these are your segments"
  JudgeSegment.tsx         THE scoring sheet
src/components/Guard.tsx   route guards (navigation only, see above)
src/components/DevBar.tsx  rehearsal "Open all segments" bar, dev builds only
src/data/programs.ts       per-program accent, logo, venue (from the public site)
src/styles.css             design system, ported from the public site's tokens
```

## Design

The token ramp (`src/styles.css`) is lifted from the public site so the two
products read as one: same Archivo type, same lifted-black green ground, same
gold accent, and the same per-program accent colours, a booth judge sees the
violet the public booth page uses.

What is deliberately **not** carried over is the marketing chrome: no WebGL
stage, no glass blur, no hover animation, no vote cursor. The header is solid
rather than translucent because a blurred bar over a scrolling score sheet makes
the numbers underneath hard to read on a phone in bright light.

Verified in a browser at 320px, 430px and 1280px: zero horizontal overflow, the
sticky sheet title clears the app header at every size, and no console errors.

---

## Verification

```bash
npm test
```

**33 scoring tests**, the 100-point total, the 40/60 and 50/50 carryover blends,
People's Choice auto-inclusion, the 70/30 tourism composite, per-judge rank
conversion, average-tie ranks, the Top-5 score reset, the sub-5'2" chairman-only
deduction, the booth contest's 85+15 split, and the festival's equal-weight
rounds. Every expected value is hand-derived from the rulebooks and the
published criteria, not captured from a previous run.

**9 store tests**, the bulk "Open all" write, and that it never opens an
`awardOnly` segment on any program.

**25 auth tests**, including the one that earns its keep: every segment key in
`SEGMENT_ASSIGNMENTS` must exist in its program's config. A typo there does not
throw, it just hands that judge an empty sheet, which nobody notices until the
judge says *"there's nothing here"* on the night. (It caught two wrong keys
during development.)

---

## What still needs a decision

Carried forward from the tabulator's architecture doc, plus two new ones. Each
has a working default, so nothing is blocked.

1. **Real panel assignments.** `SEGMENT_ASSIGNMENTS` in `src/auth/auth.ts` holds
   three illustrative entries. Replace them with the actual panels before the
   dry run, this is the single most important thing to confirm.
2. **Festival of Festivals segment weights.** Street dancing and showdown are
   currently equal. The published criteria table says nothing about their
   relative weight; if the showdown is meant to dominate, change `weight` on the
   two segments and nothing else.
3. **Booth contest Public Choice (15%).** Modelled as an `awardOnly` segment fed
   by the online tally, so judges never score it and the 100-point total still
   accounts for all four published criteria. Confirm the tally actually maps to
   15 points rather than a separate award.
4. **Hara, one score per segment, or per sub-criterion?** Default is one 1–10
   score with the sub-criteria as on-screen guidance (the literal rulebook
   reading). Flip `inputMode` to `CRITERIA_MEAN` per segment to score each
   sub-criterion; the criteria arrays are already populated.
5. **Panel sizes.** Hara seats 7, the other three seat 5. `seatCount()` in
   `auth.ts` and `PROGRAMS` in `seed.ts` must agree, a judge account whose
   `judgeId` is not in the seeded panel can sign in and find nothing to score.

## Making it real

Before this takes real scores, the server layer has to come back. The code is
shaped so the swap is contained:

- **`src/auth/auth.ts` is the only file that changes.** Move `ACCOUNTS` and
  `signIn` behind an HTTP API, hash the PINs, issue an httpOnly session cookie.
  The screens only ever call this module.
- **Re-check `can()`, `assignedSegments()` and `canScoreSegment()` server-side on
  every write.** The client checks exist to make the UI honest, not to enforce
  anything.
- **`src/store/store.ts` becomes the API client.** Its function signatures
  already match what the endpoints need; `Score` keyed by
  `(segment, criterion, judge, candidate)` makes submit idempotent, which
  matters on flaky mobile connections.
- **Delete the `<DemoAccounts>` block in `src/screens/SignIn.tsx`**, it prints
  every credential in the build.

Two judges on two phones currently have **separate** data. That is fine for a
dry run of the sheets; a real night needs the server.
