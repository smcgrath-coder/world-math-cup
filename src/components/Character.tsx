import { useState } from 'react'
import clsx from 'clsx'

/**
 * A character illustration, which is allowed to not exist.
 *
 * The art lands in batches — six of fourteen at the time of writing, the eight
 * captains still to come — so every screen that draws one has to look finished
 * without it. A missing file must render as nothing at all: no broken-image
 * icon, no reserved gap that collapses when the rest arrives.
 *
 * So it starts hidden and fades in on `load`, rather than starting visible and
 * hiding on `error`. Same end state when the file is there, and no flash of a
 * broken icon when it is not.
 *
 * Decorative by default. These illustrate what the surrounding text already
 * says, and a screen reader announcing "boy in a blue kit standing" before the
 * question is noise. Pass `alt` only where the picture carries something the
 * words do not.
 */
export type CharacterName =
  | 'rion-portrait'
  | 'rion-celebration'
  | 'rion-ready'
  | 'coach'
  | 'analyst-thinking'
  | 'analyst-explaining'

export interface CharacterProps {
  name: CharacterName
  /** Omit for decoration, which is the usual case. */
  alt?: string
  className?: string
}

export function Character({ name, alt, className }: CharacterProps) {
  const [state, setState] = useState<'loading' | 'shown' | 'missing'>('loading')

  if (state === 'missing') return null

  return (
    <img
      src={`/art/${name}.png`}
      alt={alt ?? ''}
      aria-hidden={alt === undefined ? true : undefined}
      data-testid={`character-${name}`}
      onLoad={() => setState('shown')}
      onError={() => setState('missing')}
      className={clsx(
        'pointer-events-none select-none',
        // Opacity rather than `hidden`, so the layout it will occupy is settled
        // before it appears and nothing jumps when it does.
        state === 'shown' ? 'opacity-100' : 'opacity-0',
        'transition-opacity duration-300',
        className,
      )}
    />
  )
}
