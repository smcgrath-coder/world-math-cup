/**
 * The one function the rest of the app calls to make a sync happen.
 *
 * Wires together everything `syncEngine.runSync` needs — the real Supabase
 * transport, this device's id, the household/player link, and the real
 * `GameStore` adapter — read fresh on every call rather than held in module
 * state, so a link created *during* this session (the household/player UI)
 * is picked up on the very next opportunistic tick without anything having
 * to know that happened.
 *
 * Never throws, matching `runSync` itself: a sync failure is something a
 * grown-up might see on the "last synced" line and nothing else. The child
 * playing never sees a spinner, an error, or any sign the network exists at
 * all — see the handoff plan's "offline-first, non-negotiable" rule.
 */

import { runSync } from './syncEngine'
import type { RunSyncResult } from './syncEngine'
import { createSupabaseTransport } from './supabaseTransport'
import { createGameStoreAdapter } from './storeAdapter'
import { getSyncEnv } from './config'
import { getDeviceId } from './deviceId'
import { getLink, setLastSyncedAt } from './link'

export type SyncOutcome =
  | RunSyncResult
  | { ok: false; error: 'not configured' }
  | { ok: false; error: 'not linked' }

export async function syncNow(): Promise<SyncOutcome> {
  const env = getSyncEnv()
  if (env === null) return { ok: false, error: 'not configured' }

  const link = getLink()
  if (link === null) return { ok: false, error: 'not linked' }

  const transport = createSupabaseTransport(env.url, env.anonKey)
  const result = await runSync(transport, getDeviceId(), link, createGameStoreAdapter())
  if (result.ok) setLastSyncedAt(Date.now())
  return result
}
