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
 *
 * ## What makes Brazil Brazil
 *
 * A strong opponent turns three dials, and deliberately not a fourth. Questions
 * come pitched a little harder (`targetSuccessFor`), the tackle-back clock is
 * shorter (`tackleBackMs`), and a bad defensive spell is punished sooner
 * (`concedeAfter`). What a strong opponent may never do is make the *help*
 * harder: the tackle-back scaffold keeps its own targets whoever is on the other
 * side, because the scaffold is the rung back to the question, not a second
 * test.
 *
 * The difficulty dial is capped hard, at ±0.10 of success probability and never
 * below 0.55 in normal play. Beating Brazil is meant to be difficult because of
 * the *chain* of questions a goal takes, not because any single question is a
 * coin toss. That distinction is the whole calibration for this player, and it
 * is why the roughest opponent in the game still asks him questions he expects
 * to get right.
 *
 * ## What makes a knockout a knockout
 *
 * Even with those dials, a strong side almost never scored, and the reason was
 * not that two mistakes are hard to come by. It was that they barely had the
 * ball: one correct answer ended their attack, so an attack was over almost
 * before it began, and the only way they ever got possession was for him to
 * score. The threat had to come from possession, and `stakes` is where it comes
 * from.
 *
 * A knockout changes four things, all of them structural and none of them
 * difficulty:
 *
 *  - **They kick off** (`kickoffIsTheirs`), so their first attack is a fact
 *    about the occasion rather than something his own goal handed them.
 *  - **They keep the ball until it is properly cleared** (`stopsToClear`), and
 *    everything they created before each clearance still counts.
 *  - **He breaks from halfway** when he clears it or picks it out of the net
 *    (`restartZone`), so defending for longer buys him something.
 *  - **He kicks off the second half**, which is both what football does and
 *    what stops a long opening spell defining the match.
 *
 * Group games and friendlies are byte-identical to each other and to how the
 * game played before any of this existed. That is deliberate and it is tested:
 * the campaign should be encouraging early and frightening late, and a change
 * meant to add jeopardy to a quarter-final has no business making his first
 * group game harder.
 */

import type { Opponent } from '../data/opponents'
import { RATED_STANDARD_IDS, SEED_RATING } from '../store/derive'
import type { Attempt, AttemptContext, ShotChoice, StandardRating } from '../store/types'
import { checkAnswer, choiceCount, classifyMiss } from './answer'
import type { MissClassification } from './answer'
import { SPREAD, difficultyForSuccess } from './elo'
import { decompose } from './items/decompose'
import { flumult, generatorFor } from './items/generators'
import { generateFact } from './items/generators/flumult'
import type { Item, ItemGenerator, Rng } from './items/types'
import { TARGET_SUCCESS, selectItem } from './select'
import type { Pressure } from './select'

/** The length of a match. Everything else here is measured against it. */
export const QUESTIONS_PER_MATCH = 14

/** The whistle goes at half of them. */
export const HALFTIME_AFTER = 7

/**
 * What is riding on the match.
 *
 * The only thing this changes is how long the opposition keep the ball (see
 * `stopsToClear`). Group games and friendlies are deliberately identical to each
 * other and to how the game played before knockouts existed — encouraging early,
 * frightening late, so the jeopardy sits where the drama is.
 */
export type Stakes = 'friendly' | 'group' | 'knockout'

/**
 * Unanswered defensive challenges before they score, by opponent tier.
 *
 * The clearest of the three opponent dials: a strong side punishes a bad spell
 * faster. Three is the middle of the range rather than a default that happens to
 * be safe — tier 1 gives him two challenges to win the ball back, tier 4 gives
 * him four.
 */
export const CONCEDE_AFTER_BY_TIER: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4 }

/** Where an opponent with a tier the roster does not have lands. */
const CONCEDE_AFTER_DEFAULT = 3

export function concedeAfter(opponent: Opponent | undefined): number {
  return CONCEDE_AFTER_BY_TIER[opponent?.tier as number] ?? CONCEDE_AFTER_DEFAULT
}

/**
 * How long the tackle-back clock runs, by opponent tier.
 *
 * The reducer times nothing — it publishes the budget so the UI has one source
 * of truth for it, on `MatchState.tackleBackMs` as well as here. It remains
 * subject to `settings.timersEnabled`, which turns every clock in the game off
 * at once and must keep doing so.
 *
 * Note which way this dial points: a harder opponent gets a *shorter* clock, so
 * the pressure lands on the scaffold he has already been given rather than on
 * the question he missed. Even at tier 1 the clock running out costs exactly
 * what answering wrong costs, and no more.
 */
export const TACKLE_BACK_MS_BY_TIER: Record<number, number> = {
  1: 5000,
  2: 6500,
  3: 6500,
  4: 8000,
}

const TACKLE_BACK_MS_DEFAULT = 6500

export function tackleBackMs(opponent: Opponent | undefined): number {
  return TACKLE_BACK_MS_BY_TIER[opponent?.tier as number] ?? TACKLE_BACK_MS_DEFAULT
}

/**
 * How many times he has to clear the ball to end an opponent attack, by tier.
 *
 * Knockout matches only. Everywhere else this is 1: one correct answer wins the
 * ball back, which is how the game has always played.
 *
 * This is the whole knockout mechanic, and it is deliberately about *possession*
 * rather than about difficulty. A strong side rarely scored before, not because
 * two mistakes are hard to make, but because they barely had the ball — one
 * correct answer ended their attack, so an attack was over almost as soon as it
 * started. In a knockout they keep coming: Brazil have to be cleared three
 * times, and every mistake in between is another chance for them.
 *
 * It reads the way football reads. They are camped in your half, you head one
 * away and they put it straight back in, and the danger is cumulative rather
 * than reset by every touch. A child watching can say exactly what happened:
 * *I got the tackle in but they kept the ball, and the third time they scored.*
 *
 * Tier 4 stays at 1 even in a knockout. A minnow in the last 16 is still a
 * minnow, and being drawn against one should feel like a break rather than a
 * trap.
 */
export const STOPS_TO_CLEAR_BY_TIER: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 1 }

/** One stop clears it, everywhere except a knockout. */
export const STOPS_TO_CLEAR_DEFAULT = 1

export function stopsToClear(opponent: Opponent | undefined, stakes: Stakes): number {
  if (stakes !== 'knockout') return STOPS_TO_CLEAR_DEFAULT
  return STOPS_TO_CLEAR_BY_TIER[opponent?.tier as number] ?? STOPS_TO_CLEAR_DEFAULT
}

/** Who kicks off. They do in a knockout; he does everywhere else. */
export const kickoffIsTheirs = (stakes: Stakes | undefined): boolean => stakes === 'knockout'

/**
 * Where he restarts when the ball comes back to him — after clearing an attack,
 * and after picking it out of his own net.
 *
 * From halfway in a knockout, from the back everywhere else. The other half of
 * the deal: a knockout asks him to defend for longer, so getting out of it has
 * to be worth something, or the extra work would read as nothing but a tax on
 * having drawn a big team. It is also what football does — they committed men
 * forward and he breaks from halfway, and a goal is restarted from the centre
 * circle rather than from his own six-yard box.
 */
export const restartZone = (stakes: Stakes | undefined): Zone =>
  stakes === 'knockout' ? 'midfield' : 'own_third'

/**
 * The most an opponent may move the success target, in either direction.
 *
 * Ten points of probability is a real difference over a chain of four questions
 * — 0.75^4 is 0.32 against 0.65^4 at 0.18, so Brazil roughly halves the chance
 * of a given attack ending in a goal — while leaving every individual question
 * one he expects to get right.
 */
export const MAX_OPPONENT_BIAS = 0.1

/**
 * The floor under the adjusted target in normal play.
 *
 * The guardrail, and the one number in this file that exists purely because of
 * who is playing. He is capable but freezes in front of anything he suspects is
 * too hard for him, so no opponent — at any rating gap, at any rating of his own
 * — is allowed to push ordinary play toward a coin flip.
 *
 * It is a floor, never a lift: the bands he chooses for himself (`outside18` at
 * 0.5, `bicycle` at 0.38) are deliberately below it and stay below it, because
 * the courage track pays out on attempting those whether or not they come off.
 * Raising them to 0.55 would quietly delete the risk he chose to take.
 */
export const MIN_MATCH_TARGET = 0.55

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
  /** What is riding on it. Knockouts give the opposition a real attack. */
  stakes: Stakes
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
   * The tackle-back on screen is the *same* question with one option removed,
   * rather than an easier question from underneath it.
   *
   * It changes what winning means. An ordinary tackle-back asks something else,
   * so the question he missed still has to be answered and comes back. A parried
   * one is the question he missed, so answering it *is* answering it — bringing
   * it back a third time would be asking a ten-year-old the same thing three
   * times in a row and paying him twice for it.
   *
   * Losing is unchanged either way: he still gets the worked solution, which is
   * why `pendingItem` is kept rather than cleared to signal this.
   */
  parried: boolean
  /**
   * The item that was just re-served after winning its first tackle-back, held
   * by reference so a second miss on it can be told apart from a first miss on
   * anything else.
   *
   * An ordinary tackle-back's win brings the question he missed back once, for
   * a real retry — see `parried` above for why a parried one never reaches this
   * at all. Missing that retry and winning the tackle-back it opens should not
   * bring the question back a third time, so `winTackleBack` checks this before
   * deciding whether to ask again.
   */
  retakenItem: Item | null
  /**
   * How the last miss looked. Narration and scaffold choice only — it never
   * touches scoring or possession.
   */
  lastMiss: MissClassification | null
  /**
   * Chances they have had in this attack. `concedeAfter` of them concedes.
   *
   * Cumulative across the attack rather than consecutive. Outside a knockout
   * that is the same thing, because the attack ends the moment he answers one
   * correctly.
   */
  defensiveStops: number
  /**
   * Times he has cleared the ball in this attack. `stopsToClear` ends it.
   *
   * Always 0 while he has the ball, and always 0 outside a knockout, where one
   * clearance ends the attack the instant it is made.
   */
  clearances: number
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
  /**
   * The tackle-back clock this opponent allows, in milliseconds.
   *
   * Published for the UI, which owns the actual timer; nothing in here reads it.
   * Still subject to `settings.timersEnabled`.
   */
  tackleBackMs: number
}

export interface MatchDeps {
  ratings: Map<string, StandardRating>
  rng: Rng
  /** Injected so tests control time and the reducer stays pure. */
  now: () => number
  /**
   * His overall rating, for pitching questions against this opponent.
   *
   * Passed in rather than derived here: `deriveCard` needs `now` and the whole
   * log, and the reducer has no business folding either.
   */
  playerOverall: number
  /** Big matches go after the gaps rather than practising evenly. */
  probeWeakest?: boolean
}

// ---------------------------------------------------------------------------
// The opponent

/**
 * How far this opponent moves the success target, from −0.10 to +0.10.
 *
 * The gap is measured in `SPREAD`s, which is the natural unit: one spread (25
 * points) is already 91/9 odds between two rated players, so a full spread of
 * difference earns the full bias and everything beyond it earns no more. A
 * fresh 50-rated player therefore meets Brazil (94) at the cap and Curaçao (56)
 * at about a quarter of it.
 *
 * Positive when he outrates the opponent, which makes questions easier — the
 * dial turns both ways, so a minnow really is a minnow.
 */
export function opponentBias(playerOverall: number, opponent: Opponent | undefined): number {
  const player = Number.isFinite(playerOverall) ? playerOverall : SEED_RATING
  const rating = Number.isFinite(opponent?.rating) ? opponent!.rating : SEED_RATING
  const spreads = (player - rating) / SPREAD
  return MAX_OPPONENT_BIAS * Math.max(-1, Math.min(1, spreads))
}

/**
 * The success rate a question actually aims at, once the opponent has had a say.
 *
 * Two rails, and both matter:
 *
 *  - The bias can never move a band by more than `MAX_OPPONENT_BIAS`.
 *  - The result never drops below `MIN_MATCH_TARGET` — unless the band was
 *    already below it by design, in which case the floor is that band's own
 *    target. `bicycle` stays a long shot; it just never becomes a longer one
 *    than the design asked for, and never becomes a gift either.
 *
 * Penalties are exempt from the whole mechanism. A shootout is already the most
 * pressured moment the game has, and its 0.8 target is what stops it being a
 * cruel one.
 */
export function targetSuccessFor(
  pressure: Pressure,
  playerOverall: number,
  opponent: Opponent | undefined,
): number {
  const raw = TARGET_SUCCESS[pressure]
  const base = typeof raw === 'number' && Number.isFinite(raw) ? raw : TARGET_SUCCESS.midfield
  if (pressure === 'penalty') return base

  const floor = Math.min(base, MIN_MATCH_TARGET)
  const ceiling = Math.min(0.99, base + MAX_OPPONENT_BIAS)
  return Math.min(ceiling, Math.max(floor, base + opponentBias(playerOverall, opponent)))
}

/**
 * The opponent bias, expressed as a shift in rating rather than in probability.
 *
 * `selectItem` takes a pressure, not a target, and it is not this module's to
 * change. But difficulty is linear in rating:
 *
 *     difficultyForSuccess(r, p) = r + SPREAD * log10(1/p - 1)
 *
 * so asking for target `p'` at rating `r` is exactly asking for the band's own
 * target `p` at rating `r + delta`, where
 *
 *     delta = SPREAD * (log10(1/p' - 1) - log10(1/p - 1))
 *
 * Shifting the ratings selection reads, rather than regenerating the item
 * afterwards, is what keeps selection honest: the generator is chosen already
 * knowing the difficulty that will be asked of it, so one whose band cannot
 * reach it is discounted up front instead of silently clamped after the fact.
 */
function ratingShiftFor(
  pressure: Pressure,
  playerOverall: number,
  opponent: Opponent | undefined,
): number {
  const raw = TARGET_SUCCESS[pressure]
  const base = typeof raw === 'number' && Number.isFinite(raw) ? raw : TARGET_SUCCESS.midfield
  const adjusted = targetSuccessFor(pressure, playerOverall, opponent)
  if (adjusted === base) return 0

  const shift = SPREAD * (Math.log10(1 / adjusted - 1) - Math.log10(1 / base - 1))
  return Number.isFinite(shift) ? shift : 0
}

/**
 * The ratings map selection should read for this question.
 *
 * Every rated standard is shifted by the same amount, including any missing from
 * the map, so the dial applies uniformly even on a fresh save. A uniform shift
 * leaves selection's weakness weighting untouched by construction — it is
 * measured against the mean of the candidates — so this changes how hard the
 * question is and nothing about which topic it comes from.
 */
function biasedRatings(
  pressure: Pressure,
  opponent: Opponent | undefined,
  deps: MatchDeps,
): Map<string, StandardRating> {
  const shift = ratingShiftFor(pressure, deps.playerOverall, opponent)
  if (shift === 0) return deps.ratings

  const out = new Map<string, StandardRating>()
  for (const id of new Set([...deps.ratings.keys(), ...RATED_STANDARD_IDS])) {
    const existing = deps.ratings.get(id)
    out.set(id, {
      standardId: id,
      attempts: existing?.attempts ?? 0,
      lastSeenAt: existing?.lastSeenAt ?? null,
      provisional: existing?.provisional ?? true,
      rating: ratingFor(deps.ratings, id) + shift,
      // Shifted by the same amount, so a biased map still satisfies "rating
      // is clean minus rust" rather than reporting negative rust to anything
      // that later reads both fields off it.
      ratingClean: (existing?.ratingClean ?? SEED_RATING) + shift,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Starting

export function startMatch(opts: {
  id: string
  opponent: Opponent
  deps: MatchDeps
  /** Defaults to a friendly, which is the gentlest thing the game can be. */
  stakes?: Stakes
}): MatchState {
  const base: MatchState = {
    id: opts.id,
    opponent: opts.opponent,
    stakes: opts.stakes ?? 'friendly',
    questionsAsked: 0,
    questionsTotal: QUESTIONS_PER_MATCH,
    // They kick off in a knockout, and he starts the match defending.
    //
    // Half of the knockout threat, and the half that keeps it honest: without
    // it, the only way the opposition ever get the ball is for him to score,
    // which would make scoring the thing that puts him in danger. A kickoff
    // gives them a possession he did not hand them, so the jeopardy is a fact
    // about the occasion rather than a punishment for playing well.
    zone: kickoffIsTheirs(opts.stakes) ? 'midfield' : 'own_third',
    possession: kickoffIsTheirs(opts.stakes) ? 'them' : 'us',
    score: [0, 0],
    phase: 'question',
    currentItem: null,
    pendingItem: null,
    parried: false,
    retakenItem: null,
    lastMiss: null,
    defensiveStops: 0,
    clearances: 0,
    shotChoice: null,
    courage: { hardShotsAttempted: 0, tackleBacksWon: 0, tackleBacksFaced: 0 },
    log: [],
    halftimeShown: false,
    resumePhase: null,
    tackleBackMs: tackleBackMs(opts.opponent),
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
      return resumeFromHalftime(state, deps)

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
  return judged.correct ? onCorrect(logged, deps) : onMiss(logged, item, judged.given, miss, deps)
}

/** A correct answer, with the ball. */
function onCorrect(state: MatchState, deps: MatchDeps): MatchState {
  const s: MatchState = { ...state, lastMiss: null }

  // Defending. One good tackle clears it in an ordinary match; in a knockout
  // against a strong side it takes several, and until the last one they still
  // have the ball and everything they have already created still counts.
  if (s.possession === 'them') {
    const cleared = s.clearances + 1
    if (cleared < stopsToClear(s.opponent, s.stakes)) {
      return serveQuestion({ ...s, clearances: cleared }, deps)
    }
    // Clearing a knockout attack launches a counter: they committed men forward
    // and he breaks from halfway rather than building again from the back. The
    // other half of the deal — a knockout asks him to defend for longer, so
    // getting out has to be worth something, or the extra work would read as
    // nothing but a tax on playing a big team.
    return serveQuestion(
      {
        ...s,
        possession: 'us',
        zone: restartZone(s.stakes),
        defensiveStops: 0,
        clearances: 0,
      },
      deps,
    )
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
        defensiveStops: 0,
        clearances: 0,
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
  /** What he answered, so a parried choice can drop the option he picked. */
  given: string,
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
    if (stops < concedeAfter(s.opponent)) {
      return serveQuestion({ ...s, defensiveStops: stops }, deps)
    }
    return serveQuestion(
      {
        ...s,
        defensiveStops: 0,
        clearances: 0,
        score: [s.score[0], s.score[1] + 1],
        possession: 'us',
        zone: restartZone(s.stakes),
      },
      deps,
    )
  }

  return enterTackleBack(s, item, given, miss, deps)
}

// ---------------------------------------------------------------------------
// The tackle-back

function enterTackleBack(
  state: MatchState,
  original: Item,
  given: string,
  miss: MissClassification | null,
  deps: MatchDeps,
): MatchState {
  if (isOver(state)) return fullTime(state)

  const scaffold = chooseScaffold(original, given, miss ?? UNCERTAIN, deps, state.shotChoice === null)

  return pauseIfHalftime({
    ...state,
    phase: 'tackleback',
    currentItem: scaffold,
    pendingItem: original,
    parried: scaffold.prompt === original.prompt,
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
  // A parried tackle-back *was* the question he missed, so winning it has
  // answered it. A retake that gets missed again and won back is the same
  // question a third time either way, so both end the retry here.
  //
  // `shotChoice` is reset alongside: a parried or `original === null` win never
  // had one set (shots never allow a parry — see `allowParry` below), but a
  // capped retake can be a shot's own tackle-back, and leaving it set would
  // hand the next, unrelated question credit for the shot he never actually
  // landed.
  if (original === null || won.parried || won.retakenItem === original) {
    return serveQuestion(
      { ...won, pendingItem: null, parried: false, retakenItem: null, shotChoice: null },
      deps,
    )
  }
  if (isOver(won)) return fullTime(won)

  return pauseIfHalftime({
    ...won,
    phase: 'question',
    currentItem: original,
    pendingItem: null,
    retakenItem: original,
  })
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
    clearances: 0,
  }
  if (isOver(lost)) return fullTime(lost)

  const original = lost.pendingItem
  if (original === null) return serveQuestion(lost, deps)

  return pauseIfHalftime({
    ...lost,
    phase: 'feedback',
    currentItem: original,
    pendingItem: null,
    parried: false,
    retakenItem: null,
  })
}

/**
 * The sub-question a tackle-back asks.
 *
 * Contingent scaffolding, chosen from how the miss looked:
 *
 *  - `near` — the method was probably sound and the arithmetic slipped, so stay
 *    on the same standard and make the numbers kinder.
 *  - `off` and `misconception` — the method itself is probably wrong, so go to
 *    the standard underneath it. First choice is the sub-question **inside the
 *    one he missed** (`decompose`): `347 × 6` comes apart at `7 × 6`, `97 ÷ 4`
 *    at `4 × 4`, an area at the multiplication it is. Where the question has
 *    nothing inside it to ask — `11 × 5`, a prime, a power-of-ten conversion —
 *    a real item is drawn from the standard underneath instead, and from a much
 *    easier item on the same standard where nothing sits underneath. A named
 *    misconception counts as a method problem: knowing he added the
 *    denominators tells us he is doing the wrong thing confidently, not that
 *    he slipped.
 *
 * The drawn fallback never serves a times-0 or times-1 fact. That row used to
 * be the whole of the multiplication table's bottom band, and because a
 * scaffold aims well under the rating, nine multiplication tackle-backs in ten
 * were `7 × 0` or `1 × 6` — the one part of the match he called too easy, and
 * a rung to nowhere.
 *
 * Before any of that: a **parried choice**. If he picked one of three or more
 * options, the second chance is the same question without the option he chose —
 * see `withoutTheOptionHePicked`. It is the one case where a rung down is not the
 * useful help, because he has ruled nothing out yet.
 *
 * The opponent gets no say here, deliberately. Brazil may ask harder questions
 * and allow less time; Brazil may not make the help harder. A scaffold pitched
 * against the opposition instead of against the child would stop being a
 * scaffold.
 *
 * Exported because it is the one decision in this file worth testing directly.
 */
export function chooseScaffold(
  item: Item,
  given: string,
  miss: MissClassification,
  deps: MatchDeps,
  /**
   * False while a shot is pending.
   *
   * A shot already re-offers the question after the ball is won back — that is
   * what a retake is — so parrying it would be a second helping of the same
   * mechanism, and a narrower one. It would also quietly change what a hard shot
   * costs: the courage track pays for choosing the bicycle kick, and the retake
   * is meant to be the shot he chose rather than an easier version of it.
   */
  allowParry = true,
): Item {
  const narrowed = allowParry ? withoutTheOptionHePicked(item, given) : null
  if (narrowed !== null) return narrowed

  const conceptual = miss.kind !== 'near'
  if (conceptual) {
    const inside = decompose(item, deps.rng)
    if (inside !== null) return inside
  }

  const target = conceptual ? SCAFFOLD_TARGET_OFF : SCAFFOLD_TARGET_NEAR
  const standardId = conceptual ? (PREREQUISITE[item.standardId] ?? item.standardId) : item.standardId

  const generator = generatorFor(standardId) ?? generatorFor(item.standardId)
  // Nothing generates either standard, which would mean the item came from
  // somewhere this module does not know about. Ask an easy question rather than
  // stopping the match.
  if (generator === undefined) {
    return selectItem({ ratings: deps.ratings, pressure: 'own_third', rng: deps.rng })
  }

  const difficulty = scaffoldDifficulty(generator, item, target, deps)
  // The table without its rule rows, see above.
  if (generator.standardId === flumult.standardId) return generateFact(difficulty, deps.rng, false)
  return generator.generate(difficulty, deps.rng)
}

/**
 * The keeper parries it: the same question again, without the option he chose.
 *
 * This is the one place a tackle-back shows the *same* question twice. Everywhere
 * else it drops to the standard underneath and asks something easier, because for
 * a typed answer the useful help is a rung down. For a choice it is not: the
 * child has three names in front of him and has ruled none of them out, and the
 * honest second chance is the same question with his mistake taken off the board.
 * It also needs no generation, so there is no risk of a scaffold that does not
 * match what he was doing.
 *
 * `null` — meaning fall through to the ordinary scaffold — in three cases:
 *
 *  - a typed answer, which has no options to remove;
 *  - **two options**, because removing one leaves the answer sitting alone and
 *    handing it over is not help. Those get the ordinary scaffold rather than
 *    losing the ball, because "a miss never ends a possession" outranks any
 *    special case for this child;
 *  - an answer that is not one of the options, which should be impossible from
 *    `ChoiceInput` and therefore means something is wrong rather than that he
 *    guessed oddly.
 *
 * The correct option is never the one removed: `picked` came from a wrong answer,
 * and the guard is here anyway because a bug that quietly deleted the right
 * answer would be unanswerable.
 */
function withoutTheOptionHePicked(item: Item, given: string): Item | null {
  const { answer } = item
  if (answer.kind !== 'choice') return null
  if (answer.options.length < 3) return null

  const picked = answer.options.indexOf(given.trim())
  if (picked === -1 || picked === answer.correct) return null

  const options = answer.options.filter((_, i) => i !== picked)
  return {
    ...item,
    answer: {
      kind: 'choice',
      options,
      // Recomputed rather than adjusted: the index shifts by one only when the
      // removed option sat before it, and getting that arithmetic wrong points
      // the key at the wrong answer.
      correct: options.indexOf(answer.options[answer.correct]!),
    },
  }
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
 * That reward still has one guard on it, resolved in this same synchronous
 * call rather than after anything he can see: `outside18` and `bicycle` each
 * target a success rate below `MIN_MATCH_TARGET` on purpose, so the item
 * drawn is normally harder than his own rating on whatever standard comes up.
 * Against a weak enough opponent, `MAX_OPPONENT_BIAS` can push that target back
 * up far enough that the item lands *below* his rating — a "hard" shot that
 * was not actually hard, only labelled that way. Courage does not pay out on
 * a label; `hardShotsAttempted` only moves when the item drawn is genuinely at
 * or above his rating on its own standard. This never touches whether the
 * choice reads as brave on screen or whether it counts toward the shot-menu
 * copy — both still fire unconditionally, and a mismatch between what the
 * screen says and what the ledger paid out is a narrow, known gap rather than
 * a claim this pass makes false.
 *
 * Choosing does not consume a question — the answer that follows does.
 */
function onChooseShot(state: MatchState, shot: ShotChoice, deps: MatchDeps): MatchState {
  const hard = shot === 'outside18' || shot === 'bicycle'
  const currentItem = selectItem({
    ratings: biasedRatings(shot, state.opponent, deps),
    pressure: shot,
    rng: deps.rng,
    probeWeakest: deps.probeWeakest,
    recentStandardIds: recentStandards(state),
  })
  const clearsFloor = currentItem.difficulty >= ratingFor(deps.ratings, currentItem.standardId)

  return {
    ...state,
    phase: 'question',
    shotChoice: shot,
    pendingItem: null,
    currentItem,
    courage:
      hard && clearsFloor
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

/** An ordinary question, pitched at wherever the ball is and at who we are playing. */
function nextQuestionItem(state: MatchState, deps: MatchDeps): Item {
  return selectItem({
    ratings: biasedRatings(state.zone, state.opponent, deps),
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

function resumeFromHalftime(state: MatchState, deps: MatchDeps): MatchState {
  const resumed = state.resumePhase ?? (state.currentItem === null ? 'shot_choice' : 'question')

  // The second half kicks off, and the side that did not kick off the first
  // half takes it — which in a knockout is him. An attack that was underway
  // when the whistle went is dead, exactly as it is in football, so their
  // chances go with it.
  //
  // Only from a clean break. If the whistle caught a tackle-back, a shot choice
  // or a worked solution, that is his and it is handed back untouched: halftime
  // has never been allowed to cost him something he was already holding, and
  // this does not make it the exception.
  if (kickoffIsTheirs(state.stakes) && state.possession === 'them' && resumed === 'question') {
    return serveQuestion(
      {
        ...state,
        resumePhase: null,
        possession: 'us',
        zone: 'midfield',
        defensiveStops: 0,
        clearances: 0,
      },
      deps,
    )
  }

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

  // How many options he was choosing between, so the rating can be priced for
  // luck when the log is replayed. Absent on a typed answer.
  const choices = choiceCount(item.answer)
  if (choices !== undefined) attempt.choices = choices

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
