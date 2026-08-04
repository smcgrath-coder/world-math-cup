/**
 * The six-axis radar: the shape of a player, in one glance.
 *
 * This is the thing he looks at to see himself getting better, so it is drawn
 * with a few rules that are about a ten-year-old rather than about charting.
 *
 * **It never collapses to a dot.** A rating of 20 is the hard floor, and the
 * floor is where a skill he is actively losing ends up. Mapping 0–99 straight
 * onto the radius would draw that as a speck in the middle of an empty hexagon,
 * which says something crueller than the number does. So the radius runs from a
 * fifth of the way out to the rim: a floored card is a small hexagon, a maxed
 * one fills the frame, and a card with one strong stat is a spike *on a solid
 * core* rather than a needle. The numbers next to it are unscaled and honest;
 * this is only how the shape is drawn.
 *
 * **Provisional stats are dashed.** Under five attempts a rating is not yet
 * evidence, and drawing it in the same confident line as a proven one would
 * make the card claim more than it knows. Dashed reads instantly as "not
 * settled yet" without needing a word of explanation.
 *
 * **Everything is in viewBox units.** Only the outer `width` and `height` change
 * with `size`, exactly as `flag.ts` does it, so the same drawing serves a 140px
 * card and a full-screen reveal and cannot distort between them.
 *
 * No chart library. Six points on a circle is trigonometry, not a dependency.
 */

import { CARD_STATS } from '../store/derive'
import { MAX_RATING, STAT_LABELS } from './stats'
import type { Card } from '../store/types'
import type { CardStat } from '../curriculum/standards.generated'

/** Square, so a hexagon centred in it is never squashed. */
const VIEW = 120
const CENTRE = VIEW / 2
/** Leaves room outside the rim for the three-letter labels. */
const RIM = 44
/**
 * The smallest a stat may be drawn, as a share of the rim.
 *
 * Presentational only, and the reason is in the module comment: the shape must
 * stay a shape at the rating floor.
 */
const CORE = 0.22

const GOLD = '#FBBF24'

/** Corrupt logs reach the store; a NaN here is an SVG that does not draw at all. */
const clampRating = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_RATING, Math.max(0, value)) : 0

const radiusFor = (value: number): number =>
  RIM * (CORE + (1 - CORE) * (clampRating(value) / MAX_RATING))

/** Straight up for the first stat, then clockwise, like a compass. */
const angleFor = (index: number): number => ((-90 + index * (360 / CARD_STATS.length)) * Math.PI) / 180

function pointAt(index: number, radius: number): [number, number] {
  const angle = angleFor(index)
  return [CENTRE + radius * Math.cos(angle), CENTRE + radius * Math.sin(angle)]
}

const asPoints = (points: [number, number][]): string =>
  points.map(([x, y]) => `${x},${y}`).join(' ')

/** A regular hexagon at a share of the rim, for the backdrop rings. */
const ring = (share: number): string =>
  asPoints(CARD_STATS.map((_, i) => pointAt(i, RIM * share)))

export interface StatRadarProps {
  card: Card
  /** Stats with fewer than five attempts behind them. Drawn dashed. */
  provisional?: readonly CardStat[]
  /** Rendered width and height in pixels. The drawing itself does not change. */
  size?: number
  /** Prefix for the text alternative, e.g. the country name. */
  label?: string
  className?: string
}

export function StatRadar({ card, provisional, size = 240, label, className }: StatRadarProps) {
  const unproven = new Set(provisional ?? [])
  const vertices = CARD_STATS.map((stat, i) => pointAt(i, radiusFor(card[stat])))

  /**
   * The text alternative. A shape tells a screen reader nothing at all, and
   * this is also the version a parent can read out loud.
   */
  const spoken =
    (label === undefined ? '' : `${label}. `) +
    CARD_STATS.map((stat) => {
      const value = Math.round(clampRating(card[stat]))
      const soccer = STAT_LABELS[stat].soccer
      return unproven.has(stat) ? `${soccer} ${value} (not yet proven)` : `${soccer} ${value}`
    }).join(', ')

  return (
    <svg
      role="img"
      aria-label={spoken}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      className={className}
    >
      {/* Backdrop: three rings and six spokes, faint enough to read as graph
          paper rather than as part of the shape. */}
      {[1 / 3, 2 / 3, 1].map((share) => (
        <polygon
          key={share}
          points={ring(share)}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={share === 1 ? 0.35 : 0.15}
          strokeWidth={0.7}
        />
      ))}
      {CARD_STATS.map((stat, i) => {
        const [x, y] = pointAt(i, RIM)
        return (
          <line
            key={stat}
            data-axis={stat}
            x1={CENTRE}
            y1={CENTRE}
            x2={x}
            y2={y}
            stroke="#FFFFFF"
            strokeOpacity={0.15}
            strokeWidth={0.7}
          />
        )
      })}

      <polygon
        data-testid="radar-shape"
        points={asPoints(vertices)}
        fill={GOLD}
        fillOpacity={0.28}
      />

      {/* The outline is six separate edges rather than one stroke on the
          polygon, so that a single unproven stat can dash the two edges that
          touch it without dashing the whole shape. */}
      {CARD_STATS.map((stat, i) => {
        const next = (i + 1) % CARD_STATS.length
        const [x1, y1] = vertices[i]!
        const [x2, y2] = vertices[next]!
        const loose = unproven.has(stat) || unproven.has(CARD_STATS[next]!)
        return (
          <line
            key={`edge-${stat}`}
            data-edge={stat}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={GOLD}
            strokeWidth={1.8}
            strokeLinecap="round"
            {...(loose ? { strokeDasharray: '3 2.5' } : {})}
          />
        )
      })}

      {CARD_STATS.map((stat, i) => {
        const [x, y] = vertices[i]!
        return unproven.has(stat) ? (
          <circle
            key={`dot-${stat}`}
            data-dot={stat}
            cx={x}
            cy={y}
            r={2.4}
            fill="none"
            stroke={GOLD}
            strokeWidth={1.2}
            strokeDasharray="1.5 1.5"
          />
        ) : (
          <circle key={`dot-${stat}`} data-dot={stat} cx={x} cy={y} r={2.4} fill={GOLD} />
        )
      })}

      {CARD_STATS.map((stat, i) => {
        const [x, y] = pointAt(i, RIM + 9)
        return (
          <text
            key={`label-${stat}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            fontWeight={700}
            fill="#FFFFFF"
            fillOpacity={0.75}
          >
            {stat}
          </text>
        )
      })}
    </svg>
  )
}
