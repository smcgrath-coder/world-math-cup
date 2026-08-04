import { useCountry } from './store/useGameState'
import { CountryCreator } from './screens/CountryCreator'

/**
 * Temporary root. The real shell — tabs, try-out, training, match — arrives in
 * Task 21. This exists now so the country creator can be seen and driven in a
 * browser, which is the only way to judge whether it is any good.
 */
function App() {
  const country = useCountry()

  if (!country) return <CountryCreator />

  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm uppercase tracking-widest text-slate-500">Country created</p>
      <h1 className="text-3xl font-bold">{country.name}</h1>
      <p className="text-slate-500">The rest of the game arrives in the tasks after this one.</p>
    </div>
  )
}

export default App
