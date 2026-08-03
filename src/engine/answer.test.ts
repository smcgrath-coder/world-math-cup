import { describe, expect, it } from 'vitest'
import { checkAnswer, normaliseInput } from './answer'
import { Rational } from './rational'

const num = (canonical: string) => ({ kind: 'rational' as const, canonical })

describe('checkAnswer', () => {
  it('accepts the canonical form', () => {
    expect(checkAnswer('7/8', num('7/8')).correct).toBe(true)
  })

  it('accepts equivalent unreduced fractions but flags them', () => {
    const r = checkAnswer('14/16', num('7/8'))
    expect(r.correct).toBe(true)
    expect(r.nudge).toBe('unreduced')
  })

  it('accepts equivalent decimals', () => {
    expect(checkAnswer('0.875', num('7/8')).correct).toBe(true)
  })

  it('accepts mixed numbers', () => {
    expect(checkAnswer('1 1/2', num('3/2')).correct).toBe(true)
  })

  it('tolerates whitespace', () => {
    expect(checkAnswer('  7 / 8 ', num('7/8')).correct).toBe(true)
  })

  it('rejects wrong values', () => {
    expect(checkAnswer('4/12', num('7/8')).correct).toBe(false)
  })

  it('rejects unparseable input without throwing', () => {
    const r = checkAnswer('banana', num('7/8'))
    expect(r.correct).toBe(false)
    expect(r.unparseable).toBe(true)
  })

  it('checks integer answers', () => {
    expect(checkAnswer('42', num('42')).correct).toBe(true)
    expect(checkAnswer('42.0', num('42')).correct).toBe(true)
  })
})

/**
 * The prime directive: marking a right answer wrong is the most damaging thing
 * this module can do. Every case below is a way a 10-year-old could plausibly
 * write a correct value, and every one of them must be accepted.
 */
describe('normaliseInput', () => {
  it('maps every dash a keyboard or autocorrect can produce to ASCII minus', () => {
    expect(normaliseInput('−1/2')).toBe('-1/2') // U+2212 true minus
    expect(normaliseInput('–1/2')).toBe('-1/2') // en dash
    expect(normaliseInput('—1/2')).toBe('-1/2') // em dash
    expect(normaliseInput('‐1/2')).toBe('-1/2') // hyphen
    expect(normaliseInput('－1/2')).toBe('-1/2') // fullwidth hyphen-minus
  })

  it('maps unicode slashes to ASCII solidus', () => {
    expect(normaliseInput('7⁄8')).toBe('7/8') // U+2044 fraction slash
    expect(normaliseInput('7∕8')).toBe('7/8') // U+2215 division slash
    expect(normaliseInput('7／8')).toBe('7/8') // fullwidth solidus
  })

  it('strips thousands separators between digit groups', () => {
    expect(normaliseInput('1,000')).toBe('1000')
    expect(normaliseInput('12,345')).toBe('12345')
    expect(normaliseInput('1,000,000')).toBe('1000000')
    expect(normaliseInput('-1,000')).toBe('-1000')
    expect(normaliseInput('1,000.5')).toBe('1000.5')
  })

  it('leaves ambiguous commas alone rather than guessing', () => {
    // A comma that is not a thousands group may be a decimal comma. Guessing
    // could turn a right answer into a wrong number; leaving it alone makes the
    // input unparseable instead, which the UI can re-prompt on.
    expect(normaliseInput('0,875')).toBe('0,875')
    expect(normaliseInput('1,5')).toBe('1,5')
    expect(normaliseInput('1,0000')).toBe('1,0000')
  })

  it('strips a leading plus', () => {
    expect(normaliseInput('+3')).toBe('3')
    expect(normaliseInput('+3/4')).toBe('3/4')
    expect(normaliseInput('+ 3')).toBe('3')
    expect(normaliseInput('＋3')).toBe('3') // fullwidth plus
  })

  it('strips a trailing decimal point', () => {
    expect(normaliseInput('5.')).toBe('5')
    expect(normaliseInput('-5.')).toBe('-5')
    expect(normaliseInput('.5')).toBe('.5')
    expect(normaliseInput('42.0')).toBe('42.0')
  })

  it('collapses repeated and non-ASCII whitespace', () => {
    expect(normaliseInput('1   1/2')).toBe('1 1/2')
    expect(normaliseInput('  7 / 8 ')).toBe('7 / 8')
    expect(normaliseInput('7\u00a0/\u00a08')).toBe('7 / 8') // non-breaking spaces
    expect(normaliseInput('7\n/\t8')).toBe('7 / 8')
  })

  it('closes the gap between a sign and its number', () => {
    // Found while trying to break the checker: `- 1/2` is a right answer, and
    // a space after the minus is an easy thing to type. The space carries no
    // arithmetic meaning, so it must not cost him the point.
    expect(normaliseInput('- 1/2')).toBe('-1/2')
    expect(normaliseInput('-  1/2')).toBe('-1/2')
    expect(normaliseInput('− 1/2')).toBe('-1/2')
    expect(normaliseInput('- 5')).toBe('-5')
    // ...but the space inside a mixed number is load-bearing and stays.
    expect(normaliseInput('-1 1/2')).toBe('-1 1/2')
    expect(normaliseInput('- 1 1/2')).toBe('-1 1/2')
  })

  it('reads a division sign as a fraction bar', () => {
    // `÷` sits on the iPad symbol keyboard and means exactly "over".
    expect(normaliseInput('7÷8')).toBe('7/8')
  })

  it('never treats a space as a thousands separator', () => {
    // Deliberate: mixed-number syntax wins. `1 1/2` must stay one and a half,
    // so `1 000` cannot mean 1000 — it is left unparseable instead.
    expect(normaliseInput('1 000')).toBe('1 000')
  })
})

describe('checkAnswer notation tolerance', () => {
  it('accepts unicode minus', () => {
    expect(checkAnswer('−1/2', num('-1/2')).correct).toBe(true)
    expect(checkAnswer('–1/2', num('-1/2')).correct).toBe(true)
    expect(checkAnswer('—1/2', num('-1/2')).correct).toBe(true)
  })

  it('accepts a unicode fraction slash', () => {
    expect(checkAnswer('7⁄8', num('7/8')).correct).toBe(true)
    expect(checkAnswer('7÷8', num('7/8')).correct).toBe(true)
  })

  it('accepts a space between the minus sign and the number', () => {
    expect(checkAnswer('- 1/2', num('-1/2')).correct).toBe(true)
    expect(checkAnswer('− 1/2', num('-1/2')).correct).toBe(true)
    expect(checkAnswer('- 1 1/2', num('-3/2')).correct).toBe(true)
    expect(checkAnswer('- 5', num('-5')).correct).toBe(true)
  })

  it('accepts thousands separators', () => {
    expect(checkAnswer('1,000', num('1000')).correct).toBe(true)
    expect(checkAnswer('1,000,000', num('1000000')).correct).toBe(true)
    expect(checkAnswer('1,000', num('1')).correct).toBe(false)
    // and stripping them must not corrupt the surrounding fraction syntax
    expect(checkAnswer('1,000/8', num('125')).correct).toBe(true)
    expect(checkAnswer('7/1,000', num('7/1000')).correct).toBe(true)
  })

  it('accepts a leading plus', () => {
    expect(checkAnswer('+3', num('3')).correct).toBe(true)
  })

  it('accepts a trailing decimal point', () => {
    expect(checkAnswer('5.', num('5')).correct).toBe(true)
  })

  it('accepts extra internal whitespace in a mixed number', () => {
    expect(checkAnswer('1   1/2', num('3/2')).correct).toBe(true)
  })

  it('treats a space-separated group as unparseable, not as a thousands separator', () => {
    const r = checkAnswer('1 000', num('1000'))
    expect(r.correct).toBe(false)
    expect(r.unparseable).toBe(true)
    // and the reason why: mixed numbers still work
    expect(checkAnswer('1 1/2', num('3/2')).correct).toBe(true)
  })

  it('accepts every equivalent notation for the same value', () => {
    for (const given of ['3/4', '6/8', '75/100', '0.75', '.75', '0.750', ' 3 / 4 ', '+3/4']) {
      expect(checkAnswer(given, num('3/4')).correct, given).toBe(true)
    }
  })

  it('flags unreduced forms without ever withholding credit', () => {
    expect(checkAnswer('4/2', num('2'))).toEqual({ correct: true, nudge: 'unreduced' })
    expect(checkAnswer('2', num('2'))).toEqual({ correct: true })
    expect(checkAnswer('1 1/2', num('3/2')).nudge).toBeUndefined()
  })
})

describe('checkAnswer is generous about notation, never about arithmetic', () => {
  it('rejects a value that is merely close', () => {
    const r = checkAnswer('0.874', num('7/8'))
    expect(r.correct).toBe(false)
    expect(r.unparseable).toBeUndefined()
    expect(checkAnswer('0.88', num('7/8')).correct).toBe(false)
    expect(checkAnswer('7/9', num('7/8')).correct).toBe(false)
    expect(checkAnswer('8/7', num('7/8')).correct).toBe(false)
  })

  it('rejects the negation of the right answer', () => {
    expect(checkAnswer('-7/8', num('7/8')).correct).toBe(false)
  })

  it('agrees with exact arithmetic across a whole grid of fractions', () => {
    // The prime directive and its counterpart at once: every equivalent form is
    // accepted, and nothing else is. Both directions, exhaustively.
    const disagreements: string[] = []
    for (const canonical of ['7/8', '3/4', '5/3', '2', '-1/2']) {
      const exp = Rational.parse(canonical)!
      for (let n = -40; n <= 40; n++) {
        for (let d = 1; d <= 40; d++) {
          const shouldBe = n * exp.d === exp.n * d
          if (checkAnswer(`${n}/${d}`, num(canonical)).correct !== shouldBe) {
            disagreements.push(`${canonical} <- ${n}/${d} (want ${shouldBe})`)
          }
        }
      }
    }
    expect(disagreements).toEqual([])
  })

  it('accepts exactly one decimal out of two thousand near misses', () => {
    const accepted = []
    for (let x = 0; x <= 2000; x++) {
      const s = (x / 1000).toFixed(3)
      if (checkAnswer(s, num('7/8')).correct) accepted.push(s)
    }
    expect(accepted).toEqual(['0.875'])
  })

  it('does not silently round very large numbers into a match', () => {
    // parseInt loses precision past 2^53; a rounded compare could accept a
    // wrong value. Refuse to judge instead.
    const r = checkAnswer('9007199254740993', num('9007199254740992'))
    expect(r.correct).toBe(false)
  })
})

describe('checkAnswer never throws on user input', () => {
  const hostile = [
    '',
    '   ',
    '/',
    '--',
    '1//2',
    '∞',
    '−',
    '.',
    ',',
    '+',
    '1/0',
    '0/0',
    '9'.repeat(500),
    '0.' + '9'.repeat(500),
    '1'.repeat(500) + '/' + '2'.repeat(500),
    'x'.repeat(500),
    '🎉⚽️',
    '7/8🎉',
    '<script>alert(1)</script>',
    '1e5',
    'NaN',
    'Infinity',
    '½',
    '1,,000',
    '1 1 1/2',
  ]

  for (const given of hostile) {
    it(`survives ${JSON.stringify(given.slice(0, 24))}`, () => {
      expect(() => checkAnswer(given, num('7/8'))).not.toThrow()
      expect(checkAnswer(given, num('7/8')).correct).toBe(false)
    })
  }

  it('normaliseInput never throws either', () => {
    for (const given of hostile) {
      expect(() => normaliseInput(given)).not.toThrow()
    }
  })

  it('reports empty input as unparseable so an accidental Enter is not a wrong answer', () => {
    const r = checkAnswer('', num('7/8'))
    expect(r.correct).toBe(false)
    expect(r.unparseable).toBe(true)
    expect(checkAnswer('   ', num('7/8')).unparseable).toBe(true)
  })
})

describe('checkAnswer spec validation', () => {
  it('throws on a bad spec, because that is a programmer error not a child error', () => {
    expect(() => checkAnswer('7/8', num('not-a-number'))).toThrow()
  })
})
