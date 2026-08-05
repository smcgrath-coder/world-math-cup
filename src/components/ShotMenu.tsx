/**
 * The shot menu: four ways to finish, and the only genuine decision in a match.
 *
 * The trade is stated honestly — harder is described as harder, because a child
 * who finds out afterwards that the game was flattering him stops believing any
 * of it. What is never stated is a warning. Nothing on this card suggests the
 * bicycle kick is a bad idea, a risk, or a thing to save for when he is already
 * winning.
 *
 * The bottom two are the point of the screen. `chooseShot` increments the
 * courage count the instant one of them is tapped, before the question has even
 * been generated, so the card says exactly that in words he can check: *it
 * counts the second you try it*. That promise is the mechanism this whole game
 * exists to run — the block sits in the moment before attempting something hard,
 * so that is the moment that has to pay out — and it is worth nothing if he has
 * to take it on trust.
 */

import { motion } from 'framer-motion'
import clsx from 'clsx'
import type { ShotChoice } from '../store/types'

export interface ShotOption {
  shot: ShotChoice
  title: string
  blurb: string
  /** Counts on the courage track the moment it is chosen, in or out. */
  brave: boolean
}

/**
 * Easiest first, so the list reads as a ladder he climbs rather than a dare he
 * is being talked into. The two that count either way are at the bottom, where
 * the note about them sits.
 */
export const SHOT_OPTIONS: readonly ShotOption[] = [
  {
    shot: 'wide',
    title: 'Work it wider',
    blurb: 'The simplest ball of the four. Take the easy one.',
    brave: false,
  },
  {
    shot: 'box',
    title: 'Inside the box',
    blurb: 'The chance you’d expect to take.',
    brave: false,
  },
  {
    shot: 'outside18',
    title: 'Outside the 18',
    blurb: 'A harder ball. Counts as one you went for, in or out.',
    brave: true,
  },
  {
    shot: 'bicycle',
    title: 'Bicycle kick',
    blurb: 'The hardest thing on the pitch. It counts the second you try it.',
    brave: true,
  },
]

export interface ShotMenuProps {
  onChoose: (shot: ShotChoice) => void
}

export function ShotMenu({ onChoose }: ShotMenuProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">In the final third</p>
        <h2 className="mt-1 text-2xl leading-tight font-black text-balance">
          You’re through. How do you want it?
        </h2>
      </div>

      <ul className="flex flex-col gap-2">
        {SHOT_OPTIONS.map((option) => (
          <li key={option.shot}>
            <motion.button
              type="button"
              onClick={() => onChoose(option.shot)}
              whileTap={{ scale: 0.98 }}
              className={clsx(
                'flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1',
                option.brave
                  ? 'bg-gold/12 ring-gold/40 active:bg-gold/20'
                  : 'bg-black/25 ring-white/10 active:bg-black/40',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-black">{option.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-white/65">
                  {option.blurb}
                </span>
              </span>
              {option.brave && (
                <span className="shrink-0 rounded-full bg-gold/20 px-2 py-1 text-[11px] font-black text-gold">
                  counts either way
                </span>
              )}
            </motion.button>
          </li>
        ))}
      </ul>

      <p className="text-[13px] leading-relaxed text-white/55">
        The bottom two go on your record whether they go in or not. Going for one is the bit that
        counts.
      </p>
    </div>
  )
}
