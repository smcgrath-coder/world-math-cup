import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getStore, resetStoreForTest } from './storage'
import type { AttemptDraft } from './storage'
import { useAttempts, useCountry, useGameState, useSettings } from './useGameState'

const T0 = 1767225600000

const draft = (over: Partial<AttemptDraft> = {}): AttemptDraft => ({
  at: T0,
  standardId: 'MT.4.NF.1',
  difficulty: 50,
  params: {},
  given: '1/2',
  correct: true,
  latencyMs: 8000,
  context: 'training',
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
})

describe('useGameState', () => {
  it('returns the current state', () => {
    const { result } = renderHook(() => useGameState())
    expect(result.current.attempts).toEqual([])
    expect(result.current.country).toBeNull()
  })

  it('re-renders when an attempt is appended', () => {
    const { result } = renderHook(() => useAttempts())
    expect(result.current).toHaveLength(0)
    act(() => {
      getStore().appendAttempt(draft())
    })
    expect(result.current).toHaveLength(1)
  })

  it('does not re-render on a refused attempt', () => {
    let renders = 0
    renderHook(() => {
      renders += 1
      return useAttempts()
    })
    const before = renders
    act(() => {
      getStore().appendAttempt(draft({ difficulty: Number.NaN }))
    })
    expect(renders).toBe(before)
  })

  it('holds a stable snapshot, so a render does not schedule another one', () => {
    let renders = 0
    const { rerender } = renderHook(() => {
      renders += 1
      return useGameState()
    })
    rerender()
    rerender()
    expect(renders).toBe(3)
  })

  it('unsubscribes on unmount', () => {
    const store = getStore()
    const { unmount } = renderHook(() => useAttempts())
    unmount()
    // Nothing to assert but that this does not warn or throw on a dead tree.
    act(() => {
      store.appendAttempt(draft())
    })
    expect(store.getState().attempts).toHaveLength(1)
  })

  it('tracks settings and country separately', () => {
    const settings = renderHook(() => useSettings())
    const country = renderHook(() => useCountry())
    expect(settings.result.current.timersEnabled).toBe(true)
    expect(country.result.current).toBeNull()

    act(() => {
      getStore().updateSettings({ timersEnabled: false })
    })
    expect(settings.result.current.timersEnabled).toBe(false)
  })
})
