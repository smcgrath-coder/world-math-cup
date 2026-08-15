import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BRAVE_MISS,
  CELEBRATION_MS,
  Match,
  beatFor,
  matchDeps,
  scoutReport,
} from './Match'
import type { MatchResult } from './Match'
import { OPPONENTS_BY_ID } from '../data/opponents'
import type { Opponent } from '../data/opponents'
import { QUESTIONS_PER_MATCH, reduce, startMatch } from '../engine/match'
import type { MatchDeps, MatchEvent, MatchState, Stakes } from '../engine/match'
import { getStore, resetStoreForTest } from '../store/storage'
import type { Attempt, ShotChoice } from '../store/types'
import { answerText } from '../engine/answer'
import { giveAnyAnswer } from '../test/answering'

const SEED = 20_260
/** Tier 4, rating 56: the gentlest side on the roster. */
const CURACAO = OPPONENTS_BY_ID.curacao!
/** Tier 1, rating 94, five stars. */
const BRAZIL = OPPONENTS_BY_ID.brazil!

/**
 * A readable answer no generator in this game produces. Counts, measures,
 * products and sums are never negative at fourth grade.
 */
const ALWAYS_WRONG = '-1'

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  // `performance` as well, because the answer box measures latency against it.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Driving the screen
//
// The screen must never put an answer in the DOM, so the only honest way to
// play a *correct* match is to run the same reducer alongside it: the same
// seed, the same frozen deps, the same events in the same order. The oracle is
// the reducer, which is exactly the thing the screen is supposed to be a view
// of — if the two ever disagreed, the screen would be inventing rules.

interface Oracle {
  deps: MatchDeps
  state: MatchState
}

function open(opponent: Opponent, stakes: Stakes, id: string): Oracle {
  const deps = matchDeps(getStore().getState().attempts, SEED, Date.now(), stakes === 'knockout')
  return { deps, state: startMatch({ id, opponent, deps, stakes }) }
}

function play(opts: { opponent?: Opponent; stakes?: Stakes } = {}): Oracle {
  const opponent = opts.opponent ?? CURACAO
  const stakes = opts.stakes ?? 'friendly'
  render(<Match opponent={opponent} stakes={stakes} seed={SEED} matchId="m1" />)
  return open(opponent, stakes, 'm1')
}

/** Let the beat between questions finish. Never long enough to eat a clock. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(CELEBRATION_MS)
  })
}

function mirror(o: Oracle, event: MatchEvent): void {
  o.state = reduce(o.state, event, o.deps)
}

function type(o: Oracle, given: string): void {
  giveAnyAnswer(given)
  mirror(o, { type: 'answer', given, latencyMs: 1200 })
}

const answerRight = (o: Oracle): void => type(o, answerText(o.state.currentItem!.answer))
const answerWrong = (o: Oracle): void => type(o, ALWAYS_WRONG)

function press(name: RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }))
}

function chooseShot(o: Oracle, name: RegExp, shot: ShotChoice): void {
  press(name)
  mirror(o, { type: 'chooseShot', shot })
}

/** Two correct answers from the back and he is choosing how to finish. */
function reachFinalThird(o: Oracle): void {
  answerRight(o)
  settle()
  answerRight(o)
  settle()
}

/** Play on until the whistle, or until some phase is reached. */
function playOut(o: Oracle, respond: (o: Oracle) => string, until = 'fulltime'): void {
  for (let guard = 0; guard < 200 && o.state.phase !== until && o.state.phase !== 'fulltime'; guard++) {
    if (o.state.phase === 'shot_choice') {
      chooseShot(o, /inside the box/i, 'box')
    } else if (o.state.phase === 'feedback') {
      press(/get back out there/i)
      mirror(o, { type: 'dismissFeedback' })
    } else if (o.state.phase === 'halftime') {
      press(/second half/i)
      mirror(o, { type: 'dismissFeedback' })
    } else {
      type(o, respond(o))
    }
    settle()
  }
}

// ---------------------------------------------------------------------------
// Reading the screen

const said = (): string => document.body.textContent ?? ''

const ballX = (): number => Number(screen.getByTestId('ball').getAttribute('data-x'))

const classNames = (): string[] =>
  [...document.querySelectorAll('*')].flatMap((el) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0),
  )

/**
 * Where the numpad sits in the layout.
 *
 * jsdom has no layout engine, so a pixel comparison would compare two zeroes.
 * This is the honest proxy: the chain of elements the numpad hangs off, with
 * their classes, plus whether it is still the last thing in the bottom-anchored
 * column. If the numpad moves on screen between questions, one of those has to
 * have changed.
 */
/**
 * Where the question area hangs in the DOM, as a chain of classes up to the body.
 *
 * Measured from the area rather than from the submit key itself, because the
 * submit key is no longer always the same element: a typed question ends in the
 * numpad's `Enter` and a picked one in the options' `That one`, and those
 * legitimately carry different classes. Comparing the buttons would now be
 * comparing the two inputs rather than testing that either of them stays put.
 *
 * The area is what Match.tsx pins — its column carries `mt-auto`, so the bottom
 * of the block is fixed and the commit control sits under his thumb whichever
 * kind of question is showing. `commitIsLast` covers the other half of that:
 * being in a fixed area is worth nothing if the button wanders inside it.
 */
function numpadAnchor(): string {
  const area = screen.getByTestId('question-area')
  const chain: string[] = []
  for (let el: HTMLElement | null = area; el !== null && el !== document.body; el = el.parentElement) {
    const last = el.parentElement?.lastElementChild === el
    chain.push(`${el.tagName}[${el.getAttribute('class') ?? ''}]last=${String(last)}`)
  }
  return chain.join(' < ')
}

/** The commit control is the bottom-most thing inside the question area. */
function commitIsLast(): boolean {
  const area = screen.getByTestId('question-area')
  const commit = screen.getByRole('button', { name: /submit answer|that one/i })
  for (let el: HTMLElement | null = commit; el !== null && el !== area; el = el.parentElement) {
    if (el.parentElement?.lastElementChild !== el) return false
  }
  return true
}

// ---------------------------------------------------------------------------

describe('Match', () => {
  it('advances the ball up the pitch on a correct answer', () => {
    const o = play()
    const back = ballX()

    answerRight(o)
    settle()

    expect(ballX()).toBeGreaterThan(back)
    expect(o.state.zone).toBe('midfield')
  })

  it('offers the shot menu in the final third rather than shooting for him', () => {
    const o = play()
    reachFinalThird(o)

    expect(o.state.phase).toBe('shot_choice')
    expect(screen.getByRole('button', { name: /work it wider/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /inside the box/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /outside the 18/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bicycle kick/i })).toBeInTheDocument()
    // Nothing has been shot, and nothing has been scored on his behalf.
    expect(screen.getByTestId('scoreline')).toHaveTextContent('0–0')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('celebrates a bicycle kick before anyone knows whether it goes in', () => {
    const o = play()
    reachFinalThird(o)

    chooseShot(o, /bicycle kick/i, 'bicycle')

    // The courage count has already moved, and the screen has already said so —
    // with the question not yet generated, let alone answered.
    expect(o.state.courage.hardShotsAttempted).toBe(1)
    expect(o.state.log.some((a) => a.shot !== undefined)).toBe(false)
    expect(screen.getByTestId('beat')).toHaveAttribute('data-tone', 'brave')
    expect(screen.getByTestId('beat')).toHaveTextContent(/overhead kick/i)
    expect(said()).toMatch(/counts already, in or out/i)

    // And it stays said while he is answering it.
    settle()
    expect(said()).toMatch(/bicycle kick — already counted/i)
  })

  it('reads a missed bicycle kick as brave rather than as a failure', () => {
    const o = play()
    reachFinalThird(o)
    chooseShot(o, /bicycle kick/i, 'bicycle')
    settle()

    answerWrong(o)

    const beat = screen.getByTestId('beat')
    expect(beat).toHaveAttribute('data-tone', 'brave')
    expect(beat).toHaveTextContent(BRAVE_MISS.bicycle)
    expect(beat).toHaveTextContent(/what a thing to have a go at/i)
    expect(beat).toHaveTextContent(/on your record/i)

    expect(said()).not.toMatch(/\bwrong\b|\bfail(ed|ure)?\b|\bmiss(ed)?\b|\bunlucky\b/i)
    expect(said()).not.toMatch(/should have|shouldn’t have|too hard for/i)
    expect(classNames().filter((c) => /red|rose|crimson/i.test(c))).toEqual([])
  })

  it('shows the tackle-back with a visible bar when the ball comes loose', () => {
    const o = play()

    answerWrong(o)
    settle()

    expect(o.state.phase).toBe('tackleback')
    expect(screen.getByTestId('tackleback-bar')).toBeInTheDocument()
    expect(said()).toMatch(/win it back/i)
    // A new question, with the ball still there to be won.
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('draws no bar and never expires when timers are switched off', () => {
    getStore().updateSettings({ timersEnabled: false })
    const o = play()

    answerWrong(o)
    settle()

    expect(o.state.phase).toBe('tackleback')
    expect(screen.queryByTestId('tackleback-bar')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()

    // Twelve times the longest clock in the game, and nothing has been taken.
    act(() => {
      vi.advanceTimersByTime(o.state.tackleBackMs * 12)
    })

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByText(/how it goes/i)).toBeNull()
    expect(said()).toMatch(/take as long as you like/i)
  })

  it('hands the ball on when the tackle-back bar runs out', () => {
    const o = play()
    answerWrong(o)
    settle()

    act(() => {
      vi.advanceTimersByTime(o.state.tackleBackMs)
    })
    mirror(o, { type: 'tackleBackTimeout' })
    settle()

    expect(o.state.phase).toBe('feedback')
    expect(said()).toMatch(/how it goes/i)
  })

  it('shows the worked steps after a lost tackle-back, and never says wrong', () => {
    const o = play()
    answerWrong(o)
    settle()
    answerWrong(o)
    settle()

    expect(o.state.phase).toBe('feedback')
    const item = o.state.currentItem!
    for (const step of item.workedSteps) expect(said()).toContain(step)
    expect(said()).toContain(answerText(item.answer))

    expect(said()).not.toMatch(/\bwrong\b|\bincorrect\b|\bfail(ed|ure)?\b/i)
    expect(said()).not.toMatch(/[✗✘]/)
    expect(classNames().filter((c) => /red|rose|crimson/i.test(c))).toEqual([])
  })

  it('puts no question under the worked solution or the team talk', () => {
    const o = play()
    answerWrong(o)
    settle()
    answerWrong(o)
    settle()

    // The reducer is still holding a question so play can resume; the screen
    // must not be showing it, and it must not be showing a numpad either.
    expect(o.state.phase).toBe('feedback')
    expect(o.state.currentItem).not.toBeNull()
    expect(screen.queryByTestId('question-area')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit answer/i })).toBeNull()
  })

  it('gives the team talk the screen to itself, then hands play back', () => {
    const o = play()
    playOut(o, () => ALWAYS_WRONG, 'halftime')

    expect(o.state.phase).toBe('halftime')
    expect(said()).toMatch(/half time/i)
    expect(said()).toMatch(/scout/i)
    expect(screen.queryByTestId('question-area')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()

    press(/second half/i)
    mirror(o, { type: 'dismissFeedback' })
    settle()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('nothing on the pitch moves while a question is live', () => {
    const o = play()

    expect(screen.getByTestId('pitch')).toHaveAttribute('data-still', 'true')
    expect(screen.getByTestId('ball')).toHaveAttribute('data-moving', 'false')
    expect(screen.getByTestId('question-area')).toHaveAttribute('data-live', 'true')
    expect(screen.queryByTestId('beat')).toBeNull()
    expect(screen.queryByTestId('tackleback-bar')).toBeNull()
    expect(classNames().filter((c) => c.startsWith('animate-'))).toEqual([])

    // The gap after the answer is where the ball is allowed to travel, and the
    // question that has just been answered is dimmed and locked while it does.
    answerRight(o)
    expect(screen.getByTestId('pitch')).toHaveAttribute('data-still', 'false')
    expect(screen.getByTestId('ball')).toHaveAttribute('data-moving', 'true')
    expect(screen.getByTestId('question-area')).toHaveAttribute('data-live', 'false')
    expect(screen.getByRole('textbox')).toBeDisabled()

    // And it is still again the moment the next question is his.
    settle()
    expect(screen.getByTestId('pitch')).toHaveAttribute('data-still', 'true')
    expect(screen.getByTestId('question-area')).toHaveAttribute('data-live', 'true')
  })

  it('holds the pitch still during a tackle-back too, bar apart', () => {
    const o = play()
    answerWrong(o)
    settle()

    expect(screen.getByTestId('pitch')).toHaveAttribute('data-still', 'true')
    expect(screen.getByTestId('ball')).toHaveAttribute('data-moving', 'false')
    expect(screen.getByTestId('tackleback-bar')).toBeInTheDocument()
  })

  it('keeps the answer controls exactly where they were between questions', () => {
    const o = play()
    const anchors = [numpadAnchor()]
    expect(commitIsLast()).toBe(true)

    answerRight(o)
    settle()
    anchors.push(numpadAnchor())
    expect(commitIsLast()).toBe(true)

    answerWrong(o)
    settle()
    expect(commitIsLast()).toBe(true)
    // A tackle-back puts a whole card above the question; the numpad still may
    // not move, because it hangs off the bottom of the column rather than the
    // top of it.
    anchors.push(numpadAnchor())

    expect(new Set(anchors).size).toBe(1)
    expect(anchors[0]).toContain('mt-auto')
  })

  it('never unmounts the answer box across the gap between two questions', () => {
    const o = play()
    answerRight(o)

    // Mid-beat: the outgoing question is still on screen, locked.
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByTestId('beat')).toBeInTheDocument()
  })

  it('costs nothing at all when it cannot read what he typed', () => {
    const o = play()
    const before = o.state.questionsAsked

    const field = screen.getByRole('textbox')
    fireEvent.change(field, { target: { value: 'banana' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(said()).toMatch(/didn’t catch that one/i)
    expect(o.state.questionsAsked).toBe(before)
    expect(screen.getByTestId('scoreline')).toHaveTextContent('0–0')
    expect(screen.queryByTestId('beat')).toBeNull()
  })

  it('writes every attempt by the whistle', () => {
    const o = play()
    playOut(o, (s) => answerText(s.state.currentItem!.answer))

    expect(o.state.phase).toBe('fulltime')
    expect(said()).toMatch(/full time/i)

    const saved = getStore().getState().attempts
    expect(saved).toHaveLength(QUESTIONS_PER_MATCH)
    expect(saved.every((a: Attempt) => a.matchId === 'm1')).toBe(true)
    expect(saved.every((a: Attempt) => a.context === 'match' || a.context === 'tackleback')).toBe(
      true,
    )
    expect(saved.map((a: Attempt) => a.correct).filter(Boolean).length).toBeGreaterThan(0)
  })

  it('keeps the maths he has already done if he walks off mid-match', () => {
    const o = play()
    answerRight(o)
    settle()
    answerRight(o)
    settle()

    // Two answers in — fewer than a flush — and then the lid comes down.
    expect(getStore().getState().attempts).toHaveLength(0)
    cleanup()
    expect(getStore().getState().attempts).toHaveLength(2)
  })

  it('carries on when the log is written to underneath it', () => {
    const o = play()
    answerRight(o)
    settle()

    // Exactly what the match's own flush looks like from the screen's side. A
    // screen that re-derived itself from the log would start a second match
    // over the top of the first here, and it did, in a browser, once.
    act(() => {
      getStore().appendAttempts([
        {
          at: Date.now(),
          standardId: 'FLU.MULT',
          difficulty: 30,
          params: {},
          given: '12',
          correct: true,
          latencyMs: 900,
          context: 'training',
        },
      ])
    })

    expect(said()).toMatch(/question 2 of 14/i)
    expect(screen.getByTestId('ball')).toHaveAttribute('data-spot', 'midfield')
  })

  it('saves what he has done when the lid comes down', () => {
    const o = play()
    answerRight(o)
    settle()

    expect(getStore().getState().attempts).toHaveLength(0)

    // Backgrounding a tab unmounts nothing, so this is the only cleanup that
    // runs when an iPad goes to sleep on a half-played match.
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(getStore().getState().attempts).toHaveLength(1)
    // And coming back does not write it a second time.
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(getStore().getState().attempts).toHaveLength(1)
  })

  it('gives the opposition the kickoff in a knockout', () => {
    const o = play({ opponent: BRAZIL, stakes: 'knockout' })

    expect(o.state.possession).toBe('them')
    expect(screen.getByTestId('possession')).toHaveTextContent(/brazil/i)
    expect(said()).toMatch(/knockout/i)
  })

  it('ends on a scoreline he can read out', () => {
    const o = play()
    playOut(o, (s) => answerText(s.state.currentItem!.answer))

    expect(said()).toMatch(new RegExp(`${o.state.score[0]}–${o.state.score[1]}`))
    expect(screen.getByRole('button', { name: /off the pitch/i })).toBeInTheDocument()
  })

  it('leaves the write-up to the dressing room', () => {
    const o = play()
    playOut(o, () => ALWAYS_WRONG)

    // The whistle, the scoreline, and a way off the pitch. The verdict, the
    // stats that moved and the bravery count all belong to the next screen, and
    // saying half of them here would mean saying them twice.
    expect(said()).toMatch(/full time/i)
    expect(said()).not.toMatch(/took that one|edged it|that’s the win|point each/i)
    expect(said()).not.toMatch(/hard ball|on your record|what moved/i)
  })

  it('hands the whistle a scoreline and every question it asked', () => {
    const handed = vi.fn()
    const opponent = CURACAO
    render(<Match opponent={opponent} stakes="friendly" seed={SEED} matchId="m1" onDone={handed} />)
    const o = open(opponent, 'friendly', 'm1')

    playOut(o, (s) =>
      s.state.questionsAsked % 3 === 0 ? ALWAYS_WRONG : answerText(s.state.currentItem!.answer),
    )
    press(/off the pitch/i)

    expect(handed).toHaveBeenCalledTimes(1)
    const result = handed.mock.calls[0]![0] as MatchResult
    expect(result.matchId).toBe('m1')
    expect(result.opponent).toBe(opponent)
    expect(result.score).toEqual(o.state.score)

    // The score is the one fact about a match that is not in the log; the
    // questions are the other. Both are keyed to the ids the *store* minted, so
    // the film room can join them to the log it reads back by matchId.
    const saved = getStore().getState().attempts
    expect(saved).toHaveLength(QUESTIONS_PER_MATCH)
    expect(result.questions.size).toBe(QUESTIONS_PER_MATCH)
    for (const attempt of saved) {
      const item = result.questions.get(attempt.id)
      expect(item?.standardId).toBe(attempt.standardId)
      expect(item?.params).toEqual(attempt.params)
      expect(item?.difficulty).toBe(attempt.difficulty)
    }
  })
})

// ---------------------------------------------------------------------------

describe('beatFor', () => {
  it('says nothing when nothing happened', () => {
    const o = open(CURACAO, 'friendly', 'm1')
    expect(beatFor(o.state, o.state)).toBeNull()
  })

  it('says the brave line even when the whistle follows it', () => {
    const o = open(CURACAO, 'friendly', 'm1')
    const before: MatchState = { ...o.state, phase: 'question', shotChoice: 'bicycle' }
    const after: MatchState = {
      ...before,
      phase: 'fulltime',
      log: [
        {
          id: 'a1',
          at: 1,
          standardId: 'FLU.MULT',
          difficulty: 30,
          params: {},
          given: '37',
          correct: false,
          latencyMs: 900,
          context: 'match',
          shot: 'bicycle',
        },
      ],
    }

    const beat = beatFor(before, after)
    expect(beat?.tone).toBe('brave')
    expect(beat?.line).toBe(BRAVE_MISS.bicycle)
  })

  it('celebrates the goal before the whistle when the last one goes in', () => {
    const o = open(CURACAO, 'friendly', 'm1')
    const scored: MatchState = {
      ...o.state,
      phase: 'fulltime',
      score: [1, 0],
      shotChoice: null,
    }
    const before: MatchState = { ...o.state, shotChoice: 'bicycle' }

    const beat = beatFor(before, scored)
    expect(beat?.tone).toBe('goal')
    expect(beat?.line).toMatch(/overhead kick/i)
  })
})

describe('scoutReport', () => {
  const miss = (standardId: string, i: number): Attempt => ({
    id: `a${i}`,
    at: i,
    standardId,
    difficulty: 40,
    params: {},
    given: '-1',
    correct: false,
    latencyMs: 1000,
    context: 'match',
  })

  it('names the domain that is hurting him, in both languages', () => {
    const report = scoutReport([miss('MT.4.NF.1', 1), miss('MT.4.NF.2', 2)])
    expect(report?.stat).toBe('DRI')
    expect(report?.line).toMatch(/dribbling/i)
    expect(report?.line).toMatch(/fractions/i)
  })

  it('says nothing about a single slip, which is not a pattern', () => {
    expect(scoutReport([miss('MT.4.NF.1', 1)])).toBeNull()
  })

  it('says nothing at all about a clean half', () => {
    expect(scoutReport([])).toBeNull()
  })
})
