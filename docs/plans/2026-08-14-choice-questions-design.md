# Multiple choice and true/false

> **Status, 14 Aug 2026.** Built, including the tackle-back narrowing.
> `MT.4.OA.4` asks its yes/no question as one, `MT.4.NF.2`'s comparisons are
> explicit two-option choices, and `MT.4.G.1` names an angle from three.
> `MT.4.NF.1` was in the plan and is not built.
>
> One thing the parry turned up that the design below did not anticipate: winning
> a tackle-back restores the question that was missed, so a parried choice would
> have been asked a *third* time and paid for twice. `MatchState.parried` records
> that the tackle-back was the same question, and winning it moves on instead.
> Losing is unchanged — he still gets the worked solution.

Rion's dad, on the question that prompted this:

> The "answer 0 for yes" is clunky.

He is right, and it is not a copy problem. `AnswerSpec` is
`{ kind: 'rational'; canonical: string }` — the checker can only grade a number
— so every question whose real answer is a *judgement* has to be smuggled in as
arithmetic. Two places do it, and both apologise for themselves in their own
source comments:

- `MT.4.OA.4`, `REMAINDER`: *"Is 348 a multiple of 6? Give the remainder when
  348 is divided by 6. 0 means yes."* The question is yes/no and the box wants a
  number, so the child is asked to encode one as the other.
- `MT.4.NF.2`, six of seven formats: the standard says *"record the results of
  comparisons with symbols >, =, or <"*, which cannot be typed at all. He types
  the winning fraction back instead. The generator's header already calls the
  resulting 50% guess rate "a known validity gap".

So this is one fix, not two features: teach the answer model to grade a choice.

## Decisions taken

Three were put to Scott before anything was written.

**Scope: fix the two, then add variety.** Repair `MT.4.OA.4` and `MT.4.NF.2`,
then add choice formats to two more generators where the maths suits it. Not all
thirteen — every generator touched needs its soundness proof redone, and that
cost is only worth paying where the format is genuinely better than a typed
number.

**Guessing: correct the rating for luck.** A true/false is right half the time
from nothing. Left uncorrected, choice questions would inflate the card, and an
inflated card is the one thing this project has consistently refused — the whole
`provisional` mechanism exists so the card never claims more than it has
evidence for.

**On a miss: the keeper parries it.** A second chance with the field narrowed.

## Two places the decision did not survive contact with the code

Recorded here rather than quietly reinterpreted.

**The tackle-back does not re-offer the question.** It generates a *different,
easier* item, from the standard underneath the one he missed (`PREREQUISITE`), at
a 0.90–0.95 target. "One wrong option removed" only makes sense against a
mechanism that shows the same question again. So: a missed choice with **three or
more options** re-offers the same item minus one distractor, which is what was
asked for and needs no generation at all. Where the standard has a prerequisite
and the item was typed, nothing changes.

**"The ball is lost" on a true/false is refused.** The chosen option said a
true/false miss goes straight to the worked steps and the possession ends. That
contradicts *"a miss never ends a possession"*, which is not a detail — it is in
the README, the match engine and the Coach's explainer, and it exists because
this child freezes when a single mistake can cost him something he already holds.
A two-option miss therefore falls through to the ordinary scaffold. Two options
cannot be narrowed to one without handing over the answer, so there is nothing
else to give him.

## The answer model

```ts
export type AnswerSpec =
  | { kind: 'rational'; canonical: string }
  | { kind: 'choice'; options: string[]; correct: number }
```

True/false is a two-option choice, not a third kind. A `trueFalse()` helper
builds it and the input renders two options as a wide pair, but nothing
downstream — grading, the log, the rating, the film room — needs to know the
difference. A separate kind would be a second thing to prove sound for no gain.

`checkAnswer` on a choice does an exact match against `options`, with no
normalisation. The input hands back one of the strings it was given, so a
mismatch is a programmer error rather than a child's typo — which also means a
choice can never come back `unparseable`, and the "I can't read that" path stops
existing for these questions.

**A distractor is a misconception with somewhere to live.** `Misconception`
already carries a `signature` — the wrong value the mistake produces. For a
choice, the signature is the option text, so a wrong pick is diagnosed by name
instead of by distance. This is a straight upgrade: `classifyMiss`'s near-miss
logic is meaningless on a choice (you picked it or you did not), and naming the
mistake is what the near/off distinction was approximating in the first place.

## Correcting for luck

```ts
const e = floor + (1 - floor) * expectedScore(rating, difficulty)
```

where `floor` is `1 / options.length`, and `0` for a typed answer. A child who
knows nothing still scores `floor`, so the expected score rises to meet it: a
correct true/false earns roughly half what a correct typed answer would, and a
wrong one costs more, because it was a question he was expected to get.

`difficultyForSuccess` is deliberately **not** corrected. Item selection targets
75% success *on merit*; observed success on choice items will run higher than
that, and that is the right way round. Targeting 75% observed would mean picking
items he only knows half the time, and a coin flip is the calibration this
project rejected at the start.

The log has to carry this, because everything is derived from the log and nothing
is stored as a total. `Attempt` gains an optional `choices?: number`. Optional
keeps every existing attempt valid and floors it at 0, so replaying the whole
history under the new rules leaves old numbers untouched.

**Known consequence:** these questions will move his card noticeably less. That
is honest, and it is also the kind of thing a ten-year-old notices. Watch whether
it reads as "these ones don't count".

## Where the new formats go

| Generator | Change |
|---|---|
| `MT.4.OA.4` | `REMAINDER` splits: a true/false *"is 348 a multiple of 6?"*, and a numeric *"what is the remainder?"* — a good question once it is not doing two jobs. The `0 means yes` sentence goes. |
| `MT.4.NF.2` | The two-way formats become explicit two-option choices, which makes the guessing visible and now correctly priced. A new three-option `>` `<` `=` format finally assesses the half of the standard that was unreachable. |
| `MT.4.G.1` | Vocabulary and shape properties, which is where multiple choice is the honest format rather than a compromise. |
| `MT.4.NF.1` | True/false on equivalence: *"is 2/3 the same amount as 6/9?"* |

## Input

A new `ChoiceInput` beside `QuestionInput` rather than a branch inside it. That
file's contract — nothing in here judges the answer, no clock, an empty submit
costs nothing — carries over unchanged, but a numpad and a set of options share
no markup worth reusing.

Tap selects; the same gold key commits. Not one-tap-commit: the numpad's rhythm
is already type-then-enter, and a mis-tap that instantly costs possession is
exactly the kind of unearned loss this game is built to avoid. Number keys select
and Enter commits, for the iPad with the keyboard.

## Proving it

`assertGeneratorSound` gains, for choice items, across every difficulty and 400
seeds:

- at least two options, all distinct
- `correct` in range
- **no distractor is also a correct answer** — the catastrophic case, because it
  marks a right answer wrong, which the harness exists to make impossible
- the independent `verify` recomputation agrees on *which* option is right,
  never reusing the generator's own arithmetic

Plus: no `MT.4.OA.4` question says "means yes"; a replay of an attempt log
containing choices produces the same ratings twice; and old saves with no
`choices` field derive exactly as they did before.
