/**
 * The player card: the one screen in the game that is purely about him.
 *
 * It has to look like a card he would pull in FC, because that is the whole
 * mechanism — a number he recognises, a shape that changes, a crest that is his.
 * So: overall rating in the corner, crest with a star for each World Cup, six
 * stats in two columns, and the radar between them.
 *
 * **Three ideas beyond the frame, and each of them is load-bearing.**
 *
 * *The stats are football words on the outside and curriculum on the inside.*
 * He reads DRI 55. Tapping it opens Fractions, MT.4.NF.1 through MT.4.NF.4, and
 * what he is rated on each. That is the scouting view and the parent-legible
 * view at once, and they are deliberately the same view — nothing about his
 * progress is hidden from him behind a grown-up screen.
 *
 * *A stat is provisional until every topic under it has been seen enough.*
 * Twenty attempts at equivalent fractions say nothing about multiplying them,
 * and a card that averaged the one it knows into a confident DRI would be
 * claiming more than it has. Provisional draws dashed, everywhere, until the
 * evidence is in.
 *
 * *An opponent renders through this same component.* Brazil's card has to be
 * directly comparable to his — same frame, same radar, same axes — because
 * comparing them is what scouting *is*. Their six stats come from `rating` and
 * `specialism` by a pure function, so Brazil is the same Brazil every time it is
 * drawn and the roster stays a table of numbers rather than a set of cards to
 * maintain.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { StatRadar } from './StatRadar'
import {
  LABELS_BY_STANDARD,
  STANDARDS_BY_STAT,
  STAT_LABELS,
  clampStat,
  opponentCard,
  provisionalStats,
} from './stats'
import { CrestPreview } from '../country/FlagPreview'
import { normalizeFlagSpec } from '../country/flag'
import type { FlagSpec } from '../country/flag'
import { CARD_STATS, deriveOverall, deriveWorldRank } from '../store/derive'
import type { CardStat } from '../curriculum/standards.generated'
import type { Opponent } from '../data/opponents'
import type { Card, StandardRating } from '../store/types'
import type { Country } from '../store/storage'

/** An opponent's crest, in their kit. Teams are recognised by kit, not by flag. */
const kitCrest = (kit: readonly [string, string]): FlagSpec =>
  normalizeFlagSpec({
    layout: 'bands-h',
    colors: [kit[0], kit[1], kit[0]],
    charge: 'none',
    chargeColor: kit[1],
  })

// ---------------------------------------------------------------------------

interface PlayerFace {
  country: Country
  card: Card
  /** Drives the dashed segments and the per-standard numbers behind each stat. */
  ratings: Map<string, StandardRating>
  opponent?: never
}

interface OpponentFace {
  opponent: Opponent
  country?: never
  card?: never
  ratings?: never
}

export type PlayerCardProps = (PlayerFace | OpponentFace) & { className?: string }

export function PlayerCard(props: PlayerCardProps) {
  const [open, setOpen] = useState<CardStat | null>(null)

  const mine = props.opponent === undefined
  const name = mine ? props.country.name : props.opponent.name
  const card = mine ? props.card : opponentCard(props.opponent)
  const stars = mine ? props.country.stars : props.opponent.stars
  const kit = mine ? props.country.kit : props.opponent.kit
  const crest = mine ? normalizeFlagSpec(props.country.flag) : kitCrest(props.opponent.kit)
  const ratings = mine ? props.ratings : undefined
  const provisional = ratings ? provisionalStats(ratings) : []

  const exact = deriveOverall(card)
  const overall = Math.round(exact)
  const rank = deriveWorldRank(exact)

  const crestLabel =
    stars > 0
      ? `${name}'s crest, ${stars} World Cup${stars === 1 ? '' : 's'} won`
      : `${name}'s crest`

  return (
    <div
      className={clsx(
        'w-full max-w-sm overflow-hidden rounded-3xl bg-pitch-dark text-white ring-2 ring-gold/70 shadow-xl',
        props.className,
      )}
    >
      {/* The kit, worn by the card itself. Two thin bands rather than a fill, so
          a white or black kit cannot swallow the text underneath it. */}
      <div className="flex h-2 w-full">
        <div className="w-2/3" style={{ backgroundColor: kit[0] }} />
        <div className="w-1/3" style={{ backgroundColor: kit[1] }} />
      </div>

      <div className="bg-gradient-to-b from-pitch/40 to-transparent px-4 pt-4 pb-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-6xl leading-none font-black text-gold">{overall}</p>
            <p className="mt-1 text-xs font-bold tracking-widest text-white/60 uppercase">
              Overall
            </p>
            <p className="mt-2 text-sm font-semibold text-white/80">{`#${rank} in the world`}</p>
          </div>
          {/* Stars are the crest's own job — it reserves the band whether or not
              there is anything in it, so a first World Cup adds a star rather
              than moving the badge he has been looking at for months. */}
          <CrestPreview spec={crest} stars={stars} width={104} label={crestLabel} className="w-24" />
        </div>

        <p className="mt-3 truncate border-b border-white/15 pb-3 text-center text-2xl font-black tracking-wide uppercase">
          {name}
        </p>

        <div className="flex justify-center py-3">
          <StatRadar card={card} provisional={provisional} size={220} label={name} />
        </div>

        {/* Column-major, so the six land as PAC/SHO/PAS beside DRI/DEF/PHY —
            which is where a child who plays FC already expects to find them. */}
        <div className="grid grid-flow-col grid-cols-2 grid-rows-3 gap-2">
          {CARD_STATS.map((stat) => {
            const unproven = provisional.includes(stat)
            const value = Math.round(clampStat(card[stat]))
            return (
              <motion.button
                key={stat}
                type="button"
                data-stat={stat}
                aria-expanded={open === stat}
                aria-label={`${STAT_LABELS[stat].soccer} ${value}${unproven ? ', not yet proven' : ''}`}
                whileTap={{ scale: 0.96 }}
                onClick={() => setOpen((current) => (current === stat ? null : stat))}
                className={clsx(
                  'flex h-14 items-center justify-between rounded-xl px-3 transition-colors',
                  open === stat ? 'bg-white/20 ring-2 ring-gold' : 'bg-white/8 ring-1 ring-white/15',
                )}
              >
                <span className="text-sm font-bold tracking-widest text-white/70">{stat}</span>
                <span
                  className={clsx(
                    'text-2xl font-black',
                    // The same signal the radar gives, in the column of numbers:
                    // a dashed rule under anything not yet settled.
                    unproven && 'border-b-2 border-dashed border-gold/80 leading-6',
                  )}
                >
                  {value}
                </span>
              </motion.button>
            )
          })}
        </div>

        {open !== null && (
          <StatDetail stat={open} card={card} ratings={ratings} unproven={provisional.includes(open)} />
        )}
      </div>
    </div>
  )
}

/**
 * What is actually behind a stat.
 *
 * The Montana codes are here on purpose. They are the one thing a parent or a
 * teacher can carry back to school, and putting them in front of him as well
 * costs nothing — a code beside "Equivalent fractions" reads as a shirt number.
 */
function StatDetail({
  stat,
  card,
  ratings,
  unproven,
}: {
  stat: CardStat
  card: Card
  ratings?: Map<string, StandardRating>
  unproven: boolean
}) {
  const { soccer, maths } = STAT_LABELS[stat]

  return (
    <motion.section
      aria-label={`${soccer} — ${maths}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mt-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10"
    >
      <p className="text-xs font-bold tracking-widest text-white/50 uppercase">{`${stat} · ${soccer}`}</p>
      <p className="mt-0.5 text-lg font-bold text-gold">{maths}</p>

      {stat === 'PAC' && (
        <p className="mt-1 text-sm text-white/70">
          Pace is how fast your right answers arrive, on every skill — not a topic of its own. It
          only ever goes up.
        </p>
      )}
      {ratings === undefined && (
        <p className="mt-1 text-sm text-white/70">The topics you will face here.</p>
      )}
      {unproven && ratings !== undefined && (
        <p className="mt-1 text-sm text-white/70">
          Dashed means not settled yet. A few more of these and the number is real.
        </p>
      )}

      <ul className="mt-2 divide-y divide-white/10">
        {STANDARDS_BY_STAT[stat].map((id) => {
          const rating = ratings?.get(id)
          return (
            <li key={id} className="flex items-baseline gap-3 py-2">
              <span className="font-mono text-xs text-white/50">{id}</span>
              <span className="flex-1 text-sm font-semibold">{LABELS_BY_STANDARD[id] ?? id}</span>
              {ratings !== undefined &&
                (rating === undefined || rating.attempts === 0 ? (
                  <span className="text-xs text-white/45">Not played yet</span>
                ) : (
                  <span
                    className={clsx(
                      'text-lg font-black',
                      rating.provisional && 'border-b-2 border-dashed border-gold/80 leading-5',
                    )}
                  >
                    {Math.round(rating.rating)}
                  </span>
                ))}
            </li>
          )
        })}
      </ul>

      {ratings === undefined && (
        <p className="mt-2 text-sm text-white/60">{`${soccer} ${Math.round(clampStat(card[stat]))} overall.`}</p>
      )}
    </motion.section>
  )
}
