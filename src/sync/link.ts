/**
 * Which household and player *this device* is linked to, and what it last
 * synced.
 *
 * This is device configuration, not save data. It answers "who is this
 * device talking to on the network", the same way `deviceId.ts` answers
 * "which device is this" — neither is part of the game itself and neither
 * should ever be exported, imported, or reset by the save-management tools in
 * Settings, which operate purely on `GameState`.
 *
 * No link means no sync, forever, by construction: every function in
 * `syncEngine.ts` takes the link as a required argument rather than reaching
 * in here itself, so "there is no household configured" and "sync is
 * offline" are the same code path rather than two that have to agree.
 */

const LINK_KEY = 'wmc_link_v1'
const LAST_SYNCED_KEY = 'wmc_last_synced_v1'
const LAST_KNOWN_PROFILE_KEY = 'wmc_last_known_profile_v1'

export interface Link {
  householdId: string
  playerId: string
  /** Shown in Settings so linking a second device is a known, chosen act, not a mystery code to lose. */
  inviteCode: string
  playerName: string
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sync is best-effort by design; failing to remember a link is a sync
    // outage, not a save-corrupting event, so there is nothing to recover
    // here beyond leaving the previous value (if any) in place.
  }
}

function isLink(value: unknown): value is Link {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.householdId === 'string' &&
    v.householdId.length > 0 &&
    typeof v.playerId === 'string' &&
    v.playerId.length > 0 &&
    typeof v.inviteCode === 'string' &&
    typeof v.playerName === 'string'
  )
}

export function getLink(): Link | null {
  const raw = readJson<unknown>(LINK_KEY)
  return isLink(raw) ? raw : null
}

export function setLink(link: Link | null): void {
  if (link === null) {
    try {
      localStorage.removeItem(LINK_KEY)
    } catch {
      // As above — best effort.
    }
    return
  }
  writeJson(LINK_KEY, link)
}

/** When sync last completed successfully. Shown to a grown-up in Settings; never shown to Rion. */
export function getLastSyncedAt(): number | null {
  const raw = readJson<unknown>(LAST_SYNCED_KEY)
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

export function setLastSyncedAt(at: number): void {
  writeJson(LAST_SYNCED_KEY, at)
}

/** The (country, settings) pair as they stood the last time this device successfully talked to the backend, either direction. */
export interface KnownProfile {
  country: unknown
  settings: unknown
}

/**
 * What `syncEngine` last knew the profile to be — from a push it made, or a
 * pull it adopted, whichever happened most recently.
 *
 * This is the load-bearing piece of the whole profile-sync design, so it is
 * worth saying plainly what it is *for*: on every sync, the engine compares
 * the live local (country, settings) against this snapshot. Equal means
 * nothing has changed here since we last talked to the backend, so there is
 * nothing of ours worth offering — the engine only ever *pulls* in that case.
 * Different means a real local edit happened, so the engine pushes it.
 *
 * Without this check, a brand-new device — freshly linked, country still
 * `null`, settings still defaults — would have nothing to compare against and
 * could end up pushing those defaults as a "candidate" on its very first
 * sync. If that push happened to carry a timestamp newer than the real save's
 * last sync (which it almost always would, being the newest thing to run),
 * last-write-wins would hand the backend a brand-new device's blank slate in
 * place of a season of a real country and settings. This snapshot is what
 * stops that: a fresh device's local state and its (equally fresh, equally
 * default) `KnownProfile` start out identical, so it never has "an edit" to
 * push and only ever pulls.
 *
 * Defaults are supplied by the caller (`syncEngine`), not hard-coded here, so
 * this module stays ignorant of what a default `Country`/`Settings` actually
 * looks like.
 */
export function getLastKnownProfile(): KnownProfile | null {
  return readJson<KnownProfile>(LAST_KNOWN_PROFILE_KEY)
}

export function setLastKnownProfile(profile: KnownProfile): void {
  writeJson(LAST_KNOWN_PROFILE_KEY, profile)
}

/**
 * Forget which household and player this device talks to, and everything
 * sync knew as a result — but never the local save itself. Country,
 * settings and every attempt stay exactly as they are; only "who am I
 * syncing with" resets.
 *
 * The known-profile snapshot has to go too, not just the link: if it did
 * not, relinking to a *different* household later would compare live local
 * state against a stale snapshot from the household just left, which could
 * read as "nothing changed" and skip a push that should have happened. A
 * clean slate here means the very next sync after any (re)link falls back to
 * `getDefaultProfile()` for that comparison, which is what correctly makes a
 * device with real local play upload it on first joining any household.
 */
export function unlinkDevice(): void {
  try {
    localStorage.removeItem(LINK_KEY)
    localStorage.removeItem(LAST_SYNCED_KEY)
    localStorage.removeItem(LAST_KNOWN_PROFILE_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export const resetLinkForTest = unlinkDevice
