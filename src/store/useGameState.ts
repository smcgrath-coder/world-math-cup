/**
 * React's view of the saved game.
 *
 * `useSyncExternalStore` over the store's own pub/sub, rather than a context
 * and a reducer, because the store has to be readable from outside React too —
 * the match state machine and the debug screen both talk to it directly — and
 * because tearing during a concurrent render would show a child a stale card.
 *
 * Every hook here returns a reference straight off the store's state object.
 * That is deliberate: `getSnapshot` must return the *same* value while nothing
 * has been written, or React re-renders in a loop. Nothing in this file may
 * build a new object or array on the way out. Anything derived — ratings, the
 * card, the world rank — is computed in the component from `useAttempts()`,
 * where a `useMemo` can hold it and `now` can be passed in explicitly.
 */

import { useSyncExternalStore } from 'react'
import { getStore } from './storage'
import type { Attempt } from './types'
import type { Country, GameState, Settings } from './storage'

function useStoreSnapshot<T>(select: (state: GameState) => T): T {
  const store = getStore()
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => select(store.getState()),
    () => select(store.getState()),
  )
}

export function useGameState(): GameState {
  return useStoreSnapshot((s) => s)
}

/** The append-only log. Stable by reference until something is appended. */
export function useAttempts(): Attempt[] {
  return useStoreSnapshot((s) => s.attempts)
}

/** Null until the country creator has run. */
export function useCountry(): Country | null {
  return useStoreSnapshot((s) => s.country)
}

export function useSettings(): Settings {
  return useStoreSnapshot((s) => s.settings)
}

export { getStore }
