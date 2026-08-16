/**
 * Fires `syncNow()` at the moments the handoff plan calls for — on launch,
 * after a session's flush, and when the tab regains focus — without any
 * screen having to know sync exists.
 *
 * "After a flush" is deliberately not wired into `Match`, `TrainingGround`
 * and `Tryout` individually. A flush is, definitionally, a write to the
 * store, so subscribing to the store's own pub/sub catches every flush (and
 * every other write) in the one place, and a new write path added later
 * gets this for free instead of needing to remember to wire it in too.
 *
 * Debounced rather than immediate: a match flushes several attempts close
 * together, and syncing after each one would mean firing a network request
 * mid-answer on every single question. `syncNow()` itself already no-ops
 * silently when sync is unconfigured or this device has never been linked,
 * so mounting this hook unconditionally in `AppShell` is cheap in the common
 * case (nobody has set up Supabase, or set up sync yet) and does nothing
 * observable to a child who never sees a spinner or an error either way.
 */

import { useEffect } from 'react'
import { getStore } from '../store/storage'
import { syncNow } from './syncNow'

const DEBOUNCE_MS = 4000

export function useOpportunisticSync(): void {
  useEffect(() => {
    void syncNow() // on launch

    let timer: ReturnType<typeof setTimeout> | null = null
    const debouncedSync = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void syncNow(), DEBOUNCE_MS)
    }

    const unsubscribe = getStore().subscribe(debouncedSync)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
