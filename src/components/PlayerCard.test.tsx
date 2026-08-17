import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlayerCard } from './PlayerCard'
import { CARD_STATS, RATED_STANDARD_IDS, deriveOverall, deriveWorldRank } from '../store/derive'
import { OPPONENTS, OPPONENTS_BY_ID } from '../data/opponents'
import { DEFAULT_FLAG } from '../country/flag'
import type { Card, StandardRating } from '../store/types'
import type { Country } from '../store/storage'

const RIONDIA: Country = {
  name: 'Riondia',
  flag: DEFAULT_FLAG,
  kit: ['#0B2A5B', '#FACC15'],
  stars: 0,
}

const card = (over: Partial<Card> = {}): Card => ({
  PAC: 62,
  SHO: 48,
  PAS: 71,
  DRI: 55,
  DEF: 66,
  PHY: 40,
  ...over,
})

/**
 * A ratings map, the shape `deriveRatings` produces. Anything not named has
 * never been attempted, which is how a real card looks for weeks.
 *
 * `ratingClean` defaults to `rating` — no rust — unless a test names one
 * explicitly, which is the only way rust ever enters one of these fixtures.
 */
function ratings(
  named: Record<string, [rating: number, attempts: number, ratingClean?: number]> = {},
): Map<string, StandardRating> {
  const out = new Map<string, StandardRating>()
  for (const id of RATED_STANDARD_IDS) {
    const [rating, attempts, ratingClean] = named[id] ?? [50, 0]
    out.set(id, {
      standardId: id,
      rating,
      ratingClean: ratingClean ?? rating,
      attempts,
      lastSeenAt: attempts > 0 ? 1_000 : null,
      provisional: attempts < 5,
    })
  }
  return out
}

/** Every fraction standard, proven. */
const PROVEN_FRACTIONS = {
  'MT.4.NF.1': [72, 20] as [number, number],
  'MT.4.NF.2': [64, 12] as [number, number],
  'MT.4.NF.3': [58, 9] as [number, number],
  'MT.4.NF.4': [51, 7] as [number, number],
}

const brazil = OPPONENTS_BY_ID.brazil!
const statButton = (name: RegExp) => screen.getByRole('button', { name })

describe('PlayerCard', () => {
  it('renders his card from a ratings map', () => {
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings(PROVEN_FRACTIONS)} />)

    expect(screen.getByText('Riondia')).toBeInTheDocument()
    expect(screen.getByText(String(Math.round(deriveOverall(card()))))).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Riondia.*crest/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pace 62/ })).toBeInTheDocument()
  })

  it('shows all six stats as numbers beside the radar', () => {
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings()} />)

    // Named on the card and again on the radar's own axes.
    for (const stat of CARD_STATS) expect(screen.getAllByText(stat).length).toBeGreaterThan(0)
    expect(statButton(/Pace 62/)).toBeInTheDocument()
    expect(statButton(/Shooting 48/)).toBeInTheDocument()
    expect(statButton(/Passing 71/)).toBeInTheDocument()
    expect(statButton(/Dribbling 55/)).toBeInTheDocument()
    expect(statButton(/Defending 66/)).toBeInTheDocument()
    expect(statButton(/Physical 40/)).toBeInTheDocument()
  })

  it('shows where he sits in the world', () => {
    const strong = card({ PAC: 96, SHO: 96, PAS: 96, DRI: 96, DEF: 96, PHY: 96 })
    render(<PlayerCard country={RIONDIA} card={strong} ratings={ratings()} />)
    expect(deriveWorldRank(deriveOverall(strong))).toBe(1)
    expect(screen.getByText(/#1 in the world/)).toBeInTheDocument()
  })

  it('starts a new player near the bottom, which is where the number has room to go', () => {
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings()} />)
    const rank = deriveWorldRank(deriveOverall(card()))
    // The bottom quarter of the field, which is what "near the bottom" means.
    // This used to assert the bottom three, which only held because the old
    // hand-tuned ratings clustered at the tail. They are now spaced evenly from
    // the real FIFA order, so a 57 overall sits 54th of 58 rather than 56th.
    expect(rank).toBeGreaterThan((OPPONENTS.length + 1) * 0.75)
    expect(screen.getByText(`#${rank} in the world`)).toBeInTheDocument()
  })

  it('marks a stat that nothing has proven yet', () => {
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings(PROVEN_FRACTIONS)} />)

    // Fractions have twenty attempts behind them; geometry has none.
    expect(statButton(/Dribbling 55/).getAttribute('aria-label')).not.toMatch(/not yet proven/)
    expect(statButton(/Shooting 48/).getAttribute('aria-label')).toMatch(/not yet proven/)
    expect(screen.getByRole('img', { name: /Shooting 48 \(not yet proven\)/ })).toBeInTheDocument()
  })

  it('keeps a stat provisional while any topic under it is still unproven', () => {
    // Twenty attempts on equivalent fractions say nothing about the other three
    // fraction standards, and a card that claimed otherwise would be guessing.
    const partial = ratings({ 'MT.4.NF.1': [72, 20] })
    render(<PlayerCard country={RIONDIA} card={card()} ratings={partial} />)
    expect(statButton(/Dribbling 55/).getAttribute('aria-label')).toMatch(/not yet proven/)
  })

  it('opens a stat onto the standards beneath it, with their Montana codes', async () => {
    const user = userEvent.setup()
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings(PROVEN_FRACTIONS)} />)

    expect(screen.queryByText('MT.4.NF.1')).not.toBeInTheDocument()
    await user.click(statButton(/Dribbling 55/))

    const panel = screen.getByRole('region', { name: /Dribbling/ })
    expect(within(panel).getByText('Fractions')).toBeInTheDocument()
    for (const code of ['MT.4.NF.1', 'MT.4.NF.2', 'MT.4.NF.3', 'MT.4.NF.4']) {
      expect(within(panel).getByText(code)).toBeInTheDocument()
    }
    // The individual ratings, which is the scouting view and the parent view at
    // once: 51 on multiplying fractions is a different message from 72 overall.
    expect(within(panel).getByText('72')).toBeInTheDocument()
    expect(within(panel).getByText('51')).toBeInTheDocument()
    expect(statButton(/Dribbling 55/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the stat again when it is tapped a second time', async () => {
    const user = userEvent.setup()
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings(PROVEN_FRACTIONS)} />)

    await user.click(statButton(/Dribbling 55/))
    await user.click(statButton(/Dribbling 55/))

    expect(screen.queryByText('MT.4.NF.1')).not.toBeInTheDocument()
    expect(statButton(/Dribbling 55/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('swaps to the other stat rather than stacking panels', async () => {
    const user = userEvent.setup()
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings(PROVEN_FRACTIONS)} />)

    await user.click(statButton(/Dribbling 55/))
    await user.click(statButton(/Defending 66/))

    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.getByRole('region', { name: /Defending/ })).toBeInTheDocument()
  })

  it('says plainly which topics he has not played yet', async () => {
    const user = userEvent.setup()
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings(PROVEN_FRACTIONS)} />)

    await user.click(statButton(/Shooting 48/))

    const panel = screen.getByRole('region', { name: /Shooting/ })
    expect(within(panel).getByText('MT.4.G.1')).toBeInTheDocument()
    expect(within(panel).getAllByText(/not played yet/i).length).toBeGreaterThan(0)
  })

  it('explains that pace is speed across everything rather than a topic', async () => {
    const user = userEvent.setup()
    render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings()} />)

    await user.click(statButton(/Pace 62/))

    const panel = screen.getByRole('region', { name: /Pace/ })
    expect(within(panel).getByText(/how fast/i)).toBeInTheDocument()
    expect(within(panel).getByText('FLU.MULT')).toBeInTheDocument()
  })

  it('renders an opponent card from an Opponent', () => {
    render(<PlayerCard opponent={brazil} />)

    expect(screen.getByText('Brazil')).toBeInTheDocument()
    // Brazil are 5th now, not top. Spain won the 2026 tournament and lead the
    // ranking; Brazil still wear five stars, because stars are titles won and
    // the rating is form today. Those being different facts is the point.
    expect(screen.getByText('89')).toBeInTheDocument()
    expect(screen.getByText('#5 in the world')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Brazil.*crest.*5/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pace \d+/ })).toBeInTheDocument()
  })

  it('scouts an opponent onto the topics behind the stat, without inventing ratings', async () => {
    const user = userEvent.setup()
    render(<PlayerCard opponent={brazil} />)

    await user.click(statButton(/Dribbling \d+/))

    const panel = screen.getByRole('region', { name: /Dribbling/ })
    expect(within(panel).getByText('MT.4.NF.1')).toBeInTheDocument()
    // Brazil has no attempts log, so no per-standard number is claimed for it.
    expect(within(panel).queryByText(/not played yet/i)).not.toBeInTheDocument()
    expect(within(panel).getByText(/face/i)).toBeInTheDocument()
  })

  it('never dashes an opponent, who has nothing left to prove', () => {
    const { container } = render(<PlayerCard opponent={brazil} />)
    expect(container.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
  })

  it('renders his card and Brazil’s with the same frame, so they can be compared', () => {
    const mine = render(<PlayerCard country={RIONDIA} card={card()} ratings={ratings()} />)
    const theirs = render(<PlayerCard opponent={brazil} />)

    const shape = (c: HTMLElement) => c.querySelectorAll('[data-testid="radar-shape"]').length
    const stats = (c: HTMLElement) => c.querySelectorAll('[data-stat]').length
    expect(shape(mine.container)).toBe(shape(theirs.container))
    expect(stats(mine.container)).toBe(CARD_STATS.length)
    expect(stats(theirs.container)).toBe(CARD_STATS.length)
  })

  it('puts the country name in as text, never as markup', () => {
    const nasty: Country = { ...RIONDIA, name: '<img src=x onerror=alert(1)>' }
    const { container } = render(
      <PlayerCard country={nasty} card={card()} ratings={ratings()} />,
    )

    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})

describe('PlayerCard — rust', () => {
  it('shows nothing extra when no cardClean is given at all — opponents, mainly', () => {
    render(<PlayerCard opponent={brazil} />)
    expect(screen.queryByTestId('rust-ghost')).toBeNull()
  })

  it('shows nothing extra when nothing is actually rusted', () => {
    render(
      <PlayerCard country={RIONDIA} card={card()} cardClean={card()} ratings={ratings()} />,
    )
    expect(screen.queryByTestId('rust-ghost')).toBeNull()
  })

  it('shows the clean number as a subdued extension once a stat is visibly rusted', () => {
    const clean = card({ DRI: 60 }) // displayed DRI is 55 — five points under
    render(<PlayerCard country={RIONDIA} card={card()} cardClean={clean} ratings={ratings()} />)

    const dri = statButton(/Dribbling 55/)
    expect(within(dri).getByTestId('rust-ghost')).toHaveTextContent('60')
    expect(dri.getAttribute('aria-label')).toMatch(/60 underneath/)
    // Untouched stats stay exactly as they were.
    expect(statButton(/Shooting 48/).getAttribute('aria-label')).not.toMatch(/underneath/)
  })

  it('says nothing when the gap is real but too small to round to a different number', () => {
    // 55.3 clean against a displayed 55 — genuinely more underneath it, but
    // not by enough that he could ever see the difference.
    const clean = card({ DRI: 55.3 })
    render(<PlayerCard country={RIONDIA} card={card()} cardClean={clean} ratings={ratings()} />)
    expect(screen.queryByTestId('rust-ghost')).toBeNull()
  })

  it('shows the clean number beside a rusted standard in the detail view, and nothing beside a settled one', async () => {
    const user = userEvent.setup()
    const rusted = ratings({
      'MT.4.NF.1': [72, 20, 72], // settled, no rust
      'MT.4.NF.2': [58, 12, 64], // six points rusted
    })
    render(<PlayerCard country={RIONDIA} card={card()} ratings={rusted} />)

    await user.click(statButton(/Dribbling/))
    const rows = screen.getAllByTestId('rust-ghost')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('64')
  })

  it('never shows a clean number on an opponent’s card, which has no rust mechanic at all', async () => {
    const user = userEvent.setup()
    render(<PlayerCard opponent={brazil} />)
    await user.click(statButton(/Pace/))
    expect(screen.queryByTestId('rust-ghost')).toBeNull()
  })
})
