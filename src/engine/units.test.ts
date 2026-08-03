import { describe, expect, it } from 'vitest'
import { checkAnswer, normaliseInput } from './answer'

const spec = (canonical: string) => ({ kind: 'rational' as const, canonical })

describe('unit suffixes', () => {
  it('accepts a measurement unit after the number', () => {
    for (const given of ['250 cm', '250cm', '250 centimetres', '250 centimeters', '250 cm.']) {
      expect(checkAnswer(given, spec('250')).correct, `rejected "${given}"`).toBe(true)
    }
  })

  it('accepts units on fractional and decimal answers', () => {
    expect(checkAnswer('1/2 kg', spec('1/2')).correct).toBe(true)
    expect(checkAnswer('2.5 m', spec('5/2')).correct).toBe(true)
    expect(checkAnswer('1 1/2 hours', spec('3/2')).correct).toBe(true)
  })

  it('accepts the units this curriculum actually uses', () => {
    const cases: [string, string][] = [
      ['12 in', '12'], ['3 ft', '3'], ['5 yd', '5'], ['90 degrees', '90'],
      ['4 l', '4'], ['16 oz', '16'], ['30 min', '30'], ['28 sq units', '28'],
      // Spelled-out forms the MD.1 and MD.3 prompts invite by name.
      ['5000 milliliters', '5000'], ['5000 millilitres', '5000'],
      ['3000 milligrams', '3000'], ['2 kilograms', '2'],
      ['48 square centimeters', '48'], ['48 square feet', '48'],
      ['3 weeks', '3'],
    ]
    for (const [given, key] of cases) {
      expect(checkAnswer(given, spec(key)).correct, `rejected "${given}"`).toBe(true)
    }
  })

  it('does NOT strip place-value words, which change the value', () => {
    // `12 tens` means 120. Stripping it would turn an unreadable answer -- which
    // is re-prompted and costs nothing -- into a wrong one, which is scored.
    for (const given of ['12 tens', '12 hundreds', '3 ones']) {
      const r = checkAnswer(given, spec('12'))
      expect(r.correct, `wrongly accepted "${given}"`).toBe(false)
      expect(r.unparseable, `"${given}" should be unreadable, not wrong`).toBe(true)
    }
  })

  it('does not invent a number out of a bare unit', () => {
    expect(checkAnswer('cm', spec('250')).unparseable).toBe(true)
    expect(normaliseInput('cm')).toBe('')
  })

  it('leaves a wrong value wrong when a unit is attached', () => {
    expect(checkAnswer('249 cm', spec('250')).correct).toBe(false)
  })

  it('does not strip letters generally', () => {
    expect(checkAnswer('banana', spec('250')).unparseable).toBe(true)
    expect(checkAnswer('250 bananas', spec('250')).unparseable).toBe(true)
  })
})
