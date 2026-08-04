/**
 * React's view of a flag: a thin wrapper over the string renderer in `flag.ts`.
 *
 * The drawing is handed to the browser as an image, not spliced into the
 * document as markup. That was a deliberate choice over the two obvious ones.
 *
 * Setting the generated string as inner HTML would work — every value that
 * reaches it is already checked against a closed vocabulary or six hex digits —
 * but it makes the whole safety argument rest on that checking staying correct
 * forever, in a file that will keep growing new charges. Re-drawing the same
 * shapes as JSX would be safe by construction, but it means two renderers for
 * one flag, and the day the bracket icon needs a data URI or the crest is
 * rasterised, they start to drift.
 *
 * An image keeps the single renderer and gives up nothing: an SVG loaded
 * through `<img>` is an independent, script-disabled document by specification,
 * so even a future bug in colour validation could not put an element or a
 * handler into this page. `alt` then carries the accessible name for free.
 *
 * The country name is not passed to the renderer by any of these — it goes into
 * `alt`, which React sets as an attribute value, so it stays text.
 */

import { chargeSvg, crestSvg, flagSvg } from './flag'
import type { Charge, FlagSpec } from './flag'

/**
 * Percent-encoded rather than base64: it is a third of the cost to produce, it
 * stays readable in devtools, and `encodeURIComponent` escapes the `#` in every
 * colour — which, left raw, would truncate the URI at the first fill.
 */
const toDataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`

interface PreviewProps {
  /** Names the image for a screen reader. Omit when it is pure decoration. */
  label?: string
  className?: string
}

export interface FlagPreviewProps extends PreviewProps {
  spec: FlagSpec
  width?: number
  height?: number
}

export function FlagPreview({ spec, width, height, label, className }: FlagPreviewProps) {
  return (
    <img
      src={toDataUri(flagSvg(spec, { width, height }))}
      alt={label ?? ''}
      className={className}
      draggable={false}
    />
  )
}

export interface CrestPreviewProps extends PreviewProps {
  spec: FlagSpec
  /** World Cups won. Worn above the shield. */
  stars?: number
  width?: number
}

export function CrestPreview({ spec, stars, width, label, className }: CrestPreviewProps) {
  return (
    <img
      src={toDataUri(crestSvg(spec, { width, stars }))}
      alt={label ?? ''}
      className={className}
      draggable={false}
    />
  )
}

export interface ChargeGlyphProps extends PreviewProps {
  charge: Charge
  color: string
  size?: number
}

export function ChargeGlyph({ charge, color, size, label, className }: ChargeGlyphProps) {
  return (
    <img
      src={toDataUri(chargeSvg(charge, color, { size }))}
      alt={label ?? ''}
      className={className}
      draggable={false}
    />
  )
}
