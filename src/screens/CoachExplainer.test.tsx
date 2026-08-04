import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoachExplainer, SCREEN_COUNT } from './CoachExplainer'
import { getStore, resetStoreForTest } from '../store/storage'

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
})

const seen = (): boolean => getStore().getState().settings.coachExplainerSeen

const button = (name: string | RegExp) => screen.getByRole('button', { name })

/** Walk to the last screen, collecting what each one said on the way. */
async function readAll(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  const said: string[] = [document.body.textContent ?? '']
  for (let i = 1; i < SCREEN_COUNT; i++) {
    await user.click(button(i === 1 ? 'Start the try-out' : 'Next'))
    said.push(document.body.textContent ?? '')
  }
  return said
}

describe('CoachExplainer', () => {
  it('opens in the Coach’s voice on the welcome screen', () => {
    render(<CoachExplainer />)
    expect(screen.getByText(/You[’']re the manager, the captain and the whole squad/)).toBeInTheDocument()
    expect(screen.getByText(/Brazil started there/)).toBeInTheDocument()
  })

  it('is skippable from the very first screen', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<CoachExplainer onDone={onDone} />)

    // A child who wants to play is allowed to play, without reading five more
    // screens to earn the right.
    await user.click(button(/^Skip/))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(seen()).toBe(true)
  })

  it('offers no way back from the first screen', () => {
    render(<CoachExplainer />)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('runs to exactly six screens and finishes on the two ideas that matter', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<CoachExplainer onDone={onDone} />)

    await readAll(user)

    expect(screen.getByText(/You can lose a match and still climb the rankings/)).toBeInTheDocument()
    expect(screen.getByText(/Taking the hard shot counts even when it misses/)).toBeInTheDocument()
    expect(screen.getByText(/Nobody[’']s good at this on day one/)).toBeInTheDocument()
    // Six, hard maximum: there is nothing past the last one but the try-out.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()

    expect(onDone).not.toHaveBeenCalled()
    await user.click(button(/^Let[\u2019']s go$/))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(seen()).toBe(true)
  })

  it('goes back to the screen before, unchanged', async () => {
    const user = userEvent.setup()
    render(<CoachExplainer />)

    await user.click(button('Start the try-out'))
    expect(screen.getByText(/It[’']s not a test/)).toBeInTheDocument()

    await user.click(button('Back'))
    expect(screen.getByText(/You[’']re the manager, the captain and the whole squad/)).toBeInTheDocument()
  })

  it('explains the six card stats and the match before the World Cup', async () => {
    const user = userEvent.setup()
    render(<CoachExplainer />)
    const said = await readAll(user)

    const everything = said.join(' ')
    expect(everything).toContain('like the ones in FC')
    expect(everything).toContain('shapes and angles')
    expect(everything).toContain('Fourteen questions')
    expect(everything).toContain('a star above your crest')
  })

  it('never mentions ratings, Elo or standards on any screen', async () => {
    const user = userEvent.setup()
    render(<CoachExplainer />)
    const said = await readAll(user)

    // Day one is not the day to explain the machinery. The numbers exist; a
    // ten-year-old meeting his coach does not need to hear their names.
    for (const words of said) {
      expect(words).not.toMatch(/\belo\b/i)
      expect(words).not.toMatch(/\brating(s)?\b/i)
      expect(words).not.toMatch(/\bstandard(s)?\b/i)
      expect(words).not.toMatch(/\bMT\.\d/)
    }
  })

  it('marks the explainer seen even when it is read all the way through', async () => {
    const user = userEvent.setup()
    render(<CoachExplainer />)
    expect(seen()).toBe(false)

    await readAll(user)
    await user.click(button(/^Let[\u2019']s go$/))

    expect(seen()).toBe(true)
  })
})
