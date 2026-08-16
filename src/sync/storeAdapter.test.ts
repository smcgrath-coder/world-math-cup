import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGameStoreAdapter } from './storeAdapter'
import { resetLinkForTest } from './link'
import { DEFAULT_SETTINGS, getStore, resetStoreForTest } from '../store/storage'

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  resetLinkForTest()
})

describe('createGameStoreAdapter — applyProfile', () => {
  it('writes a valid country', () => {
    const adapter = createGameStoreAdapter()
    const country = {
      name: 'Rionia',
      flag: { layout: 'bands-h', colors: ['#000', '#fff', '#000'], charge: 'star', chargeColor: '#000' },
      kit: ['#000', '#fff'],
      stars: 1,
    }
    adapter.applyProfile({ country, settings: {}, updatedAt: 1 })
    expect(getStore().getState().country).toEqual(country)
  })

  it('drops a garbage country exactly as a corrupt local write would, and does not crash', () => {
    const adapter = createGameStoreAdapter()
    expect(() =>
      adapter.applyProfile({ country: { not: 'a real country' }, settings: {}, updatedAt: 1 }),
    ).not.toThrow()
    expect(getStore().getState().country).toBeNull()
  })

  it('leaves the local country alone when the profile has none — never treats "no country yet" as a country to erase to', () => {
    const adapter = createGameStoreAdapter()
    adapter.applyProfile({ country: null, settings: {}, updatedAt: 1 })
    expect(getStore().getState().country).toBeNull()
  })

  it('applies valid settings', () => {
    const adapter = createGameStoreAdapter()
    adapter.applyProfile({ country: null, settings: { timersEnabled: false }, updatedAt: 1 })
    expect(getStore().getState().settings.timersEnabled).toBe(false)
  })

  it('falls back malformed settings fields to defaults rather than crashing', () => {
    const adapter = createGameStoreAdapter()
    adapter.applyProfile({
      country: null,
      settings: { timersEnabled: 'not a boolean', soundEnabled: false },
      updatedAt: 1,
    })
    const s = getStore().getState().settings
    expect(s.timersEnabled).toBe(DEFAULT_SETTINGS.timersEnabled) // malformed field ignored
    expect(s.soundEnabled).toBe(false) // valid field applied
  })

  it('does not write, and does not notify subscribers, when the winning value already matches local state', () => {
    const adapter = createGameStoreAdapter()
    adapter.applyProfile({ country: null, settings: { timersEnabled: false }, updatedAt: 1 })

    const seen = vi.fn()
    getStore().subscribe(seen)
    adapter.applyProfile({ country: null, settings: { timersEnabled: false }, updatedAt: 2 })
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('createGameStoreAdapter — the rest of the surface', () => {
  it('getDefaultProfile matches the store’s own DEFAULT_SETTINGS', () => {
    const adapter = createGameStoreAdapter()
    expect(adapter.getDefaultProfile()).toEqual({ country: null, settings: DEFAULT_SETTINGS })
  })

  it('getAttempts/getCountry/getSettings read straight through to the live store', () => {
    const adapter = createGameStoreAdapter()
    getStore().appendAttempt({
      at: 1,
      standardId: 'MT.4.NF.1',
      difficulty: 50,
      params: {},
      given: '1/2',
      correct: true,
      latencyMs: 4000,
      context: 'training',
    })
    expect(adapter.getAttempts()).toEqual(getStore().getState().attempts)
    expect(adapter.getCountry()).toBe(getStore().getState().country)
    expect(adapter.getSettings()).toBe(getStore().getState().settings)
  })

  it('mergeAttempts delegates to the store’s own merge, including its no-op behaviour', () => {
    const adapter = createGameStoreAdapter()
    const seen = vi.fn()
    getStore().subscribe(seen)
    adapter.mergeAttempts(getStore().getState().attempts) // same reference in, must no-op
    expect(seen).not.toHaveBeenCalled()
  })

  it('known-profile getters and setters round-trip through link.ts', () => {
    const adapter = createGameStoreAdapter()
    expect(adapter.getLastKnownProfile()).toBeNull()
    adapter.setLastKnownProfile({ country: null, settings: { timersEnabled: false } })
    expect(adapter.getLastKnownProfile()).toEqual({ country: null, settings: { timersEnabled: false } })
  })
})
