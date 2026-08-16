/**
 * Bridges the real `GameStore` and `link.ts` to what `syncEngine.ts` needs.
 *
 * This is the one place a profile pulled from the network gets validated
 * before it can touch the live save — the same rule `validateAttempt`
 * enforces for attempts, applied to the other piece of state that ever
 * leaves the device. `syncEngine` itself stays ignorant of `Country` and
 * `Settings` entirely; it only ever sees the opaque `ProfileSnapshot` shape,
 * which is what keeps it testable without importing half the app.
 */

import {
  DEFAULT_SETTINGS,
  getStore,
  validateCountry,
  validateSettings,
} from '../store/storage'
import { getLastKnownProfile, setLastKnownProfile } from './link'
import type { KnownProfile } from './link'
import type { SyncStoreAdapter } from './syncEngine'
import type { ProfileSnapshot } from './transport'

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export function createGameStoreAdapter(): SyncStoreAdapter {
  return {
    getAttempts: () => getStore().getState().attempts,
    getCountry: () => getStore().getState().country,
    getSettings: () => getStore().getState().settings,
    getDefaultProfile: (): KnownProfile => ({ country: null, settings: { ...DEFAULT_SETTINGS } }),

    mergeAttempts: (next) => {
      // `mergeRemoteAttempts` itself already validates every row and no-ops
      // on an unchanged reference — this is a straight pass-through.
      getStore().mergeRemoteAttempts(next)
    },

    applyProfile: (profile: ProfileSnapshot) => {
      // A country pulled from another device's row is exactly as untrusted
      // as one read off local disk. `validateCountry` returns `null` for
      // anything that does not validate, including the ordinary case of "no
      // country yet" — either way, nothing gets written.
      const country = validateCountry(profile.country)
      if (country !== null) {
        const current = getStore().getState().country
        if (!sameJson(current, country)) getStore().setCountry(country)
      }

      // `validateSettings` always returns a complete, safe `Settings` —
      // missing or malformed fields fall back to defaults rather than
      // producing `null` — so this is always safe to apply, and the
      // reference check below just avoids a pointless re-render when the
      // winning value already matches what is on screen.
      const settings = validateSettings(profile.settings)
      const currentSettings = getStore().getState().settings
      if (!sameJson(currentSettings, settings)) getStore().updateSettings(settings)
    },

    getLastKnownProfile: () => getLastKnownProfile(),
    setLastKnownProfile: (profile) => setLastKnownProfile(profile),
  }
}
