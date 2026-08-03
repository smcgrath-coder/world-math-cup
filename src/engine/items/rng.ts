import type { Rng } from './types'

/**
 * mulberry32 — small, fast, and good enough for choosing numbers in a maths
 * question. Deterministic for a given seed, which is the property that matters:
 * tests are reproducible and a match can be replayed from its seed.
 */
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
    int: (min, max) => {
      if (max < min) throw new Error(`Rng.int: empty range ${min}..${max}`)
      return min + Math.floor(next() * (max - min + 1))
    },
    pick: (items) => {
      if (items.length === 0) throw new Error('Rng.pick: empty list')
      return items[Math.floor(next() * items.length)]!
    },
  }
}
