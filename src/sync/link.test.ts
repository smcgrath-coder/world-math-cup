import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLastKnownProfile,
  getLastSyncedAt,
  getLink,
  setLastKnownProfile,
  setLastSyncedAt,
  setLink,
  unlinkDevice,
} from './link'

beforeEach(() => {
  localStorage.clear()
})

describe('link', () => {
  it('starts unlinked', () => {
    expect(getLink()).toBeNull()
  })

  it('round-trips a link', () => {
    const link = { householdId: 'h1', playerId: 'p1', inviteCode: 'ABC123', playerName: 'Rion' }
    setLink(link)
    expect(getLink()).toEqual(link)
  })

  it('rejects a malformed stored value rather than handing back garbage', () => {
    localStorage.setItem('wmc_link_v1', JSON.stringify({ householdId: 'h1' })) // missing fields
    expect(getLink()).toBeNull()
  })

  it('clears with null', () => {
    setLink({ householdId: 'h1', playerId: 'p1', inviteCode: 'ABC123', playerName: 'Rion' })
    setLink(null)
    expect(getLink()).toBeNull()
  })
})

describe('lastSyncedAt', () => {
  it('starts null', () => {
    expect(getLastSyncedAt()).toBeNull()
  })

  it('round-trips', () => {
    setLastSyncedAt(12345)
    expect(getLastSyncedAt()).toBe(12345)
  })
})

describe('lastKnownProfile', () => {
  it('starts null', () => {
    expect(getLastKnownProfile()).toBeNull()
  })

  it('round-trips', () => {
    setLastKnownProfile({ country: null, settings: { timersEnabled: false } })
    expect(getLastKnownProfile()).toEqual({ country: null, settings: { timersEnabled: false } })
  })
})

describe('unlinkDevice', () => {
  it('clears the link, the last-synced time, and the known profile all at once', () => {
    setLink({ householdId: 'h1', playerId: 'p1', inviteCode: 'ABC123', playerName: 'Rion' })
    setLastSyncedAt(12345)
    setLastKnownProfile({ country: null, settings: { timersEnabled: false } })

    unlinkDevice()

    expect(getLink()).toBeNull()
    expect(getLastSyncedAt()).toBeNull()
    expect(getLastKnownProfile()).toBeNull()
  })
})
