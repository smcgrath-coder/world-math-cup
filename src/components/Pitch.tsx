/**
 * The pitch, and the ball on it.
 *
 * This is the whole reason a match is a match rather than fourteen questions in
 * a row. It has to read as a football pitch to a ten-year-old at a glance —
 * mown stripes, a centre circle, two penalty areas, a ball with a shadow under
 * it — because the moment it reads as a progress bar the fiction is gone and he
 * is doing a worksheet with a green background.
 *
 * **It goes still while a question is live, and that is not a nicety.** A
 * fractions problem is already most of what his working memory can hold; a ball
 * drifting about beside it is extraneous load stacked on the thinking we
 * actually want. So every bit of movement in this component is gated on one
 * boolean, the caller sets it from whether a question is on screen, and the
 * transition is genuinely `duration: 0` rather than merely fast.
 *
 * Left to right, our goal on the left. Advancing always moves the ball to the
 * right, which is how every football broadcast he has ever seen is framed, and
 * it means "am I getting anywhere" is answered without reading anything.
 */

import { motion } from 'framer-motion'
import type { Zone } from '../engine/match'

/** The SVG's own coordinates. Everything below is in these units. */
export const VIEW_W = 320
export const VIEW_H = 200

/** How far the touchlines sit inside the viewBox, leaving room for the goals. */
const INSET = 10
const LEFT = INSET
const RIGHT = VIEW_W - INSET
const TOP = INSET
const BOTTOM = VIEW_H - INSET
const MIDX = VIEW_W / 2
const MIDY = VIEW_H / 2

export type Possession = 'us' | 'them'

export interface BallState {
  zone: Zone
  possession: Possession
  /** A shot has been chosen and the ball is at the striker's feet. */
  shooting?: boolean
  /**
   * Nobody has it: a tackle-back is on.
   *
   * The reducer keeps possession with him through a tackle-back, because that is
   * what winning it back means, but on the pitch it would then be drawn as a ball
   * he is comfortably in charge of — which is the one moment where that is not
   * what is happening. It stays where it was and loses its colour.
   */
  loose?: boolean
}

/**
 * Where the ball can be.
 *
 * Four of these are the four zones of the design; `their_attack` is the fifth
 * position the ball genuinely occupies — them coming at our goal — and drawing
 * it in the same place as our own build-up would make the one thing the pitch
 * has to say at a glance, who has the ball, the one thing it did not.
 */
export type Spot = 'their_attack' | 'own_third' | 'midfield' | 'final_third' | 'shot'

/** Strictly increasing, so "advanced" and "moved right" are the same sentence. */
export const SPOT_X: Record<Spot, number> = {
  their_attack: 46,
  own_third: 88,
  midfield: MIDX,
  final_third: 232,
  shot: 264,
}

export function ballSpot(ball: BallState): Spot {
  // Their kickoff is the one time they hold it on the halfway line; every other
  // possession of theirs is an attack on our goal.
  if (ball.possession === 'them') return ball.zone === 'midfield' ? 'midfield' : 'their_attack'
  if (ball.shooting === true) return 'shot'
  return ball.zone
}

export interface PitchProps {
  ball: BallState
  /** True while a question is on screen. Nothing in here may move. */
  still: boolean
  ourName: string
  ourKit: readonly [string, string]
  theirName: string
  theirKit: readonly [string, string]
}

export function Pitch({ ball, still, ourName, ourKit, theirName, theirKit }: PitchProps) {
  const spot = ballSpot(ball)
  const x = SPOT_X[spot]
  const loose = ball.loose === true
  const ours = !loose && ball.possession === 'us'
  // Each side's own shirt, matching the goal it is defending, so the one thing
  // the pitch must say at a glance is said in the colours he already knows. A
  // white outline keeps it visible on grass whatever the kit is — playing Brazil
  // in gold would otherwise put two near-identical yellows on the same ball.
  const ring = loose ? '#ffffff' : ours ? ourKit[0] : theirKit[0]

  return (
    <div className="w-full">
      <svg
        data-testid="pitch"
        data-still={String(still)}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block w-full rounded-2xl ring-1 ring-white/10"
        role="img"
        aria-label={`${ourName} attacking left to right against ${theirName}`}
      >
        {/* Mown stripes. They are what a real pitch looks like from the stand,
            and they happen to be the four zones — which is the right way round:
            the zones are visible because the pitch is drawn properly, not
            because a bar has been divided into four. */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} className="fill-pitch-dark" />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={LEFT + (i * (RIGHT - LEFT)) / 4}
            y={TOP}
            width={(RIGHT - LEFT) / 4}
            height={BOTTOM - TOP}
            fill={i % 2 === 0 ? '#15803d' : '#178a44'}
          />
        ))}

        <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5">
          <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} />
          <line x1={MIDX} y1={TOP} x2={MIDX} y2={BOTTOM} />
          <circle data-testid="centre-circle" cx={MIDX} cy={MIDY} r="26" />
          <rect data-testid="penalty-area-ours" x={LEFT} y="55" width="46" height="90" />
          <rect data-testid="penalty-area-theirs" x={RIGHT - 46} y="55" width="46" height="90" />
          <rect x={LEFT} y="78" width="18" height="44" />
          <rect x={RIGHT - 18} y="78" width="18" height="44" />
        </g>
        <g fill="rgba(255,255,255,0.55)">
          <circle cx={MIDX} cy={MIDY} r="2" />
          <circle cx={LEFT + 34} cy={MIDY} r="2" />
          <circle cx={RIGHT - 34} cy={MIDY} r="2" />
        </g>

        {/* The goals wear the kits, so which end is whose needs no reading. */}
        <rect x={LEFT - 7} y="80" width="7" height="40" fill={ourKit[0]} opacity="0.9" />
        <rect x={RIGHT} y="80" width="7" height="40" fill={theirKit[0]} opacity="0.9" />

        <motion.g
          data-testid="ball"
          data-x={x}
          data-spot={spot}
          data-moving={String(!still)}
          initial={false}
          animate={{ x, y: MIDY }}
          // Genuinely nothing, rather than something quick: the ball has already
          // arrived by the time a question goes up, so a still pitch is a pitch
          // where no frame changes at all.
          transition={
            still ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18, mass: 0.9 }
          }
        >
          <ellipse cx="0" cy="9" rx="8" ry="2.5" fill="rgba(0,0,0,0.35)" />
          {/* Possession, in colour: our gold, their shirt, or nobody's white. */}
          <circle
            cx="0"
            cy="0"
            r="10"
            fill={ring}
            fillOpacity={loose ? 0.2 : 0.75}
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="1"
          />
          <circle cx="0" cy="0" r="6.5" fill="#ffffff" stroke="rgba(15,23,42,0.5)" strokeWidth="0.8" />
          <path d="M-2.6 -1.2 L0 -3 L2.6 -1.2 L1.6 1.9 L-1.6 1.9 Z" fill="#0f172a" opacity="0.75" />
        </motion.g>
      </svg>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold tracking-wide">
        <span className="flex items-center gap-1.5 text-white/50">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: ourKit[0] }}
          />
          {ourName}
        </span>
        <span
          data-testid="possession"
          className={ours ? 'font-black text-gold uppercase' : 'font-black text-white/60 uppercase'}
        >
          {loose ? 'Ball’s loose' : ours ? 'You’re on the ball' : `${theirName} on the ball`}
        </span>
        <span className="flex items-center gap-1.5 text-white/50">
          {theirName}
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: theirKit[0] }}
          />
        </span>
      </div>
    </div>
  )
}
