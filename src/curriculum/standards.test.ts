import { describe, expect, it } from 'vitest'
import { STANDARDS, STANDARDS_BY_ID, DOMAIN_TO_STAT } from './standards.generated'
import type { DomainCode } from './standards.generated'

const DOMAINS: DomainCode[] = ['OA', 'NBT', 'NF', 'MD', 'G']

/**
 * These counts come from the Montana CASE export and are the contract for the
 * generator. If a regeneration changes them, the parser is wrong — fix
 * `scripts/build-standards.mjs`, do not edit the numbers.
 */
const EXPECTED_STANDARD_COUNTS = {
  4: { OA: 5, NBT: 6, NF: 7, MD: 7, G: 3 },
  5: { OA: 3, NBT: 7, NF: 7, MD: 5, G: 4 },
}

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

  it('matches the documented per-domain standard counts', () => {
    const actual: Record<number, Record<string, number>> = { 4: {}, 5: {} }
    for (const grade of [4, 5] as const) {
      for (const domain of DOMAINS) {
        actual[grade][domain] = STANDARDS.filter(
          (s) => s.itemType === 'Standard' && s.grade === grade && s.domain === domain,
        ).length
      }
    }
    expect(actual).toEqual(EXPECTED_STANDARD_COUNTS)
  })

  it('has a unique id for every entry', () => {
    const ids = STANDARDS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a non-empty, whitespace-trimmed statement everywhere', () => {
    for (const s of STANDARDS) {
      expect(s.statement).not.toBe('')
      expect(s.statement).toBe(s.statement.trim())
    }
  })

  it('indexes every entry in STANDARDS_BY_ID', () => {
    expect(Object.keys(STANDARDS_BY_ID)).toHaveLength(STANDARDS.length)
    for (const s of STANDARDS) expect(STANDARDS_BY_ID[s.id]).toBe(s)
  })

  it('contains only grades 4 and 5 and the five known domains', () => {
    for (const s of STANDARDS) {
      expect([4, 5]).toContain(s.grade)
      expect(DOMAINS).toContain(s.domain)
    }
  })

  it("makes every component's parentId a strict prefix of its own id", () => {
    for (const c of STANDARDS.filter((s) => s.itemType === 'Component')) {
      expect(c.parentId!.length).toBeLessThan(c.id.length)
      expect(c.id.startsWith(`${c.parentId!}.`)).toBe(true)
    }
  })

  it('carries MT.4.NF.3 through intact', () => {
    const s = STANDARDS_BY_ID['MT.4.NF.3']
    expect(s).toBeDefined()
    expect(s.itemType).toBe('Standard')
    expect(s.grade).toBe(4)
    expect(s.domain).toBe('NF')
    expect(s.statement).toMatch(
      /^Understand a fraction a\/b with a > 1 as a sum of fractions 1\/b by/,
    )
  })

  it('preserves the *...* emphasis on component statements', () => {
    // `MT.4.NF.3.a` restates its parent in emphasis before adding its own text.
    // Dropping those markers would be an invisible loss of content.
    const c = STANDARDS_BY_ID['MT.4.NF.3.a']
    expect(c.statement.startsWith('*Understand a fraction a/b with a > 1')).toBe(true)
    expect(c.statement).toContain('* understanding addition and subtraction of fractions')
  })
})
