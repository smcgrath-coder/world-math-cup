/**
 * The answer options, for a question that is picked rather than typed.
 *
 * A sibling of `QuestionInput` rather than a branch inside it. Everything that
 * file promises holds here too — no clock, nothing in here judges the answer, an
 * empty submit costs nothing — but a numpad and a set of options share no markup
 * worth reusing, and folding both into one component would mean two layouts
 * behind a flag.
 *
 * **Tap to choose, then commit.** Not one-tap-commit, which is the obvious
 * design and the wrong one here. The numpad's rhythm is already type-then-Enter,
 * so a screen where one touch instantly ends the possession would be the only
 * place in the game where a slip of the thumb costs something — and this is a
 * game built for a child who freezes when a mistake can take away something he
 * already holds. Choosing is reversible right up until he says he means it.
 *
 * **Options are never reordered.** They arrive in the order the generator set
 * and are rendered in it. Shuffling per render would move the answer under his
 * thumb between one render and the next; shuffling per item is the generator's
 * job, where it can be tested.
 *
 * **The number keys work.** One of the two iPads has a keyboard, and a child who
 * has just typed four answers should not have to reach for the screen on the
 * fifth. `1`–`9` select, Enter commits.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

const now = (): number => performance.now()

/** More than this and the digit shortcuts stop being reachable in one press. */
const MAX_SHORTCUTS = 9

export interface ChoiceInputProps {
  /** The full question, as the film room and the tutor also show it. */
  prompt: string
  /** In the generator's order. Never reordered here. */
  options: readonly string[]
  /** The option text exactly as given, and how long it took to arrive. */
  onSubmit: (given: string, latencyMs: number) => void
  /**
   * Locks the options while the caller is showing the result of the last answer,
   * for the same reason the numpad has it: a held Enter must not answer the next
   * question with this one's keystroke.
   */
  disabled?: boolean
}

export function ChoiceInput({ prompt, options, onSubmit, disabled }: ChoiceInputProps) {
  const [chosen, setChosen] = useState<number | null>(null)
  const startedAt = useRef(now())
  const promptId = useId()
  const groupRef = useRef<HTMLDivElement>(null)

  // Focus the group, not an option: focusing the first one would make it look
  // chosen before he has chosen anything.
  useEffect(() => {
    groupRef.current?.focus()
  }, [])

  const submit = (index: number | null): void => {
    if (disabled) return
    // Nothing at all happens with nothing selected. Not an error, not a shake.
    if (index === null) return
    const given = options[index]
    if (given === undefined) return
    const latencyMs = Math.max(0, Math.round(now() - startedAt.current))
    setChosen(null)
    startedAt.current = now()
    onSubmit(given, latencyMs)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (disabled) return
    if (event.key === 'Enter') {
      event.preventDefault()
      submit(chosen)
      return
    }
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= Math.min(options.length, MAX_SHORTCUTS)) {
      event.preventDefault()
      setChosen(digit - 1)
    }
  }

  /**
   * Two options go side by side; more stack.
   *
   * True and False are a pair and read as one either/or when they sit together.
   * Three or more in a row would make each button too narrow for the text, so
   * they become a list.
   */
  const paired = options.length === 2

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p id={promptId} className="w-full text-center text-2xl font-bold text-white text-balance">
        {prompt}
      </p>

      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={promptId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="choices"
        className={clsx(
          'w-full max-w-sm gap-3 focus:outline-none',
          paired ? 'grid grid-cols-2' : 'flex flex-col',
        )}
      >
        {options.map((option, index) => (
          <motion.button
            key={option}
            type="button"
            role="radio"
            aria-checked={chosen === index}
            disabled={disabled}
            onClick={() => setChosen(index)}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              // Comfortably past a 44px touch target, and the same height
              // whether chosen or not so nothing moves when he picks.
              'min-h-16 rounded-2xl px-4 py-3 text-xl font-bold break-words',
              'disabled:opacity-60',
              chosen === index
                ? 'bg-white/20 text-white ring-4 ring-gold'
                : 'bg-black/25 text-white ring-1 ring-white/15 active:bg-black/40',
            )}
          >
            {option}
          </motion.button>
        ))}
      </div>

      <motion.button
        type="button"
        onClick={() => submit(chosen)}
        disabled={disabled || chosen === null}
        whileTap={{ scale: 0.98 }}
        data-testid="choice-submit"
        className={clsx(
          'h-16 w-full max-w-sm rounded-2xl text-xl font-black',
          // Dimmed rather than hidden until something is chosen: a button that
          // appears out of nowhere is a button he has to find.
          chosen === null
            ? 'bg-gold/30 text-ink/50'
            : 'bg-gold text-ink',
        )}
      >
        That one
      </motion.button>
    </div>
  )
}
