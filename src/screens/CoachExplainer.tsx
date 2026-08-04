/**
 * The Coach's explainer: six screens, once, after the country is built and
 * before the try-out.
 *
 * **The copy is the specification.** Every word on these screens is lifted
 * verbatim from `docs/content/coach-explainer.md`, which was written for one
 * ten-year-old and carries rules that this component only has to keep out of the
 * way of:
 *
 *  - *Six screens, hard maximum.* He will not read eight.
 *  - *Skippable from screen one.* A child who wants to play should be allowed to
 *    play, and having to tap through five screens of a grown-up explaining
 *    himself is exactly the thing that makes a game feel like homework.
 *  - *Never mentions rating numbers, Elo or standards.* Those exist. They are not
 *    what he needs on day one, and the test file enforces it rather than trusting
 *    a future edit to remember.
 *  - *The last screen is the important one.* You can lose and still climb, and
 *    taking the hard shot counts even when it misses. Those two ideas are the
 *    whole reason the rest of the game is built the way it is.
 *
 * **One idea per screen, and nothing else on it.** No illustrations competing
 * for attention, no progress percentage, no timer — just the Coach talking and
 * three buttons at the bottom where his thumb already is. The dots say where he
 * is in six, which is orientation rather than a target to hit.
 *
 * The animation is a single directional crossfade. It exists so that going back
 * feels like going back; anything more would be a thing to sit through six
 * times.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { getStore } from '../store/storage'

/** The stat glossary on screen three, in card order. */
const STAT_LINES: readonly [string, string][] = [
  ['PAC', 'how fast you know things without stopping to work them out'],
  ['SHO', 'shapes and angles'],
  ['PAS', 'word problems, the ones with a few steps'],
  ['DRI', 'fractions'],
  ['DEF', 'big numbers, place value, carrying and borrowing'],
  ['PHY', 'measuring: length, weight, time, area'],
]

interface CoachScreen {
  title: string
  body: ReactNode
  /** The primary button. Only screens one and six name their own. */
  forward?: string
}

const P = 'text-[15px] leading-relaxed text-white/85 sm:text-base'

const SCREENS: readonly CoachScreen[] = [
  {
    title: 'Welcome',
    // NOT "Start the try-out" — five screens follow this one, and a button that
    // promises a question and delivers more reading is a small lie told to a
    // child in the first ten seconds. The try-out is promised on the last
    // screen, where tapping actually starts it.
    forward: 'Go on then',
    body: (
      <>
        <p className={P}>Right. You&rsquo;re the manager, the captain and the whole squad.</p>
        <p className={P}>
          Your country is on the map now, and nobody has heard of you yet. That&rsquo;s the fun part
          &mdash; everyone starts there. Brazil started there.
        </p>
        <p className={P}>Let&rsquo;s find out what you can do.</p>
      </>
    ),
  },
  {
    title: 'The try-out',
    body: (
      <>
        <p className={P}>
          First, a scouting session. About twenty-four questions, ten minutes, no pressure and no
          score.
        </p>
        <p className={P}>
          It&rsquo;s not a test. I&rsquo;m just working out what you&rsquo;re already good at so I
          don&rsquo;t stick you in matches that are too easy or too hard.
        </p>
        <p className={P}>
          Some of it will be stuff you know cold. Some of it won&rsquo;t. Both are useful to me
          &mdash; get the ones you can and don&rsquo;t sweat the rest.
        </p>
      </>
    ),
  },
  {
    title: 'Your card',
    body: (
      <>
        <p className={P}>Afterwards you get a card, like the ones in FC. Six numbers:</p>
        <ul className="my-1 space-y-1.5">
          {STAT_LINES.map(([stat, meaning]) => (
            <li key={stat} className="flex gap-2.5 text-[15px] leading-snug text-white/85">
              <span className="w-10 shrink-0 font-black tracking-widest text-gold">{stat}</span>
              <span>{meaning}</span>
            </li>
          ))}
        </ul>
        <p className={P}>
          Every country has a card too. Before a match you can look at theirs. If Brazil&rsquo;s DRI
          is 92 and yours is 58, you know exactly where they&rsquo;re going to come at you &mdash;
          and exactly what to go practise.
        </p>
      </>
    ),
  },
  {
    title: 'How a match works',
    body: (
      <>
        <p className={P}>
          Fourteen questions. Get one right and you move up the pitch. Get to the top and you take
          your shot.
        </p>
        <p className={P}>
          Miss one and the ball comes loose &mdash; but it&rsquo;s not gone. I&rsquo;ll throw you a
          smaller question to win it back. Get that and you&rsquo;re straight back on the original
          one, and now you&rsquo;ve got the missing piece.
        </p>
        <p className={P}>
          Near misses count for something. If the answer&rsquo;s 42 and you say 43, that&rsquo;s a
          shot on target &mdash; the keeper just got a hand to it. Different from one that sails into
          the stands, and I&rsquo;ll tell you which it was.
        </p>
      </>
    ),
  },
  {
    title: 'Getting to the World Cup',
    body: (
      <>
        <p className={P}>
          You start ranked about 60th in the world. Nobody&rsquo;s afraid of you yet.
        </p>
        <p className={P}>
          Friendlies first, then qualifiers, then the World Cup. Win one and you get a star above
          your crest, forever. Brazil have five. Italy have four and didn&rsquo;t even make it this
          time &mdash; that&rsquo;s how hard it is.
        </p>
        <p className={P}>
          You can win your first one soon. You don&rsquo;t need to know everything to lift a trophy;
          you need to be solid at what you know. New stuff will show up through the year as
          you&rsquo;re ready for it, and it only ever opens up new tournaments &mdash; it never locks
          you out of the ones you&rsquo;ve earned.
        </p>
      </>
    ),
  },
  {
    title: 'The one that matters',
    forward: 'Let\u2019s go',
    body: (
      <>
        <p className={P}>Two things, then I&rsquo;ll leave you alone.</p>
        <p className={P}>
          <strong className="font-black text-gold">
            You can lose a match and still climb the rankings.
          </strong>{' '}
          Play well against a side better than you and you go <em>up</em>, even in defeat.
          That&rsquo;s not me being nice &mdash; that&rsquo;s how world rankings actually work.
        </p>
        <p className={P}>
          <strong className="font-black text-gold">
            Taking the hard shot counts even when it misses.
          </strong>{' '}
          When you&rsquo;re in front of goal you can play it safe or you can go for the bicycle kick.
          If you go for it and it doesn&rsquo;t come off, I&rsquo;ll still be clapping. That&rsquo;s
          the bit I care about most, and I&rsquo;m keeping score of it separately.
        </p>
        <p className={clsx(P, 'font-bold text-white')}>
          Nobody&rsquo;s good at this on day one. Come on.
        </p>
      </>
    ),
  },
]

export const SCREEN_COUNT = SCREENS.length

export interface CoachExplainerProps {
  /** Called once he is through, however he got through. Advances to the try-out. */
  onDone?: () => void
  /** Re-reading it later, from the Coach button. Nothing is written on the way out. */
  replay?: boolean
}

export function CoachExplainer({ onDone, replay }: CoachExplainerProps) {
  const [index, setIndex] = useState(0)
  /** −1 or 1, so the crossfade knows which way he is travelling. */
  const [direction, setDirection] = useState(1)

  const screen = SCREENS[index]!
  const last = index === SCREENS.length - 1

  const leave = (): void => {
    // Skipping and finishing are the same event as far as the flag is
    // concerned: he has been offered the explanation and it is now his.
    if (replay !== true) getStore().updateSettings({ coachExplainerSeen: true })
    onDone?.()
  }

  const go = (step: number): void => {
    setDirection(step)
    setIndex((current) => Math.min(SCREENS.length - 1, Math.max(0, current + step)))
  }

  return (
    <div className="flex min-h-full flex-col bg-pitch-dark text-white">
      <header className="px-5 pt-8">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">The Coach</p>
          <ol
            aria-label={`Screen ${index + 1} of ${SCREENS.length}`}
            className="flex items-center gap-1.5"
          >
            {SCREENS.map((s, i) => (
              <li
                key={s.title}
                aria-hidden="true"
                className={clsx(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-5 bg-gold' : 'w-1.5 bg-white/25',
                )}
              />
            ))}
          </ol>
        </div>
      </header>

      {/* The body scrolls if it has to — screens three and five are the long
          ones — while the buttons stay pinned where his thumb is. */}
      <main className="flex flex-1 items-center overflow-y-auto px-5 py-6">
        <div className="mx-auto w-full max-w-md">
          {/* Keyed on the index, so each screen is a fresh element that slides in
              from the side he is travelling from. No exit animation: waiting for
              one to finish before the next screen appears is a delay he would
              feel five times, and it is the Coach talking rather than a
              carousel. */}
          <motion.section
            key={index}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            <h1 className="text-3xl font-black text-balance">{screen.title}</h1>
            {screen.body}
          </motion.section>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-white/10 bg-pitch-dark/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          {/* Above the primary button rather than below it, which is the
              opposite of where it looks like it belongs and is deliberate. The
              country creator's "Take the field" sits at the very bottom of the
              screen before this one; whatever lands there catches a stray second
              tap. Putting the primary button in that spot means an impatient
              double-tap advances one screen, and putting skip there means it
              throws the whole explainer away. Available from screen one either
              way, which is the rule that actually matters. */}
          {!last && (
            <button
              type="button"
              onClick={leave}
              className="h-11 w-full rounded-xl text-sm font-semibold text-white/55"
            >
              {index === 0 ? 'Skip — I know how this works' : 'Skip'}
            </button>
          )}

          <div className="flex gap-3">
            {index > 0 && (
              <motion.button
                type="button"
                onClick={() => go(-1)}
                whileTap={{ scale: 0.96 }}
                className="h-14 flex-1 rounded-2xl bg-white/10 text-lg font-bold text-white ring-1 ring-white/15"
              >
                Back
              </motion.button>
            )}
            <motion.button
              type="button"
              onClick={() => (last ? leave() : go(1))}
              whileTap={{ scale: 0.97 }}
              className="h-14 flex-[2] rounded-2xl bg-gold text-lg font-black text-ink"
            >
              {screen.forward ?? 'Next'}
            </motion.button>
          </div>
        </div>
      </footer>
    </div>
  )
}
