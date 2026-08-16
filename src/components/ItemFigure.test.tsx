import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemFigure, figureFor } from './ItemFigure'
import type { FigureSpec } from './ItemFigure'
import { ALL_GENERATORS } from '../engine/items/generators'
import { makeRng } from '../engine/items/rng'
import { mt4g1 } from '../engine/items/generators/mt4g1'
import {
  HOW_MANY_PIECES,
  MISSING_DENOMINATOR,
  MISSING_NUMERATOR,
  SCALE_FACTOR,
  WHICH_SAME,
  WORD_SAME_CUT,
  mt4nf1,
} from '../engine/items/generators/mt4nf1'
import { mt4nf2 } from '../engine/items/generators/mt4nf2'
import type { Item, ItemGenerator } from '../engine/items/types'

/** Fewer than `harness.ts` uses — this sweep checks discrete dispatch, not arithmetic across a continuous parameter space, so it does not need the same density to reach every corner of it. */
const SEEDS = 80

/** Every difficulty in the generator's range, walked exactly like `harness.ts` does — a sparse sweep here missed a bug there once already. */
function sweep(gen: ItemGenerator, fn: (item: Item, difficulty: number, seed: number) => void): void {
  const [lo, hi] = gen.range
  for (let d = lo; d <= hi; d++) {
    for (let seed = 0; seed < SEEDS; seed++) fn(gen.generate(d, makeRng(seed)), d, seed)
  }
}

describe('figureFor — the leak-rule sweep', () => {
  it('draws nothing for every generator this pass has not decided a figure for', () => {
    for (const gen of ALL_GENERATORS) {
      if (gen.standardId === 'MT.4.G.1' || gen.standardId === 'MT.4.NF.1') continue
      sweep(gen, (item, d, seed) => {
        expect(figureFor(item), `${gen.standardId} d=${d} seed=${seed}`).toBeNull()
      })
    }
  })

  it('MT.4.G.1 always draws the polygon, matching params vertex for vertex', () => {
    sweep(mt4g1, (item, d, seed) => {
      const where = `d=${d} seed=${seed}`
      const figure = figureFor(item)
      expect(figure?.kind, where).toBe('polygon')
      if (figure?.kind !== 'polygon') return

      const n = item.params.n
      expect(figure.points, where).toHaveLength(n)
      figure.points.forEach(([x, y], i) => {
        expect(x, `${where} point ${i} x`).toBe(item.params[`x${i}`])
        expect(y, `${where} point ${i} y`).toBe(item.params[`y${i}`])
      })
    })
  })

  it('MT.4.NF.1 draws the source fraction only on the three formats decided for one, and it is never the target', () => {
    const DECIDED = new Set([MISSING_NUMERATOR, MISSING_DENOMINATOR, SCALE_FACTOR])

    sweep(mt4nf1, (item, d, seed) => {
      const format = item.params.format
      const where = `format=${format} d=${d} seed=${seed}`
      const figure = figureFor(item)

      if (!DECIDED.has(format)) {
        expect(figure, where).toBeNull()
        return
      }

      expect(figure?.kind, where).toBe('fraction-bar')
      if (figure?.kind !== 'fraction-bar') return

      // The given, exactly — a and b, nothing recomputed from them.
      expect(figure.num, where).toBe(item.params.a)
      expect(figure.den, where).toBe(item.params.b)

      // The leak check itself. Both of these sit in `params` for every format
      // this branch covers, and neither may ever reach the figure — a bar
      // showing either one shows the answer before he has found it.
      expect(figure.den, `leaked targetDen ${where}`).not.toBe(item.params.targetDen)
      if (item.params.scaledNum !== undefined) {
        expect(figure.num, `leaked scaledNum ${where}`).not.toBe(item.params.scaledNum)
      }
    })
  })

  it('MT.4.NF.1: the three formats not decided for a figure stay that way', () => {
    // Named explicitly, rather than only reached through "not in DECIDED"
    // above — so a generator change that silently drops one of these three
    // from `formats` cannot also silently shrink what this file promises to
    // check.
    expect([HOW_MANY_PIECES, WHICH_SAME, WORD_SAME_CUT]).toHaveLength(3)
    sweep(mt4nf1, (item, d, seed) => {
      const format = item.params.format
      if (format !== HOW_MANY_PIECES && format !== WHICH_SAME && format !== WORD_SAME_CUT) return
      expect(figureFor(item), `format=${format} d=${d} seed=${seed}`).toBeNull()
    })
  })

  it('MT.4.NF.2 never gets a figure — a drawn pair answers a comparison at a glance', () => {
    sweep(mt4nf2, (item, d, seed) => {
      expect(figureFor(item), `d=${d} seed=${seed}`).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------

/** Hand-built rather than seed-hunted, so which format is under test is not at the mercy of what a seed happens to draw. */
const missingNumeratorItem: Item = {
  standardId: 'MT.4.NF.1',
  difficulty: 20,
  prompt: '3/4 = ?/12. What is the missing top number?',
  answer: { kind: 'rational', canonical: '9' },
  params: { a: 3, b: 4, mult: 3, targetDen: 12, format: MISSING_NUMERATOR },
  workedSteps: [],
  misconceptions: [],
}

const whichSameItem: Item = {
  standardId: 'MT.4.NF.1',
  difficulty: 40,
  prompt: 'Which of these is the same amount as 9/12?',
  answer: { kind: 'choice', options: ['3/4', '3/12', '9/4'], correct: 0 },
  params: { a: 3, b: 4, mult: 3, targetDen: 12, format: WHICH_SAME, scaledNum: 9, slot: 0 },
  workedSteps: [],
  misconceptions: [],
}

describe('ItemFigure component', () => {
  it('renders a polygon, sized to the shape, for a G.1 item', () => {
    const item = mt4g1.generate(20, makeRng(1))
    render(<ItemFigure item={item} />)
    expect(screen.getByTestId('item-figure-polygon')).toBeInTheDocument()
  })

  it('renders a fraction bar for a decided NF.1 format, shaded exactly a of b', () => {
    render(<ItemFigure item={missingNumeratorItem} />)
    const svg = screen.getByTestId('item-figure-fraction-bar')
    expect(svg).toBeInTheDocument()
    // 4 cells for a denominator of 4, 3 of them shaded.
    const rects = svg.querySelectorAll('rect')
    // The outer frame plus one rect per denominator cell.
    expect(rects).toHaveLength(1 + 4)
  })

  it('renders nothing for an NF.1 format this pass has not decided a figure for', () => {
    const { container } = render(<ItemFigure item={whichSameItem} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('item-figure-fraction-bar')).toBeNull()
  })

  it('renders nothing for a standard with no figure at all', () => {
    const item = mt4nf2.generate(30, makeRng(3))
    const { container } = render(<ItemFigure item={item} />)
    expect(container.firstChild).toBeNull()
  })

  it('is hidden from a screen reader on both figures — the prompt already says everything either one shows', () => {
    render(<ItemFigure item={missingNumeratorItem} />)
    expect(screen.getByTestId('item-figure-fraction-bar')).toHaveAttribute('aria-hidden', 'true')
  })
})

// ---------------------------------------------------------------------------

describe('figureFor — malformed params fail safe rather than throw', () => {
  const base = missingNumeratorItem

  it('a non-integer or missing vertex count on a G.1-shaped item yields no figure', () => {
    const item: Item = { ...base, standardId: 'MT.4.G.1', params: { n: 3.5, x0: 0, y0: 0 } }
    expect(figureFor(item)).toBeNull()
  })

  it('a fraction outside 0..b on an NF.1-shaped item yields no figure', () => {
    const item: Item = { ...base, params: { ...base.params, a: 9, b: 4 } }
    expect(figureFor(item)).toBeNull()
  })

  it('never throws across a battery of garbage params', () => {
    const garbage: Record<string, number>[] = [
      {},
      { n: -1 },
      { n: NaN },
      { format: MISSING_NUMERATOR, a: NaN, b: 4 },
      { format: MISSING_NUMERATOR, a: 3, b: 0 },
      { format: 99, a: 3, b: 4 },
    ]
    for (const params of garbage) {
      for (const standardId of ['MT.4.G.1', 'MT.4.NF.1']) {
        expect(() => figureFor({ ...base, standardId, params })).not.toThrow()
      }
    }
  })
})

// ---------------------------------------------------------------------------

describe('FigureSpec — type sanity', () => {
  it('a fraction-bar spec carries exactly num and den', () => {
    const spec: FigureSpec = { kind: 'fraction-bar', num: 1, den: 2 }
    expect(spec).toEqual({ kind: 'fraction-bar', num: 1, den: 2 })
  })
})
