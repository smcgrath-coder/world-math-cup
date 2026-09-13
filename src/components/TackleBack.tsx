/**
 * The tackle-back clock: the one visible clock in the game, and the reason it
 * is allowed to exist is worth stating where the code is.
 *
 * Unfinished *timed* work cost this child recess last year, and the rule that
 * came out of it is that **no clock may take away something he already holds**.
 * This one cannot, by construction: the ball is already loose when the bar
 * starts. Winning it back is a thing he might gain. Running out costs exactly
 * what answering wrong costs and not a thing more — the reducer routes a timeout
 * through the identical transition — so the worst this bar can do is fail to
 * hand him a bonus.
 *
 * It is drawn calm on purpose. A bar that empties smoothly, in white, with no
 * digits, no ticking and nothing red anywhere. It never says hurry, and it says
 * in words that running out cannot cost him anything, because a ten-year-old who
 * has been burned by a clock will not take that on trust from the colour scheme.
 *
 * `timed` is `settings.timersEnabled`, and when it is off there is no bar and no
 * timer at all — not a hidden one, not a long one. He simply answers.
 */

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export interface TackleBackProps {
  /** The budget this opponent allows, from `MatchState.tackleBackMs`. */
  ms: number
  /** `settings.timersEnabled`. False removes the clock entirely. */
  timed: boolean
  /** Dispatch `{ type: 'tackleBackTimeout' }`. Called at most once. */
  onExpire: () => void
}

export function TackleBack({ ms, timed, onExpire }: TackleBackProps) {
  // Held in a ref so a caller that rebuilds the handler every render cannot
  // restart the clock — a bar that silently began again would be the one thing
  // in here that could genuinely cost him something.
  const expire = useRef(onExpire)
  useEffect(() => {
    expire.current = onExpire
  }, [onExpire])

  // The clock only runs while he can see it. An iPad that goes to the home
  // screen suspends timers and fires them the instant the app comes back, so
  // a child who switched away for ten seconds mid-tackle-back returned to a
  // ball that had already gone — the one clock in the game, expiring while he
  // was not looking at it. Hidden pauses the clock; visible restarts it with
  // whatever budget was left. (The bar's animation is not paused to match: it
  // is decoration, and a bar that jumped backwards would read as a fault.)
  useEffect(() => {
    if (!timed) return
    let remaining = Math.max(0, ms)
    let startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | null = null

    const stop = (): void => {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
    }
    const run = (): void => {
      if (timer !== null) return
      startedAt = Date.now()
      timer = setTimeout(() => {
        timer = null
        expire.current()
      }, remaining)
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') stop()
      else run()
    }

    if (document.visibilityState !== 'hidden') run()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [timed, ms])

  return (
    <div className="w-full rounded-2xl bg-black/30 p-3.5 ring-1 ring-white/10">
      <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Tackle back</p>
      <p className="mt-1 text-lg leading-tight font-black">Get in and win it back.</p>
      <p className="mt-1 text-[13px] leading-snug text-white/60">
        {timed
          ? 'The ball’s already loose, so this bar can’t take anything off you.'
          : 'The ball’s already loose. Take as long as you like and go and get it.'}
      </p>

      {timed && (
        <div
          data-testid="tackleback-bar"
          role="progressbar"
          aria-label="Time to win the ball back"
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/12"
        >
          <motion.div
            className="h-full rounded-full bg-white/80"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            // Linear and unhurried. Nothing about the drawing of it accelerates
            // at the end, because a bar that lunges is a bar that panics him.
            transition={{ duration: Math.max(0, ms) / 1000, ease: 'linear' }}
          />
        </div>
      )}
    </div>
  )
}
