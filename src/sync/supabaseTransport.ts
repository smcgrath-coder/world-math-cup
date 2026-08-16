/**
 * The one file in this app that knows Supabase exists.
 *
 * A thin translation layer, on purpose: every method here does exactly one
 * `.rpc(...)` call and reshapes its answer into the `SyncTransport` contract.
 * All of the actual *logic* — what counts as a genuine local edit, how a
 * corrupt row is handled, when it is safe to push — lives in `syncEngine.ts`
 * against the interface, and is tested there without this file, a network, or
 * a Supabase project ever entering the picture.
 *
 * Every operation is an RPC call to a `security definer` function in
 * `supabase/schema.sql`, never a direct `.from(table)` read or write. The
 * schema enables RLS with no policies on every table, so a direct call would
 * simply fail — the functions are the entire access surface, deliberately.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RemoteRow } from './attemptMerge'
import type { PlayerSummary, ProfileSnapshot, SyncTransport } from './transport'
import type { Attempt } from '../store/types'

/** Narrower than `PostgrestError`, and all `syncEngine` ever needs: a message worth putting in the "last synced" line. */
function rpcError(fn: string, error: { message: string } | null): Error | null {
  return error ? new Error(`${fn}: ${error.message}`) : null
}

export function createSupabaseTransport(url: string, anonKey: string): SyncTransport {
  const client: SupabaseClient = createClient(url, anonKey)

  return {
    async createHousehold() {
      const { data, error } = await client.rpc('wmc_create_household')
      const err = rpcError('wmc_create_household', error)
      if (err) throw err
      const row = (data as { household_id: string; invite_code: string }[])[0]
      if (!row) throw new Error('wmc_create_household: no row returned')
      return { householdId: row.household_id, inviteCode: row.invite_code }
    },

    async joinHousehold(inviteCode) {
      const { data, error } = await client.rpc('wmc_join_household', { p_code: inviteCode })
      const err = rpcError('wmc_join_household', error)
      if (err) throw err
      return data ? { householdId: data as string } : null
    },

    async listPlayers(householdId) {
      const { data, error } = await client.rpc('wmc_list_players', { p_household_id: householdId })
      const err = rpcError('wmc_list_players', error)
      if (err) throw err
      return (data as { player_id: string; name: string }[]).map(
        (r): PlayerSummary => ({ playerId: r.player_id, name: r.name }),
      )
    },

    async createPlayer(householdId, name) {
      const { data, error } = await client.rpc('wmc_create_player', {
        p_household_id: householdId,
        p_name: name,
      })
      const err = rpcError('wmc_create_player', error)
      if (err) throw err
      return { playerId: data as string }
    },

    async pullProfile(playerId) {
      const { data, error } = await client.rpc('wmc_pull_profile', { p_player_id: playerId })
      const err = rpcError('wmc_pull_profile', error)
      if (err) throw err
      const row = (data as { country: unknown; settings: unknown; updated_at: number }[])[0]
      if (!row) return null
      return { country: row.country, settings: row.settings, updatedAt: row.updated_at }
    },

    async pushProfile(playerId, candidate) {
      const { data, error } = await client.rpc('wmc_push_profile', {
        p_player_id: playerId,
        p_country: candidate.country,
        p_settings: candidate.settings,
        p_updated_at: candidate.updatedAt,
      })
      const err = rpcError('wmc_push_profile', error)
      if (err) throw err
      const row = (data as { country: unknown; settings: unknown; updated_at: number }[])[0]
      if (!row) throw new Error('wmc_push_profile: no row returned')
      const winner: ProfileSnapshot = {
        country: row.country,
        settings: row.settings,
        updatedAt: row.updated_at,
      }
      return winner
    },

    async pushAttempts(playerId, deviceId, batch) {
      if (batch.length === 0) return
      const { error } = await client.rpc('wmc_push_attempts', {
        p_player_id: playerId,
        p_device_id: deviceId,
        p_attempts: batch as unknown as Attempt[],
      })
      const err = rpcError('wmc_push_attempts', error)
      if (err) throw err
    },

    async pullAttempts(playerId) {
      const { data, error } = await client.rpc('wmc_pull_attempts', { p_player_id: playerId })
      const err = rpcError('wmc_pull_attempts', error)
      if (err) throw err
      return (data as { device_id: string; attempt: Attempt }[]).map(
        (r): RemoteRow => ({ deviceId: r.device_id, attempt: r.attempt }),
      )
    },
  }
}
