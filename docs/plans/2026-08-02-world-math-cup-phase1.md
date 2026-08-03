# World Math Cup — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a playable World Math Cup by 2026-08-25 — country creation, a scouting try-out, the Training Ground, and friendly matches against real opponents, covering grade-4 Montana standards.

**Architecture:** A React SPA with three separable layers. The **engine** (pure TypeScript, heavily tested) holds Elo ratings, item generators, and the match state machine — no React, no I/O. The **store** is an append-only `attempts` log in localStorage from which every rating, stat and view is derived. The **UI** is React + framer-motion over the top. Nothing in the engine knows about rendering, which is what makes it testable and what makes the eventual Supabase swap cheap.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, framer-motion, vitest, @testing-library/react.

**Design doc:** `docs/plans/2026-08-02-world-math-cup-design.md` — read it first. The learner profile section is load-bearing, not background.

**Repo:** `~/world-math-cup` (git initialised, design doc committed).

---

## Conventions for every task

- Run tests with `npm test` from `~/world-math-cup`.
- Commit after every task. Message format: `feat(scope): summary` or `test(scope): summary`.
- Never mark a task done with failing tests.
- `npx tsc --noEmit` must stay clean.

---

## Task 1: Scaffold the project

**Files:**
- Create: whole Vite project in `~/world-math-cup`

**Step 1:** Scaffold into the existing directory (it already has `docs/` and `.git`):

```bash
cd ~/world-math-cup
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss @tailwindcss/vite framer-motion clsx
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Step 2:** Wire Tailwind. `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 3:** Replace `src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-pitch: #15803d;
  --color-pitch-dark: #14532d;
  --color-gold: #fbbf24;
  --color-ink: #0f172a;
}

html, body, #root { height: 100%; margin: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

**Step 4:** Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true },
})
```

Create `src/test/setup.ts` containing `import '@testing-library/jest-dom/vitest'`.

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

**Step 5:** Delete `src/App.css` and `src/assets/`. Replace `src/App.tsx` with a placeholder returning `<div className="p-8 text-2xl font-bold">World Math Cup</div>`.

**Step 6:** Verify: `npm run dev` renders, `npx tsc --noEmit` clean, `npm test` reports no test files (expected).

**Step 7:** Commit: `chore: scaffold vite + react + tailwind + vitest`.

---

## Task 2: Rational arithmetic (TDD)

Everything downstream depends on exact fraction arithmetic. Floating point will silently mark Rion wrong. This is the foundation of the non-negotiable correctness rule.

**Files:**
- Create: `src/engine/rational.ts`
- Create: `src/engine/rational.test.ts`

**Step 1: Write the failing tests**

```ts
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
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test src/engine/rational.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

```ts
function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b)
  while (b) { [a, b] = [b, a % b] }
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
    this.n = (sign * n) / g
    this.d = (sign * d) / g
  }

  add(o: Rational) { return new Rational(this.n * o.d + o.n * this.d, this.d * o.d) }
  sub(o: Rational) { return new Rational(this.n * o.d - o.n * this.d, this.d * o.d) }
  mul(o: Rational) { return new Rational(this.n * o.n, this.d * o.d) }
  div(o: Rational) {
    if (o.n === 0) throw new Error('Rational: divide by zero')
    return new Rational(this.n * o.d, this.d * o.n)
  }

  equals(o: Rational) { return this.n === o.n && this.d === o.d }
  compare(o: Rational) { return this.n * o.d - o.n * this.d }
  isInteger() { return this.d === 1 }
  toNumber() { return this.n / this.d }
  toString() { return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}` }

  static parse(s: string): Rational | null {
    return Rational.parseWithForm(s)?.value ?? null
  }

  /** Also reports whether the written form was already in lowest terms. */
  static parseWithForm(s: string): { value: Rational; reduced: boolean } | null {
    const t = s.trim()
    if (!t) return null

    // mixed number: "1 1/2" or "-1 1/2"
    const mixed = t.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/)
    if (mixed) {
      const whole = parseInt(mixed[1], 10)
      const num = parseInt(mixed[2], 10)
      const den = parseInt(mixed[3], 10)
      if (den === 0) return null
      const sign = whole < 0 ? -1 : 1
      const value = new Rational(Math.abs(whole) * den + num, den)
      return { value: sign < 0 ? new Rational(-value.n, value.d) : value, reduced: gcd(num, den) === 1 }
    }

    // fraction: "3/4"
    const frac = t.match(/^(-?\d+)\s*\/\s*(-?\d+)$/)
    if (frac) {
      const num = parseInt(frac[1], 10)
      const den = parseInt(frac[2], 10)
      if (den === 0) return null
      return { value: new Rational(num, den), reduced: gcd(num, den) === 1 }
    }

    // decimal: "0.875"
    const dec = t.match(/^-?\d*\.\d+$/)
    if (dec) {
      const places = t.split('.')[1].length
      const den = 10 ** places
      const num = Math.round(parseFloat(t) * den)
      return { value: new Rational(num, den), reduced: true }
    }

    // integer
    const int = t.match(/^-?\d+$/)
    if (int) return { value: new Rational(parseInt(t, 10), 1), reduced: true }

    return null
  }
}
```

**Step 4:** Run `npm test src/engine/rational.test.ts` — expect PASS.

**Step 5:** Commit: `feat(engine): exact rational arithmetic with parsing`.

---

## Task 3: Answer checking (TDD)

**Files:**
- Create: `src/engine/answer.ts`
- Create: `src/engine/answer.test.ts`

`checkAnswer` must accept every legitimate way of writing a correct answer. Per the design doc, marking Rion wrong when he is right is the most damaging possible bug.

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { checkAnswer } from './answer'

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
```

**Step 2:** Run — expect FAIL.

**Step 3: Implement**

```ts
import { Rational } from './rational'

export type AnswerSpec = { kind: 'rational'; canonical: string }

export interface AnswerResult {
  correct: boolean
  unparseable?: boolean
  /** Correct, but worth a gentle note. Never affects scoring. */
  nudge?: 'unreduced'
}

export function checkAnswer(given: string, spec: AnswerSpec): AnswerResult {
  const parsed = Rational.parseWithForm(given)
  if (!parsed) return { correct: false, unparseable: true }

  const expected = Rational.parse(spec.canonical)
  if (!expected) throw new Error(`bad answer spec: ${spec.canonical}`)

  if (!parsed.value.equals(expected)) return { correct: false }
  return parsed.reduced ? { correct: true } : { correct: true, nudge: 'unreduced' }
}
```

**Step 4:** Run — expect PASS.

**Step 5:** Commit: `feat(engine): answer normalisation and checking`.

---

## Task 4: Elo engine (TDD)

**Files:**
- Create: `src/engine/elo.ts`
- Create: `src/engine/elo.test.ts`

Ratings and difficulties both live on 0–99. Spread constant 25 means a 25-point gap gives roughly 91/9.

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { expectedScore, updateRating, difficultyForSuccess, K_TRAINING, K_MATCH } from './elo'

describe('expectedScore', () => {
  it('is 0.5 when rating equals difficulty', () => {
    expect(expectedScore(50, 50)).toBeCloseTo(0.5, 5)
  })
  it('rises as the item gets easier', () => {
    expect(expectedScore(50, 25)).toBeGreaterThan(0.9)
  })
  it('falls as the item gets harder', () => {
    expect(expectedScore(50, 75)).toBeLessThan(0.1)
  })
})

describe('difficultyForSuccess', () => {
  it('returns a difficulty about 12 below rating for p=0.75', () => {
    expect(difficultyForSuccess(50, 0.75)).toBeCloseTo(38.1, 1)
  })
  it('round-trips through expectedScore', () => {
    for (const p of [0.5, 0.62, 0.68, 0.75, 0.85]) {
      const d = difficultyForSuccess(60, p)
      expect(expectedScore(60, d)).toBeCloseTo(p, 5)
    }
  })
  it('clamps into range', () => {
    expect(difficultyForSuccess(2, 0.85)).toBeGreaterThanOrEqual(0)
    expect(difficultyForSuccess(97, 0.2)).toBeLessThanOrEqual(99)
  })
})

describe('updateRating', () => {
  it('barely moves when an easy item is answered correctly', () => {
    const before = 60
    const after = updateRating(before, 30, true, K_TRAINING)
    expect(after - before).toBeLessThan(0.3)
  })

  it('moves substantially when a hard item is answered correctly', () => {
    const before = 60
    const after = updateRating(before, 85, true, K_MATCH)
    expect(after - before).toBeGreaterThan(5)
  })

  it('drops sharply when an easy item is missed', () => {
    const before = 60
    const after = updateRating(before, 30, false, K_MATCH)
    expect(before - after).toBeGreaterThan(6)
  })

  it('weights matches about 3x training', () => {
    const t = updateRating(50, 50, true, K_TRAINING) - 50
    const m = updateRating(50, 50, true, K_MATCH) - 50
    expect(m / t).toBeCloseTo(3, 1)
  })

  it('clamps to 0..99', () => {
    expect(updateRating(0.1, 99, false, K_MATCH)).toBeGreaterThanOrEqual(0)
    expect(updateRating(98.9, 0, true, K_MATCH)).toBeLessThanOrEqual(99)
  })

  it('grinding 200 easy items yields under 3 points', () => {
    let r = 60
    for (let i = 0; i < 200; i++) r = updateRating(r, 25, true, K_TRAINING)
    expect(r - 60).toBeLessThan(3)
  })
})
```

**Step 2:** Run — expect FAIL.

**Step 3: Implement**

```ts
export const SPREAD = 25
export const K_TRAINING = 2.5
export const K_MATCH = 7.5
export const MIN_RATING = 0
export const MAX_RATING = 99

const clamp = (v: number) => Math.min(MAX_RATING, Math.max(MIN_RATING, v))

export function expectedScore(rating: number, difficulty: number): number {
  return 1 / (1 + 10 ** ((difficulty - rating) / SPREAD))
}

/** Difficulty at which this rating has probability p of succeeding. */
export function difficultyForSuccess(rating: number, p: number): number {
  const clampedP = Math.min(0.99, Math.max(0.01, p))
  return clamp(rating + SPREAD * Math.log10(1 / clampedP - 1) * -1)
}

export function updateRating(rating: number, difficulty: number, correct: boolean, k: number): number {
  const e = expectedScore(rating, difficulty)
  return clamp(rating + k * ((correct ? 1 : 0) - e))
}
```

Note the sign: `difficultyForSuccess(50, 0.75)` must return ~38, i.e. *below* the rating. Verify against the test rather than reasoning about it.

**Step 4:** Run — expect PASS. If `difficultyForSuccess` is inverted the round-trip test catches it.

**Step 5:** Commit: `feat(engine): elo rating with success-probability targeting`.

---

## Task 5: Load the Montana standards

**Files:**
- Create: `scripts/build-standards.mjs`
- Create: `src/curriculum/standards.generated.ts` (generated, committed)
- Create: `src/curriculum/standards.test.ts`

Parse the CASE CSV once at build time into a typed module. Do not parse CSV at runtime.

**Step 1:** Write `scripts/build-standards.mjs` reading `docs/curriculum/montana-math-standards-2026-CASE.csv` and emitting:

```ts
export type DomainCode = 'OA' | 'NBT' | 'NF' | 'MD' | 'G'
export type CardStat = 'PAC' | 'SHO' | 'PAS' | 'DRI' | 'DEF' | 'PHY'

export interface Standard {
  id: string          // 'MT.4.NF.3'
  grade: 4 | 5
  domain: DomainCode
  statement: string
  itemType: 'Standard' | 'Component'
  parentId?: string   // components point at their standard
}

export const STANDARDS: Standard[] = [ /* ... */ ]

export const DOMAIN_TO_STAT: Record<DomainCode, CardStat> = {
  OA: 'PAS', NBT: 'DEF', NF: 'DRI', MD: 'PHY', G: 'SHO',
}
```

Filter to rows where `Ed. Level` is `04` or `05` and `Item Type` is `Standard` or `Component`. Derive `domain` from the `Human Code` via `/^MT\.(\d)\.([A-Z]+)/`. For components, `parentId` is the code minus the trailing `.a`/`.b` segment.

Add npm script: `"build:standards": "node scripts/build-standards.mjs"`.

**Step 2:** Write `src/curriculum/standards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STANDARDS, DOMAIN_TO_STAT } from './standards.generated'

describe('standards', () => {
  it('has 28 grade-4 and 26 grade-5 standards', () => {
    const s = STANDARDS.filter((x) => x.itemType === 'Standard')
    expect(s.filter((x) => x.grade === 4)).toHaveLength(28)
    expect(s.filter((x) => x.grade === 5)).toHaveLength(26)
  })

  it('covers all five domains in both grades', () => {
    for (const g of [4, 5] as const) {
      const domains = new Set(STANDARDS.filter((x) => x.grade === g).map((x) => x.domain))
      expect([...domains].sort()).toEqual(['G', 'MD', 'NBT', 'NF', 'OA'])
    }
  })

  it('maps every domain to a card stat', () => {
    for (const s of STANDARDS) expect(DOMAIN_TO_STAT[s.domain]).toBeTruthy()
  })

  it('gives every component a resolvable parent', () => {
    const ids = new Set(STANDARDS.map((s) => s.id))
    for (const c of STANDARDS.filter((s) => s.itemType === 'Component')) {
      expect(ids.has(c.parentId!)).toBe(true)
    }
  })
})
```

**Step 3:** Run `npm run build:standards`, then `npm test src/curriculum` — expect PASS. Counts come from the design doc; if they differ, the parser is wrong, not the doc.

**Step 4:** Commit: `feat(curriculum): generate typed Montana standards from CASE csv`.

---

## Task 6: Item generator framework (TDD)

**Files:**
- Create: `src/engine/items/types.ts`
- Create: `src/engine/items/rng.ts`
- Create: `src/engine/items/rng.test.ts`

Generators must be deterministic given a seed so tests are reproducible and a match can be replayed.

**Step 1:** `src/engine/items/types.ts`:

```ts
import type { AnswerSpec } from '../answer'

export interface Misconception {
  id: string
  /** The wrong answer this misconception produces, canonical form. */
  signature: string
  /** Short name for the film room. */
  label: string
  /** What to say. Rendered by the tutor and the film room. */
  explanation: string
}

export interface Item {
  standardId: string
  difficulty: number
  /** Plain text prompt. Fraction notation as a/b. */
  prompt: string
  answer: AnswerSpec
  /** Ordered worked steps, shown only after a failed tackle-back. */
  workedSteps: string[]
  misconceptions: Misconception[]
  /** Structured parameters, for property tests and replay. */
  params: Record<string, number>
}

export interface ItemGenerator {
  standardId: string
  /** Human label for the Training Ground. */
  label: string
  /** Lower and upper difficulty this generator can produce. */
  range: [number, number]
  generate(difficulty: number, rng: Rng): Item
}

export interface Rng {
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}
```

**Step 2:** Write `src/engine/items/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeRng } from './rng'

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(42), b = makeRng(42)
    const seqA = Array.from({ length: 20 }, () => a.int(0, 100))
    const seqB = Array.from({ length: 20 }, () => b.int(0, 100))
    expect(seqA).toEqual(seqB)
  })

  it('differs across seeds', () => {
    const a = Array.from({ length: 20 }, () => makeRng(1).int(0, 1000))
    const b = Array.from({ length: 20 }, () => makeRng(2).int(0, 1000))
    expect(a).not.toEqual(b)
  })

  it('respects bounds inclusively', () => {
    const r = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 5)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(5)
    }
  })
})
```

**Step 3:** Implement `src/engine/items/rng.ts` with mulberry32:

```ts
import type { Rng } from './types'

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  }
}
```

**Step 4:** Run — expect PASS.

**Step 5:** Commit: `feat(engine): item types and seeded rng`.

---

## Task 7: First generator + the property-test harness (TDD)

This task establishes the pattern every subsequent generator follows. **The harness is the reason this project can be trusted.**

**Files:**
- Create: `src/engine/items/generators/mt4nf3.ts` — add/subtract fractions, like denominators
- Create: `src/engine/items/harness.ts`
- Create: `src/engine/items/generators/mt4nf3.test.ts`

**Step 1: Write the harness** — `src/engine/items/harness.ts`:

```ts
import { expect } from 'vitest'
import { makeRng } from './rng'
import { checkAnswer } from '../answer'
import type { ItemGenerator } from './types'

/**
 * Every generator must pass this. It verifies across the full difficulty
 * range and many seeds that:
 *   - the item is well formed
 *   - the emitted answer key is accepted by checkAnswer
 *   - `verify` (an INDEPENDENT recomputation from params) agrees with the key
 *
 * `verify` must not call the generator's own arithmetic. Recompute from
 * `item.params` using Rational directly, or the test proves nothing.
 */
export function assertGeneratorSound(
  gen: ItemGenerator,
  verify: (params: Record<string, number>) => string,
) {
  const [lo, hi] = gen.range
  for (let d = lo; d <= hi; d += 3) {
    for (let seed = 0; seed < 40; seed++) {
      const item = gen.generate(d, makeRng(seed))

      expect(item.standardId, 'standardId').toBe(gen.standardId)
      expect(item.prompt.length, `prompt empty at d=${d} seed=${seed}`).toBeGreaterThan(0)
      expect(item.workedSteps.length, `no worked steps at d=${d} seed=${seed}`).toBeGreaterThan(0)

      const self = checkAnswer(item.answer.canonical, item.answer)
      expect(self.correct, `key rejected by checker at d=${d} seed=${seed}`).toBe(true)

      const independent = verify(item.params)
      expect(
        checkAnswer(independent, item.answer).correct,
        `key ${item.answer.canonical} disagrees with independent ${independent} ` +
          `at d=${d} seed=${seed}, params=${JSON.stringify(item.params)}`,
      ).toBe(true)

      for (const m of item.misconceptions) {
        expect(
          checkAnswer(m.signature, item.answer).correct,
          `misconception ${m.id} signature equals the correct answer at d=${d} seed=${seed}`,
        ).toBe(false)
      }
    }
  }
}
```

**Step 2: Write the failing generator test** — `mt4nf3.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nf3 } from './mt4nf3'

describe('MT.4.NF.3 add/subtract like denominators', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf3, (p) => {
      const a = new R(p.n1, p.den)
      const b = new R(p.n2, p.den)
      return (p.op === 1 ? a.add(b) : a.sub(b)).toString()
    })
  })

  it('produces larger denominators at higher difficulty', () => {
    const easy = mt4nf3.generate(10, makeRng(1))
    const hard = mt4nf3.generate(70, makeRng(1))
    expect(hard.params.den).toBeGreaterThan(easy.params.den)
  })

  it('never produces a negative result for subtraction', () => {
    for (let s = 0; s < 100; s++) {
      const item = mt4nf3.generate(50, makeRng(s))
      expect(R.parse(item.answer.canonical)!.n).toBeGreaterThanOrEqual(0)
    }
  })

  it('carries the add-across misconception', () => {
    const item = mt4nf3.generate(40, makeRng(3))
    expect(item.misconceptions.some((m) => m.id === 'add-across')).toBe(true)
  })
})
```

**Step 3:** Run — expect FAIL.

**Step 4: Implement the generator**

```ts
import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Rng } from '../types'

const DENS_BY_BAND = [
  [2, 3, 4],        // easiest
  [4, 5, 6, 8],
  [6, 8, 10, 12],
  [8, 10, 12, 100], // hardest
]

export const mt4nf3: ItemGenerator = {
  standardId: 'MT.4.NF.3',
  label: 'Adding and subtracting fractions',
  range: [5, 80],

  generate(difficulty: number, rng: Rng): Item {
    const band = Math.min(3, Math.floor((difficulty - 5) / 20))
    const den = rng.pick(DENS_BY_BAND[band])
    const op = rng.int(0, 1) // 0 = subtract, 1 = add

    let n1: number, n2: number
    if (op === 1) {
      n1 = rng.int(1, den - 1)
      n2 = rng.int(1, den - 1)
    } else {
      n1 = rng.int(2, den)
      n2 = rng.int(1, n1 - 1)
    }

    const a = new R(n1, den)
    const b = new R(n2, den)
    const result = op === 1 ? a.add(b) : a.sub(b)
    const symbol = op === 1 ? '+' : '−'

    return {
      standardId: 'MT.4.NF.3',
      difficulty,
      prompt: `${n1}/${den} ${symbol} ${n2}/${den}`,
      answer: { kind: 'rational', canonical: result.toString() },
      params: { n1, n2, den, op },
      workedSteps: [
        `The denominators are the same, so the pieces are already the same size.`,
        `${op === 1 ? 'Add' : 'Subtract'} the numerators: ${n1} ${symbol} ${n2} = ${op === 1 ? n1 + n2 : n1 - n2}.`,
        `Keep the denominator: ${op === 1 ? n1 + n2 : n1 - n2}/${den}.`,
        ...(result.d !== den ? [`Simplify: ${result.toString()}.`] : []),
      ],
      misconceptions: [
        {
          id: 'add-across',
          signature: new R(op === 1 ? n1 + n2 : n1 - n2, den * 2).toString(),
          label: 'Added the denominators too',
          explanation:
            'The denominator tells you how big each piece is, not how many you have. ' +
            'When the pieces are already the same size, only the count changes.',
        },
      ],
      // note: params.op is 1 for add, 0 for subtract — the test relies on this
    }
  },
}
```

**Step 5:** Run — expect PASS. Fix the generator until the harness is satisfied; **never loosen the harness**.

**Step 6:** Commit: `feat(items): MT.4.NF.3 generator and the soundness harness`.

---

## Task 8: The remaining Phase 1 generators

Repeat the Task 7 pattern exactly — one generator, one test file, `assertGeneratorSound` with an independent `verify`, commit per generator.

**Build these, in this order** (chosen for 5th-grade readiness):

| Order | Standard | Content |
|---|---|---|
| 1 | `MT.4.NF.1` | Equivalent fractions |
| 2 | `MT.4.NF.2` | Compare two fractions |
| 3 | `MT.4.NF.4` | Fraction × whole number |
| 4 | `MT.4.NBT.4` | Multi-digit add/subtract |
| 5 | `MT.4.NBT.5` | Multi-digit multiplication |
| 6 | `MT.4.NBT.6` | Division with remainders |
| 7 | `MT.4.OA.1` | Multiplicative comparison |
| 8 | `MT.4.OA.4` | Factors and multiples |
| 9 | `MT.4.MD.1` | Unit conversion |
| 10 | `MT.4.MD.3` | Area and perimeter |
| 11 | `MT.4.G.1` | Points, lines, rays, angles |
| 12 | `FLU.MULT` | Multiplication facts (fluency, feeds PAC) |

Each needs at least one misconception with a real signature. Known ones worth encoding: add-across for unlike denominators, comparing fractions by numerator alone, place-value slips in multi-digit multiplication, dropping the remainder, confusing area with perimeter.

`FLU.MULT` is not a Montana standard — give it `domain: null` and route it to PAC directly.

**Commit after each generator.** Do not batch.

---

## Task 9: The attempts log and derived ratings (TDD)

**Files:**
- Create: `src/store/types.ts`
- Create: `src/store/derive.ts`
- Create: `src/store/derive.test.ts`

**Step 1:** `src/store/types.ts`:

```ts
import type { CardStat } from '../curriculum/standards.generated'

export type AttemptContext = 'tryout' | 'training' | 'match' | 'tackleback' | 'penalty'

export interface Attempt {
  id: string
  at: number
  standardId: string
  difficulty: number
  params: Record<string, number>
  given: string
  correct: boolean
  latencyMs: number
  context: AttemptContext
  misconceptionId?: string
  matchId?: string
}

export interface StandardRating {
  standardId: string
  rating: number
  attempts: number
  lastSeenAt: number | null
  /** Provisional until this many attempts. Renders dashed. */
  provisional: boolean
}

export type Card = Record<CardStat, number>
```

**Step 2:** Write `derive.test.ts` covering:

- empty log gives every standard the seed rating (50) and `provisional: true`
- a correct match attempt raises that standard's rating more than a correct training attempt
- `provisional` clears at 5+ attempts
- decay: a standard last seen 3 weeks ago sits ~3–6 points below its stored value, never below the floor (25)
- a stat equals the mean of its domain's standard ratings
- overall rating is the mean of the six stats
- PAC derives from latency on `FLU.MULT` and fast correct answers only, and never falls from slow answers

**Step 3:** Implement `derive.ts` as pure functions:

```ts
export function deriveRatings(attempts: Attempt[], now: number): Map<string, StandardRating>
export function deriveCard(ratings: Map<string, StandardRating>, attempts: Attempt[]): Card
export function deriveOverall(card: Card): number
export function deriveWorldRank(overall: number): number
```

Seed rating 50. Decay 1.5 points/week untouched, decay floor 25. `provisional`
under 5 attempts.

**Hard rating floor of 20**, applied after every update and after decay. Below
~19, `difficultyForSuccess` saturates against difficulty 0 and starts serving
items *harder* than the target band asks for — backwards for a struggling skill.
Test it: a standard driven down by 30 consecutive misses must not fall below 20.

**Step 4:** Run — expect PASS.

**Step 5:** Commit: `feat(store): derive ratings, card and rank from the attempts log`.

---

## Task 10: Persistence

**Files:**
- Create: `src/store/storage.ts`
- Create: `src/store/storage.test.ts`
- Create: `src/store/useGameState.ts`

localStorage under `wmc_v1`, append-only for attempts, plus a small mutable blob for country, season and settings. Same pub/sub + `useSyncExternalStore` shape as `finns-chores` — copy that pattern.

Tests: empty load returns defaults; appending an attempt notifies subscribers; unsubscribe works; a corrupt blob falls back to defaults rather than throwing.

Commit: `feat(store): localstorage persistence and react bindings`.

---

## Task 11: Item selection (TDD)

**Files:**
- Create: `src/engine/select.ts`
- Create: `src/engine/select.test.ts`

```ts
export type Pressure = 'own_third' | 'midfield' | 'final_third' | 'shot'
       | 'wide' | 'box' | 'outside18' | 'bicycle' | 'training' | 'penalty'

export const TARGET_SUCCESS: Record<Pressure, number> = {
  own_third: 0.85, midfield: 0.75, final_third: 0.68, shot: 0.62,
  wide: 0.85, box: 0.62, outside18: 0.50, bicycle: 0.38,
  training: 0.75, penalty: 0.80,
}

export function selectItem(opts: {
  ratings: Map<string, StandardRating>
  generators: ItemGenerator[]
  pressure: Pressure
  rng: Rng
  /** Restrict to one domain, e.g. Training Ground. */
  domain?: DomainCode
  /** Big matches: bias hard toward the weakest standards. */
  probeWeakest?: boolean
}): Item
```

Tests:

- difficulty of the returned item is within ±2 of `difficultyForSuccess(rating, TARGET_SUCCESS[pressure])`
- `probeWeakest: true` picks the lowest-rated standard in the domain far more often than uniform
- `domain` filter is respected
- never returns a generator whose `range` cannot reach the target difficulty
- deterministic under a fixed seed

Commit: `feat(engine): item selection targeting success probability`.

---

## Task 12: Match state machine (TDD)

**Files:**
- Create: `src/engine/match.ts`
- Create: `src/engine/match.test.ts`

Pure reducer, no React, no timers. The UI drives it with events and renders the state.

```ts
export type MatchEvent =
  | { type: 'answer'; given: string; latencyMs: number }
  | { type: 'chooseShot'; shot: 'wide' | 'box' | 'outside18' | 'bicycle' }
  | { type: 'tackleBackTimeout' }

export interface MatchState {
  id: string
  opponent: Opponent
  questionsRemaining: number
  zone: Pressure
  possession: 'us' | 'them'
  score: [number, number]
  phase: 'question' | 'shot_choice' | 'tackleback' | 'halftime' | 'fulltime'
  currentItem: Item | null
  defensiveStops: number      // 3 unanswered concedes
  courage: { hardShotsAttempted: number; tackleBacksWon: number }
  log: Attempt[]
}

export function startMatch(opts): MatchState
export function reduce(state: MatchState, event: MatchEvent, deps): MatchState
```

Tests — this is the most behaviour-dense module, so be thorough:

- a correct answer in `own_third` advances to `midfield`
- reaching `final_third` and answering correctly enters `shot_choice`, not an automatic shot
- choosing `bicycle` increments `courage.hardShotsAttempted` **before** the answer is known
- a correct shot answer scores and resets to `midfield` with possession to them
- a wrong answer enters `tackleback` and does **not** change possession yet
- winning the tackle-back returns to the same zone with the same item re-served
- losing the tackle-back flips possession and increments nothing punitive
- `tackleBackTimeout` behaves exactly as losing it — the clock never costs more than the miss already did
- three unanswered defensive challenges concede a goal
- the match ends after exactly 14 questions regardless of state
- halftime fires once, at 7 questions
- the emitted `log` has one Attempt per answered question, with the right `context`

Commit: `feat(engine): match state machine`.

---

## Task 13: Flag designer

**Files:**
- Create: `src/country/flag.ts` (spec type + SVG renderer)
- Create: `src/country/flag.test.ts`
- Create: `src/country/FlagPreview.tsx`

```ts
export type FlagLayout = 'bands-h' | 'bands-v' | 'nordic' | 'diagonal' | 'quarters' | 'saltire' | 'solid'
export type Charge = 'none' | 'star' | 'sun' | 'mountain' | 'bear' | 'eagle' | 'bolt' | 'ball' | /* ...20 total */

export interface FlagSpec {
  layout: FlagLayout
  colors: [string, string, string]
  charge: Charge
  chargeColor: string
}

export function flagSvg(spec: FlagSpec, opts?: { width?: number; height?: number }): string
```

Palette must be **curated** — about 16 colours chosen to look good in combination. No free colour picker.

Tests: every layout × every charge renders valid SVG containing an `<svg>` root; output scales with `width`; the same spec always produces identical output.

Commit: `feat(country): procedural flag designer`.

---

## Task 14: Country creator screen

**Files:**
- Create: `src/screens/CountryCreator.tsx`

Country name, flag layout picker, colour picker (curated), charge picker, kit pattern, live crest preview. Saves to store. This runs **before** the try-out.

Acceptance: a fresh app opens on this screen; choices update the preview instantly; "Take the field" persists and advances to the try-out.

Commit: `feat(screens): country creator`.

---

## Task 15: Question input component

**Files:**
- Create: `src/components/QuestionInput.tsx`
- Create: `src/components/QuestionInput.test.tsx`

Typed entry. Enter submits. On-screen numpad with `/`, `.`, `-` for keyboard-less iPad use. **No countdown timer rendered here** — latency is measured silently.

Tests: typing then Enter fires `onSubmit` with the raw string; numpad taps append; latency is measured from mount to submit; the field is focused on mount.

Commit: `feat(ui): typed answer input with numpad`.

---

## Task 16: Try-out screen

**Files:**
- Create: `src/screens/Tryout.tsx`
- Create: `src/engine/tryout.ts` + test

24 questions, ~4 per domain, up/down ladder starting at difficulty 45. Correct → +8 difficulty, wrong → −10. Writes attempts with `context: 'tryout'`, then reveals the card.

Framed as a scouting combine. No score shown during it. Ends on the card reveal with the six stats animating in.

Commit: `feat(screens): scouting try-out`.

---

## Task 17: Player card and radar

**Files:**
- Create: `src/components/PlayerCard.tsx`
- Create: `src/components/StatRadar.tsx`

Six-axis radar, FC-style card frame, crest with stars, overall rating, world rank. Provisional stats render dashed. Tapping a stat expands to the standards beneath it with their codes.

Also renders opponent cards, for scouting.

Commit: `feat(ui): player card and six-axis radar`.

---

## Task 18: Training Ground

**Files:**
- Create: `src/screens/TrainingGround.tsx`

Pick a stat, then optionally a specific standard. No timer, no stakes, `K_TRAINING`, `context: 'training'`. Shows the stat climbing live. Includes short "finishing drills" for `FLU.MULT`.

Commit: `feat(screens): training ground`.

---

## Task 19: Match screen

**Files:**
- Create: `src/screens/Match.tsx`
- Create: `src/components/Pitch.tsx`
- Create: `src/components/ShotMenu.tsx`
- Create: `src/components/TackleBack.tsx`

SVG pitch with a ball animating between zones via framer-motion. **While a question is live, everything else dims and stops moving** — this implements the cognitive-load mitigation and is not optional polish.

Tackle-back shows a visible, calm 6-second bar. Expiry only loses the ball, which was already loose.

Shot menu presents the four choices with honest difficulty labelling. A missed bicycle kick gets a celebratory "worth trying" treatment, never a failure treatment.

Commit: `feat(screens): match with pitch, shot menu and tackle-back`.

---

## Task 20: Post-match and film room

**Files:**
- Create: `src/screens/PostMatch.tsx`
- Create: `src/screens/FilmRoom.tsx`

Post-match: scoreline, stat deltas, courage summary (hard shots attempted, tackle-backs won), and any "three weeks ago this beat you" callouts.

Film room: every miss with worked steps, grouped by domain, plus the matched misconception explanation where one fired.

Commit: `feat(screens): post-match summary and film room`.

---

## Task 21: App shell, opponents, settings

**Files:**
- Create: `src/components/AppShell.tsx`
- Create: `src/data/opponents.ts`
- Create: `src/screens/Settings.tsx`

Opponents with real star counts: Brazil 5, Germany 4, Italy 4, Argentina 3, France 2, Uruguay 2, Spain 2, England 1. Each carries a six-stat card and a rating that drives difficulty.

Settings: timers off switch (global), reset, and a parent view showing recent attempts and per-standard ratings.

Tabs: Play · Training · Card · Film.

Commit: `feat(app): shell, opponent data, settings`.

---

## Task 22: Verify end to end

Run through in the browser and fix what breaks:

1. Fresh load → country creator → build a flag → take the field
2. Try-out → 24 questions → card reveal with six stats
3. Training Ground → pick DRI → answer 10 → watch DRI move
4. Friendly vs. England → reach the final third → choose a bicycle kick → miss → confirm it reads as brave, not failed
5. Miss a question → tackle-back appears → win it → original returns
6. Miss a question → let the tackle-back time out → confirm nothing beyond the ball is lost
7. Full match → 14 questions → scoreline → film room shows misses with worked steps
8. Answer `14/16` where `7/8` is expected → correct, with a nudge
9. Reload → all state persists

Then: `npm test`, `npx tsc --noEmit`, `npm run build`.

Commit: `fix: end-to-end verification pass`.

---

## Task 23: Deploy

Cloudflare Workers static assets, same as `finns-chores`. Build `npm run build`, output `dist`.

Add PWA manifest and icons so it installs on the iPad.

Commit: `chore: deploy config and pwa manifest`.

---

## Done when

- `npm test` green, including `assertGeneratorSound` for every generator
- `npx tsc --noEmit` clean
- `npm run build` succeeds
- The Task 22 walkthrough passes on both the MacBook and the iPad
- Rion can create a country, take the try-out, train, and play a friendly

## Explicitly not in Phase 1

Qualifiers, tournaments, the World Cup, stars, penalties, commentary, the LLM tutor and its Worker backend, grade-5 generators, chores-app integration. All are in the design doc; none block 2026-08-25.
