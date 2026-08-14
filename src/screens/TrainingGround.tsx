/**
 * The Training Ground: preseason camp, and the only place in the game with no
 * match, no stakes and no clock.
 *
 * **It is squad prep, not vegetables.** The stat he raises here is the stat he
 * takes into the next match, so the screen opens on his own six numbers rather
 * than on a list of topics: he scouts Brazil, sees they are 92 DRI against his
 * 58, and comes in here and drills fractions *because he wants to beat Brazil*.
 * Scout, spot your own gap, train, compete. The picker's whole job is to make
 * the gap visible enough that he picks it himself — the game asks for that move
 * instead of a parent asking for it.
 *
 * **There is no timer, and there is not going to be one.** Timed maths cost this
 * child recess last year. This is the one screen in the game that is explicitly
 * guaranteed clock-free: latency is still measured, because PAC is fluency, but
 * nothing counts down and nothing is ever drawn ticking.
 *
 * **Unlike the try-out, this screen does tell him.** The try-out says nothing
 * about any answer because it is measuring what he can do relaxed and there is
 * no second attempt at anything. Training is the opposite: it is where you find
 * out, so a miss gets the answer, the reason, and the worked steps — and the
 * next question waits until he says he has read them. What it never does is call
 * anything wrong. `classifyMiss` decides which of three things gets said, and a
 * recognised mistake gets named specifically, because "here is the question you
 * answered" is information and "wrong" is not.
 *
 * **He can stop whenever he likes.** No session length, no "do ten", no streak
 * to break. `Done for now` sits on screen at every moment including mid-
 * explanation, and it ends on a summary rather than on an exit, so leaving reads
 * as finishing rather than as quitting.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Character } from '../components/Character'
import { AnswerInput } from '../components/AnswerInput'
import {
  LABELS_BY_STANDARD,
  STANDARDS_BY_STAT,
  STAT_LABELS,
  clampStat,
} from '../components/stats'
import { answerText, checkAnswer, choiceCount, classifyMiss } from '../engine/answer'
import type { MissClassification } from '../engine/answer'
import { generatorFor } from '../engine/items/generators'
import { makeRng } from '../engine/items/rng'
import type { Item, ItemGenerator, Rng } from '../engine/items/types'
import { selectItem } from '../engine/select'
import { CARD_STATS, deriveCard, deriveRatings } from '../store/derive'
import { getStore } from '../store/storage'
import type { AttemptDraft } from '../store/storage'
import type { Attempt, StandardRating } from '../store/types'
import { useAttempts } from '../store/useGameState'
import type { CardStat } from '../curriculum/standards.generated'

/**
 * How long a correct answer's acknowledgement sits there before the next
 * question arrives.
 *
 * Long enough to read three words, short enough that a good run still feels like
 * a run. Nothing is asked of him in this beat — routine success gets a nod, not
 * a ceremony, and never a tap.
 */
export const ACK_MS = 700

/**
 * How long the `Next one` button stays locked after a miss.
 *
 * He submits with a thumb on the Enter key and the explanation appears under it.
 * A quarter of a second is invisible to a child who means to read and fatal to
 * the double-tap that would otherwise skip the only teaching in the screen.
 */
export const READY_MS = 250

/**
 * Answers held before a write.
 *
 * One write per answer would be one re-render of the whole tree per answer on an
 * iPad. Batching costs at most four answers if the tab is closed mid-session,
 * which is a fair trade against a session that stutters.
 */
export const FLUSH_EVERY = 5

/**
 * The generators behind each stat.
 *
 * Built from `STANDARDS_BY_STAT` rather than from the domain, because PAC is
 * fluency and belongs to no domain — filtering by domain would leave the pace
 * drill with nothing to ask. This way every stat, including PAC, is a real
 * pool, and a drill provably cannot serve a question from outside the stat he
 * chose.
 */
export const DRILL_GENERATORS: Record<CardStat, readonly ItemGenerator[]> = (() => {
  // Built by hand rather than via `Object.fromEntries`, which types its result
  // as a string-keyed record and needs an unsound cast to become one keyed by
  // CardStat. vitest strips types without checking them, so that cast passed
  // the whole suite while failing the build.
  const out = {} as Record<CardStat, readonly ItemGenerator[]>
  for (const stat of CARD_STATS) {
    out[stat] = STANDARDS_BY_STAT[stat]
      .map((id) => generatorFor(id))
      .filter((g): g is ItemGenerator => g !== undefined)
  }
  return out
})()

/** What he chose to work on: a stat, and optionally one topic beneath it. */
interface Scope {
  stat: CardStat
  standardId?: string
}

const scopeTitle = (scope: Scope): string =>
  scope.standardId === undefined
    ? STAT_LABELS[scope.stat].maths
    : (LABELS_BY_STANDARD[scope.standardId] ?? STAT_LABELS[scope.stat].maths)

// ---------------------------------------------------------------------------

export interface TrainingGroundProps {
  /** Defaults to the clock, so two sessions do not drill the same questions. */
  seed?: number
  /** Called when he leaves the Training Ground altogether. */
  onDone?: () => void
}

export function TrainingGround({ seed, onDone }: TrainingGroundProps) {
  const [start] = useState(() => seed ?? Date.now())
  const [scope, setScope] = useState<Scope | null>(null)

  if (scope === null) return <Picker onChoose={setScope} onLeave={onDone} />

  return (
    <Drill
      // A fresh drill per choice: new stream, new session, nothing carried over
      // from the topic he just left.
      key={`${scope.stat}:${scope.standardId ?? 'mixed'}`}
      scope={scope}
      seed={start}
      onAgain={() => setScope(null)}
      onDone={onDone}
    />
  )
}

// ---------------------------------------------------------------------------
// Picking

/**
 * The stat with the most room to move.
 *
 * Only named when it is clearly on its own. Six numbers within a point of each
 * other have no gap in them, and pointing at one of them anyway would be making
 * something up about him.
 */
function biggestGap(values: Record<CardStat, number>): CardStat | null {
  const sorted = [...CARD_STATS].sort((a, b) => values[a] - values[b])
  const lowest = sorted[0]
  const next = sorted[1]
  return values[next] - values[lowest] >= 1 ? lowest : null
}

function Picker({
  onChoose,
  onLeave,
}: {
  onChoose: (scope: Scope) => void
  onLeave?: () => void
}) {
  const attempts = useAttempts()
  /** Frozen on mount, so nothing decays by a hair while he is deciding. */
  const [now] = useState(() => Date.now())
  const [stat, setStat] = useState<CardStat | null>(null)

  const ratings = useMemo(() => deriveRatings(attempts, now), [attempts, now])
  const card = useMemo(() => deriveCard(ratings, attempts, now), [ratings, attempts, now])

  const values = useMemo(() => {
    const out = {} as Record<CardStat, number>
    for (const s of CARD_STATS) out[s] = Math.round(clampStat(card[s]))
    return out
  }, [card])

  const gap = biggestGap(values)

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Training ground</p>
            <button
              type="button"
              onClick={stat === null ? onLeave : () => setStat(null)}
              className="rounded-full px-3 py-1.5 text-sm font-bold text-white/70 ring-1 ring-white/20 active:bg-white/10"
            >
              Back
            </button>
          </div>

          {stat === null ? (
            // The one screen in the game with idle time and no scoreline, which
            // is why this is where he gets to stand and look at himself.
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="mt-2 text-3xl leading-tight font-black text-balance">
                  What do you want to work on?
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-white/70">
                  Preseason. No clock in here, nothing on the line, and you can walk off whenever
                  you like.
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-white/70">
                  Whatever you raise in here is what you take into your next match.
                </p>
              </div>
              <Character name="rion-ready" className="mt-2 w-24 shrink-0 sm:w-28" />
            </div>
          ) : (
            <>
              <h1 className="mt-2 text-3xl leading-tight font-black text-balance">
                {STAT_LABELS[stat].soccer} &mdash; {STAT_LABELS[stat].maths.toLowerCase()}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/70">
                {DRILL_GENERATORS[stat].length > 1
                  ? 'Anything in here counts. Pick the one you fancy, or I’ll mix them up for you.'
                  : 'Quick-fire finishing drills. Straight in.'}
              </p>
            </>
          )}
        </div>

        {stat === null ? (
          <ul className="flex flex-col gap-2">
            {CARD_STATS.map((s) => (
              <li key={s}>
                <StatChoice
                  stat={s}
                  value={values[s]}
                  headroom={gap === s}
                  // A stat with a single topic under it has nothing to choose
                  // between, and a screen offering one option is a tap that
                  // asks a question with one answer. Shooting and Pace are both
                  // like this today. Go straight in.
                  onClick={() =>
                    DRILL_GENERATORS[s].length === 1
                      ? onChoose({ stat: s, standardId: DRILL_GENERATORS[s][0]!.standardId })
                      : setStat(s)
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <TopicChoices
            stat={stat}
            ratings={ratings}
            onChoose={(standardId) =>
              onChoose(standardId === undefined ? { stat } : { stat, standardId })
            }
          />
        )}
      </div>
    </div>
  )
}

function StatChoice({
  stat,
  value,
  headroom,
  onClick,
}: {
  stat: CardStat
  value: number
  headroom: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-left ring-1 ring-white/10 active:bg-black/40"
    >
      <span className="w-10 shrink-0 text-sm font-black tracking-widest text-gold">{stat}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{STAT_LABELS[stat].soccer}</span>
        <span className="block text-xs text-white/55">{STAT_LABELS[stat].maths}</span>
      </span>
      {headroom && (
        <span className="shrink-0 rounded-full bg-gold/15 px-2 py-1 text-[11px] font-bold text-gold">
          most to gain
        </span>
      )}
      <span className="text-2xl font-black">{value}</span>
    </motion.button>
  )
}

function TopicChoices({
  stat,
  ratings,
  onChoose,
}: {
  stat: CardStat
  ratings: Map<string, StandardRating>
  onChoose: (standardId?: string) => void
}) {
  const topics = DRILL_GENERATORS[stat]
  const lowest = topics.reduce<string | null>((worst, g) => {
    if (topics.length < 2) return null
    const rating = ratings.get(g.standardId)?.rating ?? 0
    const best = worst === null ? Infinity : (ratings.get(worst)?.rating ?? 0)
    return rating < best ? g.standardId : worst
  }, null)

  return (
    <div className="flex flex-col gap-2">
      {topics.length > 1 && (
        <motion.button
          type="button"
          onClick={() => onChoose(undefined)}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gold px-4 py-4 text-left text-ink"
        >
          <span className="font-black">Mix them up</span>
          <span className="text-sm font-bold opacity-70">a bit of everything</span>
        </motion.button>
      )}

      {topics.map((generator) => {
        const rating = ratings.get(generator.standardId)
        const fresh = (rating?.attempts ?? 0) === 0
        return (
          <motion.button
            key={generator.standardId}
            type="button"
            onClick={() => onChoose(generator.standardId)}
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-left ring-1 ring-white/10 active:bg-black/40"
          >
            <span className="min-w-0 flex-1 font-bold">{generator.label}</span>
            {fresh ? (
              <span className="shrink-0 rounded-full bg-gold/15 px-2 py-1 text-[11px] font-bold text-gold">
                new
              </span>
            ) : (
              lowest === generator.standardId && (
                <span className="shrink-0 rounded-full bg-gold/15 px-2 py-1 text-[11px] font-bold text-gold">
                  most to gain
                </span>
              )
            )}
            <span className="text-xl font-black">
              {Math.round(clampStat(rating?.rating ?? 0))}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drilling

interface Session {
  /** One stream for the whole drill, carried rather than rebuilt. */
  rng: Rng
  item: Item
  /** Answered but not yet written. */
  pending: readonly AttemptDraft[]
  answered: number
}

type Result =
  | { kind: 'ack'; next: Session; nudge?: 'unreduced' }
  | { kind: 'miss'; next: Session; miss: MissClassification }

/**
 * The log as the drill sees it: what is saved, plus what he has answered since.
 *
 * The unwritten answers have to be folded in or the number he came to move would
 * sit still until the next flush, and the next question would be chosen against
 * a picture of him that is five answers out of date. The ids are local and
 * never persisted; they exist because `deriveRatings` breaks timestamp ties on
 * them, and they sort after the store's own so a tie resolves in the order the
 * questions were actually answered.
 */
function withPending(attempts: Attempt[], pending: readonly AttemptDraft[]): Attempt[] {
  if (pending.length === 0) return attempts
  return [
    ...attempts,
    ...pending.map((draft, i) => ({ ...draft, id: `pending-${String(i).padStart(6, '0')}` })),
  ]
}

/**
 * The next question.
 *
 * `training` targets 0.75 success — the same calibration as ordinary midfield
 * play, and deliberately not harder. Practice is not where the game gets to be
 * difficult.
 */
function pickItem(scope: Scope, ratings: Map<string, StandardRating>, rng: Rng): Item {
  return selectItem({
    ratings,
    pressure: 'training',
    rng,
    generators: DRILL_GENERATORS[scope.stat],
    standardId: scope.standardId,
  })
}

/** Routine success, acknowledged and moved past. Never a ceremony. */
const ACKS = ['That’s it.', 'Yep.', 'Got it.', 'Good.']

function Drill({
  scope,
  seed,
  onAgain,
  onDone,
}: {
  scope: Scope
  seed: number
  onAgain: () => void
  onDone?: () => void
}) {
  const attempts = useAttempts()
  /** Frozen for the whole drill, so the number moves on answers and nothing else. */
  const [now] = useState(() => Date.now())

  const [session, setSession] = useState<Session>(() => {
    const rng = makeRng(seed)
    return { rng, item: pickItem(scope, deriveRatings(attempts, now), rng), pending: [], answered: 0 }
  })
  const [opened] = useState(() => {
    const ratings = deriveRatings(attempts, now)
    return Math.round(clampStat(deriveCard(ratings, attempts, now)[scope.stat]))
  })

  const [result, setResult] = useState<Result | null>(null)
  /** Set only when we genuinely could not read what he typed. Never a score. */
  const [unreadable, setUnreadable] = useState(false)
  /** False for a beat after a miss, so a second tap cannot skip the explanation. */
  const [ready, setReady] = useState(false)
  const [over, setOver] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const unwritten = useRef<readonly AttemptDraft[]>([])

  const after = (ms: number, run: () => void): void => {
    timers.current.push(setTimeout(run, ms))
  }

  useEffect(() => {
    unwritten.current = session.pending
  }, [session.pending])

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
      timers.current = []
      // A drill unmounted mid-question still happened. Never lose an answer he
      // has already given.
      if (unwritten.current.length > 0) getStore().appendAttempts(unwritten.current)
    },
    [],
  )

  const log = useMemo(() => withPending(attempts, session.pending), [attempts, session.pending])
  const ratings = useMemo(() => deriveRatings(log, now), [log, now])
  const card = useMemo(() => deriveCard(ratings, log, now), [ratings, log, now])

  const exact = clampStat(card[scope.stat])
  const shown = Math.round(exact)
  /** How far along it is to the next whole point. Movement he can see every answer. */
  const toNext = exact + 0.5 - Math.floor(exact + 0.5)

  const commit = (next: Session): void => {
    setResult(null)
    setUnreadable(false)
    if (next.pending.length >= FLUSH_EVERY) {
      getStore().appendAttempts(next.pending)
      setSession({ ...next, pending: [] })
    } else {
      setSession(next)
    }
  }

  const submit = (given: string, latencyMs: number): void => {
    if (result !== null || over) return

    const item = session.item
    const check = checkAnswer(given, item.answer)

    // An answer we cannot parse is not a wrong answer — it might be a right one
    // written in a way we failed to understand. Ask again rather than score it.
    if (check.unparseable === true) {
      setUnreadable(true)
      return
    }
    setUnreadable(false)

    const draft: AttemptDraft = {
      at: Date.now(),
      standardId: item.standardId,
      // What the item was really built at, which is not always what was asked
      // for — generators clamp to their own bands.
      difficulty: item.difficulty,
      params: item.params,
      given,
      correct: check.correct,
      latencyMs,
      context: 'training',
    }

    // Recorded so the rating can be priced for luck. Without it a lucky
    // true/false builds the card exactly as a typed answer would.
    const choices = choiceCount(item.answer)
    if (choices !== undefined) draft.choices = choices

    const miss = check.correct ? null : classifyMiss(given, item.answer, item.misconceptions)
    if (miss?.misconceptionId !== undefined) draft.misconceptionId = miss.misconceptionId

    const pending = [...session.pending, draft]
    const next: Session = {
      rng: session.rng,
      // Drawn here rather than during render, so the stream advances exactly
      // once per question — and drawn against the answer he has just given, so
      // the drill tracks him inside a session rather than between them.
      item: pickItem(scope, deriveRatings(withPending(attempts, pending), now), session.rng),
      pending,
      answered: session.answered + 1,
    }

    if (miss === null) {
      setResult({ kind: 'ack', next, nudge: check.nudge })
      after(ACK_MS, () => commit(next))
      return
    }

    setResult({ kind: 'miss', next, miss })
    setReady(false)
    after(READY_MS, () => setReady(true))
  }

  const leave = (): void => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []

    if (session.pending.length > 0) {
      getStore().appendAttempts(session.pending)
      setSession((current) => ({ ...current, pending: [] }))
    }
    // Nothing answered is not a session, and being shown a summary of nothing
    // would be a strange way to be told you changed your mind.
    if (session.answered === 0) {
      onAgain()
      return
    }
    setOver(true)
  }

  if (over) {
    return (
      <Summary
        scope={scope}
        answered={session.answered}
        before={opened}
        after={shown}
        onAgain={onAgain}
        onDone={onDone}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-pitch-dark text-white">
      <header data-testid="drill-chrome" className="border-b border-white/10 px-5 pt-8 pb-4">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
                Training ground
              </p>
              <p className="mt-1 text-lg leading-tight font-black">{scopeTitle(scope)}</p>
            </div>
            {/* On screen at every moment, including mid-explanation. Tired is a
                reason to stop, and stopping must never take a hunt. */}
            <button
              type="button"
              onClick={leave}
              className="shrink-0 rounded-full px-3 py-2 text-sm font-bold text-white/70 ring-1 ring-white/20 active:bg-white/10"
            >
              Done for now
            </button>
          </div>

          <div className="mt-3 flex items-end gap-2.5">
            <span className="text-sm font-black tracking-widest text-gold">{scope.stat}</span>
            <span data-testid="drill-stat" className="text-3xl leading-none font-black">
              {shown}
            </span>
            {/* Only ever shown climbing. The number itself is right there
                either way; a badge counting down a bad session is not
                information he needs while he is still playing. */}
            {shown > opened && (
              <span className="pb-0.5 text-sm font-bold text-gold">+{shown - opened}</span>
            )}
          </div>

          {/* Progress to the next whole point, so every answer visibly does
              something even when the number itself has not turned over yet. */}
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/12"
          >
            <motion.div
              className="h-full rounded-full bg-gold"
              initial={false}
              animate={{ width: `${toNext * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <p className="mt-3 text-[13px] leading-snug text-white/55">
            No clock and nothing on the line. Stop whenever you’ve had enough.
          </p>
        </div>
      </header>

      {/* Anchored to the bottom, the same as the try-out: prompts run from three
          words to five lines, and a centred column would move the numpad up and
          down under his thumb between questions. */}
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pt-4 pb-8">
        <div className="mx-auto mt-auto w-full max-w-md">
          {result?.kind === 'miss' ? (
            <Coaching
              item={session.item}
              miss={result.miss}
              ready={ready}
              onNext={() => commit(result.next)}
            />
          ) : (
            <>
              {/* A fresh key per question: a new answer box, a new clock, and no
                  chance of the last keystroke landing in the next answer. */}
              <AnswerInput
                key={session.answered}
                item={session.item}
                onSubmit={submit}
                disabled={result !== null}
              />

              {result?.kind === 'ack' && (
                <p role="status" className="mt-4 text-center text-sm font-bold text-gold">
                  {result.nudge === 'unreduced'
                    ? `That’s it — and ${answerText(session.item.answer)} is the tidiest way to write it.`
                    : ACKS[session.answered % ACKS.length]}
                </p>
              )}

              {unreadable && (
                <p role="status" className="mt-4 text-center text-sm font-semibold text-white/70">
                  I didn’t catch that one — write it as a number and I’ll take it.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * What to say about a miss.
 *
 * Three things get said, and which one depends on what he actually did rather
 * than on how it feels to get one out. A recognised mistake is named with the
 * item's own explanation — that is the difference between a tutor and a quiz. A
 * near miss is a shot on target, which is the metaphor the Coach already taught
 * him and is also true: it usually means the method held and the arithmetic
 * slipped. Anything else goes straight to the working, with no adjective on it
 * at all.
 *
 * None of the three contains a word about being wrong, careless or slow, and the
 * test file asserts that rather than trusting the next edit.
 */
function missLine(item: Item, miss: MissClassification): { heading: string; body: string } {
  if (miss.kind === 'misconception') {
    const named = item.misconceptions.find((m) => m.id === miss.misconceptionId)
    if (named !== undefined) return { heading: 'Ah — I know what happened there.', body: named.explanation }
  }

  if (miss.kind === 'near') {
    return {
      heading: 'Close — that’s on target.',
      body: 'The keeper got a hand to that one. You’re a whisker out, so it’s worth seeing where the number moved.',
    }
  }

  return {
    heading: 'Let’s look at this one.',
    body: 'Different answer here. Have a read of how it comes out — that’s what we’re in here for.',
  }
}

function Coaching({
  item,
  miss,
  ready,
  onNext,
}: {
  item: Item
  miss: MissClassification
  ready: boolean
  onNext: () => void
}) {
  const line = missLine(item, miss)

  return (
    <div className="flex w-full flex-col gap-4">
      {/* The question stays up. Worked steps about a problem he can no longer
          see are just sentences. */}
      <p className="text-center text-lg font-bold text-white/60">{item.prompt}</p>

      <div className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
        <p className="text-sm font-black text-gold">{line.heading}</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">{line.body}</p>

        <p className="mt-3 text-base font-bold">
          It comes out at{' '}
          <span className="text-xl font-black text-gold">{answerText(item.answer)}</span>.
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
        disabled={!ready}
        whileTap={{ scale: 0.97 }}
        className={clsx(
          'h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink',
          !ready && 'opacity-60',
        )}
      >
        Next one
      </motion.button>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The end of a session, which is a finish rather than an exit.
 *
 * A child who is tired must be able to stop without it feeling like quitting, so
 * leaving lands on what he did and where the number got to. There is no score
 * and no count of what he missed anywhere on it: a session where nothing moved
 * is still a session, and telling him "0 out of 12" would be the one thing this
 * screen exists to avoid.
 */
function Summary({
  scope,
  answered,
  before,
  after,
  onAgain,
  onDone,
}: {
  scope: Scope
  answered: number
  before: number
  after: number
  onAgain: () => void
  onDone?: () => void
}) {
  const climbed = after > before

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Training ground</p>
          <p className="mt-2 text-2xl leading-snug font-black text-balance">Right — that’ll do.</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl bg-black/25 p-5 ring-1 ring-white/10"
        >
          <p className="text-sm text-white/60">
            {answered} {answered === 1 ? 'question' : 'questions'} on{' '}
            {scopeTitle(scope).toLowerCase()}.
          </p>

          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="text-sm font-black tracking-widest text-gold">{scope.stat}</span>
            {climbed && (
              <>
                <span className="text-xl font-bold text-white/45">{before}</span>
                <span className="text-white/40">&rarr;</span>
              </>
            )}
            <span className="text-4xl leading-none font-black">{after}</span>
            {climbed && <span className="text-lg font-bold text-gold">+{after - before}</span>}
          </div>

          <p className="mt-3 text-[15px] leading-relaxed text-white/80">
            {climbed
              ? 'That’s the number you take into your next match.'
              : 'That one’s still bedding in. Come back to it tomorrow — it moves.'}
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          <motion.button
            type="button"
            onClick={onDone}
            whileTap={{ scale: 0.97 }}
            className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
          >
            Head back
          </motion.button>
          <motion.button
            type="button"
            onClick={onAgain}
            whileTap={{ scale: 0.97 }}
            className="h-14 w-full rounded-2xl font-bold text-white/80 ring-1 ring-white/20"
          >
            Train something else
          </motion.button>
        </div>
      </div>
    </div>
  )
}
