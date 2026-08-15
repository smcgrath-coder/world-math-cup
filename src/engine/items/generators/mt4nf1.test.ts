import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  HOW_MANY_PIECES,
  MISSING_DENOMINATOR,
  MISSING_NUMERATOR,
  NAMES,
  PIECE_NAMES,
  SCALE_FACTOR,
  THINGS,
  WHICH_SAME,
  WORD_SAME_CUT,
  mt4nf1,
} from './mt4nf1'
import { answerText, canonicalOf } from '../../answer'

/**
 * Independent of the generator, one route per format.
 *
 * The standard says a/b is equivalent to (n × a)/(n × b), and every format here
 * is a different hole punched in that sentence. Each recomputation below works
 * from the numbers the prompt actually *shows* and asks what the missing one has
 * to be for the two fractions to be equal — never from `mult`, which is the
 * number the generator multiplied by. A generator that drew one multiplier and
 * used another, or that printed a numerator its own key disagrees with, is
 * caught rather than agreed with.
 */
const answerFrom = (p: Record<string, number>) => {
  const { a, b, targetDen, scaledNum } = p as {
    a: number
    b: number
    targetDen: number
    scaledNum?: number
  }
  switch (p.format) {
    // Shown a/b and the new bottom number. a/b = x/targetDen, so x = a × targetDen ÷ b.
    case MISSING_NUMERATOR:
    case WORD_SAME_CUT:
      return new R(a * targetDen, b).toString()
    // Shown a/b and the new top number. a/b = scaledNum/x, so x = scaledNum × b ÷ a.
    case MISSING_DENOMINATOR:
      return new R(scaledNum! * b, a).toString()
    // Both fractions shown. The factor took a to scaledNum, so it is scaledNum ÷ a.
    case SCALE_FACTOR:
      return new R(scaledNum!, a).toString()
    // How many b-ths is scaledNum/targetDen? x/b = scaledNum/targetDen.
    case HOW_MANY_PIECES:
      return new R(scaledNum! * b, targetDen).toString()
    // The option equal to the fraction on offer, which is that fraction in
    // lowest terms. Reached without touching a or b at all.
    case WHICH_SAME:
      return new R(scaledNum!, targetDen).toString()
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** The three options of a `WHICH_SAME` item, in the order it prints them. */
function optionsOf(p: Record<string, number>): string[] {
  const correct = `${p.a}/${p.b}`
  const others = [`${p.a}/${p.targetDen}`, `${p.scaledNum}/${p.b}`]
  const out = [...others]
  out.splice(p.slot!, 0, correct)
  return out
}

/**
 * The prompt rebuilt from params, character for character.
 *
 * This shares the *words* with the generator and never its arithmetic, which is
 * the same trade `MT.4.MD.3` makes. It is doing more work here than on a
 * single-format generator: with six shapes in play it is what stops a format
 * from printing one question and marking another.
 */
const rebuildPrompt = (p: Record<string, number>) => {
  const { a, b, targetDen, scaledNum } = p
  switch (p.format) {
    case MISSING_NUMERATOR:
      return `${a}/${b} = ?/${targetDen}. What is the missing top number?`
    case MISSING_DENOMINATOR:
      return `${a}/${b} = ${scaledNum}/?. What is the missing bottom number?`
    case SCALE_FACTOR:
      return (
        `${a}/${b} = ${scaledNum}/${targetDen}. The top and the bottom were both ` +
        `multiplied by the same number. What number was it?`
      )
    case HOW_MANY_PIECES:
      return `${scaledNum}/${targetDen} is the same amount as how many ${PIECE_NAMES[b!]![1]}?`
    case WHICH_SAME:
      // The three used to be listed here too. They are the buttons now.
      return `Which of these is the same amount as ${scaledNum}/${targetDen}?`
    case WORD_SAME_CUT: {
      const first = NAMES[p.nameA!]
      const second = NAMES[p.nameB!]
      const { thing, pieces } = THINGS[p.thing!]!
      return (
        `${first} cut a ${thing} into ${b} equal ${pieces} and took ${a} of them. ` +
        `${second} cut an identical ${thing} into ${targetDen} equal ${pieces}. ` +
        `How many of the smaller ${pieces} does ${second} need to take to have the ` +
        `same amount as ${first}?`
      )
    }
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** Mean of a param over many seeds, so a difficulty claim is not one lucky draw. */
function meanParam(difficulty: number, key: string): number {
  let total = 0
  for (let seed = 0; seed < 60; seed++) total += mt4nf1.generate(difficulty, makeRng(seed)).params[key]!
  return total / 60
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

const EASIEST = 5
const HARDEST = 70

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nf1.generate(difficulty, makeRng(s)))
}

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

describe('MT.4.NF.1 equivalent fractions', () => {
  it('is sound across its full range', () => {
    // `promptParams` is deliberately not used: no single param appears as a
    // digit in all six formats — `targetDen` is the answer in one of them and
    // `b` is spelled as a word in another — so a list of keys would either be
    // empty or wrong. `rebuildPrompt` is the strong form of the same check and
    // covers every format.
    assertGeneratorSound(mt4nf1, answerFrom, { rebuildPrompt })
  })

  it('scales up the multiplier and the starting denominator with difficulty', () => {
    expect(meanParam(60, 'mult')).toBeGreaterThan(meanParam(8, 'mult'))
    expect(meanParam(60, 'b')).toBeGreaterThan(meanParam(8, 'b'))
  })

  it('always starts from a proper fraction in lowest terms', () => {
    // An unreduced start (2/4 = ?/12) muddies what is being asked: he could get
    // there by reducing rather than by scaling, which is a different standard.
    for (const item of everyItem()) {
      const { a, b } = item.params as Record<string, number>
      expect(a, `a out of range on ${item.prompt}`).toBeGreaterThanOrEqual(1)
      expect(a, `not proper on ${item.prompt}`).toBeLessThan(b!)
      expect(gcd(a!, b!), `${a}/${b} is not in lowest terms`).toBe(1)
    }
  })

  it('always relates two fractions that really are equal', () => {
    // Every format shows or implies both fractions. If `scaledNum/targetDen`
    // were not the same amount as `a/b`, the question would have no right
    // answer at all — whichever number it asked for.
    for (const item of everyItem()) {
      const { a, b, targetDen, mult } = item.params as Record<string, number>
      expect(mult, `multiplier of 1 is not a question on ${item.prompt}`).toBeGreaterThanOrEqual(2)
      expect(targetDen).toBe(b! * mult!)
      const scaled = item.params.scaledNum
      if (scaled !== undefined) {
        // Cross products, so this never divides and never rounds.
        expect(a! * targetDen!, item.prompt).toBe(scaled * b!)
      }
    }
  })

  it('asks six genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and on this
    // standard he was right: there was exactly one sentence.
    const items = everyItem()
    const shapes = new Map<string, number>()
    const formats = new Map<number, number>()
    for (const item of items) {
      const key = shape(item.prompt)
      shapes.set(key, (shapes.get(key) ?? 0) + 1)
      formats.set(item.params.format!, (formats.get(item.params.format!) ?? 0) + 1)
    }

    expect(shapes.size).toBeGreaterThanOrEqual(6)
    for (const [key, count] of shapes) {
      expect(count / items.length, `"${key}" is ${((count / items.length) * 100).toFixed(0)}% of items`)
        .toBeLessThan(0.35)
    }
    // Formats, not just wordings: six sentences that were really one question
    // would pass the check above and fail the point of it.
    expect(formats.size).toBe(6)
    for (const [format, count] of formats) {
      expect(count / items.length, `format ${format} is too much of the diet`).toBeLessThan(0.35)
    }
  })

  it('puts the two hardest representations out of reach of the easiest band', () => {
    // Reducing and recognising both need the multiplier recovered and then
    // divided out. A format is not the difficulty dial, but a hard format
    // handed to the lowest-rated player is a trap.
    const easyFormats = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easyFormats.has(HOW_MANY_PIECES)).toBe(false)
    expect(easyFormats.has(WHICH_SAME)).toBe(false)

    const hardFormats = new Set(itemsAt(HARDEST, 200).map((i) => i.params.format))
    expect(hardFormats.has(HOW_MANY_PIECES)).toBe(true)
    expect(hardFormats.has(WHICH_SAME)).toBe(true)
  })

  it('answers with a whole number on every format except the recognition one', () => {
    // Each of these asks for a count or a factor. A fractional key would mean
    // the question and the answer box disagree about what is wanted.
    for (const item of everyItem()) {
      if (item.params.format === WHICH_SAME) {
        // The recognition format is picked, not typed, so it has no numeric key.
        expect(item.answer.kind, item.prompt).toBe('choice')
        expect(answerText(item.answer), item.prompt).toBe(`${item.params.a}/${item.params.b}`)
        continue
      }
      expect(item.answer.kind, item.prompt).toBe('rational')
      expect(R.parse(canonicalOf(item.answer))!.isInteger(), item.prompt).toBe(true)
    }
  })

  it('says where the answer box goes on exactly the formats with a blank in them', () => {
    // The box sitting above `/12` is a better answer to "he might type 9/12"
    // than any wording is. Where there is no expression to sit inside — a
    // sentence, a word question, three options — there is no slot to give.
    for (const item of everyItem()) {
      const { a, b, targetDen, scaledNum, format } = item.params as Record<string, number>
      if (format === MISSING_NUMERATOR) {
        expect(item.promptWithSlot, item.prompt).toBe(`${a}/${b} = {}/${targetDen}`)
        expect(item.prompt).toContain('What is the missing top number?')
      } else if (format === MISSING_DENOMINATOR) {
        expect(item.promptWithSlot, item.prompt).toBe(`${a}/${b} = ${scaledNum}/{}`)
        expect(item.prompt).toContain('What is the missing bottom number?')
      } else {
        expect(item.promptWithSlot, item.prompt).toBeUndefined()
      }
    }
  })

  it('offers three distinct options, one of them right, in a moving position', () => {
    const items = everyItem().filter((i) => i.params.format === WHICH_SAME)
    expect(items.length).toBeGreaterThan(0)
    const positions = new Set<number>()
    for (const item of items) {
      const options = optionsOf(item.params)
      positions.add(item.params.slot!)
      // The item really carries them now, so the independent rebuild above is
      // checked against the buttons a child will actually see rather than
      // against a sentence.
      expect(item.answer.kind, item.prompt).toBe('choice')
      expect(item.answer.kind === 'choice' && item.answer.options, item.prompt).toEqual(options)
      expect(new Set(options).size, item.prompt).toBe(3)
      // Distinct as strings is not enough — two options that are the same
      // *amount* would make the question have two right answers.
      const values = options.map((o) => R.parse(o)!.toString())
      expect(new Set(values).size, item.prompt).toBe(3)
      expect(options[item.params.slot!], item.prompt).toBe(answerText(item.answer))
      // And no option is one whole written as a fraction. `3/3` can be crossed
      // off at a glance without thinking about equivalence at all, which would
      // quietly turn three options into two.
      for (const option of options) expect(R.parse(option)!.toString(), item.prompt).not.toBe('1')
    }
    // A right answer that is always in the same place is a question about
    // position rather than about fractions.
    expect(positions).toEqual(new Set([0, 1, 2]))
  })

  it('names the two half-done reductions as the wrong options', () => {
    // Dividing the top and leaving the bottom, or the other way round. Both are
    // always genuinely wrong: dividing one number of a fraction and not the
    // other cannot leave the amount alone.
    for (const item of everyItem().filter((i) => i.params.format === WHICH_SAME)) {
      const { a, b, targetDen, scaledNum } = item.params as Record<string, number>
      const ids = item.misconceptions.map((m) => m.id)
      expect(ids, item.prompt).toContain('divided-the-top-only')
      expect(ids, item.prompt).toContain('divided-the-bottom-only')
      const byId = new Map(item.misconceptions.map((m) => [m.id, m.signature]))
      // Signed with the text on the button, not the reduced value. `2/12`
      // reduces to `1/6`, which is not something a child can press, so a
      // signature taken from the value would never fire.
      expect(byId.get('divided-the-top-only')).toBe(`${a}/${targetDen}`)
      expect(byId.get('divided-the-bottom-only')).toBe(`${scaledNum}/${b}`)
    }
  })

  it('names writing the fraction only where a child would write one', () => {
    // He may well have understood it perfectly and answered 3/4. Naming it lets
    // the film room say so instead of filing it as "off". On the two equation
    // formats the slot makes it unlikely; on "how many fourths?" there is no
    // slot to help, so it matters most there.
    //
    // And it is deliberately absent everywhere else. Nobody answers "what was
    // it multiplied by?" with a fraction, and a misconception no child would
    // ever type is dead weight that looks like coverage.
    const wanted = new Set([MISSING_NUMERATOR, MISSING_DENOMINATOR, HOW_MANY_PIECES])
    for (const item of everyItem()) {
      const ids = item.misconceptions.map((m) => m.id)
      expect(ids.includes('wrote-the-fraction'), item.prompt).toBe(wanted.has(item.params.format!))
    }
  })

  it('names the additive slip in whichever direction the format runs', () => {
    // 3/4 = ?/12: the bottom went up by 8, so the child puts the top up by 8
    // too. The same mistake keeps the same id when the blank moves underneath,
    // but the number it produces is not the same one — there it is the bottom
    // that gets the top's gap added to it. Carrying one formula across both
    // would name a value no child on that format could have typed.
    //
    // Either way it is always available: both would need a to equal b, and a/b
    // is always a proper fraction.
    let onTop = 0
    let underneath = 0
    for (const item of everyItem()) {
      const { a, b, targetDen, format } = item.params as Record<string, number>
      const gap = item.misconceptions.find((m) => m.id === 'added-difference')
      if (!gap) continue
      if (format === MISSING_DENOMINATOR) {
        underneath++
        const topGap = (a! * targetDen!) / b! - a!
        expect(gap.signature, item.prompt).toBe(String(b! + topGap))
      } else {
        onTop++
        expect([MISSING_NUMERATOR, WORD_SAME_CUT], item.prompt).toContain(format)
        expect(gap.signature, item.prompt).toBe(String(a! + (targetDen! - b!)))
      }
    }
    expect(onTop).toBeGreaterThan(0)
    expect(underneath).toBeGreaterThan(0)
  })

  it('never names a mistake on a format where that mistake cannot happen', () => {
    // Adding straight across means nothing when the question asks which of
    // three fractions matches, and a misconception no child could ever type is
    // dead weight dressed up as coverage.
    for (const item of everyItem()) {
      expect(item.misconceptions.length, item.prompt).toBeGreaterThan(0)
      for (const m of item.misconceptions) {
        expect(m.signature, item.prompt).not.toBe(answerText(item.answer))
      }
    }
  })

  it('keeps the more diagnostic mistake when two land on the same number', () => {
    // When the multiplier equals the starting top number (3/4 = ?/12), "kept the
    // top number" and "wrote the multiplier" both produce 3. They cannot be told
    // apart, so only the one that says more about his thinking is named.
    let checked = 0
    for (let s = 0; s < 400 && checked < 3; s++) {
      const item = mt4nf1.generate(30, makeRng(s))
      const { a, mult, format } = item.params as Record<string, number>
      if (format !== MISSING_NUMERATOR || a !== mult) continue
      checked++
      expect(item.misconceptions.some((m) => m.id === 'kept-numerator'), item.prompt).toBe(true)
      expect(item.misconceptions.some((m) => m.id === 'answered-multiplier'), item.prompt).toBe(false)
    }
    expect(checked, 'no item where the multiplier equals the top number').toBeGreaterThan(0)
  })

  it('never names two different children in the same word problem', () => {
    for (const item of everyItem().filter((i) => i.params.format === WORD_SAME_CUT)) {
      expect(item.params.nameA, item.prompt).not.toBe(item.params.nameB)
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nf1.generate(0, makeRng(4)).difficulty).toBe(5)
    expect(mt4nf1.generate(99, makeRng(4)).difficulty).toBe(70)
    expect(mt4nf1.generate(-3, makeRng(4)).difficulty).toBe(5)
    expect(mt4nf1.generate(31.6, makeRng(4)).difficulty).toBe(31.6)
  })
})
