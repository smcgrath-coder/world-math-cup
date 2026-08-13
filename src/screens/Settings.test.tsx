import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from './Settings'
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

function history(count = 3): void {
  const drafts: AttemptDraft[] = []
  for (let i = 0; i < count; i++) {
    drafts.push({
      at: Date.now() - i * 1000,
      standardId: 'MT.4.NF.1',
      difficulty: 40,
      params: {},
      given: String(i),
      correct: i % 2 === 0,
      latencyMs: 3000,
      context: 'training',
    })
  }
  getStore().appendAttempts(drafts)
}

const open = (onSaveReplaced = vi.fn()) => {
  render(<SettingsScreen onSaveReplaced={onSaveReplaced} />)
  return onSaveReplaced
}

const timers = () => screen.getByRole('switch', { name: /timer/i })
const parentView = () => fireEvent.click(screen.getByRole('button', { name: /grown-up/i }))

// ---------------------------------------------------------------------------

describe('the timers switch', () => {
  it('is on to start with and says what it does', () => {
    open()

    expect(timers()).toHaveAttribute('aria-checked', 'true')
    // Plainly worded, and specific about the one clock it removes. A switch
    // this important must not be a mystery.
    expect(screen.getByTestId('timers-note').textContent).toMatch(/tackle-back/i)
  })

  it('writes through to the save and reads back on the next visit', () => {
    open()
    fireEvent.click(timers())

    expect(getStore().getState().settings.timersEnabled).toBe(false)
    expect(timers()).toHaveAttribute('aria-checked', 'false')

    cleanup()
    open()
    expect(timers()).toHaveAttribute('aria-checked', 'false')
  })

  it('goes back on again', () => {
    open()
    fireEvent.click(timers())
    fireEvent.click(timers())

    expect(getStore().getState().settings.timersEnabled).toBe(true)
  })
})

describe('the sound switch', () => {
  it('persists', () => {
    open()
    const sound = screen.getByRole('switch', { name: /sound/i })
    fireEvent.click(sound)

    expect(getStore().getState().settings.soundEnabled).toBe(false)
  })

  it('says it is music only, because a surprise noise is the thing to warn about', () => {
    open()
    expect(screen.getByTestId('sound-note').textContent).toMatch(/music only/i)
    expect(screen.getByTestId('sound-note').textContent).toMatch(/no sound effects/i)
  })
})

describe('the Coach', () => {
  it('can be read again, and comes back here afterwards', () => {
    getStore().updateSettings({ coachExplainerSeen: true })
    open()

    fireEvent.click(screen.getByRole('button', { name: /coach/i }))
    expect(screen.queryByRole('switch', { name: /timer/i })).not.toBeInTheDocument()

    // However he leaves it, he lands back on the settings he came from.
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(timers()).toBeInTheDocument()
    // Re-reading it is not a first read: nothing about the gate changes.
    expect(getStore().getState().settings.coachExplainerSeen).toBe(true)
  })
})

describe('the parent view', () => {
  it('is closed until it is asked for', () => {
    history()
    open()
    expect(screen.queryByTestId('attempt-row')).not.toBeInTheDocument()

    parentView()
    expect(screen.getAllByTestId('attempt-row').length).toBeGreaterThan(0)
  })

  it('lists the questions he has actually answered', () => {
    history(3)
    open()
    parentView()

    const rows = screen.getAllByTestId('attempt-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent(/equivalent fractions/i)
    expect(rows[0]!.textContent).toMatch(/right|missed/i)
  })

  it('lists a rating for every standard the game can ask', () => {
    history()
    open()
    parentView()

    const rows = screen.getAllByTestId('standard-row')
    expect(rows.length).toBeGreaterThanOrEqual(12)
    expect(rows.some((row) => row.textContent?.includes('MT.4.NF.1'))).toBe(true)
  })

  it('says what is stored and where', () => {
    open()
    parentView()

    const note = screen.getByTestId('storage-note')
    expect(note.textContent).toMatch(/this device/i)
    expect(note.textContent).toMatch(/localstorage/i)
  })

  it('hands over the whole save as text', () => {
    history()
    open()
    parentView()
    fireEvent.click(screen.getByRole('button', { name: /export/i }))

    const box = screen.getByTestId('export-box') as HTMLTextAreaElement
    expect(box.value).toContain('Rionia')
    expect(JSON.parse(box.value).attempts).toHaveLength(3)
  })

  it('takes a save back, and refuses one it cannot read', () => {
    history(2)
    open()
    parentView()
    const saved = getStore().exportJson()

    getStore().resetAll()
    const box = screen.getByTestId('import-box')

    fireEvent.change(box, { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: /load/i }))
    expect(screen.getByTestId('import-note').textContent).toMatch(/didn’t|didn't|couldn’t|couldn't/i)
    expect(getStore().getState().attempts).toHaveLength(0)

    fireEvent.change(box, { target: { value: saved } })
    fireEvent.click(screen.getByRole('button', { name: /load/i }))
    expect(getStore().getState().attempts).toHaveLength(2)
    expect(getStore().getState().country?.name).toBe('Rionia')
  })
})

describe('starting again', () => {
  it('asks first', () => {
    history(4)
    open()
    parentView()

    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    // Nothing gone yet. The first tap only opens the question.
    expect(getStore().getState().attempts).toHaveLength(4)
    expect(screen.getByTestId('reset-confirm').textContent).toMatch(/cannot be undone/i)
  })

  it('can be backed out of', () => {
    history(4)
    open()
    parentView()

    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }))

    expect(screen.queryByTestId('reset-confirm')).not.toBeInTheDocument()
    expect(getStore().getState().attempts).toHaveLength(4)
  })

  it('goes through on the second tap, and tells the shell the save has gone', () => {
    history(4)
    const replaced = open()
    parentView()

    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

    expect(getStore().getState().attempts).toHaveLength(0)
    expect(getStore().getState().country).toBeNull()
    expect(replaced).toHaveBeenCalled()
  })
})

describe('the voice', () => {
  it('never nags him about days off or streaks', () => {
    history(2)
    open()
    parentView()

    expect(document.body.textContent ?? '').not.toMatch(
      /streak|days? in a row|you haven’t|you haven't|keep it up|don’t break|don't break/i,
    )
  })
})
