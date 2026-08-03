/**
 * Answer normalisation and checking.
 *
 * Marking a right answer wrong is the single most damaging thing this software
 * can do, so this module is deliberately generous about *how* a value is
 * written — unicode dashes, thousands commas, stray whitespace, unreduced
 * fractions, decimals instead of fractions — and completely ungenerous about
 * *what* the value is. There is no approximate matching anywhere here: `0.874`
 * is not `7/8`, and never will be.
 *
 * `Rational` keeps a strict parsing grammar on purpose. All typographic
 * tolerance lives here.
 */

import { Rational } from './rational'

/**
 * Every dash-like character that a keyboard, autocorrect or copy-paste can put
 * where a child meant to type a minus sign. iPad autocorrect turning `-` into
 * an en dash is the highest-risk false-negative on the list.
 */
const DASHES = /[‐‑‒–—―−﹘﹣－]/g

/**
 * Fraction slash, division slash, fullwidth solidus and the division sign all
 * mean "over". `÷` is on the iPad symbol keyboard, and `7÷8` is a completely
 * reasonable way for a child to write seven eighths.
 */
const SLASHES = /[⁄∕／÷]/g

/** Fullwidth plus. */
const PLUSES = /＋/g

/**
 * A thousands-grouped number: `1,000`, `12,345`, `1,000,000`.
 *
 * Only commas sitting between proper digit groups are stripped. The leading
 * group may not start with `0`, so `0,875` is left alone — that is far more
 * likely to be a decimal comma than a thousands separator, and silently reading
 * it as `875` would turn a right answer into a wrong number. Leaving it
 * untouched makes it unparseable instead, which the UI can re-prompt on rather
 * than scoring against him.
 *
 * The leading `(^|[^\d.,])` is a stand-in for a lookbehind, which older Safari
 * cannot even parse — a SyntaxError in a regex literal would take down the
 * whole app at module load.
 */
const THOUSANDS = /(^|[^\d.,])([1-9]\d{0,2}(?:,\d{3})+)(?![\d,])/g

/**
 * Clean up how an answer was typed, without changing what it says.
 *
 * Exported so the UI can reuse it (e.g. to echo back what it understood) and so
 * it can be unit-tested directly.
 */
export function normaliseInput(s: string): string {
  let t = s.replace(DASHES, '-').replace(SLASHES, '/').replace(PLUSES, '+')

  // Collapse every flavour of whitespace — non-breaking spaces from copy-paste,
  // tabs, newlines, runs of spaces — to single ASCII spaces. `1   1/2` and
  // `1 1/2` are the same mixed number.
  //
  // Note that spaces are deliberately NOT treated as thousands separators.
  // `1 000` is ambiguous against mixed-number syntax, and mixed numbers win:
  // `1 1/2` must keep meaning one and a half. `1 000` is left unparseable.
  t = t.replace(/\s+/g, ' ').trim()

  // Leading plus: `+3` is just `3`.
  t = t.replace(/^\+\s*/, '')

  // Close the gap between a leading sign and its number: `- 1/2` is negative
  // one half. The space carries no arithmetic meaning and must not cost him the
  // point. Anchored to the start so the load-bearing space inside a mixed
  // number survives — `-1 1/2` keeps its gap.
  t = t.replace(/^-\s+/, '-')

  // Thousands separators. Applied repeatedly because a single global pass
  // consumes the character before each group and can therefore skip an
  // adjacent one.
  for (;;) {
    const next = t.replace(THOUSANDS, (_m, pre: string, body: string) => pre + body.replace(/,/g, ''))
    if (next === t) break
    t = next
  }

  // A `.` that is not followed by a digit is never meaningful in our grammar,
  // so a trailing decimal point is just noise: `5.` is `5`. Leading decimal
  // points (`.5`) are untouched.
  t = t.replace(/\.(?!\d)/g, '')

  return t.trim()
}

export type AnswerSpec = { kind: 'rational'; canonical: string }

export interface AnswerResult {
  correct: boolean
  unparseable?: boolean
  /** Correct, but worth a gentle note. Never affects scoring. */
  nudge?: 'unreduced'
}

/**
 * Parse what he typed, or return null if we genuinely cannot read it.
 *
 * Never throws. `Rational` throws on values it cannot represent (a 500-digit
 * number overflows to Infinity, which is not an integer), and no input a child
 * can type is allowed to crash the game mid-match.
 */
function parseGiven(given: string): { value: Rational; reduced: boolean } | null {
  let parsed: { value: Rational; reduced: boolean } | null
  try {
    parsed = Rational.parseWithForm(normaliseInput(given))
  } catch {
    return null
  }
  if (!parsed) return null

  // Past 2^53 `parseInt` silently rounds, so the value we hold would no longer
  // be the value he typed and the comparison below would be meaningless — it
  // could just as easily accept a wrong answer as reject a right one. Refuse to
  // judge instead. No question this game asks comes anywhere near this range.
  if (!Number.isSafeInteger(parsed.value.n) || !Number.isSafeInteger(parsed.value.d)) return null

  return parsed
}

export function checkAnswer(given: string, spec: AnswerSpec): AnswerResult {
  const parsed = parseGiven(given)
  if (!parsed) return { correct: false, unparseable: true }

  // A malformed spec is a programmer error, not a child's mistake, so it throws
  // loudly rather than quietly marking a correct answer wrong.
  const expected = Rational.parse(spec.canonical)
  if (!expected) throw new Error(`bad answer spec: ${spec.canonical}`)

  if (!parsed.value.equals(expected)) return { correct: false }
  return parsed.reduced ? { correct: true } : { correct: true, nudge: 'unreduced' }
}
