import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS, Tryout } from './Tryout'
import { getStore, resetStoreForTest } from '../store/storage'
import type { Country } from '../store/storage'
import { DEFAULT_FLAG } from '../country/flag'
import { makeRng } from '../engine/items/rng'
import {
  TRYOUT_LENGTH,
  currentDifficulty,
  currentStep,
  isComplete,
  itemFor,
  itemSeedFor,
  recordAnswer,
  startTryout,
} from '../engine/tryout'
import { answerText } from '../engine/answer'
import { giveAnyAnswer } from '../test/answering'

const SEED = 4242

const COUNTRY: Country = {
  name: 'Riondia',
  flag: DEFAULT_FLAG,
  kit: ['#dc2626', '#ffffff'],
  stars: 0,
}

/**
 * `performance` is faked as well as `setTimeout`, because the answer box
 * measures latency against it and one of the tests below is about exactly that.
 */
function freshStore(): void {
  localStorage.clear()
  resetStoreForTest()
  getStore().setCountry(COUNTRY)
}

beforeEach(() => {
  freshStore()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The answers to a perfect run, computed the way the screen computes its
 * questions.
 *
 * An oracle rather than a peek at the implementation: the screen draws its items
 * from `itemFor` over a stream seeded from the session seed, so rebuilding that
 * stream reproduces exactly the twenty-four questions it will ask. It is the
 * only way to drive a *correct* session from the outside, because the screen
 * must never put the answer in the DOM.
 */
function perfectRun(seed: number): string[] {
  const rng = makeRng(itemSeedFor(seed))
  let state = startTryout(seed)
  const answers: string[] = []
  while (!isComplete(state)) {
    answers.push(answerText(itemFor(currentStep(state)!, currentDifficulty(state), rng).answer))
    state = recordAnswer(state, true)
  }
  return answers
}

/**
 * A readable answer that no generator in this game produces. Counts, measures,
 * products and sums are never negative at fourth grade.
 */
const ALWAYS_WRONG = '-1'

/**
 * A run where every single answer is wrong, computed the same way `perfectRun`
 * computes a right one.
 *
 * `-1` was enough while every question was typed. It is not enough now: a
 * picked question only accepts the options it offers, and any fallback the
 * screen driver could pick might happen to be the key. So the wrong answer has
 * to be chosen against the item, which means rebuilding the same stream the
 * screen draws from — exactly as the perfect run already does.
 */
function hopelessRun(seed: number): string[] {
  const rng = makeRng(itemSeedFor(seed))
  let state = startTryout(seed)
  const answers: string[] = []
  while (!isComplete(state)) {
    const { answer } = itemFor(currentStep(state)!, currentDifficulty(state), rng)
    answers.push(
      answer.kind === 'choice'
        ? answer.options.find((_, i) => i !== answer.correct)!
        : ALWAYS_WRONG,
    )
    state = recordAnswer(state, false)
  }
  return answers
}

function answer(text: string): void {
  giveAnyAnswer(text)
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS)
  })
}

/** Everything the session says around the question, or a marker once it is over. */
const chrome = (): string => screen.queryByTestId('tryout-chrome')?.textContent ?? '<the card>'

const said = (): string => document.body.textContent ?? ''

/** Words the session is not allowed to say while he is still answering. */
const JUDGEMENT = [
  /\bcorrect\b/i,
  /\bincorrect\b/i,
  /\bwrong\b/i,
  /\bscore\b/i,
  /\bwell done\b/i,
  /\bgood job\b/i,
  /\bnice one\b/i,
  /\bstreak\b/i,
  /[✓✔✗✘]/,
]

/** And anything that could read as a clock running down. */
const CLOCKS = [/time left/i, /seconds left/i, /countdown/i, /\d{1,2}:\d{2}/]

const expectSilentAboutAnswers = (): void => {
  for (const pattern of JUDGEMENT) expect(said()).not.toMatch(pattern)
}

describe('Tryout', () => {
  it('opens on a question and says where he is, not how he is doing', () => {
    render(<Tryout seed={SEED} />)

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText('1 of 24')).toBeInTheDocument()
    expectSilentAboutAnswers()
  })

  it('moves on when he answers, whatever he answered', () => {
    render(<Tryout seed={SEED} />)
    answer('7')
    expect(screen.getByText('2 of 24')).toBeInTheDocument()
    answer('7')
    expect(screen.getByText('3 of 24')).toBeInTheDocument()
  })

  it('locks the input while it is moving on, so a held Enter cannot answer twice', () => {
    render(<Tryout seed={SEED} />)
    const field = screen.getByRole('textbox')

    fireEvent.change(field, { target: { value: '7' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(screen.getByRole('textbox')).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(screen.getByText('1 of 24')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(SETTLE_MS)
    })
    expect(screen.getByText('2 of 24')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).not.toBeDisabled()
  })

  it('says exactly the same thing whether the answer was right or wrong', () => {
    // The design rule, asserted directly. Telling him he missed one here would
    // do nothing except make him tighten up on the next, and the whole point of
    // the session is to measure what he can do relaxed.
    const answers = perfectRun(SEED)

    const { unmount } = render(<Tryout seed={SEED} />)
    const perfect = [chrome()]
    for (const given of answers) {
      answer(given)
      perfect.push(chrome())
    }
    unmount()

    freshStore()
    render(<Tryout seed={SEED} />)
    const hopeless = [chrome()]
    for (let i = 0; i < TRYOUT_LENGTH; i++) {
      answer(ALWAYS_WRONG)
      hopeless.push(chrome())
    }

    expect(hopeless).toEqual(perfect)
  })

  it('never shows a clock', () => {
    render(<Tryout seed={SEED} />)
    for (let i = 0; i < 6; i++) {
      expect(screen.queryByRole('timer')).toBeNull()
      for (const pattern of CLOCKS) expect(chrome()).not.toMatch(pattern)
      answer('7')
    }
  })

  it('does not judge a single answer anywhere in a whole session', () => {
    render(<Tryout seed={SEED} />)
    for (let i = 0; i < TRYOUT_LENGTH - 1; i++) {
      answer(i % 2 === 0 ? ALWAYS_WRONG : '7')
      expectSilentAboutAnswers()
    }
  })

  it('writes twenty-four try-out attempts in a single store write', () => {
    let writes = 0
    const stop = getStore().subscribe(() => {
      writes += 1
    })

    render(<Tryout seed={SEED} />)
    for (const given of perfectRun(SEED)) answer(given)
    stop()

    const attempts = getStore().getState().attempts
    expect(attempts).toHaveLength(TRYOUT_LENGTH)
    expect(attempts.every((a) => a.context === 'tryout')).toBe(true)
    // Twenty-four writes and twenty-four re-renders is not a thing to do to an
    // iPad, and half a session written to disk is worse than none.
    expect(writes).toBe(1)
  })

  it('records what he answered and how long it took, without ever showing it', () => {
    const answers = perfectRun(SEED)
    render(<Tryout seed={SEED} />)
    for (const given of answers) answer(given)

    const attempts = getStore().getState().attempts
    expect(attempts.map((a) => a.given)).toEqual(answers)
    expect(attempts.every((a) => a.correct)).toBe(true)
    expect(attempts.every((a) => Number.isFinite(a.latencyMs))).toBe(true)
    expect(attempts.every((a) => a.difficulty > 0)).toBe(true)
    // Six tracks' worth of topics, not one subject twenty-four times.
    expect(new Set(attempts.map((a) => a.standardId)).size).toBeGreaterThan(5)
  })

  it('keeps the pause between questions out of the next question’s latency', () => {
    // Each question gets a fresh input and therefore a fresh clock. Without
    // that, the beat between questions lands in the next one's latency and
    // quietly deflates PAC — the one stat measured in milliseconds.
    render(<Tryout seed={SEED} />)
    answer('7')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    answer('7')
    for (let i = 2; i < TRYOUT_LENGTH; i++) answer('7')

    const second = getStore().getState().attempts[1]!
    expect(second.latencyMs).toBeGreaterThanOrEqual(3000)
    expect(second.latencyMs).toBeLessThan(3000 + SETTLE_MS)
  })

  it('ends on the card', () => {
    const onDone = vi.fn()
    render(<Tryout seed={SEED} onDone={onDone} />)
    for (const given of perfectRun(SEED)) answer(given)

    expect(screen.getByText('Riondia')).toBeInTheDocument()
    expect(screen.getByText('Overall')).toBeInTheDocument()
    expect(screen.getByText(/#\d+ in the world/)).toBeInTheDocument()
    for (const stat of ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']) {
      expect(screen.getAllByText(stat).length).toBeGreaterThan(0)
    }
    expect(screen.queryByRole('textbox')).toBeNull()

    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /season/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('gives a card to a child who gets every single question wrong', () => {
    render(<Tryout seed={SEED} />)
    for (const given of hopelessRun(SEED)) answer(given)

    // No dead end, no zero state, no red. He finished the session, so he has a
    // card, and every number on it has somewhere to go.
    const attempts = getStore().getState().attempts
    expect(attempts).toHaveLength(TRYOUT_LENGTH)
    expect(attempts.every((a) => !a.correct)).toBe(true)
    expect(screen.getByText('Riondia')).toBeInTheDocument()
    expect(screen.getByText('Overall')).toBeInTheDocument()
    expectSilentAboutAnswers()
  })

  it('re-asks rather than scoring an answer it could not read', () => {
    render(<Tryout seed={SEED} />)
    answer('banana')

    // Not marked wrong, not counted, not moved on from. Re-prompted, because it
    // might have been a right answer typed in a way we failed to understand.
    expect(screen.getByText('1 of 24')).toBeInTheDocument()
    expectSilentAboutAnswers()
    expect(screen.getByRole('textbox')).not.toBeDisabled()
  })

  it('still finishes when it is missing a country to put on the card', () => {
    // The creator runs first, so this cannot happen by playing — but a cleared
    // country mid-session must not end twenty-four questions in a white screen.
    localStorage.clear()
    resetStoreForTest()

    render(<Tryout seed={SEED} />)
    for (let i = 0; i < TRYOUT_LENGTH; i++) answer(ALWAYS_WRONG)

    expect(screen.getByText('Overall')).toBeInTheDocument()
  })
})
