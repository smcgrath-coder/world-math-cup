/**
 * What sync needs from a backend — nothing more, and specifically nothing
 * Supabase-shaped.
 *
 * `syncEngine.ts` is written entirely against this interface, never against
 * `@supabase/supabase-js` directly. Two things fall out of that: the
 * orchestration logic (what to push, what to pull, when country/settings win
 * a last-write-wins race) is testable with an in-memory fake and no network,
 * a real project, or credentials at all — see `syncEngine.test.ts` — and the
 * one file that *does* know about Supabase (`supabaseTransport.ts`) is small
 * enough to read in one sitting and has nothing to test beyond "does it call
 * the right RPC with the right arguments."
 */

import type { Attempt } from '../store/types'
import type { RemoteRow } from './attemptMerge'

/** The two fields that sync as one unit, last-write-wins. */
export interface ProfileSnapshot {
  /** JSON-shaped `Country | null` — the transport never inspects it, only stores and returns it. */
  country: unknown
  /** JSON-shaped `Settings`. */
  settings: unknown
  /** This device's clock at the moment it decided to push. See `link.ts` for why the client's own clock, not the server's. */
  updatedAt: number
}

export interface PlayerSummary {
  playerId: string
  name: string
}

export interface SyncTransport {
  /** A brand-new household with a fresh invite code. This device becomes its first member once it also creates a player. */
  createHousehold(): Promise<{ householdId: string; inviteCode: string }>
  /** `null` if no household has ever been created with this code — never throws for "not found", since that is an expected, common answer while a grown-up is typing. */
  joinHousehold(inviteCode: string): Promise<{ householdId: string } | null>
  listPlayers(householdId: string): Promise<PlayerSummary[]>
  createPlayer(householdId: string, name: string): Promise<{ playerId: string }>

  /**
   * The backend's current profile, or `null` if this player has never had one
   * pushed — a brand-new player row, or a player nobody has synced from yet.
   *
   * This exists as a separate operation from `pushProfile`, deliberately, so
   * `syncEngine` can pull-and-adopt without ever pushing anything. A device
   * that has made no local edit must be able to find out what the backend
   * has *without* offering up its own (possibly stale, possibly still-default)
   * values as a candidate — see the engine for why offering them unconditionally
   * is the bug that would let a freshly linked, never-touched device overwrite
   * a real save with its own defaults just by syncing first.
   */
  pullProfile(playerId: string): Promise<ProfileSnapshot | null>

  /**
   * Push a candidate profile; get back whichever one is now authoritative.
   *
   * If `candidate.updatedAt` is newer than what the backend holds, the backend
   * adopts it and echoes it straight back; if it is older — another device won
   * a race — the backend leaves its own row alone and returns *that* instead.
   * Either way the caller applies exactly what comes back, so both sides
   * converge in one call with no second "oh, mine actually lost" round trip.
   *
   * Callers must only invoke this when they have an actual local edit to
   * offer — see `pullProfile`.
   */
  pushProfile(playerId: string, candidate: ProfileSnapshot): Promise<ProfileSnapshot>

  /** Only ever this device's own locally-minted attempts — see `isLocallyMintedId`. Upserting an attempt already on the backend under this device must be a harmless no-op. */
  pushAttempts(playerId: string, deviceId: string, attempts: readonly Attempt[]): Promise<void>
  /** Every attempt for this player across every device that has ever pushed one, tagged with its origin so `foldRemoteAttempts` can namespace correctly. */
  pullAttempts(playerId: string): Promise<RemoteRow[]>
}
