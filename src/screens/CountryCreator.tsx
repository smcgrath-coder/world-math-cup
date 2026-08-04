/**
 * The country creator: the first screen of the game, and the first thing he
 * touches — before the try-out, before any maths.
 *
 * It has one job beyond collecting a `Country`, which is to make him want to
 * keep going. He asked for this screen specifically, and it is the autonomy
 * lever in the whole design: the part that is unmistakably his. So the bias
 * throughout is towards *his* choices sticking and never being told no.
 *
 * **One page, not a wizard.** The steps run top to bottom — name, shape,
 * colours, badge, kit — but they are all on screen at once, with the flag and
 * crest pinned above them. A wizard would add navigation to learn and would
 * make going back to change the colour he regrets a chore; a child fiddles,
 * and fiddling should be free. It also means every control is reachable in one
 * scroll on an iPad, which is where this will mostly be used.
 *
 * **Nothing here refuses him.** The only thing that can block the button is a
 * missing name, and that is because a country needs one, not because the input
 * disliked what he typed. There is deliberately no profanity filter: a false
 * positive on a word he invented would be a worse failure than the thing it
 * would be trying to prevent, and it is a parenting matter rather than a
 * software one.
 *
 * **Choices that would break the flag are repaired, not rejected.** Changing
 * the shape can put two identical colours next to each other, and recolouring a
 * band can swallow the badge sitting on it. Both are fixed silently by
 * `reconcileFlag`, because he did nothing wrong in either case.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { ChargeGlyph, CrestPreview, FlagPreview } from '../country/FlagPreview'
import {
  CHARGES,
  CHARGE_LABELS,
  DEFAULT_FLAG,
  LAYOUTS,
  LAYOUT_LABELS,
  LAYOUT_SLOT_LABELS,
  chargeColorOptions,
  colorOptionsForSlot,
  contrastRatio,
  reconcileFlag,
} from '../country/flag'
import type { FlagSpec } from '../country/flag'
import { getStore } from '../store/storage'
import type { Country } from '../store/storage'

/**
 * Long enough for "Riondia the Great", short enough that it cannot wreck the
 * card, the bracket or the commentary line. Enforced on the value rather than
 * only through `maxlength`, so a paste is capped too.
 */
const MAX_NAME = 20

const WHITE = '#FFFFFF'
const BLACK = '#171717'
const GOLD = '#FACC15'

/**
 * `--color-pitch-dark`, as a value the SVG renderer can be handed.
 *
 * The detail on a charge is painted in the colour behind it, so the badge
 * picker has to say what its buttons are sitting on — otherwise the football
 * loses its panels and the bear loses its eyes.
 */
const PICKER_BACKDROP = '#14532D'

// ---------------------------------------------------------------------------
// Kit

interface KitOption {
  id: string
  label: string
  shirt: string
  trim: string
}

/**
 * Kits, derived from the flag rather than chosen separately.
 *
 * Football teams are recognised by kit, not by an accurate flag, and a kit that
 * has nothing to do with his flag would break that link on the very screen that
 * establishes it. Stored as an id rather than as a colour pair, so recolouring
 * the flag moves the kit with it instead of stranding it on a colour that is no
 * longer anywhere.
 */
function kitOptions(spec: FlagSpec): KitOption[] {
  const slots = LAYOUT_SLOT_LABELS[spec.layout].length
  const visible = [...new Set(spec.colors.slice(0, slots))]
  const primary = visible[0]
  // A plain flag has only one colour to give, so the trim comes from whichever
  // neutral actually shows up against it.
  const secondary =
    visible.find((hex) => hex !== primary) ?? (contrastRatio(primary, WHITE) >= 3 ? WHITE : BLACK)
  const against = (shirt: string): string => (shirt === primary ? secondary : primary)

  const candidates: KitOption[] = [
    { id: 'home', label: 'Home', shirt: primary, trim: secondary },
    { id: 'away', label: 'Away', shirt: secondary, trim: primary },
    { id: 'white', label: 'White', shirt: WHITE, trim: against(WHITE) },
    { id: 'dark', label: 'Dark', shirt: BLACK, trim: against(BLACK) },
    { id: 'gold', label: 'Gold', shirt: GOLD, trim: against(GOLD) },
  ]

  const out: KitOption[] = []
  for (const kit of candidates) {
    if (kit.shirt === kit.trim) continue
    if (out.some((seen) => seen.shirt === kit.shirt && seen.trim === kit.trim)) continue
    out.push(kit)
  }
  return out
}

function Jersey({ shirt, trim }: { shirt: string; trim: string }) {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
      <path
        d="M24,8L32,12L40,8L58,16L52,30L48,26L48,58L16,58L16,26L12,30L6,16Z"
        fill={shirt}
        // A mid grey, so the outline holds against both a white shirt and a
        // black one. A dark outline loses the dark kit entirely on this screen.
        stroke="#94A3B8"
        strokeWidth="1.5"
      />
      <path d="M24,8L32,12L40,8L38,17L26,17Z" fill={trim} />
      <rect x="16" y="51" width="32" height="7" fill={trim} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Pieces

/** Every control on this screen. Big, and it acknowledges a tap. */
function TapButton({
  label,
  selected,
  onClick,
  className,
  children,
}: {
  label: string
  selected: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className={clsx(
        'flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors',
        // Touch targets sized for a ten-year-old's thumb on an iPad, and a
        // selected state that survives being looked at from an angle.
        selected ? 'bg-white/20 ring-4 ring-gold' : 'bg-white/5 ring-2 ring-white/10',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

function Step({
  index,
  title,
  hint,
  children,
}: {
  index: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="py-5">
      <h2 className="mb-1 flex items-baseline gap-2 text-lg font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-sm text-ink">
          {index}
        </span>
        {title}
      </h2>
      {hint !== undefined && <p className="mb-3 text-sm text-white/60">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Swatches({
  label,
  options,
  selected,
  onPick,
}: {
  label: string
  options: readonly { id: string; name: string; hex: string }[]
  selected: string
  onPick: (hex: string) => void
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold text-white/70">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((colour) => (
          <motion.button
            key={colour.id}
            type="button"
            aria-label={colour.name}
            aria-pressed={selected === colour.hex}
            onClick={() => onPick(colour.hex)}
            whileTap={{ scale: 0.9 }}
            style={{ backgroundColor: colour.hex }}
            // A light ring, so a dark colour on this dark screen still reads as
            // a filled chip rather than as an empty slot.
            className={clsx(
              'h-12 w-12 rounded-xl ring-2 ring-white/30',
              selected === colour.hex && 'ring-4 ring-gold',
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface CountryCreatorProps {
  /** Handed the finished country, so the app can move on to the try-out. */
  onComplete?: (country: Country) => void
}

export function CountryCreator({ onComplete }: CountryCreatorProps) {
  const [name, setName] = useState('')
  const [spec, setSpec] = useState<FlagSpec>(DEFAULT_FLAG)
  const [kitId, setKitId] = useState('home')
  const [nameMissing, setNameMissing] = useState(false)

  const kits = kitOptions(spec)
  const kit = kits.find((option) => option.id === kitId) ?? kits[0]
  const slotLabels = LAYOUT_SLOT_LABELS[spec.layout]
  const badgeColours = chargeColorOptions(spec)

  /** Every change goes through here, so the repair rules cannot be forgotten. */
  const update = (patch: Partial<FlagSpec>): void => {
    setSpec((current) => reconcileFlag({ ...current, ...patch }))
  }

  const setColorAt = (slot: number, hex: string): void => {
    const colors: [string, string, string] = [...spec.colors]
    colors[slot] = hex
    update({ colors })
  }

  const rename = (value: string): void => {
    setName(value.slice(0, MAX_NAME))
    setNameMissing(false)
  }

  const takeTheField = (): void => {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameMissing(true)
      return
    }
    const country: Country = {
      name: trimmed,
      flag: spec,
      kit: [kit.shirt, kit.trim],
      stars: 0,
    }
    getStore().setCountry(country)
    onComplete?.(country)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-full bg-pitch-dark text-white"
    >
      {/* The preview stays put while he scrolls the controls: every tap below
          has to show its result without him having to go and look for it. */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-pitch-dark/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <FlagPreview
            spec={spec}
            width={168}
            label="Your flag"
            className="w-28 rounded-lg shadow-lg ring-1 ring-white/25 sm:w-42"
          />
          <CrestPreview spec={spec} width={72} label="Your crest" className="w-14 sm:w-18" />
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-wide text-white/50 uppercase">Your country</p>
            <p
              className={clsx(
                'truncate text-2xl font-bold',
                name.trim().length === 0 && 'text-white/35',
              )}
            >
              {name.trim().length === 0 ? 'Name it below' : name.trim()}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl divide-y divide-white/10 px-4 pb-40">
        <h1 className="pt-6 text-3xl font-black">Build your country</h1>

        <Step index={1} title="Name your country" hint="Anything you like. It's yours.">
          <input
            id="country-name"
            aria-label="Country name"
            aria-invalid={nameMissing}
            value={name}
            onChange={(event) => rename(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            placeholder="Riondia"
            maxLength={MAX_NAME}
            // A name he made up is not a spelling mistake, and autocorrect
            // rewriting it as he types would be its own small insult.
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="done"
            className={clsx(
              'w-full rounded-2xl border-2 bg-white/10 px-4 py-4 text-2xl font-bold placeholder:text-white/30',
              nameMissing ? 'border-gold' : 'border-white/15',
            )}
          />
        </Step>

        <Step index={2} title="Pick a flag shape">
          <div className="flex flex-wrap gap-3">
            {LAYOUTS.map((layout) => (
              <TapButton
                key={layout}
                label={LAYOUT_LABELS[layout]}
                selected={spec.layout === layout}
                onClick={() => update({ layout })}
                className="w-28 p-2"
              >
                {/* The thumbnail is reconciled too, so it shows what he would
                    actually get rather than what the raw switch would make. */}
                <FlagPreview spec={reconcileFlag({ ...spec, layout })} width={96} className="rounded" />
                <span className="text-xs font-semibold">{LAYOUT_LABELS[layout]}</span>
              </TapButton>
            ))}
          </div>
        </Step>

        <Step index={3} title="Choose your colours">
          {slotLabels.map((slotLabel, slot) => (
            <Swatches
              key={slotLabel}
              label={slotLabel}
              options={colorOptionsForSlot(spec, slot)}
              selected={spec.colors[slot]}
              onPick={(hex) => setColorAt(slot, hex)}
            />
          ))}
        </Step>

        <Step index={4} title="Add a badge">
          <div className="mb-5 flex flex-wrap gap-2">
            {CHARGES.map((charge) => (
              <TapButton
                key={charge}
                label={CHARGE_LABELS[charge]}
                selected={spec.charge === charge}
                onClick={() => update({ charge })}
                className="h-16 w-16"
              >
                {charge === 'none' ? (
                  <span className="text-xs font-semibold text-white/70">None</span>
                ) : (
                  // Always drawn in white here: this control picks the shape,
                  // and its own colour is the next one along.
                  <ChargeGlyph
                    charge={charge}
                    color={WHITE}
                    field={PICKER_BACKDROP}
                    size={36}
                  />
                )}
              </TapButton>
            ))}
          </div>
          {spec.charge !== 'none' && (
            <Swatches
              label="Badge colour"
              options={badgeColours}
              selected={spec.chargeColor}
              onPick={(hex) => update({ chargeColor: hex })}
            />
          )}
        </Step>

        <Step index={5} title="Pick your kit" hint="This is what you'll wear on the pitch.">
          <div role="group" aria-label="Kit" className="flex flex-wrap gap-3">
            {kits.map((option) => (
              <TapButton
                key={option.id}
                label={option.label}
                selected={kit.id === option.id}
                onClick={() => setKitId(option.id)}
                className="w-24 p-3"
              >
                <Jersey shirt={option.shirt} trim={option.trim} />
                <span className="text-xs font-semibold">{option.label}</span>
              </TapButton>
            ))}
          </div>
        </Step>
      </main>

      <div className="sticky bottom-0 border-t border-white/10 bg-pitch-dark/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {nameMissing && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 text-center font-semibold text-gold"
            >
              Your country needs a name first.
            </motion.p>
          )}
          <motion.button
            type="button"
            onClick={takeTheField}
            whileTap={{ scale: 0.97 }}
            className="h-16 w-full rounded-2xl bg-gold text-xl font-black text-ink"
          >
            Take the field
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
