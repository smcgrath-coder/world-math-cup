/**
 * The match: fourteen questions dressed as a game of football.
 *
 * `engine/match.ts` owns every rule in here and this file owns none of them. It
 * turns events into state and this screen draws the state and collects the
 * input, and the line between the two is worth defending — anything in here that
 * starts computing whether a shot went in is a rule that has escaped from the
 * reducer.
 *
 * Three things this screen is responsible for, all of them about the child
 * rather than about football:
 *
 * **The pitch goes still while a question is live.** Movement happens in the
 * gaps between questions and never during one. A ball drifting about beside a
 * fractions problem is extraneous load stacked on exactly the thinking we want,
 * so every animated thing on screen is gated on one boolean — `live` — and the
 * gap it moves in is the beat that follows an answer. The one exception is the
 * tackle-back bar, which is the whole point of a tackle-back and is the only
 * thing moving when it is up.
 *
 * **The beat belongs to the answer that just landed.** The outgoing question
 * stays mounted, dimmed and locked, while the ball moves and the commentary
 * lands; only then does the next question mount, with a fresh `key` and a fresh
 * latency clock. Keeping it mounted is also what stops the numpad moving — it is
 * the last thing in a bottom-anchored column, so as long as it never unmounts it
 * never shifts under his thumb between questions.
 *
 * **Choosing the hard shot pays out before the answer is known.** The reducer
 * increments the courage count the moment `chooseShot` is dispatched, and this
 * screen says so out loud in the same instant — the celebration for an overhead
 * kick is on screen while the question is still unanswered, and a missed one
 * gets a bigger line than a scored tap-in. The block this child has sits in the
 * moment *before* attempting something hard, so that is the moment the screen
 * pays out on, and whether it goes in is not allowed to become the point.
 *
 * **Nothing here ever says wrong.** A near miss is a save, an `off` miss is a
 * shot that never troubled the goal, and a recognised mistake is named
 * specifically. The test file asserts that rather than trusting the next edit.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Pitch } from '../components/Pitch'
import { Character } from '../components/Character'
import { AnswerInput } from '../components/AnswerInput'
import { ShotMenu } from '../components/ShotMenu'
import { TackleBack } from '../components/TackleBack'
import { STANDARDS_BY_STAT, STAT_LABELS } from '../components/stats'
import { makeRng } from '../engine/items/rng'
import type { Item } from '../engine/items/types'
import { QUESTIONS_PER_MATCH, reduce, startMatch } from '../engine/match'
import type { MatchDeps, MatchEvent, MatchState, Stakes } from '../engine/match'
import { deriveCard, deriveOverall, deriveRatings } from '../store/derive'
import { getStore } from '../store/storage'
import type { AttemptDraft } from '../store/storage'
import type { Attempt, ShotChoice } from '../store/types'
import { useCountry, useSettings } from '../store/useGameState'
import type { Opponent } from '../data/opponents'
import type { CardStat } from '../curriculum/standards.generated'
import { answerText } from '../engine/answer'
import { playSfx } from '../audio/sfx'
import type { SfxName } from '../audio/sfx'

/**
 * How long an ordinary beat between questions runs.
 *
 * The gap the ball moves in. Long enough to watch it travel, short enough that
 * fourteen of them do not add a minute to a five-minute match.
 */
export const BEAT_MS = 900

/**
 * How long a goal, a goal conceded, or a hard shot chosen stays up.
 *
 * Twice an ordinary beat, because these are the moments the match is actually
 * for. Deliberately the same length whether the brave shot went in or not.
 */
export const CELEBRATION_MS = 1900

/**
 * Answers held before a write.
 *
 * A match is fourteen answers and one write at the whistle would be tidier, but
 * a child who closes the lid at 3–2 down must not lose the maths he did to get
 * there. Every fourth answer goes to disk, the whistle writes whatever is left,
 * and unmounting writes it too — all through one helper that only ever writes
 * the tail, so nothing is written twice.
 */
export const FLUSH_EVERY = 4

// ---------------------------------------------------------------------------
// What gets said

export type BeatTone = 'goal' | 'brave' | 'concede' | 'neutral'

export interface Beat {
  line: string
  tone: BeatTone
  /** How long it stays up before the next question mounts. */
  hold: number
  /** The question that was on screen when it happened, held so it can dim. */
  item: Item | null
  key: string
}

/** A goal, by how he chose to take it. */
const GOAL_LINE: Record<ShotChoice, string> = {
  wide: 'Worked it wide and slotted it. Goal.',
  box: 'Buried it from inside the box. Goal.',
  outside18: 'From outside the 18 — into the corner! Goal.',
  bicycle: 'OVERHEAD KICK — and it’s in! They’ll be replaying that all night.',
}

/**
 * The line a hard shot gets on the way *out* of the ground.
 *
 * The single most important copy in the game. A ten-year-old who freezes in
 * front of hard things has to come away from an overhead kick that missed
 * feeling like he did the thing, because he did — the record counted it the
 * second he chose it. So there is no consolation in here, no "unlucky", no
 * "next time", and nothing that treats the outcome as the event. The trying is
 * the event, and the copy simply reports it.
 */
export const BRAVE_MISS: Record<'outside18' | 'bicycle', string> = {
  outside18:
    'Whistles just past the post from outside the 18 — and what a ball to go for. That’s on your record: you took on the hard one.',
  bicycle:
    'Up and over the bar — and what a thing to have a go at. An overhead kick counts the second you try it, and that one’s on your record.',
}

/** What the booth says as he shapes to shoot, before anyone knows a thing. */
const SHOT_CALL: Record<ShotChoice, string> = {
  wide: 'Working it wide. Here we go.',
  box: 'In the box, and it opens up. Here we go.',
  outside18: 'He’s going to have a go from distance — that’s already one for the record.',
  bicycle: 'He’s going for the overhead kick! That one counts already, in or out.',
}

/** The chip that stays beside a hard shot's question, so the promise is visible. */
const SHOT_TAG: Record<ShotChoice, string | null> = {
  wide: null,
  box: null,
  outside18: 'Outside the 18 — already counted',
  bicycle: 'Bicycle kick — already counted',
}

export const CONCEDED_LINE = 'They’ve got one. Ball’s yours from the restart — go again.'
export const LOOSE_BALL_LINE = 'Ball’s come loose.'
export const WON_IT_BACK_LINE = 'Won it back! And here’s that one again.'

const isHard = (shot: ShotChoice | null): shot is 'outside18' | 'bicycle' =>
  shot === 'outside18' || shot === 'bicycle'

/**
 * What to say about the transition that just happened, or nothing.
 *
 * Pure and exported so the copy can be read in a test rather than clicked
 * through. Returning `null` means "no gap at all" — the next screen is a card
 * that speaks for itself, or the event genuinely changed nothing.
 */
export function beatFor(before: MatchState, after: MatchState): Omit<Beat, 'item' | 'key'> | null {
  if (after === before) return null

  const big = (line: string, tone: BeatTone) => ({ line, tone, hold: CELEBRATION_MS })
  const beat = (line: string, tone: BeatTone = 'neutral') => ({ line, tone, hold: BEAT_MS })

  // Goals first, whatever they interrupted. A goal on the fourteenth question
  // gets its celebration and *then* the whistle.
  if (after.score[0] > before.score[0]) {
    return big(before.shotChoice === null ? 'Goal!' : GOAL_LINE[before.shotChoice], 'goal')
  }
  if (after.score[1] > before.score[1]) return big(CONCEDED_LINE, 'concede')

  // A hard shot that did not come off, wherever it lands — including on the
  // fourteenth question, where it ends the match. Without this the whistle goes
  // on the bravest thing he did all afternoon without a word said about it,
  // which is the exact failure this game is built to avoid.
  const missed = after.log.length > before.log.length && after.log.at(-1)?.correct === false
  if (before.phase === 'question' && isHard(before.shotChoice) && missed) {
    return big(BRAVE_MISS[before.shotChoice], 'brave')
  }

  // Everything else only gets a beat if a question is what comes next. The shot
  // menu, the worked solution and the team talk are cards with their own words
  // on them, and the ball is free to move underneath them.
  if (after.phase !== 'question' && after.phase !== 'tackleback') return null

  if (before.phase === 'halftime') {
    return after.possession === before.possession ? null : beat('Second half. Your ball.')
  }

  if (before.phase === 'shot_choice' && after.shotChoice !== null) {
    const hard = isHard(after.shotChoice)
    const line = SHOT_CALL[after.shotChoice]
    return hard ? big(line, 'brave') : beat(line)
  }

  // Any other miss that loosened the ball. The brave one has already been said.
  if (after.phase === 'tackleback' && before.phase !== 'tackleback') return beat(LOOSE_BALL_LINE)

  if (before.phase === 'tackleback' && after.courage.tackleBacksWon > before.courage.tackleBacksWon) {
    return beat(WON_IT_BACK_LINE)
  }

  if (before.possession === 'them') {
    if (after.possession === 'us') {
      return beat(
        after.zone === 'midfield'
          ? 'Cleared — and you’re away on the break.'
          : 'Cleared. Ball’s yours.',
      )
    }
    if (after.clearances > before.clearances) return beat('Headed away — but they keep coming.')
    if (after.defensiveStops > before.defensiveStops) return beat('They’re still coming. Stay with them.')
    return null
  }

  if (after.zone !== before.zone) return beat('Out from the back, up to halfway.')

  // An unreadable answer lands here: nothing moved, nothing was logged, and
  // there is nothing to say about it beyond the re-prompt.
  return null
}

/**
 * Which sound this transition earns, if any — a separate question from
 * `beatFor`'s, and not every beat has an answer to it. Ordinary continuity
 * beats ("Cleared. Ball's yours.", a tackle-back won) stay silent; only the
 * four named effects have a moment they are for.
 *
 * Pure and exported for the same reason `beatFor` is: read in a test rather
 * than clicked through and listened to.
 */
export function sfxFor(before: MatchState, after: MatchState): SfxName | null {
  // Goals first, matching `beatFor`'s own priority — a goal on the fourteenth
  // question is still a goal before it is a whistle.
  if (after.score[0] > before.score[0]) return 'goal'

  const missed = after.log.length > before.log.length && after.log.at(-1)?.correct === false
  // A hard shot's crowd reaction, whether it went in or not — the courage
  // track pays the same either way, and so does the sound of it.
  if (before.phase === 'question' && isHard(before.shotChoice) && missed) return 'crowd'
  // Everything else that misses but was still on target is a save, word for
  // word what this file's own header already calls it.
  if (missed && after.lastMiss?.kind === 'near') return 'save'

  if (after.phase === 'fulltime' && before.phase !== 'fulltime') return 'whistle'
  if (before.phase === 'halftime') return 'whistle'

  // The anticipation of choosing to go for it, not the outcome — the same
  // moment `beatFor`'s own `SHOT_CALL` fires for.
  if (before.phase === 'shot_choice' && after.shotChoice !== null && isHard(after.shotChoice)) {
    return 'crowd'
  }

  return null
}

// ---------------------------------------------------------------------------
// The team talk

/** Which stat each standard sits under, for naming a domain at half time. */
const STAT_BY_STANDARD: Record<string, CardStat> = (() => {
  const out: Record<string, CardStat> = {}
  for (const stat of Object.keys(STANDARDS_BY_STAT) as CardStat[]) {
    for (const id of STANDARDS_BY_STAT[stat]) out[id] = stat
  }
  return out
})()

/**
 * A miss is a slip; two is a pattern.
 *
 * Naming a domain off a single wrong answer would be making something up about
 * him, and it would make the team talk feel like a telling-off with a football
 * accent.
 */
const PATTERN = 2

/**
 * What the scout has seen, or nothing worth saying.
 *
 * Names the stat *and* the maths behind it, because that mapping is the thing
 * the game is quietly teaching him: they are going at your dribbling, and your
 * dribbling is fractions, so fractions is what to work on.
 */
export function scoutReport(log: readonly Attempt[]): { stat: CardStat; line: string } | null {
  const missed = new Map<CardStat, number>()
  for (const attempt of log) {
    if (attempt.correct) continue
    const stat = STAT_BY_STANDARD[attempt.standardId]
    if (stat === undefined) continue
    missed.set(stat, (missed.get(stat) ?? 0) + 1)
  }

  let worst: CardStat | null = null
  for (const [stat, count] of missed) {
    if (count < PATTERN) continue
    if (worst === null || count > (missed.get(worst) ?? 0)) worst = stat
  }
  if (worst === null) return null

  const labels = STAT_LABELS[worst]
  return {
    stat: worst,
    // No count of what he missed, deliberately. The domain is the useful half
    // and it is what he can do something about; "three of those got away" is
    // just a mark out of seven in a football accent.
    line: `They’re going at your ${labels.soccer.toLowerCase()} — that’s ${labels.maths.toLowerCase()}. Second half, take your time when one of those comes up and they’ve got nothing.`,
  }
}

// ---------------------------------------------------------------------------
// Starting

/**
 * The deps a match runs on.
 *
 * Frozen at kickoff, on purpose. The ratings that pitch the questions are the
 * ones he walked out with, so a match is a fixed thing that can be replayed
 * exactly from its seed — and so a good spell inside a match cannot quietly make
 * the rest of it harder. Exported because the test suite drives the screen by
 * running the same reducer against the same deps, which is the only honest way
 * to know the answer to a question the screen must never put in the DOM.
 */
export function matchDeps(
  attempts: Attempt[],
  seed: number,
  now: number,
  probeWeakest: boolean,
): MatchDeps {
  const ratings = deriveRatings(attempts, now)
  return {
    ratings,
    rng: makeRng(seed),
    now: () => Date.now(),
    playerOverall: deriveOverall(deriveCard(ratings, attempts, now)),
    probeWeakest,
  }
}

interface Session {
  /** Paired with the state, because the rng inside is consumed as it advances. */
  deps: MatchDeps
  state: MatchState
}

const STAKES_LABEL: Record<Stakes, string> = {
  friendly: 'Friendly',
  group: 'Group game',
  knockout: 'Knockout',
}

/** The store takes drafts and mints its own ids; the match's are its own. */
function toDraft(attempt: Attempt): AttemptDraft {
  const { id, ...draft } = attempt
  void id
  return draft
}

/**
 * What the match hands to the dressing room.
 *
 * The scoreline, because it is the one fact about a match that is not in the
 * attempts log and cannot be recovered from it, and the questions, because they
 * cannot be recovered either: a generator turns a difficulty and a random stream
 * into an item, and there is no way back from the parameters it recorded to the
 * item they came from. They are keyed by the id the *store* minted, so the film
 * room can join them to the log it reads back rather than trusting a position in
 * an array.
 *
 * Everything else — the ratings, the courage counts, what beat him three weeks
 * ago — is derived from the log by `matchId`, because this screen has already
 * unmounted by the time any of it is drawn.
 */
export interface MatchResult {
  matchId: string
  opponent: Opponent
  /** `[us, them]` at the whistle. */
  score: [number, number]
  questions: ReadonlyMap<string, Item>
}

export interface MatchProps {
  opponent: Opponent
  /** Defaults to a friendly, which is the gentlest thing a match can be. */
  stakes?: Stakes
  /** Defaults to the clock, so two matches never ask the same fourteen. */
  seed?: number
  matchId?: string
  onDone?: (result: MatchResult) => void
  /**
   * He walked off before the whistle. The answers he gave are already in the
   * log by the time this fires; there is no result, because there was no
   * result. A campaign fixture is left exactly as it was — still to be played.
   */
  onLeave?: () => void
}

export function Match({ opponent, stakes = 'friendly', seed, matchId, onDone, onLeave }: MatchProps) {
  const country = useCountry()
  const settings = useSettings()

  const [session, setSession] = useState<Session>(() => {
    const start = seed ?? Date.now()
    const now = Date.now()
    // Read once rather than subscribing: the match writes to the log as it goes,
    // and a screen that re-derived itself from its own writes would re-pitch the
    // questions mid-match.
    const deps = matchDeps(getStore().getState().attempts, start, now, stakes === 'knockout')
    return {
      deps,
      state: startMatch({ id: matchId ?? `m${start}`, opponent, deps, stakes }),
    }
  })
  const [beat, setBeat] = useState<Beat | null>(null)
  /** Set only when we genuinely could not read what he typed. Never a score. */
  const [unreadable, setUnreadable] = useState(false)
  /**
   * He has tapped "Walk off" and is being asked whether he meant it.
   *
   * There used to be no way off the pitch before the whistle at all, on
   * purpose: nothing to fat-thumb mid-question. That held until the first
   * time he was 0–3 down against Brazil with eight questions to go and the
   * only exit was killing the app — which lost the match anyway, and lost the
   * answers he had given with it. So there is a way off, it is small, and it
   * asks first.
   */
  const [leaving, setLeaving] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  /** How much of the log is already on disk. */
  const written = useRef(0)
  const logRef = useRef<readonly Attempt[]>([])
  /** The question that was on screen for each entry in the log, by log index. */
  const askedItems = useRef<Item[]>([])
  /** The same questions, once the store has minted an id for each attempt. */
  const questions = useRef(new Map<string, Item>())

  const state = session.state
  useEffect(() => {
    logRef.current = state.log
  }, [state.log])

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
      timers.current = []
      // A match abandoned at 2–1 still happened. Never lose maths he has done.
      flushTail(logRef.current, written, askedItems, questions)
    },
    [],
  )

  // The lid coming down on an iPad does not unmount anything — the tab is
  // backgrounded and, if the system reclaims it, killed without ceremony. This
  // is the only cleanup that runs in that case, and `flushTail` writes the
  // unwritten tail and nothing else, so it costs nothing when it fires for an
  // ordinary tab switch.
  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') flushTail(logRef.current, written, askedItems, questions)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  /** Returns `false` when the answer could not be read, so the box keeps it. */
  const advance = (event: MatchEvent): boolean => {
    const before = session.state
    const after = reduce(before, event, session.deps)
    if (after === before) return true

    // Unparseable input costs nothing: the reducer consumed no question and
    // logged no attempt, so neither does the screen.
    if (after.log.length === before.log.length && after.unreadable) {
      setUnreadable(true)
      return false
    }
    setUnreadable(false)
    setSession({ deps: session.deps, state: after })

    // Keep the question beside the answer it produced. The generators turn a
    // difficulty and a random stream into an item and there is no way back from
    // the parameters the log records to the item they came from, so if this is
    // not held here the film room can never show him the question he was asked.
    if (after.log.length > before.log.length && before.currentItem !== null) {
      askedItems.current.push(before.currentItem)
    }

    const sfx = sfxFor(before, after)
    if (sfx !== null) playSfx(sfx)

    const next = beatFor(before, after)
    if (next !== null) {
      // The beat holds the question that was *being asked*, so it can dim in
      // place rather than vanish. A phase that was showing a card was not asking
      // anything, and the item the reducer happened to be holding through it has
      // never been in front of him — flashing it here would show him a question
      // for a second and then take it away.
      const asked = before.phase === 'question' || before.phase === 'tackleback'
      setBeat({
        ...next,
        item: asked ? before.currentItem : null,
        key: `${before.questionsAsked}:${before.phase}`,
      })
      timers.current.push(setTimeout(() => setBeat(null), next.hold))
    }

    if (after.phase === 'fulltime' || after.log.length - written.current >= FLUSH_EVERY) {
      flushTail(after.log, written, askedItems, questions)
    }
    return true
  }

  const walkOff = (): void => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
    // Before telling anyone: the answers are the one thing that must survive.
    flushTail(logRef.current, written, askedItems, questions)
    onLeave?.()
  }

  const ourName = country?.name ?? 'Your team'
  const ourKit = country?.kit ?? (['#fbbf24', '#14532d'] as const)

  const asking = state.phase === 'question' || state.phase === 'tackleback'
  /** True only when a question is on screen and he may answer it. */
  const live = beat === null && asking
  // The reducer keeps `currentItem` through the team talk and the worked
  // solution, because both of those have to hand play back exactly where it was.
  // Neither is a question he may answer, so neither may put one on screen —
  // least of all the *next* one, sitting under the team talk with a numpad below
  // it. During a beat it is the outgoing question, which is the one thing that
  // does belong there.
  const shownItem = beat === null ? (asking ? state.currentItem : null) : beat.item
  const shownKey = beat === null ? `${state.questionsAsked}:${state.phase}` : beat.key
  const asked = Math.min(state.questionsAsked + 1, state.questionsTotal)

  return (
    <div className="flex min-h-full flex-col bg-pitch-dark text-white">
      <header className="border-b border-white/10 px-5 pt-6 pb-4">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
              {STAKES_LABEL[state.stakes]}
            </p>
            <div className="flex items-baseline gap-3">
              <p className="text-sm font-bold text-white/60">
                {state.phase === 'fulltime' ? 'Full time' : `Question ${asked} of ${QUESTIONS_PER_MATCH}`}
              </p>
              {onLeave !== undefined && state.phase !== 'fulltime' && !leaving && (
                <button
                  type="button"
                  onClick={() => setLeaving(true)}
                  className="rounded-lg px-2 py-0.5 text-xs font-bold text-white/45 ring-1 ring-white/15"
                >
                  Walk off
                </button>
              )}
            </div>
          </div>

          {leaving && (
            <div
              data-testid="walk-off"
              className="mt-3 flex flex-col gap-3 rounded-2xl bg-black/30 p-3.5 ring-1 ring-white/10"
            >
              <p className="text-[15px] leading-snug">
                Walk off now? This match just ends here. The maths you did still counts.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLeaving(false)}
                  className="h-12 flex-1 rounded-xl bg-gold text-base font-black text-ink"
                >
                  Keep playing
                </button>
                <button
                  type="button"
                  onClick={walkOff}
                  className="h-12 flex-1 rounded-xl bg-white/10 text-base font-bold text-white ring-1 ring-white/15"
                >
                  Yes, walk off
                </button>
              </div>
            </div>
          )}

          <div
            data-testid="scoreline"
            className="mt-1.5 flex items-center justify-center gap-3 text-2xl font-black"
          >
            <span className="min-w-0 flex-1 truncate text-right">{ourName}</span>
            <span className="shrink-0 rounded-xl bg-black/35 px-3 py-1 text-3xl tabular-nums">
              {state.score[0]}
              <span className="px-1.5 text-white/40">–</span>
              {state.score[1]}
            </span>
            <span className="min-w-0 flex-1 truncate">{opponent.name}</span>
          </div>

          {/* Narrower on a phone, so the numpad below stays under his thumb without scrolling. */}
          <div className="mx-auto mt-3 w-full max-sm:max-w-[220px]">
            <Pitch
              ball={{
                zone: state.zone,
                possession: state.possession,
                shooting: state.shotChoice !== null,
                loose: state.phase === 'tackleback',
              }}
              still={live}
              ourName={ourName}
              ourKit={ourKit}
              theirName={opponent.name}
              theirKit={opponent.kit}
            />
          </div>
        </div>
      </header>

      {/* Bottom-anchored, exactly as the try-out and the Training Ground are:
          prompts run from three words to five lines, and a centred column would
          move the numpad up and down under his thumb between questions. */}
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pt-4 pb-8">
        <div className="mx-auto mt-auto w-full max-w-md">
          {beat !== null && <BeatCard beat={beat} />}

          {beat === null && state.phase === 'shot_choice' && (
            <ShotMenu onChoose={(shot) => advance({ type: 'chooseShot', shot })} />
          )}

          {beat === null && state.phase === 'feedback' && state.currentItem !== null && (
            <Worked
              item={state.currentItem}
              miss={state.lastMiss?.kind ?? null}
              misconceptionId={state.lastMiss?.misconceptionId}
              onNext={() => advance({ type: 'dismissFeedback' })}
            />
          )}

          {beat === null && state.phase === 'halftime' && (
            <Halftime
              state={state}
              ourName={ourName}
              onNext={() => advance({ type: 'dismissFeedback' })}
            />
          )}

          {beat === null && state.phase === 'fulltime' && (
            <FullTime
              state={state}
              ourName={ourName}
              onDone={() =>
                onDone?.({
                  matchId: state.id,
                  opponent,
                  score: [state.score[0], state.score[1]],
                  questions: questions.current,
                })
              }
            />
          )}

          {beat === null && state.phase === 'tackleback' && (
            <div className="mb-4">
              <TackleBack
                // A fresh clock per tackle-back, started when the question
                // actually appears rather than while the ball is still moving.
                key={shownKey}
                ms={state.tackleBackMs}
                timed={settings.timersEnabled}
                onExpire={() => advance({ type: 'tackleBackTimeout' })}
              />
            </div>
          )}

          {live && state.phase === 'question' && state.shotChoice !== null && (
            <p className="mb-3 text-center">
              <span className="rounded-full bg-gold/15 px-3 py-1.5 text-[13px] font-black text-gold">
                {SHOT_TAG[state.shotChoice] ?? 'On goal'}
              </span>
            </p>
          )}

          {shownItem !== null && (
            <div
              data-testid="question-area"
              data-live={String(live)}
              // Dimmed rather than unmounted while the ball moves: the numpad is
              // the last thing in this column, so as long as it stays mounted it
              // cannot shift under his thumb between questions.
              className={clsx('transition-opacity duration-200', !live && 'opacity-25')}
            >
              <AnswerInput
                key={shownKey}
                item={shownItem}
                onSubmit={(given, latencyMs) => advance({ type: 'answer', given, latencyMs })}
                disabled={!live}
              />
            </div>
          )}

          {unreadable && live && (
            <p role="status" className="mt-4 text-center text-sm font-semibold text-white/70">
              I didn’t catch that one — write it as a number and I’ll take it.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

/**
 * Write whatever is not on disk yet, and nothing twice.
 *
 * Also joins each written attempt to the question it came from, using the id the
 * store hands back rather than a position in an array — the film room reads the
 * log by `matchId` and needs a key that means the same thing on both sides. If
 * the store refused any draft the ids no longer line up one for one, and the
 * join is abandoned rather than guessed at: a film room with a gap in it is
 * recoverable, a film room showing the wrong question next to his answer is not.
 */
function flushTail(
  log: readonly Attempt[],
  written: { current: number },
  asked: { current: Item[] },
  questions: { current: Map<string, Item> },
): void {
  if (log.length <= written.current) return
  const from = written.current
  const tail = log.slice(from)
  written.current = log.length

  const added = getStore().appendAttempts(tail.map(toDraft))
  if (added.length !== tail.length) return
  added.forEach((attempt, i) => {
    const item = asked.current[from + i]
    if (item !== undefined) questions.current.set(attempt.id, item)
  })
}

// ---------------------------------------------------------------------------

function BeatCard({ beat }: { beat: Beat }) {
  const loud = beat.tone === 'goal' || beat.tone === 'brave'

  return (
    <>
      {/* The one unambiguous-win moment inside a match itself. Never on a
          brave miss sitting right beside it in this same tone group —
          `docs/art/placement.md` is binding, and a picture on a miss,
          however brave, is not what "never near a loss" means. */}
      {beat.tone === 'goal' && (
        <Character name="rion-celebration" className="mx-auto mb-2 block h-28 w-auto" />
      )}
      <motion.p
        data-testid="beat"
        data-tone={beat.tone}
        role="status"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={clsx(
          'mb-4 rounded-2xl px-4 py-3.5 text-center leading-snug text-balance',
          loud
            ? 'bg-gold/15 text-xl font-black text-gold ring-1 ring-gold/30'
            : 'text-base font-bold text-white/75',
        )}
      >
        {beat.line}
      </motion.p>
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * What to say about the miss the worked solution is about.
 *
 * The three lines the Training Ground uses, in the fiction of a match — which is
 * where the fiction came from in the first place. `near` is a save because it
 * genuinely was on target; `off` never troubled the goal; a recognised mistake
 * is named with the item's own explanation, because "here is the question you
 * answered" is information and "wrong" is not.
 */
function missLine(item: Item, miss: string | null, misconceptionId?: string): {
  heading: string
  body: string
} {
  if (miss === 'misconception') {
    const named = item.misconceptions.find((m) => m.id === misconceptionId)
    if (named !== undefined) {
      return { heading: 'Ah — I know what happened there.', body: named.explanation }
    }
  }

  if (miss === 'near') {
    return {
      heading: 'The keeper got a hand to that one.',
      body: 'It was on target — you’re a whisker out, so it’s worth seeing where the number moved.',
    }
  }

  return {
    heading: 'That one didn’t trouble the keeper.',
    body: 'Different answer here. Have a read of how it comes out while they bring it forward.',
  }
}

function Worked({
  item,
  miss,
  misconceptionId,
  onNext,
}: {
  item: Item
  miss: string | null
  misconceptionId?: string
  onNext: () => void
}) {
  const line = missLine(item, miss, misconceptionId)

  return (
    <div className="flex w-full flex-col gap-4">
      {/* The question stays up. Worked steps about a problem he can no longer
          see are just sentences. */}
      <p className="text-center text-lg font-bold text-white/60">{item.prompt}</p>

      <div className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
        <p className="text-sm font-black text-gold">{line.heading}</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">{line.body}</p>

        <p className="mt-3 text-base font-bold">
          It comes out at <span className="text-xl font-black text-gold">{answerText(item.answer)}</span>.
        </p>

        <p className="mt-4 text-[11px] font-bold tracking-[0.15em] text-white/40 uppercase">
          How it goes
        </p>
        <ol className="mt-1.5 space-y-1.5">
          {item.workedSteps.map((step, i) => (
            <li key={step} className="flex gap-2.5 text-[14px] leading-snug text-white/80">
              <span className="w-3.5 shrink-0 font-black text-gold">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <motion.button
        type="button"
        onClick={onNext}
        whileTap={{ scale: 0.97 }}
        className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
      >
        Get back out there
      </motion.button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Halftime({
  state,
  ourName,
  onNext,
}: {
  state: MatchState
  ourName: string
  onNext: () => void
}) {
  const report = useMemo(() => scoutReport(state.log), [state.log])

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Half time</p>
        <p className="mt-1 text-3xl leading-tight font-black">
          {ourName} {state.score[0]}–{state.score[1]} {state.opponent.name}
        </p>
      </div>

      <div className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
        <p className="text-sm font-black text-gold">The scout’s had a look</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
          {report?.line ?? 'Nothing out there is hurting you. More of the same, second half.'}
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onNext}
        whileTap={{ scale: 0.97 }}
        className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
      >
        Second half
      </motion.button>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The whistle, and nothing else.
 *
 * The scoreline and a way off the pitch. What the match *meant* — the verdict,
 * the stats that moved, the bravery count, the ball he put away today that beat
 * him three weeks ago — belongs to the dressing room, and saying half of it
 * here would mean saying it twice or saying it worse. The one job left to this
 * card is to be the sound of the final whistle.
 */
function FullTime({
  state,
  ourName,
  onDone,
}: {
  state: MatchState
  ourName: string
  onDone: () => void
}) {
  const [us, them] = state.score

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Full time</p>
        <p className="mt-1 text-3xl leading-tight font-black">
          {ourName} {us}–{them} {state.opponent.name}
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onDone}
        whileTap={{ scale: 0.97 }}
        className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
      >
        Off the pitch
      </motion.button>
    </div>
  )
}
