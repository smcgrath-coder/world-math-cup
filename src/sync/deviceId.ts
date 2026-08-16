/**
 * The label this device puts on the attempts it mints.
 *
 * `storage.ts`'s attempt ids are a local sequential counter (`a000042`), which
 * is fine until a second device starts minting its own — then two devices
 * independently produce `a000042` for two different attempts. The device id is
 * how sync tells those apart: an attempt pulled from another device is
 * re-labelled `{deviceId}-{localId}` on the way in, so the two id spaces never
 * collide. See `attemptMerge.ts` for where that actually happens.
 *
 * Generated once, kept forever, never synced itself — it is a property of the
 * hardware, not of the save.
 */

const KEY = 'wmc_device_id_v1'

/** Short, and deliberately not from the same alphabet as attempt ids (`a\d+`), so the two id spaces can never collide even by coincidence. */
function randomDeviceId(): string {
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // No Web Crypto (old jsdom, ancient Safari). Not cryptographic — a
    // collision here costs nothing worse than two devices sharing a sync
    // namespace, never a wrong answer or a lost attempt.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return 'd' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

let cached: string | null = null

export function getDeviceId(): string {
  if (cached !== null) return cached
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) {
      cached = existing
      return existing
    }
    const created = randomDeviceId()
    localStorage.setItem(KEY, created)
    cached = created
    return created
  } catch {
    // Storage unavailable (private mode, disabled). Sync cannot persist a
    // device id, so fall back to one that lives only for this session — sync
    // simply will not be durable here, which is the same failure mode as the
    // save itself in this browser.
    if (cached === null) cached = randomDeviceId()
    return cached
  }
}

export function resetDeviceIdForTest(): void {
  cached = null
}
