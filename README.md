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
npm test             # 1074 tests
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
- **`engine/elo.ts`** — one rating system for his skills, the opponents and the
  world rank, because they are the same thing.
- **`engine/items/`** — 13 generators producing questions procedurally, so he
  never sees the same one twice.
- **`engine/match.ts`** — the match as a pure reducer. The screen only renders it.

## Audio

Five loops, one at a time, crossfaded — `src/audio/music.ts` picks the volume and
`AppShell.trackFor` picks the track. Music only. There are no sound effects, and
the settings copy says so, because an unexpected noise is the thing worth warning
a child about.

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
  is a scaffolded sub-question, so the second chance does the teaching.
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
npm run deploy   # builds, then wrangler deploy
```

First run will ask you to log in to Cloudflare and will create the worker.
Afterwards, on the iPad: open the URL in Safari, Share → Add to Home Screen.

## Still open

- The bicycle kick can draw a trivial question for a weak player — the label
  promises spectacle and the arithmetic does not always deliver.
- `MT.4.NF.2` is a two-way choice, so chance alone scores 50% and that standard's
  rating reads high.
- The inline answer box wraps onto its own line below 380px.
- The tournament loop opens softly, so the seam is continuous but quiet. It reads
  as a musical intro rather than a fault, but a later loop point would be tidier.
- No character art on screen yet, though the files exist.
- Grade-5 generators. Deliberate: they should arrive through the autumn at
  roughly the pace they arrive in his classroom.
