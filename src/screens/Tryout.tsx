/**
 * The scouting try-out: the first maths he ever does in this game.
 *
 * It sets all six starting stats, which makes it the highest-stakes screen in
 * the app and the one that must feel like the lowest. Everything below follows
 * from that.
 *
 * **Nothing on this screen judges an answer.** No tick, no cross, no running
 * total, no "3 in a row". He answers, it moves on. Saying "that one was wrong"
 * here would buy nothing — there is no next attempt at it and no lesson attached
 * — and would cost the thing the session exists to measure: what he can do
 * *relaxed*. A child who has just been told he missed one tightens up on the
 * next, and the card would then be a picture of a nervous child rather than of
 * this one. The test file asserts this rather than trusting the next edit.
 *
 * **There is no clock, anywhere.** Unfinished timed assignments cost this child
 * recess last year. Latency is still measured — `QuestionInput` hands it over on
 * every submit and PAC is built from it — but it is never drawn, and the only
 * number on screen is his position in the session. "6 of 24" is orientation: it
 * says how much is left, which is a kindness, not how he is doing, which is not
 * the session's business.
 *
 * **The difficulty comes from the ladder, not from his ratings.** He has none
 * yet — that is the point of running this — so `selectItem` is deliberately not
 * used here. `engine/tryout.ts` owns which question and how hard; this file owns
 * the clock, the store and the Coach.
 *
 * **The pause between questions belongs to the question that just ended.** The
 * outgoing question stays on screen, locked, for a beat, and only then does the
 * next one mount. Advancing first and pausing afterwards would put that pause
 * inside the next question's latency and quietly deflate PAC. Each question also
 * gets a fresh `key`, so the answer box remounts with a fresh clock.
 *
 * It ends on the card. That is the payoff, it is what he was told he was working
 * towards, and it is the first time he sees himself as a player.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AnswerInput } from '../components/AnswerInput'
import { PlayerCard } from '../components/PlayerCard'
import { STAT_LABELS, clampStat } from '../components/stats'
import { DEFAULT_FLAG } from '../country/flag'
import { checkAnswer, classifyMiss, choiceCount } from '../engine/answer'
import { makeRng } from '../engine/items/rng'
import type { Item, Rng } from '../engine/items/types'
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
import type { TryoutState } from '../engine/tryout'
import { CARD_STATS, deriveCard, deriveRatings } from '../store/derive'
import { getStore } from '../store/storage'
import type { AttemptDraft, Country } from '../store/storage'
import { useAttempts, useCountry } from '../store/useGameState'

/**
 * The beat between questions.
 *
 * Long enough that the next question does not appear to teleport in on top of
 * the last one, short enough that twenty-four of them add under four seconds to
 * a ten-minute session. It is spent on the *outgoing* question, with the input
 * locked, so it never lands in the next question's latency.
 */
export const SETTLE_MS = 150

/**
 * A country to put on the card if there somehow is not one.
 *
 * The creator runs before this screen, so this is unreachable by playing. It
 * exists because the alternative at the end of twenty-four questions is a white
 * screen, and he cannot fix that himself.
 */
const NO_COUNTRY: Country = {
  name: 'Your country',
  flag: DEFAULT_FLAG,
  kit: ['#fbbf24', '#14532d'],
  stars: 0,
}

// ---------------------------------------------------------------------------

interface Session {
  /** One stream for the whole session, carried rather than rebuilt. */
  rng: Rng
  state: TryoutState
  item: Item
  /** Held until the end, then written in one go. */
  drafts: readonly AttemptDraft[]
}

function openSession(seed: number): Session {
  const rng = makeRng(itemSeedFor(seed))
  const state = startTryout(seed)
  const step = currentStep(state)
  return {
    rng,
    state,
    // The plan is twenty-four long by construction; the fallback only exists so
    // that an empty one would be a dull screen rather than a crash.
    item: itemFor(step ?? { track: 'FLU', standardId: 'FLU.MULT' }, currentDifficulty(state), rng),
    drafts: [],
  }
}

/**
 * One answer, folded in.
 *
 * The next item is drawn here rather than during render, so the stream advances
 * exactly once per question however many times React chooses to re-render.
 */
function advance(session: Session, draft: AttemptDraft, correct: boolean): Session {
  const state = recordAnswer(session.state, correct)
  const step = currentStep(state)
  return {
    rng: session.rng,
    state,
    item: step === undefined ? session.item : itemFor(step, currentDifficulty(state), session.rng),
    drafts: [...session.drafts, draft],
  }
}

export interface TryoutProps {
  /** Defaults to the clock, so each session asks different questions. */
  seed?: number
  /** Called when he taps through from the card reveal. */
  onDone?: () => void
}

export function Tryout({ seed, onDone }: TryoutProps) {
  const [start] = useState(() => seed ?? Date.now())
  const [session, setSession] = useState<Session>(() => openSession(start))
  /** True while the outgoing question is still on screen with the input locked. */
  const [settling, setSettling] = useState(false)
  /** Set only when we genuinely could not read what he typed. Never a score. */
  const [unreadable, setUnreadable] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** How many of `session.drafts` are already in the store. */
  const written = useRef(0)
  const latest = useRef(session)
  useEffect(() => {
    latest.current = session
  }, [session])

  /**
   * Write whatever is not yet written. On the happy path this runs exactly
   * once, at the end: one write, one notification, because twenty-four of
   * each would be twenty-four re-renders on an iPad mid-session.
   *
   * It also runs when the app is hidden or the screen is torn down, because
   * an iPad that goes to sleep at question twenty and gets reclaimed used to
   * lose all twenty and start him again at one. A partial try-out is a real
   * try-out: `tryoutRungs` replays whatever was answered, and the gate that
   * skips the try-out reads the log once at launch, so a flush here never
   * unmounts the screen under him.
   */
  const flush = (drafts: readonly AttemptDraft[]): void => {
    if (drafts.length <= written.current) return
    getStore().appendAttempts(drafts.slice(written.current))
    written.current = drafts.length
  }

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') flush(latest.current.drafts)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      if (timer.current !== null) clearTimeout(timer.current)
      flush(latest.current.drafts)
    }
    // `flush` only touches refs and the store, so it is stable in everything
    // that matters; listing it would re-bind the listener on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = isComplete(session.state)

  const submit = (given: string, latencyMs: number): void => {
    if (settling || done) return

    const item = session.item
    const result = checkAnswer(given, item.answer)

    // An answer we cannot parse is not a wrong answer — it might have been a
    // right one written in a way we failed to understand, and this session has
    // no second bite at a question. Ask again instead of scoring it.
    if (result.unparseable === true) {
      setUnreadable(true)
      return
    }
    setUnreadable(false)

    const draft: AttemptDraft = {
      at: Date.now(),
      standardId: item.standardId,
      // What the item was really built at, which is not always what the ladder
      // asked for — generators clamp to their own bands.
      difficulty: item.difficulty,
      params: item.params,
      given,
      correct: result.correct,
      latencyMs,
      context: 'tryout',
    }

    // The try-out's own ladder does not fold through Elo, but its attempts sit
    // in the same log as everything else and PAC is derived from all of them, so
    // the option count belongs here too.
    const choices = choiceCount(item.answer)
    if (choices !== undefined) draft.choices = choices

    if (!result.correct) {
      const miss = classifyMiss(given, item.answer, item.misconceptions)
      // Kept for the film room later. Nothing is said about it now.
      if (miss.misconceptionId !== undefined) draft.misconceptionId = miss.misconceptionId
    }

    const next = advance(session, draft, result.correct)

    setSettling(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setSettling(false)
      setSession(next)
      // The answer is in `next` before React has rendered it, so it is flushed
      // from `next` here rather than from the ref — the last question must
      // not be the one that is lost.
      if (isComplete(next.state)) flush(next.drafts)
    }, SETTLE_MS)
  }

  if (done) return <Reveal onDone={onDone} />

  const asked = session.state.index + 1

  return (
    <div className="flex min-h-full flex-col bg-pitch-dark text-white">
      <header
        data-testid="tryout-chrome"
        className="border-b border-white/10 px-5 pt-8 pb-4"
      >
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
              Scouting combine
            </p>
            {/* Position in the session, which is orientation. Never a score,
                never a percentage, never a clock. */}
            <p className="text-sm font-bold text-white/70">{`${asked} of ${TRYOUT_LENGTH}`}</p>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/12">
            <motion.div
              className="h-full rounded-full bg-gold"
              initial={false}
              animate={{ width: `${(asked / TRYOUT_LENGTH) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <p className="mt-3 text-[13px] leading-snug text-white/55">
            There’s no clock and nothing to beat. Get the ones you can — the rest tells me just as
            much.
          </p>
        </div>
      </header>

      {/* Anchored to the bottom, not centred. Prompts run from three words to
          five lines, and a centred column moves the numpad up and down under
          his thumb between questions. Growing the question upward instead keeps
          every key exactly where it was, which is also how every on-screen
          keyboard he has ever used behaves. */}
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pt-4 pb-8">
        <div className="mx-auto mt-auto w-full max-w-md">
          {/* A fresh key per question: a new answer box, a new clock, and no
              chance of the previous keystroke landing in the next answer. */}
          <AnswerInput
            key={session.state.index}
            item={session.item}
            onSubmit={submit}
            disabled={settling}
          />

          {unreadable && (
            <p role="status" className="mt-4 text-center text-sm font-semibold text-white/70">
              I didn’t catch that one — write it as a number and I’ll take it.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The payoff.
 *
 * Six stats read out one at a time, the way a scout would go down a sheet, and
 * then the card itself. The stagger is the point: a card that simply appeared
 * would be a screen, and this is meant to be the moment he finds out he is a
 * player with numbers on him.
 */
function Reveal({ onDone }: { onDone?: () => void }) {
  const country = useCountry()
  const attempts = useAttempts()
  /** Frozen on mount, so the card cannot decay by a hair while he looks at it. */
  const [now] = useState(() => Date.now())

  const ratings = useMemo(() => deriveRatings(attempts, now), [attempts, now])
  const card = useMemo(() => deriveCard(ratings, attempts, now), [ratings, attempts, now])

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">The Coach</p>
          <p className="mt-2 text-2xl leading-snug font-black text-balance">
            Right — that’s plenty to go on. Here’s what I’ve got.
          </p>
        </motion.div>

        <ul className="w-full divide-y divide-white/10 rounded-2xl bg-black/25 px-4 ring-1 ring-white/10">
          {CARD_STATS.map((stat, i) => (
            <motion.li
              key={stat}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.14, duration: 0.28 }}
              className="flex items-center gap-3 py-2.5"
            >
              <span className="w-10 shrink-0 text-sm font-black tracking-widest text-gold">
                {stat}
              </span>
              <span className="flex-1 text-sm text-white/70">{STAT_LABELS[stat].maths}</span>
              <span className="text-2xl font-black">{Math.round(clampStat(card[stat]))}</span>
            </motion.li>
          ))}
        </ul>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 1.15, type: 'spring', stiffness: 170, damping: 18 }}
          className="flex w-full justify-center"
        >
          <PlayerCard country={country ?? NO_COUNTRY} card={card} ratings={ratings} />
        </motion.div>

        <p className="text-center text-sm text-white/60 text-balance">
          Nobody starts high. Every one of those goes up the moment you play.
        </p>

        <motion.button
          type="button"
          onClick={onDone}
          whileTap={{ scale: 0.97 }}
          className="h-16 w-full max-w-sm rounded-2xl bg-gold text-xl font-black text-ink"
        >
          Into the season
        </motion.button>
      </div>
    </div>
  )
}
