import { useMemo, useState } from 'react'
import { PlayerCard } from '../components/PlayerCard'
import { STAT_LABELS, clampStat, opponentCard } from '../components/stats'
import { OPPONENTS } from '../data/opponents'
import type { Opponent, Tier } from '../data/opponents'
import {
  CARD_STATS,
  deriveCard,
  deriveOverall,
  deriveRatings,
  deriveWorldRank,
} from '../store/derive'
import type { Attempt, Card } from '../store/types'
import type { CardStat } from '../curriculum/standards.generated'
import { useAttempts, useCountry } from '../store/useGameState'
import { makeRng } from '../engine/items/rng'
import type { Stakes } from '../engine/match'

/** Sides offered on the front page. Enough for a real choice, few enough to read. */
export const FIXTURE_COUNT = 5

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Which day's fixtures to show.
 *
 * Holds all day so the list is not a slot machine he can reroll by leaving and
 * coming back, and turns over after each match so the side he just played is not
 * still sitting at the top of the page.
 */
export function fixtureSeed(now: number, matchesPlayed: number): number {
  return Math.floor(now / DAY_MS) * 1000 + matchesPlayed
}

/** Matches played, counted as matches rather than as questions answered. */
export function countMatches(attempts: readonly Attempt[]): number {
  const ids = new Set<string>()
  for (const attempt of attempts) {
    if (attempt.matchId !== undefined) ids.add(attempt.matchId)
  }
  return ids.size
}

/**
 * The stat the second card is furthest ahead on, or null if it is not ahead
 * anywhere.
 *
 * Used both ways round: to warn him where an opponent will hurt him, and to
 * point out where he already has them.
 */
export function biggestGap(
  mine: Card,
  theirs: Card,
): { stat: CardStat; mine: number; theirs: number } | null {
  let best: { stat: CardStat; mine: number; theirs: number; gap: number } | null = null
  for (const stat of CARD_STATS) {
    const gap = theirs[stat] - mine[stat]
    if (gap <= 0) continue
    if (best === null || gap > best.gap) {
      best = { stat, mine: mine[stat], theirs: theirs[stat], gap }
    }
  }
  return best === null ? null : { stat: best.stat, mine: best.mine, theirs: best.theirs }
}

/**
 * Five sides to choose between: somebody he should beat, a couple of real games,
 * and somebody who will take him apart.
 *
 * The bottom of the list matters as much as the top. A child who freezes in
 * front of hard things needs a game he knows he can win to be one tap away, and
 * a child who only ever plays those never finds out he has improved.
 */
export function suggestFixtures(overall: number, seed: number): Opponent[] {
  const rng = makeRng(seed)
  const weakestFirst = [...OPPONENTS].sort((a, b) => a.rating - b.rating)
  const strongestFirst = [...weakestFirst].reverse()
  const chosen: Opponent[] = []

  const take = (band: Opponent[], fallback: Opponent[]): void => {
    const free = (pool: Opponent[]) => pool.filter((o) => !chosen.includes(o))
    const pool = free(band).length > 0 ? free(band) : free(fallback)
    if (pool.length === 0) return
    chosen.push(pool[rng.int(0, pool.length - 1)]!)
  }

  // Somebody at or below his level. When nobody on the roster is weaker than he
  // is — a brand-new card sits at 50 and the gentlest side is 56 — fall back to
  // the gentlest sides rather than to the whole world, or "the one you should
  // beat" can come out as Spain.
  take(
    weakestFirst.filter((o) => o.rating <= overall),
    weakestFirst.slice(0, FIXTURE_COUNT),
  )
  take(
    weakestFirst.filter((o) => Math.abs(o.rating - overall) <= 4),
    weakestFirst,
  )
  take(
    weakestFirst.filter((o) => o.rating > overall + 4 && o.rating <= overall + 14),
    weakestFirst,
  )
  // Somebody frightening. If he has climbed past everyone, the strongest sides
  // are as frightening as it gets.
  take(
    weakestFirst.filter((o) => o.rating >= overall + 15),
    strongestFirst.slice(0, FIXTURE_COUNT),
  )
  take(weakestFirst, weakestFirst)

  return chosen.sort((a, b) => a.rating - b.rating)
}

// ---------------------------------------------------------------------------

export interface PlayProps {
  onKickoff: (opponent: Opponent, stakes: Stakes) => void
  onTrain: () => void
}

export function Play({ onKickoff, onTrain }: PlayProps) {
  const country = useCountry()
  const attempts = useAttempts()
  const [scouting, setScouting] = useState<Opponent | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [byTier, setByTier] = useState(false)

  const { card, ratings, overall, rank, fixtures } = useMemo(() => {
    const now = Date.now()
    const derived = deriveRatings(attempts, now)
    const myCard = deriveCard(derived, attempts, now)
    const exact = deriveOverall(myCard)
    return {
      ratings: derived,
      card: myCard,
      overall: exact,
      rank: deriveWorldRank(exact),
      fixtures: suggestFixtures(exact, fixtureSeed(now, countMatches(attempts))),
    }
  }, [attempts])

  if (!country) return null

  if (scouting !== null) {
    return (
      <TeamSheet
        opponent={scouting}
        mine={card}
        myRatings={ratings}
        country={country}
        onBack={() => setScouting(null)}
        onTrain={onTrain}
        onKickoff={onKickoff}
      />
    )
  }

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <section data-testid="standing" className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
          <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">{country.name}</p>
          <p className="mt-1 text-2xl font-black">
            Overall {Math.round(clampStat(overall))} &middot; #{rank} in the world
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-gold uppercase">
            Who do you fancy?
          </h2>
          <ul className="flex flex-col gap-2">
            {fixtures.map((opponent) => (
              <li key={opponent.id}>
                <FixtureRow
                  opponent={opponent}
                  overall={overall}
                  testid="fixture"
                  onClick={() => setScouting(opponent)}
                />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
              The whole world
            </h2>
            <div className="flex gap-1.5">
              <Chip active={browsing && !byTier} onClick={() => { setBrowsing(true); setByTier(false) }}>
                Browse all
              </Chip>
              <Chip active={browsing && byTier} onClick={() => { setBrowsing(true); setByTier(true) }}>
                By tier
              </Chip>
            </div>
          </div>

          {browsing && (
            <div className="mt-3">
              {byTier ? (
                ([1, 2, 3, 4] as Tier[]).map((tier) => (
                  <div key={tier} className="mb-4">
                    <h3 className="mb-2 text-sm font-black">Tier {tier}</h3>
                    <RosterList
                      teams={ROSTER_BY_RATING.filter((o) => o.tier === tier)}
                      onScout={setScouting}
                    />
                  </div>
                ))
              ) : (
                <RosterList teams={ROSTER_BY_RATING} onScout={setScouting} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const ROSTER_BY_RATING = [...OPPONENTS].sort((a, b) => b.rating - a.rating)

function RosterList({
  teams,
  onScout,
}: {
  teams: readonly Opponent[]
  onScout: (opponent: Opponent) => void
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {teams.map((opponent) => (
        <li key={opponent.id}>
          <button
            type="button"
            data-testid="roster-row"
            onClick={() => onScout(opponent)}
            className="flex w-full items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-left ring-1 ring-white/10 active:bg-black/40"
          >
            <Swatch opponent={opponent} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{opponent.name}</span>
              <span className="block text-xs text-white/55">
                {opponent.stars > 0 && <span className="text-gold">{'★'.repeat(opponent.stars)} </span>}
                tier {opponent.tier}
                {!opponent.inWorldCup && ' · not in the 2026 field'}
              </span>
            </span>
            <span data-testid="roster-rating" className="text-lg font-black">
              {opponent.rating}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function FixtureRow({
  opponent,
  overall,
  testid,
  onClick,
}: {
  opponent: Opponent
  overall: number
  testid: string
  onClick: () => void
}) {
  const diff = Math.round(opponent.rating - clampStat(overall))
  const standing =
    Math.abs(diff) <= 2
      ? 'level with you'
      : diff > 0
        ? `${diff} above you`
        : `${Math.abs(diff)} below you`

  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-left ring-1 ring-white/10 active:bg-black/40"
    >
      <Swatch opponent={opponent} />
      <span className="min-w-0 flex-1">
        <span data-testid="fixture-name" className="block font-bold">
          {opponent.name}
        </span>
        <span className="block text-xs text-white/55">
          {opponent.stars > 0 && <span className="text-gold">{'★'.repeat(opponent.stars)} </span>}
          tier {opponent.tier} &middot; {standing}
        </span>
      </span>
      <span className="text-xl font-black">{opponent.rating}</span>
    </button>
  )
}

function TeamSheet({
  opponent,
  mine,
  myRatings,
  country,
  onBack,
  onTrain,
  onKickoff,
}: {
  opponent: Opponent
  mine: Card
  myRatings: Map<string, { rating: number; provisional: boolean; attempts: number }>
  country: NonNullable<ReturnType<typeof useCountry>>
  onBack: () => void
  onTrain: () => void
  onKickoff: (opponent: Opponent, stakes: Stakes) => void
}) {
  const [stakes, setStakes] = useState<Stakes>('friendly')
  const theirs = opponentCard(opponent)
  const threat = biggestGap(mine, theirs)
  const edge = biggestGap(theirs, mine)

  return (
    <div data-testid="team-sheet" className="min-h-full bg-pitch-dark px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h1 data-testid="sheet-name" className="text-2xl font-black">
            {opponent.name}
          </h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-full px-3 py-1.5 text-sm font-bold text-white/70 ring-1 ring-white/20 active:bg-white/10"
          >
            Back
          </button>
        </div>

        <p data-testid="gap" className="rounded-2xl bg-black/25 p-4 text-[15px] leading-relaxed">
          {threat === null ? (
            <>
              Nothing on their card is above yours. Their strongest is{' '}
              {STAT_LABELS[strongestOf(theirs)].maths.toLowerCase()} at{' '}
              {Math.round(theirs[strongestOf(theirs)])}.
            </>
          ) : (
            <>
              They will come at your{' '}
              <strong className="text-gold">{STAT_LABELS[threat.stat].soccer}</strong> —{' '}
              {STAT_LABELS[threat.stat].maths.toLowerCase()}. They are on{' '}
              {Math.round(threat.theirs)} there and you are on {Math.round(threat.mine)}.
            </>
          )}
          {edge !== null && (
            <>
              {' '}
              You have them on {STAT_LABELS[edge.stat].soccer.toLowerCase()}.
            </>
          )}
        </p>

        <PlayerCard opponent={opponent} />
        <PlayerCard country={country} card={mine} ratings={myRatings as never} />

        <div className="flex gap-1.5">
          {(['friendly', 'knockout'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStakes(option)}
              className={
                stakes === option
                  ? 'flex-1 rounded-full bg-gold px-3 py-2 text-sm font-black text-ink'
                  : 'flex-1 rounded-full px-3 py-2 text-sm font-bold text-white/60 ring-1 ring-white/20'
              }
            >
              {option === 'friendly' ? 'Friendly' : 'Knockout'}
            </button>
          ))}
        </div>

        <p data-testid="stakes-note" className="text-sm leading-relaxed text-white/70">
          {stakes === 'friendly'
            ? 'A friendly. They will sit off you a bit, and nothing is riding on it.'
            : 'Knockout rules: they kick off, they keep the ball until you properly clear it, and they will punish a bad spell. There is no tournament behind it yet — it is the harder game, on its own.'}
        </p>

        <button
          type="button"
          onClick={() => onKickoff(opponent, stakes)}
          className="w-full rounded-2xl bg-gold px-6 py-4 text-lg font-black text-pitch-dark"
        >
          Kick off
        </button>
        <button
          type="button"
          onClick={onTrain}
          className="w-full rounded-2xl bg-black/25 px-6 py-3 font-bold ring-1 ring-white/10"
        >
          Training ground first
        </button>
      </div>
    </div>
  )
}

function strongestOf(card: Card): CardStat {
  let best: CardStat = CARD_STATS[0]!
  for (const stat of CARD_STATS) if (card[stat] > card[best]) best = stat
  return best
}

function Swatch({ opponent }: { opponent: Opponent }) {
  return (
    <span
      aria-hidden="true"
      className="h-7 w-7 shrink-0 rounded-full ring-2"
      style={{ backgroundColor: opponent.kit[0], borderColor: opponent.kit[1] }}
    />
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-gold px-3 py-1 text-xs font-black text-ink'
          : 'rounded-full px-3 py-1 text-xs font-bold text-white/60 ring-1 ring-white/20'
      }
    >
      {children}
    </button>
  )
}
