/**
 * A match, as a pure reducer.
 *
 * Fourteen questions dressed as a game of football. The UI sends events and
 * renders the state; nothing in here knows about React, and nothing in here
 * reads a clock — `deps.now()` is the only source of time, so a match can be
 * replayed exactly from its seed and its event list.
 *
 * Three rules exist because of the ten-year-old this was built for, and they
 * are the ones to leave alone:
 *
 * **A miss loosens the ball; it never ends the possession.** Every wrong answer
 * goes to a tackle-back — a scaffolded sub-question that gives the ball straight
 * back if he wins it. Getting something wrong is a setback in the run of play,
 * not a verdict.
 *
 * **The clock may not confiscate anything.** A tackle-back that times out is
 * handled by exactly the same transition as one answered wrong. It does not cost
 * an extra question, an extra goal, or anything else the miss had not already
 * cost. His negative association with maths is specifically *the clock took
 * something away from me*, and this file is where that promise is kept.
 *
 * **Choosing the hard thing is rewarded before the outcome is known.**
 * `chooseShot` increments the courage count at the moment of choosing, not when
 * the answer comes in. An overhead kick into row Z still counts. The block this
 * child has sits in the moment *before* attempting something hard, so that is
 * the moment the game pays out on.
 *
 * A fourth rule is defensive rather than pedagogical: **`reduce` never throws
 * and never mutates.** An unexpected event in a phase is a no-op that returns
 * the same state, because a crash mid-match is unrecoverable for a player who
 * cannot open the devtools.
 */

import type { Opponent } from '../data/opponents'
import { SEED_RATING } from '../store/derive'
import type { Attempt, AttemptContext, ShotChoice, StandardRating } from '../store/types'
import { checkAnswer, classifyMiss } from './answer'
import type { MissClassification } from './answer'
import { difficultyForSuccess } from './elo'
import { generatorFor } from './items/generators'
import type { Item, ItemGenerator, Rng } from './items/types'
import { selectItem } from './select'

/** The length of a match. Everything else here is measured against it. */
export const QUESTIONS_PER_MATCH = 14

/** The whistle goes at half of them. */
export const HALFTIME_AFTER = 7

/** Unanswered defensive challenges before they score. */
export const CONCEDE_AFTER = 3

/**
 * How many recent standards a fresh question tries to avoid.
 *
 * Interleaving beats blocked practice, and a match that asked four fraction
 * questions in a row would also read as a match that had it in for him. Only a
 * preference — `selectItem` ignores it rather than failing to return an item.
 */
export const RECENT_WINDOW = 2

/**
 * Success rate a tackle-back aims at, by what the miss looked like.
 *
 * Both sit well above any pressure band in the match itself, because a
 * tackle-back is not a second test — it is the rung that gets him back to the
 * question he just missed. `off` aims higher still: if the method was wrong,
 * the arithmetic must be trivial or the scaffold is teaching two things at once.
 */
export const SCAFFOLD_TARGET_NEAR = 0.9
export const SCAFFOLD_TARGET_OFF = 0.95

/**
 * What sits underneath each standard, for scaffolding a concept miss.
 *
 * Deliberately one step, never a chain: a tackle-back that dropped two levels
 * would stop being the same lesson. Standards absent from this map have nothing
 * generatable underneath them (`MT.4.NF.1` is where fractions start;
 * `MT.4.NBT.4` needs an addition-fluency generator that does not exist yet;
 * `MT.4.G.1` is vocabulary), and scaffold to themselves at a much lower
 * difficulty instead.
 *
 * `index.test.ts` guarantees every standard here has exactly one generator, and
 * `match.test.ts` checks that both ends of every pair are generatable.
 */
export const PREREQUISITE: Record<string, string> = {
  // Comparing and combining fractions both rest on knowing when two of them are
  // the same fraction.
  'MT.4.NF.2': 'MT.4.NF.1',
  'MT.4.NF.3': 'MT.4.NF.1',
  // A fraction times a whole number is repeated addition of that fraction.
  'MT.4.NF.4': 'MT.4.NF.3',
  // Long multiplication, division and everything built on them come apart at
  // the facts.
  'MT.4.NBT.5': 'FLU.MULT',
  'MT.4.NBT.6': 'FLU.MULT',
  'MT.4.OA.1': 'FLU.MULT',
  'MT.4.OA.4': 'FLU.MULT',
  'MT.4.MD.1': 'FLU.MULT',
  // Area is a multiplication before it is anything else.
  'MT.4.MD.3': 'MT.4.NBT.5',
}

// ---------------------------------------------------------------------------
// Shape

export type MatchEvent =
  | { type: 'answer'; given: string; latencyMs: number }
  | { type: 'chooseShot'; shot: ShotChoice }
  | { type: 'tackleBackTimeout' }
  /** Advance past a worked-solution card, or out of the halftime team talk. */
  | { type: 'dismissFeedback' }

export type Zone = 'own_third' | 'midfield' | 'final_third'

export type Phase =
  /** A question is live. */
  | 'question'
  /** Reached the final third, choosing how to shoot. */
  | 'shot_choice'
  /** Ball loose, scaffolded sub-question on a visible clock. */
  | 'tackleback'
  /** Showing a worked solution after a lost tackle-back. */
  | 'feedback'
  | 'halftime'
  | 'fulltime'

/** The phases play can be resumed into after the halftime card. */
export type PlayPhase = Exclude<Phase, 'halftime' | 'fulltime'>

export interface MatchCourage {
  /** Incremented on choosing `outside18` or `bicycle`, before the answer. */
  hardShotsAttempted: number
  tackleBacksWon: number
  tackleBacksFaced: number
}

export interface MatchState {
  id: string
  opponent: Opponent
  /**
   * Questions asked so far, counting tackle-backs.
   *
   * A tackle-back is a question, so it costs one of the fourteen. That keeps the
   * match a fixed, promised length whatever happens in it — a bad run gets
   * shorter, never longer, which matters for a child with a history of
   * unfinished work. It also makes `log.length === questionsAsked` exact.
   */
  questionsAsked: number
  questionsTotal: number
  zone: Zone
  possession: 'us' | 'them'
  /** `[us, them]`. */
  score: [number, number]
  phase: Phase
  currentItem: Item | null
  /** The item the tackle-back is scaffolding, to restore after winning it. */
  pendingItem: Item | null
  /**
   * How the last miss looked. Narration and scaffold choice only — it never
   * touches scoring or possession.
   */
  lastMiss: MissClassification | null
  /** Unanswered challenges while they attack. `CONCEDE_AFTER` of them concedes. */
  defensiveStops: number
  shotChoice: ShotChoice | null
  courage: MatchCourage
  /** Every attempt made this match, in order. The caller persists it. */
  log: Attempt[]
  halftimeShown: boolean
  /**
   * Where play resumes after the halftime card, which can interrupt anything —
   * including a tackle-back, whose scaffold has to survive the break.
   */
  resumePhase: PlayPhase | null
}

export interface MatchDeps {
  ratings: Map<string, StandardRating>
  rng: Rng
  /** Injected so tests control time and the reducer stays pure. */
  now: () => number
  /** Big matches go after the gaps rather than practising evenly. */
  probeWeakest?: boolean
}

// ---------------------------------------------------------------------------
// Starting

export function startMatch(opts: { id: string; opponent: Opponent; deps: MatchDeps }): MatchState {
  const base: MatchState = {
    id: opts.id,
    opponent: opts.opponent,
    questionsAsked: 0,
    questionsTotal: QUESTIONS_PER_MATCH,
    zone: 'own_third',
    possession: 'us',
    score: [0, 0],
    phase: 'question',
    currentItem: null,
    pendingItem: null,
    lastMiss: null,
    defensiveStops: 0,
    shotChoice: null,
    courage: { hardShotsAttempted: 0, tackleBacksWon: 0, tackleBacksFaced: 0 },
    log: [],
    halftimeShown: false,
    resumePhase: null,
  }
  return { ...base, currentItem: nextQuestionItem(base, opts.deps) }
}

// ---------------------------------------------------------------------------
// The reducer

/**
 * The next state.
 *
 * Never throws, never mutates `state`, and returns `state` itself for any event
 * a phase has no use for.
 */
export function reduce(state: MatchState, event: MatchEvent, deps: MatchDeps): MatchState {
  switch (state.phase) {
    case 'fulltime':
      return state

    // Any event at all gets play going again, and none of them count for
    // anything. The team talk is a card over the top of the game, not a turn.
    case 'halftime':
      return resumeFromHalftime(state)

    case 'question':
      return event.type === 'answer' ? onAnswer(state, event, deps) : state

    case 'tackleback':
      if (event.type === 'answer') return onAnswer(state, event, deps)
      // The clock running out is handled by the same transition as a wrong
      // answer, with an empty answer in the log. Not logging it at all was the
      // alternative, and it is worse: it would make saying nothing cheaper than
      // having a go, which is the exact instinct this game exists to unteach.
      if (event.type === 'tackleBackTimeout') {
        return applyAnswer(
          state,
          state.currentItem,
          { given: '', latencyMs: 0, correct: false },
          null,
          deps,
        )
      }
      return state

    case 'shot_choice':
      return event.type === 'chooseShot' ? onChooseShot(state, event.shot, deps) : state

    case 'feedback':
      return event.type === 'dismissFeedback' ? serveQuestion(state, deps) : state
  }
}

// ---------------------------------------------------------------------------
// Answering

function onAnswer(
  state: MatchState,
  event: { given: string; latencyMs: number },
  deps: MatchDeps,
): MatchState {
  const item = state.currentItem
  if (item === null) return state

  const result = judge(event.given, item)

  // Unreadable input costs nothing: no question consumed, no attempt logged, no
  // possession lost. An accidental Enter keypress must be free, and the store
  // must never see an attempt that was never really made.
  if (result.unparseable === true) return { ...state, lastMiss: UNREADABLE }

  const miss = result.correct ? null : classify(event.given, item)
  return applyAnswer(
    state,
    item,
    {
      given: event.given,
      latencyMs: safeLatency(event.latencyMs),
      correct: result.correct,
      misconceptionId: miss?.misconceptionId,
    },
    miss,
    deps,
  )
}

interface Judged {
  given: string
  latencyMs: number
  correct: boolean
  misconceptionId?: string
}

/**
 * Log the attempt, then take whatever the answer means.
 *
 * The log and the question count move here and nowhere else, which is why
 * `log.length === questionsAsked` holds everywhere.
 */
function applyAnswer(
  state: MatchState,
  item: Item | null,
  judged: Judged,
  miss: MissClassification | null,
  deps: MatchDeps,
): MatchState {
  if (item === null) return state

  const inTackleBack = state.phase === 'tackleback'
  const attempt = makeAttempt(state, item, judged, inTackleBack ? 'tackleback' : 'match', deps)
  const logged: MatchState = {
    ...state,
    log: [...state.log, attempt],
    questionsAsked: state.questionsAsked + 1,
  }

  if (inTackleBack) {
    return judged.correct ? winTackleBack(logged, deps) : loseTackleBack(logged, deps)
  }
  return judged.correct ? onCorrect(logged, deps) : onMiss(logged, item, miss, deps)
}

/** A correct answer, with the ball. */
function onCorrect(state: MatchState, deps: MatchDeps): MatchState {
  const s: MatchState = { ...state, lastMiss: null }

  // Defending: win it back, deep, and build again.
  if (s.possession === 'them') {
    return serveQuestion({ ...s, possession: 'us', zone: 'own_third', defensiveStops: 0 }, deps)
  }

  // A shot was chosen, so this question was the shot. It goes in.
  if (s.shotChoice !== null) {
    return serveQuestion(
      {
        ...s,
        score: [s.score[0] + 1, s.score[1]],
        zone: 'midfield',
        possession: 'them',
        shotChoice: null,
      },
      deps,
    )
  }

  if (s.zone === 'own_third') return serveQuestion({ ...s, zone: 'midfield' }, deps)

  // Midfield, or a final third somehow reached without a shot pending: arriving
  // in the final third offers the choice rather than taking the shot for him.
  return enterShotChoice({ ...s, zone: 'final_third' })
}

/** A wrong answer, outside a tackle-back. */
function onMiss(
  state: MatchState,
  item: Item,
  miss: MissClassification | null,
  deps: MatchDeps,
): MatchState {
  const s: MatchState = { ...state, lastMiss: miss }

  // Defending. There is no tackle-back here: the tackle-back exists to stop a
  // miss ending *our* possession, and while they have the ball there is no
  // possession of ours to save. The tolerance is the same either way — three
  // unanswered challenges is what a goal costs them, and one costs nothing at
  // all.
  if (s.possession === 'them') {
    const stops = s.defensiveStops + 1
    if (stops < CONCEDE_AFTER) return serveQuestion({ ...s, defensiveStops: stops }, deps)
    return serveQuestion(
      {
        ...s,
        defensiveStops: 0,
        score: [s.score[0], s.score[1] + 1],
        possession: 'us',
        zone: 'own_third',
      },
      deps,
    )
  }

  return enterTackleBack(s, item, miss, deps)
}

// ---------------------------------------------------------------------------
// The tackle-back

function enterTackleBack(
  state: MatchState,
  original: Item,
  miss: MissClassification | null,
  deps: MatchDeps,
): MatchState {
  if (isOver(state)) return fullTime(state)

  return pauseIfHalftime({
    ...state,
    phase: 'tackleback',
    currentItem: chooseScaffold(original, miss ?? UNCERTAIN, deps),
    pendingItem: original,
    courage: { ...state.courage, tackleBacksFaced: state.courage.tackleBacksFaced + 1 },
  })
}

/** Won it back: the question he missed returns, in the same place on the pitch. */
function winTackleBack(state: MatchState, deps: MatchDeps): MatchState {
  const won: MatchState = {
    ...state,
    lastMiss: null,
    courage: { ...state.courage, tackleBacksWon: state.courage.tackleBacksWon + 1 },
  }
  const original = won.pendingItem
  if (original === null) return serveQuestion(won, deps)
  if (isOver(won)) return fullTime(won)

  return pauseIfHalftime({ ...won, phase: 'question', currentItem: original, pendingItem: null })
}

/**
 * Lost it: they have the ball, and he gets the worked solution.
 *
 * `lastMiss` deliberately still describes the miss that started all this rather
 * than the tackle-back answer, because that is what the card on screen is about
 * — and because it is what makes a timeout and a wrong answer indistinguishable
 * in everything except the log.
 */
function loseTackleBack(state: MatchState, deps: MatchDeps): MatchState {
  const lost: MatchState = {
    ...state,
    possession: 'them',
    zone: 'own_third',
    shotChoice: null,
    defensiveStops: 0,
  }
  if (isOver(lost)) return fullTime(lost)

  const original = lost.pendingItem
  if (original === null) return serveQuestion(lost, deps)

  return pauseIfHalftime({ ...lost, phase: 'feedback', currentItem: original, pendingItem: null })
}

/**
 * The sub-question a tackle-back asks.
 *
 * Contingent scaffolding, chosen from how the miss looked:
 *
 *  - `near` — the method was probably sound and the arithmetic slipped, so stay
 *    on the same standard and make the numbers kinder.
 *  - `off` and `misconception` — the method itself is probably wrong, so drop to
 *    the standard underneath it where one exists, and to a much easier item on
 *    the same standard where none does. A named misconception counts as a method
 *    problem: knowing he added the denominators tells us he is doing the wrong
 *    thing confidently, not that he slipped.
 *
 * Exported because it is the one decision in this file worth testing directly.
 */
export function chooseScaffold(item: Item, miss: MissClassification, deps: MatchDeps): Item {
  const conceptual = miss.kind !== 'near'
  const target = conceptual ? SCAFFOLD_TARGET_OFF : SCAFFOLD_TARGET_NEAR
  const standardId = conceptual ? (PREREQUISITE[item.standardId] ?? item.standardId) : item.standardId

  const generator = generatorFor(standardId) ?? generatorFor(item.standardId)
  // Nothing generates either standard, which would mean the item came from
  // somewhere this module does not know about. Ask an easy question rather than
  // stopping the match.
  if (generator === undefined) {
    return selectItem({ ratings: deps.ratings, pressure: 'own_third', rng: deps.rng })
  }

  return generator.generate(scaffoldDifficulty(generator, item, target, deps), deps.rng)
}

function scaffoldDifficulty(
  generator: ItemGenerator,
  item: Item,
  target: number,
  deps: MatchDeps,
): number {
  const wanted = difficultyForSuccess(ratingFor(deps.ratings, generator.standardId), target)
  // A scaffold on the same standard is never harder than the question it is
  // scaffolding, whatever the ratings say. Only the generator's own floor can
  // stop it being easier.
  const capped = generator.standardId === item.standardId ? Math.min(wanted, item.difficulty) : wanted
  const [lo, hi] = generator.range
  return Math.min(hi, Math.max(lo, capped))
}

// ---------------------------------------------------------------------------
// Shooting

function enterShotChoice(state: MatchState): MatchState {
  if (isOver(state)) return fullTime(state)
  return pauseIfHalftime({
    ...state,
    phase: 'shot_choice',
    currentItem: null,
    pendingItem: null,
    shotChoice: null,
  })
}

/**
 * Choosing how to shoot.
 *
 * The single most important line in this module is the courage increment, and
 * specifically *where* it is: here, at the moment of choosing, before the
 * question has been generated and long before it has been answered. The reward
 * is for deciding to try the hard thing. Whether it comes off is not the point
 * and must never become the point.
 *
 * Choosing does not consume a question — the answer that follows does.
 */
function onChooseShot(state: MatchState, shot: ShotChoice, deps: MatchDeps): MatchState {
  const hard = shot === 'outside18' || shot === 'bicycle'

  return {
    ...state,
    phase: 'question',
    shotChoice: shot,
    pendingItem: null,
    currentItem: selectItem({
      ratings: deps.ratings,
      pressure: shot,
      rng: deps.rng,
      probeWeakest: deps.probeWeakest,
      recentStandardIds: recentStandards(state),
    }),
    courage: hard
      ? { ...state.courage, hardShotsAttempted: state.courage.hardShotsAttempted + 1 }
      : state.courage,
  }
}

// ---------------------------------------------------------------------------
// Serving, breaking, ending

function serveQuestion(state: MatchState, deps: MatchDeps): MatchState {
  if (isOver(state)) return fullTime(state)
  return pauseIfHalftime({
    ...state,
    phase: 'question',
    currentItem: nextQuestionItem(state, deps),
    pendingItem: null,
  })
}

/** An ordinary question, pitched at wherever the ball is. */
function nextQuestionItem(state: MatchState, deps: MatchDeps): Item {
  return selectItem({
    ratings: deps.ratings,
    pressure: state.zone,
    rng: deps.rng,
    probeWeakest: deps.probeWeakest,
    recentStandardIds: recentStandards(state),
  })
}

const isOver = (state: MatchState) => state.questionsAsked >= state.questionsTotal

function fullTime(state: MatchState): MatchState {
  return {
    ...state,
    phase: 'fulltime',
    currentItem: null,
    pendingItem: null,
    shotChoice: null,
    resumePhase: null,
  }
}

/**
 * The halftime card, over the top of whatever was about to happen.
 *
 * Whatever phase play had reached is stashed and handed straight back on the
 * next event, so the break cannot cost him a question, a scaffold, or a shot he
 * had already earned.
 */
function pauseIfHalftime(state: MatchState): MatchState {
  if (state.halftimeShown || state.questionsAsked < HALFTIME_AFTER) return state
  return {
    ...state,
    phase: 'halftime',
    halftimeShown: true,
    resumePhase: isPlayPhase(state.phase) ? state.phase : 'question',
  }
}

function resumeFromHalftime(state: MatchState): MatchState {
  const resumed = state.resumePhase ?? (state.currentItem === null ? 'shot_choice' : 'question')
  return { ...state, phase: resumed, resumePhase: null }
}

const isPlayPhase = (phase: Phase): phase is PlayPhase =>
  phase !== 'halftime' && phase !== 'fulltime'

// ---------------------------------------------------------------------------
// The log

function makeAttempt(
  state: MatchState,
  item: Item,
  judged: Judged,
  context: AttemptContext,
  deps: MatchDeps,
): Attempt {
  const attempt: Attempt = {
    // The store re-mints ids on the way to disk; this one keeps a match's own
    // log ordered and stable in the meantime.
    id: `${state.id}-${state.log.length + 1}`,
    at: deps.now(),
    standardId: item.standardId,
    // The difficulty the generator actually produced, never the one that was
    // asked for. They differ whenever a generator's band cannot reach the
    // target, and folding a number that never happened would quietly corrupt
    // every rating downstream.
    difficulty: item.difficulty,
    params: item.params,
    given: judged.given,
    correct: judged.correct,
    latencyMs: judged.latencyMs,
    context,
    matchId: state.id,
  }
  if (judged.misconceptionId !== undefined) attempt.misconceptionId = judged.misconceptionId

  const shot = shotTagFor(state, item, context)
  if (shot !== undefined) attempt.shot = shot

  return attempt
}

/**
 * The shot tag, which drives the courage track derived from the log.
 *
 * Tagged once per shot, not once per swing at it. Missing an overhead kick,
 * winning the tackle-back and burying the retake is one act of bravery, and
 * `deriveCourage` counts tags — without this the season stat would say two while
 * the match said one, and it can happen more than once per shot because a
 * retake can be missed and won back again.
 *
 * So: walk back through this shot's own attempts — the retakes of the same item
 * and the tackle-backs between them — and tag only if none of them is tagged
 * already. Item identity is by `params`, which the attempt holds by reference
 * from the item it was made from, so a restored item matches itself exactly and
 * nothing else.
 */
function shotTagFor(
  state: MatchState,
  item: Item,
  context: AttemptContext,
): ShotChoice | undefined {
  if (context !== 'match' || state.shotChoice === null) return undefined

  const sameItem = (a: Attempt) => a.standardId === item.standardId && a.params === item.params

  for (let i = state.log.length - 1; i >= 0; i--) {
    const attempt = state.log[i]!
    if (attempt.context === 'tackleback') continue
    if (!sameItem(attempt)) break
    if (attempt.shot !== undefined) return undefined
  }
  return state.shotChoice
}

const recentStandards = (state: MatchState): string[] =>
  state.log.slice(-RECENT_WINDOW).map((a) => a.standardId)

// ---------------------------------------------------------------------------
// Judging, defensively

const UNREADABLE: MissClassification = { kind: 'unreadable' }

/**
 * What a miss we could not classify is treated as.
 *
 * `near`, deliberately. Telling a child who already doubts himself that he was
 * nowhere near when we simply do not know is the more expensive mistake; the
 * opposite error costs him a slightly mis-aimed hint.
 */
const UNCERTAIN: MissClassification = { kind: 'near' }

/**
 * `checkAnswer` throws on a malformed answer spec, which would be our bug rather
 * than his mistake. Treat it as unreadable: he is re-prompted and nothing is
 * marked wrong. A crash mid-match, or a right answer scored as a miss, are both
 * worse than a re-prompt.
 */
function judge(given: string, item: Item): { correct: boolean; unparseable?: boolean } {
  try {
    return checkAnswer(given, item.answer)
  } catch {
    return { correct: false, unparseable: true }
  }
}

function classify(given: string, item: Item): MissClassification {
  try {
    return classifyMiss(given, item.answer, item.misconceptions)
  } catch {
    return UNCERTAIN
  }
}

/** A latency the store will accept. A UI bug must not cost him the attempt. */
const safeLatency = (ms: number) => (Number.isFinite(ms) ? Math.max(0, ms) : 0)

/** Corrupt or absent both mean "no idea yet", exactly as selection treats them. */
function ratingFor(ratings: Map<string, StandardRating> | undefined, standardId: string): number {
  const rating = ratings?.get(standardId)?.rating
  return typeof rating === 'number' && Number.isFinite(rating) ? rating : SEED_RATING
}
