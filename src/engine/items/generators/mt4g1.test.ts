import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { SHAPES, mt4g1 } from './mt4g1'
import { answerText, canonicalOf } from '../../answer'

/**
 * Redeclared rather than imported: a mismatch with the generator is a bug this
 * file should catch. These are load-bearing here in a way they are not in most
 * generators — `verify` uses `ask` to decide *which* geometric count to
 * recompute, and the question sentence below is what the child actually reads.
 * If the generator ever paired the acute-angle question with the right-angle
 * count, the two halves would disagree and the sweep would fail.
 */
const RIGHT = 0
const PARALLEL = 1
const ACUTE = 2
const IDENTIFY = 3

const NARROWEST = 0
const WIDEST = 1

/** The three counting questions. `IDENTIFY` has its own, keyed on the corner. */
const QUESTION: Record<number, string> = {
  [RIGHT]: 'How many right angles does this shape have?',
  [PARALLEL]: 'How many pairs of parallel sides does this shape have?',
  [ACUTE]: 'How many acute angles does this shape have?',
}

const IDENTIFY_QUESTION: Record<number, string> = {
  [NARROWEST]: 'What kind of angle is the narrowest corner in this shape?',
  [WIDEST]: 'What kind of angle is the widest corner in this shape?',
}

/** Every counting format, which is every format that answers with a number. */
const COUNTING = [RIGHT, PARALLEL, ACUTE]

const EASIEST = 12
const HARDEST = 84

type Point = readonly [number, number]

/**
 * The figure, rebuilt from `params` alone.
 *
 * `params` carries the whole polygon as integer coordinates, so everything
 * below is derived from the shape itself rather than from anything the
 * generator said about it.
 */
function verticesOf(p: Record<string, number>): Point[] {
  const n = p.n!
  const out: Point[] = []
  for (let i = 0; i < n; i++) out.push([p[`x${i}`]!, p[`y${i}`]!] as const)
  return out
}

function dot(a: Point, b: Point): number {
  return a[0] * b[0] + a[1] * b[1]
}

function cross(a: Point, b: Point): number {
  return a[0] * b[1] - a[1] * b[0]
}

/**
 * The two edges leaving vertex `i`, as vectors pointing away from it.
 *
 * The angle of the corner at `i` is the angle between these two, so every
 * classification below is a question about this pair.
 */
function armsAt(v: readonly Point[], i: number): [Point, Point] {
  const n = v.length
  const here = v[i]!
  const before = v[(i - 1 + n) % n]!
  const after = v[(i + 1) % n]!
  return [
    [before[0] - here[0], before[1] - here[1]],
    [after[0] - here[0], after[1] - here[1]],
  ]
}

/** Each side, as the vector from one vertex to the next. */
function edges(v: readonly Point[]): Point[] {
  return v.map((here, i) => {
    const next = v[(i + 1) % v.length]!
    return [next[0] - here[0], next[1] - here[1]] as const
  })
}

/**
 * A corner is a right angle exactly when its two arms are perpendicular, and
 * two vectors are perpendicular exactly when their dot product is zero. Exact
 * integer arithmetic, no angle ever computed, no tolerance to get wrong.
 */
function countRightAngles(v: readonly Point[]): number {
  let count = 0
  for (let i = 0; i < v.length; i++) {
    const [a, b] = armsAt(v, i)
    if (dot(a, b) === 0) count++
  }
  return count
}

/**
 * A corner is acute when its two arms lean towards each other, which is a
 * strictly positive dot product. Zero is a right angle and negative is obtuse,
 * so `> 0` already excludes both.
 *
 * This reads the *interior* angle only because every figure is convex, which
 * `is drawn as a convex figure` below insists on. At a reflex corner the arms
 * would still measure the small angle and this would silently be wrong.
 */
function countAcuteAngles(v: readonly Point[]): number {
  let count = 0
  for (let i = 0; i < v.length; i++) {
    const [a, b] = armsAt(v, i)
    if (dot(a, b) > 0) count++
  }
  return count
}

function countObtuseAngles(v: readonly Point[]): number {
  let count = 0
  for (let i = 0; i < v.length; i++) {
    const [a, b] = armsAt(v, i)
    if (dot(a, b) < 0) count++
  }
  return count
}

/**
 * Two sides are parallel when their direction vectors are multiples of each
 * other, which is a zero cross product.
 *
 * Deliberately not done by comparing slopes: a slope is a division, it is
 * undefined for a vertical side, and the two vertical sides of a rectangle are
 * exactly the case this generator has to get right.
 */
function countParallelPairs(v: readonly Point[]): number {
  const sides = edges(v)
  let pairs = 0
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      if (cross(sides[i]!, sides[j]!) === 0) pairs++
    }
  }
  return pairs
}

/**
 * Independent of the generator: the answer read off the figure itself.
 *
 * The generator publishes a count it was told by hand, alongside the words that
 * describe the shape. This never looks at that count. It takes the polygon out
 * of `params` and works out, from the coordinates, how many of its corners are
 * square, how many are sharp, and how many of its sides run the same way as
 * another. Dot products and cross products only — no shape table, no names, no
 * arithmetic borrowed from the generator.
 */
function figureAnswer(p: Record<string, number>): string {
  const v = verticesOf(p)
  if (p.ask === RIGHT) return String(countRightAngles(v))
  if (p.ask === PARALLEL) return String(countParallelPairs(v))
  if (p.ask === ACUTE) return String(countAcuteAngles(v))

  /*
   * For a choice, the independent answer is the correct option's text.
   *
   * Recomputed the same way as everything else here: the interior angle at a
   * corner is the angle between the two sides leaving it, and the sign of their
   * dot product names it — zero is square, positive is sharper, negative is
   * wider. The dot product falls as the angle opens, so the widest corner is the
   * smallest dot product and the narrowest is the largest.
   */
  const signs = v.map((corner, i) => {
    const before = v[(i - 1 + v.length) % v.length]!
    const after = v[(i + 1) % v.length]!
    return dot(
      [before[0] - corner[0], before[1] - corner[1]],
      [after[0] - corner[0], after[1] - corner[1]],
    )
  })
  const wanted = p.which === WIDEST ? Math.min(...signs) : Math.max(...signs)
  if (wanted === 0) return 'Right'
  return wanted < 0 ? 'Obtuse' : 'Acute'
}

/**
 * The words are shared with the generator; the figure is not. `describe` reads
 * the vertices, so a prompt that quoted a length the polygon does not have
 * would fail here.
 */
function rebuildPrompt(p: Record<string, number>): string {
  const question = p.ask === IDENTIFY ? IDENTIFY_QUESTION[p.which!]! : QUESTION[p.ask!]
  return `${SHAPES[p.shape!]!.describe(verticesOf(p))} ${question}`
}

function itemsAt(difficulty: number, seeds = 120) {
  return Array.from({ length: seeds }, (_, s) => mt4g1.generate(difficulty, makeRng(s)))
}

function everyItem(step = 3, seeds = 40) {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += step) out.push(...itemsAt(d, seeds))
  return out
}

describe('MT.4.G.1 identifying angles and parallel sides in figures', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4g1, figureAnswer, { rebuildPrompt })
  })

  it('is drawn as a convex figure, so a corner is the angle between its two sides', () => {
    // Every classification in this file measures the angle between the two
    // sides leaving a corner. For a convex figure that *is* the inside angle.
    // For a dent — the inner corner of an L-shape — the inside angle is the
    // reflex one and this would read 90 where the figure turns through 270.
    // An L-shaped figure would be a perfectly reasonable thing to add to this
    // standard later, and it must not be added without dealing with that.
    for (const item of everyItem()) {
      const sides = edges(verticesOf(item.params))
      const turns = sides.map((side, i) => cross(side, sides[(i + 1) % sides.length]!))
      expect(
        turns.every((t) => t > 0) || turns.every((t) => t < 0),
        `not convex: ${item.prompt} ${JSON.stringify(item.params)}`,
      ).toBe(true)
    }
  })

  it('draws every figure on whole-number coordinates', () => {
    // The dot and cross products above are exact only on integers. A halved
    // coordinate would put a rounding error between the answer key and the
    // figure, which is the one place this app must never have one.
    for (const item of everyItem()) {
      for (const [key, value] of Object.entries(item.params)) {
        expect(Number.isInteger(value), `${key}=${value} in ${item.prompt}`).toBe(true)
      }
    }
  })

  it('gives every corner a type, and only one', () => {
    for (const item of everyItem()) {
      const v = verticesOf(item.params)
      expect(
        countRightAngles(v) + countAcuteAngles(v) + countObtuseAngles(v),
        item.prompt,
      ).toBe(v.length)
    }
  })

  it('asks one of the four questions and says which', () => {
    for (const item of everyItem()) {
      expect([RIGHT, PARALLEL, ACUTE, IDENTIFY], item.prompt).toContain(item.params.ask)
      const question =
        item.params.ask === IDENTIFY
          ? IDENTIFY_QUESTION[item.params.which!]
          : QUESTION[item.params.ask!]
      expect(item.prompt, item.prompt).toContain(question)
    }
  })

  it('names the angle in words on the identify question, never with a number', () => {
    // The half of the standard a count could never reach: "identify these in
    // two-dimensional figures". There is no number that says "obtuse".
    let seen = 0
    for (const item of everyItem()) {
      if (item.params.ask !== IDENTIFY) continue
      seen++
      expect(item.answer.kind, item.prompt).toBe('choice')
      expect(item.answer.kind === 'choice' && item.answer.options, item.prompt).toEqual([
        'Acute',
        'Right',
        'Obtuse',
      ])
    }
    expect(seen, 'the identify question never came up').toBeGreaterThan(20)
  })

  it('gives all three names as the answer at some point', () => {
    // Three options where one is never right is a two-way choice wearing a
    // disguise, and a child who noticed would be right to stop reading it.
    const answers = new Set(
      everyItem(1, 60)
        .filter((i) => i.params.ask === IDENTIFY)
        .map((i) => answerText(i.answer)),
    )
    expect([...answers].sort()).toEqual(['Acute', 'Obtuse', 'Right'])
  })

  it('asks about the widest and the narrowest corner, not just one of them', () => {
    const which = new Set(
      everyItem().filter((i) => i.params.ask === IDENTIFY).map((i) => i.params.which),
    )
    expect([...which].sort()).toEqual([NARROWEST, WIDEST])
  })

  it('accepts zero as an answer on all three questions', () => {
    // "How many right angles does this triangle have?" is allowed to be none,
    // and a generator that quietly avoided zero would be teaching that the
    // answer is always some. Every question has to be able to come back empty.
    const zeros = new Set<number>()
    for (const item of everyItem(1, 60)) {
      if (!COUNTING.includes(item.params.ask!)) continue
      if (canonicalOf(item.answer) === '0') zeros.add(item.params.ask!)
    }
    expect([...zeros].sort(), 'some question can never answer zero').toEqual([
      RIGHT,
      PARALLEL,
      ACUTE,
    ])
  })

  it('never names a mistake that is the right answer, zero included', () => {
    for (const item of everyItem(1, 60)) {
      for (const m of item.misconceptions) {
        expect(m.signature, `${m.id} on "${item.prompt}"`).not.toBe(answerText(item.answer))
      }
    }
  })

  it('pins each figure to what its words say it is', () => {
    // The generator's answer is a hand-written number sitting next to a
    // hand-written description. This is where those two are made to agree: the
    // counts below are read off the *name* of the shape, and checked against
    // coordinates. A parallelogram whose vertices had drifted into a rectangle
    // would fail here, and so would a description that no longer matched.
    const expected: Record<string, [right: number, parallel: number, acute: number]> = {
      rectangle: [4, 2, 0],
      square: [4, 2, 0],
      'right-triangle': [1, 0, 2],
      'obtuse-triangle': [0, 0, 2],
      parallelogram: [0, 2, 2],
      'right-trapezoid': [2, 1, 1],
      'slanted-trapezoid': [0, 1, 2],
    }
    expect(Object.keys(expected).sort()).toEqual(SHAPES.map((s) => s.id).sort())

    const seen = new Set<string>()
    for (const item of everyItem(1, 60)) {
      const shape = SHAPES[item.params.shape!]!
      const [right, parallel, acute] = expected[shape.id]!
      const v = verticesOf(item.params)
      expect(countRightAngles(v), `${shape.id}: ${item.prompt}`).toBe(right)
      expect(countParallelPairs(v), `${shape.id}: ${item.prompt}`).toBe(parallel)
      expect(countAcuteAngles(v), `${shape.id}: ${item.prompt}`).toBe(acute)
      seen.add(shape.id)
    }
    expect([...seen].sort(), 'a shape in the table is never drawn').toEqual(
      Object.keys(expected).sort(),
    )
  })

  it('answers the rectangle and triangle cases a fourth grader is taught by heart', () => {
    // Pinned by hand rather than swept, because these are the four facts this
    // standard actually lands on and a regression in any of them would be worth
    // failing a named test for.
    const rectangle = [
      [0, 0],
      [8, 0],
      [8, 3],
      [0, 3],
    ] as const
    const triangle = [
      [0, 0],
      [6, 0],
      [0, 4],
    ] as const
    expect(countRightAngles(rectangle)).toBe(4)
    expect(countParallelPairs(rectangle)).toBe(2)
    expect(countAcuteAngles(rectangle)).toBe(0)
    expect(countRightAngles(triangle)).toBe(1)
    expect(countParallelPairs(triangle)).toBe(0)
    expect(countAcuteAngles(triangle)).toBe(2)
  })

  it('has more than two answers in its easiest band', () => {
    // Rectangles and squares alone answer 4 (right angles) or 2 (parallel
    // pairs) whatever lengths are quoted. The band was learnable by heart in
    // three questions, so the right triangle sits in it too and brings 1 and 0.
    const answers = new Set(itemsAt(EASIEST, 200).map((i) => canonicalOf(i.answer)))
    expect(answers.size).toBeGreaterThanOrEqual(4)
    expect(answers.has('0')).toBe(true)
  })

  it('gets harder by widening the figures it draws, not by changing the question', () => {
    const shapesAt = (d: number) => new Set(itemsAt(d).map((i) => SHAPES[i.params.shape!]!.id))
    expect(shapesAt(EASIEST).has('rectangle')).toBe(true)
    expect(shapesAt(EASIEST).has('parallelogram')).toBe(false)
    expect(shapesAt(HARDEST).size).toBeGreaterThan(2)
    expect(shapesAt(HARDEST).has('slanted-trapezoid')).toBe(true)
  })

  it('never names a shape whose angles are open to argument', () => {
    // A rhombus may be a square and a parallelogram may be a rectangle, so
    // "how many right angles does this rhombus have?" has no one answer and a
    // child answering 4 is not wrong. Figures are described by their sides and
    // corners instead, and the few names used are ones that pin the angles
    // down completely.
    for (const item of everyItem()) {
      for (const word of ['rhombus', 'parallelogram', 'trapezoid', 'trapezium', 'quadrilateral']) {
        expect(item.prompt.toLowerCase(), item.prompt).not.toContain(word)
      }
    }
  })

  it('agrees in number everywhere a child reads', () => {
    const nouns = [
      ['corner', 'corners'],
      ['side', 'sides'],
      ['pair', 'pairs'],
      ['right angle', 'right angles'],
      ['acute angle', 'acute angles'],
      ['centimeter', 'centimeters'],
    ]
    for (const item of everyItem(2, 30)) {
      const text = [
        item.prompt,
        ...item.workedSteps,
        ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
      ].join('\n')

      for (const [one, many] of nouns) {
        for (const m of text.matchAll(new RegExp(`(\\d+) ${many}\\b`, 'g'))) {
          expect(m[1], `"${m[0]}" in ${item.prompt}`).not.toBe('1')
        }
        for (const m of text.matchAll(new RegExp(`(\\d+) ${one}\\b`, 'g'))) {
          expect(m[1], `"${m[0]}" in ${item.prompt}`).toBe('1')
        }
      }
    }
  })

  it('finishes the working with the number he has to type', () => {
    for (const item of everyItem(2, 30)) {
      if (!COUNTING.includes(item.params.ask!)) continue
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
        `The answer is ${canonicalOf(item.answer)}.`,
      )
    }
  })

  it('finishes the identify working on the name he has to pick', () => {
    for (const item of everyItem(2, 30)) {
      if (item.params.ask !== IDENTIFY) continue
      const corner = item.params.which === WIDEST ? 'widest' : 'narrowest'
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toBe(
        `So the ${corner} corner is ${answerText(item.answer).toLowerCase()}.`,
      )
    }
  })

  it('says "none" rather than counting zero of something', () => {
    // "So this shape has 0 right angles" is a sentence no one says out loud.
    for (const item of everyItem(2, 30)) {
      for (const step of item.workedSteps) {
        expect(step, item.prompt).not.toMatch(/\b0 (right angles|acute angles|pairs)\b/)
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4g1.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4g1.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4g1.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4g1.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4g1.generate(51.4, makeRng(4)).difficulty).toBe(51.4)
  })
})
