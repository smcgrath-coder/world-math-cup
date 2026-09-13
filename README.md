# World Math Cup

A soccer-tournament maths game for Rion (10, entering 5th grade). He builds a
country, takes a scouting try-out, trains, and plays his way toward the World
Cup. Every question comes from the Montana Mathematics Content Standards for
grades 4 and 5.

Runs in a browser, installs to an iPad home screen, stores everything on the
device.

## Running it

```bash
npm install
npm run dev
```

## The three gates before shipping anything

```bash
npx tsc -b --force   # must exit 0
npm run lint         # must exit 0
npm test             # 1435 tests
```

**`npm test` on its own is not enough.** vitest strips types without checking
them, and this repo has already had a change pass a thousand tests while
failing the build. Do not pipe `tsc` through `tail` or `grep` either — that
hides the exit code, which is how it stayed hidden the first time.

## How it is put together

| Layer | Where | Rule |
|---|---|---|
| Engine | `src/engine/` | Pure TypeScript. No React, no I/O, no clock — time comes in as a parameter. |
| Curriculum | `src/curriculum/` | Generated from the CASE export. Never hand-edited. |
| Store | `src/store/` | An append-only log of attempts. Everything else is derived from it. |
| UI | `src/components/`, `src/screens/` | Thin. Rules live in the engine. |

**Nothing is stored as a total.** Ratings, the six card stats, the world rank,
the courage record and the film room are all derived from the attempts log, so
the rating maths can change and history recomputes.

### The pieces worth knowing about

- **`engine/rational.ts`** — exact fraction arithmetic. No floats touch a graded
  value.
- **`engine/answer.ts`** — accepts every legitimate way of writing a right
  answer: unicode minus, `7÷8`, thousands commas, trailing units, unreduced
  fractions. Also classifies a *wrong* answer as a named misconception, a near
  miss, off target, or unreadable.
- **Two kinds of answer.** Most are typed. Some are *picked*, because some
  questions have a judgement for an answer rather than a value — "is 348 a
  multiple of 6?" and "what kind of angle is this?" are not numbers. True/false
  is a two-option choice, not a separate kind.
- **`engine/elo.ts`** — one rating system for his skills, the opponents and the
  world rank, because they are the same thing.
- **`engine/items/`** — 13 generators producing questions procedurally, so he
  never sees the same one twice.
- **`engine/match.ts`** — the match as a pure reducer. The screen only renders it.

## Audio

Five loops, one at a time, crossfaded — `src/audio/music.ts` picks the volume and
`AppShell.trackFor` picks the track. Sound effects are a handful of match moments
(`src/audio/sfx.ts`: goal, whistle, save, crowd) that stay silent until a file
exists in `public/audio/sfx/` and then simply start being heard. One switch in
Settings covers all of it, and the copy says so, because an unexpected noise is
the thing worth warning a child about.

The files in `public/audio` are **built**, not dropped in. Generated music comes
out as songs — fade in, play, fade out — and looping that dips to silence every
couple of minutes, which sounds broken rather than quiet. `build-audio.py` trims
the fade-out and crossfades the tail back over the head, so a plain `loop`
attribute is enough at playback time.

```bash
python3 scripts/build-audio.py ~/Downloads   # <name>.mp3 -> public/audio/<name>.m4a
```

Nothing is preloaded. An element is built the first time its track is wanted, so
a session that never reaches a knockout never downloads the knockout music.

## Character art

Same shape as the audio: `art-src/` holds the full-size originals and is
committed, because they cannot be regenerated — the same prompt produces a
different person. `public/art/` holds the built copies, resized to roughly twice
the size each one is actually drawn at.

```bash
python3 scripts/build-art.py     # art-src/ -> public/art/, 5.4MB -> 842KB
python3 scripts/check-art.py     # prove the cut-outs are real
```

`check-art.py` exists because `sips -g hasAlpha` answers the wrong question. It
reports that an alpha channel is present, not that anything in it is
transparent — a PNG with a white background baked in and a fully opaque alpha
passes that check and then renders as a white box on a dark green pitch. The
checker decodes the file and looks at the actual values, and the build runs it
afterwards rather than trusting `sips` to carry alpha through a resize.

`docs/art/placement.md` says where each file goes, and which two screens are
deliberately not getting one.

## Regenerating data

```bash
npm run build:standards   # src/curriculum/ from the CASE csv
npm run rerank            # ratings and tiers from the FIFA world ranking
npm run build:icons       # the app icons, from shape maths
```

`npm run rerank` is the one that goes stale. FIFA update the ranking roughly
quarterly; paste the new ranks into `scripts/rerank-opponents.mjs` and run it.
It rewrites the roster in rank order and refuses to write one where a team's
card would clip the scale.

## The soundness harness

Every item generator must pass `assertGeneratorSound`. Across its whole
difficulty range and 400 seeds, it proves the emitted answer key survives
`checkAnswer` **and** agrees with an independent recomputation from the item's
own parameters — one that must not go near the generator's own arithmetic.

This is the most important thing in the repo. Marking Rion wrong when he is
right is the single most damaging bug this software can have, and the harness is
what makes that a property rather than an intention. It has already caught a
wrong key that appeared at one difficulty and one seed out of thousands.

If you add a generator, write `verify` from the standard's definition. Copying
the generator's expression passes by construction and proves nothing.

## Guessing

A true/false is right half the time from nothing, and a three-option question a
third of the time. `updateRating` is told the odds and lifts the expected score
to meet them, so a correct pick earns a fraction of what a typed answer earns and
a wrong one costs more. Measured over 30 right answers at difficulty 50: **68.9
typed, 66.0 four-option, 62.2 true/false.**

`difficultyForSuccess` is deliberately *not* corrected. Selection targets 75%
success on merit; correcting there would serve items he only knows half the time,
and a coin flip is the calibration this project rejected at the start.

The log carries the option count (`Attempt.choices`), because ratings are derived
long after the item is gone. It is optional, so every attempt written before
choices existed still scores as the typed answer it was.

**Expect these questions to move his card less.** That is honest, and it is also
the kind of thing a ten-year-old notices. Worth watching whether it reads as
"these ones don't count".

## Design decisions that look odd until you know why

These exist because of the specific child. He is capable but freezes in front of
things he thinks are too hard, and last year unfinished *timed* work cost him
recess and caused meltdowns.

- **Questions target a 75% success rate, not 50%.** A coin flip is the worst
  possible calibration for him.
- **There is one clock in the whole game**, on the tackle-back, and it is safe
  because the ball is already loose — running out cannot take anything he still
  holds. A switch in settings removes it entirely.
- **A miss never ends a possession.** It loosens the ball, and the tackle-back
  is a scaffolded sub-question, so the second chance does the teaching. After a
  conceptual miss that sub-question is the easiest fact from *inside* the one
  he missed — `347 × 6` comes apart at `4 × 6`, `97 ÷ 4` at `4 × 2`, an area at
  the multiplication it is (`engine/items/decompose.ts`). Before that landed
  the tackle-back was a random draw from the standard underneath, aimed so low
  that nine multiplication tackle-backs in ten were `7 × 0`. On a question with
  three or more options it is instead the *same* question with the option he
  picked taken off it — the keeper parried it — because a rung down is no help
  to a child who has not ruled anything out yet.
- **Choosing the hard shot counts before anyone knows if it went in.** A missed
  bicycle kick is celebrated. That is the mechanism for manufacturing "I proved
  I could", on purpose and repeatedly.
- **He can lose a match and still climb the rankings**, and the post-match screen
  leads with that when it happens.
- **Nothing counts days off.** No streaks, no "keep it up". Asserted by tests
  that scan the whole document.
- **The word "wrong" appears nowhere in the UI.** Also asserted.

Full reasoning, including the pedagogy sources and the risks they cut against,
is in `docs/plans/2026-08-02-world-math-cup-design.md`.

## Deploying

```bash
npm run deploy   # builds, checks every asset, then wrangler deploy
```

The asset check is not ceremony. macOS filesystems are case-insensitive and
Cloudflare serves case-sensitively, so `Coach.png` referenced as
`/art/coach.png` works perfectly on the machine it was built on and 404s in
production — which already happened here once. Nothing else catches it: the type
checker sees a template literal, the tests fetch nothing, and `Character` is
deliberately built to render *nothing at all* when an image fails, so the
picture would simply never appear and nobody would be told why.

`wrangler` is a dev dependency, so `npm install` is all the setup there is. It
used to be called bare from the deploy script without being installed at all,
which failed with `command not found` before it reached Cloudflare.

First run opens a browser to log in and creates the worker. Afterwards, on the
iPad: open the URL in Safari, Share → Add to Home Screen.

To check the config without publishing:

```bash
npx wrangler deploy --dry-run
```

## Device sync

Optional, and off by default. With nothing configured the app behaves exactly
as it always has — one save, one device, `localStorage`. Set it up and a save
picks up on a second device too: laptop to iPad, mid-season, without losing
anything on either.

```bash
cp .env.example .env.local   # fill in the two VITE_SUPABASE_* values
```

then, once, in the Supabase SQL editor: run `supabase/schema.sql`. It is safe
to re-run — every statement is `if not exists` / `or replace`. Read the
comment at the top before running it; the security model (default-deny RLS,
every table reachable only through a handful of `security definer` functions)
is explained there rather than here, because it is the part someone extending
this later actually needs to understand.

A "Family" row appears in Settings' grown-up section once those two env vars
are set — absent entirely otherwise, never shown-and-broken. It links this
device to a household by a 6-character code (same shape as `finns-chores`'
own family code), then to a player within it. Linking never wipes or replaces
anything already here: a device with real local play joining a brand-new
household uploads that play on its first sync, and a brand-new device joining
an existing household adopts the real save instead.

**The landmine, if you touch any of this:** attempt ids are a local
sequential counter, so two devices mint the same id for different attempts
constantly. `src/sync/attemptMerge.ts` is the fix — an attempt's true
identity for merging is `(deviceId, localId)`, never `localId` alone — and it
is mutation-tested specifically because a bug here would silently discard a
child's history rather than error. A second one turned up building this: a
naive "always push now()" last-write-wins would let a freshly linked,
never-touched device overwrite a real save with its own blank defaults just
by syncing first. `syncEngine.ts`'s `getLastKnownProfile` guard is what stops
that, also mutation-tested. Read the comments on both before changing either.

Everything above `supabaseTransport.ts` is written against a `SyncTransport`
interface and tested with an in-memory fake (`src/test/fakeTransport.ts`) —
`syncEngine.test.ts` simulates two real devices syncing through one shared
"cloud" with no network, no project, and no credentials at all.

## Still open

- The bicycle kick can draw a trivial question for a weak player — the label
  promises spectacle and the arithmetic does not always deliver.
- The inline answer box wraps onto its own line below 380px.
- The tournament loop opens softly, so the seam is continuous but quiet. It reads
  as a musical intro rather than a fault, but a later loop point would be tidier.
- The eight captain portraits are not drawn yet. The six principals are, and
  four of them are on screen — `docs/art/placement.md` says where the other two
  go and why they are waiting.

## Deliberately not built

Different from the list above: these were decided against, not left undone.

- **Grade-5 generators.** They should arrive through the autumn at roughly the
  pace they arrive in his classroom, not all at once in August.
- **`MT.4.NF.2`'s `>` `=` `<` format.** The standard names it and the answer
  model can grade it, so this is a choice rather than a limit. Comparing is
  covered seven ways already; a symbol question would add only which way the
  arrow points, which is notation rather than reasoning, and a question he gets
  wrong for forgetting a convention reads as a trick. `=` would also mean
  rebuilding a pool that is strictly ordered by construction. Full reasoning in
  `docs/plans/2026-08-14-choice-questions-design.md`.
- **Sound effects beyond the four match moments.** Goal, whistle, save and crowd
  are wired; nothing else gets a noise, because an unexpected noise is the thing
  worth warning this child about, and one switch has to be able to silence all
  of it.
