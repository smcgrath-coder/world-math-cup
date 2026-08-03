/**
 * The soundness harness that every item generator must pass.
 *
 * Marking Rion wrong when he is right is the single most damaging bug this
 * software could have. There will eventually be about a dozen generators, each
 * emitting its own answer key, and no amount of care while writing one is
 * evidence that its key is right. This file is the evidence.
 *
 * The load-bearing idea is the `verify` callback: the test recomputes the
 * answer from `item.params` *without* going near the generator's arithmetic. A
 * generator that agrees with an independent recomputation across its whole
 * difficulty range and hundreds of seeds is trustworthy in a way that a
 * generator checked against itself never is.
 *
 * Write `verify` from the standard's definition, not by reading the generator.
 * Copying the generator's expression into `verify` produces a test that passes
 * by construction and proves nothing — the one failure mode this file cannot
 * detect for you. (`Rational` itself is common to both sides by necessity; that
 * risk is carried by `rational.test.ts`, which is why it is tested as heavily
 * as it is.)
 *
 * NEVER loosen a check in this file to make a generator pass. Fix the
 * generator. If a check here is genuinely wrong, that is a separate change with
 * its own reasoning, made deliberately and not under pressure from a red test.
 */

import { expect } from 'vitest'
import { makeRng } from './rng'
import { checkAnswer } from '../answer'
import type { Item, ItemGenerator } from './types'

/**
 * Seeds tried at each difficulty. With the usual `range` of about [5, 80] the
 * loop below walks 27 difficulties (every third, plus the top of the range
 * explicitly), so a generator is checked on roughly 1,600 distinct items and
 * generated about 3,200 times counting the determinism re-run. That takes
 * well under a second, so there is no reason to be stingy.
 */
const SEEDS = 60

/**
 * Difficulties a generator may be handed in real play but does not declare
 * support for. `difficultyForSuccess` returns anything in 0..99 and returns it
 * *fractional*, so these are not hypothetical.
 */
const OUT_OF_RANGE_PROBES = [0, 99, -1, 1000, 42.7]

export interface SoundnessOptions {
  /**
   * Param keys whose values must appear as whole numbers somewhere in the
   * prompt.
   *
   * This catches the prompt and the params drifting apart: a prompt reading
   * `3/4 + 1/8` while `params` says `{ n1: 5 }` means the child is answering a
   * different question from the one being marked, and every other check in
   * here would pass while that happened.
   */
  promptParams?: string[]
  /**
   * The strong form of the same check — rebuild the exact prompt from params,
   * independently of the generator, and demand a character-for-character
   * match. Use it whenever the prompt is a pure function of the params, which
   * is most generators. Skip it only when wording is randomised beyond what
   * `params` records.
   */
  rebuildPrompt?: (params: Record<string, number>) => string
}

/** Whole numbers appearing in a string, as strings, so `11` is not read as `1`. */
function numbersIn(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? [])
}

/** Every check that applies to a single item, wherever it came from. */
function assertItemSound(
  item: Item,
  gen: ItemGenerator,
  verify: (params: Record<string, number>) => string,
  options: SoundnessOptions,
  where: string,
): void {
  const [lo, hi] = gen.range

  expect(item.standardId, `standardId ${where}`).toBe(gen.standardId)

  // The difficulty the item claims must be one the generator admits to
  // producing, or Elo targeting is aiming at a number that means nothing.
  expect(item.difficulty, `difficulty below range ${where}`).toBeGreaterThanOrEqual(lo)
  expect(item.difficulty, `difficulty above range ${where}`).toBeLessThanOrEqual(hi)

  expect(item.prompt.trim().length, `prompt empty ${where}`).toBeGreaterThan(0)

  // Params have to be real numbers. A NaN here would silently poison `verify`
  // into agreeing with anything, since NaN-derived answers are unparseable and
  // would fail loudly — but an Infinity can round into a plausible wrong key.
  for (const [key, value] of Object.entries(item.params)) {
    expect(Number.isFinite(value), `param ${key} is not finite (${value}) ${where}`).toBe(true)
  }

  // Prompt/params agreement.
  const promptNumbers = numbersIn(item.prompt)
  for (const key of options.promptParams ?? []) {
    const value = item.params[key]
    expect(value, `param ${key} missing ${where}`).toBeDefined()
    expect(
      promptNumbers.has(String(value)),
      `prompt "${item.prompt}" does not contain ${key}=${value} ${where}`,
    ).toBe(true)
  }
  if (options.rebuildPrompt) {
    expect(item.prompt, `prompt disagrees with params ${where}`).toBe(
      options.rebuildPrompt(item.params),
    )
  }

  // Worked steps are the last thing he sees after getting one wrong. A blank
  // one is worse than none at all.
  expect(item.workedSteps.length, `no worked steps ${where}`).toBeGreaterThan(0)
  item.workedSteps.forEach((step, i) => {
    expect(step.trim().length, `worked step ${i} is blank ${where}`).toBeGreaterThan(0)
  })

  expect(item.answer.kind, `answer kind ${where}`).toBe('rational')

  // The key must be accepted by the same checker the child's typing goes
  // through. Anything else means the game can ask a question it will not
  // accept the answer to.
  const self = checkAnswer(item.answer.canonical, item.answer)
  expect(self.correct, `key ${item.answer.canonical} rejected by checker ${where}`).toBe(true)

  // The key must also be in lowest terms. `checkAnswer` accepts `14/16` for
  // `7/8` with an "unreduced" nudge, which is right for a child's typing and
  // wrong for a key: an unreduced key would fire that nudge against the very
  // answer it published as correct.
  expect(self.nudge, `key ${item.answer.canonical} is not in lowest terms ${where}`).toBeUndefined()

  // The independent recomputation. This is the check the whole file exists for.
  const independent = verify(item.params)
  expect(
    checkAnswer(independent, item.answer).correct,
    `key ${item.answer.canonical} disagrees with independent ${independent} ` +
      `${where}, params=${JSON.stringify(item.params)}`,
  ).toBe(true)

  // At least one named wrong answer, per the project's rule that the game
  // should know *why* he was wrong and not only that he was.
  expect(item.misconceptions.length, `no misconceptions ${where}`).toBeGreaterThan(0)

  const seenIds = new Set<string>()
  const seenSignatures = new Set<string>()
  for (const m of item.misconceptions) {
    expect(m.id.trim().length, `misconception with a blank id ${where}`).toBeGreaterThan(0)
    expect(m.label.trim().length, `misconception ${m.id} has a blank label ${where}`).toBeGreaterThan(0)
    expect(
      m.explanation.trim().length,
      `misconception ${m.id} has a blank explanation ${where}`,
    ).toBeGreaterThan(0)

    expect(seenIds.has(m.id), `duplicate misconception id ${m.id} ${where}`).toBe(false)
    seenIds.add(m.id)

    const match = checkAnswer(m.signature, item.answer)

    // A signature the answer checker cannot even read can never match what the
    // child types, so the misconception is dead code that looks like coverage.
    expect(
      match.unparseable ?? false,
      `misconception ${m.id} signature "${m.signature}" is unparseable ${where}`,
    ).toBe(false)

    // Two mistakes landing on the same value cannot be told apart, so naming
    // both is a coin flip dressed up as a diagnosis.
    expect(
      seenSignatures.has(m.signature),
      `misconceptions collide on signature ${m.signature} ${where}`,
    ).toBe(false)
    seenSignatures.add(m.signature)

    // And the one that actually matters: never tell him a right answer is a
    // known mistake.
    expect(
      match.correct,
      `misconception ${m.id} signature equals the correct answer ${where}`,
    ).toBe(false)
  }
}

/**
 * Assert a generator is sound.
 *
 * `verify` must recompute the answer from `params` using `Rational` directly.
 * If it calls anything the generator called, the test proves nothing — it just
 * asks the generator whether it agrees with itself.
 */
export function assertGeneratorSound(
  gen: ItemGenerator,
  verify: (params: Record<string, number>) => string,
  options: SoundnessOptions = {},
): void {
  const [lo, hi] = gen.range
  expect(hi, `${gen.standardId}: empty difficulty range`).toBeGreaterThan(lo)

  // Every third difficulty, and always the top of the range — `hi` is exactly
  // where an off-by-one in a band lookup lives, and stepping by three walks
  // straight past it whenever the range width is not a multiple of three.
  const difficulties: number[] = []
  for (let d = lo; d <= hi; d += 3) difficulties.push(d)
  if (difficulties[difficulties.length - 1] !== hi) difficulties.push(hi)

  for (const d of difficulties) {
    const prompts = new Set<string>()

    for (let seed = 0; seed < SEEDS; seed++) {
      const where = `at d=${d} seed=${seed}`
      const item = gen.generate(d, makeRng(seed))

      expect(item.difficulty, `difficulty not echoed ${where}`).toBe(d)
      assertItemSound(item, gen, verify, options, where)
      prompts.add(item.prompt)

      // Same seed, same item — byte for byte. A match is replayed from its
      // seed, so a generator that drifts would replay a different game than
      // the one that was played.
      const again = gen.generate(d, makeRng(seed))
      expect(JSON.stringify(again), `not deterministic ${where}`).toBe(JSON.stringify(item))
    }

    // A generator that emits one question forever passes every check above
    // while being useless as practice.
    expect(prompts.size, `only one distinct prompt across ${SEEDS} seeds at d=${d}`).toBeGreaterThan(1)
  }

  // Difficulties outside the declared range must clamp, not throw and not read
  // off the end of a band table. `difficultyForSuccess` hands out anything in
  // 0..99, fractional, and a generator that throws at difficulty 0 crashes the
  // game for exactly the lowest-rated, most fragile player.
  for (const d of OUT_OF_RANGE_PROBES) {
    const where = `at out-of-range d=${d}`
    const item = gen.generate(d, makeRng(7))
    assertItemSound(item, gen, verify, options, where)
  }

  // Fractional difficulties inside the range are ordinary traffic too.
  const mid = lo + (hi - lo) / 2 + 0.5
  assertItemSound(gen.generate(mid, makeRng(9)), gen, verify, options, `at fractional d=${mid}`)
}
