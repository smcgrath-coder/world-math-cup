import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACK_MS, DRILL_GENERATORS, READY_MS, TrainingGround } from './TrainingGround'
import { STANDARDS_BY_STAT } from '../components/stats'
import { makeRng } from '../engine/items/rng'
import type { Item } from '../engine/items/types'
import { selectItem } from '../engine/select'
import { deriveRatings } from '../store/derive'
import { getStore, resetStoreForTest } from '../store/storage'
import type { AttemptDraft } from '../store/storage'
import type { Attempt } from '../store/types'
import type { CardStat } from '../curriculum/standards.generated'
import { canonicalOf } from '../engine/answer'

const SEED = 31_415

function freshStore(): void {
  localStorage.clear()
  resetStoreForTest()
}

beforeEach(() => {
  freshStore()
  // `performance` as well as `setTimeout`, because the answer box measures
  // latency against it and the drill records what it is handed.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Driving the screen

function history(standardId: string, correct: boolean, count: number, ago: number): void {
  const drafts: AttemptDraft[] = []
  for (let i = 0; i < count; i++) {
    drafts.push({
      at: Date.now() - ago - i,
      standardId,
      difficulty: 40,
      params: {},
      given: correct ? '' : 'x',
      correct,
      latencyMs: 5000,
      context: 'training',
    })
  }
  getStore().appendAttempts(drafts)
}

/** Pick a stat, then a topic under it. Defaults to the mixed drill. */
function enter(stat: RegExp, topic?: RegExp): void {
  fireEvent.click(screen.getByRole('button', { name: stat }))
  // A stat with a single topic under it skips the topic picker entirely, so
  // there is nothing left to click. Shooting and Pace are both like this.
  const chooser = screen.queryByRole('button', { name: topic ?? /mix them up/i })
  if (chooser) fireEvent.click(chooser)
}

/** Answer the question on screen and let whatever follows it settle. */
function submit(text: string): void {
  const field = screen.getByRole('textbox')
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: 'Enter' })
  act(() => {
    vi.advanceTimersByTime(ACK_MS)
  })
}

const nextOne = (): HTMLElement | null => screen.queryByRole('button', { name: /next one/i })

/** Answer, and carry on to the next question however this one went. */
function answer(text: string): void {
  submit(text)
  const button = nextOne()
  if (button) fireEvent.click(button)
}

/**
 * A readable answer that no generator in this game produces. Counts, measures,
 * products and sums are never negative at fourth grade.
 */
const ALWAYS_WRONG = '-1'

const said = (): string => document.body.textContent ?? ''

const chrome = (): string => screen.queryByTestId('drill-chrome')?.textContent ?? ''

const statValue = (): number => Number(screen.getByTestId('drill-stat').textContent)

/** Every class name currently on the page, for the no-alarm assertion. */
function classNames(): string[] {
  return [...document.querySelectorAll('*')].flatMap((el) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0),
  )
}

const expectNoTellingOff = (): void => {
  expect(said()).not.toMatch(/\bwrong\b/i)
  expect(said()).not.toMatch(/\bincorrect\b/i)
  expect(said()).not.toMatch(/\bfail(ed|ure)?\b/i)
  expect(said()).not.toMatch(/[✗✘]/)
  // No red, anywhere. A miss in here is a teaching moment, not an alarm.
  expect(classNames().filter((c) => /red|rose|crimson/i.test(c))).toEqual([])
}

const expectNoClock = (): void => {
  expect(screen.queryByRole('timer')).toBeNull()
  expect(said()).not.toMatch(/countdown|time left|seconds left|timer/i)
  expect(chrome()).not.toMatch(/\d{1,2}:\d{2}/)
}

// ---------------------------------------------------------------------------

/**
 * The questions the drill is about to ask, rebuilt from outside the screen.
 *
 * The screen must never put an answer in the DOM, so the only honest way to
 * drive a *correct* session is to reproduce its selection exactly: the same
 * seeded stream, the same generators, and ratings folded from the same log.
 *
 * Attempt ids are deliberately not reproduced. `deriveRatings` consults them
 * only to break ties between attempts stamped the same millisecond, and no two
 * answers here land in the same millisecond — every question boundary moves the
 * fake clock by the settle beat.
 */
function oracleFor(stat: CardStat, standardId: string | undefined) {
  const rng = makeRng(SEED)
  const now = Date.now()
  const log: Attempt[] = getStore().getState().attempts.slice()

  const draw = (): Item =>
    selectItem({
      ratings: deriveRatings(log, now),
      pressure: 'training',
      rng,
      generators: DRILL_GENERATORS[stat],
      ...(standardId === undefined ? {} : { standardId }),
    })

  let item = draw()

  return {
    get item(): Item {
      return item
    },
    /** Fold in the answer the screen just took, and draw what it will ask next. */
    record(given: string, correct: boolean): void {
      log.push({
        id: `t${log.length}`,
        at: Date.now(),
        standardId: item.standardId,
        difficulty: item.difficulty,
        params: item.params,
        given,
        correct,
        latencyMs: 0,
        context: 'training',
      })
      item = draw()
    },
  }
}

// ---------------------------------------------------------------------------

describe('TrainingGround', () => {
  describe('picking what to work on', () => {
    it('shows all six stats with what they are and what he is rated', () => {
      history('MT.4.NF.3', false, 8, 60_000)
      history('MT.4.NBT.4', true, 8, 60_000)

      render(<TrainingGround seed={SEED} />)

      for (const stat of ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']) {
        expect(screen.getByText(stat)).toBeInTheDocument()
      }
      expect(screen.getByText('Fractions')).toBeInTheDocument()
      expect(screen.getByText('Geometry')).toBeInTheDocument()

      // The numbers are his, not decoration: eight missed fraction questions
      // put DRI under the seed and eight won place-value ones put DEF over it.
      const dribbling = screen.getByRole('button', { name: /dribbling/i })
      const defending = screen.getByRole('button', { name: /defending/i })
      expect(Number(dribbling.textContent?.match(/(\d+)$/)?.[1])).toBeLessThan(50)
      expect(Number(defending.textContent?.match(/(\d+)$/)?.[1])).toBeGreaterThan(50)
    })

    it('names the stat with the most headroom, so the gap is his to spot', () => {
      history('MT.4.NF.3', false, 8, 60_000)

      render(<TrainingGround seed={SEED} />)

      expect(screen.getByRole('button', { name: /dribbling/i }).textContent).toMatch(
        /most to gain/i,
      )
    })

    it('lets a stat be chosen, then offers the topics under it', () => {
      render(<TrainingGround seed={SEED} />)
      fireEvent.click(screen.getByRole('button', { name: /dribbling/i }))

      expect(screen.getByRole('button', { name: /mix them up/i })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /adding and subtracting fractions/i }),
      ).toBeInTheDocument()
      // Topics, in his language. No curriculum codes anywhere on the picker.
      expect(said()).not.toMatch(/MT\.4\./)
    })

    it('goes straight into the drill when a stat has only one topic', () => {
      // Shooting is geometry, and geometry has exactly one generator. A screen
      // offering a single option is a tap that asks a question with one answer.
      render(<TrainingGround seed={SEED} />)
      fireEvent.click(screen.getByRole('button', { name: /shooting/i }))

      // Already answering, not still choosing.
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /mix them up/i })).toBeNull()
    })

    it('still offers the topics when a stat has more than one', () => {
      render(<TrainingGround seed={SEED} />)
      fireEvent.click(screen.getByRole('button', { name: /dribbling/i }))

      expect(screen.getByRole('button', { name: /mix them up/i })).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('shows no clock and says nothing about being wrong', () => {
      render(<TrainingGround seed={SEED} />)
      expectNoClock()
      expectNoTellingOff()
      fireEvent.click(screen.getByRole('button', { name: /dribbling/i }))
      expectNoClock()
      expectNoTellingOff()
    })

    it('lets him leave before answering anything', () => {
      const onDone = vi.fn()
      render(<TrainingGround seed={SEED} onDone={onDone} />)

      fireEvent.click(screen.getByRole('button', { name: /back/i }))
      expect(onDone).toHaveBeenCalledTimes(1)
    })
  })

  describe('drilling', () => {
    it('only asks about the stat he chose', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)

      for (let i = 0; i < 8; i++) answer(ALWAYS_WRONG)
      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))

      const attempts = getStore().getState().attempts
      expect(attempts).toHaveLength(8)
      expect(attempts.every((a) => STANDARDS_BY_STAT.DRI.includes(a.standardId))).toBe(true)
    })

    it('sticks to one topic when he picks one', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i, /adding and subtracting fractions/i)

      for (let i = 0; i < 6; i++) answer(ALWAYS_WRONG)
      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))

      const attempts = getStore().getState().attempts
      expect(attempts).toHaveLength(6)
      expect(attempts.every((a) => a.standardId === 'MT.4.NF.3')).toBe(true)
    })

    it('moves on when he gets one right', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      const oracle = oracleFor('DRI', undefined)

      const first = oracle.item
      expect(screen.getByText(first.prompt)).toBeInTheDocument()

      submit(canonicalOf(first.answer))
      oracle.record(canonicalOf(first.answer), true)

      // Straight on to the next one. No worked steps, nothing to tap through.
      expect(nextOne()).toBeNull()
      expect(screen.getByText(oracle.item.prompt)).toBeInTheDocument()
      expect(screen.getByRole('textbox')).not.toBeDisabled()
    })

    it('shows the worked steps when he misses, and waits for him to read them', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      const oracle = oracleFor('DRI', undefined)
      const item = oracle.item

      submit(ALWAYS_WRONG)

      for (const step of item.workedSteps) expect(screen.getByText(step)).toBeInTheDocument()
      // The answer, said plainly. Training is where you find out.
      expect(said()).toContain(canonicalOf(item.answer))
      // Still here until he says he is done reading.
      expect(nextOne()).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).toBeNull()

      fireEvent.click(nextOne()!)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('names the mistake when it recognises one, rather than saying the same thing every time', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      const oracle = oracleFor('DRI', undefined)

      // Nearly every item carries named misconceptions, but not every single
      // one does, so walk on until we meet one that does.
      let item = oracle.item
      for (let i = 0; i < 12 && item.misconceptions.length === 0; i++) {
        answer(ALWAYS_WRONG)
        oracle.record(ALWAYS_WRONG, false)
        item = oracle.item
      }
      const misconception = item.misconceptions[0]!

      submit(misconception.signature)

      expect(said()).toContain(misconception.explanation)
      // The specific thing he did, not the general-purpose line.
      expect(said()).not.toContain('Different answer here')
      expectNoTellingOff()
    })

    it('re-asks rather than scoring an answer it could not read', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      const oracle = oracleFor('DRI', undefined)

      submit('banana')

      expect(screen.getByText(oracle.item.prompt)).toBeInTheDocument()
      expect(nextOne()).toBeNull()
      expect(screen.getByRole('textbox')).not.toBeDisabled()
      expect(getStore().getState().attempts).toHaveLength(0)
    })

    it('never tells him off and never shows a clock, however badly it goes', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)

      for (let i = 0; i < 10; i++) {
        submit(ALWAYS_WRONG)
        expectNoTellingOff()
        expectNoClock()
        fireEvent.click(nextOne()!)
      }
    })

    it('shows the stat climbing as he gets them right', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/defending/i, /adding and subtracting big numbers/i)
      const oracle = oracleFor('DEF', 'MT.4.NBT.4')

      const opened = statValue()
      for (let i = 0; i < 14; i++) {
        const given = canonicalOf(oracle.item.answer)
        submit(given)
        oracle.record(given, true)
      }

      expect(statValue()).toBeGreaterThan(opened)
    })
  })

  describe('leaving', () => {
    it('writes the session as training attempts, in one go', () => {
      let writes = 0
      const stop = getStore().subscribe(() => {
        writes += 1
      })

      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      for (let i = 0; i < 3; i++) answer(ALWAYS_WRONG)

      // Nothing written yet: three answers is not a reason to touch the disk.
      expect(getStore().getState().attempts).toHaveLength(0)

      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))
      stop()

      const attempts = getStore().getState().attempts
      expect(attempts).toHaveLength(3)
      expect(attempts.every((a) => a.context === 'training')).toBe(true)
      expect(writes).toBe(1)
    })

    it('keeps hold of a long session without one write per answer', () => {
      let writes = 0
      const stop = getStore().subscribe(() => {
        writes += 1
      })

      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      for (let i = 0; i < 12; i++) answer(ALWAYS_WRONG)
      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))
      stop()

      expect(getStore().getState().attempts).toHaveLength(12)
      expect(writes).toBeLessThan(6)
    })

    it('lets a child who got every single one of them wrong walk off cleanly', () => {
      const onDone = vi.fn()
      render(<TrainingGround seed={SEED} onDone={onDone} />)
      enter(/dribbling/i)

      for (let i = 0; i < 9; i++) answer(ALWAYS_WRONG)
      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))

      // A session, not a verdict: no score, no red, nothing to feel bad about.
      expect(said()).toMatch(/9 questions/i)
      expectNoTellingOff()
      expectNoClock()

      const attempts = getStore().getState().attempts
      expect(attempts).toHaveLength(9)
      expect(attempts.every((a) => a.context === 'training' && !a.correct)).toBe(true)

      fireEvent.click(screen.getByRole('button', { name: /head back/i }))
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('offers another drill without leaving the training ground', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      answer(ALWAYS_WRONG)
      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))

      fireEvent.click(screen.getByRole('button', { name: /train something else/i }))
      expect(screen.getByRole('button', { name: /defending/i })).toBeInTheDocument()
    })

    it('goes straight back to the choice when he has not answered anything', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)

      fireEvent.click(screen.getByRole('button', { name: /done for now/i }))

      expect(screen.getByRole('button', { name: /defending/i })).toBeInTheDocument()
      expect(getStore().getState().attempts).toHaveLength(0)
    })

    it('is reachable at every moment of a question, including mid-explanation', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)

      expect(screen.getByRole('button', { name: /done for now/i })).toBeInTheDocument()
      submit(ALWAYS_WRONG)
      expect(screen.getByRole('button', { name: /done for now/i })).toBeInTheDocument()
    })

    it('does not let a stray second tap skip past the explanation', () => {
      render(<TrainingGround seed={SEED} />)
      enter(/dribbling/i)
      const oracle = oracleFor('DRI', undefined)
      const item = oracle.item

      const field = screen.getByRole('textbox')
      fireEvent.change(field, { target: { value: ALWAYS_WRONG } })
      fireEvent.keyDown(field, { key: 'Enter' })

      // The thumb is still where the Enter key was. Nothing doing.
      fireEvent.click(nextOne()!)
      expect(screen.getByText(item.workedSteps[0]!)).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(READY_MS)
      })
      fireEvent.click(nextOne()!)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })
})
