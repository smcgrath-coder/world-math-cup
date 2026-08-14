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

  // A trailing unit of measurement. Conversion questions ask "how many
  // centimetres", and a child who answers `250 cm` has answered correctly;
  // without this he gets re-prompted until he works out that the game wanted
  // the bare number, which is a maddening way to be right.
  //
  // Deliberately a whitelist rather than "strip trailing letters". `12 tens`
  // means 120, not 12 — stripping it would turn an unreadable answer (which is
  // re-prompted, costing nothing) into a wrong one (which is scored). Only
  // strip what cannot change the value.
  // Applied until stable, because compound units are several tokens: an area
  // answered as `28 sq units` needs both words taken off.
  for (;;) {
    const next = t.replace(UNIT_SUFFIX, '').trim()
    if (next === t) break
    t = next
  }

  return t.trim()
}

/**
 * Units that may follow a number without changing it. Plural `s` and a
 * trailing full stop are allowed. Place-value words (`tens`, `hundreds`) are
 * deliberately absent — those do change the value.
 */
const UNIT_SUFFIX =
  /\s*(mm|cm|m|km|in|ft|yd|mi|inch|inches|foot|feet|yard|yards|mile|miles|mg|kg|g|lb|lbs|oz|ounce|ounces|pound|pounds|gram|grams|kilogram|kilograms|milligram|milligrams|ml|l|litre|litres|liter|liters|millilitre|millilitres|milliliter|milliliters|cup|cups|pint|pints|quart|quarts|gallon|gallons|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|degree|degrees|cm2|m2|sq|square|units?|centimetre|centimetres|centimeter|centimeters|metre|metres|meter|meters|kilometre|kilometres|kilometer|kilometers|millimetre|millimetres|millimeter|millimeters)s?\.?$/i

/**
 * What a right answer is.
 *
 * `rational` is a number typed into the box. `choice` is one of a fixed set of
 * options, picked rather than typed, which exists because some questions have a
 * judgement for an answer rather than a value: *"is 348 a multiple of 6?"* used
 * to be asked as *"give the remainder — 0 means yes"*, and the standard behind
 * `MT.4.NF.2` asks for the symbols `>`, `=` and `<`, which cannot be typed into
 * a numeric box at all.
 *
 * True/false is a two-option `choice`, not a third kind — see `trueFalse`.
 * Nothing downstream of here needs to tell them apart, and a separate kind would
 * be a second thing to prove sound for no gain.
 */
export type AnswerSpec =
  | { kind: 'rational'; canonical: string }
  | { kind: 'choice'; options: string[]; correct: number }

export const TRUE_LABEL = 'True'
export const FALSE_LABEL = 'False'

/** A true/false question. `True` is always first, so the pair never swaps. */
export function trueFalse(isTrue: boolean): AnswerSpec {
  return { kind: 'choice', options: [TRUE_LABEL, FALSE_LABEL], correct: isTrue ? 0 : 1 }
}

/**
 * How often this question is answered right by someone who knows nothing.
 *
 * Zero for a typed answer: there is no guessing your way to 4287. One over the
 * number of options for a choice, which is what the rating model has to be told
 * so that a lucky true/false does not build the card. See `updateRating`.
 */
export function guessFloor(spec: AnswerSpec): number {
  return spec.kind === 'choice' ? 1 / spec.options.length : 0
}

/**
 * The option count to record on an attempt, or `undefined` for a typed answer.
 *
 * Every screen that writes an attempt has to record this, because the rating is
 * derived from the log long after the item is gone and `deriveRatings` cannot
 * price the luck without it. Written as one helper so the three call sites cannot
 * drift: a screen that forgot would silently score true/false answers as though
 * they were typed, which is the exact inflation the correction exists to stop.
 */
export function choiceCount(spec: AnswerSpec): number | undefined {
  return spec.kind === 'choice' ? spec.options.length : undefined
}

/**
 * The right answer, as text to show him.
 *
 * Every screen that reveals an answer — the match, the training ground's
 * coaching card, the film room — wants this and does not care which kind it is.
 */
export function answerText(spec: AnswerSpec): string {
  return spec.kind === 'choice' ? spec.options[spec.correct] : spec.canonical
}

/**
 * The canonical numeric answer, for code that genuinely requires one.
 *
 * Throws on a choice rather than returning a fallback: every caller is either a
 * test asserting a computed key or the soundness harness, and both would rather
 * fail loudly than quietly assert something about the wrong shape of answer.
 */
export function canonicalOf(spec: AnswerSpec): string {
  if (spec.kind !== 'rational') throw new Error(`expected a rational answer, got ${spec.kind}`)
  return spec.canonical
}

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
  if (spec.kind === 'choice') return checkChoice(given, spec)

  const parsed = parseGiven(given)
  if (!parsed) return { correct: false, unparseable: true }

  // A malformed spec is a programmer error, not a child's mistake, so it throws
  // loudly rather than quietly marking a correct answer wrong.
  const expected = Rational.parse(spec.canonical)
  if (!expected) throw new Error(`bad answer spec: ${spec.canonical}`)

  if (!parsed.value.equals(expected)) return { correct: false }
  return parsed.reduced ? { correct: true } : { correct: true, nudge: 'unreduced' }
}

/**
 * Grade a picked option.
 *
 * Exact string match, with no normalisation. `ChoiceInput` hands back one of the
 * strings it was given, so anything else is a programmer error rather than a
 * child's typo — which is why `unparseable` is reserved for that case and never
 * reached by tapping. There is no "I couldn't read that" for a choice.
 *
 * A spec whose `correct` is out of range throws, in line with `rational`: a
 * broken answer key must be loud rather than silently mark a right answer wrong.
 */
function checkChoice(
  given: string,
  spec: { kind: 'choice'; options: string[]; correct: number },
): AnswerResult {
  if (spec.correct < 0 || spec.correct >= spec.options.length) {
    throw new Error(`bad answer spec: correct ${spec.correct} of ${spec.options.length} options`)
  }

  const picked = spec.options.indexOf(given.trim())
  if (picked === -1) return { correct: false, unparseable: true }
  return { correct: picked === spec.correct }
}

/**
 * How wrong a wrong answer was.
 *
 * Rion's idea: being one out is not the same as being nowhere near, and the
 * game should say so. A shot the keeper tips over is a different thing from a
 * shot into the stands, and every football fan already knows that.
 *
 * It earns its place because it is diagnostic, not just kind. Answering 43 when
 * the answer is 42 usually means the method was right and the arithmetic
 * slipped; answering 7 usually means the method itself was wrong. Those need
 * different help, so this is how the tackle-back decides whether to repair the
 * computation or go back to the concept.
 *
 * IMPORTANT: this NEVER affects scoring. A near miss is still wrong — same Elo
 * update, same lost possession. If "close" earned rating, ratings would stop
 * meaning anything and near-missing would become a strategy. The keeper still
 * saves it.
 */
export type MissKind =
  /** Matches a known wrong answer, so we know exactly what he did. */
  | 'misconception'
  /** Wrong, but in the neighbourhood — an arithmetic slip on a sound method. */
  | 'near'
  /** Not close. Usually the method rather than the sum. */
  | 'off'
  /** Could not be read at all. Re-prompt; do not score. */
  | 'unreadable'

export interface MissClassification {
  kind: MissKind
  /** Set when `kind` is `misconception`. */
  misconceptionId?: string
  /** `|given − correct| / max(|correct|, 1)`, when both parse. */
  relativeError?: number
}

/**
 * Below this, being one out is a counting or concept error rather than a slip.
 *
 * Answering 3 right angles for a square is not a shot the keeper tipped over;
 * it is not knowing that a square has four. Above it, off-by-one on a
 * multi-digit answer really is a slip.
 */
const SLIP_FLOOR = 10

/** The biggest absolute gap that still reads as a slip rather than a method. */
const SLIP_GAP = 2

/**
 * Classify a wrong answer. Behaviour is undefined for a *correct* answer — call
 * `checkAnswer` first and only call this when it says `correct: false`.
 *
 * Never throws.
 */
export function classifyMiss(
  given: string,
  spec: AnswerSpec,
  // Deliberately a structural type rather than the `Misconception` interface:
  // that lives in `items/types.ts`, which already imports from this module, and
  // importing back would be circular.
  misconceptions: readonly { id: string; signature: string }[] = [],
): MissClassification {
  if (spec.kind === 'choice') return classifyChoiceMiss(given, misconceptions)

  const parsed = parseGiven(given)
  if (!parsed) return { kind: 'unreadable' }

  const expected = Rational.parse(spec.canonical)
  if (!expected) throw new Error(`bad answer spec: ${spec.canonical}`)

  // A named mistake beats a distance measurement — knowing *what* he did is
  // always more useful than knowing how far off it landed.
  for (const m of misconceptions) {
    const sig = Rational.parse(normaliseInput(m.signature))
    if (sig && sig.equals(parsed.value)) {
      return { kind: 'misconception', misconceptionId: m.id, ...distance(parsed.value, expected) }
    }
  }

  const d = distance(parsed.value, expected)
  return { kind: isNear(parsed.value, expected, d.relativeError) ? 'near' : 'off', ...d }
}

/**
 * Classify a wrong pick.
 *
 * `near` and `off` do not exist here, and no distance is reported. There is no
 * neighbourhood on a set of options — he picked one or he did not — and a
 * relative error computed from an option's *text* would be a number that looked
 * meaningful and was not.
 *
 * What replaces them is better. A distractor is written to be a specific
 * mistake, so its `signature` is the option text and a wrong pick is named
 * outright rather than measured. That is what `near` was approximating all
 * along: the reason to know a miss was close is to guess what he did, and here
 * there is no guessing.
 *
 * Everything unnamed falls to `off`, which is the honest answer and which the
 * film room already renders without any adjective on it.
 */
function classifyChoiceMiss(
  given: string,
  misconceptions: readonly { id: string; signature: string }[],
): MissClassification {
  const picked = given.trim()
  for (const m of misconceptions) {
    if (m.signature.trim() === picked) return { kind: 'misconception', misconceptionId: m.id }
  }
  return { kind: 'off' }
}

function distance(given: Rational, correct: Rational): { relativeError: number } {
  const diff = Math.abs(given.toNumber() - correct.toNumber())
  return { relativeError: diff / Math.max(Math.abs(correct.toNumber()), 1) }
}

/** A gap of 1/4 or finer counts as one piece out. */
const NEAREST_PIECE = 4

/**
 * Was this a slip, or a different method?
 *
 * A slip is a *digit* event, not a proportion. This used to accept anything
 * within 10% of the true value, which sounds reasonable and is not: ten percent
 * of 16831 is ±1683, so answering 15000 to a four-digit sum was being narrated
 * as a shot the keeper tipped over. Measured across the generators, 100% of
 * near-miss answers on multi-digit multiplication were being saved, and 97% on
 * multi-digit addition. Rion noticed — he said the saves felt early — and he was
 * right.
 *
 * Three things count as a slip now:
 *
 *  - off by one or two on an answer of ten or more (`43` for `42`, which was the
 *    case that prompted this whole classification in the first place)
 *  - two adjacent digits transposed (`627` for `672`) — the classic
 *  - one unit fraction out, at quarters or finer (`3/4` for `7/8`)
 *
 * Everything else is a shot that never troubled the goal, which is not an
 * insult: it routes the tackle-back toward the concept instead of the
 * arithmetic, which is the help that answer actually needs.
 */
function isNear(given: Rational, correct: Rational, _relativeError: number): boolean {
  if (given.isInteger() && correct.isInteger()) {
    const gapSize = Math.abs(given.n - correct.n)
    if (Math.abs(correct.n) >= SLIP_FLOOR && gapSize <= SLIP_GAP) return true
    if (isTransposition(given.n, correct.n)) return true
    return false
  }

  // One piece out.
  //
  // Note this cannot be done by comparing denominators: `Rational` reduces on
  // construction, so 6/8 arrives as 3/4 and a same-denominator test would never
  // fire for the very case it was written for. Instead, subtract exactly and ask
  // whether the gap is a single unit fraction — 7/8 against 3/4 differs by 1/8,
  // and 3/8 against 1/2 also differs by 1/8, both of which are one piece out
  // whatever the reduced forms look like.
  const gap = given.sub(correct)
  return Math.abs(gap.n) === 1 && gap.d >= NEAREST_PIECE
}

/**
 * Two adjacent digits swapped — `627` for `672`.
 *
 * Worth naming on its own because it is the commonest slip in multi-digit work
 * and it is nowhere near the true value, so no distance rule will ever catch it.
 */
function isTransposition(given: number, correct: number): boolean {
  const a = String(Math.abs(given))
  const b = String(Math.abs(correct))
  if (a.length !== b.length || a === b) return false
  if (Math.sign(given) !== Math.sign(correct)) return false

  const differing: number[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) differing.push(i)
    if (differing.length > 2) return false
  }
  if (differing.length !== 2) return false

  const [i, j] = differing as [number, number]
  return j === i + 1 && a[i] === b[j] && a[j] === b[i]
}
