/**
 * MT.4.NBT.4 — adding and subtracting multi-digit whole numbers.
 *
 * "Accurately and efficiently add and subtract multi-digit whole numbers using
 * the standard algorithm."
 *
 * The standard names the algorithm, and the algorithm is entirely about what
 * happens *between* columns. That is why the difficulty dial here is not the
 * size of the numbers but whether regrouping is needed: `456 + 123` and
 * `456 + 178` look the same on the page and are not the same question at all.
 * A child who has only ever met the first one has learnt to add three pairs of
 * digits, which is not this standard.
 *
 * So every item is built column by column, with the carries and borrows chosen
 * first and the digits chosen to produce them. Nothing is drawn and redrawn
 * hoping for a carry: the band's promise holds by construction on every item it
 * emits.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+2212 MINUS SIGN, not the ASCII hyphen.
 *
 * Prompt text is display-only — `checkAnswer` never sees it, so this cannot
 * affect grading — and set next to a full-height `+` a hyphen reads as a stray
 * mark rather than as the operator the question turns on.
 */
const MINUS = '−'

const ADD = 1
const RANGE: [number, number] = [5, 78]

/**
 * The four difficulty bands, easiest first.
 *
 * `minRegroups` and `allowRegroups` are the real dial. `digits` moves more
 * slowly on purpose: a fourth column is more of the same work, while the first
 * carry is a new idea.
 *
 *  - Band 0 never regroups at all. Every column stands on its own, which is the
 *    honest entry point and the only band where that is true.
 *  - Band 1 allows regrouping without demanding it, so he meets both kinds
 *    mixed together and cannot tell which is coming from the shape of the page.
 *  - Band 2 always regroups at least once.
 *  - Band 3 regroups at least twice, and its subtractions sometimes run a borrow
 *    through a 0 — the case that breaks more fourth graders than any other.
 *
 * Numbers stop at four digits because the standard stops there, and because a
 * fifth column measures stamina rather than place value.
 */
const BANDS = [
  { digits: [2], minRegroups: 0, allowRegroups: false, zeroChain: false },
  { digits: [2, 3, 3], minRegroups: 0, allowRegroups: true, zeroChain: false },
  { digits: [3, 3, 4], minRegroups: 1, allowRegroups: true, zeroChain: false },
  { digits: [4], minRegroups: 2, allowRegroups: true, zeroChain: true },
] as const

type Band = (typeof BANDS)[number]

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

/** Ones-first digits back into a number. */
function numberFrom(digits: readonly number[]): number {
  let value = 0
  for (let i = digits.length - 1; i >= 0; i--) value = value * 10 + digits[i]!
  return value
}

/** The digits of `n`, ones first. */
function digitsOf(n: number): number[] {
  return String(n).split('').reverse().map(Number)
}

/**
 * Every digit pair a column could hold, filtered down to the ones this column is
 * allowed.
 *
 * A hundred candidates enumerated and filtered, rather than a draw-and-redraw
 * loop. That matters more here than it looks: a column asked for a carry when
 * its bottom digit is forced to 0 has *no* satisfying pair, and a retry loop
 * would spin out its budget and then quietly emit a column that does not carry —
 * exactly the thing the band was built to guarantee. Enumerating makes an
 * unsatisfiable column impossible to miss instead of silently wrong.
 */
function columnPairs(allowed: (top: number, bottom: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  for (let top = 0; top <= 9; top++) {
    for (let bottom = 0; bottom <= 9; bottom++) if (allowed(top, bottom)) out.push([top, bottom])
  }
  return out
}

function popcount(mask: number): number {
  let n = 0
  for (let m = mask; m > 0; m >>= 1) n += m & 1
  return n
}

/**
 * The regrouping patterns a band will accept, as bitmasks over the columns that
 * are allowed to regroup at all.
 *
 * `required` is capped at `columns` so this list can never come back empty — an
 * empty pool would reach `rng.pick`, which throws, mid-match.
 */
function maskPool(columns: number, band: Band, forced: number): number[] {
  if (!band.allowRegroups) return [0]
  const required = Math.min(band.minRegroups, columns)
  const all: number[] = []
  for (let mask = 0; mask < 1 << columns; mask++) all.push(mask)
  return all.filter((mask) => popcount(mask) >= required && (mask & forced) === forced)
}

/**
 * How many digits the second number gets.
 *
 * Usually the same as the first, sometimes one fewer, because `456 + 78` is its
 * own small skill: the ones have to be lined up under the ones rather than the
 * left-hand edges matched up, and that is where a whole column of value goes
 * missing. Shorter is only offered when it still leaves room for the regrouping
 * the band promised.
 */
function secondLengths(op: number, digits: number, band: Band): number[] {
  const candidates = [digits, digits, digits, digits - 1]
  const ok = candidates.filter((n) => n >= 1 && regroupableColumns(op, digits, n) >= band.minRegroups)
  return ok.length > 0 ? ok : [digits]
}

/**
 * The columns that may carry or borrow.
 *
 * Addition may carry out of the leading column — that is just an extra digit on
 * the answer. Subtraction may not borrow out of it: that would mean taking the
 * bigger number from the smaller one, and a negative answer is a topic he has
 * not met being scored against him. So the leading column is excluded whenever
 * both numbers reach it.
 */
function regroupableColumns(op: number, digits: number, bDigits: number): number {
  if (op === ADD) return bDigits
  return bDigits === digits ? digits - 1 : bDigits
}

interface Pair {
  a: number
  b: number
}

function buildSum(rng: Rng, band: Band, digits: number, bDigits: number): Pair {
  const mask = rng.pick(maskPool(bDigits, band, 0))
  const top: number[] = []
  const bottom: number[] = []

  for (let i = 0; i < digits; i++) {
    const isLeadingA = i === digits - 1
    const isLeadingB = i === bDigits - 1
    const hasBottom = i < bDigits
    const mustCarry = ((mask >> i) & 1) === 1

    const [t, b] = rng.pick(
      columnPairs((t, b) => {
        if (isLeadingA && t < 1) return false
        if (isLeadingB && b < 1) return false
        if (!hasBottom) return b === 0
        // A column with a carry set is over ten whatever arrives from the right,
        // and a column without one is under ten as long as nothing arrives — and
        // nothing can, because when the mask is empty no column carries at all.
        return mustCarry ? t + b >= 10 : t + b <= 9
      }),
    )
    top.push(t)
    if (hasBottom) bottom.push(b)
  }

  return { a: numberFrom(top), b: numberFrom(bottom) }
}

/**
 * The place of the 0 a borrow will be dragged through, or -1 for no chain.
 *
 * A borrow arriving at a 0 has nothing to take, so it has to go one place
 * further left first. Forcing the column to its right to borrow, and the column
 * itself to hold a 0, makes that happen by construction.
 */
function chainPlace(rng: Rng, band: Band, digits: number, columns: number): number {
  if (!band.zeroChain) return -1
  const places: number[] = []
  for (let p = 1; p <= digits - 2; p++) if (p < columns) places.push(p)
  if (places.length === 0) return -1
  // Half the subtractions in this band, not all of them. A zero in the middle
  // every single time would be a tell, and he would start looking for it rather
  // than reading the number.
  return rng.int(0, 1) === 1 ? rng.pick(places) : -1
}

function buildDifference(rng: Rng, band: Band, digits: number, bDigits: number): Pair {
  const columns = regroupableColumns(0, digits, bDigits)
  const chain = chainPlace(rng, band, digits, columns)
  const forced = chain < 0 ? 0 : (1 << chain) | (1 << (chain - 1))
  const mask = rng.pick(maskPool(columns, band, forced))

  const top: number[] = []
  const bottom: number[] = []

  for (let i = 0; i < digits; i++) {
    const isLeadingA = i === digits - 1
    const isLeadingB = i === bDigits - 1
    const hasBottom = i < bDigits
    const mustBorrow = ((mask >> i) & 1) === 1

    const [t, b] = rng.pick(
      columnPairs((t, b) => {
        if (isLeadingA && t < 1) return false
        if (isLeadingB && b < 1) return false
        if (!hasBottom) return b === 0
        if (i === chain && t !== 0) return false
        if (mustBorrow) return t < b
        // The leading column is never in the mask, so a strict `>` here is what
        // keeps the whole answer positive: even if a borrow arrives from the
        // right, `t - b - 1` is still at least zero.
        return isLeadingA && bDigits === digits ? t > b : t >= b
      }),
    )
    top.push(t)
    if (hasBottom) bottom.push(b)
  }

  return { a: numberFrom(top), b: numberFrom(bottom) }
}

export const mt4nbt4: ItemGenerator = {
  standardId: 'MT.4.NBT.4',
  label: 'Adding and subtracting big numbers',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = BANDS[bandIndexFor(d)]!
    const op = rng.int(0, 1) // 0 = subtract, 1 = add
    const digits = rng.pick(band.digits)
    const bDigits = rng.pick(secondLengths(op, digits, band))

    const { a, b } =
      op === ADD ? buildSum(rng, band, digits, bDigits) : buildDifference(rng, band, digits, bDigits)
    const result = op === ADD ? a + b : a - b

    return {
      standardId: 'MT.4.NBT.4',
      difficulty: d,
      prompt: op === ADD ? `${a} + ${b}` : `${a} ${MINUS} ${b}`,
      // Every value here is a whole number well under a million, so this is
      // exact — no float ever touches the key.
      answer: { kind: 'rational', canonical: String(result) },
      params: { a, b, op },
      workedSteps: workedSteps(a, b, op, result),
      misconceptions: misconceptionsFor(a, b, op, result),
    }
  },
}

/**
 * What each place is called, ones first.
 *
 * Worth the table rather than a formula, because place-value language is where
 * an explanation quietly stops being true: "the 4 in 456" has to be read as
 * "the 4 in the hundreds place", never "the first 4". A digit's position on the
 * page is not a fact about the number; its place is.
 *
 * `PLACE` names the column and always says the word "place", so a digit is
 * always located rather than pointed at. `UNIT` names one of whatever that
 * column counts, which is the thing that actually gets carried and borrowed —
 * you carry one ten, not one.
 *
 * Five entries covers everything reachable: four-digit numbers, plus the extra
 * column an addition can carry into.
 */
const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands']
const UNIT = ['one', 'ten', 'hundred', 'thousand', 'ten thousand']

/** `the tens place`, for naming where a digit sits. */
function place(i: number): string {
  return `${PLACE[i] ?? 'next'} place`
}

/** `Tens`, to open the step for that column. */
function heading(i: number): string {
  const name = PLACE[i] ?? 'next'
  return `${name[0]!.toUpperCase()}${name.slice(1)}`
}

/** `ten`, for the one unit that gets carried or borrowed into place `i`. */
function unitName(i: number): string {
  return UNIT[i] ?? 'unit'
}

function workedSteps(a: number, b: number, op: number, result: number): string[] {
  const steps = [
    op === ADD
      ? `Line them up so the ones sit under the ones, then work from the ones leftwards.`
      : `Line them up so the ones sit under the ones, with ${a} on top, then work from the ones leftwards.`,
  ]
  steps.push(...(op === ADD ? additionSteps(a, b) : subtractionSteps(a, b)))

  // A subtraction can empty out its front places — 3019 − 2530 works out to
  // 0489 column by column. Without this the last two steps look like they
  // disagree with each other, which is the sort of thing that makes a child stop
  // trusting the rest of the explanation.
  if (String(result).length < String(a).length) {
    steps.push(`The front of the answer came out 0, and a number is not written starting with 0.`)
  }

  steps.push(`So ${a} ${op === ADD ? '+' : MINUS} ${b} = ${result}.`)
  return steps
}

function additionSteps(a: number, b: number): string[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const steps: string[] = []
  let carry = 0

  for (let i = 0; i < top.length; i++) {
    const t = top[i]!
    const hasBottom = i < bottom.length
    const bd = bottom[i] ?? 0
    const total = t + bd + carry
    const carried = carry
    carry = total >= 10 ? 1 : 0

    let line: string
    if (!hasBottom) {
      line =
        carried === 1
          ? `${heading(i)}: there is nothing under the ${t}, but the 1 you carried makes ${total}.`
          : `${heading(i)}: there is nothing under the ${t}, so it stays ${t}.`
    } else if (carried === 1) {
      line = `${heading(i)}: ${t} + ${bd} = ${t + bd}, and the 1 you carried makes ${total}.`
    } else {
      line = `${heading(i)}: ${t} + ${bd} = ${total}.`
    }

    if (carry === 1) {
      line +=
        ` That is past 9, so write the ${total - 10} in the ${place(i)} and carry 1 into ` +
        `the ${place(i + 1)}.`
    }
    steps.push(line)
  }

  if (carry === 1) {
    steps.push(
      `Nothing is left to add in the ${place(top.length)}, so the 1 you carried goes there ` +
        `on its own.`,
    )
  }
  return steps
}

function subtractionSteps(a: number, b: number): string[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const steps: string[] = []
  let borrow = 0

  for (let i = 0; i < top.length; i++) {
    const t = top[i]!
    const hasBottom = i < bottom.length
    const bd = bottom[i] ?? 0
    const lent = borrow
    const left = t - lent
    const borrowing = left < bd
    const used = borrowing ? left + 10 : left
    borrow = borrowing ? 1 : 0

    // Say what the digit is worth *now*, after any lending, before saying what
    // is taken from it. Skipping that is where the standard algorithm stops
    // making sense and starts being a set of moves to remember.
    //
    // A 0 gets its own sentence because it is the one digit that cannot lend
    // what it was asked for. It has to be filled from the left first, and only
    // then can it hand 1 on — which is why the 9 appears from nowhere if nobody
    // says this part out loud.
    const opening =
      lent === 1
        ? t === 0
          ? `${heading(i)}: the 0 in the ${place(i)} has nothing to lend, so take 1 ` +
            `${unitName(i + 1)} from the ${place(i + 1)} first — that makes it 10, and lending 1 ` +
            `to the ${place(i - 1)} leaves 9.`
          : `${heading(i)}: the ${t} in the ${place(i)} lent 1 to the ${place(i - 1)}, so it is ` +
            `now ${left}.`
        : `${heading(i)}:`

    if (!hasBottom) {
      steps.push(
        lent === 1
          ? `${opening} There is nothing under it, so it stays ${used}.`
          : `${opening} there is nothing under the ${t}, so it stays ${t}.`,
      )
      continue
    }

    // `t === 0` is already covered by its own opening above, which explains the
    // borrow as part of explaining the 0, so it must not be explained twice.
    steps.push(
      borrowing && t !== 0
        ? `${opening} ${left} is smaller than ${bd}, so take 1 ${unitName(i + 1)} from the ` +
            `${place(i + 1)}. That makes ${used}, and ${used} ${MINUS} ${bd} = ${used - bd}.`
        : `${opening} ${used} ${MINUS} ${bd} = ${used - bd}.`,
    )
  }

  return steps
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * Every place is named as a place — the hundreds, the tens — and never by
 * position on the page. "The first 4" is not a thing that exists in arithmetic.
 */
function misconceptionsFor(a: number, b: number, op: number, result: number): Misconception[] {
  const candidates: { id: string; value: number; label: string; explanation: string }[] =
    op === ADD ? additionMistakes(a, b) : subtractionMistakes(a, b)

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. On the no-regrouping band
    // most of these *are* the correct answer, which is exactly right: there was
    // no carry to drop, so dropping one is not a thing that can have happened.
    if (c.value === result) continue
    const signature = String(c.value)
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}

interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

function additionMistakes(a: number, b: number): Candidate[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const width = Math.max(top.length, bottom.length)
  const totals: number[] = []
  for (let i = 0; i < width; i++) totals.push((top[i] ?? 0) + (bottom[i] ?? 0))

  const firstCarry = totals.findIndex((t) => t >= 10)
  const carryPlace = firstCarry < 0 ? 0 : firstCarry
  const carryTotal = totals[carryPlace] ?? 0

  const out: Candidate[] = [
    {
      id: 'dropped-the-carry',
      value: numberFrom(totals.map((t) => t % 10)),
      label: 'The carried 1s never moved',
      explanation:
        `Every column was added right. The carried 1s just never made it into the next place. ` +
        `In the ${place(carryPlace)}, ${top[carryPlace] ?? 0} + ${bottom[carryPlace] ?? 0} = ` +
        `${carryTotal}, and only the ${carryTotal % 10} can stay in the ${place(carryPlace)} — ` +
        `the 1 is a whole ${unitName(carryPlace + 1)}, so it moves into the ` +
        `${place(carryPlace + 1)} and gets added there.`,
    },
  ]

  // Writing the whole column total into the column. Real, and unmistakable on
  // two- and three-digit sums; on four-digit ones it would run to nine digits,
  // which is not a number anyone types, so naming it there would only sit in
  // the way of a mistake he might really make.
  if (width <= 3) {
    out.push({
      id: 'wrote-both-digits',
      value: Number(totals.map(String).reverse().join('')),
      label: 'Wrote the whole column total',
      explanation:
        `In the ${place(carryPlace)}, ${top[carryPlace] ?? 0} + ${bottom[carryPlace] ?? 0} = ` +
        `${carryTotal}, and all of ${carryTotal} got written down. Only one digit fits in a ` +
        `place. The ${carryTotal % 10} stays in the ${place(carryPlace)} and the 1 goes into ` +
        `the ${place(carryPlace + 1)}, because it is one whole ${unitName(carryPlace + 1)}.`,
    })
  }

  out.push({
    id: 'subtracted-instead',
    value: Math.abs(a - b),
    label: 'Took one away instead of adding',
    explanation:
      `That is what is left after taking one of these away from the other. This one says +, so ` +
      `the two amounts join together and the answer comes out bigger than ${Math.max(a, b)}, ` +
      `not smaller.`,
  })

  return out
}

function subtractionMistakes(a: number, b: number): Candidate[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const flipped = top.findIndex((t, i) => t < (bottom[i] ?? 0))
  const flipPlace = flipped < 0 ? 0 : flipped

  const out: Candidate[] = [
    {
      id: 'no-borrow',
      value: numberFrom(top.map((t, i) => Math.abs(t - (bottom[i] ?? 0)))),
      label: 'Took the smaller digit from the bigger one every time',
      explanation:
        `In the ${place(flipPlace)} the column says ${top[flipPlace] ?? 0} ${MINUS} ` +
        `${bottom[flipPlace] ?? 0}, and it got turned round to ${bottom[flipPlace] ?? 0} ${MINUS} ` +
        `${top[flipPlace] ?? 0} instead. A column is always the top digit take away the bottom ` +
        `one, whichever is bigger. When the top one is too small, borrow 1 ` +
        `${unitName(flipPlace + 1)} from the ${place(flipPlace + 1)} and do ` +
        `${(top[flipPlace] ?? 0) + 10} ${MINUS} ${bottom[flipPlace] ?? 0} instead.`,
    },
  ]

  const chain = borrowChainPlace(a, b)
  if (chain >= 0) {
    out.push({
      id: 'borrow-chain-slip',
      value: borrowChainSlip(a, b, chain),
      label: 'The borrow got through the 0, but the place it came from stayed put',
      explanation:
        `The ${place(chain)} holds a 0, so it had nothing to lend and had to take 1 ` +
        `${unitName(chain + 1)} from the ${place(chain + 1)} first. That part happened. What got ` +
        `missed is that the ${place(chain + 1)} is then one smaller: the ${top[chain + 1]} drops ` +
        `to ${top[chain + 1]! - 1}. Borrowing always costs the place it came from.`,
    })
  }

  out.push({
    id: 'added-instead',
    value: a + b,
    label: 'Added instead of taking away',
    explanation:
      `That is the two numbers put together. This one says ${MINUS}, so ${b} is taken away from ` +
      `${a} and the answer has to come out smaller than ${a}.`,
  })

  return out
}

/**
 * The place of a 0 in the top number that a borrow is dragged through, or -1.
 *
 * Found by running the standard algorithm and watching for a column that both
 * received a borrow and had to pass one on while holding a 0 — which is the only
 * shape where the chain exists.
 */
function borrowChainPlace(a: number, b: number): number {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  let borrow = 0
  for (let i = 0; i < top.length; i++) {
    const arriving = borrow
    borrow = top[i]! - (bottom[i] ?? 0) - borrow < 0 ? 1 : 0
    if (top[i] === 0 && arriving === 1 && borrow === 1) return i
  }
  return -1
}

/**
 * The standard algorithm run with one step left out: the place above the 0 never
 * goes down by one, even though it is what the 0 borrowed from.
 *
 * Simulated rather than shortcut, so that what this returns is literally the
 * number a child gets by doing exactly that.
 */
function borrowChainSlip(a: number, b: number, chain: number): number {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const out: number[] = []
  let borrow = 0

  for (let i = 0; i < top.length; i++) {
    // The slipped step: this column is the one the 0 took from, and it carries on
    // as though it had given nothing away.
    let column = i === chain + 1 ? top[i]! - (bottom[i] ?? 0) : top[i]! - (bottom[i] ?? 0) - borrow
    borrow = column < 0 ? 1 : 0
    if (borrow === 1) column += 10
    out.push(column)
  }
  return numberFrom(out)
}
