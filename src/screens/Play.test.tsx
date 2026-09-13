import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_COUNT,
  Play,
  biggestGap,
  countMatches,
  fixtureSeed,
  suggestFixtures,
} from './Play'
import { opponentCard } from '../components/stats'
import { OPPONENTS, OPPONENTS_BY_ID } from '../data/opponents'
import { getStore, resetStoreForTest } from '../store/storage'
import type { AttemptDraft, Country } from '../store/storage'
import type { Card } from '../store/types'

const COUNTRY: Country = {
  name: 'Rionia',
  flag: {
    layout: 'bands-h',
    colors: ['#0B2A5B', '#FACC15', '#0B2A5B'],
    charge: 'star',
    chargeColor: '#0B2A5B',
  },
  kit: ['#FACC15', '#0B2A5B'],
  stars: 0,
}

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
  getStore().setCountry(COUNTRY)
})

afterEach(() => {
  vi.useRealTimers()
})

function history(count: number, correct: boolean, standardId = 'MT.4.NF.1'): void {
  const drafts: AttemptDraft[] = []
  for (let i = 0; i < count; i++) {
    drafts.push({
      at: Date.now() - i,
      standardId,
      difficulty: 45,
      params: {},
      given: '',
      correct,
      latencyMs: 4000,
      context: 'training',
    })
  }
  getStore().appendAttempts(drafts)
}

const flat = (value: number): Card => ({
  PAC: value,
  SHO: value,
  PAS: value,
  DRI: value,
  DEF: value,
  PHY: value,
})

// ---------------------------------------------------------------------------

describe('suggestFixtures', () => {
  it('offers a spread with somebody beatable and somebody frightening', () => {
    const fixtures = suggestFixtures(70, 1)

    expect(fixtures).toHaveLength(FIXTURE_COUNT)
    // Somebody at or below his own level, and somebody well above it. The whole
    // point of the list: there is always a game he can win and a game he cannot
    // yet.
    expect(Math.min(...fixtures.map((o) => o.rating))).toBeLessThanOrEqual(70)
    expect(Math.max(...fixtures.map((o) => o.rating))).toBeGreaterThanOrEqual(70 + 15)
  })

  it('never offers the same side twice in one list', () => {
    for (let seed = 0; seed < 40; seed++) {
      const ids = suggestFixtures(62, seed).map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('is stable for one seed and rotates across seeds', () => {
    const ids = (seed: number) => suggestFixtures(70, seed).map((o) => o.id).join(',')

    expect(ids(7)).toBe(ids(7))
    expect(new Set([ids(1), ids(2), ids(3), ids(4), ids(5)]).size).toBeGreaterThan(1)
  })

  it('still fills the list for a player nobody on the roster is weaker than', () => {
    // A brand-new card sits at 50 and the gentlest side in the game is 56, so
    // the "somebody you should beat" band is empty. It has to fall back to the
    // closest side rather than hand him four fixtures.
    const fixtures = suggestFixtures(50, 3)

    expect(fixtures).toHaveLength(FIXTURE_COUNT)
    expect(fixtures[0]!.rating).toBeLessThanOrEqual(60)
  })

  it('reads from weakest to strongest', () => {
    const ratings = suggestFixtures(75, 11).map((o) => o.rating)
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings)
  })

  it('only ever offers sides that exist on the roster', () => {
    for (const opponent of suggestFixtures(84, 9)) {
      expect(OPPONENTS_BY_ID[opponent.id]).toBe(opponent)
    }
  })
})

describe('fixtureSeed', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('holds all day and turns over tomorrow', () => {
    expect(fixtureSeed(DAY * 9 + 1000, 0)).toBe(fixtureSeed(DAY * 9 + 60_000, 0))
    expect(fixtureSeed(DAY * 9, 0)).not.toBe(fixtureSeed(DAY * 10, 0))
  })

  it('turns over after a match, so the card he just played is not still top', () => {
    expect(fixtureSeed(DAY * 9, 0)).not.toBe(fixtureSeed(DAY * 9, 1))
  })
})

describe('countMatches', () => {
  it('counts distinct matches rather than attempts', () => {
    expect(countMatches([])).toBe(0)
    getStore().appendAttempts([
      { at: 1, standardId: 'x', difficulty: 1, params: {}, given: '', correct: true, latencyMs: 1, context: 'match', matchId: 'm1' },
      { at: 2, standardId: 'x', difficulty: 1, params: {}, given: '', correct: true, latencyMs: 1, context: 'match', matchId: 'm1' },
      { at: 3, standardId: 'x', difficulty: 1, params: {}, given: '', correct: true, latencyMs: 1, context: 'match', matchId: 'm2' },
      { at: 4, standardId: 'x', difficulty: 1, params: {}, given: '', correct: true, latencyMs: 1, context: 'training' },
    ])
    expect(countMatches(getStore().getState().attempts)).toBe(2)
  })
})

describe('biggestGap', () => {
  it('names the stat they are furthest ahead on', () => {
    const mine = flat(50)
    const theirs = { ...flat(55), DRI: 80 }

    expect(biggestGap(mine, theirs)).toEqual({ stat: 'DRI', mine: 50, theirs: 80 })
  })

  it('says nothing when nothing on their card is above his', () => {
    expect(biggestGap(flat(70), flat(60))).toBeNull()
  })

  it('reverses to find where he has them', () => {
    const mine = { ...flat(50), DEF: 88 }
    expect(biggestGap(opponentCard(OPPONENTS_BY_ID.curacao!), mine)?.stat).toBe('DEF')
  })
})

// ---------------------------------------------------------------------------

describe('the fixture list', () => {
  const open = (): { onKickoff: ReturnType<typeof vi.fn>; onTrain: ReturnType<typeof vi.fn> } => {
    const onKickoff = vi.fn()
    const onTrain = vi.fn()
    render(<Play onKickoff={onKickoff} onTrain={onTrain} />)
    return { onKickoff, onTrain }
  }

  it('leads with where he stands in the world', () => {
    history(8, true)
    open()

    const standing = screen.getByTestId('standing')
    expect(standing).toHaveTextContent(/#\d+ in the world/i)
    expect(standing).toHaveTextContent(/overall/i)
    expect(standing).toHaveTextContent(/Rionia/i)
  })

  it('offers five sides to play, with their stars and how far off him they are', () => {
    open()

    const rows = screen.getAllByTestId('fixture')
    expect(rows).toHaveLength(FIXTURE_COUNT)
    for (const row of rows) {
      expect(row).toHaveTextContent(/tier [1-4]/i)
      expect(row).toHaveTextContent(/(above you|below you|level with you)/i)
    }
  })

  it('opens a team sheet with both cards on it', () => {
    open()

    const first = screen.getAllByTestId('fixture')[0]!
    const name = within(first).getByTestId('fixture-name').textContent!
    fireEvent.click(first)

    const sheet = screen.getByTestId('team-sheet')
    expect(within(sheet).getByTestId('sheet-name')).toHaveTextContent(name)
    // Their card and his, drawn by the same component so the two are directly
    // comparable — that comparison is what scouting is.
    expect(screen.getAllByText(/^overall$/i)).toHaveLength(2)
  })

  it('names the stat they will hurt him on, in football and in maths', () => {
    render(<Play onKickoff={vi.fn()} onTrain={vi.fn()} />)
    fireEvent.click(screen.getAllByTestId('fixture')[0]!)

    const gap = screen.getByTestId('gap')
    expect(gap.textContent).toMatch(/\d+/)
    expect(gap.textContent?.toLowerCase()).toMatch(
      /fluency|geometry|operations|fractions|place value|measurement/,
    )
  })

  it('sends him to the training ground from the team sheet', () => {
    const { onTrain } = open()
    fireEvent.click(screen.getAllByTestId('fixture')[0]!)
    fireEvent.click(screen.getByRole('button', { name: /training ground/i }))

    expect(onTrain).toHaveBeenCalled()
  })

  it('kicks off a friendly by default', () => {
    const { onKickoff } = open()
    const first = screen.getAllByTestId('fixture')[0]!
    const name = within(first).getByTestId('fixture-name').textContent!
    fireEvent.click(first)
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }))

    expect(onKickoff).toHaveBeenCalledTimes(1)
    expect(onKickoff.mock.calls[0]![0].name).toBe(name)
    expect(onKickoff.mock.calls[0]![1]).toBe('friendly')
  })

  it('offers a knockout and says plainly that it is a one-off, not the cup', () => {
    const { onKickoff } = open()
    fireEvent.click(screen.getAllByTestId('fixture')[0]!)
    fireEvent.click(screen.getByRole('button', { name: /knockout/i }))

    // "There is no tournament behind it yet" outlived the tournament by a
    // month. The road to the cup sits two sections above this sentence.
    const note = screen.getByTestId('stakes-note').textContent
    expect(note).toMatch(/one-off/i)
    expect(note).not.toMatch(/no tournament|yet/i)

    fireEvent.click(screen.getByRole('button', { name: /kick off/i }))
    expect(onKickoff.mock.calls[0]![1]).toBe('knockout')
  })

  it('comes back out of the team sheet to the fixtures', () => {
    open()
    fireEvent.click(screen.getAllByTestId('fixture')[0]!)
    expect(screen.getByTestId('team-sheet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.queryByTestId('team-sheet')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('fixture')).toHaveLength(FIXTURE_COUNT)
  })

  it('browses the whole world, by rating or by tier', () => {
    open()
    expect(screen.queryAllByTestId('roster-row')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /browse all/i }))
    const rows = screen.getAllByTestId('roster-row')
    expect(rows).toHaveLength(OPPONENTS.length)

    const ratings = rows.map((row) => Number(within(row).getByTestId('roster-rating').textContent))
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings)

    fireEvent.click(screen.getByRole('button', { name: /by tier/i }))
    expect(screen.getAllByRole('heading', { name: /tier [1-4]/i })).toHaveLength(4)
    expect(screen.getAllByTestId('roster-row')).toHaveLength(OPPONENTS.length)
  })

  it('shows the stars a side has actually won', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /browse all/i }))

    const brazil = screen
      .getAllByTestId('roster-row')
      .find((row) => row.textContent?.includes('Brazil'))!
    expect(brazil).toHaveTextContent('★★★★★')
  })

  it('marks the sides who are not in the 2026 field', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /browse all/i }))

    const italy = screen
      .getAllByTestId('roster-row')
      .find((row) => row.textContent?.includes('Italy'))!
    expect(italy.textContent).toMatch(/not in the 2026 field/i)
  })

  it('scouts any side in the world, not only the five on offer', () => {
    const { onKickoff } = open()
    fireEvent.click(screen.getByRole('button', { name: /browse all/i }))

    const brazil = screen
      .getAllByTestId('roster-row')
      .find((row) => row.textContent?.includes('Brazil'))!
    fireEvent.click(brazil)

    expect(screen.getByTestId('team-sheet')).toHaveTextContent(/Brazil/i)
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }))
    expect(onKickoff.mock.calls[0]![0].id).toBe('brazil')
  })

  it('never counts a day he did not play, or asks him where he has been', () => {
    history(4, false)
    open()

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/streak|days? in a row|you haven’t|you haven't|come back|missed a day/i)
  })
})

// ---------------------------------------------------------------------------

describe('the road to the cup', () => {
  const open = () => {
    const onKickoff = vi.fn()
    const onTrain = vi.fn()
    render(<Play onKickoff={onKickoff} onTrain={onTrain} />)
    return { onKickoff, onTrain }
  }

  it('offers to qualify when there is no active run', () => {
    open()
    const card = screen.getByTestId('campaign-card')
    expect(within(card).getByText(/qualify for a cup/i)).toBeInTheDocument()
  })

  it('starts a qualifying series on tap, and shows the first fixture ready to go', () => {
    open()
    fireEvent.click(screen.getByText(/qualify for a cup/i))

    expect(getStore().getState().campaign?.stage).toBe('qualifying')
    const card = screen.getByTestId('campaign-card')
    expect(within(card).getByText(/next up/i)).toBeInTheDocument()
    expect(within(card).getByTestId('campaign-fixture')).toBeInTheDocument()
  })

  it('kicks off the campaign fixture with the campaign flag set, and friendly stakes for qualifying', () => {
    const { onKickoff } = open()
    fireEvent.click(screen.getByText(/qualify for a cup/i))
    fireEvent.click(screen.getByTestId('campaign-fixture'))

    expect(onKickoff).toHaveBeenCalledTimes(1)
    const [opponent, stakes, campaignFixture] = onKickoff.mock.calls[0]!
    expect(opponent.id).toBeTruthy()
    expect(stakes).toBe('friendly')
    expect(campaignFixture).toBe(true)
  })

  it('never sends a campaign kickoff for an ordinary exhibition pick', () => {
    const { onKickoff } = open()
    const fixture = screen.getAllByTestId('fixture')[0]!
    fireEvent.click(fixture)
    fireEvent.click(screen.getByRole('button', { name: /kick off/i }))

    expect(onKickoff).toHaveBeenCalledTimes(1)
    expect(onKickoff.mock.calls[0]![2]).toBeUndefined()
  })

  it('shows the qualifying tally once a match has been played', () => {
    getStore().setCampaign({
      stage: 'qualifying',
      seed: 1,
      opponentIds: ['spain', 'brazil', 'japan'],
      results: ['win'],
    })
    open()
    const card = screen.getByTestId('campaign-card')
    expect(within(card).getByText(/1 win, 0 losses, 2 to play/i)).toBeInTheDocument()
  })

  it('shows the group table by name, with the player as "You"', () => {
    getStore().setCampaign({
      stage: 'group',
      seed: 1,
      groups: [
        ['me', 'spain', 'japan', 'haiti'],
        ...Array.from({ length: 7 }, (_, i) => [`t${i}`, `u${i}`, `v${i}`, `w${i}`]),
      ] as never,
      matches: [{ homeId: 'me', awayId: 'spain', home: 1, away: 1 }],
    })
    open()
    const table = screen.getByTestId('group-table')
    expect(within(table).getByText('You')).toBeInTheDocument()
    expect(within(table).getByText('Spain')).toBeInTheDocument()
  })

  it('names the knockout round it is currently in', () => {
    getStore().setCampaign({
      stage: 'knockout',
      seed: 1,
      groups: [
        ['me', 'a', 'b', 'c'],
        ...Array.from({ length: 7 }, (_, i) => [`t${i}`, `u${i}`, `v${i}`, `w${i}`]),
      ] as never,
      groupMatches: [],
      ties: [{ round: 'qf', homeId: 'me', awayId: 'brazil' }],
    })
    open()
    expect(screen.getByText(/quarter-final/i)).toBeInTheDocument()
  })

  it('falls back to "start a fresh run" rather than crashing on a campaign with no resolvable fixture', () => {
    // A structurally-valid-enough campaign whose engine invariants are
    // broken -- every group tie already decided, nothing pending for the
    // player. nextFixture returns null for this; the card must fall back
    // rather than render a broken row or throw.
    getStore().setCampaign({
      stage: 'knockout',
      seed: 1,
      groups: [
        ['me', 'a', 'b', 'c'],
        ...Array.from({ length: 7 }, (_, i) => [`t${i}`, `u${i}`, `v${i}`, `w${i}`]),
      ] as never,
      groupMatches: [],
      ties: [],
    })
    expect(() => open()).not.toThrow()
    expect(screen.getByText(/qualify for a cup/i)).toBeInTheDocument()
  })

  it('leaves the exhibition list labelled as practice, unchanged', () => {
    open()
    expect(screen.getByText(/practice matches/i)).toBeInTheDocument()
    expect(screen.getByText(/who do you fancy/i)).toBeInTheDocument()
  })
})
