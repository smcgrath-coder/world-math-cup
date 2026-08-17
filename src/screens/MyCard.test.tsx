import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MyCard } from './MyCard'
import { getStore, resetStoreForTest } from '../store/storage'
import type { AttemptDraft, Country } from '../store/storage'

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

function attempt(extra: Partial<AttemptDraft>): AttemptDraft {
  return {
    at: Date.now(),
    standardId: 'MT.4.NF.1',
    difficulty: 40,
    params: {},
    given: '1',
    correct: true,
    latencyMs: 3000,
    context: 'training',
    ...extra,
  }
}

describe('the card tab', () => {
  it('shows his card, his overall and his place in the world', () => {
    getStore().appendAttempts([attempt({})])
    render(<MyCard />)

    expect(screen.getByText(/^overall$/i)).toBeInTheDocument()
    expect(screen.getByText(/#\d+ in the world/i)).toBeInTheDocument()
    expect(screen.getByText('Rionia')).toBeInTheDocument()
  })

  it('opens the maths behind a stat', () => {
    getStore().appendAttempts([attempt({})])
    render(<MyCard />)

    fireEvent.click(screen.getByRole('button', { name: /dribbling/i }))
    expect(screen.getByText('MT.4.NF.1')).toBeInTheDocument()
  })

  it('counts the hard balls he went for and the ones he won back', () => {
    getStore().appendAttempts([
      attempt({ context: 'match', shot: 'bicycle', correct: false, matchId: 'm1' }),
      attempt({ context: 'match', shot: 'outside18', correct: true, matchId: 'm1' }),
      attempt({ context: 'tackleback', correct: true, matchId: 'm1' }),
      attempt({ context: 'tackleback', correct: false, matchId: 'm1' }),
    ])
    render(<MyCard />)

    const record = screen.getByTestId('courage')
    // Two hard shots, and not one word about whether they went in.
    expect(record).toHaveTextContent(/\b2\b/)
    expect(record.textContent).not.toMatch(/scored|missed|of 2|1 of/i)
    expect(record).toHaveTextContent(/won/i)
  })

  it('says nothing accusing when there is nothing on the record yet', () => {
    getStore().appendAttempts([attempt({})])
    render(<MyCard />)

    const record = screen.getByTestId('courage')
    expect(record.textContent).toMatch(/nothing on here yet/i)
    // Widened for rust: a fallen stat must never be explained by a day, a
    // week, an absence, or a "you haven't" — the same rule this test already
    // held the courage record to, now covering the whole card.
    expect(document.body.textContent ?? '').not.toMatch(
      /streak|days? in a row|you haven’t|you haven't|you should|\bdays?\b|\bweeks?\b|\bmonths?\b|you('?re| were)? away|time away|since you|last (time|played)/i,
    )
  })

  it('sends him to the training ground', () => {
    const onTrain = vi.fn()
    getStore().appendAttempts([attempt({})])
    render(<MyCard onTrain={onTrain} />)

    fireEvent.click(screen.getByRole('button', { name: /training ground/i }))
    expect(onTrain).toHaveBeenCalled()
  })

  it('shows the clean number waiting under a rusted stat, in digits alone, nowhere explaining why', () => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const settledAt = Date.now() - 6 * WEEK_MS
    getStore().appendAttempts(
      Array.from({ length: 8 }, () => attempt({ at: settledAt, difficulty: 60, correct: true, context: 'match' })),
    )
    render(<MyCard />)

    const ghosts = screen.getAllByTestId('rust-ghost')
    expect(ghosts.length).toBeGreaterThan(0)
    for (const ghost of ghosts) expect(ghost.textContent).toMatch(/^·\s*\d+$/)

    expect(document.body.textContent ?? '').not.toMatch(
      /\bdays?\b|\bweeks?\b|\bmonths?\b|you('?re| were)? away|time away|since you|last (time|played)/i,
    )
  })
})
