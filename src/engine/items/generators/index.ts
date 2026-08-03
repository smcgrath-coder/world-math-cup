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
import { mt4g1 } from './mt4g1'
import { mt4md1 } from './mt4md1'
import { mt4md3 } from './mt4md3'
import { mt4nbt4 } from './mt4nbt4'
import { mt4nbt5 } from './mt4nbt5'
import { mt4nbt6 } from './mt4nbt6'
import { mt4nf1 } from './mt4nf1'
import { mt4nf2 } from './mt4nf2'
import { mt4nf3 } from './mt4nf3'
import { mt4nf4 } from './mt4nf4'
import { mt4oa1 } from './mt4oa1'
import { mt4oa4 } from './mt4oa4'

export {
  mt4g1,
  mt4md1,
  mt4md3,
  mt4nbt4,
  mt4nbt5,
  mt4nbt6,
  mt4nf1,
  mt4nf2,
  mt4nf3,
  mt4nf4,
  mt4oa1,
  mt4oa4,
}

export const ALL_GENERATORS: readonly ItemGenerator[] = [
  mt4nf1,
  mt4nf2,
  mt4nf3,
  mt4nf4,
  mt4nbt4,
  mt4nbt5,
  mt4nbt6,
  mt4oa1,
  mt4oa4,
  mt4md1,
  mt4md3,
  mt4g1,
]

/** The generator for a standard, or `undefined` if nothing covers it yet. */
export function generatorFor(standardId: string): ItemGenerator | undefined {
  return ALL_GENERATORS.find((g) => g.standardId === standardId)
}
