/**
 * Every item generator the game can draw from.
 *
 * Selection code should reach for this list rather than importing generators one
 * at a time, so that adding a generator is a single-line change and so that
 * nothing can quietly ship without being covered by `index.test.ts` — which is
 * what checks that each `standardId` is a real Montana code and that no two
 * generators claim the same one.
 */

import type { ItemGenerator } from '../types'
import { mt4nbt4 } from './mt4nbt4'
import { mt4nf1 } from './mt4nf1'
import { mt4nf2 } from './mt4nf2'
import { mt4nf3 } from './mt4nf3'
import { mt4nf4 } from './mt4nf4'

export { mt4nbt4, mt4nf1, mt4nf2, mt4nf3, mt4nf4 }

export const ALL_GENERATORS: readonly ItemGenerator[] = [mt4nf1, mt4nf2, mt4nf3, mt4nf4, mt4nbt4]

/** The generator for a standard, or `undefined` if nothing covers it yet. */
export function generatorFor(standardId: string): ItemGenerator | undefined {
  return ALL_GENERATORS.find((g) => g.standardId === standardId)
}
