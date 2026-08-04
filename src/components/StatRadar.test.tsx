import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatRadar } from './StatRadar'
import { CARD_STATS } from '../store/derive'
import type { Card } from '../store/types'

const flat = (value: number): Card => ({
  PAC: value,
  SHO: value,
  PAS: value,
  DRI: value,
  DEF: value,
  PHY: value,
})

const CENTRE = 60

/** The polygon the radar actually drew, as (x, y) pairs in viewBox units. */
function vertices(container: HTMLElement): [number, number][] {
  const polygon = container.querySelector('polygon[data-testid="radar-shape"]')
  if (polygon === null) throw new Error('no radar shape drawn')
  return (polygon.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return [x!, y!] as [number, number]
    })
}

/** How far each vertex sits from the centre. The whole point of a radar. */
const radii = (container: HTMLElement): number[] =>
  vertices(container).map(([x, y]) => Math.hypot(x - CENTRE, y - CENTRE))

const dashed = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll('[stroke-dasharray]'))

describe('StatRadar', () => {
  it('draws six axes, one per stat', () => {
    const { container } = render(<StatRadar card={flat(50)} />)
    expect(vertices(container)).toHaveLength(CARD_STATS.length)
    expect(container.querySelectorAll('[data-axis]')).toHaveLength(6)
  })

  it('puts a higher rating further from the centre', () => {
    const { container } = render(<StatRadar card={{ ...flat(30), SHO: 95 }} />)
    const [pac, sho] = radii(container)
    expect(sho!).toBeGreaterThan(pac!)
  })

  it('moves its points when the ratings change', () => {
    const { container, rerender } = render(<StatRadar card={flat(40)} />)
    const before = radii(container)
    rerender(<StatRadar card={{ ...flat(40), DRI: 90 }} />)
    const after = radii(container)

    expect(after).not.toEqual(before)
    // Only dribbling moved. A radar that shifted every axis when one stat rose
    // would be telling him something untrue about the other five.
    expect(after.filter((r, i) => r !== before[i])).toHaveLength(1)
  })

  it('is a regular hexagon when every stat is level', () => {
    const { container } = render(<StatRadar card={flat(62)} />)
    const [first, ...rest] = radii(container)
    for (const r of rest) expect(r).toBeCloseTo(first!, 6)
  })

  it('still reads as a shape when every stat is at the floor', () => {
    // 20 is the hard rating floor, so this is the smallest card the game can
    // produce. It has to look like a small hexagon rather than like a dot: a
    // radar that collapses to nothing on a bad week says something crueller
    // than the numbers do.
    const { container } = render(<StatRadar card={flat(20)} />)
    for (const r of radii(container)) expect(r).toBeGreaterThan(10)
  })

  it('still reads as a shape when one stat is far ahead of the rest', () => {
    const { container } = render(<StatRadar card={{ ...flat(20), SHO: 99 }} />)
    const rs = radii(container)
    const spike = rs[1]!
    const others = rs.filter((_, i) => i !== 1)

    // A spike on a solid core, not a needle from a point: the five short axes
    // still make a hexagon a third the size of the long one.
    for (const r of others) expect(r).toBeGreaterThan(spike / 4)
    expect(spike).toBeGreaterThan(Math.max(...others) * 1.8)
  })

  it('fills the radar when every stat is maxed', () => {
    const { container } = render(<StatRadar card={flat(99)} />)
    const ring = radii(container)
    for (const r of ring) expect(r).toBeCloseTo(44, 6)
  })

  it('marks provisional stats dashed and leaves proven ones solid', () => {
    const proven = render(<StatRadar card={flat(60)} />)
    expect(dashed(proven.container)).toHaveLength(0)

    const mixed = render(<StatRadar card={flat(60)} provisional={['DRI']} />)
    // The two edges that touch dribbling, plus its own point.
    expect(dashed(mixed.container).length).toBeGreaterThanOrEqual(3)
  })

  it('dashes every edge when nothing at all is proven yet', () => {
    const { container } = render(<StatRadar card={flat(50)} provisional={[...CARD_STATS]} />)
    expect(container.querySelectorAll('[data-edge][stroke-dasharray]')).toHaveLength(6)
  })

  it('says in words what the shape says in a picture', () => {
    render(
      <StatRadar
        card={{ PAC: 62, SHO: 48, PAS: 71, DRI: 55, DEF: 66, PHY: 40 }}
        provisional={['PHY']}
      />,
    )

    const name = screen.getByRole('img').getAttribute('aria-label') ?? ''
    expect(name).toContain('Pace 62')
    expect(name).toContain('Shooting 48')
    expect(name).toContain('Passing 71')
    expect(name).toContain('Dribbling 55')
    expect(name).toContain('Defending 66')
    expect(name).toMatch(/Physical 40[^,]*not yet proven/)
  })

  it('is the same drawing at card size and at full screen', () => {
    const small = render(<StatRadar card={flat(70)} size={140} />)
    const large = render(<StatRadar card={flat(70)} size={480} />)

    // Only the outer width and height change with size — every coordinate is
    // in viewBox units — so the shape cannot distort between the two.
    expect(radii(small.container)).toEqual(radii(large.container))
    const svg = (c: HTMLElement) => c.querySelector('svg')!
    expect(svg(small.container).getAttribute('width')).toBe('140')
    expect(svg(large.container).getAttribute('width')).toBe('480')
    expect(svg(small.container).getAttribute('viewBox')).toBe(
      svg(large.container).getAttribute('viewBox'),
    )
  })

  it('draws a valid shape even for ratings that could never happen', () => {
    // A corrupt store can hand any number to anything downstream of it. A NaN
    // in a points attribute is an SVG that does not draw at all.
    const { container } = render(
      <StatRadar card={{ ...flat(50), PAC: Number.NaN, SHO: 500, PAS: -80 }} />,
    )
    for (const [x, y] of vertices(container)) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
    for (const r of radii(container)) expect(r).toBeLessThanOrEqual(44.0001)
  })
})
