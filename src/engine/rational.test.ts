import { describe, expect, it } from 'vitest'
import { Rational as R } from './rational'

describe('Rational', () => {
  it('reduces on construction', () => {
    expect(new R(4, 8).toString()).toBe('1/2')
    expect(new R(6, 3).toString()).toBe('2')
  })

  it('normalises sign to the numerator', () => {
    expect(new R(1, -2).toString()).toBe('-1/2')
    expect(new R(-1, -2).toString()).toBe('1/2')
  })

  it('throws on zero denominator', () => {
    expect(() => new R(1, 0)).toThrow()
  })

  it('adds, subtracts, multiplies, divides exactly', () => {
    expect(new R(3, 4).add(new R(1, 8)).toString()).toBe('7/8')
    expect(new R(5, 6).sub(new R(1, 3)).toString()).toBe('1/2')
    expect(new R(2, 3).mul(new R(3, 4)).toString()).toBe('1/2')
    expect(new R(1, 2).div(new R(1, 4)).toString()).toBe('2')
  })

  it('compares exactly, including across representations', () => {
    expect(new R(1, 2).equals(new R(4, 8))).toBe(true)
    expect(new R(1, 3).equals(new R(2, 6))).toBe(true)
    expect(new R(1, 2).equals(new R(1, 3))).toBe(false)
  })

  it('parses fractions, integers, mixed numbers and decimals', () => {
    expect(R.parse('3/4')!.toString()).toBe('3/4')
    expect(R.parse(' 3 / 4 ')!.toString()).toBe('3/4')
    expect(R.parse('7')!.toString()).toBe('7')
    expect(R.parse('1 1/2')!.toString()).toBe('3/2')
    expect(R.parse('0.875')!.toString()).toBe('7/8')
    expect(R.parse('-2/5')!.toString()).toBe('-2/5')
  })

  it('returns null for unparseable input', () => {
    expect(R.parse('banana')).toBeNull()
    expect(R.parse('')).toBeNull()
    expect(R.parse('1/0')).toBeNull()
  })

  it('reports whether a written form was already in lowest terms', () => {
    expect(R.parseWithForm('2/4')!.reduced).toBe(false)
    expect(R.parseWithForm('1/2')!.reduced).toBe(true)
  })

  it('treats a trailing .0 as the plain integer', () => {
    expect(R.parse('42.0')!.equals(R.parse('42')!)).toBe(true)
    expect(R.parse('42.0')!.toString()).toBe('42')
    expect(R.parse('42.00')!.toString()).toBe('42')
    expect(R.parse('-42.0')!.equals(new R(-42))).toBe(true)
  })

  it('normalises zero regardless of the denominator it arrived with', () => {
    expect(new R(0, 5).toString()).toBe('0')
    expect(new R(0, 5).equals(new R(0, 3))).toBe(true)
    expect(new R(0, -5).toString()).toBe('0')
    expect(new R(0, -5).equals(new R(0, 1))).toBe(true)
    expect(R.parse('0.0')!.equals(new R(0))).toBe(true)
  })

  it('parses a leading-dot decimal written without its zero', () => {
    expect(R.parse('.5')!.toString()).toBe('1/2')
    expect(R.parse('-.5')!.toString()).toBe('-1/2')
    expect(R.parse('.125')!.toString()).toBe('1/8')
  })

  it('round-trips mixed numbers, including negative ones', () => {
    expect(R.parse('1 1/2')!.toString()).toBe('3/2')
    expect(R.parse('-1 1/2')!.toString()).toBe('-3/2')
    expect(R.parse('-1 1/2')!.equals(new R(-3, 2))).toBe(true)
    expect(R.parse('2 3/4')!.equals(new R(11, 4))).toBe(true)
    expect(R.parse('-2 3/4')!.equals(new R(-11, 4))).toBe(true)
    expect(R.parse('1 2/4')!.equals(new R(3, 2))).toBe(true)
    expect(R.parseWithForm('1 2/4')!.reduced).toBe(false)
    expect(R.parseWithForm('1 1/2')!.reduced).toBe(true)
    expect(R.parse('1 1/0')).toBeNull()
    // The minus sign is the one that was written, not the sign of the whole part:
    // parseInt('-0') is -0, which is not < 0.
    expect(R.parse('-0 1/2')!.equals(new R(-1, 2))).toBe(true)
  })

  it('compares correctly across signs', () => {
    expect(new R(-1, 2).compare(new R(1, 3))).toBeLessThan(0)
    expect(new R(1, 3).compare(new R(-1, 2))).toBeGreaterThan(0)
    expect(new R(-1, 2).compare(new R(-3, 4))).toBeGreaterThan(0)
    expect(new R(1, 2).compare(new R(2, 4))).toBe(0)
    expect(new R(0, 1).compare(new R(-1, 8))).toBeGreaterThan(0)
  })

  it('parses decimals without losing precision', () => {
    expect(R.parse('0.1')!.equals(new R(1, 10))).toBe(true)
    expect(R.parse('0.3')!.equals(new R(3, 10))).toBe(true)
    expect(R.parse('0.7')!.equals(new R(7, 10))).toBe(true)
    expect(R.parse('0.29')!.equals(new R(29, 100))).toBe(true)
    expect(R.parse('2.675')!.equals(new R(107, 40))).toBe(true)
    expect(R.parse('0.1')!.add(R.parse('0.2')!).equals(new R(3, 10))).toBe(true)
    // Reading the digits as integers stays exact where `parseFloat(s) * 10 ** places`
    // rounds to ...780. Far beyond anything a child will type, but it pins the rule
    // that no step of parsing goes through floating point.
    expect(R.parse('42.46380423641779')!.equals(new R(4246380423641779, 100000000000000))).toBe(
      true,
    )
  })

  it('reports integer-ness and a numeric value', () => {
    expect(new R(6, 3).isInteger()).toBe(true)
    expect(new R(1, 2).isInteger()).toBe(false)
    expect(new R(1, 2).toNumber()).toBe(0.5)
    expect(new R(-6, 4).toNumber()).toBe(-1.5)
  })

  it('throws when dividing by zero', () => {
    expect(() => new R(1, 2).div(new R(0, 5))).toThrow()
  })
})
