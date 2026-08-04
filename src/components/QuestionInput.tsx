/**
 * The answer box, and the only place in the game where a question is answered.
 *
 * **There is no clock in here, and there is not going to be one.** Unfinished
 * *timed* assignments cost this child recess last year and produced meltdowns,
 * and a countdown sitting beside the question is the exact shape of that. Speed
 * still matters to the card — PAC is fluency — so latency is measured, from
 * mount to submit, and handed to the caller without ever being drawn. He is
 * timed the way a striker is timed: by what the stats say afterwards, never by a
 * clock ticking down while he thinks. The two places a visible clock is allowed
 * — the tackle-back and the penalties — are different components, and both are
 * situations where running out can only fail to *gain* him something rather than
 * take away something he already holds.
 *
 * **Two ways in, because there are two iPads.** With a hardware keyboard he
 * types and presses Enter, and the field takes focus on mount so that works
 * without a tap first. Without one, the on-screen numpad is the keyboard: it
 * carries the digits plus the three symbols an answer in this game can need —
 * `/` for a fraction, `.` for a decimal, `-` for a negative. `inputMode="none"`
 * suppresses the system keyboard, because iPadOS raising its own numeric pad
 * over ours would cover half the screen with a second, worse copy of it.
 *
 * **Nothing here judges the answer.** No filtering of what may be typed, no
 * normalisation, no correctness. `normaliseInput` already understands unicode
 * minus signs and division slashes; a filter in here that swallowed them would
 * take away a right answer before that code ever saw it. The raw string goes to
 * the caller exactly as it was typed.
 *
 * **An empty submit costs nothing.** A stray Enter, or a tap on the submit key
 * with an empty box, does nothing at all: no attempt, no error, no red. There is
 * nothing to be told off about, so nothing says anything.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

/**
 * Long enough for any answer the generators can ask for — the widest is a
 * four-digit product or a fraction like `-123/456` — and short enough that a
 * child leaning on a key cannot fill the field with a thousand nines.
 */
const MAX_LENGTH = 16

/** Where `promptWithSlot` says the answer box goes. */
const SLOT = '{}'

const now = (): number => performance.now()

interface NumpadKey {
  /** What is printed on the key. */
  face: string
  /** What it types, when it types something. */
  types?: string
  /** Screen-reader name. Defaults to the face, which is right for the digits. */
  name?: string
  action?: 'backspace' | 'submit'
  /** Grid span, for the wide submit key. */
  wide?: boolean
}

/**
 * Laid out like a phone keypad rather than like a calculator — 1 at the top —
 * because that is what the iPad's own numeric pad does, and the muscle memory
 * he already has should not be argued with.
 *
 * The symbols sit down the right-hand edge in the order he will reach for them,
 * and the submit key is the widest thing on the pad and the only gold one.
 */
const KEYS: NumpadKey[] = [
  { face: '1', types: '1' },
  { face: '2', types: '2' },
  { face: '3', types: '3' },
  { face: '⌫', name: 'Backspace', action: 'backspace' },

  { face: '4', types: '4' },
  { face: '5', types: '5' },
  { face: '6', types: '6' },
  { face: '/', types: '/', name: 'Fraction bar' },

  { face: '7', types: '7' },
  { face: '8', types: '8' },
  { face: '9', types: '9' },
  { face: '.', types: '.', name: 'Decimal point' },

  { face: '−', types: '-', name: 'Minus' },
  { face: '0', types: '0' },
  { face: 'Enter', name: 'Submit answer', action: 'submit', wide: true },
]

export interface QuestionInputProps {
  /** The full question, as the film room and the tutor also show it. */
  prompt: string
  /**
   * The same question with `{}` where the answer goes, when the item wants the
   * box inside the expression. Optional: most items do not need it.
   */
  promptWithSlot?: string
  /** The raw string, exactly as typed, and how long it took to arrive. */
  onSubmit: (given: string, latencyMs: number) => void
  /**
   * Locks the field while the caller is showing the result of the last answer.
   * Without it a child who presses Enter twice answers the next question with
   * the last one's keystroke.
   */
  disabled?: boolean
}

export function QuestionInput({ prompt, promptWithSlot, onSubmit, disabled }: QuestionInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * When this question was put in front of him.
   *
   * A caller that gives each item a fresh `key` gets a fresh component and a
   * fresh clock, which is the intended use. Restarting it on submit as well
   * means a caller that keeps one instance across two questions still measures
   * each question rather than the whole session.
   */
  const startedAt = useRef(now())
  const promptId = useId()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (): void => {
    if (disabled) return
    // Nothing at all happens on an empty submit. Not an error, not a shake.
    if (value.trim().length === 0) return
    const latencyMs = Math.max(0, Math.round(now() - startedAt.current))
    setValue('')
    startedAt.current = now()
    inputRef.current?.focus()
    onSubmit(value, latencyMs)
  }

  const append = (text: string): void => {
    if (disabled) return
    setValue((current) => (current + text).slice(0, MAX_LENGTH))
    inputRef.current?.focus()
  }

  const backspace = (): void => {
    if (disabled) return
    setValue((current) => current.slice(0, -1))
    inputRef.current?.focus()
  }

  const inline = promptWithSlot !== undefined && promptWithSlot.includes(SLOT)
  const cut = inline ? promptWithSlot.indexOf(SLOT) : -1

  const box = (
    <input
      ref={inputRef}
      type="text"
      aria-labelledby={promptId}
      value={value}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value.slice(0, MAX_LENGTH))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        submit()
      }}
      // The numpad below is the on-screen keyboard for this field; iPadOS
      // raising a second one over it would hide the thing it duplicates.
      inputMode="none"
      // `type="number"` would refuse `1/2` outright and add spinner arrows a
      // thumb can hit by accident, so this is a text field that happens to hold
      // numbers. Autocorrect and capitalisation have nothing useful to say
      // about an answer and can only get in the way.
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      maxLength={MAX_LENGTH}
      className={clsx(
        'rounded-2xl border-2 border-gold bg-white/10 text-center font-bold text-white',
        'caret-gold focus:border-gold focus:ring-4 focus:ring-gold/40 focus:outline-none',
        'disabled:opacity-60',
        inline ? 'h-16 w-28 text-3xl' : 'h-20 w-full max-w-sm text-4xl',
      )}
    />
  )

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p
        id={promptId}
        className={clsx(
          'w-full text-center font-bold text-balance',
          // Inline, the expression below *is* the question, so the sentence
          // steps back to being the instruction that sits over it.
          inline ? 'text-base text-white/60' : 'text-2xl text-white',
        )}
      >
        {prompt}
      </p>

      {inline ? (
        <div
          data-testid="answer-slot"
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-4xl font-black text-white"
        >
          <span>{promptWithSlot.slice(0, cut)}</span>
          {box}
          <span>{promptWithSlot.slice(cut + SLOT.length)}</span>
        </div>
      ) : (
        box
      )}

      {/* Fits inside 375px with room either side, and every key clears a
          44px touch target by a wide margin. */}
      <div className="grid w-full max-w-sm grid-cols-4 gap-2">
        {KEYS.map((key) => (
          <motion.button
            key={key.face}
            type="button"
            aria-label={key.name ?? key.face}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              if (key.action === 'submit') submit()
              else if (key.action === 'backspace') backspace()
              else if (key.types !== undefined) append(key.types)
            }}
            className={clsx(
              'flex h-16 items-center justify-center rounded-2xl font-bold transition-colors',
              key.action === 'submit'
                ? 'col-span-2 bg-gold text-xl text-ink'
                : 'bg-white/10 text-2xl text-white ring-1 ring-white/15 active:bg-white/20',
              disabled && 'pointer-events-none opacity-40',
            )}
          >
            {key.face}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
