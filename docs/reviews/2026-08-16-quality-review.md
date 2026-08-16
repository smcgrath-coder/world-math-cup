# Quality review — will this be fun, and what did we miss?

Commissioned by Scott, 16 Aug 2026, after deploy. The brief: hold the whole
project up to the light. Does it hold up, what should have been done
differently, and — the core question — will Rion *enjoy* it? The reference
point is Math Blaster: the maths mattered, but the game around it is what a
kid remembers thirty years later.

Every claim in Tier 1 was verified against the code today, not recalled.

---

## The honest verdict on fun

**The meta-game is strong and the moment-to-moment game is thin.**

What we built is FIFA career mode: a card with your face on it, ratings that
respond to what you actually do, scouting Brazil and discovering they are 92
DRI against your 58, a world rank, a crest waiting for stars. For a
FIFA-native ten-year-old that loop — scout, spot your gap, train, compete —
is genuinely compulsive, and it is the loop the whole engine serves.

But Math Blaster's junk food was second-to-second: things exploded, sounds
fired, the maths was almost incidental to the *feel*. Our second-to-second
loop is: read a prompt → answer → a dot moves on a small pitch → next prompt.
Every single action in a match is a question. The shot menu and the
tackle-back are real game decisions — risk/reward that a quiz doesn't have —
but they are the only two.

Prediction: the first two or three sessions are delightful (his own country,
his own flag, his own card). Weeks two through four are the risk window, and
the items below are ranked by what closes that risk.

---

## Tier 1 — think hard. If we were redoing, start here.

### 1. There is no World Cup in World Math Cup

Verified: `stars: 0` is set at creation, validated by storage, and
incremented by **nothing**. There is no campaign, bracket, or qualification
state anywhere in `src/`. The `'group'` stakes value exists in the engine and
is not reachable from the Play screen — the UI offers friendly/knockout on a
pick-any-team exhibition list.

The game's name, its crest mechanic, the Coach's framing, and the reward
Scott designed ("stars for each World Cup won") all promise a tournament.
What ships is exhibitions with a drifting rank number. Rion plays FC — he
will ask "how do I get to the cup?" in session one, and the honest answer is
that he can't.

Everything needed already exists: stakes, knockout possession threat, the
roster's `inWorldCup` flags, tiers, the match engine. What's missing is one
state machine — qualify at some rank, group draw, R16 → final, star on the
crest, roster rotates. This is the single highest-leverage piece of work left
and it is pure game structure, no new pedagogy.

### 2. Everything is prose in a game for a visual-first age group

`MT.4.G.1` describes shapes in a paragraph — "a four-sided shape has a level
bottom side 7 centimeters long…" — while shipping exact integer vertex
coordinates in `params` (verified: `x0..xn, y0..yn` on every item). We wrote
elaborate constraints ("no ambiguous names") to survive not having a picture,
when the picture was in our hand the whole time. Rendering it is display-only
and cannot touch grading.

Same story for fractions: NF.1's standard *literally says* "using visual
fraction models," and the whole idea (cut every piece smaller, the amount
stays put) is intrinsically visual. We render zero diagrams. Fraction bars
and drawn polygons are simultaneously the biggest pedagogy upgrade and the
biggest fun upgrade available, and they reuse data the items already carry.

This is the clearest "should have done differently": we built a text engine
first and treated visuals as decoration, when for this age they are the
medium.

### 3. Months of a child's identity in one localStorage key

The save lives on one device with manual copy-paste JSON as the only backup
(verified: `exportJson`/`importJson` in Settings, nothing else). iOS storage
for installed PWAs is reasonably durable, but "Clear Website Data," a device
reset, a lost iPad — any of these deletes his country, his card, and every
question he ever answered.

Losing a three-month card is the single worst *emotional* event this app can
produce, for exactly the child it was built to protect. The chores app
already has Supabase; a one-row save sync, or even an automated
export-reminder to a parent, is cheap. This should land before the save is
three months old, which is a real deadline.

### 4. Decay contradicts its own house rule — quietly

The design swears "nothing counts days off," and no screen says a word about
absence. But decay (1.5/week) still lowers the displayed numbers, silently
(verified: no UI anywhere explains a fallen stat). A ten-year-old memorises
his stats. Two weeks at grandma's, DRI is 93 → 90, and the game has — in
effect — punished the days off while being too polite to say so. That's the
guilt mechanism we swore off, wearing a mute button.

The fix is framing plus mechanics, not removing decay (spaced repetition is
right): show it as *rust*, and let the first drill back burn it off fast —
which is also how relearning actually works. PostMatch already has the
"burned off the rust" language; the concept exists and just isn't honest on
the card.

---

## Tier 2 — real attention, soon

**5. Juice.** Scott is making sound effects now — good, wire them the moment
they land: goal, whistle, crowd swell, save. Add a real goal celebration beat
(the art's `rion-celebration.png` is placed for exactly this and still
unused). This is the Math Blaster layer and it is currently the thinnest
part of the product.

**6. Progression pacing.** Honest Elo plus the guessing correction means the
card moves slowly, and we documented "watch whether choice questions read as
'these ones don't count'." Number-go-up is the dopamine at ten. Consider an
honest activity layer that moves fast while ratings stay slow — drills
completed, balls won back, courage count — prominently displayed. Never
day-streaks; session-scoped only.

**7. Courage integrity before money attaches.** The bicycle kick can draw a
trivial question (known issue). Courage counts feed the chores-app reward
eventually — real money. Farmable courage is a small hole now and a
trust-damaging one later. Fix by making hard shots draw from the top of the
band, or by paying courage only when the drawn difficulty cleared a floor.

**8. The content runway is now the long pole.** Thirteen grade-4 generators
took the whole project. Grade-5 "arriving at classroom pace" through autumn
is a commitment of roughly one sound generator every few weeks, each with an
independent verify. Schedule it like the ongoing work it is, or the game
goes stale exactly when school passes it.

---

## Tier 3 — worth saying, probably fine

- **A missed true/false is the biggest single rating drop in the game**
  (expected score 0.75 at even match, so a miss costs 1.5× a typed miss).
  The maths is correct — he neither knew nor got lucky — but watch the feel.
- **Timers default on.** The tackle-back clock is safe by design (can only
  gain), but if the bar visibly stresses him in week one, flip the default
  rather than waiting for him to find Settings.
- **Reading load.** Word-problem formats are wordy for a child who freezes.
  Visuals (Tier 1 #2) are the real fix; until then it's worth watching which
  formats he bounces off in the film room data.
- Known and accepted: the 380px answer-box wrap, the film room's "not on the
  tape" for reloaded matches, `tournament.m4a`'s soft opening, the deliberate
  omissions list in the README (symbol format, sound effects, grade-5).

---

## What holds up

Said briefly, because it's real: the soundness harness (a wrong answer key is
a *property*, caught twice already), the event-sourced store (every rating
rule change recomputes history), miss classification that names the mistake
instead of measuring it, the guessing correction with old saves untouched,
the child-specific rails (no "wrong" anywhere, no streaks, one safe clock, a
miss never ends a possession — asserted by tests, not intended), the
case-sensitivity deploy gate, and the three-gate discipline that caught
`tsc` failures a thousand green tests missed. 1,172 tests. The engineering
is the strongest part of this project.

Which is the review in one sentence: **we built a rigorous, kind tutor
wearing a football kit, and the remaining work is to build the football.**

## If redoing from here, in order

1. The tournament arc (Tier 1.1) — the fantasy the whole game promises.
2. Draw what we already carry: polygons and fraction bars (Tier 1.2).
3. Save durability (Tier 1.3) — before the save is worth crying over.
4. Rust framing + fast restore (Tier 1.4).
5. SFX wiring + goal celebration when Scott's assets land (Tier 2.5).
