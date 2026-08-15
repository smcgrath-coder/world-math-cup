import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell, trackFor } from './AppShell'
import { TRACK_NAMES } from '../audio/music'
import { CELEBRATION_MS } from '../screens/Match'
import { getStore, resetStoreForTest } from '../store/storage'
import type { AttemptDraft, Country } from '../store/storage'
import { giveAnyAnswer } from '../test/answering'

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

/** A readable answer no generator in this game produces. */
const ALWAYS_WRONG = '-1'

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Getting past the gates

function tryoutAttempt(i = 0): AttemptDraft {
  return {
    at: Date.now() - i,
    standardId: 'MT.4.NF.1',
    difficulty: 40,
    params: {},
    given: '2',
    correct: true,
    latencyMs: 3000,
    context: 'tryout',
  }
}

/** A player who has been through every gate: country, Coach, try-out. */
function seasoned(): void {
  getStore().setCountry(COUNTRY)
  getStore().updateSettings({ coachExplainerSeen: true })
  getStore().appendAttempts([tryoutAttempt(0), tryoutAttempt(1)])
}

const tab = (name: RegExp): HTMLElement =>
  within(screen.getByRole('navigation')).getByRole('button', { name })

const goTo = (name: RegExp): void => {
  fireEvent.click(tab(name))
}

const tabsShowing = (): boolean => screen.queryByRole('navigation') !== null

/** Start a match against the first side on the fixture list. */
function kickOff(): void {
  fireEvent.click(screen.getAllByTestId('fixture')[0]!)
  fireEvent.click(screen.getByRole('button', { name: /kick off/i }))
}

function answer(given: string): void {
  giveAnyAnswer(given)
  act(() => {
    vi.advanceTimersByTime(CELEBRATION_MS)
  })
}

/**
 * One step of a match, whatever is on screen.
 *
 * The screen must never put an answer in the DOM, so these tests play badly on
 * purpose: what is being checked here is the shell's grip on the match, not
 * whether anyone can beat Curaçao.
 */
function push(): void {
  for (const name of [/get back out there/i, /second half/i, /inside the box/i]) {
    const button = screen.queryByRole('button', { name })
    if (button !== null) {
      fireEvent.click(button)
      act(() => {
        vi.advanceTimersByTime(CELEBRATION_MS)
      })
      return
    }
  }
  if (screen.queryByRole('textbox') !== null) answer(ALWAYS_WRONG)
}

/** Which question the match says it is on. Fourteen once the whistle has gone. */
function asked(): number {
  const el = screen.queryByText(/question \d+ of 14/i)
  const found = el?.textContent?.match(/question (\d+)/i)
  return found === null || found === undefined ? 14 : Number(found[1])
}

// ---------------------------------------------------------------------------

describe('the gates', () => {
  it('runs the country creator first, and nothing else with it', () => {
    render(<AppShell />)

    expect(screen.getByRole('heading', { name: /build your country/i })).toBeInTheDocument()
    expect(tabsShowing()).toBe(false)
  })

  it('runs the Coach once the country exists', () => {
    getStore().setCountry(COUNTRY)
    render(<AppShell />)

    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
    expect(tabsShowing()).toBe(false)
  })

  it('goes from the Coach straight into the try-out, and does not run him again', () => {
    getStore().setCountry(COUNTRY)
    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: /skip/i }))

    expect(screen.getByTestId('tryout-chrome')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
    expect(getStore().getState().settings.coachExplainerSeen).toBe(true)
  })

  it('holds the tabs back until the try-out is done', () => {
    getStore().setCountry(COUNTRY)
    getStore().updateSettings({ coachExplainerSeen: true })
    render(<AppShell />)

    expect(screen.getByTestId('tryout-chrome')).toBeInTheDocument()
    expect(tabsShowing()).toBe(false)
  })

  it('does not re-run a gate a returning player has already been through', () => {
    seasoned()
    render(<AppShell />)

    expect(screen.queryByRole('heading', { name: /build your country/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('tryout-chrome')).not.toBeInTheDocument()
    expect(tabsShowing()).toBe(true)
  })

  it('keeps the try-out on screen through its own last answer', () => {
    // The try-out ends on the card reveal, and it writes its own attempts on
    // the way there. A gate derived straight from the log would unmount it on
    // the write and take the payoff with it.
    getStore().setCountry(COUNTRY)
    getStore().updateSettings({ coachExplainerSeen: true })
    render(<AppShell />)

    act(() => {
      getStore().appendAttempts([tryoutAttempt()])
    })

    expect(screen.getByTestId('tryout-chrome')).toBeInTheDocument()
    expect(tabsShowing()).toBe(false)
  })
})

describe('the tabs', () => {
  beforeEach(() => {
    seasoned()
    render(<AppShell />)
  })

  it('opens on the fixtures', () => {
    expect(screen.getByTestId('standing')).toBeInTheDocument()
    expect(tab(/play/i)).toHaveAttribute('aria-current', 'page')
  })

  it('reaches the training ground, the card and the settings', () => {
    goTo(/training/i)
    expect(screen.getByRole('heading', { name: /what do you want to work on/i })).toBeInTheDocument()

    goTo(/card/i)
    expect(screen.getByTestId('courage')).toBeInTheDocument()

    goTo(/settings/i)
    expect(screen.getByRole('switch', { name: /timer/i })).toBeInTheDocument()

    goTo(/play/i)
    expect(screen.getByTestId('standing')).toBeInTheDocument()
  })

  it('keeps what is written down and drops what was only being browsed', () => {
    goTo(/settings/i)
    fireEvent.click(screen.getByRole('switch', { name: /timer/i }))

    goTo(/play/i)
    fireEvent.click(screen.getAllByTestId('fixture')[0]!)
    expect(screen.getByTestId('team-sheet')).toBeInTheDocument()

    goTo(/card/i)
    goTo(/play/i)
    // Browsing state is not worth keeping: he comes back to the fixtures.
    expect(screen.queryByTestId('team-sheet')).not.toBeInTheDocument()

    goTo(/settings/i)
    // A setting is worth keeping, and it is on disk anyway.
    expect(screen.getByRole('switch', { name: /timer/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('offers the same fixtures when he wanders off and comes back', () => {
    const before = screen.getAllByTestId('fixture-name').map((el) => el.textContent)
    goTo(/card/i)
    goTo(/play/i)

    expect(screen.getAllByTestId('fixture-name').map((el) => el.textContent)).toEqual(before)
  })

  it('takes him from the card to the training ground', () => {
    goTo(/card/i)
    fireEvent.click(screen.getByRole('button', { name: /training ground/i }))

    expect(screen.getByRole('heading', { name: /what do you want to work on/i })).toBeInTheDocument()
    expect(tab(/training/i)).toHaveAttribute('aria-current', 'page')
  })
})

describe('a match started from the fixture list', () => {
  beforeEach(() => {
    seasoned()
    render(<AppShell />)
  })

  it('takes the whole screen, tab bar included', () => {
    kickOff()

    expect(screen.getByTestId('scoreline')).toBeInTheDocument()
    // Nothing to fat-thumb mid-question. The way off the pitch is the whistle.
    expect(tabsShowing()).toBe(false)
  })

  it('is not remounted by its own writes', () => {
    kickOff()
    const scoreline = screen.getByTestId('scoreline')
    const before = screen.getByText(/question 1 of 14/i)

    // Exactly what the match does to the store four answers in. If anything
    // about the match is keyed on the log, this restarts it — silently, in the
    // middle, with a second match written over the top of the first.
    act(() => {
      getStore().appendAttempts([
        { at: Date.now(), standardId: 'MT.4.NF.1', difficulty: 40, params: {}, given: '2', correct: true, latencyMs: 3000, context: 'match', matchId: 'live' },
      ])
    })

    // Same DOM nodes: React reuses them only if the tree was never unmounted.
    expect(screen.getByTestId('scoreline')).toBe(scoreline)
    expect(screen.getByText(/question 1 of 14/i)).toBe(before)
  })

  it('survives its own flush, four answers in', () => {
    kickOff()
    const scoreline = screen.getByTestId('scoreline')
    for (let i = 0; i < 12; i++) push()

    const written = getStore().getState().attempts.filter((a) => a.context !== 'tryout')
    // The match has genuinely written to the log by now — that is the event
    // that used to restart it.
    expect(written.length).toBeGreaterThanOrEqual(4)
    expect(new Set(written.map((a) => a.matchId)).size).toBe(1)
    expect(screen.getByTestId('scoreline')).toBe(scoreline)
    expect(asked()).toBeGreaterThan(4)
  })

  it('honours the timers switch it was started under', () => {
    goTo(/settings/i)
    fireEvent.click(screen.getByRole('switch', { name: /timer/i }))
    goTo(/play/i)
    kickOff()

    // A miss loosens the ball. With timers off there is no bar and no clock —
    // not a hidden one, not a long one.
    answer(ALWAYS_WRONG)
    expect(screen.getByText(/win it back/i)).toBeInTheDocument()
    expect(screen.queryByTestId('tackleback-bar')).not.toBeInTheDocument()
    expect(screen.getByText(/take as long as you like/i)).toBeInTheDocument()
  })

  it('draws the bar when timers are left on', () => {
    kickOff()
    answer(ALWAYS_WRONG)

    expect(screen.getByTestId('tackleback-bar')).toBeInTheDocument()
  })
})

describe('starting again', () => {
  it('runs every gate from the top once the save is gone', () => {
    seasoned()
    render(<AppShell />)

    goTo(/settings/i)
    fireEvent.click(screen.getByRole('button', { name: /grown-up/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

    expect(screen.getByRole('heading', { name: /build your country/i })).toBeInTheDocument()
    expect(tabsShowing()).toBe(false)

    // And the gates behind it are genuinely open again, rather than being
    // skipped because this session had already been through them.
    act(() => {
      getStore().setCountry(COUNTRY)
    })
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })
})

describe('the shell as a whole', () => {
  it('never counts days off or asks him where he has been', () => {
    seasoned()
    render(<AppShell />)

    for (const where of [/play/i, /card/i, /settings/i]) {
      goTo(where)
      expect(document.body.textContent ?? '').not.toMatch(
        /streak|days? in a row|you haven’t|you haven't|come back soon|missed a day|keep it up/i,
      )
    }
  })
})

describe('trackFor', () => {
  const base = {
    country: true,
    explained: true,
    scouted: true,
    result: null,
    fixture: null,
    tab: 'play' as const,
  }

  it('covers the whole journey with a loop each', () => {
    expect(trackFor({ ...base, country: false })).toBe('main_theme')
    expect(trackFor({ ...base, explained: false })).toBe('main_theme')
    expect(trackFor({ ...base, scouted: false })).toBe('training_grounds')
    expect(trackFor({ ...base, tab: 'play' })).toBe('tournament')
    expect(trackFor({ ...base, tab: 'training' })).toBe('training_grounds')
    expect(trackFor({ ...base, tab: 'card' })).toBe('main_theme')
    expect(trackFor({ ...base, tab: 'settings' })).toBe('main_theme')
  })

  it('saves the tensest track for the knockouts', () => {
    expect(trackFor({ ...base, fixture: { stakes: 'friendly' } })).toBe('match_ambience')
    expect(trackFor({ ...base, fixture: { stakes: 'group' } })).toBe('match_ambience')
    expect(trackFor({ ...base, fixture: { stakes: 'knockout' } })).toBe('penalty_shootout')
  })

  it('follows the shell, not the state, when both could apply', () => {
    // Full time renders the post-match screen over the fixture, so the music
    // has to change with it rather than staying on the match loop.
    expect(trackFor({ ...base, result: {}, fixture: { stakes: 'knockout' } })).toBe('tournament')
    // And the creator wins over everything, including a tab left on training.
    expect(trackFor({ ...base, country: false, tab: 'training' })).toBe('main_theme')
  })

  it('names a track that exists', () => {
    for (const tab of ['play', 'training', 'card', 'settings'] as const) {
      expect(TRACK_NAMES).toContain(trackFor({ ...base, tab }))
    }
    expect(TRACK_NAMES).toContain(trackFor({ ...base, fixture: { stakes: 'knockout' } }))
  })
})
