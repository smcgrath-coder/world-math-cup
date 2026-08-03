/**
 * Exact rational arithmetic.
 *
 * Every value is stored as a reduced integer pair, so equality and comparison
 * are exact. Nothing here goes through floating point — a rounding error would
 * mean telling a child their correct answer is wrong.
 */

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a || 1
}

export class Rational {
  readonly n: number
  readonly d: number

  constructor(n: number, d: number = 1) {
    if (d === 0) throw new Error('Rational: zero denominator')
    if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error('Rational: non-integer')
    const sign = d < 0 ? -1 : 1
    const g = gcd(n, d)
    const numerator = (sign * n) / g
    // Collapse -0 so that zero has exactly one representation.
    this.n = numerator === 0 ? 0 : numerator
    this.d = (sign * d) / g
  }

  add(o: Rational) {
    return new Rational(this.n * o.d + o.n * this.d, this.d * o.d)
  }
  sub(o: Rational) {
    return new Rational(this.n * o.d - o.n * this.d, this.d * o.d)
  }
  mul(o: Rational) {
    return new Rational(this.n * o.n, this.d * o.d)
  }
  div(o: Rational) {
    if (o.n === 0) throw new Error('Rational: divide by zero')
    return new Rational(this.n * o.d, this.d * o.n)
  }

  equals(o: Rational) {
    return this.n === o.n && this.d === o.d
  }
  /** Negative, zero or positive as `this` is less than, equal to or greater than `o`. */
  compare(o: Rational) {
    return this.n * o.d - o.n * this.d
  }
  isInteger() {
    return this.d === 1
  }
  toNumber() {
    return this.n / this.d
  }
  toString() {
    return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`
  }

  static parse(s: string): Rational | null {
    return Rational.parseWithForm(s)?.value ?? null
  }

  /**
   * Also reports whether the written form was already in lowest terms. Forms with no
   * fraction written at all — integers and decimals — report `reduced: true`, since
   * there is nothing there to reduce.
   */
  static parseWithForm(s: string): { value: Rational; reduced: boolean } | null {
    const t = s.trim()
    if (!t) return null

    // mixed number: "1 1/2" or "-1 1/2"
    const mixed = t.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
    if (mixed) {
      const whole = parseInt(mixed[2], 10)
      const num = parseInt(mixed[3], 10)
      const den = parseInt(mixed[4], 10)
      if (den === 0) return null
      const magnitude = whole * den + num
      return {
        value: new Rational(mixed[1] === '-' ? -magnitude : magnitude, den),
        reduced: gcd(num, den) === 1,
      }
    }

    // fraction: "3/4"
    const frac = t.match(/^(-?\d+)\s*\/\s*(-?\d+)$/)
    if (frac) {
      const num = parseInt(frac[1], 10)
      const den = parseInt(frac[2], 10)
      if (den === 0) return null
      return { value: new Rational(num, den), reduced: gcd(num, den) === 1 }
    }

    // decimal: "0.875", ".5", "42.0" — read digit by digit so no float is involved
    const dec = t.match(/^(-?)(\d*)\.(\d+)$/)
    if (dec) {
      const den = 10 ** dec[3].length
      const magnitude = parseInt(dec[2] || '0', 10) * den + parseInt(dec[3], 10)
      return { value: new Rational(dec[1] === '-' ? -magnitude : magnitude, den), reduced: true }
    }

    // integer
    if (/^-?\d+$/.test(t)) return { value: new Rational(parseInt(t, 10), 1), reduced: true }

    return null
  }
}
