/**
 * MT.4.MD.3 — area and perimeter of rectangles.
 *
 * "Apply the area and perimeter formulas for rectangles including problems in
 * context."
 *
 * Every item asks for one number and says which. "Give the dimensions" is not
 * something `AnswerSpec` can grade, and a question the game cannot mark is worse
 * than no question at all.
 *
 * The whole difficulty of this standard is that there are two formulas and they
 * both use the same two numbers. Confusing them is the mistake every fourth
 * grader makes, so it is named on every single item — which is only possible if
 * the two answers are never the same number. A 3 by 6 rectangle has an area of
 * 18 and a perimeter of 18, and so does a 4 by 4; on those, "you gave the
 * perimeter" would be a note attached to a correct answer. Rather than handle
 * that afterwards, those rectangles are kept out of the pool. The same goes for
 * 2 by 2, where adding the two sides also lands on the area.
 *
 * The worked steps never state a formula without showing where it comes from.
 * Area is rows of squares counted up; perimeter is four sides walked round. A
 * child who has those two pictures does not need to remember which formula is
 * which, and a child who has only the formulas gets them the wrong way round
 * about half the time — which is exactly what the misconceptions here are for.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN, not the letter x. Prompt text is display-only —
 * `checkAnswer` never sees it — so this cannot affect grading, and it is the
 * sign on his worksheets.
 */
const TIMES = '×'

/** Which measurement this item wants. */
const PERIMETER = 0
const AREA = 1

/** Both, evenly. Named rather than `rng.int(0, 1)` so the two are not an accident of ordering. */
const ASKS = [PERIMETER, AREA] as const

const RANGE: [number, number] = [14, 86]

/**
 * Where the rectangle lives, and how each question is asked there.
 *
 * "Including problems in context" is in the standard by name, so most of these
 * are real things with a real reason to want the number — fencing goes round,
 * soil covers. The bare rectangle is kept as one option among many, because he
 * will meet it on a test that way and it should not be the unfamiliar one.
 *
 * Each context supplies both questions rather than a noun to slot into a
 * template, because the natural way to ask for a perimeter changes with what the
 * thing is: fencing goes *around* a patch, and tape goes around the *edge* of a
 * poster. Exported so the test can rebuild a prompt from `params` character for
 * character — that shares the words, never the arithmetic.
 */
export const CONTEXTS: readonly {
  subject: string
  unit: string
  units: string
  area: string
  perimeter: string
}[] = [
  {
    subject: 'A rectangle',
    unit: 'centimeter',
    units: 'centimeters',
    area: 'What is its area in square centimeters?',
    perimeter: 'What is its perimeter in centimeters?',
  },
  {
    subject: 'A poster',
    unit: 'centimeter',
    units: 'centimeters',
    area: 'How many square centimeters of paper does it use?',
    perimeter: 'How many centimeters of tape go all the way around the edge?',
  },
  {
    subject: 'A photograph',
    unit: 'centimeter',
    units: 'centimeters',
    area: 'What is its area in square centimeters?',
    perimeter: 'How many centimeters of frame go all the way around it?',
  },
  {
    subject: 'The class bulletin board',
    unit: 'foot',
    units: 'feet',
    area: 'How many square feet of backing paper does it need?',
    perimeter: 'How many feet of border strip go all the way around it?',
  },
  {
    subject: 'A vegetable patch',
    unit: 'meter',
    units: 'meters',
    area: 'How many square meters of soil does it cover?',
    perimeter: 'How many meters of fencing go all the way around it?',
  },
  {
    subject: 'A rabbit run',
    unit: 'meter',
    units: 'meters',
    area: 'How many square meters of ground does it cover?',
    perimeter: 'How many meters of wire mesh go all the way around it?',
  },
  {
    subject: 'The sandbox at the park',
    unit: 'foot',
    units: 'feet',
    area: 'How many square feet of sand does it hold?',
    perimeter: 'How many feet of wooden edging go all the way around it?',
  },
  {
    subject: 'A swimming pool',
    unit: 'meter',
    units: 'meters',
    area: 'What is its area in square meters?',
    perimeter: 'How many meters is it all the way around the edge?',
  },
]

/**
 * The four difficulty bands, easiest first.
 *
 * The dial is the size of the rectangle, because on this standard that is
 * genuinely what changes: the ideas are the same at 4 by 3 and at 24 by 17, and
 * what grows is the multiplication underneath. `atLeastOne` forces one side into
 * two digits from the third band up, so the area stops being a table fact.
 */
const BANDS = [
  { min: 2, max: 9, atLeastOne: 0 },
  { min: 2, max: 12, atLeastOne: 0 },
  { min: 3, max: 20, atLeastOne: 10 },
  { min: 6, max: 28, atLeastOne: 14 },
] as const

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

interface Rectangle {
  w: number
  h: number
}

/**
 * Rectangles on which every misconception here is a genuinely wrong answer.
 *
 * `w * h === 2 * (w + h)` has exactly three whole-number solutions — 3 by 6,
 * 6 by 3 and 4 by 4 — and on those, area and perimeter are the same number, so
 * "you gave the perimeter" would be a note attached to a right answer. `w + h
 * === w * h` has only 2 by 2. Four rectangles out of several hundred, excluded
 * once here so that the classic mistake can be named unconditionally everywhere
 * else.
 */
function isUsable({ w, h }: Rectangle): boolean {
  return w * h !== 2 * (w + h) && w + h !== w * h
}

/**
 * The pool a band draws from, built once and reused.
 *
 * Enumerated and filtered rather than drawn and redrawn. In the bottom band
 * three of the thirty-odd shapes are forbidden, so a redraw loop would almost
 * always be fine and would occasionally emit exactly the 4 by 4 it was told to
 * avoid — which is the failure mode that costs a child a point rather than a
 * retry.
 *
 * `w >= h` throughout, so "8 meters long and 5 meters wide" never comes out
 * describing something wider than it is long.
 */
const POOLS = new Map<number, Rectangle[]>()

function poolFor(index: number): Rectangle[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const { min, max, atLeastOne } = BANDS[index]!
  const pool: Rectangle[] = []
  for (let w = min; w <= max; w++) {
    for (let h = min; h <= w; h++) {
      if (w < atLeastOne) continue
      if (isUsable({ w, h })) pool.push({ w, h })
    }
  }
  POOLS.set(index, pool)
  return pool
}

/** `4 rows`, `1 row`. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * What `w + h` is a sum of, in words.
 *
 * A square is a rectangle and belongs in this pool, but "one long side and one
 * short side" describes a shape it does not have. A child reading that about a
 * 28 by 28 vegetable patch has been told something plainly untrue in the middle
 * of an explanation he is meant to trust.
 */
function twoSides(w: number, h: number): string {
  return w === h ? 'two of the sides' : 'one long side and one short side'
}

/**
 * How many rows are worth writing out as an addition.
 *
 * Under this, `5 + 5 + 5 = 15` is where the area formula comes from and is the
 * most convincing line on the page. Over it, a row of twenty numbers stops being
 * an explanation and becomes something to skip.
 */
const SPELL_OUT_LIMIT = 5

export const mt4md3: ItemGenerator = {
  standardId: 'MT.4.MD.3',
  label: 'Area and perimeter of rectangles',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const { w, h } = rng.pick(poolFor(bandIndexFor(d)))
    const ask = rng.pick(ASKS)
    const contextIndex = rng.int(0, CONTEXTS.length - 1)
    const context = CONTEXTS[contextIndex]!

    const area = w * h
    const perimeter = 2 * (w + h)

    return {
      standardId: 'MT.4.MD.3',
      difficulty: d,
      prompt:
        `${context.subject} is ${w} ${context.units} long and ${h} ${context.units} wide. ` +
        `${ask === AREA ? context.area : context.perimeter}`,
      // Unitless whole numbers: `normaliseInput` strips a measurement word off
      // the end of what he types, so a key carrying its own unit could never be
      // matched by anything.
      answer: { kind: 'rational', canonical: String(ask === AREA ? area : perimeter) },
      params: { w, h, ask, context: contextIndex },
      workedSteps: workedSteps(w, h, ask, context),
      misconceptions: misconceptionsFor(w, h, ask),
    }
  },
}

function workedSteps(
  w: number,
  h: number,
  ask: number,
  context: { unit: string; units: string },
): string[] {
  const area = w * h
  const perimeter = 2 * (w + h)
  const squareUnits = `square ${context.units}`

  if (ask === AREA) {
    return [
      `Area is the space inside the shape. Picture it covered in squares one ${context.unit} ` +
        `across: ${plural(h, 'row', 'rows')} with ${plural(w, 'square', 'squares')} in each row.`,
      h <= SPELL_OUT_LIMIT
        ? `${plural(h, 'row', 'rows')} of ${w} is ${Array(h).fill(String(w)).join(' + ')} = ${area}.`
        : `${plural(h, 'row', 'rows')} of ${w} squares is ${h} lots of ${w}, which is ${area}.`,
      `That is the length times the width: ${w} ${TIMES} ${h} = ${area}.`,
      `Going all the way round the outside would be the perimeter, which is a different ` +
        `question — that one comes to ${perimeter}.`,
      `So the area is ${area} ${squareUnits}.`,
    ]
  }

  return [
    `Perimeter is the distance all the way round the outside. A rectangle has four sides, and ` +
      `the opposite ones match: ${w}, ${h}, ${w} and ${h}.`,
    `Walk round and add them up: ${w} + ${h} + ${w} + ${h} = ${perimeter}.`,
    `A quicker way is ${twoSides(w, h)} added together — ${w} + ${h} = ${w + h} — and then ` +
      `doubled, because there are two of each: 2 ${TIMES} ${w + h} = ${perimeter}.`,
    `Covering the inside would be the area, which is a different question — that one comes to ` +
      `${area}.`,
    `So the perimeter is ${perimeter} ${context.units}.`,
  ]
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * The first one on both lists is the same mistake in its two directions, and it
 * is the one this standard exists to catch. It says outright that the arithmetic
 * was fine, because it was — he answered the other question, and being told so
 * is a completely different experience from being told he was wrong.
 */
function misconceptionsFor(w: number, h: number, ask: number): Misconception[] {
  const area = w * h
  const perimeter = 2 * (w + h)
  const correct = ask === AREA ? area : perimeter

  const candidates: { id: string; value: number; label: string; explanation: string }[] =
    ask === AREA
      ? [
          {
            id: 'gave-the-perimeter',
            value: perimeter,
            label: 'Worked out the perimeter instead',
            explanation:
              `${perimeter} is the distance all the way round the outside, and the arithmetic is ` +
              `right — ${w} + ${h} + ${w} + ${h} = ${perimeter}. This question asked about the ` +
              `space inside instead, which is ${plural(h, 'row', 'rows')} of ${w} squares: ` +
              `${w} ${TIMES} ${h} = ${area}.`,
          },
          {
            id: 'added-the-two-sides',
            value: w + h,
            label: 'Added the length and the width',
            explanation:
              `${w} + ${h} = ${w + h} is ${twoSides(w, h)} put together. Area counts squares, ` +
              `and there are ${plural(h, 'row', 'rows')} with ${w} in each row, so the two ` +
              `numbers multiply: ${w} ${TIMES} ${h} = ${area}.`,
          },
        ]
      : [
          {
            id: 'gave-the-area',
            value: area,
            label: 'Worked out the area instead',
            explanation:
              `${area} is the space inside, and the arithmetic is right — ` +
              `${w} ${TIMES} ${h} = ${area}. This question asked how far it is all the way round ` +
              `the outside instead: ${w} + ${h} + ${w} + ${h} = ${perimeter}.`,
          },
          {
            id: 'added-two-sides-only',
            value: w + h,
            label: 'Added two sides and stopped',
            explanation:
              `${w} + ${h} = ${w + h} is ${twoSides(w, h)}. A rectangle has four sides, and the ` +
              `other two match those: ${w} + ${h} + ${w} + ${h} = ${perimeter}. Doubling ` +
              `${w + h} gets there too.`,
          },
          {
            id: 'went-round-three-sides',
            value: 2 * w + h,
            label: 'Missed a side on the way round',
            explanation:
              `${2 * w + h} is ${w} + ${h} + ${w}, which is three sides. The fourth side is ` +
              `${h} more: ${w} + ${h} + ${w} + ${h} = ${perimeter}. Going round a shape, you ` +
              `have to end up back where you started.`,
          },
        ]

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. The pool already excludes
    // every rectangle where that could happen, so this is a belt rather than a
    // load-bearing filter — and it stays because a band edited later must not be
    // able to reintroduce the one thing this app must never do.
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
