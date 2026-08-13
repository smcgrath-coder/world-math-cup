import { useState } from 'react'
import { useAttempts, useCountry, useSettings } from './store/useGameState'
import { CountryCreator } from './screens/CountryCreator'
import { CoachExplainer } from './screens/CoachExplainer'
import { Tryout } from './screens/Tryout'
import { TrainingGround } from './screens/TrainingGround'
import { Match } from './screens/Match'
import type { MatchResult } from './screens/Match'
import { PostMatch } from './screens/PostMatch'
import { PlayerCard } from './components/PlayerCard'
import { deriveRatings, deriveCard } from './store/derive'
import { OPPONENTS_BY_ID } from './data/opponents'
import type { Opponent } from './data/opponents'
import type { Stakes } from './engine/match'

/**
 * Temporary root. The real shell — tabs, training, match — arrives in Task 21.
 * This exists now so the screens built so far can be opened in a browser, which
 * is the only way to judge whether they are any good.
 *
 * The order is the one the design argues for and is not arbitrary: he builds a
 * country before he does any maths, so the first thing that happens is his; the
 * Coach explains the game before the try-out rather than after it; and the
 * try-out is what puts the first numbers on his card.
 */
function App() {
  const country = useCountry()
  const settings = useSettings()
  const attempts = useAttempts()

  /**
   * Both read from the store once, then owned here.
   *
   * Each screen writes its own completion — the explainer sets its flag, the
   * try-out appends its attempts — so deriving these from the store would
   * unmount the screen the instant it finished. The try-out ends on a card
   * reveal that is the whole point of having run it, and it must survive its own
   * last answer.
   */
  const [explained, setExplained] = useState(settings.coachExplainerSeen)
  const [scouted, setScouted] = useState(() => attempts.some((a) => a.context === 'tryout'))
  const [training, setTraining] = useState(false)
  const [fixture, setFixture] = useState<{ opponent: Opponent; stakes: Stakes; at: number } | null>(
    null,
  )
  /** The match just played, waiting to be written up. Survives the match unmounting. */
  const [result, setResult] = useState<MatchResult | null>(null)

  if (!country) return <CountryCreator />
  if (!explained) return <CoachExplainer onDone={() => setExplained(true)} />
  if (!scouted) return <Tryout onDone={() => setScouted(true)} />
  if (training) return <TrainingGround onDone={() => setTraining(false)} />
  if (result) {
    return (
      <PostMatch
        matchId={result.matchId}
        opponent={result.opponent}
        score={result.score}
        questions={result.questions}
        onDone={() => setResult(null)}
      />
    )
  }
  if (fixture) {
    return (
      <Match
        // A fresh match per fixture, and — this is the important half — the
        // *same* match for the whole of one. A match writes to the log as it
        // goes, so anything derived from the log in here (the attempt count was
        // the first attempt at this) changes mid-match, remounts the screen and
        // silently starts a second match over the top of the first.
        key={`${fixture.opponent.id}:${fixture.stakes}:${fixture.at}`}
        opponent={fixture.opponent}
        stakes={fixture.stakes}
        onDone={(played) => {
          setResult(played)
          setFixture(null)
        }}
      />
    )
  }

  const now = Date.now()
  const ratings = deriveRatings(attempts, now)
  const card = deriveCard(ratings, attempts, now)

  return (
    <div className="flex min-h-full flex-col items-center gap-6 bg-pitch-dark p-6 text-white">
      <PlayerCard country={country} card={card} ratings={ratings} />
      <button
        type="button"
        onClick={() => setTraining(true)}
        className="w-full max-w-sm rounded-2xl bg-gold px-6 py-4 text-lg font-bold text-pitch-dark"
      >
        Training Ground
      </button>
      <Fixtures onPlay={(opponent, stakes) => setFixture({ opponent, stakes, at: Date.now() })} />
    </div>
  )
}

/**
 * A stand-in for the fixture list.
 *
 * Nine sides spanning the roster, so both ends of every dial can be played
 * before Task 21 builds the real thing: Spain at 92 in a knockout is the hardest
 * the game gets, Curaçao at 56 in a friendly is the gentlest.
 */
const SHORTLIST = [
  'spain',
  'brazil',
  'argentina',
  'england',
  'japan',
  'panama',
  'iraq',
  'haiti',
  'curacao',
] as const

function Fixtures({ onPlay }: { onPlay: (opponent: Opponent, stakes: Stakes) => void }) {
  const [stakes, setStakes] = useState<Stakes>('friendly')

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Next match</p>
        <div className="flex gap-1.5">
          {(['friendly', 'knockout'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStakes(option)}
              className={
                stakes === option
                  ? 'rounded-full bg-gold px-3 py-1 text-xs font-black text-ink'
                  : 'rounded-full px-3 py-1 text-xs font-bold text-white/60 ring-1 ring-white/20'
              }
            >
              {option === 'friendly' ? 'Friendly' : 'Knockout'}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {SHORTLIST.map((id) => {
          const opponent = OPPONENTS_BY_ID[id]
          if (opponent === undefined) return null
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPlay(opponent, stakes)}
                className="flex w-full items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-left ring-1 ring-white/10 active:bg-black/40"
              >
                <span
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 rounded-full ring-2"
                  style={{ backgroundColor: opponent.kit[0], borderColor: opponent.kit[1] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{opponent.name}</span>
                  <span className="block text-xs text-white/55">
                    {'★'.repeat(opponent.stars)}
                    {opponent.stars > 0 ? ' · ' : ''}
                    tier {opponent.tier}
                  </span>
                </span>
                <span className="text-xl font-black">{opponent.rating}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default App
