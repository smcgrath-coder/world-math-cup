import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostMatch, agoLabel, climbLine, crossings, summarise, verdictFor } from './PostMatch'
import { OPPONENTS_BY_ID } from '../data/opponents'
import { getStore, resetStoreForTest } from '../store/storage'
import type { AttemptDraft } from '../store/storage'
import type { Attempt } from '../store/types'
import type { CampaignOutcome } from '../engine/campaign'

const BRAZIL = OPPONENTS_BY_ID.brazil!
const CURACAO = OPPONENTS_BY_ID.curacao!

const NOW = Date.UTC(2026, 7, 10, 18, 0, 0)
const MINUTE = 60_000
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  getStore().setCountry({
    name: 'Montana',
    flag: { layout: 'bands-h', colors: ['#fff', '#000', '#fff'], charge: 'none', chargeColor: '#000' },
    kit: ['#fbbf24', '#14532d'],
    stars: 0,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------

let clock = NOW - 60 * MINUTE

function draft(over: Partial<AttemptDraft> = {}): AttemptDraft {
  clock += 1000
  return {
    at: clock,
    standardId: 'MT.4.NF.1',
    difficulty: 40,
    params: { a: 1, b: 2, mult: 2, targetDen: 4 },
    given: '2',
    correct: true,
    latencyMs: 4000,
    context: 'match',
    ...over,
  }
}

/** Write attempts the way a real session would, so the store mints the ids. */
const save = (drafts: AttemptDraft[]): Attempt[] => getStore().appendAttempts(drafts)

const said = (): string => document.body.textContent ?? ''

const classNames = (): string[] =>
  [...document.querySelectorAll('*')].flatMap((el) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0),
  )

/**
 * A history, then a match played above it.
 *
 * The history settles MT.4.NF.1 around its seed with enough attempts that it is
 * no longer provisional; the match then answers the same standard correctly at a
 * difficulty well above that rating, which is exactly the shape Elo pays for.
 */
function lossThatLifted(): void {
  clock = NOW - 60 * MINUTE
  save(
    Array.from({ length: 8 }, (_, i) =>
      draft({ difficulty: 30, correct: i % 2 === 0, context: 'training' }),
    ),
  )
  save([
    ...Array.from({ length: 6 }, () => draft({ difficulty: 78, correct: true, matchId: 'm1' })),
    draft({ difficulty: 78, correct: false, matchId: 'm1', given: '-1' }),
  ])
}

const renderLoss = (): void => {
  render(<PostMatch matchId="m1" opponent={BRAZIL} score={[1, 3]} />)
}

// ---------------------------------------------------------------------------

describe('PostMatch', () => {
  it('leads with the rise, not the loss, when a defeat still lifted the rating', () => {
    lossThatLifted()
    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.climbed).toBe(true)
    expect(summary.rise?.stat).toBe('DRI')

    renderLoss()

    const headline = screen.getByTestId('headline')
    expect(headline).toHaveTextContent(/your rating went up/i)
    expect(headline).toHaveTextContent(String(summary.rise!.to))

    // The rise is the first thing said about the match, above what moved,
    // above the courage line, above everything.
    const text = said()
    expect(text.indexOf('Your rating went up')).toBeGreaterThan(-1)
    expect(text.indexOf('Your rating went up')).toBeLessThan(text.indexOf('What moved'))

    // The defeat is still stated plainly, inside the same card.
    expect(headline).toHaveTextContent('Brazil took that one.')
    expect(headline).toHaveTextContent(/played above yourself against a side rated 89/i)
    // And the ordinary defeat verdict has been replaced rather than added to.
    expect(screen.queryByTestId('verdict')).toBeNull()
  })

  it('leads with the rise after a draw too, but never over a win', () => {
    lossThatLifted()
    render(<PostMatch matchId="m1" opponent={BRAZIL} score={[2, 2]} />)
    expect(screen.getByTestId('headline')).toHaveTextContent('Brazil held you to a draw.')

    cleanup()
    // A win is its own headline and does not need the rating to justify it.
    render(<PostMatch matchId="m1" opponent={BRAZIL} score={[3, 1]} />)
    expect(screen.queryByTestId('headline')).toBeNull()
    expect(screen.getByTestId('verdict')).toHaveTextContent('That’s the win. Brazil beaten.')
  })

  it('shows the world ranking climbing when it climbed', () => {
    lossThatLifted()
    const summary = summarise(getStore().getState().attempts, 'm1')

    renderLoss()

    if (summary.rankTo < summary.rankFrom) {
      expect(said()).toContain(`#${summary.rankFrom} in the world up to #${summary.rankTo}`)
    } else {
      expect(said()).not.toMatch(/up to #/)
    }
  })

  it('never claims a rise he cannot see on his own card', () => {
    clock = NOW - 60 * MINUTE
    save(Array.from({ length: 8 }, () => draft({ difficulty: 40, correct: true, context: 'training' })))
    // One question, at a difficulty far below the rating it folds into: real
    // movement, nowhere near a whole point of it.
    save([draft({ difficulty: 5, correct: true, matchId: 'm1' })])

    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.rise).toBeNull()
    expect(summary.climbed).toBe(false)

    render(<PostMatch matchId="m1" opponent={BRAZIL} score={[0, 2]} />)

    expect(screen.queryByTestId('headline')).toBeNull()
    expect(screen.getByTestId('verdict')).toHaveTextContent(
      'Brazil took that one. You were still going at them at the end.',
    )
    expect(said()).toMatch(/nothing turned over a whole point this time/i)
  })

  it('reads the match back by matchId and takes nothing from the match screen', () => {
    clock = NOW - 60 * MINUTE
    // An earlier match, with its own bravery and its own misses.
    save([
      draft({ matchId: 'm0', shot: 'bicycle', correct: false, given: '-1' }),
      draft({ matchId: 'm0', context: 'tackleback', correct: true }),
    ])
    save([
      draft({ matchId: 'm1', shot: 'outside18', correct: false, given: '-1' }),
      draft({ matchId: 'm1', context: 'tackleback', correct: true }),
      draft({ matchId: 'm1', context: 'tackleback', correct: true }),
    ])

    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.played).toHaveLength(3)
    expect(summary.played.every((a) => a.matchId === 'm1')).toBe(true)
    expect(summary.courage.hardShotsAttempted).toBe(1)
    expect(summary.courage.tackleBacksWon).toBe(2)

    // No state, no log, no score beyond the two numbers the match cannot store.
    render(<PostMatch matchId="m1" opponent={CURACAO} score={[2, 2]} />)
    expect(screen.getByTestId('courage')).toHaveTextContent(/hard ball once/i)
    expect(screen.getByTestId('courage')).toHaveTextContent(/straight back twice/i)
  })

  it('celebrates the hard ball when not one of them went in', () => {
    clock = NOW - 60 * MINUTE
    save([
      draft({ matchId: 'm1', shot: 'bicycle', correct: false, given: '-1' }),
      draft({ matchId: 'm1', shot: 'outside18', correct: false, given: '-1' }),
      draft({ matchId: 'm1', shot: 'bicycle', correct: false, given: '-1' }),
    ])

    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.courage.hardShotsAttempted).toBe(3)
    expect(summary.courage.hardShotsScored).toBe(0)

    render(<PostMatch matchId="m1" opponent={BRAZIL} score={[0, 4]} />)

    const courage = screen.getByTestId('courage')
    expect(courage).toHaveTextContent(
      'You went for the hard ball three times out there. Every one of them counted the moment you chose it.',
    )
    // Not a word about whether any of them went in, and no score out of three.
    expect(courage.textContent).not.toMatch(/went in|scored|out of|none of/i)
    expect(said()).not.toMatch(/\bwrong\b|\bfail(ed|ure)?\b|\bunlucky\b/i)
  })

  it('counts the hard ball in words a ten-year-old would use', () => {
    clock = NOW - 60 * MINUTE
    save([
      draft({ matchId: 'm1', shot: 'bicycle', correct: false, given: '-1' }),
      draft({ matchId: 'm1', shot: 'outside18', correct: true }),
      draft({ matchId: 'm1', context: 'tackleback', correct: true }),
    ])

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[1, 2]} />)
    expect(screen.getByTestId('courage')).toHaveTextContent(
      'You went for the hard ball twice out there. Both of them counted the moment you chose it.',
    )
    expect(screen.getByTestId('courage')).toHaveTextContent(
      'And you won the ball straight back once after it came loose.',
    )
  })

  it('says nothing about courage when there was none to report', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ matchId: 'm1' }), draft({ matchId: 'm1', correct: false, given: '-1' })])

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[1, 0]} />)
    expect(screen.queryByTestId('courage')).toBeNull()
    // And no guilt about it either.
    expect(said()).not.toMatch(/could have|why not|next time try/i)
  })

  it('shows what moved in both directions, and never in alarm colours', () => {
    clock = NOW - 60 * MINUTE
    save(Array.from({ length: 8 }, () => draft({ difficulty: 40, correct: true, context: 'training' })))
    save(Array.from({ length: 6 }, () => draft({ difficulty: 80, correct: false, matchId: 'm1', given: '-1' })))

    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.moves.some((m) => m.to < m.from)).toBe(true)

    render(<PostMatch matchId="m1" opponent={BRAZIL} score={[0, 3]} />)

    const moved = screen.getByTestId('moved')
    expect(moved).toHaveTextContent('Dribbling')
    expect(classNames().filter((c) => /red|rose|crimson/i.test(c))).toEqual([])
  })

  it('opens the film room and lets him walk straight back out of it', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ matchId: 'm1', correct: false, given: '-1' })])

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[1, 2]} />)
    // Leaving is the loud button; the film room is offered, never insisted on.
    expect(screen.getByRole('button', { name: /head back/i })).toBeInTheDocument()
    expect(said()).toMatch(/you can skip it/i)

    fireEvent.click(screen.getByRole('button', { name: /^film room$/i }))
    expect(said()).toMatch(/one ball got away/i)

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByTestId('scoreline')).toHaveTextContent('Montana 1–2 Curaçao')
  })

  it('never says wrong, anywhere, however the match went', () => {
    lossThatLifted()
    renderLoss()
    expect(said()).not.toMatch(/\bwrong\b/i)
    expect(said()).not.toMatch(/\bincorrect\b|\bfail(ed|ure)?\b|\bbad\b/i)
    expect(said()).not.toMatch(/[✗✘]/)
    expect(classNames().filter((c) => /red|rose|crimson/i.test(c))).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('campaign news', () => {
  it('says nothing about the World Cup for an ordinary exhibition match', () => {
    lossThatLifted()
    renderLoss()
    expect(screen.queryByTestId('campaign-news')).toBeNull()
  })

  it('reports what happened to the run, in addition to the match itself', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ matchId: 'm1' }), draft({ matchId: 'm1', correct: false, given: '-1' })])

    render(
      <PostMatch
        matchId="m1"
        opponent={CURACAO}
        score={[1, 0]}
        campaignOutcome={{ kind: 'qualified' }}
      />,
    )

    const news = screen.getByTestId('campaign-news')
    expect(news).toHaveTextContent('Qualified!')
    expect(news).toHaveTextContent(/group stage draw is in/i)
  })

  it('still leads with the rating rise on an eliminated campaign loss, exactly as any other losing rise does', () => {
    lossThatLifted()

    render(
      <PostMatch
        matchId="m1"
        opponent={BRAZIL}
        score={[1, 3]}
        campaignOutcome={{ kind: 'eliminated-in-knockout', round: 'sf' }}
      />,
    )

    // Same headline, same "your rating went up" framing as an ordinary loss —
    // the campaign wiring must never touch this ordering.
    const headline = screen.getByTestId('headline')
    expect(headline).toHaveTextContent(/your rating went up/i)
    expect(screen.queryByTestId('verdict')).toBeNull()

    // The campaign card is news on top, never a replacement for any of that.
    const news = screen.getByTestId('campaign-news')
    expect(news).toHaveTextContent('The run ends here')
    expect(news).toHaveTextContent(/Semi-Final/i)

    // And it comes after everything else, never ahead of the rise.
    const text = said()
    expect(text.indexOf('Your rating went up')).toBeLessThan(text.indexOf('World Cup'))
  })

  it('never lets the campaign outcome bring back the word the rest of the screen refuses to say', () => {
    render(
      <PostMatch
        matchId="m1"
        opponent={CURACAO}
        score={[0, 2]}
        campaignOutcome={{ kind: 'eliminated-in-group' }}
      />,
    )
    expect(said()).not.toMatch(/\bwrong\b/i)
    expect(said()).not.toMatch(/\byou lost\b|\byou failed\b|\byou're out\b/i)
  })

  it('shows the celebration for lifting the cup, and nowhere else in the campaign card', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ matchId: 'm1' }), draft({ matchId: 'm1', correct: false, given: '-1' })])

    render(
      <PostMatch
        matchId="m1"
        opponent={CURACAO}
        score={[3, 0]}
        campaignOutcome={{ kind: 'champion' }}
      />,
    )

    expect(screen.getByTestId('character-rion-celebration')).toBeInTheDocument()
  })

  it('never shows the celebration on an outcome short of the cup itself, however far the run got', () => {
    // `docs/art/placement.md` is binding: an unambiguous win only, and a
    // knockout round survived still has a next match riding on it.
    const outcomes: CampaignOutcome[] = [
      { kind: 'qualifying-continues', wins: 1, losses: 0, remaining: 2 },
      { kind: 'qualified' },
      { kind: 'qualifying-failed' },
      { kind: 'group-continues' },
      { kind: 'advanced-to-knockout' },
      { kind: 'eliminated-in-group' },
      { kind: 'advanced', round: 'sf', nextRound: 'final' },
      { kind: 'eliminated-in-knockout', round: 'final' },
    ]

    for (const campaignOutcome of outcomes) {
      clock = NOW - 60 * MINUTE
      save([draft({ matchId: `m-${campaignOutcome.kind}` })])
      const { unmount } = render(
        <PostMatch
          matchId={`m-${campaignOutcome.kind}`}
          opponent={CURACAO}
          score={[1, 0]}
          campaignOutcome={campaignOutcome}
        />,
      )
      expect(
        screen.queryByTestId('character-rion-celebration'),
        campaignOutcome.kind,
      ).toBeNull()
      unmount()
    }
  })
})

// ---------------------------------------------------------------------------

describe('rust', () => {
  const FIVE_WEEKS_MS = 5 * 7 * 24 * 60 * 60 * 1000

  /** A standard settled well past provisional, left alone for five weeks, then played correctly all through this match — visibly rusted at kickoff, some of it burned off by full time. */
  function rustyThenBurned(): void {
    const historyAt = NOW - FIVE_WEEKS_MS - 60 * MINUTE
    clock = historyAt
    save(Array.from({ length: 8 }, () => draft({ difficulty: 60, correct: true, context: 'match', at: historyAt })))
    clock = NOW
    save(Array.from({ length: 6 }, () => draft({ difficulty: 60, correct: true, matchId: 'm1', at: NOW })))
  }

  it('names a standard that shook some rust off this match', () => {
    rustyThenBurned()
    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.rustBurnedOn).toBe('MT.4.NF.1')

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[3, 0]} />)
    const card = screen.getByTestId('rust-burned')
    expect(card).toHaveTextContent(/equivalent fractions/i)
    expect(card).toHaveTextContent(/rust/i)
  })

  it('says nothing at all when nothing played this match was ever rusted', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ matchId: 'm1' }), draft({ matchId: 'm1', correct: false, given: '-1' })])

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[1, 0]} />)
    expect(screen.queryByTestId('rust-burned')).toBeNull()
  })

  it('says nothing when the gap at kickoff was real but too small to ever have shown up as a different number', () => {
    // A few minutes between training and the match, on the same standard —
    // genuinely nonzero elapsed time, and nowhere near enough of it to round
    // to anything he could have seen as rust. Recovering from dust nobody
    // could see is not a thing this card exists to announce.
    clock = NOW - 5 * MINUTE
    save(Array.from({ length: 8 }, () => draft({ difficulty: 60, correct: true, context: 'match' })))
    clock = NOW
    save(Array.from({ length: 6 }, () => draft({ difficulty: 60, correct: true, matchId: 'm1' })))

    const summary = summarise(getStore().getState().attempts, 'm1')
    expect(summary.rustBurnedOn).toBeNull()
    render(<PostMatch matchId="m1" opponent={CURACAO} score={[3, 0]} />)
    expect(screen.queryByTestId('rust-burned')).toBeNull()
  })

  it('never mentions a day, a week, or being away, on the rust card or anywhere else on the screen', () => {
    rustyThenBurned()
    render(<PostMatch matchId="m1" opponent={CURACAO} score={[3, 0]} />)
    const card = screen.getByTestId('rust-burned')
    expect(card.textContent).not.toMatch(/\bdays?\b|\bweeks?\b|\bmonths?\b/i)
    // "away" on its own is an existing football idiom in this game — "a ball
    // got away from you" — so only the phrasing that would actually mean
    // *he* was away is checked for, and only on the card this feature added.
    expect(card.textContent).not.toMatch(/\byou('?re| were)? away\b|\btime away\b|absen|since you|last (time|played)/i)
  })
})

// ---------------------------------------------------------------------------

describe('crossings', () => {
  const at = (over: Partial<Attempt>): Attempt => ({
    id: 'a000000000001',
    at: NOW - 21 * DAY,
    standardId: 'MT.4.NF.1',
    difficulty: 40,
    params: {},
    given: '2',
    correct: true,
    latencyMs: 3000,
    context: 'match',
    ...over,
  })

  it('fires when a standard clears a level that used to beat him', () => {
    const earlier = [at({ id: 'a1', correct: false, difficulty: 55 })]
    const played = [at({ id: 'a9', correct: true, difficulty: 55, at: NOW })]

    const [crossing] = crossings(played, earlier)
    expect(crossing?.standardId).toBe('MT.4.NF.1')
    expect(crossing?.level).toBe(55)
    expect(crossing?.when).toBe(NOW - 21 * DAY)
  })

  it('does not fire when he had already cleared that level before today', () => {
    const earlier = [
      at({ id: 'a1', correct: false, difficulty: 55 }),
      at({ id: 'a2', correct: true, difficulty: 55 }),
    ]
    const played = [at({ id: 'a9', correct: true, difficulty: 60, at: NOW })]

    expect(crossings(played, earlier)).toEqual([])
  })

  it('does not fire when today was easier than the one that beat him', () => {
    const earlier = [at({ id: 'a1', correct: false, difficulty: 70 })]
    const played = [at({ id: 'a9', correct: true, difficulty: 40, at: NOW })]

    expect(crossings(played, earlier)).toEqual([])
  })

  it('does not fire off nothing at all', () => {
    expect(crossings([at({ id: 'a9', correct: true, at: NOW })], [])).toEqual([])
  })

  it('does not fire on a miss from inside the same match', () => {
    const played = [
      at({ id: 'a8', correct: false, difficulty: 55, at: NOW }),
      at({ id: 'a9', correct: true, difficulty: 60, at: NOW }),
    ]
    expect(crossings(played, [])).toEqual([])
  })

  it('will not count a tackle-back on either side of the claim', () => {
    // A scaffold is deliberately far easier than the question it is helping
    // with, so it is evidence about the scaffold and not about the standard.
    const earlier = [at({ id: 'a1', correct: false, difficulty: 55, context: 'tackleback' })]
    const played = [at({ id: 'a9', correct: true, difficulty: 60, at: NOW })]
    expect(crossings(played, earlier)).toEqual([])

    const beaten = [at({ id: 'a1', correct: false, difficulty: 55 })]
    const scaffolded = [at({ id: 'a9', correct: true, difficulty: 60, at: NOW, context: 'tackleback' })]
    expect(crossings(scaffolded, beaten)).toEqual([])
  })

  it('says so on the screen, with how long ago it was', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ at: NOW - 21 * DAY, difficulty: 60, correct: false, given: '-1', context: 'training' })])
    save([draft({ at: NOW, difficulty: 62, correct: true, matchId: 'm1' })])

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[2, 1]} />)

    const crossed = screen.getByTestId('crossed')
    expect(crossed).toHaveTextContent('Three weeks ago, this one beat you.')
    expect(crossed).toHaveTextContent('Equivalent fractions')
    expect(crossed).toHaveTextContent(/no easier than the one that got you then/i)
  })

  it('says nothing when there is nothing true to say', () => {
    clock = NOW - 60 * MINUTE
    save([draft({ at: NOW - 21 * DAY, difficulty: 60, correct: true, context: 'training' })])
    save([draft({ at: NOW, difficulty: 62, correct: true, matchId: 'm1' })])

    render(<PostMatch matchId="m1" opponent={CURACAO} score={[2, 1]} />)
    expect(screen.queryByTestId('crossed')).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('the words', () => {
  it('calls a defeat a defeat and only calls it close when it was', () => {
    expect(verdictFor(3, 1, 'Japan')).toBe('That’s the win. Japan beaten.')
    expect(verdictFor(2, 2, 'Japan')).toBe('A point each, and they knew they’d been in a game.')
    expect(verdictFor(1, 2, 'Japan')).toMatch(/edged it/)
    expect(verdictFor(0, 4, 'Japan')).toBe(
      'Japan took that one. You were still going at them at the end.',
    )
    expect(verdictFor(0, 4, 'Japan')).not.toMatch(/close|edged|unlucky/i)
  })

  it('only credits playing above himself when the other side really was better', () => {
    expect(climbLine(BRAZIL, 1, 3, 60)).toMatch(/played above yourself against a side rated 89/)
    expect(climbLine(CURACAO, 1, 3, 90)).not.toMatch(/above yourself/)
    expect(climbLine(CURACAO, 1, 3, 90)).toMatch(/pitched above where you’re rated/)
  })

  it('states the result first and plainly, even while leading with the rise', () => {
    expect(climbLine(BRAZIL, 1, 3, 60).startsWith('Brazil took that one.')).toBe(true)
    expect(climbLine(BRAZIL, 2, 2, 60).startsWith('Brazil held you to a draw.')).toBe(true)
  })

  it('is only as precise about time as it can honestly be', () => {
    expect(agoLabel(2 * 60 * 60 * 1000)).toBe('earlier today')
    expect(agoLabel(1.5 * DAY)).toBe('yesterday')
    expect(agoLabel(4 * DAY)).toBe('four days ago')
    expect(agoLabel(21 * DAY)).toBe('three weeks ago')
    expect(agoLabel(120 * DAY)).toBe('four months ago')
  })
})

describe('summarise, with history that arrived from another device', () => {
  it('counts synced attempts as before the match when they happened before it', () => {
    // Ids pulled from another device are namespaced (`ipad-a000001`) and sort
    // after every local `a…` id. Slicing "before" on the id alone therefore
    // dropped a month of the iPad's history from the before-card the moment
    // the laptop played a match, and counted it as "after".
    const remote = (i: number, at: number): Attempt => ({
      id: `ipad-a${String(i).padStart(6, '0')}`,
      at,
      standardId: 'MT.4.NF.1',
      difficulty: 70,
      params: {},
      given: '1',
      correct: true,
      latencyMs: 2000,
      context: 'training',
    })
    const local = (i: number, at: number, matchId?: string): Attempt => ({
      ...remote(i, at),
      id: `a${String(i).padStart(6, '0')}`,
      difficulty: 40,
      correct: false,
      ...(matchId === undefined ? {} : { matchId, context: 'match' as const }),
    })
    const kickoff = NOW - 10 * MINUTE
    const attempts: Attempt[] = [
      ...Array.from({ length: 30 }, (_, i) => remote(i + 1, kickoff - (40 - i) * MINUTE)),
      local(1, kickoff, 'm1'),
      local(2, kickoff + MINUTE, 'm1'),
    ]

    const withHistory = summarise(attempts, 'm1')
    const withoutHistory = summarise(attempts.filter((a) => a.matchId === 'm1'), 'm1')

    // Thirty right answers at difficulty 70 before kickoff lift the "before"
    // card well above a blank one. If they were being read as "after", both
    // summaries would start from the same seed.
    const before = (s: ReturnType<typeof summarise>) => s.moves.find((m) => m.stat === 'DRI')?.from ?? null
    expect(before(withHistory)).not.toBeNull()
    expect(before(withHistory)!).toBeGreaterThan(before(withoutHistory) ?? 50)
  })
})
