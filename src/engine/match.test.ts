import { describe, expect, it } from 'vitest'
import { OPPONENTS } from '../data/opponents'
import { RATED_STANDARD_IDS, deriveCourage } from '../store/derive'
import { validateAttempt } from '../store/storage'
import type { AttemptDraft } from '../store/storage'
import type { Attempt, ShotChoice, StandardRating } from '../store/types'
import { generatorFor } from './items/generators'
import { makeRng } from './items/rng'
import type { Item, Rng } from './items/types'
import { Rational } from './rational'
import {
  HALFTIME_AFTER,
  MAX_OPPONENT_BIAS,
  MIN_MATCH_TARGET,
  PREREQUISITE,
  QUESTIONS_PER_MATCH,
  chooseScaffold,
  concedeAfter,
  opponentBias,
  reduce,
  startMatch,
  stopsToClear,
  tackleBackMs,
  targetSuccessFor,
} from './match'
import type { MatchDeps, MatchEvent, MatchState, Phase, Stakes } from './match'
import { PRESSURES, TARGET_SUCCESS } from './select'
import type { Pressure } from './select'
import { expectedScore } from './elo'
import type { Opponent } from '../data/opponents'

// ---------------------------------------------------------------------------
// Fixtures

/**
 * Tier 1, rating 89 — a top-tier side, and the one these tests use for tier-1
 * behaviour. Not the final boss any more: Spain won the 2026 tournament and lead
 * the ranking at 92. Both are tier 1, so `concedeAfter` and `tackleBackMs` are
 * identical between them and every assertion here holds for either.
 */
const BRAZIL = OPPONENTS.find((o) => o.id === 'brazil')!
/** Tier 4, rating 56: the gentlest opponent on the roster. */
const CURACAO = OPPONENTS.find((o) => o.id === 'curacao')!
/** Tier 3, rating 70, for the middle of the conceding ladder. */
const PANAMA = OPPONENTS.find((o) => o.id === 'panama')!

/** Every rated standard at the same rating, which is what a fresh player has. */
function ratingsAt(rating: number): Map<string, StandardRating> {
  const out = new Map<string, StandardRating>()
  for (const id of RATED_STANDARD_IDS) {
    out.set(id, { standardId: id, rating, attempts: 10, lastSeenAt: 0, provisional: false })
  }
  return out
}

/**
 * Deps with a fixed seed and a fake clock. Two calls with the same seed produce
 * byte-identical matches, which is what several tests below rely on.
 */
function makeDeps(seed = 7, rating = 50): MatchDeps {
  let t = 1_000_000
  return {
    ratings: ratingsAt(rating),
    rng: makeRng(seed),
    now: () => (t += 1000),
    playerOverall: rating,
  }
}

const start = (
  deps: MatchDeps,
  id = 'match-1',
  opponent: Opponent = BRAZIL,
  stakes: Stakes = 'friendly',
) => startMatch({ id, opponent, deps, stakes })

const answer = (s: MatchState, given: string, deps: MatchDeps, latencyMs = 1200) =>
  reduce(s, { type: 'answer', given, latencyMs }, deps)

// ---------------------------------------------------------------------------
// Answers of a known quality

const right = (item: Item) => item.answer.canonical

/**
 * A slip on a sound method, so `classifyMiss` reads it as `near`.
 *
 * This used to be "five percent out", which worked while a near miss was
 * defined by relative error. It no longer is: a slip is now a digit event, so
 * five percent of a four-digit answer is a different method, not a slip. Off by
 * one is the honest version for a whole number of ten or more; one unit
 * fraction out is the honest version for a fraction.
 *
 * A small whole number has no near miss at all — being one out on "how many
 * right angles" is not knowing, and that is the point of the change — so those
 * get a one-twentieth gap, which the fraction rule still reads as a slip.
 */
function nearMiss(item: Item): string {
  const r = Rational.parse(item.answer.canonical)!
  if (r.isInteger() && Math.abs(r.n) >= 10) return String(r.n + 1)
  if (r.n === 0) return '1/20'
  return `${20 * r.n + r.d}/${20 * r.d}`
}

/**
 * A million out. Nowhere near, and far enough away that it cannot collide with
 * a misconception signature — which matters for the tests that compare two runs
 * attempt by attempt.
 */
function wildMiss(item: Item): string {
  const r = Rational.parse(item.answer.canonical)!
  return `${r.n + 1_000_000 * r.d}/${r.d}`
}

// ---------------------------------------------------------------------------
// Driving a whole match

interface PlayOpts {
  shot?: ShotChoice
  /** Let every tackle-back clock expire instead of answering it. */
  timeOutTackleBacks?: boolean
}

function nextEvent(
  s: MatchState,
  respond: (item: Item, s: MatchState) => string,
  opts: PlayOpts,
): MatchEvent {
  if (s.phase === 'halftime' || s.phase === 'feedback') return { type: 'dismissFeedback' }
  if (s.phase === 'shot_choice') return { type: 'chooseShot', shot: opts.shot ?? 'box' }
  if (s.phase === 'tackleback' && opts.timeOutTackleBacks === true) {
    return { type: 'tackleBackTimeout' }
  }
  return { type: 'answer', given: respond(s.currentItem!, s), latencyMs: 1200 }
}

/**
 * A player who answers every question at his true Elo probability against the
 * difficulty he was actually served. The same player against everyone, so any
 * difference in the results is a difference in the opposition.
 */
function elo(rating: number, coin: Rng) {
  return (item: Item) =>
    coin.int(0, 9999) / 10_000 < expectedScore(rating, item.difficulty) ? right(item) : wildMiss(item)
}

interface SimResult {
  winRate: number
  drawRate: number
  /** Share of matches in which the opposition scored at all. */
  theyScoredRate: number
  goalsFor: number
  goalsAgainst: number
  /** Win rate bucketed by how many he scored. */
  winRateByGoalsFor: Map<number, number>
}

function simulate(
  opponent: Opponent,
  stakes: Stakes,
  matches = 300,
  rating = 50,
  shot: ShotChoice = 'box',
): SimResult {
  let won = 0
  let drawn = 0
  let theyScored = 0
  let goalsFor = 0
  let goalsAgainst = 0
  const buckets = new Map<number, { n: number; won: number }>()

  for (let seed = 1; seed <= matches; seed++) {
    const deps = makeDeps(seed, rating)
    const final = last(
      play(start(deps, `sim-${seed}`, opponent, stakes), deps, elo(rating, makeRng(seed * 104_729 + 5)), {
        shot,
      }),
    )
    goalsFor += final.score[0]
    goalsAgainst += final.score[1]
    if (final.score[1] > 0) theyScored += 1
    if (final.score[0] > final.score[1]) won += 1
    else if (final.score[0] === final.score[1]) drawn += 1

    const bucket = buckets.get(final.score[0]) ?? { n: 0, won: 0 }
    bucket.n += 1
    if (final.score[0] > final.score[1]) bucket.won += 1
    buckets.set(final.score[0], bucket)
  }

  return {
    winRate: won / matches,
    drawRate: drawn / matches,
    theyScoredRate: theyScored / matches,
    goalsFor: goalsFor / matches,
    goalsAgainst: goalsAgainst / matches,
    winRateByGoalsFor: new Map(
      [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([g, b]) => [g, b.won / b.n]),
    ),
  }
}

/** Every state a match passed through, first to last. */
function play(
  from: MatchState,
  deps: MatchDeps,
  respond: (item: Item, s: MatchState) => string,
  opts: PlayOpts = {},
): MatchState[] {
  const trace = [from]
  let s = from
  // The guard is a runaway check, not a rule: nothing should need 500 events to
  // finish fourteen questions.
  for (let i = 0; i < 500 && s.phase !== 'fulltime'; i++) {
    s = reduce(s, nextEvent(s, respond, opts), deps)
    trace.push(s)
  }
  return trace
}

const last = <T>(xs: readonly T[]): T => xs[xs.length - 1]!

/** Answer correctly until the state satisfies `until`. */
function advanceTo(s: MatchState, deps: MatchDeps, until: (s: MatchState) => boolean): MatchState {
  let current = s
  for (let i = 0; i < 60 && !until(current); i++) {
    current = reduce(current, nextEvent(current, right, {}), deps)
  }
  return current
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  return value
}

const ALL_EVENTS: MatchEvent[] = [
  { type: 'answer', given: '1', latencyMs: 900 },
  { type: 'chooseShot', shot: 'bicycle' },
  { type: 'tackleBackTimeout' },
  { type: 'dismissFeedback' },
]

/** A state in each phase, for the "nothing throws anywhere" sweeps. */
function statesByPhase(): Record<Phase, MatchState> {
  const deps = makeDeps(31)
  const question = start(deps)
  const shotChoice = advanceTo(question, deps, (s) => s.phase === 'shot_choice')
  const tackleback = answer(question, wildMiss(question.currentItem!), deps)
  const feedback = answer(tackleback, wildMiss(tackleback.currentItem!), deps)

  // Halftime and full time need their own runs, because reaching them consumes
  // questions.
  const halftimeDeps = makeDeps(31)
  const halftimeState = play(start(halftimeDeps), halftimeDeps, right).find(
    (s) => s.phase === 'halftime',
  )!
  const fullDeps = makeDeps(31)
  const fulltime = last(play(start(fullDeps), fullDeps, right))

  return {
    question,
    shot_choice: shotChoice,
    tackleback,
    feedback,
    halftime: halftimeState,
    fulltime,
  }
}

// ---------------------------------------------------------------------------

describe('startMatch', () => {
  it('kicks off in our own third with a question on the board', () => {
    const s = start(makeDeps())

    expect(s.phase).toBe('question')
    expect(s.zone).toBe('own_third')
    expect(s.possession).toBe('us')
    expect(s.score).toEqual([0, 0])
    expect(s.questionsAsked).toBe(0)
    expect(s.questionsTotal).toBe(QUESTIONS_PER_MATCH)
    expect(s.currentItem).not.toBeNull()
    expect(s.pendingItem).toBeNull()
    expect(s.shotChoice).toBeNull()
    expect(s.lastMiss).toBeNull()
    expect(s.log).toEqual([])
    expect(s.halftimeShown).toBe(false)
    expect(s.courage).toEqual({ hardShotsAttempted: 0, tackleBacksWon: 0, tackleBacksFaced: 0 })
    expect(s.opponent).toBe(BRAZIL)
  })

  it('is deterministic for a seed', () => {
    expect(start(makeDeps(99))).toEqual(start(makeDeps(99)))
  })
})

describe('advancing up the pitch', () => {
  it('a correct answer in our own third reaches midfield', () => {
    const deps = makeDeps()
    const s = start(deps)
    const next = answer(s, right(s.currentItem!), deps)

    expect(next.zone).toBe('midfield')
    expect(next.phase).toBe('question')
    expect(next.possession).toBe('us')
    expect(next.questionsAsked).toBe(1)
    expect(next.currentItem).not.toBe(s.currentItem)
  })

  it('reaching the final third offers a shot choice rather than taking one', () => {
    const deps = makeDeps()
    const s = start(deps)
    const midfield = answer(s, right(s.currentItem!), deps)
    const finalThird = answer(midfield, right(midfield.currentItem!), deps)

    expect(finalThird.zone).toBe('final_third')
    expect(finalThird.phase).toBe('shot_choice')
    expect(finalThird.currentItem).toBeNull()
    expect(finalThird.shotChoice).toBeNull()
    // Nothing has been shot, so nothing has been scored.
    expect(finalThird.score).toEqual([0, 0])
    expect(finalThird.questionsAsked).toBe(2)
  })
})

describe('the shot choice', () => {
  const atShotChoice = (deps: MatchDeps) =>
    advanceTo(start(deps), deps, (s) => s.phase === 'shot_choice')

  it('counts a bicycle kick as courage the instant it is chosen', () => {
    const deps = makeDeps()
    const s = atShotChoice(deps)
    const chosen = reduce(s, { type: 'chooseShot', shot: 'bicycle' }, deps)

    // The whole point: this is asserted before the question has even been read,
    // let alone answered. Choosing the hard thing is what is being rewarded.
    expect(chosen.courage.hardShotsAttempted).toBe(1)
    expect(chosen.shotChoice).toBe('bicycle')
    expect(chosen.phase).toBe('question')
    expect(chosen.currentItem).not.toBeNull()
    expect(chosen.questionsAsked).toBe(s.questionsAsked)
    expect(chosen.score).toEqual([0, 0])
  })

  it('counts an outside-the-box shot too, and the safe options not at all', () => {
    const deps = makeDeps()
    const s = atShotChoice(deps)

    expect(reduce(s, { type: 'chooseShot', shot: 'outside18' }, deps).courage.hardShotsAttempted).toBe(1)
    expect(reduce(s, { type: 'chooseShot', shot: 'box' }, deps).courage.hardShotsAttempted).toBe(0)
    expect(reduce(s, { type: 'chooseShot', shot: 'wide' }, deps).courage.hardShotsAttempted).toBe(0)
  })

  it('keeps the courage when the bicycle kick is missed', () => {
    const deps = makeDeps()
    const chosen = reduce(atShotChoice(deps), { type: 'chooseShot', shot: 'bicycle' }, deps)
    const missed = answer(chosen, wildMiss(chosen.currentItem!), deps)
    const lost = reduce(missed, { type: 'tackleBackTimeout' }, deps)

    expect(missed.courage.hardShotsAttempted).toBe(1)
    expect(lost.courage.hardShotsAttempted).toBe(1)
    expect(lost.score).toEqual([0, 0])
  })

  it('asks a harder question for a harder shot', () => {
    let bicycle = 0
    let wide = 0
    for (let seed = 1; seed <= 30; seed++) {
      const a = makeDeps(seed)
      const b = makeDeps(seed)
      bicycle += reduce(atShotChoice(a), { type: 'chooseShot', shot: 'bicycle' }, a).currentItem!
        .difficulty
      wide += reduce(atShotChoice(b), { type: 'chooseShot', shot: 'wide' }, b).currentItem!.difficulty
    }
    expect(bicycle / 30).toBeGreaterThan(wide / 30 + 10)
  })

  it('scores when the shot is answered, and hands the ball back for the restart', () => {
    const deps = makeDeps()
    const chosen = reduce(atShotChoice(deps), { type: 'chooseShot', shot: 'box' }, deps)
    const goal = answer(chosen, right(chosen.currentItem!), deps)

    expect(goal.score).toEqual([1, 0])
    expect(goal.zone).toBe('midfield')
    expect(goal.possession).toBe('them')
    expect(goal.shotChoice).toBeNull()
    expect(goal.phase).toBe('question')
    expect(last(goal.log).shot).toBe('box')
  })
})

describe('a miss loosens the ball', () => {
  it('goes to a tackle-back without changing possession', () => {
    const deps = makeDeps()
    const s = start(deps)
    const missed = answer(s, wildMiss(s.currentItem!), deps)

    expect(missed.phase).toBe('tackleback')
    expect(missed.possession).toBe('us')
    expect(missed.zone).toBe(s.zone)
    expect(missed.score).toEqual([0, 0])
    expect(missed.pendingItem).toEqual(s.currentItem)
    expect(missed.currentItem).not.toEqual(s.currentItem)
    expect(missed.courage.tackleBacksFaced).toBe(1)
    expect(missed.lastMiss).not.toBeNull()
  })

  it('restores the original question and the same zone when the tackle-back is won', () => {
    const deps = makeDeps()
    const s = advanceTo(start(deps), deps, (state) => state.zone === 'midfield')
    const missed = answer(s, wildMiss(s.currentItem!), deps)
    const won = answer(missed, right(missed.currentItem!), deps)

    expect(won.phase).toBe('question')
    expect(won.zone).toBe('midfield')
    expect(won.currentItem).toEqual(s.currentItem)
    expect(won.pendingItem).toBeNull()
    expect(won.possession).toBe('us')
    expect(won.courage.tackleBacksWon).toBe(1)
    expect(won.lastMiss).toBeNull()
  })

  it('shows the worked solution and hands over the ball when the tackle-back is lost', () => {
    const deps = makeDeps()
    const s = start(deps)
    const missed = answer(s, wildMiss(s.currentItem!), deps)
    const lost = answer(missed, wildMiss(missed.currentItem!), deps)

    expect(lost.phase).toBe('feedback')
    expect(lost.currentItem!.workedSteps).toEqual(s.currentItem!.workedSteps)
    expect(lost.possession).toBe('them')
    expect(lost.score).toEqual([0, 0])
    expect(lost.courage.tackleBacksWon).toBe(0)

    const resumed = reduce(lost, { type: 'dismissFeedback' }, deps)
    expect(resumed.phase).toBe('question')
    expect(resumed.possession).toBe('them')
    expect(resumed.zone).toBe('own_third')
    expect(resumed.currentItem).not.toBeNull()
  })

  it('a timed-out tackle-back costs exactly what answering it wrong costs', () => {
    const wrongDeps = makeDeps(5)
    const timeoutDeps = makeDeps(5)
    const a = (() => {
      const s = start(wrongDeps)
      return answer(s, wildMiss(s.currentItem!), wrongDeps)
    })()
    const b = (() => {
      const s = start(timeoutDeps)
      return answer(s, wildMiss(s.currentItem!), timeoutDeps)
    })()
    expect(a).toEqual(b)

    const wrong = answer(a, wildMiss(a.currentItem!), wrongDeps, 9999)
    const timedOut = reduce(b, { type: 'tackleBackTimeout' }, timeoutDeps)

    // Identical in every consequence. The only difference anywhere in the state
    // is what he typed and how long he took, which is the record of what
    // happened rather than a cost.
    const scrub = (s: MatchState): MatchState => ({
      ...s,
      log: s.log.map((a2, i) => (i === s.log.length - 1 ? { ...a2, given: '', latencyMs: 0 } : a2)),
    })
    expect(scrub(timedOut)).toEqual(scrub(wrong))

    expect(timedOut.questionsAsked).toBe(wrong.questionsAsked)
    expect(last(timedOut.log).context).toBe('tackleback')
    expect(last(timedOut.log).correct).toBe(false)
    expect(last(timedOut.log).given).toBe('')
  })

  it('ignores a tackle-back clock that fires outside a tackle-back', () => {
    const deps = makeDeps()
    const s = start(deps)
    expect(reduce(s, { type: 'tackleBackTimeout' }, deps)).toBe(s)
  })
})

describe('defending', () => {
  /** Concede once, so the ball is theirs. */
  function defending(deps: MatchDeps, opponent = BRAZIL): MatchState {
    const s = start(deps, 'match-1', opponent)
    const missed = answer(s, wildMiss(s.currentItem!), deps)
    const lost = reduce(missed, { type: 'tackleBackTimeout' }, deps)
    return reduce(lost, { type: 'dismissFeedback' }, deps)
  }

  it('wins the ball back on a correct answer', () => {
    const deps = makeDeps()
    const s = defending(deps)
    const won = answer(s, right(s.currentItem!), deps)

    expect(won.possession).toBe('us')
    expect(won.zone).toBe('own_third')
    expect(won.defensiveStops).toBe(0)
    expect(won.score).toEqual([0, 0])
    expect(won.phase).toBe('question')
  })

  for (const opponent of [BRAZIL, PANAMA, CURACAO]) {
    const limit = concedeAfter(opponent)

    it(`concedes exactly one goal after ${limit} unanswered challenges — ${opponent.name}`, () => {
      const deps = makeDeps()
      let s = defending(deps, opponent)

      for (let i = 1; i < limit; i++) {
        s = answer(s, wildMiss(s.currentItem!), deps)
        expect(s.defensiveStops).toBe(i)
        expect(s.score).toEqual([0, 0])
        expect(s.possession).toBe('them')
        // A defensive miss is not a tackle-back; a run of them is the price.
        expect(s.phase).toBe('question')
      }

      s = answer(s, wildMiss(s.currentItem!), deps)
      expect(s.score).toEqual([0, 1])
      expect(s.defensiveStops).toBe(0)
      expect(s.possession).toBe('us')
      expect(s.zone).toBe('own_third')
      expect(s.courage.tackleBacksFaced).toBe(1) // only the one from the opening miss
    })
  }

  it('gives a tier-1 side one fewer chance than a tier-3 side, from the same position', () => {
    const strong = makeDeps(9)
    const middling = makeDeps(9)
    let a = defending(strong, BRAZIL)
    let b = defending(middling, PANAMA)

    a = answer(a, wildMiss(a.currentItem!), strong)
    b = answer(b, wildMiss(b.currentItem!), middling)
    a = answer(a, wildMiss(a.currentItem!), strong)
    b = answer(b, wildMiss(b.currentItem!), middling)

    // Two missed challenges: Brazil have scored, Panama have not.
    expect(a.score).toEqual([0, 1])
    expect(b.score).toEqual([0, 0])
    expect(b.defensiveStops).toBe(2)
  })
})

describe('who we are playing', () => {
  const NORMAL_PLAY: Pressure[] = ['own_third', 'midfield', 'final_third']

  it('never lets any opponent push normal play below a 0.55 success target', () => {
    // The guardrail. A capable but avoidant child who freezes in front of things
    // he fears are too hard must never be handed a coin flip, whoever he draws
    // and however far behind them he is.
    for (const opponent of OPPONENTS) {
      for (let overall = 0; overall <= 99; overall++) {
        for (const pressure of NORMAL_PLAY) {
          const target = targetSuccessFor(pressure, overall, opponent)
          expect(target, `${opponent.name} vs ${overall} at ${pressure}`).toBeGreaterThanOrEqual(
            MIN_MATCH_TARGET,
          )
        }
      }
    }
  })

  it('holds the floor for a rating-20 player against Brazil', () => {
    for (const pressure of NORMAL_PLAY) {
      expect(targetSuccessFor(pressure, 20, BRAZIL)).toBeGreaterThanOrEqual(MIN_MATCH_TARGET)
    }
    expect(targetSuccessFor('midfield', 20, BRAZIL)).toBe(TARGET_SUCCESS.midfield - MAX_OPPONENT_BIAS)
  })

  it('never moves a band by more than the cap, in either direction', () => {
    for (const opponent of OPPONENTS) {
      for (const overall of [0, 20, 50, 75, 99]) {
        for (const pressure of PRESSURES) {
          const target = targetSuccessFor(pressure, overall, opponent)
          const base = TARGET_SUCCESS[pressure]
          expect(target, `${pressure} vs ${opponent.name}`).toBeLessThanOrEqual(
            base + MAX_OPPONENT_BIAS + 1e-9,
          )
          expect(Math.abs(target - base)).toBeLessThanOrEqual(MAX_OPPONENT_BIAS + 1e-9)
        }
      }
    }
  })

  it('leaves the bands he chose for himself below the floor, where they belong', () => {
    // Flooring a bicycle kick at 0.55 would quietly delete the risk he chose to
    // take, so a band already below the floor keeps its own target as its floor.
    // Which means the dial is asymmetric for those two bands: a weak opponent
    // makes a spectacular a little more likely to come off, a strong one never
    // makes it less likely than the design intended.
    expect(targetSuccessFor('bicycle', 50, CURACAO)).toBeLessThan(MIN_MATCH_TARGET)
    expect(targetSuccessFor('bicycle', 50, BRAZIL)).toBe(TARGET_SUCCESS.bicycle)
    expect(targetSuccessFor('outside18', 50, BRAZIL)).toBe(TARGET_SUCCESS.outside18)
    expect(targetSuccessFor('bicycle', 99, CURACAO)).toBe(
      TARGET_SUCCESS.bicycle + MAX_OPPONENT_BIAS,
    )
    // Bands above the floor take the full hit and stop there.
    expect(targetSuccessFor('box', 50, BRAZIL)).toBe(MIN_MATCH_TARGET)
    expect(targetSuccessFor('midfield', 50, BRAZIL)).toBe(TARGET_SUCCESS.midfield - MAX_OPPONENT_BIAS)
  })

  it('leaves penalties exactly where the design put them', () => {
    for (const opponent of OPPONENTS) {
      expect(targetSuccessFor('penalty', 20, opponent)).toBe(TARGET_SUCCESS.penalty)
      expect(targetSuccessFor('penalty', 99, opponent)).toBe(TARGET_SUCCESS.penalty)
    }
  })

  it('turns both ways: the bias is negative against a stronger side, positive against a weaker one', () => {
    expect(opponentBias(50, BRAZIL)).toBe(-MAX_OPPONENT_BIAS)
    expect(opponentBias(50, CURACAO)).toBeLessThan(0)
    expect(opponentBias(50, CURACAO)).toBeGreaterThan(-MAX_OPPONENT_BIAS)
    expect(opponentBias(90, CURACAO)).toBe(MAX_OPPONENT_BIAS)
    expect(opponentBias(BRAZIL.rating, BRAZIL)).toBe(0)
    // Junk in, no bias out.
    expect(opponentBias(Number.NaN, BRAZIL)).toBe(-MAX_OPPONENT_BIAS)
    expect(opponentBias(50, undefined)).toBe(0)
  })

  it('asks harder questions against Brazil than against Curaçao, same seed, same answers', () => {
    let brazil = 0
    let curacao = 0
    const seeds = 20

    for (let seed = 1; seed <= seeds; seed++) {
      const hard = makeDeps(seed)
      const easy = makeDeps(seed)
      const hardMatch = last(play(start(hard, 'm', BRAZIL), hard, right))
      const easyMatch = last(play(start(easy, 'm', CURACAO), easy, right))

      brazil += hardMatch.log.reduce((sum, a) => sum + a.difficulty, 0) / hardMatch.log.length
      curacao += easyMatch.log.reduce((sum, a) => sum + a.difficulty, 0) / easyMatch.log.length
    }

    expect(brazil / seeds).toBeGreaterThan(curacao / seeds)
  })

  it('publishes a shorter tackle-back clock for a stronger side', () => {
    expect(tackleBackMs(BRAZIL)).toBe(5000)
    expect(tackleBackMs(PANAMA)).toBe(6500)
    expect(tackleBackMs(CURACAO)).toBe(8000)
    expect(tackleBackMs(undefined)).toBe(6500)

    // On the state too, so the UI has one place to read it.
    expect(start(makeDeps(), 'm', BRAZIL).tackleBackMs).toBe(5000)
    expect(start(makeDeps(), 'm', CURACAO).tackleBackMs).toBe(8000)
  })

  it('gives every tier a concede limit, and gives none of them nothing', () => {
    expect(concedeAfter(BRAZIL)).toBe(2)
    expect(concedeAfter(PANAMA)).toBe(3)
    expect(concedeAfter(CURACAO)).toBe(4)
    expect(concedeAfter(undefined)).toBe(3)
    for (const opponent of OPPONENTS) {
      expect(concedeAfter(opponent), opponent.name).toBeGreaterThanOrEqual(2)
      expect(concedeAfter(opponent), opponent.name).toBeLessThanOrEqual(4)
    }
  })

  it('does not make the help harder — the scaffold ignores the opponent', () => {
    // Brazil may ask harder questions and allow less time. Brazil may not make
    // the rung back into the match harder. `playerOverall` is what drives the
    // bias, so a scaffold that reacted to the opponent would move with it.
    const item = generatorFor('MT.4.NBT.5')!.generate(60, makeRng(1))
    const behind = chooseScaffold(item, { kind: 'near' }, { ...makeDeps(3), playerOverall: 20 })
    const ahead = chooseScaffold(item, { kind: 'near' }, { ...makeDeps(3), playerOverall: 90 })

    expect(behind.difficulty).toBe(ahead.difficulty)
    expect(behind.standardId).toBe(ahead.standardId)
  })

  it('is materially harder to beat a tier-1 side than a tier-4 side', () => {
    const brazil = simulate(BRAZIL, 'group', 120)
    const panama = simulate(PANAMA, 'group', 120)
    const curacao = simulate(CURACAO, 'group', 120)

    // Measured: 0.850 / 0.917 / 0.958 win, conceding 0.150 / 0.050 / 0.000 a
    // match. Asserted as inequalities with headroom rather than as pinned
    // numbers — the point is that opponent identity changes the result at all,
    // which before the three dials it did not, by a margin no re-tuning should
    // quietly erase.
    expect(curacao.winRate).toBeGreaterThan(brazil.winRate + 0.05)
    expect(brazil.winRate).toBeLessThan(panama.winRate)
    expect(panama.winRate).toBeLessThan(curacao.winRate)

    // The clearest signal of the three dials working: a tier-1 side actually
    // scores, and a tier-4 side essentially never does.
    expect(brazil.goalsAgainst).toBeGreaterThan(0.1)
    expect(curacao.goalsAgainst).toBeLessThan(0.02)
  })

  it('would show none of that without the dials', () => {
    // The same simulation against two sides that differ only in name, both
    // rated where the player is and both in the middle tier: identical results,
    // which is exactly what every opponent used to produce.
    const twin = (name: string): Opponent => ({ ...PANAMA, id: name, name, rating: 50, tier: 3 })
    expect(simulate(twin('a'), 'group', 60)).toEqual(simulate(twin('b'), 'group', 60))
  })
})

describe('what is riding on it', () => {
  it('starts a friendly with the ball, and a knockout without it', () => {
    const friendly = start(makeDeps(), 'm', BRAZIL, 'friendly')
    const knockout = start(makeDeps(), 'm', BRAZIL, 'knockout')

    expect(friendly.stakes).toBe('friendly')
    expect(friendly.possession).toBe('us')
    expect(friendly.zone).toBe('own_third')

    expect(knockout.stakes).toBe('knockout')
    expect(knockout.possession).toBe('them')
    expect(knockout.zone).toBe('midfield')
    expect(knockout.clearances).toBe(0)
    // Still a question on the board, and still one he expects to get right.
    expect(knockout.currentItem).not.toBeNull()
  })

  it('defaults to a friendly, which is the gentlest thing the game can be', () => {
    const deps = makeDeps()
    expect(startMatch({ id: 'm', opponent: BRAZIL, deps }).stakes).toBe('friendly')
  })

  it('needs the ball cleared more than once in a knockout, by tier', () => {
    for (const stakes of ['friendly', 'group'] as Stakes[]) {
      for (const opponent of [BRAZIL, PANAMA, CURACAO]) {
        expect(stopsToClear(opponent, stakes)).toBe(1)
      }
    }
    expect(stopsToClear(BRAZIL, 'knockout')).toBe(3)
    expect(stopsToClear(PANAMA, 'knockout')).toBe(2)
    expect(stopsToClear(CURACAO, 'knockout')).toBe(1)
    expect(stopsToClear(undefined, 'knockout')).toBe(1)
  })

  it('keeps the ball through a tackle until the attack is properly cleared', () => {
    const deps = makeDeps(5)
    let s = start(deps, 'm', BRAZIL, 'knockout')
    expect(s.possession).toBe('them')

    // One good tackle. Against Brazil in a knockout that is not enough.
    s = answer(s, right(s.currentItem!), deps)
    expect(s.possession).toBe('them')
    expect(s.clearances).toBe(1)

    // A mistake in between is a chance for them, and the chance stands even
    // after the next tackle — the danger is cumulative.
    s = answer(s, wildMiss(s.currentItem!), deps)
    expect(s.possession).toBe('them')
    expect(s.defensiveStops).toBe(1)
    expect(s.clearances).toBe(1)
    // Not a tackle-back: defending is not where the safety net lives.
    expect(s.phase).toBe('question')

    s = answer(s, right(s.currentItem!), deps)
    expect(s.possession).toBe('them')
    expect(s.clearances).toBe(2)

    // The third clearance ends it, and he breaks from halfway.
    s = answer(s, right(s.currentItem!), deps)
    expect(s.possession).toBe('us')
    expect(s.zone).toBe('midfield')
    expect(s.clearances).toBe(0)
    expect(s.defensiveStops).toBe(0)
  })

  it('still concedes on the second chance, tackles in between or not', () => {
    const deps = makeDeps(5)
    let s = start(deps, 'm', BRAZIL, 'knockout')
    s = answer(s, right(s.currentItem!), deps) // a tackle
    s = answer(s, wildMiss(s.currentItem!), deps) // first chance
    s = answer(s, right(s.currentItem!), deps) // another tackle
    expect(s.score).toEqual([0, 0])

    s = answer(s, wildMiss(s.currentItem!), deps) // second chance
    expect(s.score).toEqual([0, 1])
    expect(s.possession).toBe('us')
    expect(s.zone).toBe('midfield') // a kickoff, from the centre circle
    expect(s.defensiveStops).toBe(0)
    expect(s.clearances).toBe(0)
  })

  it('gives him the second-half kickoff, and takes their attack with the whistle', () => {
    const deps = makeDeps(3)
    const trace = play(start(deps, 'm', BRAZIL, 'knockout'), deps, right)
    const atBreak = trace.find((s) => s.phase === 'halftime')!
    const resumed = trace[trace.indexOf(atBreak) + 1]!

    if (atBreak.possession === 'them') {
      expect(resumed.possession).toBe('us')
      expect(resumed.zone).toBe('midfield')
      expect(resumed.clearances).toBe(0)
      expect(resumed.defensiveStops).toBe(0)
    }
    // Whatever it did, it consumed nothing.
    expect(resumed.questionsAsked).toBe(atBreak.questionsAsked)
    expect(resumed.log).toHaveLength(atBreak.log.length)
    expect(resumed.score).toEqual(atBreak.score)
  })

  it('never lets the second-half whistle take a tackle-back off him', () => {
    // The one thing halftime has never been allowed to do. A knockout does not
    // become the exception.
    const deps = makeDeps(21)
    const trace = play(start(deps, 'm', BRAZIL, 'knockout'), deps, (item, s) =>
      s.questionsAsked === HALFTIME_AFTER - 1 ? wildMiss(item) : right(item),
    )
    const atBreak = trace.find((s) => s.phase === 'halftime')!
    if (atBreak.resumePhase !== 'tackleback') return

    const resumed = reduce(atBreak, { type: 'dismissFeedback' }, deps)
    expect(resumed.phase).toBe('tackleback')
    expect(resumed.currentItem).toBe(atBreak.currentItem)
    expect(resumed.pendingItem).toBe(atBreak.pendingItem)
  })

  // -------------------------------------------------------------------------
  // The acceptance numbers

  it('makes a tier-1 knockout a real match', () => {
    const r = simulate(BRAZIL, 'knockout')

    // Measured over 300 matches, a rating-50 player answering at his true Elo
    // probability: 0.593 win, 0.330 draw, 0.077 loss, 1.44-0.73, and Brazil
    // score in 57% of them. Before knockouts existed the same player won 88%
    // and Brazil scored in 16%.
    expect(r.winRate).toBeGreaterThanOrEqual(0.55)
    expect(r.winRate).toBeLessThanOrEqual(0.65)
    // They score in a majority of matches, so the threat is real rather than
    // theoretical.
    expect(r.theyScoredRate).toBeGreaterThan(0.5)
    // Draws common enough that a penalty shootout is worth building.
    expect(r.drawRate).toBeGreaterThan(0.15)
    // And he can actually lose, which is the point of a knockout.
    expect(1 - r.winRate - r.drawRate).toBeGreaterThan(0.02)
  })

  it('leaves a tier-4 knockout comfortably winnable', () => {
    const r = simulate(CURACAO, 'knockout')

    // A minnow in the last 16 is still a minnow. Measured 0.978.
    expect(r.winRate).toBeGreaterThan(0.85)
    expect(r.goalsAgainst).toBeLessThan(0.05)
  })

  it('gets harder monotonically across the tiers in a knockout too', () => {
    const rates = [BRAZIL, PANAMA, CURACAO].map((o) => simulate(o, 'knockout', 150).winRate)
    expect(rates[0]!).toBeLessThan(rates[1]!)
    expect(rates[1]!).toBeLessThan(rates[2]!)
  })

  it('never punishes him for scoring', () => {
    // The constraint that matters most. The opposition getting the ball back
    // after a goal must never make scoring a bad idea.
    for (const stakes of ['group', 'knockout'] as Stakes[]) {
      const byGoals = [...simulate(BRAZIL, stakes, 400).winRateByGoalsFor.entries()]
      expect(byGoals.length).toBeGreaterThan(2)
      for (let i = 1; i < byGoals.length; i++) {
        expect(byGoals[i]![1], `${stakes}: ${byGoals[i]![0]} goals`).toBeGreaterThanOrEqual(
          byGoals[i - 1]![1],
        )
      }
      // Scoring at all is the difference between winning and not.
      expect(byGoals[0]![1]).toBe(0)
      expect(byGoals[byGoals.length - 1]![1]).toBeGreaterThan(0.9)
    }
  })

  // -------------------------------------------------------------------------
  // The early campaign must not have moved

  it('leaves group matches identical to friendlies, state for state', () => {
    // The regression guard. Everything the knockout rules touch is keyed on
    // `stakes === 'knockout'`, so a group game and a friendly are the same game
    // — not statistically, but state for state.
    for (let seed = 1; seed <= 12; seed++) {
      for (const respond of [right, wildMiss, nearMiss]) {
        const a = makeDeps(seed)
        const b = makeDeps(seed)
        const friendly = play(start(a, 'm', BRAZIL, 'friendly'), a, respond)
        const group = play(start(b, 'm', BRAZIL, 'group'), b, respond)

        expect(group.map((s) => ({ ...s, stakes: 'friendly' as Stakes }))).toEqual(friendly)
      }
    }
  })

  it('leaves the knockout rules inert outside a knockout', () => {
    for (const stakes of ['friendly', 'group'] as Stakes[]) {
      for (const opponent of [BRAZIL, PANAMA, CURACAO]) {
        for (let seed = 1; seed <= 6; seed++) {
          const deps = makeDeps(seed)
          const trace = play(start(deps, 'm', opponent, stakes), deps, (item, s) =>
            s.questionsAsked % 2 === 0 ? wildMiss(item) : right(item),
          )
          expect(trace[0]!.possession).toBe('us')
          for (const s of trace) {
            expect(s.clearances, `${stakes} vs ${opponent.name}`).toBe(0)
            // Winning the ball back always puts him in his own third.
            if (s.possession === 'us' && s.zone === 'midfield') {
              expect(s.phase === 'question' || s.phase === 'fulltime').toBe(true)
            }
          }
        }
      }
    }
  })

  it('keeps the early campaign encouraging', () => {
    // Numbers, not just structure: a group game against the best side in the
    // world is still a match he expects to win.
    for (const stakes of ['friendly', 'group'] as Stakes[]) {
      const r = simulate(BRAZIL, stakes, 200)
      expect(r.winRate).toBeGreaterThan(0.85)
      expect(r.theyScoredRate).toBeLessThan(0.25)
    }
  })

  it('diverges from a group match in a knockout, and never in a friendly', () => {
    const a = makeDeps(9)
    const b = makeDeps(9)
    const c = makeDeps(9)
    const group = last(play(start(a, 'm', BRAZIL, 'group'), a, right))
    const friendly = last(play(start(b, 'm', BRAZIL, 'friendly'), b, right))
    const knockout = last(play(start(c, 'm', BRAZIL, 'knockout'), c, right))

    expect({ ...friendly, stakes: 'group' as Stakes }).toEqual(group)
    expect(knockout).not.toEqual({ ...group, stakes: 'knockout' as Stakes })
  })

  it('adds no difficulty dial: the floor holds in a knockout exactly as it does anywhere', () => {
    // `targetSuccessFor` takes no `stakes` at all, and that is the design: the
    // knockout threat is made of possession, never of harder questions. This
    // pins the consequence — every question in a knockout is drawn from the
    // same bands, at the same targets, above the same floor.
    for (const opponent of OPPONENTS) {
      for (const overall of [0, 20, 50, 99]) {
        for (const pressure of ['own_third', 'midfield', 'final_third'] as Pressure[]) {
          expect(targetSuccessFor(pressure, overall, opponent)).toBeGreaterThanOrEqual(
            MIN_MATCH_TARGET,
          )
        }
      }
    }

    // And measured, band by band: a question asked in a given part of the pitch
    // is the same question it would have been in a group game.
    //
    // Note what this does *not* claim. A knockout does shift the mix — he
    // restarts from halfway rather than from the back, so he sees fewer of the
    // gentle `own_third` questions and more midfield ones, and the overall mean
    // difficulty rises by about 3 points. That is where the ball is, not how
    // hard the game decided to be, and every band he meets is still pitched
    // where the design put it.
    const byBand = (stakes: Stakes) => {
      const sums = new Map<string, { sum: number; n: number }>()
      for (let seed = 1; seed <= 40; seed++) {
        const deps = makeDeps(seed)
        const trace = play(start(deps, 'm', BRAZIL, stakes), deps, elo(50, makeRng(seed * 7 + 1)))
        for (const [i, s] of trace.entries()) {
          if (i === 0 || s.log.length === trace[i - 1]!.log.length) continue
          const asked = trace[i - 1]!
          const band =
            asked.phase === 'tackleback'
              ? 'tackleback'
              : asked.shotChoice !== null
                ? 'shot'
                : asked.zone
          const bucket = sums.get(band) ?? { sum: 0, n: 0 }
          bucket.sum += last(s.log).difficulty
          bucket.n += 1
          sums.set(band, bucket)
        }
      }
      return sums
    }

    const group = byBand('group')
    const knockout = byBand('knockout')
    for (const [band, g] of group) {
      const k = knockout.get(band)
      if (k === undefined || k.n < 20 || g.n < 20) continue
      expect(Math.abs(k.sum / k.n - g.sum / g.n), band).toBeLessThan(2)
    }
  })
})

describe('unreadable answers', () => {
  it('consume nothing at all', () => {
    const deps = makeDeps()
    const s = start(deps)
    const after = answer(s, '???', deps)

    expect(after.questionsAsked).toBe(s.questionsAsked)
    expect(after.log).toHaveLength(s.log.length)
    expect(after.possession).toBe(s.possession)
    expect(after.zone).toBe(s.zone)
    expect(after.score).toEqual(s.score)
    expect(after.phase).toBe('question')
    expect(after.currentItem).toBe(s.currentItem)
    expect(after.lastMiss).toEqual({ kind: 'unreadable' })
  })

  it('consume nothing during a tackle-back either', () => {
    const deps = makeDeps()
    const s = start(deps)
    const missed = answer(s, wildMiss(s.currentItem!), deps)
    const after = answer(missed, '', deps)

    expect(after.phase).toBe('tackleback')
    expect(after.questionsAsked).toBe(missed.questionsAsked)
    expect(after.log).toHaveLength(missed.log.length)
    expect(after.currentItem).toBe(missed.currentItem)
    expect(after.pendingItem).toBe(missed.pendingItem)
    expect(after.courage).toEqual(missed.courage)
  })

  it('never end the match, however many arrive', () => {
    const deps = makeDeps()
    let s = start(deps)
    for (let i = 0; i < 50; i++) s = answer(s, 'blue', deps)

    expect(s.questionsAsked).toBe(0)
    expect(s.phase).toBe('question')
  })
})

describe('the length of a match', () => {
  const strategies: [string, (item: Item) => string, PlayOpts][] = [
    ['everything right', right, {}],
    ['everything wrong', wildMiss, {}],
    ['near misses', nearMiss, {}],
    ['wrong, and every tackle-back timed out', wildMiss, { timeOutTackleBacks: true }],
    ['bicycle kicks only', right, { shot: 'bicycle' }],
  ]

  for (const [name, respond, opts] of strategies) {
    it(`ends at exactly ${QUESTIONS_PER_MATCH} questions — ${name}`, () => {
      const deps = makeDeps(13)
      const trace = play(start(deps), deps, respond, opts)
      const final = last(trace)

      expect(final.phase).toBe('fulltime')
      expect(final.questionsAsked).toBe(QUESTIONS_PER_MATCH)
      expect(final.log).toHaveLength(QUESTIONS_PER_MATCH)
      expect(final.currentItem).toBeNull()
      expect(final.pendingItem).toBeNull()
      // Never overshoots on the way, either.
      for (const s of trace) expect(s.questionsAsked).toBeLessThanOrEqual(QUESTIONS_PER_MATCH)
    })
  }

  it('is over for good — every event at full time is a no-op', () => {
    const deps = makeDeps(13)
    const final = last(play(start(deps), deps, right))
    for (const event of ALL_EVENTS) expect(reduce(final, event, deps)).toBe(final)
  })
})

describe('halftime', () => {
  it(`fires exactly once, at ${HALFTIME_AFTER} questions`, () => {
    const deps = makeDeps(21)
    const trace = play(start(deps), deps, right)
    const breaks = trace.filter((s) => s.phase === 'halftime')

    expect(breaks).toHaveLength(1)
    expect(breaks[0]!.questionsAsked).toBe(HALFTIME_AFTER)
    expect(breaks[0]!.halftimeShown).toBe(true)
    expect(last(trace).halftimeShown).toBe(true)
  })

  it('fires once whatever is happening at the time', () => {
    for (const [respond, opts] of [
      [right, {}],
      [wildMiss, {}],
      [wildMiss, { timeOutTackleBacks: true }],
      [nearMiss, { shot: 'bicycle' }],
    ] as [(item: Item) => string, PlayOpts][]) {
      for (let seed = 1; seed <= 8; seed++) {
        const deps = makeDeps(seed)
        const trace = play(start(deps), deps, respond, opts)
        expect(trace.filter((s) => s.phase === 'halftime')).toHaveLength(1)
      }
    }
  })

  it('gives back the question it interrupted', () => {
    const deps = makeDeps(21)
    const trace = play(start(deps), deps, right)
    const atBreak = trace.find((s) => s.phase === 'halftime')!
    const resumed = reduce(atBreak, { type: 'dismissFeedback' }, deps)

    expect(resumed.phase).not.toBe('halftime')
    expect(resumed.currentItem).toBe(atBreak.currentItem)
    expect(resumed.questionsAsked).toBe(atBreak.questionsAsked)
    expect(resumed.score).toEqual(atBreak.score)
  })

  it('resumes on any event, and consumes nothing doing it', () => {
    const deps = makeDeps(21)
    const atBreak = play(start(deps), deps, right).find((s) => s.phase === 'halftime')!

    for (const event of ALL_EVENTS) {
      const resumed = reduce(atBreak, event, deps)
      expect(resumed.phase).not.toBe('halftime')
      expect(resumed.questionsAsked).toBe(atBreak.questionsAsked)
      expect(resumed.log).toHaveLength(atBreak.log.length)
      expect(resumed.score).toEqual(atBreak.score)
    }
  })

  it('resumes a tackle-back it interrupted, scaffold and all', () => {
    // Miss the seventh question exactly, so the whistle goes while the ball is
    // still loose. The break must not eat the tackle-back.
    const deps = makeDeps(21)
    const trace = play(start(deps), deps, (item, s) =>
      s.questionsAsked === HALFTIME_AFTER - 1 ? wildMiss(item) : right(item),
    )
    const atBreak = trace.find((s) => s.phase === 'halftime')!

    expect(atBreak.questionsAsked).toBe(HALFTIME_AFTER)
    expect(atBreak.pendingItem).not.toBeNull()

    const resumed = reduce(atBreak, { type: 'dismissFeedback' }, deps)
    expect(resumed.phase).toBe('tackleback')
    expect(resumed.currentItem).toBe(atBreak.currentItem)
    expect(resumed.pendingItem).toBe(atBreak.pendingItem)
    expect(resumed.courage.tackleBacksFaced).toBe(atBreak.courage.tackleBacksFaced)
  })

  it('resumes a shot choice it interrupted, without taking the shot for him', () => {
    // Two lost, two survived challenges, then a break away: the seventh answer
    // arrives in the final third, so the whistle goes with the choice still on
    // the table. Panama rather than Brazil because the count depends on how many
    // defensive challenges the opponent allows.
    const deps = makeDeps(21)
    const trace = play(start(deps, 'match-1', PANAMA), deps, (item, s) =>
      s.questionsAsked < 4 ? wildMiss(item) : right(item),
    )
    const atBreak = trace.find((s) => s.phase === 'halftime')!

    expect(atBreak.questionsAsked).toBe(HALFTIME_AFTER)
    expect(atBreak.zone).toBe('final_third')
    expect(atBreak.currentItem).toBeNull()

    const resumed = reduce(atBreak, { type: 'answer', given: '1', latencyMs: 10 }, deps)
    expect(resumed.phase).toBe('shot_choice')
    expect(resumed.currentItem).toBeNull()
    expect(resumed.courage.hardShotsAttempted).toBe(atBreak.courage.hardShotsAttempted)
  })
})

describe('the log', () => {
  it('has one attempt per answered question, in the right context', () => {
    const deps = makeDeps(3)
    const trace = play(start(deps), deps, (item, s) => (s.questionsAsked % 2 === 0 ? right(item) : wildMiss(item)))
    const final = last(trace)

    expect(final.log).toHaveLength(final.questionsAsked)
    for (const attempt of final.log) {
      expect(attempt.matchId).toBe('match-1')
      expect(['match', 'tackleback']).toContain(attempt.context)
      expect(Number.isFinite(attempt.at)).toBe(true)
      expect(attempt.standardId).not.toBe('')
    }

    // Every attempt answered in the tackle-back phase is logged as one.
    const answered = trace.filter(
      (s, i) => i > 0 && s.log.length > trace[i - 1]!.log.length,
    )
    for (const [i, s] of answered.entries()) {
      const before = trace[trace.indexOf(s) - 1]!
      expect(last(s.log).context).toBe(before.phase === 'tackleback' ? 'tackleback' : 'match')
      expect(s.log).toHaveLength(i + 1)
    }
  })

  it('logs the item that was generated, not the difficulty that was asked for', () => {
    // At rating 0 every pressure band asks for difficulty 0, which no generator
    // can produce — they all start at 5 or higher. What lands in the log has to
    // be what the generator actually made.
    const deps = makeDeps(11, 0)
    const trace = play(start(deps), deps, right)
    const final = last(trace)

    const asked: Item[] = []
    for (const [i, s] of trace.entries()) {
      if (i > 0 && s.log.length > trace[i - 1]!.log.length) asked.push(trace[i - 1]!.currentItem!)
    }

    expect(asked).toHaveLength(final.log.length)
    for (const [i, attempt] of final.log.entries()) {
      expect(attempt.difficulty).toBe(asked[i]!.difficulty)
      expect(attempt.standardId).toBe(asked[i]!.standardId)
      expect(attempt.params).toEqual(asked[i]!.params)
      expect(attempt.difficulty).toBeGreaterThan(0)
    }
  })

  it('records what he typed, whether it was right, and how long he took', () => {
    const deps = makeDeps()
    const s = start(deps)
    const given = right(s.currentItem!)
    const next = answer(s, given, deps, 4567)

    expect(last(next.log)).toMatchObject({
      given,
      correct: true,
      latencyMs: 4567,
      context: 'match',
      matchId: 'match-1',
      standardId: s.currentItem!.standardId,
      difficulty: s.currentItem!.difficulty,
    })
    expect(last(next.log).shot).toBeUndefined()
  })

  it('names the misconception when the wrong answer is a known one', () => {
    const deps = makeDeps(2)
    let s = start(deps)
    for (let i = 0; i < 40 && s.phase !== 'fulltime'; i++) {
      const item = s.currentItem
      const signature = item?.misconceptions[0]?.signature
      if (item !== null && signature !== undefined && signature !== item.answer.canonical) {
        const next = answer(s, signature, deps)
        if (next.log.length > s.log.length && last(next.log).correct === false) {
          expect(last(next.log).misconceptionId).toBe(item.misconceptions[0]!.id)
          return
        }
      }
      s = reduce(s, nextEvent(s, right, {}), deps)
    }
    throw new Error('no item with a usable misconception signature came up')
  })

  it('tags a shot once, so the courage track cannot double count', () => {
    const deps = makeDeps(4)
    // Miss the shot, win the tackle-back, then bury the retake.
    const atShot = advanceTo(start(deps), deps, (s) => s.phase === 'shot_choice')
    const chosen = reduce(atShot, { type: 'chooseShot', shot: 'bicycle' }, deps)
    const missed = answer(chosen, wildMiss(chosen.currentItem!), deps)
    const won = answer(missed, right(missed.currentItem!), deps)
    expect(won.shotChoice).toBe('bicycle')
    expect(won.currentItem).toEqual(chosen.currentItem)

    const retaken = answer(won, right(won.currentItem!), deps)
    expect(retaken.score).toEqual([1, 0])
    expect(retaken.courage.hardShotsAttempted).toBe(1)
    expect(deriveCourage(retaken.log as Attempt[]).hardShotsAttempted).toBe(1)
  })

  it('is a log the store will accept whole', () => {
    const deps = makeDeps(15)
    const final = last(
      play(start(deps), deps, (item, s) => (s.questionsAsked % 3 === 0 ? wildMiss(item) : right(item)), {
        shot: 'outside18',
      }),
    )

    // What the caller hands to `appendAttempts`. An attempt the validator drops
    // is rating history silently lost.
    const drafts: AttemptDraft[] = final.log
    expect(drafts).toHaveLength(QUESTIONS_PER_MATCH)
    for (const [i, draft] of drafts.entries()) {
      expect(validateAttempt({ ...draft, id: `a${i}` }), JSON.stringify(draft)).not.toBeNull()
    }
  })

  it('tags a shot once however many times it is taken back and retaken', () => {
    const deps = makeDeps(4)
    const atShot = advanceTo(start(deps), deps, (s) => s.phase === 'shot_choice')
    let s = reduce(atShot, { type: 'chooseShot', shot: 'bicycle' }, deps)

    // Miss the shot, win it back, miss it again, win it back again.
    for (let i = 0; i < 2; i++) {
      s = answer(s, wildMiss(s.currentItem!), deps)
      expect(s.phase).toBe('tackleback')
      s = answer(s, right(s.currentItem!), deps)
      expect(s.phase).toBe('question')
      expect(s.shotChoice).toBe('bicycle')
    }
    s = answer(s, right(s.currentItem!), deps)

    expect(s.score).toEqual([1, 0])
    expect(s.courage.hardShotsAttempted).toBe(1)
    expect(deriveCourage(s.log as Attempt[]).hardShotsAttempted).toBe(1)
    expect(s.log.filter((a) => a.shot !== undefined)).toHaveLength(1)
  })

  it('agrees with the courage derived from it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deps = makeDeps(seed)
      const final = last(
        play(start(deps), deps, (item, s) => (s.questionsAsked % 3 === 0 ? right(item) : nearMiss(item)), {
          shot: 'bicycle',
        }),
      )
      const derived = deriveCourage(final.log as Attempt[])

      expect(derived.hardShotsAttempted).toBe(final.courage.hardShotsAttempted)
      expect(derived.tackleBacksFaced).toBe(final.courage.tackleBacksFaced)
      expect(derived.tackleBacksWon).toBe(final.courage.tackleBacksWon)
    }
  })
})

describe('the miss classification', () => {
  it('changes the scaffold and nothing else', () => {
    const nearDeps = makeDeps(17)
    const wildDeps = makeDeps(17)
    const nearTrace = play(start(nearDeps), nearDeps, nearMiss)
    const wildTrace = play(start(wildDeps), wildDeps, wildMiss)

    const shape = (trace: MatchState[]) =>
      trace.map((s) => ({
        phase: s.phase,
        zone: s.zone,
        possession: s.possession,
        score: s.score,
        questionsAsked: s.questionsAsked,
        defensiveStops: s.defensiveStops,
        courage: s.courage,
      }))

    expect(shape(nearTrace)).toEqual(shape(wildTrace))
    expect(last(nearTrace).score).toEqual(last(wildTrace).score)
    expect(last(nearTrace).questionsAsked).toBe(last(wildTrace).questionsAsked)
  })

  it('carries the miss on the state for the tackle-back to narrate', () => {
    const deps = makeDeps()
    const s = start(deps)
    const near = answer(s, nearMiss(s.currentItem!), deps)
    expect(near.lastMiss?.kind === 'near' || near.lastMiss?.kind === 'misconception').toBe(true)

    const wildDeps = makeDeps()
    const w = start(wildDeps)
    expect(answer(w, wildMiss(w.currentItem!), wildDeps).lastMiss?.kind).toBe('off')
  })

  it('is not overwritten by losing the tackle-back, so the feedback still explains the miss', () => {
    const deps = makeDeps()
    const s = start(deps)
    const missed = answer(s, wildMiss(s.currentItem!), deps)
    const lost = answer(missed, wildMiss(missed.currentItem!), deps)

    expect(lost.lastMiss).toEqual(missed.lastMiss)
  })
})

describe('the tackle-back scaffold', () => {
  const anItem = (standardId: string, difficulty = 60) =>
    generatorFor(standardId)!.generate(difficulty, makeRng(1))

  it('repairs the computation after a near miss: same standard, easier', () => {
    for (const standardId of RATED_STANDARD_IDS) {
      const item = anItem(standardId)
      const scaffold = chooseScaffold(item, { kind: 'near', relativeError: 0.05 }, makeDeps())

      expect(scaffold.standardId, standardId).toBe(standardId)
      expect(scaffold.difficulty, standardId).toBeLessThan(item.difficulty)
    }
  })

  it('is never harder than the question it is scaffolding, however low the rating', () => {
    // At rating 99 the maths wants a hard scaffold; the cap says no.
    for (const standardId of RATED_STANDARD_IDS) {
      const item = anItem(standardId, generatorFor(standardId)!.range[0])
      const deps: MatchDeps = { ...makeDeps(), ratings: ratingsAt(99) }
      const scaffold = chooseScaffold(item, { kind: 'near' }, deps)
      expect(scaffold.difficulty, standardId).toBeLessThanOrEqual(item.difficulty)
    }
  })

  it('goes back to the concept after an off-target miss', () => {
    for (const [standardId, prerequisite] of Object.entries(PREREQUISITE)) {
      const item = anItem(standardId)
      const scaffold = chooseScaffold(item, { kind: 'off', relativeError: 40 }, makeDeps())
      expect(scaffold.standardId).toBe(prerequisite)
    }
  })

  it('treats a named misconception as a concept problem', () => {
    const item = anItem('MT.4.NBT.5')
    const scaffold = chooseScaffold(
      item,
      { kind: 'misconception', misconceptionId: 'whatever' },
      makeDeps(),
    )
    expect(scaffold.standardId).toBe(PREREQUISITE['MT.4.NBT.5'])
  })

  it('falls back to the same standard, much easier, when nothing sits underneath it', () => {
    const standardId = RATED_STANDARD_IDS.find((id) => PREREQUISITE[id] === undefined)!
    const item = anItem(standardId, 70)
    const scaffold = chooseScaffold(item, { kind: 'off', relativeError: 40 }, makeDeps())

    expect(scaffold.standardId).toBe(standardId)
    expect(scaffold.difficulty).toBeLessThan(item.difficulty)
  })

  it('only ever points at a standard the game can actually generate', () => {
    for (const [standardId, prerequisite] of Object.entries(PREREQUISITE)) {
      expect(generatorFor(standardId)).toBeDefined()
      expect(generatorFor(prerequisite)).toBeDefined()
      expect(prerequisite).not.toBe(standardId)
      // No cycles: one step back is a scaffold, and it must never come back
      // round to the standard it came from.
      expect(PREREQUISITE[prerequisite]).not.toBe(standardId)
    }
  })

  it('is what the tackle-back actually serves', () => {
    const runDeps = makeDeps(6)
    const s = start(runDeps)
    const item = s.currentItem!
    const missed = answer(s, wildMiss(item), runDeps)

    expect(missed.currentItem!.standardId).toBe(
      PREREQUISITE[item.standardId] ?? item.standardId,
    )
    const logged = answer(missed, right(missed.currentItem!), runDeps)
    expect(logged.log[1]).toMatchObject({
      context: 'tackleback',
      standardId: missed.currentItem!.standardId,
      difficulty: missed.currentItem!.difficulty,
    })
  })
})

describe('purity', () => {
  it('does not mutate a frozen state', () => {
    const deps = makeDeps()
    const phases = statesByPhase()

    for (const state of Object.values(phases)) {
      const frozen = deepFreeze(structuredClone(state)) as MatchState
      const before = structuredClone(frozen)
      for (const event of ALL_EVENTS) {
        expect(() => reduce(frozen, event, deps)).not.toThrow()
      }
      expect(frozen).toEqual(before)
    }
  })

  it('never throws, for any event, in any phase', () => {
    const phases = statesByPhase()
    for (const [phase, state] of Object.entries(phases)) {
      for (const event of ALL_EVENTS) {
        const deps = makeDeps(77)
        const next = reduce(state, event, deps)
        expect(next.phase, `${phase} + ${event.type}`).toBeTruthy()
        expect(['us', 'them']).toContain(next.possession)
      }
    }
  })

  it('survives junk in the answer box in any phase', () => {
    const junk = ['', '   ', '???', 'NaN', 'Infinity', '1/0', '9'.repeat(400), '½', '--3', '1,,2']
    const phases = statesByPhase()
    for (const state of Object.values(phases)) {
      for (const given of junk) {
        const deps = makeDeps(5)
        expect(() => reduce(state, { type: 'answer', given, latencyMs: -1 }, deps)).not.toThrow()
      }
    }
  })

  it('is deterministic for a seed and an event sequence', () => {
    const a = makeDeps(44)
    const b = makeDeps(44)
    expect(last(play(start(a), a, nearMiss, { shot: 'outside18' }))).toEqual(
      last(play(start(b), b, nearMiss, { shot: 'outside18' })),
    )
  })
})

describe('invariants', () => {
  it('hold under random events in random phases', () => {
    // Every event type is fair game in every phase here, including ones the UI
    // would never send and answers no parser can read. Nothing in the sweep is
    // allowed to throw, stall, or produce a state that breaks a rule.
    const everyStake: Stakes[] = ['friendly', 'group', 'knockout']

    for (let seed = 1; seed <= 250; seed++) {
      const deps = makeDeps(seed, seed % 100)
      const chaos = makeRng(seed * 7919 + 13)
      const opponent = OPPONENTS[seed % OPPONENTS.length]!
      const stakes = everyStake[seed % everyStake.length]!
      let s = start(deps, `m${seed}`, opponent, stakes)
      let steps = 0

      while (s.phase !== 'fulltime' && steps < 500) {
        steps++
        const item = s.currentItem
        const roll = chaos.int(0, 19)
        const given =
          item === null
            ? 'x'
            : roll < 7
              ? right(item)
              : roll < 10
                ? nearMiss(item)
                : roll < 13
                  ? wildMiss(item)
                  : roll < 15
                    ? (item.misconceptions[0]?.signature ?? 'x')
                    : chaos.pick(['', ' ', '??', 'NaN', '1/0', '-', '9'.repeat(300), '½'])

        const event = chaos.pick([
          { type: 'answer', given, latencyMs: chaos.int(-5, 60_000) },
          { type: 'answer', given, latencyMs: Number.NaN },
          { type: 'chooseShot', shot: chaos.pick(['wide', 'box', 'outside18', 'bicycle'] as const) },
          { type: 'tackleBackTimeout' },
          { type: 'dismissFeedback' },
        ] as MatchEvent[])

        const before = s
        const next = reduce(s, event, deps)

        // Nothing ever goes backwards, and no single event scores twice.
        expect(next.questionsAsked).toBeGreaterThanOrEqual(before.questionsAsked)
        expect(next.questionsAsked).toBeLessThanOrEqual(QUESTIONS_PER_MATCH)
        expect(next.log).toHaveLength(next.questionsAsked)
        expect(next.score[0]).toBeGreaterThanOrEqual(before.score[0])
        expect(next.score[1]).toBeGreaterThanOrEqual(before.score[1])
        expect(next.score[0] + next.score[1] - before.score[0] - before.score[1]).toBeLessThanOrEqual(1)

        expect(['us', 'them']).toContain(next.possession)
        expect(['own_third', 'midfield', 'final_third']).toContain(next.zone)
        expect(next.defensiveStops).toBeGreaterThanOrEqual(0)
        expect(next.defensiveStops).toBeLessThan(concedeAfter(next.opponent))
        expect(next.clearances).toBeGreaterThanOrEqual(0)
        expect(next.clearances).toBeLessThan(stopsToClear(next.opponent, next.stakes))
        if (next.possession === 'us') {
          expect(next.defensiveStops).toBe(0)
          expect(next.clearances).toBe(0)
        }
        expect(next.stakes).toBe(stakes)
        if (next.phase === 'question' || next.phase === 'tackleback' || next.phase === 'feedback') {
          expect(next.currentItem, `${next.phase} with nothing to show`).not.toBeNull()
        }
        if (next.phase === 'tackleback') expect(next.pendingItem).not.toBeNull()
        if (next.phase === 'fulltime') {
          expect(next.questionsAsked).toBe(QUESTIONS_PER_MATCH)
          expect(next.currentItem).toBeNull()
        }
        expect(next.courage.tackleBacksWon).toBeLessThanOrEqual(next.courage.tackleBacksFaced)
        // Anything the store would refuse on the way to disk is a lost attempt.
        for (const a of next.log) {
          expect(Number.isFinite(a.at)).toBe(true)
          expect(Number.isFinite(a.difficulty)).toBe(true)
          expect(a.latencyMs).toBeGreaterThanOrEqual(0)
        }
        s = next
      }

      expect(s.phase, `seed ${seed} stalled after ${steps} events`).toBe('fulltime')
    }
  })

  it('finishes whatever the ratings look like', () => {
    const corrupt = ratingsAt(50)
    corrupt.set('MT.4.NF.1', {
      standardId: 'MT.4.NF.1',
      rating: Number.NaN,
      attempts: 3,
      lastSeenAt: null,
      provisional: true,
    })

    const maps: [string, Map<string, StandardRating>][] = [
      ['rock bottom', ratingsAt(0)],
      ['maxed out', ratingsAt(99)],
      ['nothing known', new Map()],
      ['corrupt', corrupt],
    ]

    for (const [name, ratings] of maps) {
      for (const respond of [right, nearMiss, wildMiss]) {
        const deps: MatchDeps = { ...makeDeps(8), ratings }
        const final = last(play(start(deps), deps, respond, { shot: 'bicycle' }))
        expect(final.phase, name).toBe('fulltime')
        expect(final.log, name).toHaveLength(QUESTIONS_PER_MATCH)
        for (const attempt of final.log) {
          expect(Number.isFinite(attempt.difficulty), name).toBe(true)
        }
      }
    }
  })

  it('cannot be starved of a question: every phase has a way forward', () => {
    const phases = statesByPhase()
    for (const [name, state] of Object.entries(phases)) {
      if (name === 'fulltime') continue
      const deps = makeDeps(9)
      const respond = (item: Item) => right(item)
      const final = last(play(state, deps, respond))
      expect(final.phase, name).toBe('fulltime')
    }
  })
})
