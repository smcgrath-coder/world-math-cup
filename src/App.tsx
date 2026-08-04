import { useState } from 'react'
import { useCountry, useSettings } from './store/useGameState'
import { CountryCreator } from './screens/CountryCreator'
import { CoachExplainer } from './screens/CoachExplainer'
import { PlayerCard } from './components/PlayerCard'
import { deriveRatings, deriveCard } from './store/derive'
import { OPPONENTS_BY_ID } from './data/opponents'

/**
 * Temporary root. The real shell — tabs, try-out, training, match — arrives in
 * Task 21. This exists now so the screens built so far can be opened in a
 * browser, which is the only way to judge whether they are any good.
 *
 * The order is the one the design argues for and is not arbitrary: he builds a
 * country before he does any maths, so the first thing that happens is his, and
 * the Coach explains the game before the try-out rather than after it.
 */
function App() {
  const country = useCountry()
  const settings = useSettings()
  /**
   * Read once, then owned here.
   *
   * The explainer writes the flag itself, so deriving this from the store would
   * unmount the screen the moment its last button was pressed — fine for the
   * explainer, fatal for anything that ends on something worth looking at.
   */
  const [explained, setExplained] = useState(settings.coachExplainerSeen)

  if (!country) return <CountryCreator />
  if (!explained) return <CoachExplainer onDone={() => setExplained(true)} />

  const now = Date.now()
  const ratings = deriveRatings([], now)
  const card = deriveCard(ratings, [], now)

  return (
    <div className="min-h-full flex flex-col items-center gap-8 p-6">
      <PlayerCard country={country} card={card} ratings={ratings} />
      <PlayerCard opponent={OPPONENTS_BY_ID.brazil!} />
    </div>
  )
}

export default App
