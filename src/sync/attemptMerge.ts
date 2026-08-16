/**
 * Folding another device's attempts into this device's log, without ever
 * losing or duplicating one.
 *
 * The landmine this file exists to defuse: attempt ids are a local sequential
 * counter (`attemptIdFor` in `storage.ts`). Two devices playing independently
 * both mint `a000001`, `a000002`, ... for entirely different attempts. A sync
 * that merged by id alone would treat device B's `a000042` as an update to
 * device A's `a000042` and silently discard whichever one lost the race —
 * which is the single worst bug this app could have, on the exact feature
 * meant to protect a child's save.
 *
 * The fix: every attempt's *true* identity for merge purposes is
 * `(deviceId, localId)`, not `localId` alone. An attempt that already lives on
 * this device (it was minted here, or a previous sync already folded it in
 * under its final local id) keeps the id it has. An attempt arriving from
 * another device for the first time is relabelled `{deviceId}-{localId}`
 * before it ever touches the local log — so the two id spaces can never
 * collide, and the local counter (which only recognises the bare `a\d+`
 * pattern) never sees it and is never disturbed by it.
 *
 * Everything here is pure — no network, no storage, no React — so the
 * property tests in `attemptMerge.test.ts` can hammer it directly.
 */

import { validateAttempt } from '../store/storage'
import type { Attempt } from '../store/types'

/** One attempt as it arrives from the cloud, still carrying its origin. */
export interface RemoteRow {
  /** Which device minted this attempt. */
  deviceId: string
  /** The attempt exactly as its origin device wrote it — `attempt.id` is that device's *bare* local id, not yet relabelled. */
  attempt: Attempt
}

/**
 * The id this attempt should have in *this* device's local log.
 *
 * Our own device's rows bounce back from the cloud with the id they already
 * have here — relabelling them would create a duplicate of an attempt we
 * already hold. Every other device's rows are namespaced by their origin, so
 * `ipad-a000042` and `laptop-a000042` are never mistaken for the same attempt.
 */
export function localIdFor(ownDeviceId: string, row: RemoteRow): string {
  return row.deviceId === ownDeviceId ? row.attempt.id : `${row.deviceId}-${row.attempt.id}`
}

/**
 * Fold remote rows into a local attempts array.
 *
 * Returns the **same array reference** when nothing changed, so a caller can
 * skip a store write (and the re-render it would cause) with a plain `===`
 * check — the common case on every sync after the first, once both devices
 * have already seen each other's history.
 *
 * Deduplication is by the *final* local id, computed once per row via
 * `localIdFor`, so re-running this on the same input is a no-op — sync is
 * opportunistic and will call this far more often than the data actually
 * changes, and it must never duplicate an attempt just because it ran twice.
 *
 * Every row is re-validated with the exact function that guards a write
 * coming off local disk. A corrupt cloud row — a truncated write from another
 * device, a hand-edited table row, anything — is dropped rather than trusted,
 * for the same reason a corrupt local attempt is: a bad `difficulty` produces
 * a `NaN` rating that poisons every stat downstream, and nothing that reaches
 * this log gets to skip that gate just because it arrived over the network
 * instead of from disk.
 */
export function foldRemoteAttempts(
  existing: readonly Attempt[],
  ownDeviceId: string,
  rows: readonly RemoteRow[],
): readonly Attempt[] {
  const seen = new Set(existing.map((a) => a.id))
  const additions: Attempt[] = []

  for (const row of rows) {
    const id = localIdFor(ownDeviceId, row)
    if (seen.has(id)) continue

    const validated = validateAttempt({ ...row.attempt, id })
    if (validated === null) continue

    seen.add(id)
    additions.push(validated)
  }

  if (additions.length === 0) return existing
  return [...existing, ...additions]
}
