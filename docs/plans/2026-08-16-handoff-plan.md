# Handoff plan — profiles, device sync, and the review's Tier 1

Written by the outgoing model as project manager, 16 Aug 2026, for the model
taking over (expected: Sonnet). Scott is the human in the loop.

**The principle of this document: decisions are already made.** Where a design
choice appears below, it was weighed against this project's history and its
child-specific constraints. Execute it; don't relitigate it. If you hit a
genuine contradiction with the code, stop and tell Scott which decision broke
and why — do not quietly substitute your own.

## Read these first, in order

1. `README.md` — the three gates, the architecture, and the child-specific
   design rules. **The gates are exit-code checks: `npx tsc -b --force`,
   `npm run lint`, `npm test`. Never pipe them through `tail`/`head`/`grep`;
   this repo has been burned twice by masked exit codes.**
2. `docs/reviews/2026-08-16-quality-review.md` — why these work packages exist.
3. `docs/plans/2026-08-02-world-math-cup-design.md` — the pedagogy and the
   child. Rion is 10, capable, freezes at things he fears are too hard, and
   timed work cost him recess last year. Every odd rule traces to that.
4. `docs/plans/2026-08-14-choice-questions-design.md` — the answer model.

## House rules you may not break

- The word "wrong" appears nowhere in the UI. No streaks. Nothing counts days
  off. A miss never ends a possession. One clock in the game (tackle-back),
  removable in Settings. These are asserted by tests; keep the tests green by
  keeping the promises, not by editing the tests.
- Every generator change re-proves through `assertGeneratorSound`. Never
  loosen a harness check to make something pass.
- The store is an append-only attempts log; everything derived. New state that
  is genuinely not derivable (campaign progress, profile identity) is added as
  a validated `GameState` field with a corruption-tolerant validator, like
  `country` and `settings`.
- Commit style: explain *why*, record what was found broken, name what was
  measured. Read the last 30 commit messages to calibrate.
- Verify in the browser preview when a change is visible. Seed
  `localStorage['wmc_v1']` to skip gates (see any recent session's pattern:
  country + 24 tryout-context attempts + `coachExplainerSeen: true`).

---

## Task 0 — put the repo on GitHub (do this before anything else)

`~/world-math-cup` has **no remote**. 90+ commits exist on one laptop, and the
app is deployed and in use. Handing local-only work between models multiplies
the risk of loss.

```bash
gh repo create world-math-cup --private --source ~/world-math-cup --push
```

Scott must be present (his `gh` auth). Acceptance: `git remote -v` shows
origin; `phase1` pushed.

Estimate: 15 minutes.

---

## WP1 — profiles and device sync (P0, Scott's explicit ask)

> **Status, 16 Aug 2026.** Built and gate-green (tsc 0, lint 0, 1234 tests).
> `README.md`'s new "Device sync" section is the map of what exists; read that
> first. Task 0 (the GitHub remote) is also done — `phase1` is pushed and
> tracked at `github.com/smcgrath-coder/world-math-cup`.
>
> **What Scott still has to do, and only Scott can:** run `supabase/schema.sql`
> once in the SQL editor, and put the project's URL and anon key into
> `.env.local` (copy `.env.example`). Until then the whole feature stays
> invisible by design — no Family row, no behaviour change at all. After that,
> the one thing worth doing by hand that no test can stand in for: actually
> play on two devices and watch them converge.
>
> One thing the build turned up that this plan's own sync design did not
> anticipate, on top of the sequential-id landmine it did call out: a naive
> "always push now()" last-write-wins would let a freshly linked,
> never-touched device overwrite a real save with its own blank defaults just
> by syncing first, because being the newest thing to run would always win.
> The fix — a device only pushes when live state genuinely differs from what
> it last knew, never on its first sync with nothing local to offer — is in
> `syncEngine.ts` and mutation-tested in `syncEngine.test.ts` under the name
> "THE SAFETY PROPERTY".

**Goal:** Rion starts on the laptop, picks up the iPad, and his country, card,
and history are just *there*. A small menu covers "who is playing" and "link
this device". This also closes the review's Tier 1 #3 (save durability —
currently one localStorage key and manual copy-paste JSON).

### Decisions made

**Backend: Supabase, same project as finns-chores, new tables prefixed
`wmc_`.** One dashboard for Scott, infra he already operates, anon key + RLS
exactly as finns-chores does. The reference implementation for the join flow
is `~/finns-chores/src/screens/FamilyBootstrap.tsx` and its `lib/` — a
6-letter code creates or joins a household; no emails, no passwords. Children
cannot hold accounts; this was settled in the ATProto discussion and stands.

**Identity model:** `wmc_households` (id, invite_code) → `wmc_players` (id,
household_id, name, save fields). One household code entered once per device,
then a player picker ("Who's playing?"). Rion is the only player today;
the picker exists so a second child is a row, not a rewrite.

**Sync model — read carefully, this is where the landmine is.**

The store is event-sourced, which makes sync *almost* trivial: attempts are
append-only, so merging two devices is a set union. But attempt ids are
**sequential** (`a000042`, minted by a local counter — see `attemptIdFor` in
`src/store/storage.ts`). Two devices playing independently mint the *same id
for different attempts*. Union-by-id silently discards one device's work,
which is the single worst data bug this app could have. Therefore:

- Each device generates a `deviceId` once (short random string, stored beside
  the save).
- On upload, an attempt's cloud identity is `(player_id, device_id, local_id)`
  — three-column PK, insert `on conflict do nothing`.
- On pull, attempts from *other* devices are inserted into the local log with
  their ids prefixed: `{deviceId}-{id}` (e.g. `ipad1-a000042`). The local
  validator accepts any non-empty id, and `seqOf` returns 0 for non-matching
  ids, so the local counter is untouched. Dedupe locally by exact id.
- Known, accepted consequence: `byTime` breaks ties by id, so same-millisecond
  ties can order differently across devices. Elo effect is negligible; note it
  in a comment, don't fight it.
- `country`, `settings`, and (after WP2) `campaign` sync as a single
  `wmc_players` row, last-write-wins by an `updated_at` the client sets.
  Concurrent same-afternoon edits to *settings* are trivial; to *campaign*
  are unlikely and acceptable under LWW. Document in-code.

**Offline-first, non-negotiable:** the local store remains the source of
truth. Sync runs opportunistically — on launch, after a session's flush, on
`visibilitychange` — and failure is silent retry. **No spinner, no error, no
network state is ever shown to Rion.** A small "last synced" line lives in
Settings' grown-up section only. The game must be fully playable with zero
network forever.

**Migration of the existing save:** on first link, the local save adopts into
the chosen player (upload everything under this device's id). Never wipe
local on link. The existing export/import stays as the fallback and gets a
one-line mention in the grown-up section.

**The menu:** do not add a login wall. The app boots exactly as today; a
"Family" row in Settings' grown-up section opens: create household / enter
code / pick player / last synced. First-run with no link changes nothing.

### Acceptance

- Two simulated devices (two browser profiles) play interleaved sessions;
  after sync both show the identical union — asserted by a test at the sync
  module level with fake transport, and verified once by hand in two browsers.
- Property test: merge of any two valid logs is idempotent, commutative, and
  loses nothing (generate logs with colliding sequential ids on purpose).
- Corrupt cloud rows are dropped exactly as corrupt local attempts are
  (reuse `validateAttempt`), never crashing a session.
- RLS: household rows readable/writable only with the household id obtained
  via invite code (mirror finns-chores' policies; Scott runs the SQL in the
  dashboard, you write it for him).
- All three gates; no new words shown to Rion beyond the player picker.

**Estimate: 1.5–2 agent-days.** Scott: ~30 min Supabase (run provided SQL,
paste URL/key), plus on-device two-browser test.

---

## WP2 — the World Cup (P1, the review's #1)

**Goal:** the tournament the game's name promises. Verified missing: `stars`
is never incremented, no campaign state exists, `'group'` stakes is
unreachable from the UI.

### Decisions made

**Format:** qualify → group → knockout, 32 teams from the roster's
`inWorldCup` flags.

- **Qualification:** win 2 of a 3-match qualifying series against mid-tier
  opponents to enter a cup. Short, earnable, re-attemptable immediately.
- **Group:** 4 teams, 3 matches, top 2 advance on points (W3/D1/L0, goal
  difference tiebreak). Losses are survivable by construction — this is why
  groups exist here.
- **Knockout:** R16 → QF → SF → Final, single elimination using the existing
  `knockout` stakes (possession threat already implemented).
- **Elimination is kind and cheap to retry:** the run ends, PostMatch leads
  with what climbed (it already does), and a new qualifying series is
  available *immediately*. No lockouts, no waiting. The cup run is an arc,
  not a punishment.
- **Seeding is rigged, openly in code comments:** tiers seed the bracket so
  tier-1 sides appear from QF on, and the highest-rated qualified team (Spain,
  per Scott's "final boss" call) is placed on the opposite bracket half so a
  full run meets Spain in the final whenever Spain survives.
- **Winning the final increments `country.stars`.** The crest and PlayerCard
  already render stars; that band has been waiting since phase 1.

**State:** `GameState.campaign` — nullable, validated, corruption-tolerant
(a corrupt campaign resets to null and costs a run, never the log). It stores
the fixture list, results (scorelines are *not* recoverable from the attempts
log — established in the film-room design), and stage. Campaign logic is a
pure reducer in `src/engine/` with the same testing style as `match.ts`.

**UI:** Play screen gains a campaign card above the exhibition list ("The
road to the cup" — current stage, next fixture, group table when in groups).
Exhibitions remain below, unchanged; they are practice and should say so.

### Acceptance

- Reducer property tests: no sequence of results can strand a campaign in an
  unreachable state; eliminated → new qualifying always available; stars
  increment exactly on a won final.
- Simulated full runs at ratings 40/60/80 across many seeds: report win rate
  of a full cup (Scott reviews the numbers — a cup should be *hard* at 58,
  plausible at 75+; tune with the existing opponent dials only).
- Group table math pinned by tests (points, GD, tiebreak).
- The word "eliminated" — check the tone against the no-"wrong" tests; prefer
  "the run ends here" language. PostMatch after elimination must lead with
  rating movement exactly as after any loss.
- Browser-verify a full campaign with a seeded save.

**Estimate: 1–1.5 agent-days.** Scott: playtest one full run, judge the feel.

---

## WP3 — draw the maths (P2)

**Goal:** figures for questions that are intrinsically visual. G.1 already
ships exact integer vertex coordinates in `params` and describes the shape in
prose anyway; fraction standards ship `a`, `b`, `mult`, `targetDen`.

### Decisions made

- New display-only component (`ItemFigure`) rendering from `params` alone.
  It must not import from generators, and grading is untouched — the harness
  does not change.
- **Per-format leak rules — this is the part to get right.** A figure may
  show *the given*, never *the wanted*:
  - G.1 counting/identify: draw the polygon from vertices. The answer being
    visible in the figure is not a leak — "identify these in two-dimensional
    figures" *is* the standard; we finally assess it as written. Expect G.1
    ratings to rise; that is validity improving. Note it in the component
    header.
  - NF.1 `MISSING_NUMERATOR` / `MISSING_DENOMINATOR` / `SCALE_FACTOR`: draw
    the *source* fraction only as a bar. Never the target.
  - NF.2 comparisons: draw *neither* fraction. A drawn pair answers the
    comparison at a glance and deletes the question. (Benchmark formats
    included.) NF.2 gets no figure in this pass.
  - When any format is in doubt: no figure. Absence is always safe.
- Do **not** simplify prompts in this pass, even where a figure makes words
  redundant. One change class per PR; prompt trimming is a follow-up with its
  own soundness re-run.
- Both themes, `viewBox`-scaled, no fixed pixel sizes, and the figure sits
  between prompt and input in all three question surfaces plus the film room.

### Acceptance

- A test walks every generator × difficulty × many seeds through the figure
  component's decision function and asserts the leak rules (e.g., NF.1
  missing-numerator figure never encodes `scaledNum`).
- Screenshot pass in the browser at iPad width, light and dark.
- Gates green; zero generator diffs in this PR.

**Estimate: 0.5–1 agent-day.** Scott: eyeball the figures with Rion if
possible — a child's read on "does this picture help" beats ours.

---

## WP4 — rust, said out loud (P3)

**Goal:** decay currently lowers displayed stats silently after time away,
which is the sworn-off guilt mechanism with the sound muted (review Tier 1
#4).

### Decisions made

- Everything is derived, so compute both `ratingClean` (no decay) and the
  current decayed rating; **rust = clean − decayed**, per standard.
- While rust > 0 on a standard, correct answers on it apply K × 2 until the
  clean level is regained, capped so restore cannot overshoot the clean
  rating. Relearning is genuinely fast; the mechanic makes that true instead
  of asserting it.
- Card UI: rusted points render as a subdued extension of the stat (visually
  "your 93 is under there"), not as a loss. One Coach line in the training
  ground when a rusted stat is selected: shake-the-rust-off framing.
  PostMatch already has burn-off language — connect to it.
- No dates, no "you were away", no counts of days, anywhere. Asserted by
  extending the existing document-scanning tests.

### Acceptance

- Derive tests: rust computed correctly; K×2 applies only while rusted; cap
  holds; a log with no gaps has zero rust everywhere.
- The existing "nothing counts days off" scans still pass with the new copy.

**Estimate: ~0.5 agent-day.**

---

## WP5 — juice stubs (P4, unblocks Scott's assets)

- SFX module shaped like `music.ts` (lazy elements, respects `soundEnabled`,
  no preload): `playSfx('goal' | 'whistle' | 'save' | 'crowd')`, silently
  no-op when a file is missing. Wire call sites now; Scott drops files into
  `public/audio/sfx/` later and they just work. Add the names to
  `check-assets.mjs` **only once files exist** (missing-by-design must not
  fail deploy).
- Goal celebration: `rion-celebration.png` on the goal beat / won final only
  — placement rules in `docs/art/placement.md` are binding (never near a
  loss).
- Courage floor: a hard shot (outside18/bicycle) pays courage only if the
  drawn item's difficulty cleared a floor relative to his rating; engine
  change + tests. Small, but it guards the future money link.

**Estimate: ~0.5 agent-day combined.**

---

## Sequence, estimates, and what needs Scott in person

| # | Package | Agent effort | Scott |
|---|---|---|---|
| 0 | GitHub remote | 15 min | present for auth |
| 1 | Profiles + sync | 1.5–2 days | 30 min Supabase + device test |
| 2 | World Cup | 1–1.5 days | one full playtest |
| 3 | Figures | 0.5–1 day | eyeball with Rion |
| 4 | Rust | 0.5 day | — |
| 5 | Juice stubs | 0.5 day | SFX files, whenever |

**Total: 4–5.5 focused agent-days.** Calendar: 1–2 weeks, and the constraint
is Scott's testing loops, not agent throughput. WP1 and WP2 are independent
and could run in either order, but do WP1 first — laptop→iPad is the family's
immediate need, and durability has a real deadline (the save gets more
precious every week Rion plays).

Ship after each package (`npm run deploy`); nothing here needs to batch.

## Backlog, deliberately not in this handoff

Grade-5 generators (the long pole — schedule separately, roughly one sound
generator every few weeks through autumn), the activity/session-summary layer,
prompt simplification after figures land, the tutor/coach LLM modes, and
everything in the README's "deliberately not built" list, which stays decided.
