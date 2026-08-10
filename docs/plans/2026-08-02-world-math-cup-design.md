# World Math Cup — Design

**Date:** 2026-08-02
**Status:** Approved
**Owner:** Scott
**For:** Rion (age 10, entering 5th grade)

## Purpose

A soccer-tournament math game that refreshes Rion's 4th-grade skills before school
starts and then carries him through 5th-grade content across the year. He builds
his own country, designs its flag, and works from a scouting try-out through
qualifiers to the World Cup.

The deeper goal is not arithmetic. It is that he learns effort and practice make
hard things easier — that the thing he was afraid of three weeks ago is now
something he can do.

## The learner

This section is design input, not background colour. Several decisions below exist
only because of it.

Rion is capable but hesitant to push himself. The block sits in the moment
*before* attempting something hard; once he proves to himself he can do it, he is
fine. Last year math started badly — unfinished assignments meant staying in from
recess, which produced meltdowns — and turned around once he was supported in
finishing work during class. He sometimes counts on his fingers for basic facts.

Consequences that follow directly:

- **Time pressure must never confiscate anything.** His negative association is
  specifically *the clock took something away from me*.
- **Success rate must be high enough to keep him attempting.** A coin-flip
  difficulty setting is the worst possible calibration for this child.
- **The choice to attempt something hard must be visible, owned, and celebrated
  regardless of outcome.** That is the exact muscle we are training.
- **Performance must not be what earns parental approval.** Scott's words: he
  should not feel like a robot whose performance is what matters to us.

## Pedagogy

### Principles the design implements

| Choice | Principle |
|---|---|
| Typed answers, never multiple choice | Retrieval practice — recall over recognition |
| Rating decay on untouched standards | Spaced repetition |
| Difficulty tracks ability continuously | Desirable difficulties |
| Domains mixed within a match | Interleaving over blocked practice |
| Tackle-back decomposes to the prerequisite | Contingent scaffolding |
| Hint first, worked steps only after a second failure | Elaborated feedback beats verification-only; worked-example effect |
| Per-standard Elo targeting weakest sub-skills | Adaptive mastery learning |
| Scouting your radar against the opponent's | Metacognition / self-regulated learning |
| Country and flag creation | Autonomy (self-determination theory) |
| Errors cost possession, not the match | Error-tolerant practice |

### Risks, and what we do about them

**Cognitive load.** A shot clock, commentary, animation and crowd noise stacked on
top of a fractions problem is extraneous load competing with the actual thinking.
*Mitigation:* while a question is live everything else dims and goes quiet.
Animation and commentary live in the gaps between questions, never during one.

**Math anxiety from timing.** Timed math is repeatedly implicated in the onset of
math anxiety, and anxiety consumes the working memory it then appears to measure.
But the evidence is subtler than "timers bad" — a 2026 study of 44 children aged
7–9 found a *visible* timer reduced anticipatory anxiety versus a hidden one and
improved on-task behaviour. The harm is uncertainty and consequence, not elapsed
time. *Mitigation:* no countdown during normal possession at all; visible, calm,
generous clocks only where speed is explicitly the point (penalties, tackle-back);
expiry only ever returns him to where he already was; global off switch.

**Overjustification.** Deci, Koestner & Ryan's meta-analysis of 128 experiments
found tangible rewards undermine intrinsic motivation (d = −0.34), with effects
*worse for children*, and strongest when rewards are expected and contingent on
the task. *Mitigation:* the chores-app reward pays for habit — streak weeks,
courage attempts, film reviewed — never for wins or accuracy, and pays weekly
rather than per session so the contingency is weak.

**Attribution.** Mueller & Dweck found intelligence praise produces challenge
avoidance after failure; effort praise does not. Recent replication is mixed and
the broader mindset literature is weak, so we do not build on mindset theory as
settled — we simply take the free side of the bet. Commentary and feedback
attribute outcomes to work and strategy, never to being naturally good at it.

### Sources

- [Math anxiety in elementary students: timing and task complexity](https://www.sciencedirect.com/science/article/abs/pii/S0022440524000360)
- [Time on Their Side: visual timers in elementary math assessments](https://pmc.ncbi.nlm.nih.gov/articles/PMC12731990/)
- [Computer adaptive practice of maths ability (Math Garden)](https://www.klinkenberg.amsterdam/publication/math-garden/)
- [Applications of the Elo rating system in adaptive educational systems](https://www.sciencedirect.com/science/article/abs/pii/S036013151630080X)
- [Deci, Koestner & Ryan (1999), extrinsic rewards meta-analysis](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)
- [Mueller & Dweck (1998), praise for intelligence](https://cpb-us-w2.wpmucdn.com/web.sas.upenn.edu/dist/b/398/files/2019/04/1998-04530-003-1sagefw.pdf)
- [Delaying access to a problem-skipping option increases effortful practice](https://www.sciencedirect.com/science/article/abs/pii/S0360131517302737)

## Competency engine

### Three layers

At the bottom, the Montana standards, each holding its own rating. In the middle,
six card stats, each an average of the standards beneath it. At the top, an
overall rating and a world rank.

Source of truth: `docs/curriculum/montana-math-standards-2026-CASE.csv` (535 rows,
CASE format). Grade 4 contributes 28 standards, grade 5 contributes 26. The five
domains are **identical across both grades**, so the card is stable across the
transition — his hexagon never resets, the ceiling simply rises.

### The card

| Card | Soccer | Math domain | Rationale |
|---|---|---|---|
| **PAC** | Pace | Fluency / recall speed | Fast recall is fast legs |
| **SHO** | Shooting | Geometry | Shooting is angles; the shot *is* geometry |
| **PAS** | Passing | Operations & Algebraic Thinking | Vision — multi-step problems are linked sequences |
| **DRI** | Dribbling | Fractions | Close control; the technical skill everyone finds hardest |
| **DEF** | Defending | Number & Operations in Base Ten | Place value is the base everything is built on |
| **PHY** | Physical | Measurement & Data | Length, mass, volume, time — the physical world measured |

Soccer name is what he sees; one tap reveals the math and the standard codes
(`DRI · Fractions · MT.4.NF, MT.5.NF`) for parents and teachers.

### Ratings

Elo, 0–99, per standard. Each generated item carries a difficulty; correct answers
raise the standard's rating in proportion to how hard the item was relative to it.
This is the same mathematics as FIFA world rankings, so skill ratings, opponent
strength and world rank are one system rather than three.

- **Item selection targets ~0.75 success probability**, following Math Garden.
  Not 0.5. This is the single most important calibration decision in the design
  and it exists for the learner profile above.
- **Match K-factor is ~3× training K-factor.** Practice prepares; only matches
  make a rating true. This is what prevents grinding practice to inflate a stat
  before a hard opponent.
- **Elo makes easy-grinding a bad trade** rather than blocking it outright.
  Measured, not assumed: with SPREAD 25, 200 correct answers on items 35 points
  below rating move the rating about 11 points, and the same gain comes from
  fewer than 20 items pitched at the 0.75 target. A 10x tax, with diminishing
  returns per item as the rating pulls away. An earlier draft of this doc
  claimed ~2 points for 200 items; that was wrong, and no (SPREAD, K) pair
  satisfies it alongside the documented 91/9 odds at a 25-point gap. The real
  anti-grind protection is the combination of this tax, the 3x match weighting,
  and weakest-standard probing — not any one of them alone.

- **Ratings are floored at 20.** Below about 19, `difficultyForSuccess` wants a
  negative difficulty for the easier pressures, clamps to 0, and the player then
  gets items *harder* than the target — the opposite of what a struggling skill
  needs, and precisely the wrong dynamic for this learner. The floor keeps every
  pressure band achievable. Enforced in `derive.ts`, not in the Elo module,
  which stays a pure 0–99 function.
- **Decay** of 1–2 points per week on untouched standards, floored.
- **Confidence**: rarely-tested standards render as a dashed card segment —
  provisional, not yet proven. A lucky run cannot lock in a false number.
- **Big matches probe weakest standards inside a domain**, not the domain average,
  so a padded average cannot hide a specific hole. The anti-cheese mechanism and
  good teaching are the same mechanism.
- **PAC cannot be faked slowly** — computed from latency alone. Accurate-but-slow
  yields high DRI and low PAC.

### Try-out

24 questions, four per domain, adaptive up/down ladder starting mid-4th-grade.
Ten minutes. Outputs six starting stats, an overall rating, and a world rank
around 60th. Framed as a scouting combine, never as a test.

## The match

### Possession

Four zones. Each correct answer advances one.

| Zone | Difficulty | Feel |
|---|---|---|
| Own third | Easiest | Build from the back |
| Midfield | At level | — |
| Final third | Harder | Stretching |
| Shot | Hardest | Convert and it is a goal |

All zones are scaled so that even the shot sits around 60–65% success, not 30%.
Match difficulty comes from *chains* of questions, which keeps beating Brazil hard
while keeping each individual moment winnable.

### Shot selection

| Choice | Question | Payoff |
|---|---|---|
| Work it wider | Easier | Keeps possession |
| Inside the box | At level | Standard chance |
| Outside the 18 | Harder | More rank points |
| Bicycle kick | Hardest | Rare, spectacular |
| One-two | Two chained, both must land | Tap-in |

**The attempt counts on the courage track whether or not it goes in.** A missed
bicycle kick should feel good and the booth should love him for it. This is the
mechanism for manufacturing "I proved I could," deliberately and repeatedly.

### Losing the ball

A miss loosens the ball rather than ending the possession. The **tackle-back** is
a scaffolded sub-skill question decomposed from what he just missed, on a visible
~6s clock. Win it and possession is retained and the original question returns.
Lose it and the opponent drives at him — he answers defensive challenges to win it
back, and three unanswered in a row concedes.

The tackle-back clock is safe under the timing rule because the ball is already
lost; expiry cannot take anything he still holds.

### Shape

14 questions per match, 5–7 minutes, always ending at a whistle. Output is a real
scoreline (`Rionia 3–2 Brazil`) plus a post-match card showing which stats moved.

**Opponent strength is three dials**: question difficulty relative to his rating,
clock length, and number of tackle-back chances.

**Half-time** shows a 20-second scout report naming the domain hurting him, so
there is a decision to make in the second half.

## Feedback

**Hint → retry → show → review.**

1. **Miss** — no answer revealed. Tackle-back fires with the decomposed sub-question.
2. **Win the tackle-back** — original question returns; he solves it himself,
   producing the answer rather than receiving it.
3. **Lose the tackle-back** — worked solution appears (steps, not just the number)
   during the opponent's counter-attack, so correction happens without stalling play.
4. **Film room** — post-match, every miss with full worked solutions grouped by
   domain. Optional, with a Training Ground bonus for reviewing.

He is never left not knowing, and never simply told.

**Answer normalisation:** `7/8`, `7 / 8`, `0.875` and `14/16` are all judged on
merit; unreduced fractions are correct with a nudge. Losing a goal to a formatting
rule would poison the entire experience.

### How wrong a wrong answer was — *Rion's idea*

A miss is classified into one of four kinds:

| Kind | Meaning | In the fiction |
|---|---|---|
| `misconception` | Matches a known wrong answer, so we know exactly what he did | The keeper read it all the way |
| `near` | Wrong but in the neighbourhood — an arithmetic slip on a sound method | **Saved by the keeper** — it was on target |
| `off` | Not close; usually the method rather than the sum | A shot that never troubled the goal |
| `unreadable` | Could not be parsed. Re-prompt, do not score | Play stops, take it again |

His pitch was emotional accuracy — 43 for 42 does not deserve the same response
as 7 for 42 — and he is right. But it earns its keep by being *diagnostic*:
being one out usually means the method was right and the arithmetic slipped,
while being far out usually means the method itself was wrong. **That is how the
tackle-back chooses which scaffold to offer** — repair the computation, or go
back to the concept.

**It never touches scoring.** A near miss is still wrong: same Elo update, same
lost possession. If "close" earned rating, ratings would stop meaning anything
and near-missing would become a strategy.

Thresholds: within 10% relative error; or both integers and off by exactly one;
or an exact gap of a single unit fraction of 1/4 or finer. Note the last cannot
be implemented by comparing denominators, because `Rational` reduces on
construction and `6/8` arrives as `3/4`.

**When uncertain, classify as `near`.** Mis-labelling a real slip as "nowhere
near" tells a child who already doubts himself that he was lost when he was one
piece out. The opposite error merely offers a slightly mis-aimed hint.

## Coach and Tutor

**Coach = *how*.** Tactical, short, in-flow, triggered when the system detects a
pattern. Teaches **derived-fact strategies** ("9×7 is ten groups minus one: 70−7"),
which is the evidence-favoured route to fluency and is not rote drill. This is the
gentle nudge away from finger counting — which is never called out, never
penalised, and never shamed. The honest framing for why speed matters: automatic
recall frees working memory for the structure of the problem.

**Tutor = *why*.** On-demand, in the film room, with visual models — fraction bars,
area models, number lines.

### Misconception detection

For each standard, enumerate common misconceptions and their signature wrong
answers. `3/4 + 1/8 = 4/12` is not a random miss; it is the add-across error, and
it gets addressed as that specific misconception. **The game knows why he was
wrong, not just that he was.** This is the highest-value element of the teaching
design and it is a lookup table plus SVG.

### LLM tutor

Backed by Claude Sonnet 5, entered only from a specific missed problem.

**The LLM never does the math.** The generator produced the item, so ground truth —
correct answer, worked steps, matched misconception — is passed *into* the prompt
as established fact. The model explains and converses; it never derives. This
structurally removes hallucinated arithmetic rather than hoping a prompt prevents it.

Context per call: standard code and text, the problem, his answer, correct answer,
worked solution, matched misconception, current rating on that standard.

Guardrails:

- No general chat entry point anywhere; session-scoped to one problem
- Off-topic gets one warm redirect back to the work
- Hard cap ~8 exchanges, then hands back to practice
- Socratic by contract — forbidden from stating the answer; asks one question at a
  time at the level below the sticking point
- Full transcripts logged and readable by parents; kill switch in settings
- Verified by outcome: a fresh isomorphic problem follows the conversation, which
  both closes the loop and measures whether the tutor is earning its keep
- API key lives in a Cloudflare Worker, never the client
- Prompt caching on the stable system prompt

## Season

**Try-out** → **Preseason** (Training Ground and friendlies, grade-4, framed as
camp) → **Qualifiers** (best-of series, earns a berth) → **World Cup** (group of
three then knockouts, seeded by rank, ~7 matches) → **between cups** (rank
persists, decay ticks, grade-5 becomes the bulk as the school year moves).

### The competitive ladder is decoupled from the curriculum ladder

An earlier version of this doc had grade-5 content gating the World Cup. That
was wrong and it would have broken the game: it makes the trophy depend on
material he will not be taught until spring, so he either hits walls on
unfamiliar content or waits months for a first star. He would quit, and he would
be right to.

**The World Cup is winnable on grade-4 mastery alone.** A first trophy is weeks
away, not terms away. Grade-5 content raises the ceiling rather than gating
entry — new tournaments, stronger opponents, a second and third star. There is
always more to reach, and the nearest thing to reach is close.

Four mechanisms stop new content becoming a wall:

1. **Prerequisite gating, not calendar gating.** A grade-5 standard unlocks when
   its grade-4 prerequisites cross a rating threshold — `MT.5.NF.1` (unlike
   denominators) waits on `MT.4.NF.1` (equivalent fractions). That is the real
   prerequisite structure of mathematics: automatic, and needs nothing from
   anyone.
2. **New topics cannot damage the card.** A newly unlocked standard seeds at his
   *current domain average*, not at 50, and runs at reduced K while provisional.
   Being taught something new must never lower his card — that would punish him
   for the curriculum moving.
3. **Nothing debuts under match pressure.** A standard's first appearance is
   always in the Training Ground with a Coach introduction. He never meets
   unfamiliar content for the first time with a scoreline on the line.
4. **Unknown is not wrong.** First encounters are framed as new drills.

A scope-and-sequence from his teacher is a genuine enhancement but not a
dependency — prerequisite gating works without it. What it buys is *ordering*:
if fractions precede decimals in her plan, unlocks track her lessons and the
game starts feeling like it helps with tonight's homework.

### Onboarding

The Coach explains the game once, after the country is built and before the
try-out, in six screens, skippable and re-readable. Copy lives in
`docs/content/coach-explainer.md`. The last screen carries the two ideas the
whole design exists to deliver: **you can lose and still climb**, and **taking
the hard shot counts even when it misses**.

**Penalties** in knockouts only, on a draw. Five rounds alternating then sudden
death. A **fluency** test, not a difficulty spike — drama comes from the clock and
the stakes, never from an ambush with the hardest content in the game. PAC's
marquee moment.

**Stars.** Each World Cup win earns a permanent star above the crest. Opponents
wear their real counts: Brazil 5, Germany 4, Italy 4, Argentina 3, France 2,
Uruguay 2, Spain 2 (2026), England 1. The hierarchy is honest and doubles as the
difficulty signal, so fiction and challenge never disagree.

**The roster is 57 teams** — the 48 who qualified for 2026, plus nine notable
absentees (Italy, Nigeria, Denmark, Poland, Serbia, Chile, Cameroon, Wales,
Peru) who play friendlies and minor tournaments but not the World Cup, which is
exactly their real situation. Italy carries four stars and no place in the
field, which is a story in itself. Canonical data in `src/data/opponents.ts`.

Teams are identified by **kit colours and crest, not by an accurate national
flag**. That is how football actually works — the Netherlands is orange, Italy
is azure — and it avoids a procedural renderer that can manage Belgium but not
Brazil's globe. Only tier 1 gets generated portrait art; everyone else is kit
and crest, which the flag system already produces.

Fifty-six opponents rather than eight is what makes the ranking a ladder worth
climbing: friendlies stay varied for months, and beating a tier-2 side for the
first time is its own milestone.

**Streaks** are weekly, Sunday–Saturday (matching the chores app), kept by playing
3+ days. The visible number is weeks in a row, so one busy Tuesday costs nothing.

**Rank is the difficulty dial.** Because Elo pays for overperformance, a narrow
loss to a stronger side still climbs him — he can lose and get promoted, which
makes "effort counts even when you lose" arithmetic rather than a platitude.

**Growth is named out loud.** When a standard crosses a level that previously beat
him: *"Three weeks ago this beat you."*

**Any skip option appears only after a delay** — delaying access to problem-skipping
measurably increases effortful practice.

## Identity and art

**Flag designer**, procedural SVG: layout template (bands, tricolor, Nordic cross,
diagonal, quarters, saltire), two or three colours from a **curated** palette
(free RGB produces mud, and a good-looking flag is most of the pride), optional
charge from ~20 marks. Output composes at any size — flag, badge, crest, bracket
icon, ranking marker.

**Kit** derives from the flag: two colours plus a pattern. **Crest** is a shield
carrying the flag motif with stars above.

Country creation comes **before** the try-out, so he plays as something he made
from the first minute.

**Characters** are generated externally with Gemini / Nano Banana, chosen for its
character-consistency strength. A **locked character sheet** — one fixed physical
description appended verbatim to every prompt — is the technique that keeps him
the same person across images.

| Asset | Count |
|---|---|
| Rion — card portrait, celebration, ready | 3 |
| Opponent captains | 8 |
| The Coach | 1 |
| The Analyst | 2 |

Placeholders ship first; art is never the blocker.

## Tech

React 19 + TypeScript + Vite + Tailwind 4 + framer-motion — the chores-app stack,
so the eventual merge is a merge and not a rewrite. Rejected Phaser/PixiJS: this
is a turn-based state machine with animated transitions, not a physics game.

Local-first storage; Supabase only when the apps join. Cloudflare Workers for
deploy plus one Worker function for the tutor proxy.

**The data model is an append-only `attempts` log** — standard, item parameters,
his answer, correctness, latency, context — with ratings, stats, film room and
parent view all derived. Same event-sourced shape as the chores app; rating maths
can change and everything recomputes.

**Non-negotiable test rule:** every item generator carries a property test proving
its emitted answer key is correct across the full parameter range. Marking Rion
wrong when he is right is the single most damaging bug this software could have.

## Scope

**By day one of school (2026-08-25):** country and flag creator, try-out, Training
Ground, match loop with tackle-back and shot menu, card and radar, friendlies,
misconception tables for the highest-value grade-4 standards.

**Immediately after:** qualifiers and a tournament, commentary, LLM tutor and its
Worker backend, World Cup and stars.

**Through autumn:** grade-5 generators, arriving at roughly the pace they arrive
in his classroom — which is better sequencing than front-loading anyway. The three
weeks only owe grade-4 rust removal: 28 standards, with fractions and multi-digit
work weighted first.

**Chores integration comes last**, after the multi-kid refactor of `finns-chores`.
Pays weekly for habit — streak weeks kept, courage attempts, film reviewed. Never
per win, never per correct answer.

## Deferred

- **Multi-kid refactor of `finns-chores`** — `children` table, per-kid wallets and
  rules, neutral branding. Rion tracks chores there too.
- **Supabase Auth** replacing the device-role hack in the chores app; real RLS.
- **Reading skill game** for Rion, and usable by Finn. Side project after this one.
- **ATProto** — evaluated and rejected: repos are public by construction, kids
  cannot hold accounts (13+), no query layer, and the deadline. Revisit only if
  public portability ever becomes a goal.
- Generated (rather than templated) match commentary.

## Known data issues in the source standards

- **`MT.4.MD.5.a` is truncated upstream.** Its statement ends mid-clause:
  "…is equal to 1/360th of the circle, and". This is Montana's own published
  CSV, not a parsing artifact — verified against the raw file. Preserved
  verbatim rather than patched. Do not render it raw to the child; the angle
  generator should supply its own wording.
- **`MT.MP5` and `MT.MP6` are malformed** (missing the dot that `MT.MP.1`–`.4`
  have). Outside the grade 4–5 filter, so harmless now; matters only if the
  Mathematical Practices are ever pulled in.
- **Component statements restate their parent inside `*…*`** then continue, so a
  component's full text reads "parent + specific". Preserved verbatim; display
  layers must decide whether to strip the prefix.

## Measurement caveat: MT.4.NF.2 has a guess floor

`MT.4.NF.2` (compare two fractions) asks the child to type back the greater of
two fractions, because `AnswerSpec` carries rational values only. That makes it
effectively binary: **chance alone scores 0.5**, so targeting 0.75 success is
aiming just 25 points above guessing, and this standard's rating will read high
relative to the other fraction standards.

Consequences are bounded — it is one of seven NF standards feeding `DRI`, and
weakest-standard probing means an inflated rating simply gets probed less. But
it is a real validity gap, not a rounding error. Fixes, cheapest first:

1. Offer three fractions rather than two at mid and high difficulty, dropping
   chance to 0.33.
2. Add a per-standard guessing parameter to the rating update — the standard
   three-parameter IRT correction.
3. Extend `AnswerSpec` with `kind: 'choice'` and handle it end to end.

Decide before ratings drive anything consequential. Not blocking Phase 1.

## Generator tuning noticed while playing

None of these are wrong, but each wastes a question or reads badly. Worth a
pass once the game is playable end to end.

- **`FLU.MULT` emits ×0 and ×1 facts at mid difficulty.** The first question of
  a real try-out came up as `1 × 2` at difficulty 45. It is not wrong, but it
  measures nothing, and the try-out only has four fluency questions to spend.
  Those facts belong at the bottom of the band.
- **`MT.4.NBT.4` can open with `9327 + 7504`** at difficulty 45 — a heavy first
  impression for a child who is wary of maths.
- **`MT.4.MD.1` asks "How many cups are in 7 gallons?"** at difficulty 69, which
  needs a memorised 16-cups-per-gallon fact rather than reasoning about units.
- **`MT.4.OA.4`'s multiple framing is wordy**: "Is 210 a multiple of 3? Give the
  remainder when 210 is divided by 3 — a remainder of 0 means yes." That is a
  lot of reading before any thinking starts.
- **The fiction and the arithmetic drift apart at the bottom of the scale.** For
  a weak player, "the hardest thing on the pitch" — the bicycle kick, which
  targets 0.38 success at *his* rating — generated `2 × 1`. `select.ts` is
  behaving exactly as specified; the problem is that the label promises
  spectacle and the question delivers a times-table fact. Either the shot copy
  should soften when the drawn difficulty is very low, or the bicycle band
  should have an absolute floor as well as a relative one.

## Open items

- Locked character sheet text — to be written with Scott before art generation.
- Whether the shot menu should tie shot type to domain (currently: no, shot type
  sets difficulty only; the adaptive engine picks the domain).
