/**
 * A picture, for the questions that are intrinsically visual.
 *
 * `MT.4.G.1` ships exact integer vertex coordinates in `params` and describes
 * the shape in prose anyway, because there used to be no picture to draw one
 * from. `MT.4.NF.1`'s own standard says "using visual fraction models." The
 * data was always there; this is the first thing in the game that draws it.
 *
 * **Rendered from `params` alone, and nothing else.** No import from a
 * generator here, on purpose — not even a format constant. A generator's
 * `describe()`, its name tables, its wording all live one layer below what a
 * figure is allowed to know, so that this file cannot drift into leaking
 * something the words were careful not to say. Format ids that matter below
 * are redeclared, not imported, matching the same choice `mt4g1.test.ts`
 * already made for the same reason: a mismatch with the generator is a bug
 * this file should catch, not silently inherit.
 *
 * **A figure may show the given. It must never show the wanted.** Three
 * rules follow, one per standard this pass covers:
 *
 *  - G.1: the polygon, always — the answer being visible in it is not a
 *    leak, because "identify these in two-dimensional figures" *is* the
 *    standard. Drawing it is finally assessing it as written.
 *  - NF.1 `MISSING_NUMERATOR` / `MISSING_DENOMINATOR` / `SCALE_FACTOR`: the
 *    *source* fraction only, as a bar — `a` shaded out of `b`. Never
 *    `targetDen`, never `scaledNum`; either one drawn would put the answer
 *    on screen before he has worked for it.
 *  - Everything else — NF.1's other three formats, NF.2, every other
 *    generator — gets no figure in this pass. When a format is in doubt the
 *    rule is silence, not a guess: `figureFor` returns `null` and the
 *    component renders nothing, which is always the safe failure.
 *
 * **Decorative, not informative, for a screen reader.** Both figures repeat
 * something `item.prompt` already says in full — the shape in words, the
 * fraction in the sentence — so both are `aria-hidden`. A label that restated
 * the prompt would be noise; the prompt is already the accessible version of
 * this.
 *
 * Grading never touches this file and this file never touches grading: it
 * reads `item.params`, draws, and nothing downstream changes.
 */

import type { Item } from '../engine/items/types'

// ---------------------------------------------------------------------------
// The decision — pure, and the thing the leak-rule sweep in the test file
// walks every generator through.

export type FigureSpec =
  | { kind: 'polygon'; points: readonly (readonly [number, number])[] }
  | { kind: 'fraction-bar'; num: number; den: number }

/** Redeclared from `mt4nf1.ts` rather than imported. See the file header. */
const MISSING_NUMERATOR = 0
const MISSING_DENOMINATOR = 1
const SCALE_FACTOR = 2

function polygonFigure(params: Record<string, number>): FigureSpec | null {
  const n = params.n
  if (!Number.isInteger(n) || n < 3) return null
  const points: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const x = params[`x${i}`]
    const y = params[`y${i}`]
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null
    points.push([x, y])
  }
  return { kind: 'polygon', points }
}

function fractionBarFigure(params: Record<string, number>): FigureSpec | null {
  const { format, a, b } = params
  if (format !== MISSING_NUMERATOR && format !== MISSING_DENOMINATOR && format !== SCALE_FACTOR) {
    return null
  }
  if (!Number.isInteger(a) || !Number.isInteger(b) || b <= 0 || a < 0 || a > b) return null
  return { kind: 'fraction-bar', num: a, den: b }
}

/** What to draw for this item, or `null` for nothing — always the safe answer when in doubt. */
export function figureFor(item: Item): FigureSpec | null {
  if (item.standardId === 'MT.4.G.1') return polygonFigure(item.params)
  if (item.standardId === 'MT.4.NF.1') return fractionBarFigure(item.params)
  return null
}

// ---------------------------------------------------------------------------
// The drawing

/** Room around the shape inside the viewBox, in the shape's own units. */
const POLYGON_PAD = 1.5

/**
 * The polygon, flipped and padded into an SVG viewBox that fits it exactly.
 *
 * Flipped because the generator's own words move up the page as `y` grows —
 * "a second side goes straight up" — while SVG's `y` grows down it. Drawing
 * the raw coordinates would show a shape leaning the opposite way from the
 * one the sentence above it describes.
 */
function Polygon({ points }: { points: readonly (readonly [number, number])[] }) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX + POLYGON_PAD * 2
  const height = maxY - minY + POLYGON_PAD * 2

  const screen = points.map(([x, y]): [number, number] => [
    x - minX + POLYGON_PAD,
    maxY - y + POLYGON_PAD,
  ])

  return (
    <svg
      data-testid="item-figure-polygon"
      viewBox={`0 0 ${width} ${height}`}
      className="mx-auto mt-1.5 block h-auto w-full max-w-[220px]"
      aria-hidden="true"
    >
      <polygon
        points={screen.map(([x, y]) => `${x},${y}`).join(' ')}
        className="fill-gold/12 stroke-gold"
        strokeWidth={height * 0.03}
        strokeLinejoin="round"
      />
      {screen.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={height * 0.035} className="fill-white/70" />
      ))}
    </svg>
  )
}

const BAR_W = 300
const BAR_H = 64

/** `num` shaded out of `den` equal pieces — the source fraction, and only ever the source. */
function FractionBar({ num, den }: { num: number; den: number }) {
  const cellW = BAR_W / den

  return (
    <svg
      data-testid="item-figure-fraction-bar"
      viewBox={`0 0 ${BAR_W} ${BAR_H}`}
      className="mx-auto mt-1.5 block h-auto w-full max-w-xs"
      aria-hidden="true"
    >
      <rect
        x={1}
        y={1}
        width={BAR_W - 2}
        height={BAR_H - 2}
        rx={8}
        className="fill-white/8 stroke-white/35"
        strokeWidth={2}
      />
      {Array.from({ length: den }, (_, i) => (
        <rect
          key={i}
          x={i * cellW}
          y={1}
          width={cellW}
          height={BAR_H - 2}
          className={i < num ? 'fill-gold/80 stroke-white/35' : 'fill-transparent stroke-white/35'}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

export function ItemFigure({ item }: { item: Item }) {
  const figure = figureFor(item)
  if (figure === null) return null
  if (figure.kind === 'polygon') return <Polygon points={figure.points} />
  return <FractionBar num={figure.num} den={figure.den} />
}
