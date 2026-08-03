import { describe, expect, it } from 'vitest'
import { makeRng } from './rng'

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
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

  it('reaches both ends of a range', () => {
    const r = makeRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 6))
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('handles a single-value range', () => {
    const r = makeRng(3)
    for (let i = 0; i < 20; i++) expect(r.int(4, 4)).toBe(4)
  })

  it('throws on an empty range rather than returning NaN', () => {
    expect(() => makeRng(1).int(5, 4)).toThrow()
  })

  it('picks from a list and never returns undefined', () => {
    const r = makeRng(99)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(r.pick(items))
    }
  })

  it('throws on picking from an empty list', () => {
    expect(() => makeRng(1).pick([])).toThrow()
  })

  it('advances state, so successive calls differ over a run', () => {
    const r = makeRng(5)
    const values = Array.from({ length: 50 }, () => r.int(0, 1_000_000))
    expect(new Set(values).size).toBeGreaterThan(40)
  })

  it('is not biased enough to matter across a small range', () => {
    const r = makeRng(2026)
    const counts = new Map<number, number>()
    const n = 60_000
    for (let i = 0; i < n; i++) {
      const v = r.int(1, 6)
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    for (const [, c] of counts) {
      // Within 5% of a sixth of the draws.
      expect(Math.abs(c - n / 6) / (n / 6)).toBeLessThan(0.05)
    }
  })
})
