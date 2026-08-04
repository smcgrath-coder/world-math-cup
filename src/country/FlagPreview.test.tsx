import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChargeGlyph, CrestPreview, FlagPreview } from './FlagPreview'
import { DEFAULT_FLAG } from './flag'
import type { FlagSpec } from './flag'

/** What the browser is actually being handed. */
function payloadOf(element: HTMLElement): string {
  const src = element.getAttribute('src') ?? ''
  return decodeURIComponent(src.replace(/^data:image\/svg\+xml,/, ''))
}

const onlyImage = (container: HTMLElement): HTMLElement => {
  const img = container.querySelector('img')
  if (img === null) throw new Error('no image rendered')
  return img
}

describe('FlagPreview', () => {
  it('renders the flag', () => {
    const { container } = render(<FlagPreview spec={DEFAULT_FLAG} />)
    const payload = payloadOf(onlyImage(container))
    expect(payload.startsWith('<svg ')).toBe(true)
    expect(payload).toContain('#FACC15')
  })

  it('re-renders when the spec changes', () => {
    const { container, rerender } = render(<FlagPreview spec={DEFAULT_FLAG} />)
    const before = payloadOf(onlyImage(container))
    const changed: FlagSpec = { ...DEFAULT_FLAG, colors: ['#E11D2E', '#FFFFFF', '#E11D2E'] }
    rerender(<FlagPreview spec={changed} />)
    const after = payloadOf(onlyImage(container))
    expect(after).not.toBe(before)
    expect(after).toContain('#E11D2E')
  })

  it('honours a requested size', () => {
    const { container } = render(<FlagPreview spec={DEFAULT_FLAG} width={24} />)
    expect(payloadOf(onlyImage(container))).toContain('width="24"')
  })

  it('is announced when it carries meaning', () => {
    render(<FlagPreview spec={DEFAULT_FLAG} label="Riondia's flag" />)
    expect(screen.getByRole('img', { name: "Riondia's flag" })).toBeInTheDocument()
  })

  it('is silent when it is decoration beside a label that already says it', () => {
    const { container } = render(<FlagPreview spec={DEFAULT_FLAG} />)
    expect(onlyImage(container)).toHaveAttribute('alt', '')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('never puts the drawing into the page as markup', () => {
    // The whole safety argument for generating SVG as a string rests on this:
    // the browser is handed an image, and an image cannot bring elements or
    // script into this document however it was built.
    const { container } = render(<FlagPreview spec={DEFAULT_FLAG} label="flag" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('treats a country name as text, never as markup', () => {
    // The name is the one genuinely free-form thing a child types. It reaches
    // the DOM as an attribute value set by React, and never reaches the
    // renderer at all.
    const hostile = '<img src=x onerror=alert(1)>'
    const { container } = render(<FlagPreview spec={DEFAULT_FLAG} label={hostile} />)
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(onlyImage(container)).toHaveAttribute('alt', hostile)
    expect(payloadOf(onlyImage(container))).not.toContain('onerror')
  })

  it('passes a class through, so the caller owns the layout', () => {
    const { container } = render(<FlagPreview spec={DEFAULT_FLAG} className="w-full" />)
    expect(onlyImage(container)).toHaveClass('w-full')
  })
})

describe('CrestPreview', () => {
  it('renders the crest', () => {
    const { container } = render(<CrestPreview spec={DEFAULT_FLAG} />)
    expect(payloadOf(onlyImage(container))).toContain('viewBox="0 0 300 340"')
  })

  it('shows the stars it is given', () => {
    const { container: none } = render(<CrestPreview spec={DEFAULT_FLAG} stars={0} />)
    const { container: two } = render(<CrestPreview spec={DEFAULT_FLAG} stars={2} />)
    expect(payloadOf(onlyImage(two)).length).toBeGreaterThan(payloadOf(onlyImage(none)).length)
  })
})

describe('ChargeGlyph', () => {
  it('renders one charge for the picker', () => {
    const { container } = render(<ChargeGlyph charge="bear" color="#FACC15" />)
    expect(payloadOf(onlyImage(container))).toContain('#FACC15')
  })

  it('renders an empty box for no badge, so the picker keeps its grid', () => {
    const { container } = render(<ChargeGlyph charge="none" color="#FACC15" />)
    expect(payloadOf(onlyImage(container))).toContain('<svg ')
  })
})
