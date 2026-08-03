import { describe, expect, it } from 'vitest'
import { classifyMiss, checkAnswer } from './answer'

const spec = (canonical: string) => ({ kind: 'rational' as const, canonical })

describe('classifyMiss', () => {
  describe("Rion's case: one out is not the same as nowhere near", () => {
    it('calls 43 a near miss when the answer is 42', () => {
      expect(classifyMiss('43', spec('42')).kind).toBe('near')
    })

    it('calls 7 off target when the answer is 42', () => {
      expect(classifyMiss('7', spec('42')).kind).toBe('off')
    })

    it('calls 3 a near miss when the answer is 2, despite 50% relative error', () => {
      expect(classifyMiss('3', spec('2')).kind).toBe('near')
    })

    it('calls a wildly large answer off target', () => {
      expect(classifyMiss('1000', spec('7/8')).kind).toBe('off')
    })
  })

  describe('fractions', () => {
    it('treats one piece out as near, even after reduction hides the denominator', () => {
      // 6/8 reduces to 3/4, so a same-denominator check would miss this.
      expect(classifyMiss('6/8', spec('7/8')).kind).toBe('near')
      expect(classifyMiss('3/8', spec('1/2')).kind).toBe('near')
    })

    it('treats a coarse gap as off target', () => {
      // 1/2 against 5/6 is a third out — a different quantity, not a slip.
      expect(classifyMiss('1/2', spec('5/6')).kind).toBe('off')
    })

    it('treats a flipped fraction as off target rather than near', () => {
      expect(classifyMiss('8/7', spec('7/8')).kind).toBe('off')
    })

    it('accepts decimal spellings of a near answer', () => {
      expect(classifyMiss('0.75', spec('7/8')).kind).toBe('near')
    })
  })

  describe('misconceptions win over distance', () => {
    const miscs = [
      { id: 'add-across', signature: '4/16' },
      { id: 'wrong-operation', signature: '99' },
    ]

    it('names the mistake when the answer matches a signature', () => {
      const r = classifyMiss('4/16', spec('1/2'), miscs)
      expect(r.kind).toBe('misconception')
      expect(r.misconceptionId).toBe('add-across')
    })

    it('matches a signature written in a different but equal form', () => {
      const r = classifyMiss('1/4', spec('1/2'), miscs)
      expect(r.kind).toBe('misconception')
      expect(r.misconceptionId).toBe('add-across')
    })

    it('prefers the named mistake even when the value is also far away', () => {
      const r = classifyMiss('99', spec('1/2'), miscs)
      expect(r.kind).toBe('misconception')
      expect(r.misconceptionId).toBe('wrong-operation')
    })

    it('falls through to distance when nothing matches', () => {
      expect(classifyMiss('5/8', spec('1/2'), miscs).kind).toBe('near')
    })
  })

  describe('safety', () => {
    it('reports unreadable input rather than guessing', () => {
      expect(classifyMiss('banana', spec('42')).kind).toBe('unreadable')
      expect(classifyMiss('', spec('42')).kind).toBe('unreadable')
    })

    it('never throws on hostile input', () => {
      const hostile = ['', ' ', '/', '--', '∞', '🙂', '9'.repeat(400), '1//2', '0,875']
      for (const g of hostile) {
        expect(() => classifyMiss(g, spec('7/8')), `threw on ${g.slice(0, 12)}`).not.toThrow()
      }
    })

    it('reports a relative error whenever the answer could be read', () => {
      const r = classifyMiss('43', spec('42'))
      expect(r.relativeError).toBeCloseTo(1 / 42, 6)
    })
  })

  describe('classification never leaks into scoring', () => {
    it('leaves every near miss still wrong', () => {
      for (const [given, canonical] of [
        ['43', '42'],
        ['3', '2'],
        ['6/8', '7/8'],
        ['0.75', '7/8'],
      ] as const) {
        expect(checkAnswer(given, spec(canonical)).correct, `${given} vs ${canonical}`).toBe(false)
        expect(classifyMiss(given, spec(canonical)).kind).toBe('near')
      }
    })
  })
})
