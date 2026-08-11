import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilmRoom, groupMisses, missLine, statFor, worst } from './FilmRoom'
import { generatorFor } from '../engine/items/generators'
import { makeRng } from '../engine/items/rng'
import type { Item } from '../engine/items/types'
import { getStore, resetStoreForTest } from '../store/storage'
import type { AttemptDraft } from '../store/storage'
import type { Attempt } from '../store/types'

const NOW = Date.UTC(2026, 7, 10, 18, 0, 0)

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------

/** A real item from a real generator. Nothing in here is a hand-written fixture. */
const itemFor = (standardId: string, difficulty: number, seed = 1): Item =>
  generatorFor(standardId)!.generate(difficulty, makeRng(seed))

let clock = NOW - 600_000

/** Write an attempt for an item, exactly as a match would, and pair the two. */
function play(
  item: Item,
  given: string,
  over: Partial<AttemptDraft> = {},
): { attempt: Attempt; item: Item } {
  clock += 1000
  const [attempt] = getStore().appendAttempts([
    {
      at: clock,
      standardId: item.standardId,
      difficulty: item.difficulty,
      params: item.params,
      given,
      correct: false,
      latencyMs: 5000,
      context: 'match',
      matchId: 'm1',
      ...over,
    },
  ])
  return { attempt: attempt!, item }
}

const questionsOf = (...played: { attempt: Attempt; item: Item }[]): Map<string, Item> =>
  new Map(played.map((p) => [p.attempt.id, p.item]))

const said = (): string => document.body.textContent ?? ''

const classNames = (): string[] =>
  [...document.querySelectorAll('*')].flatMap((el) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0),
  )

const missCards = (): HTMLElement[] => screen.queryAllByTestId('film-miss')

// ---------------------------------------------------------------------------

describe('FilmRoom', () => {
  beforeEach(() => {
    clock = NOW - 600_000
  })

  it('shows every ball that got away in this match, and nothing from any other', () => {
    const one = play(itemFor('MT.4.NF.1', 30), '-1')
    const two = play(itemFor('FLU.MULT', 60, 3), '-1')
    // Another match, and a right answer in this one. Neither belongs here.
    play(itemFor('MT.4.NF.1', 30, 5), '-1', { matchId: 'm0' })
    play(itemFor('MT.4.NF.1', 30, 7), one.item.answer.canonical, { correct: true })

    render(<FilmRoom matchId="m1" opponentName="Brazil" questions={questionsOf(one, two)} />)

    expect(missCards()).toHaveLength(2)
    expect(said()).toContain(one.item.prompt)
    expect(said()).toContain(two.item.prompt)
    expect(said()).toMatch(/two balls got away/i)

    const others = getStore().getState().attempts.filter((a) => a.matchId === 'm0')
    expect(others).toHaveLength(1)
    expect(said()).not.toContain(itemFor('MT.4.NF.1', 30, 5).prompt)
  })

  it('puts the worked steps under every one of them', () => {
    const one = play(itemFor('MT.4.NF.1', 30), '-1')
    const two = play(itemFor('MT.4.NBT.5', 50, 4), '-1')

    render(<FilmRoom matchId="m1" questions={questionsOf(one, two)} />)

    for (const { item } of [one, two]) {
      expect(item.workedSteps.length).toBeGreaterThan(0)
      for (const step of item.workedSteps) expect(said()).toContain(step)
      expect(said()).toContain(item.answer.canonical)
    }
    expect(screen.getAllByText(/how it goes/i)).toHaveLength(2)
  })

  it('names a mistake it recognises, in that mistake’s own words', () => {
    const item = itemFor('MT.4.NF.1', 30)
    const known = item.misconceptions[0]!
    const one = play(item, known.signature, { misconceptionId: known.id })

    render(<FilmRoom matchId="m1" questions={questionsOf(one)} />)

    expect(said()).toContain('Ah — I know what happened there.')
    expect(said()).toContain(known.explanation)
    // The specific explanation, not the generic line it would otherwise get.
    expect(said()).not.toContain('Different answer here.')
  })

  it('calls a near miss a save and an off-target one nothing at all', () => {
    // 7 × 8 = 56. One out is a save; 3 never troubled the goal.
    const item = itemFor('FLU.MULT', 80, 3)
    const answer = Number(item.answer.canonical)
    const near = String(answer + 1)
    expect(item.misconceptions.some((m) => m.signature === near)).toBe(false)

    const saved = play(item, near)
    const off = play(itemFor('FLU.MULT', 80, 5), '1')

    render(<FilmRoom matchId="m1" questions={questionsOf(saved, off)} />)

    expect(said()).toContain('Close — that one was on target.')
    expect(said()).toMatch(/the keeper got a hand to it/i)
    expect(said()).toContain('Let’s look at this one.')
    expect(said()).toMatch(/different answer here/i)
  })

  it('tells him a tackle-back the clock reached first cost him nothing', () => {
    const one = play(itemFor('MT.4.NF.1', 20), '', { context: 'tackleback' })

    render(<FilmRoom matchId="m1" questions={questionsOf(one)} />)

    expect(said()).toContain('The clock got to that one first.')
    expect(said()).toMatch(/cost you nothing then and it costs you nothing now/i)
    // Nothing pretending to be an answer he gave.
    expect(said()).not.toMatch(/you put down\s*\./i)
    expect(said()).toMatch(/tackle-back/i)
  })

  it('groups them by domain, and names a pattern only when there is one', () => {
    const a = play(itemFor('MT.4.NF.1', 30), '-1')
    const b = play(itemFor('MT.4.NF.3', 40, 2), '-1')
    const c = play(itemFor('FLU.MULT', 40, 6), '-1')

    render(<FilmRoom matchId="m1" questions={questionsOf(a, b, c)} />)

    const groups = screen.getAllByTestId('film-group')
    expect(groups.map((g) => g.getAttribute('data-stat'))).toEqual(['PAC', 'DRI'])

    const dribbling = groups.find((g) => g.getAttribute('data-stat') === 'DRI')!
    expect(dribbling).toHaveTextContent(/dribbling — fractions/i)
    expect(dribbling).toHaveTextContent(/two of them came from the same place/i)

    const pace = groups.find((g) => g.getAttribute('data-stat') === 'PAC')!
    expect(pace).not.toHaveTextContent(/came from the same place/i)
  })

  it('names one thing to work on and not six', () => {
    const played = [
      play(itemFor('MT.4.NF.1', 30), '-1'),
      play(itemFor('MT.4.NF.3', 40, 2), '-1'),
      play(itemFor('MT.4.NF.3', 40, 8), '-1'),
      play(itemFor('MT.4.NBT.5', 50, 4), '-1'),
      play(itemFor('MT.4.NBT.5', 50, 9), '-1'),
    ]

    render(<FilmRoom matchId="m1" questions={questionsOf(...played)} />)

    // Six headings each announcing that this is *the* one to take to the
    // training ground is six pieces of advice that contradict each other.
    const named = screen.getAllByText(/came from the same place/i)
    expect(named).toHaveLength(1)
    const dribbling = screen
      .getAllByTestId('film-group')
      .find((g) => g.getAttribute('data-stat') === 'DRI')!
    expect(dribbling).toHaveTextContent(/three of them came from the same place/i)
  })

  it('says so gracefully when there is nothing on the tape', () => {
    play(itemFor('MT.4.NF.1', 30), '2', { correct: true })

    render(<FilmRoom matchId="m1" opponentName="Brazil" questions={new Map()} />)

    expect(missCards()).toHaveLength(0)
    expect(screen.queryAllByTestId('film-group')).toHaveLength(0)
    expect(said()).toContain('Nothing to watch back.')
    expect(said()).toContain('Not one ball got away from you against Brazil.')
    expect(said()).not.toMatch(/^\s*$/)
  })

  it('lets him leave from the top of the screen and from the bottom', () => {
    const one = play(itemFor('MT.4.NF.1', 30), '-1')
    const onBack = vi.fn()

    render(<FilmRoom matchId="m1" questions={questionsOf(one)} onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    fireEvent.click(screen.getByRole('button', { name: /back to the dressing room/i }))
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('never says wrong, about any kind of miss', () => {
    const item = itemFor('MT.4.NF.1', 30)
    const known = item.misconceptions[0]!
    const named = play(item, known.signature, { misconceptionId: known.id })
    const near = play(itemFor('FLU.MULT', 80, 3), String(Number(itemFor('FLU.MULT', 80, 3).answer.canonical) + 1))
    const off = play(itemFor('MT.4.NBT.5', 50, 4), '1')
    const late = play(itemFor('MT.4.NF.1', 20, 9), '', { context: 'tackleback' })

    render(<FilmRoom matchId="m1" questions={questionsOf(named, near, off, late)} />)

    expect(missCards()).toHaveLength(4)
    expect(said()).not.toMatch(/\bwrong\b/i)
    expect(said()).not.toMatch(/\bincorrect\b|\bfail(ed|ure)?\b|\bcareless\b|\bshould have\b/i)
    expect(said()).not.toMatch(/[✗✘]/)
    expect(classNames().filter((c) => /red|rose|crimson/i.test(c))).toEqual([])
  })

  it('says so rather than inventing a question when one is not on the tape', () => {
    const one = play(itemFor('MT.4.NF.1', 30), '-1')

    render(<FilmRoom matchId="m1" questions={new Map()} />)

    expect(missCards()).toHaveLength(1)
    expect(said()).toContain('This one isn’t on the tape.')
    expect(said()).not.toContain(one.item.prompt)
    expect(said()).not.toMatch(/\bwrong\b/i)
  })
})

// ---------------------------------------------------------------------------

describe('grouping', () => {
  it('files fluency under pace, which belongs to no domain', () => {
    expect(statFor('FLU.MULT')).toBe('PAC')
    expect(statFor('MT.4.NF.1')).toBe('DRI')
    expect(statFor('MT.4.NBT.5')).toBe('DEF')
    expect(statFor('MT.4.G.1')).toBe('SHO')
  })

  it('keeps a match to itself', () => {
    const attempts: Attempt[] = [
      { id: 'a1', at: 1, standardId: 'FLU.MULT', difficulty: 20, params: {}, given: '1', correct: false, latencyMs: 1, context: 'match', matchId: 'm1' },
      { id: 'a2', at: 2, standardId: 'FLU.MULT', difficulty: 20, params: {}, given: '1', correct: false, latencyMs: 1, context: 'match', matchId: 'm2' },
      { id: 'a3', at: 3, standardId: 'FLU.MULT', difficulty: 20, params: {}, given: '1', correct: true, latencyMs: 1, context: 'match', matchId: 'm1' },
    ]
    const groups = groupMisses(attempts, 'm1', undefined)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.misses.map((m) => m.attempt.id)).toEqual(['a1'])
  })

  it('names no pattern at all off single slips', () => {
    const one = { attempt: {} as Attempt, item: undefined }
    expect(worst([{ stat: 'DRI', misses: [one] }])).toBeNull()
    expect(worst([])).toBeNull()
    expect(
      worst([
        { stat: 'DRI', misses: [one, one] },
        { stat: 'DEF', misses: [one, one, one] },
      ]),
    ).toBe('DEF')
  })
})

describe('missLine', () => {
  const bare = (given: string, over: Partial<Attempt> = {}): Attempt => ({
    id: 'a1',
    at: 1,
    standardId: 'FLU.MULT',
    difficulty: 20,
    params: {},
    given,
    correct: false,
    latencyMs: 1,
    context: 'match',
    ...over,
  })

  it('never reaches for a verdict when the item is missing', () => {
    const line = missLine(bare('4'), undefined)
    expect(line.heading).toBe('Let’s look at this one.')
    expect(`${line.heading} ${line.body}`).not.toMatch(/\bwrong\b/i)
  })

  it('prefers the misconception the match itself recorded', () => {
    const item = itemFor('MT.4.NF.1', 30)
    const known = item.misconceptions[1]!
    const line = missLine(bare(known.signature, { misconceptionId: known.id }), item)
    expect(line.body).toBe(known.explanation)
  })
})
