/**
 * The film room: every ball that got away in one match, with the tape.
 *
 * **Optional, and skippable.** A child who wants to go straight back out must
 * never be made to sit through a review first, so this is a door off the
 * dressing room rather than a screen on the way out of it, and the way out is on
 * screen at every moment — top right and bottom, exactly as the Training Ground
 * puts `Done for now` where a tired child can find it without hunting.
 *
 * **Never the word wrong.** `classifyMiss` decides which of four things gets
 * said, in the same voice the Training Ground uses: a near miss was on target
 * and the keeper got a hand to it, an off-target answer goes straight to the
 * working with no adjective on it at all, a recognised mistake is named with the
 * item's own explanation, and a tackle-back the clock beat him to is told
 * plainly that it cost him nothing. "Here is the question you answered" is
 * information; "wrong" is not. The test file asserts that rather than trusting
 * the next edit.
 *
 * **Grouped by domain, so a pattern can be seen as a pattern.** Three fraction
 * questions scattered through a match feel like bad luck. The same three under
 * one heading are a thing to go and work on, and that is the move this game
 * exists to teach him: scout your own gap, then go and close it.
 *
 * The list itself comes from the store, filtered by `matchId`, so it is
 * reconstructible from the log alone. The *questions* are handed in by the match
 * that asked them: a generator turns a difficulty and a random stream into an
 * item, and there is no supported way back from the recorded parameters to the
 * item they came from. Regenerating from a fresh stream would put a different
 * question next to the answer he gave, which is worse than showing nothing.
 */

import { motion } from 'framer-motion'
import { classifyMiss } from '../engine/answer'
import { LABELS_BY_STANDARD, STAT_LABELS } from '../components/stats'
import { CARD_STATS } from '../store/derive'
import type { Attempt } from '../store/types'
import { useAttempts } from '../store/useGameState'
import type { Item } from '../engine/items/types'
import { DOMAIN_TO_STAT, STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { CardStat } from '../curriculum/standards.generated'

/** Two of anything from one domain is a pattern; one is a slip. */
const PATTERN = 2

// Up to fourteen, because fourteen is every question in a match and a child who
// has had a rough afternoon should not be the one person the words run out for.
const COUNTS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
]

const count = (n: number): string => COUNTS[n] ?? String(n)

/** Lowercase phrases, used at the front of a sentence. */
const opening = (phrase: string): string => phrase.charAt(0).toUpperCase() + phrase.slice(1)

/**
 * Which stat a standard sits under.
 *
 * `FLU.MULT` belongs to no domain — pace is fluency rather than a subject — so
 * it lands under PAC by the same rule `stats.ts` uses.
 */
export function statFor(standardId: string): CardStat {
  const domain = STANDARDS_BY_ID[standardId]?.domain
  return domain === undefined ? 'PAC' : DOMAIN_TO_STAT[domain]
}

export interface Miss {
  attempt: Attempt
  item: Item | undefined
}

export interface Group {
  stat: CardStat
  misses: Miss[]
}

/** Every ball that got away in this match, gathered by domain. */
export function groupMisses(
  attempts: readonly Attempt[],
  matchId: string,
  questions: ReadonlyMap<string, Item> | undefined,
): Group[] {
  const misses = attempts
    .filter((a) => a.matchId === matchId && !a.correct)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((attempt) => ({ attempt, item: questions?.get(attempt.id) }))

  return CARD_STATS.map((stat) => ({
    stat,
    misses: misses.filter((m) => statFor(m.attempt.standardId) === stat),
  })).filter((group) => group.misses.length > 0)
}

// ---------------------------------------------------------------------------
// What gets said about one of them

export interface MissLine {
  heading: string
  body: string
}

/**
 * The four things that can be said, and none of them is a verdict.
 *
 * Lifted from the Training Ground's coaching card so the two screens speak with
 * one voice — a near miss is a save there and a save here, and a recognised
 * mistake is named specifically in both. The fourth is this screen's own: a
 * tackle-back the clock reached first, which is told outright that it cost him
 * nothing, because the promise that the clock may never confiscate anything is
 * only worth something if it is still true when he looks back at it.
 */
export function missLine(attempt: Attempt, item: Item | undefined): MissLine {
  if (attempt.given.trim().length === 0) {
    return {
      heading: 'The clock got to that one first.',
      body: 'It cost you nothing then and it costs you nothing now. Here’s how it comes out.',
    }
  }

  if (item !== undefined) {
    const named = item.misconceptions.find((m) => m.id === attempt.misconceptionId)
    if (named !== undefined) {
      return { heading: 'Ah — I know what happened there.', body: named.explanation }
    }

    const miss = classifyMiss(attempt.given, item.answer, item.misconceptions)
    if (miss.kind === 'misconception') {
      const found = item.misconceptions.find((m) => m.id === miss.misconceptionId)
      if (found !== undefined) {
        return { heading: 'Ah — I know what happened there.', body: found.explanation }
      }
    }
    if (miss.kind === 'near') {
      return {
        heading: 'Close — that one was on target.',
        body: 'The keeper got a hand to it. You’re a whisker out, so it’s worth seeing where the number moved.',
      }
    }
  }

  return {
    heading: 'Let’s look at this one.',
    body: 'Different answer here. Here’s how it comes out.',
  }
}

// ---------------------------------------------------------------------------

export interface FilmRoomProps {
  matchId: string
  opponentName?: string
  /** The question behind each attempt, by the id the store minted for it. */
  questions?: ReadonlyMap<string, Item>
  onBack?: () => void
}

export function FilmRoom({ matchId, opponentName, questions, onBack }: FilmRoomProps) {
  const attempts = useAttempts()
  const groups = groupMisses(attempts, matchId, questions)
  const total = groups.reduce((sum, group) => sum + group.misses.length, 0)
  const named = worst(groups)
  const against = opponentName === undefined ? '' : ` against ${opponentName}`

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Film room</p>
            {/* On screen from the top, so leaving never takes a hunt. */}
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-white/70 ring-1 ring-white/20 active:bg-white/10"
            >
              Back
            </button>
          </div>

          {total === 0 ? (
            <>
              <h1 className="mt-2 text-3xl leading-tight font-black text-balance">
                Nothing to watch back.
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/75">
                {`Not one ball got away from you${against}. There is no tape, because there is nothing on it.`}
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-2 text-3xl leading-tight font-black text-balance">
                {total === 1 ? 'One ball got away.' : `${opening(count(total))} balls got away.`}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/70">
                No clock in here, and nothing on the line. Walk out whenever you’ve seen enough.
              </p>
            </>
          )}
        </header>

        {groups.map((group) => (
          <GroupCard key={group.stat} group={group} pattern={group.stat === named} />
        ))}

        <motion.button
          type="button"
          onClick={onBack}
          whileTap={{ scale: 0.97 }}
          className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
        >
          Back to the dressing room
        </motion.button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The one domain worth naming, or none.
 *
 * Exactly one, deliberately. Six headings each announcing that this is *the* one
 * to take to the training ground is six pieces of advice that contradict each
 * other, and a rough afternoon is precisely when a child needs to be handed one
 * thing to do rather than a list. Ties go to the first, which is the order the
 * card itself reads in.
 */
export function worst(groups: readonly Group[]): CardStat | null {
  let out: Group | null = null
  for (const group of groups) {
    if (group.misses.length < PATTERN) continue
    if (out === null || group.misses.length > out.misses.length) out = group
  }
  return out?.stat ?? null
}

function GroupCard({ group, pattern }: { group: Group; pattern: boolean }) {
  const labels = STAT_LABELS[group.stat]

  return (
    <section data-testid="film-group" data-stat={group.stat} className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.15em] text-white/40 uppercase">
          {`${labels.soccer} — ${labels.maths.toLowerCase()}`}
        </p>
        {/* One is a slip and needs no comment. Two from the same domain is the
            one genuinely useful thing this screen can tell him, and it is the
            move the game is built to teach: spot your own gap, go and close it. */}
        {pattern && (
          <p className="mt-1 text-[15px] leading-relaxed font-bold text-gold">
            {`${opening(count(group.misses.length))} of them came from the same place. That’s the one to take to the training ground.`}
          </p>
        )}
      </div>

      {group.misses.map((miss) => (
        <MissCard key={miss.attempt.id} miss={miss} />
      ))}
    </section>
  )
}

function MissCard({ miss }: { miss: Miss }) {
  const { attempt, item } = miss
  const line = missLine(attempt, item)
  const topic = LABELS_BY_STANDARD[attempt.standardId] ?? attempt.standardId
  const gave = attempt.given.trim()

  return (
    <div data-testid="film-miss" className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
      <p className="text-[11px] font-bold tracking-[0.15em] text-white/40 uppercase">
        {attempt.context === 'tackleback' ? `${topic} · tackle-back` : topic}
      </p>

      {item === undefined ? (
        <p className="mt-2 text-[15px] leading-relaxed text-white/75">
          This one isn’t on the tape. {gave.length > 0 && `You put down ${gave}.`}
        </p>
      ) : (
        <>
          <p className="mt-2 text-lg font-bold text-white/85">{item.prompt}</p>
          {gave.length > 0 && (
            <p className="mt-1 text-sm font-semibold text-white/55">{`You put down ${gave}.`}</p>
          )}

          <p className="mt-3 text-sm font-black text-gold">{line.heading}</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">{line.body}</p>

          <p className="mt-3 text-base font-bold">
            It comes out at{' '}
            <span className="text-xl font-black text-gold">{item.answer.canonical}</span>.
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
        </>
      )}
    </div>
  )
}
