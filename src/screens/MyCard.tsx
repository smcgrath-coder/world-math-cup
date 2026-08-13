import { useMemo } from 'react'
import { PlayerCard } from '../components/PlayerCard'
import { useAttempts, useCountry } from '../store/useGameState'
import { deriveCard, deriveCourage, deriveRatings } from '../store/derive'

/**
 * The card tab: who he is, and what he has gone for.
 *
 * The card itself is the same component that scouts opponents, so his numbers
 * and Brazil's are directly comparable — that is the whole point of scouting.
 *
 * Underneath it sits the courage record, and what it deliberately does NOT say
 * is the important part. It counts the hard balls he went for and says nothing
 * about whether they went in, because the design pays for the attempt and not
 * the outcome: "taking the hard shot counts even when it misses" is a promise
 * the Coach makes out loud, and a card that quietly reported 1 of 2 would be
 * breaking it in small print.
 *
 * It also never mentions streaks or days off. For a child whose history is being
 * kept in from recess over unfinished work, a guilt-trip about a missed day is
 * the fastest way to lose him.
 */
export interface MyCardProps {
  onTrain?: () => void
}

export function MyCard({ onTrain }: MyCardProps) {
  const country = useCountry()
  const attempts = useAttempts()

  const { card, ratings, courage } = useMemo(() => {
    const now = Date.now()
    const derived = deriveRatings(attempts, now)
    return {
      ratings: derived,
      card: deriveCard(derived, attempts, now),
      courage: deriveCourage(attempts),
    }
  }, [attempts])

  if (!country) return null

  const wentFor = courage.hardShotsAttempted
  const wonBack = courage.tackleBacksWon
  const nothingYet = wentFor === 0 && courage.tackleBacksFaced === 0

  return (
    <div className="flex min-h-full flex-col items-center gap-5 bg-pitch-dark px-5 py-6 text-white">
      <PlayerCard country={country} card={card} ratings={ratings} />

      <section
        data-testid="courage"
        className="w-full max-w-sm rounded-2xl bg-black/25 p-4 ring-1 ring-white/10"
      >
        <h2 className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Your record</h2>

        {nothingYet ? (
          <p className="mt-2 text-[15px] leading-relaxed text-white/70">
            Nothing on here yet. It fills up the first time you go for something hard.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5 text-[15px] leading-relaxed">
            <p>
              You went for <strong className="text-lg font-black text-gold">{wentFor}</strong> hard
              {wentFor === 1 ? ' ball' : ' balls'}.
            </p>
            <p>
              You won <strong className="text-lg font-black text-gold">{wonBack}</strong> back.
            </p>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onTrain}
        className="w-full max-w-sm rounded-2xl bg-gold px-6 py-4 text-lg font-black text-pitch-dark"
      >
        Training ground
      </button>
    </div>
  )
}
