/**
 * The dressing room after the whistle.
 *
 * The match screen ends on the scoreline and nothing else. This is where the
 * match is *paid out*, and it is where two of the promises the Coach made in the
 * explainer either come true or turn out to have been words.
 *
 * **"You can lose a match and still climb the rankings."** Elo pays for
 * overperformance, so a good match against a side rated well above him raises
 * his rating whatever the score said. The Coach says so before he has played a
 * single game. This screen is the only place he ever gets to *see* it, so when
 * it happens the rise is the headline and the defeat is the sentence underneath
 * it — not a consolation footnote under a big red scoreline.
 *
 * The claim is only made when he can check it. `climbed` requires both that the
 * overall actually rose and that some stat on his card visibly turned over a
 * whole point, because "your rating went up" next to six numbers that all read
 * the same as they did this morning is worse than saying nothing: it teaches him
 * that the game says nice things whether or not they are true, and then the day
 * it tells him something real he has no reason to believe it.
 *
 * **"Taking the hard shot counts even when it misses."** The courage line is
 * reported on its own terms, separately from the result and without a word about
 * whether any of them went in. That is the whole design of the courage track —
 * the block this child has sits in the moment *before* attempting something
 * hard, so that is the moment the game pays out on, and the chores-app reward
 * will eventually pay on this and never on wins.
 *
 * And one more, which is the specific medicine for a child who does not believe
 * he is any good at this: **"Three weeks ago this beat you."** When a standard
 * crosses a level that genuinely defeated him before, the screen says so. The
 * test for it is strict in both directions, because a milestone he did not earn
 * is worth less than no milestone at all.
 *
 * Nothing in here reads `MatchState`. The match has flushed its log and
 * unmounted by the time this mounts, so everything is recomputed from the store
 * by `matchId` — which also means the same summary could be drawn again later
 * from history alone.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FilmRoom } from './FilmRoom'
import { Character } from '../components/Character'
import { LABELS_BY_STANDARD, STAT_LABELS, clampStat } from '../components/stats'
import {
  CARD_STATS,
  deriveCard,
  deriveCourage,
  deriveOverall,
  deriveRatings,
  deriveWorldRank,
} from '../store/derive'
import type { Attempt, Courage, StandardRating } from '../store/types'
import { useAttempts, useCountry } from '../store/useGameState'
import type { Item } from '../engine/items/types'
import type { Opponent } from '../data/opponents'
import type { CardStat } from '../curriculum/standards.generated'
import type { CampaignOutcome } from '../engine/campaign'
import { campaignCardCopy } from './campaignCopy'

const DAY_MS = 24 * 60 * 60 * 1000

/** At most this many "this used to beat you" moments, strongest first. */
export const MAX_CROSSINGS = 2

// ---------------------------------------------------------------------------
// What the match did

export interface StatMove {
  stat: CardStat
  from: number
  to: number
}

/**
 * A standard that has just cleared a level which genuinely used to beat him.
 *
 * `level` is the difficulty of the miss that was crossed, and `when` is when
 * that miss happened, so the screen can say how long ago it was rather than
 * making a vague claim about progress.
 */
export interface Crossing {
  standardId: string
  level: number
  when: number
}

export interface Summary {
  /** This match's attempts, oldest first. */
  played: Attempt[]
  courage: Courage
  /** Card stats whose whole-point value changed, biggest mover first. */
  moves: StatMove[]
  /** The biggest visible rise, if there was one. */
  rise: StatMove | null
  overallFrom: number
  overallTo: number
  rankFrom: number
  rankTo: number
  /**
   * The overall genuinely rose *and* he can see a number that proves it.
   * Both halves are load-bearing; see the note at the top of the file.
   */
  climbed: boolean
  crossings: Crossing[]
  /**
   * A standard he played this match that had visible rust on it at kickoff
   * and less of it by full time — the one with the biggest gap closed, if
   * more than one qualifies. `null` on most matches, which never touch a
   * rusted standard at all.
   */
  rustBurnedOn: string | null
}

/** Attempts sort by minted id, which is the order they were appended in. */
const byId = (a: Attempt, b: Attempt): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The same order `deriveRatings` folds the log in. Kept in step by `derive.test.ts`'s own check. */
function byTime(a: Attempt, b: Attempt): number {
  if (a.at !== b.at) return a.at - b.at
  return byId(a, b)
}

/**
 * A standard this match visibly de-rusted, if any — the one with the biggest
 * gap closed, so a match that touches several rusted topics reports the one
 * most worth saying something about.
 *
 * "Visible" is the same rounded threshold the card and the training ground
 * both use: a rust gap that would never have shown up as a different number
 * is not something this screen has anything true to say about either.
 */
function rustBurnedOn(
  played: readonly Attempt[],
  before: Map<string, StandardRating>,
  after: Map<string, StandardRating>,
): string | null {
  let best: { id: string; closed: number } | null = null
  for (const id of new Set(played.map((a) => a.standardId))) {
    const b = before.get(id)
    const a = after.get(id)
    if (b === undefined || a === undefined) continue
    if (Math.round(b.ratingClean) <= Math.round(b.rating)) continue // not visibly rusted at kickoff
    const closed = b.ratingClean - b.rating - (a.ratingClean - a.rating)
    if (closed > 0 && (best === null || closed > best.closed)) best = { id, closed }
  }
  return best?.id ?? null
}

const whole = (value: number): number => Math.round(clampStat(value))

/**
 * A tackle-back is a scaffold, deliberately pitched far easier than the question
 * it is helping with. It is evidence about the scaffold, not about the standard,
 * so it counts neither as a level that beat him nor as one he has cleared.
 */
const isScaffold = (a: Attempt): boolean => a.context === 'tackleback'

/**
 * Standards that have just cleared a level which used to beat him.
 *
 * Three conditions, and the third is the one that stops this being a lie:
 *
 *  1. He missed this standard at some difficulty before this match.
 *  2. He answered it correctly in this match at that difficulty or harder.
 *  3. He had **never** previously answered it correctly at that difficulty or
 *     harder. Without this, one bad answer months ago would fire a milestone
 *     every single match from then on, and "this used to beat you" would become
 *     the thing the game says rather than something that happened.
 */
export function crossings(played: readonly Attempt[], earlier: readonly Attempt[]): Crossing[] {
  const out: Crossing[] = []

  for (const standardId of new Set(played.map((a) => a.standardId))) {
    const history = earlier.filter((a) => a.standardId === standardId && !isScaffold(a))

    /** The hardest he has ever answered this correctly before today. */
    let cleared = -Infinity
    for (const a of history) if (a.correct && a.difficulty > cleared) cleared = a.difficulty

    /** The hardest miss that sits above everything he has ever cleared. */
    let beat: Attempt | null = null
    for (const a of history) {
      if (a.correct || a.difficulty <= cleared) continue
      if (beat === null || a.difficulty > beat.difficulty) beat = a
    }
    if (beat === null) continue

    const crossed = played.some(
      (a) => a.standardId === standardId && a.correct && !isScaffold(a) && a.difficulty >= beat.difficulty,
    )
    if (crossed) out.push({ standardId, level: beat.difficulty, when: beat.at })
  }

  return out.sort((a, b) => b.level - a.level).slice(0, MAX_CROSSINGS)
}

/**
 * Everything this screen says, recomputed from the log.
 *
 * The "before" picture is derived from the attempts that were on disk when the
 * match kicked off, at the moment it kicked off — the same reading the match
 * itself froze its questions against. Deriving it at *now* instead would count
 * three weeks of rust as though he had burned it off during the match, and the
 * screen would hand him a rise he had not played for.
 */
export function summarise(attempts: readonly Attempt[], matchId: string): Summary {
  const played = attempts.filter((a) => a.matchId === matchId).sort(byId)
  const first = played[0]
  // Everything that happened before this match's first answer, in the order
  // the ratings walk the log: by time, with the id breaking a same-millisecond
  // tie. This used to compare ids alone, which was fine while every id was
  // minted here — and wrong the day a second device joined: an attempt pulled
  // from the iPad carries an id like `ipad-a000042`, which sorts after every
  // local `a…` id however long ago it happened, so a synced month of history
  // vanished from the "before" card and turned up as though it were played
  // after this match.
  const earlier =
    first === undefined ? [...attempts] : attempts.filter((a) => a !== first && byTime(a, first) < 0)
  const kickoff = first?.at ?? Date.now()
  const whistle = played[played.length - 1]?.at ?? kickoff

  const beforeRatings = deriveRatings(earlier, kickoff)
  const beforeCard = deriveCard(beforeRatings, earlier, kickoff)

  const all = [...earlier, ...played]
  const afterRatings = deriveRatings(all, whistle)
  const afterCard = deriveCard(afterRatings, all, whistle)

  const moves: StatMove[] = []
  for (const stat of CARD_STATS) {
    const from = whole(beforeCard[stat])
    const to = whole(afterCard[stat])
    if (from !== to) moves.push({ stat, from, to })
  }
  moves.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))

  const rises = moves.filter((m) => m.to > m.from)
  const overallBefore = deriveOverall(beforeCard)
  const overallAfter = deriveOverall(afterCard)

  return {
    played,
    courage: deriveCourage(played),
    moves,
    rise: rises[0] ?? null,
    overallFrom: Math.round(overallBefore),
    overallTo: Math.round(overallAfter),
    rankFrom: deriveWorldRank(overallBefore),
    rankTo: deriveWorldRank(overallAfter),
    climbed: overallAfter > overallBefore && rises.length > 0,
    crossings: crossings(played, earlier),
    rustBurnedOn: rustBurnedOn(played, beforeRatings, afterRatings),
  }
}

// ---------------------------------------------------------------------------
// Saying it

const WORDS = ['no', 'once', 'twice', 'three times', 'four times', 'five times', 'six times']

/** `three times`, or `9 times` once the words stop being shorter than the digits. */
export const times = (n: number): string => WORDS[n] ?? `${n} times`

// Up to fourteen, because fourteen is every question in a match and a child who
// has had a rough afternoon should not be the one person the words run out for.
const COUNTS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
]

const count = (n: number): string => COUNTS[n] ?? String(n)

/**
 * How long ago something happened, in words a ten-year-old uses.
 *
 * Only ever as precise as it can honestly be. "Three weeks ago this beat you" is
 * the line this exists for, and it must not be said about something that
 * happened on Tuesday.
 */
export function agoLabel(elapsedMs: number): string {
  const days = Math.floor(Math.max(0, elapsedMs) / DAY_MS)
  if (days < 1) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${count(days)} days ago`
  const weeks = Math.round(days / 7)
  if (weeks <= 8) return `${count(weeks)} weeks ago`
  const months = Math.round(days / 30)
  return months <= 1 ? 'a month ago' : `${count(months)} months ago`
}

/** Lowercase phrases, used at the front of a sentence. */
const opening = (phrase: string): string => phrase.charAt(0).toUpperCase() + phrase.slice(1)

/**
 * The honest line about the result.
 *
 * Carried over from the match's own full-time card, word for word. A loss is a
 * loss: "edged it" is only ever said when they actually edged it, because a
 * child beaten 4–0 and told it was close knows perfectly well that it was not,
 * and after that none of the rest of what this game tells him about himself is
 * worth anything either.
 */
export function verdictFor(us: number, them: number, opponent: string): string {
  if (us > them) return `That’s the win. ${opponent} beaten.`
  if (us === them) return 'A point each, and they knew they’d been in a game.'
  if (them - us === 1) return `${opponent} edged it — and you made them work for every bit of it.`
  return `${opponent} took that one. You were still going at them at the end.`
}

/**
 * The line that carries the whole promise.
 *
 * Only ever said about a result that was not a win, because a win is its own
 * headline and does not need the rating to justify it. The result is still
 * stated first and stated plainly — the rise is the point of the sentence, not
 * a way of avoiding the score.
 *
 * The reason for the rise gets two versions, because it is not always the same
 * reason. Against a side rated above him it really is "you played above yourself
 * against a better team", which is both true and the most useful thing anybody
 * could tell him. Against a side he outrates it is not, and claiming it would be
 * flattery — so the sentence changes to what actually happened.
 */
export function climbLine(opponent: Opponent, us: number, them: number, mine: number): string {
  const took =
    us < them ? `${opponent.name} took that one.` : `${opponent.name} held you to a draw.`

  const why =
    opponent.rating > mine
      ? `you played above yourself against a side rated ${opponent.rating}`
      : 'the ones you got right were pitched above where you’re rated'

  return `${took} You still came off that pitch rated higher than you walked on, because ${why} — and the rankings count that whatever the score said.`
}

// ---------------------------------------------------------------------------

export interface PostMatchProps {
  matchId: string
  opponent: Opponent
  /** `[us, them]` at the whistle. */
  score: readonly [number, number]
  /**
   * The question behind each attempt this match wrote, by the id the store
   * minted for it. The film room shows the real question and its real working;
   * without this it says so rather than inventing one.
   */
  questions?: ReadonlyMap<string, Item>
  /**
   * What just happened to the World Cup run, if this match was part of one.
   * `undefined` for every ordinary exhibition match — most of them — in
   * which case nothing below changes at all.
   */
  campaignOutcome?: CampaignOutcome
  onDone?: () => void
}

export function PostMatch({ matchId, opponent, score, questions, campaignOutcome, onDone }: PostMatchProps) {
  const attempts = useAttempts()
  const country = useCountry()
  /** Frozen on mount, so "three weeks ago" cannot tick over while he reads it. */
  const [now] = useState(() => Date.now())
  const [film, setFilm] = useState(false)

  const summary = useMemo(() => summarise(attempts, matchId), [attempts, matchId])

  if (film) {
    return (
      <FilmRoom
        matchId={matchId}
        opponentName={opponent.name}
        questions={questions}
        onBack={() => setFilm(false)}
      />
    )
  }

  const [us, them] = score
  const ourName = country?.name ?? 'Your team'
  const missed = summary.played.filter((a) => !a.correct).length
  // A win is its own headline. Anything else that still lifted the rating is
  // led with, because being told you climbed is the whole promise and it is
  // worth nothing said quietly underneath a scoreline.
  const won = us > them

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header>
          <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Full time</p>
          <p data-testid="scoreline" className="mt-1 text-3xl leading-tight font-black">
            {ourName} {us}–{them} {opponent.name}
          </p>
        </header>

        {/* The rise goes above everything, including the verdict, whenever
            losing and climbing happened at the same time. That ordering is the
            entire point of the screen. */}
        {summary.climbed && !won ? (
          <ClimbCard summary={summary} opponent={opponent} us={us} them={them} />
        ) : (
          <p data-testid="verdict" className="text-[15px] leading-relaxed text-white/75">
            {verdictFor(us, them, opponent.name)}
          </p>
        )}

        <Moved summary={summary} climbed={summary.climbed && !won} />

        {summary.rustBurnedOn !== null && <RustCard standardId={summary.rustBurnedOn} />}

        <CourageCard courage={summary.courage} />

        {summary.crossings.map((crossing) => (
          <CrossedCard key={crossing.standardId} crossing={crossing} now={now} />
        ))}

        {/*
          Appended after everything above rather than woven into it, and
          deliberately never touching `climbed`/`won`/`verdictFor` — the rule
          that a loss leads with the rating rise applies to every match
          equally, campaign or not, and this card exists precisely so that
          rule never has to know campaigns exist. What just happened to the
          run is news on top of the match, not a replacement for any of it.
        */}
        {campaignOutcome !== undefined && <CampaignNewsCard outcome={campaignOutcome} />}

        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-snug text-white/55">
            {missed === 0
              ? 'Nothing got away from you out there. Have a look anyway if you fancy it — there’s no clock in the film room.'
              : missed === 1
                ? 'One ball got away out there. Watch it back whenever you like — there’s no clock in the film room, and you can skip it.'
                : `${opening(count(missed))} balls got away out there. Watch them back whenever you like — there’s no clock in the film room, and you can skip it.`}
          </p>
          <motion.button
            type="button"
            onClick={() => setFilm(true)}
            whileTap={{ scale: 0.97 }}
            className="h-14 w-full rounded-2xl font-bold text-white/85 ring-1 ring-white/25 active:bg-white/10"
          >
            Film room
          </motion.button>
          <motion.button
            type="button"
            onClick={onDone}
            whileTap={{ scale: 0.97 }}
            className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
          >
            Head back
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ClimbCard({
  summary,
  opponent,
  us,
  them,
}: {
  summary: Summary
  opponent: Opponent
  us: number
  them: number
}) {
  const rise = summary.rise!
  const labels = STAT_LABELS[rise.stat]

  return (
    <motion.section
      data-testid="headline"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl bg-gold/12 p-5 ring-1 ring-gold/40"
    >
      <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
        Your rating went up
      </p>

      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="text-sm font-black tracking-widest text-gold">{rise.stat}</span>
        <span className="text-xl font-bold text-white/45">{rise.from}</span>
        <span className="text-white/40">&rarr;</span>
        <span className="text-4xl leading-none font-black">{rise.to}</span>
        <span className="text-lg font-bold text-gold">+{rise.to - rise.from}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-white/50">{labels.soccer}</p>

      <p className="mt-3 text-[15px] leading-relaxed text-white/85">
        {climbLine(opponent, us, them, summary.overallFrom)}
      </p>

      {summary.rankTo < summary.rankFrom && (
        <p className="mt-2 text-[15px] leading-relaxed font-bold text-gold">
          {`#${summary.rankFrom} in the world up to #${summary.rankTo}.`}
        </p>
      )}
    </motion.section>
  )
}

// ---------------------------------------------------------------------------

function Moved({ summary, climbed }: { summary: Summary; climbed: boolean }) {
  const { moves, overallFrom, overallTo, rankFrom, rankTo } = summary
  const overallMoved = overallFrom !== overallTo

  return (
    <section data-testid="moved">
      <p className="text-[11px] font-bold tracking-[0.15em] text-white/40 uppercase">What moved</p>

      {moves.length === 0 && !overallMoved ? (
        <p className="mt-2 text-[15px] leading-relaxed text-white/75">
          Nothing turned over a whole point this time. That’s fourteen questions, not a season —
          it all still counts, and it moves.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-white/10">
          {overallMoved && (
            <Row
              key="overall"
              tag="OVR"
              name="Overall"
              from={overallFrom}
              to={overallTo}
            />
          )}
          {moves.map((move) => (
            <Row
              key={move.stat}
              tag={move.stat}
              name={STAT_LABELS[move.stat].soccer}
              from={move.from}
              to={move.to}
            />
          ))}
        </ul>
      )}

      {rankTo !== rankFrom && !(climbed && rankTo < rankFrom) && (
        <p className="mt-2 text-[13px] font-semibold text-white/60">
          {rankTo < rankFrom
            ? `#${rankFrom} in the world up to #${rankTo}.`
            : `#${rankFrom} in the world, now #${rankTo}.`}
        </p>
      )}
    </section>
  )
}

/**
 * One line of movement.
 *
 * A drop is drawn exactly like a climb — same weight, same colour, no red
 * anywhere. The number is honest and that is enough; a stat rendered in alarm
 * colours is the game telling a child who already braces for bad news that he
 * was right to brace.
 */
function Row({ tag, name, from, to }: { tag: string; name: string; from: number; to: number }) {
  const up = to > from

  return (
    <li className="flex items-baseline gap-3 py-2">
      <span className="w-9 shrink-0 text-sm font-black tracking-widest text-gold">{tag}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
      <span className="text-base font-bold text-white/45">{from}</span>
      <span className="text-white/40">&rarr;</span>
      <span className="text-2xl leading-none font-black">{to}</span>
      <span className="w-7 text-sm font-bold text-white/70">
        {up ? `+${to - from}` : `−${from - to}`}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------

/**
 * News that a topic shook some rust off this match.
 *
 * Says what happened — some came off, out there, tonight — and never why
 * there was any to begin with. Silent on how much, silent on how long it took
 * to build up: the only promise this card makes is the one the mechanic
 * already keeps, that it comes off fast.
 */
function RustCard({ standardId }: { standardId: string }) {
  const topic = LABELS_BY_STANDARD[standardId] ?? standardId
  return (
    <section
      data-testid="rust-burned"
      className="rounded-2xl bg-gold/12 p-4 ring-1 ring-gold/30"
    >
      <p className="text-[11px] font-bold tracking-[0.15em] text-gold/80 uppercase">
        Shaking off the rust
      </p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
        {topic} had some rust on it, and some of that came off out there. It never takes long.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------

/**
 * The bravery count, on its own terms.
 *
 * Not one word in here about whether any of them went in, and no ratio of tried
 * to scored. The record counted an overhead kick the instant he chose it, and
 * this is the screen saying so out loud a second time.
 */
function CourageCard({ courage }: { courage: Courage }) {
  const hard = courage.hardShotsAttempted
  const won = courage.tackleBacksWon
  if (hard === 0 && won === 0) return null

  return (
    <section
      data-testid="courage"
      className="rounded-2xl bg-gold/12 p-4 ring-1 ring-gold/30"
    >
      <p className="text-[11px] font-bold tracking-[0.15em] text-gold/80 uppercase">
        On your record
      </p>
      {hard > 0 && (
        <p className="mt-1.5 text-[15px] leading-relaxed font-bold text-gold">
          {hard === 1
            ? 'You went for the hard ball once out there. It counted the moment you chose it.'
            : hard === 2
              ? 'You went for the hard ball twice out there. Both of them counted the moment you chose it.'
              : `You went for the hard ball ${times(hard)} out there. Every one of them counted the moment you chose it.`}
        </p>
      )}
      {won > 0 && (
        <p className="mt-1.5 text-[15px] leading-relaxed font-bold text-gold">
          {hard > 0 ? 'And you' : 'You'} won the ball straight back {times(won)} after it came
          loose.
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

/**
 * News about the World Cup run, on top of the match itself.
 *
 * Same visual weight as `CourageCard` on purpose — this is not a verdict on
 * the match, it is a second, separate thing that happened alongside it, and
 * it reads that way whether the run just ended or just moved on. All the
 * wording lives in `campaignCopy.ts`, tested there for the one rule that
 * matters most here: elimination reads as the run ending, never as him
 * losing something, and the word "wrong" appears nowhere in it.
 */
function CampaignNewsCard({ outcome }: { outcome: CampaignOutcome }) {
  const { heading, body } = campaignCardCopy(outcome)

  return (
    <section data-testid="campaign-news" className="rounded-2xl bg-gold/12 p-4 ring-1 ring-gold/30">
      {/* The final's own unambiguous win, not every knockout round survived —
          `docs/art/placement.md` reserves this file for a win nothing else
          could put a shadow over, and "advanced to the semi-final" still has
          a next match riding on it in a way lifting the cup does not. */}
      {outcome.kind === 'champion' && (
        <Character name="rion-celebration" className="mx-auto mb-2 block h-28 w-auto" />
      )}
      <p className="text-[11px] font-bold tracking-[0.15em] text-gold/80 uppercase">World Cup</p>
      <p className="mt-1.5 text-base font-black text-gold">{heading}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-white/85">{body}</p>
    </section>
  )
}

// ---------------------------------------------------------------------------

function CrossedCard({ crossing, now }: { crossing: Crossing; now: number }) {
  const topic = LABELS_BY_STANDARD[crossing.standardId] ?? crossing.standardId

  return (
    <section data-testid="crossed" className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
      <p className="text-sm font-black text-gold">
        {`${opening(agoLabel(now - crossing.when))}, this one beat you.`}
      </p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
        {`${topic}, and no easier than the one that got you then. You put it away today.`}
      </p>
    </section>
  )
}
