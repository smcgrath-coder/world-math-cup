import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Character } from './Character'

describe('Character', () => {
  it('points at the built file', () => {
    render(<Character name="rion-ready" />)
    expect(screen.getByTestId('character-rion-ready')).toHaveAttribute('src', '/art/rion-ready.png')
  })

  it('disappears entirely when the art has not been drawn yet', () => {
    // Eight captains are still to come, and a screen missing one has to look
    // finished rather than broken.
    render(<Character name="coach" />)
    fireEvent.error(screen.getByTestId('character-coach'))
    expect(screen.queryByTestId('character-coach')).toBeNull()
  })

  it('starts invisible and appears on load, so a missing file never flashes', () => {
    render(<Character name="rion-portrait" />)
    const img = screen.getByTestId('character-rion-portrait')
    expect(img.className).toContain('opacity-0')

    fireEvent.load(img)
    expect(img.className).toContain('opacity-100')
  })

  it('is decorative unless told otherwise', () => {
    render(<Character name="analyst-thinking" />)
    const img = screen.getByTestId('character-analyst-thinking')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  it('is announced when it carries something the words do not', () => {
    render(<Character name="rion-portrait" alt="You, in your kit" />)
    const img = screen.getByAltText('You, in your kit')
    expect(img).not.toHaveAttribute('aria-hidden')
  })
})
