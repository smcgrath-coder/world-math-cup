/**
 * MT.4.G.1 — points, lines, rays, angles, and parallel and perpendicular lines.
 *
 * "Draw points, lines, line segments, rays, angles (right, acute, obtuse), and
 * perpendicular and parallel lines and identify these in two-dimensional
 * figures."
 *
 * The standard has two halves and this generator can only reach one of them.
 * *Drawing* cannot be assessed by a typed answer, and pretending otherwise
 * would mean marking a child on something the game never saw him do; that half
 * is out of scope and is meant to happen on paper. *Identifying these in
 * two-dimensional figures* is a counting question, and counting produces a
 * number: how many right angles, how many acute angles, how many pairs of
 * parallel sides.
 *
 * There is no picture, so the figure has to arrive in words. That constrains
 * everything else here:
 *
 *  - **No ambiguous names.** A rhombus may be a square and a leaning
 *    four-sided shape may be a rectangle, so "how many right angles does this
 *    rhombus have?" has two defensible answers and a child answering 4 has not
 *    made a mistake. Shapes are described by their sides and corners instead,
 *    and the only names used — rectangle, square, triangle — pin their angles
 *    down completely.
 *  - **Concrete enough to picture.** "A four-sided shape has a level bottom
 *    side 7 centimeters long. At each end of it a side goes straight up..." is
 *    something a ten-year-old can see. "An isosceles trapezoid" is not.
 *
 * The answer key is a hand-written count sitting next to the hand-written
 * description, so that the words and the number are authored together and
 * cannot mean two different things. What makes it trustworthy is that the
 * figure also ships as integer vertex coordinates in `params`, and the test
 * recomputes every count from those coordinates with dot and cross products —
 * geometry against a lookup table, sharing no code path at all.
 *
 * Every figure here is convex, and that is load-bearing rather than incidental:
 * the angle between the two sides leaving a corner is the inside angle only
 * when the shape has no dents. An L-shaped figure would be a fine thing to add
 * to this standard, but not without dealing with that first.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/** Which of the three counting questions this item asks. */
const RIGHT = 0
const PARALLEL = 1
const ACUTE = 2

const RANGE: [number, number] = [12, 84]

type Point = readonly [number, number]

/**
 * The question, word for word.
 *
 * "This shape" rather than "it", because the description ends on a sentence
 * about one particular side and "it" would reach for that side instead.
 */
const QUESTION: Record<number, string> = {
  [RIGHT]: 'How many right angles does this shape have?',
  [PARALLEL]: 'How many pairs of parallel sides does this shape have?',
  [ACUTE]: 'How many acute angles does this shape have?',
}

/** What the question is counting, for sentences that have to say how many. */
const COUNTED: Record<number, readonly [one: string, many: string]> = {
  [RIGHT]: ['right angle', 'right angles'],
  [PARALLEL]: ['pair of parallel sides', 'pairs of parallel sides'],
  [ACUTE]: ['acute angle', 'acute angles'],
}

/**
 * `no right angles`, `1 right angle`, `4 right angles`.
 *
 * Zero is a legitimate answer on all three questions here, and "0 right
 * angles" is not a phrase anybody says out loud. One is a legitimate answer
 * too, and "1 pairs" is the kind of thing that makes a child stop trusting the
 * page in front of him.
 */
function has(count: number, ask: number): string {
  const [one, many] = COUNTED[ask]!
  if (count === 0) return `no ${many}`
  if (count === 1) return `1 ${one}`
  return `${count} ${many}`
}

/** `1 centimeter`, `8 centimeters`. */
function cm(n: number): string {
  return `${n} ${n === 1 ? 'centimeter' : 'centimeters'}`
}

/** What the question is asking for, before anything is counted. */
const DEFINITION: Record<number, string> = {
  [RIGHT]:
    'A right angle is a square corner: the two sides meet in a perfect L, like the corner of a book.',
  [PARALLEL]:
    'Two sides are parallel when they run in exactly the same direction, so however far you ' +
    'stretched them out they would never meet — like the two rails of a train track.',
  [ACUTE]:
    'An acute angle is a corner narrower than a square corner: a sharp point rather than a ' +
    'perfect L.',
}

interface ShapeSpec {
  id: string
  /** Every figure of this kind the generator may draw, in order round the outline. */
  figures: readonly (readonly Point[])[]
  /**
   * The figure in words.
   *
   * Reads the vertices rather than a stored size, so the numbers a child is
   * given and the polygon the answer is checked against cannot drift apart.
   */
  describe(v: readonly Point[]): string
  /** Counted by hand from the description, and checked against the coordinates by the test. */
  rightAngles: number
  parallelPairs: number
  acuteAngles: number
  /** Why the count is what it is, per question. */
  reasons: Record<number, readonly string[]>
}

/**
 * Figures are enumerated up front and picked from, never drawn and redrawn
 * until one fits. Every constraint that keeps a shape honest — a rectangle
 * that is not secretly a square, a leaning shape with no square corners, a
 * triangle whose wide corner really is wide — is a filter on a list here, so
 * it either holds for every figure in the pool or visibly does not.
 */

/** Longer than it is wide, so it is never secretly a square. */
function rectangles(): Point[][] {
  const out: Point[][] = []
  for (let w = 4; w <= 12; w++) {
    for (let h = 2; h < w; h++) {
      out.push([
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ])
    }
  }
  return out
}

function squares(): Point[][] {
  const out: Point[][] = []
  for (let s = 3; s <= 12; s++) {
    out.push([
      [0, 0],
      [s, 0],
      [s, s],
      [0, s],
    ])
  }
  return out
}

/** A level side and an upright side meeting at the origin: perpendicular by construction. */
function rightTriangles(): Point[][] {
  const out: Point[][] = []
  for (let a = 3; a <= 10; a++) {
    for (let b = 3; b <= 10; b++) {
      out.push([
        [0, 0],
        [a, 0],
        [0, b],
      ])
    }
  }
  return out
}

/**
 * Triangles whose apex corner is genuinely wider than a right angle.
 *
 * The apex is obtuse exactly when the two sides leaving it lean away from each
 * other, and for a base from (0,0) to (b,0) with the apex at (p,h) that works
 * out as `h * h < p * (b - p)`. Filtered rather than eyeballed, and strict, so
 * a right angle can never sneak into a shape whose description says the corner
 * opens out wider than one. The two base corners are then acute automatically:
 * a triangle cannot hold two corners that big.
 */
function obtuseTriangles(): Point[][] {
  const out: Point[][] = []
  for (let b = 5; b <= 12; b++) {
    for (let p = 1; p < b; p++) {
      for (let h = 1; h <= 6; h++) {
        if (h * h < p * (b - p)) {
          out.push([
            [0, 0],
            [b, 0],
            [p, h],
          ])
        }
      }
    }
  }
  return out
}

/**
 * Leaning four-sided shapes: the top side is the bottom side moved up and
 * along. The shift is never zero, so this is never a rectangle and no corner
 * is ever square.
 */
function parallelograms(): Point[][] {
  const out: Point[][] = []
  for (let w = 4; w <= 10; w++) {
    for (let across = 1; across <= 5; across++) {
      for (let up = 2; up <= 6; up++) {
        out.push([
          [0, 0],
          [w, 0],
          [w + across, up],
          [across, up],
        ])
      }
    }
  }
  return out
}

/**
 * Two upright sides of different heights on a level base.
 *
 * Both uprights are perpendicular to the base, which is two right angles and
 * the one pair of parallel sides. The heights differ, so the fourth side
 * slopes and the other two corners are not square.
 */
function rightTrapezoids(): Point[][] {
  const out: Point[][] = []
  for (let w = 4; w <= 10; w++) {
    for (let tall = 3; tall <= 7; tall++) {
      for (let short = 2; short < tall; short++) {
        out.push([
          [0, 0],
          [w, 0],
          [w, short],
          [0, tall],
        ])
      }
    }
  }
  return out
}

/**
 * A level top side, shorter than the level bottom side and centred over it, so
 * both slanted sides lean inwards by the same amount. One pair of parallel
 * sides, no square corners, two sharp corners at the bottom.
 */
function slantedTrapezoids(): Point[][] {
  const out: Point[][] = []
  for (let b = 6; b <= 12; b++) {
    for (let inset = 1; inset <= 4; inset++) {
      if (b - 2 * inset < 2) continue
      for (let up = 2; up <= 6; up++) {
        out.push([
          [0, 0],
          [b, 0],
          [b - inset, up],
          [inset, up],
        ])
      }
    }
  }
  return out
}

/**
 * Every figure this generator can draw.
 *
 * Exported so the test can rebuild a prompt from `params` character for
 * character. That shares the words; it never shares the counts, which the test
 * derives from the coordinates instead.
 */
export const SHAPES: readonly ShapeSpec[] = [
  {
    id: 'rectangle',
    figures: rectangles(),
    describe: (v) => `A rectangle is ${cm(v[1]![0] - v[0]![0])} long and ${cm(v[2]![1] - v[1]![1])} wide.`,
    rightAngles: 4,
    parallelPairs: 2,
    acuteAngles: 0,
    reasons: {
      [RIGHT]: [
        'Every corner of a rectangle is a square corner. That is what makes it a rectangle ' +
          'instead of a shape that leans over.',
        'It has four corners, and all four of them are square.',
      ],
      [PARALLEL]: [
        'The top side and the bottom side both run the same way, so they are parallel. That is ' +
          'one pair.',
        'The left side and the right side both run the same way as each other too, straight up ' +
          'and down. That is the second pair.',
        'Four sides are involved, but the question asks how many pairs they make, and four ' +
          'sides make two pairs.',
      ],
      [ACUTE]: [
        'Every corner of a rectangle is a square corner exactly — not a bit narrower, not a bit ' +
          'wider. An acute angle has to be narrower than that.',
      ],
    },
  },
  {
    id: 'square',
    figures: squares(),
    describe: (v) => `A square has four sides, and every one of them is ${cm(v[1]![0] - v[0]![0])} long.`,
    rightAngles: 4,
    parallelPairs: 2,
    acuteAngles: 0,
    reasons: {
      [RIGHT]: [
        'A square is a rectangle whose sides all happen to be the same length, and every corner ' +
          'of it is a square corner.',
        'It has four corners, and all four of them are square.',
      ],
      [PARALLEL]: [
        'The top side and the bottom side both run the same way, so they are parallel. That is ' +
          'one pair.',
        'The left side and the right side both run straight up and down. That is the second pair.',
        'Four sides are involved, but the question asks how many pairs they make, and four ' +
          'sides make two pairs.',
      ],
      [ACUTE]: [
        'Every corner of a square is a square corner exactly. An acute angle has to be narrower ' +
          'than that.',
      ],
    },
  },
  {
    id: 'right-triangle',
    figures: rightTriangles(),
    describe: (v) =>
      `A triangle has one side ${cm(v[1]![0] - v[0]![0])} long lying level. From one end of that ` +
      `side a second side goes straight up, ${cm(v[2]![1] - v[0]![1])} tall. A third side joins ` +
      `their far ends.`,
    rightAngles: 1,
    parallelPairs: 0,
    acuteAngles: 2,
    reasons: {
      [RIGHT]: [
        'One side runs level and the second one goes straight up from it. Straight up from level ' +
          'is a perfect L, so those two meet at a square corner.',
        'The third side runs at a slant, so neither of the corners it makes is square.',
      ],
      [PARALLEL]: [
        'This shape has only three sides, and each one of them meets both of the others at a ' +
          'corner.',
        'Sides that meet are not parallel. Parallel sides never meet at all, however far you ' +
          'stretch them.',
      ],
      [ACUTE]: [
        'One corner is a square corner, where the level side and the upright side meet.',
        'The three corners of any triangle always add up to the same amount as two square ' +
          'corners. One whole square corner is used up already, so the other two have to share ' +
          'what is left, and each of them ends up narrower than a square corner.',
      ],
    },
  },
  {
    id: 'obtuse-triangle',
    figures: obtuseTriangles(),
    describe: (v) =>
      `A triangle has a level bottom side ${cm(v[1]![0] - v[0]![0])} long. The corner opposite ` +
      `that side opens out wider than a right angle.`,
    rightAngles: 0,
    parallelPairs: 0,
    acuteAngles: 2,
    reasons: {
      [RIGHT]: [
        'The corner opposite the bottom side is wider than a square corner, so that one is not ' +
          'square.',
        'The three corners of any triangle add up to the same amount as two square corners. This ' +
          'one has already spent more than a whole square corner on its wide corner, so there is ' +
          'not a whole one left for either of the other two.',
      ],
      [PARALLEL]: [
        'This shape has only three sides, and each one of them meets both of the others at a ' +
          'corner.',
        'Sides that meet are not parallel. Parallel sides never meet at all, however far you ' +
          'stretch them.',
      ],
      [ACUTE]: [
        'The corner opposite the bottom side opens out wider than a square corner, so that one ' +
          'is obtuse rather than acute.',
        'The three corners of any triangle add up to the same amount as two square corners. The ' +
          'wide corner uses up more than one of them on its own, so the other two are left with ' +
          'less than a square corner each — which makes both of them acute.',
      ],
    },
  },
  {
    id: 'parallelogram',
    figures: parallelograms(),
    describe: (v) =>
      `A four-sided shape has a level bottom side ${cm(v[1]![0] - v[0]![0])} long. Its top side ` +
      `is level too and also ${cm(v[1]![0] - v[0]![0])} long, but it sits ` +
      `${cm(v[3]![1] - v[0]![1])} higher up and ${cm(v[3]![0] - v[0]![0])} further along. Two ` +
      `slanted sides join the ends together.`,
    rightAngles: 0,
    parallelPairs: 2,
    acuteAngles: 2,
    reasons: {
      [RIGHT]: [
        'The two slanted sides lean over rather than going straight up, so where they meet the ' +
          'level sides they do not make a perfect L.',
        'Leaning squashes two of the corners narrower than square and opens the other two wider ' +
          'than square. Not one of the four lands exactly on square.',
      ],
      [PARALLEL]: [
        'The top side and the bottom side are both level and the same length, so they run the ' +
          'same way. That is one pair.',
        'Both slanted sides lean over by the same amount, so they run the same way as each other ' +
          'too. That is the second pair.',
        'Four sides are involved, but the question asks how many pairs they make, and four ' +
          'sides make two pairs.',
      ],
      [ACUTE]: [
        'Leaning the shape over squashes two of its corners and opens the other two out.',
        'The two squashed corners are narrower than a square corner, so those are the acute ' +
          'ones. They sit opposite each other.',
      ],
    },
  },
  {
    id: 'right-trapezoid',
    figures: rightTrapezoids(),
    describe: (v) =>
      `A four-sided shape has a level bottom side ${cm(v[1]![0] - v[0]![0])} long. At each end ` +
      `of it a side goes straight up: one of them is ${cm(v[3]![1] - v[0]![1])} tall and the ` +
      `other is ${cm(v[2]![1] - v[1]![1])} tall. A fourth side joins their tops, so it slopes.`,
    rightAngles: 2,
    parallelPairs: 1,
    acuteAngles: 1,
    reasons: {
      [RIGHT]: [
        'Both upright sides go straight up from the level bottom side, and straight up from ' +
          'level is a perfect L. That is a square corner at each end of the bottom.',
        'The two uprights are different heights, so the side joining their tops slopes. Neither ' +
          'of the corners up there is square: one opens out wider and the other closes up ' +
          'narrower.',
      ],
      [PARALLEL]: [
        'Both upright sides go straight up from the same level side, so they run the same way as ' +
          'each other. That is one pair.',
        'The bottom side is level but the top side slopes, so those two are heading in different ' +
          'directions. Stretched far enough they would meet, so they are not a pair.',
      ],
      [ACUTE]: [
        'Two of the corners are square corners, where the uprights meet the bottom side. Square ' +
          'is not narrower than square, so those do not count.',
        'The top side slopes down from the taller upright towards the shorter one. At the top of ' +
          'the taller upright the corner closes up narrower than square; at the top of the ' +
          'shorter one it opens out wider.',
      ],
    },
  },
  {
    id: 'slanted-trapezoid',
    figures: slantedTrapezoids(),
    describe: (v) =>
      `A four-sided shape has a level bottom side ${cm(v[1]![0] - v[0]![0])} long and a level ` +
      `top side ${cm(v[2]![0] - v[3]![0])} long, sitting ${cm(v[3]![1] - v[0]![1])} higher up ` +
      `and centred over it. Two slanted sides join their ends together.`,
    rightAngles: 0,
    parallelPairs: 1,
    acuteAngles: 2,
    reasons: {
      [RIGHT]: [
        'The bottom side is longer than the top side, so both joining sides lean inwards rather ' +
          'than going straight up.',
        'That makes the two bottom corners narrower than square and the two top corners wider ' +
          'than square. Not one of the four is exactly square.',
      ],
      [PARALLEL]: [
        'The bottom side and the top side are both level, so they run the same way. That is one ' +
          'pair.',
        'The two slanted sides lean towards each other, so stretched far enough they would meet. ' +
          'They are not parallel.',
      ],
      [ACUTE]: [
        'The top side is shorter than the bottom side, so both slanted sides lean inwards.',
        'Leaning inwards closes up the two bottom corners, making each of them narrower than a ' +
          'square corner. The two top corners open out wider instead.',
      ],
    },
  },
]

function shapeIndex(id: string): number {
  const index = SHAPES.findIndex((s) => s.id === id)
  if (index < 0) throw new Error(`mt4g1: no shape called ${id}`)
  return index
}

/**
 * The four difficulty bands, easiest first.
 *
 * The dial is which figures get drawn, not which question gets asked. At the
 * bottom the shape is one whose corners a fourth grader already knows by name;
 * higher up it is one he has to reason about, where the answer is often zero
 * and the four-sided shapes stop behaving like rectangles. Acute angles only
 * appear once there is a shape with a corner that is not square, because "how
 * many acute angles does a rectangle have?" is a fine question and a strange
 * one to open with.
 */
const BANDS: readonly { shapes: readonly string[]; asks: readonly number[] }[] = [
  { shapes: ['rectangle', 'square'], asks: [RIGHT, PARALLEL] },
  { shapes: ['rectangle', 'square', 'right-triangle'], asks: [RIGHT, PARALLEL, ACUTE] },
  {
    shapes: ['right-triangle', 'obtuse-triangle', 'parallelogram', 'right-trapezoid'],
    asks: [RIGHT, PARALLEL, ACUTE],
  },
  {
    shapes: ['obtuse-triangle', 'parallelogram', 'right-trapezoid', 'slanted-trapezoid'],
    asks: [RIGHT, PARALLEL, ACUTE],
  },
]

/** Band shape lists resolved to indices once, so `generate` does no lookups. */
const BAND_SHAPES: readonly (readonly number[])[] = BANDS.map((band) => band.shapes.map(shapeIndex))

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

function countFor(shape: ShapeSpec, ask: number): number {
  if (ask === RIGHT) return shape.rightAngles
  if (ask === PARALLEL) return shape.parallelPairs
  return shape.acuteAngles
}

export const mt4g1: ItemGenerator = {
  standardId: 'MT.4.G.1',
  label: 'Angles and parallel sides in shapes',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = bandIndexFor(d)
    const shapeIdx = rng.pick(BAND_SHAPES[band]!)
    const shape = SHAPES[shapeIdx]!
    const figure = rng.pick(shape.figures)
    const ask = rng.pick(BANDS[band]!.asks)

    const correct = countFor(shape, ask)

    // The whole polygon travels with the item. It is what makes the answer key
    // checkable: the count above was written by hand next to the words, and
    // the test recomputes it from these coordinates without looking at either.
    const params: Record<string, number> = { shape: shapeIdx, ask, n: figure.length }
    figure.forEach((point, i) => {
      params[`x${i}`] = point[0]
      params[`y${i}`] = point[1]
    })

    return {
      standardId: 'MT.4.G.1',
      difficulty: d,
      prompt: `${shape.describe(figure)} ${QUESTION[ask]}`,
      answer: { kind: 'rational', canonical: String(correct) },
      params,
      workedSteps: [
        DEFINITION[ask]!,
        ...shape.reasons[ask]!,
        `So this shape has ${has(correct, ask)}. The answer is ${correct}.`,
      ],
      misconceptions: misconceptionsFor(shape, ask, figure.length),
    }
  },
}

interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * Zero is a legitimate answer to all three questions here, which makes this
 * harder than it looks. A triangle really does have no parallel sides, and on
 * that item "you said it has none" is the correct answer rather than a mistake.
 * Every candidate below is therefore checked against the answer before it is
 * kept, and the order matters: the candidates that read best are listed first,
 * so when two of them land on the same number it is the better-worded one that
 * survives.
 */
function misconceptionsFor(shape: ShapeSpec, ask: number, sides: number): Misconception[] {
  const correct = countFor(shape, ask)
  const obtuse = sides - shape.rightAngles - shape.acuteAngles

  const candidates: Candidate[] = []

  if (ask === RIGHT) {
    candidates.push({
      id: 'counted-every-corner',
      value: sides,
      label: 'Counted every corner',
      explanation:
        `${sides} is how many corners this shape has altogether. Only the ones where two sides ` +
        `meet in a perfect L are right angles, and this shape has ${has(correct, RIGHT)}.`,
    })
    if (sides === 4) {
      candidates.push({
        id: 'expected-four-square-corners',
        value: 4,
        label: 'Expected four square corners',
        explanation:
          `A shape with four sides does not have to have four square corners. Rectangles and ` +
          `squares do, but a four-sided shape that leans or slopes does not — and this one has ` +
          `${has(correct, RIGHT)}.`,
      })
    }
    candidates.push({
      id: 'said-it-has-none',
      value: 0,
      label: 'Said it has none',
      explanation:
        `There is a right angle wherever two sides meet in a perfect L, like the corner of a ` +
        `book. This shape has ${has(correct, RIGHT)}.`,
    })
    candidates.push({
      id: 'answered-the-parallel-question',
      value: shape.parallelPairs,
      label: 'Answered the parallel-sides question',
      explanation:
        `${shape.parallelPairs} is how many pairs of parallel sides this shape has. That is a ` +
        `true thing about it, but it answers a different question — this one asks about square ` +
        `corners, and this shape has ${has(correct, RIGHT)}.`,
    })
  } else if (ask === PARALLEL) {
    candidates.push({
      id: 'counted-sides-not-pairs',
      value: 2 * shape.parallelPairs,
      label: 'Counted the sides instead of the pairs',
      explanation:
        `${2 * shape.parallelPairs} is how many sides have another side running the same way as ` +
        `them. Parallel sides always come in twos, and the question asks how many pairs they ` +
        `make: ${has(correct, PARALLEL)}.`,
    })
    candidates.push({
      id: 'counted-every-side',
      value: sides,
      label: 'Counted every side',
      explanation:
        // "and those sides make no pairs" points at a set of sides that does
        // not exist. On a triangle the correct answer is none, and that is the
        // item this sentence has to read well on.
        `${sides} is how many sides this shape has altogether. A side only counts here when ` +
        `another side runs the same way as it, and this shape has ${has(correct, PARALLEL)}.`,
    })
    candidates.push({
      id: 'said-it-has-none',
      value: 0,
      label: 'Said it has none',
      explanation:
        `Two sides are parallel when they run the same way and would never meet, however far you ` +
        `stretched them out. This shape has ${has(correct, PARALLEL)}.`,
    })
    if (sides === 4) {
      candidates.push({
        id: 'expected-two-pairs',
        value: 2,
        label: 'Expected two pairs',
        explanation:
          `A rectangle has two pairs, and so does a four-sided shape that leans over. Not every ` +
          `four-sided shape does, though — this one has ${has(correct, PARALLEL)}.`,
      })
    }
  } else {
    candidates.push({
      id: 'counted-every-corner',
      value: sides,
      label: 'Counted every corner',
      explanation:
        `${sides} is how many corners this shape has altogether. Only the ones narrower than a ` +
        `square corner are acute, and this shape has ${has(correct, ACUTE)}.`,
    })
    candidates.push({
      id: 'said-it-has-none',
      value: 0,
      label: 'Said it has none',
      explanation:
        `An acute angle is any corner narrower than a square corner — a sharp point rather than ` +
        `a perfect L. This shape has ${has(correct, ACUTE)}.`,
    })
    candidates.push({
      id: 'counted-the-wide-corners',
      value: obtuse,
      label: 'Counted the wide corners instead',
      // Phrased around one corner at a time, because this survives on shapes
      // with a single obtuse corner and "those ones are obtuse" said of one
      // corner is the kind of sentence that makes a page stop being trusted.
      explanation:
        `A corner that opens out wider than a square corner is obtuse, not acute, and this shape ` +
        `has ${obtuse === 1 ? '1 corner' : `${obtuse} corners`} like that. Acute means narrower ` +
        `than a square corner, and this shape has ${has(correct, ACUTE)}.`,
    })
  }

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. This is not a belt here,
    // it is load-bearing: zero is a real answer on all three questions, and
    // "you said it has none" would otherwise be attached to the very item
    // where none is right.
    if (c.value === correct) continue
    const signature = String(c.value)
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
