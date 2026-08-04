import { useState } from 'react'
import { useAttempts, useCountry, useSettings } from './store/useGameState'
import { CountryCreator } from './screens/CountryCreator'
import { CoachExplainer } from './screens/CoachExplainer'
import { Tryout } from './screens/Tryout'
import { PlayerCard } from './components/PlayerCard'
import { deriveRatings, deriveCard } from './store/derive'
import { OPPONENTS_BY_ID } from './data/opponents'

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

  if (!country) return <CountryCreator />
  if (!explained) return <CoachExplainer onDone={() => setExplained(true)} />
  if (!scouted) return <Tryout onDone={() => setScouted(true)} />

  const now = Date.now()
  const ratings = deriveRatings(attempts, now)
  const card = deriveCard(ratings, attempts, now)

  return (
    <div className="flex min-h-full flex-col items-center gap-8 bg-pitch-dark p-6">
      <PlayerCard country={country} card={card} ratings={ratings} />
      <PlayerCard opponent={OPPONENTS_BY_ID.brazil!} />
    </div>
  )
}

export default App
