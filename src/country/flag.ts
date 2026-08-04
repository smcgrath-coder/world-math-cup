/**
 * The flag designer: a vocabulary of layouts, charges and colours, and a pure
 * function from a chosen combination to SVG.
 *
 * This is the first thing the game asks him to do, before any maths, and the
 * one part of it that is unmistakably his. Three decisions follow from that.
 *
 * **The palette is curated, not open.** Sixteen colours, chosen so that any two
 * of them look deliberate side by side. A free colour wheel in the hands of a
 * ten-year-old produces mud, and a flag he thinks looks bad is worse than no
 * flag at all — it is the opposite of the pride this screen exists to create.
 * The constraint is the feature: every combination he can reach looks designed.
 *
 * **Nothing unreadable is reachable.** A dark charge on a dark field is a badge
 * that disappeared, and he will read that as *he* made something bad rather
 * than as a missing guard rail. So the charge colours on offer are filtered by
 * real contrast against the exact region the charge sits on, and a colour that
 * stops working when he changes the field behind it is replaced rather than
 * left to vanish.
 *
 * **The output is a string, not a component.** The same flag has to appear as a
 * 600px preview, a crest on his card, and a 24px icon in a tournament bracket,
 * and eventually outside React entirely. One renderer with one viewBox means
 * those can never drift apart; a second, JSX implementation for the React case
 * would be exactly such a drift waiting to happen. `FlagPreview` hands this
 * string to the browser as an image rather than as markup, so the trust
 * question never arises there — see that file.
 *
 * It is still built from closed vocabularies only: layout and charge are looked
 * up in exhaustive records and fall back when unrecognised, and every colour
 * must match six hex digits or it is replaced. Nothing else varies. In
 * particular the *country name never reaches this file* — it is text, it
 * belongs in the DOM as text, and there is no element here that would hold it.
 */

// ---------------------------------------------------------------------------
// Vocabulary

export type FlagLayout =
  | 'solid'
  | 'bands-h'
  | 'bands-v'
  | 'nordic'
  | 'diagonal'
  | 'quarters'
  | 'saltire'

export type Charge =
  | 'none'
  | 'star'
  | 'sun'
  | 'crescent'
  | 'bolt'
  | 'flame'
  | 'mountain'
  | 'wave'
  | 'tree'
  | 'leaf'
  | 'snowflake'
  | 'ball'
  | 'boot'
  | 'trophy'
  | 'crown'
  | 'shield'
  | 'anchor'
  | 'bear'
  | 'eagle'
  | 'wolf'

export interface FlagSpec {
  layout: FlagLayout
  /** Three slots. How many of them a layout paints is its own business. */
  colors: [string, string, string]
  charge: Charge
  chargeColor: string
}

export interface PaletteColor {
  id: string
  /** What he sees on the swatch. */
  name: string
  hex: string
}

/**
 * Sixteen colours: three neutrals and thirteen hues spread far enough apart
 * that no two of them read as the same colour in touching regions of a flag.
 * The spacing is enforced by a test, so a seventeenth colour cannot be dropped
 * in next to an existing one without saying so out loud.
 *
 * Two of these were moved by that test rather than by eye. Silver started three
 * shades lighter and sat too close to white — a silver band beside a white one
 * looked like a printing fault rather than a design. Black started as a
 * blue-tinted slate, which put it next to navy; a neutral black is far enough
 * from navy that a flag using both still reads as two colours.
 *
 * Pine was moved for a different reason: it was `--color-pitch-dark` exactly,
 * so on the creator's own background its swatch rendered as a hole rather than
 * as a colour. A palette entry that is invisible against the app's chrome is a
 * choice he cannot see he has.
 */
export const PALETTE: readonly PaletteColor[] = [
  { id: 'white', name: 'White', hex: '#FFFFFF' },
  { id: 'silver', name: 'Silver', hex: '#94A3B8' },
  { id: 'black', name: 'Black', hex: '#171717' },
  { id: 'red', name: 'Red', hex: '#E11D2E' },
  { id: 'maroon', name: 'Maroon', hex: '#6B0F1A' },
  { id: 'orange', name: 'Orange', hex: '#F97316' },
  { id: 'gold', name: 'Gold', hex: '#FACC15' },
  { id: 'lime', name: 'Lime', hex: '#84CC16' },
  { id: 'green', name: 'Green', hex: '#16A34A' },
  { id: 'pine', name: 'Pine', hex: '#166534' },
  { id: 'teal', name: 'Teal', hex: '#0D9488' },
  { id: 'sky', name: 'Sky', hex: '#38BDF8' },
  { id: 'blue', name: 'Blue', hex: '#1D4ED8' },
  { id: 'navy', name: 'Navy', hex: '#0B2A5B' },
  { id: 'purple', name: 'Purple', hex: '#7C3AED' },
  { id: 'pink', name: 'Pink', hex: '#EC4899' },
]

export const LAYOUTS: readonly FlagLayout[] = [
  'bands-h',
  'bands-v',
  'nordic',
  'saltire',
  'diagonal',
  'quarters',
  'solid',
]

/** Named for a ten-year-old, not for a vexillologist. */
export const LAYOUT_LABELS: Record<FlagLayout, string> = {
  'bands-h': 'Stripes',
  'bands-v': 'Bars',
  nordic: 'Cross',
  saltire: 'X Cross',
  diagonal: 'Slash',
  quarters: 'Quarters',
  solid: 'Plain',
}

/**
 * What each colour slot actually paints, in slot order.
 *
 * The length is the number of slots the layout uses, so the picker shows three
 * swatch rows for a tricolour and one for a plain field. A control that does
 * nothing is worse than a missing control: he taps it, nothing changes, and he
 * concludes the app is broken.
 */
export const LAYOUT_SLOT_LABELS: Record<FlagLayout, readonly string[]> = {
  'bands-h': ['Top', 'Middle', 'Bottom'],
  'bands-v': ['Left', 'Middle', 'Right'],
  nordic: ['Background', 'Cross', 'Cross line'],
  saltire: ['Background', 'X', 'X line'],
  diagonal: ['Top side', 'Bottom side', 'Stripe'],
  quarters: ['Corners', 'Other corners', 'Circle'],
  solid: ['Colour'],
}

/**
 * Slot pairs that end up touching, and so may not share a colour.
 *
 * Deliberately not "all slots must differ". The outer bands of a tricolour do
 * not touch, and green/white/green is a flag rather than a mistake — forbidding
 * it would take away a design he can name in the real world.
 */
const TOUCHING_SLOTS: Record<FlagLayout, readonly (readonly [number, number])[]> = {
  'bands-h': [
    [0, 1],
    [1, 2],
  ],
  'bands-v': [
    [0, 1],
    [1, 2],
  ],
  nordic: [
    [0, 1],
    [1, 2],
  ],
  saltire: [
    [0, 1],
    [1, 2],
  ],
  diagonal: [
    [0, 2],
    [1, 2],
  ],
  quarters: [
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  solid: [],
}

export const CHARGES: readonly Charge[] = [
  'none',
  'star',
  'sun',
  'crescent',
  'bolt',
  'flame',
  'mountain',
  'wave',
  'tree',
  'leaf',
  'snowflake',
  'ball',
  'boot',
  'trophy',
  'crown',
  'shield',
  'anchor',
  'bear',
  'eagle',
  'wolf',
]

export const CHARGE_LABELS: Record<Charge, string> = {
  none: 'No badge',
  star: 'Star',
  sun: 'Sun',
  crescent: 'Moon',
  bolt: 'Lightning',
  flame: 'Flame',
  mountain: 'Mountain',
  wave: 'Waves',
  tree: 'Pine tree',
  leaf: 'Leaf',
  snowflake: 'Snowflake',
  ball: 'Football',
  boot: 'Boot',
  trophy: 'Trophy',
  crown: 'Crown',
  shield: 'Shield',
  anchor: 'Anchor',
  bear: 'Bear',
  eagle: 'Eagle',
  wolf: 'Wolf',
}

/**
 * Where a child who taps straight through ends up.
 *
 * Navy and gold: not any real country's flag, so it reads as a blank canvas
 * rather than as someone else's, and gold is the colour this game already uses
 * for achievement. The navy star on the gold band clears the contrast rule by a
 * wide margin, so the very first thing he sees is a legible flag.
 */
export const DEFAULT_FLAG: FlagSpec = {
  layout: 'bands-h',
  colors: ['#0B2A5B', '#FACC15', '#0B2A5B'],
  charge: 'star',
  chargeColor: '#0B2A5B',
}

// ---------------------------------------------------------------------------
// Colour

const HEX = /^#[0-9a-fA-F]{6}$/
/** In the palette, so a repaired flag never carries a colour off it. */
const FALLBACK_COLOR = '#171717'

const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)

/**
 * A colour, or a stated fallback.
 *
 * The single gate between anything that has been on disk and the rendered
 * string. Six hex digits cannot carry a quote, an angle bracket or a URL
 * scheme, so nothing that passes this can close an attribute. Uppercased, so
 * that a flag saved in lowercase re-renders byte-identically.
 */
const pickColor = (value: unknown, fallback: string): string =>
  isHex(value) ? value.toUpperCase() : fallback

const safeColor = (value: unknown): string => pickColor(value, FALLBACK_COLOR)

const toLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const clean = safeColor(hex)
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(clean.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG contrast, 1 to 21. Anything unusable is scored as the fallback colour
 * rather than as `NaN`, because a `NaN` here would silently fail every
 * comparison it appears in and let an invisible charge through.
 */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * The floor for a charge against the field behind it.
 *
 * WCAG's non-text threshold. Below this a badge stops being a shape and becomes
 * a smudge — and the point of the badge is that he can see the thing he chose.
 */
const CHARGE_CONTRAST = 3

// ---------------------------------------------------------------------------
// Layout geometry
//
// One viewBox for every flag, so a size is only ever an attribute and the
// geometry is written exactly once. 3:2 is the commonest national ratio and
// divides into thirds and quarters without fractions.

const VIEW_W = 900
const VIEW_H = 600

/** Two decimals, and never `-0`, so the output is byte-stable. */
function n(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

type Point = readonly [number, number]

const rect = (x: number, y: number, w: number, h: number, fill: string): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`

const poly = (points: readonly Point[], fill: string): string =>
  `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${fill}"/>`

const circle = (cx: number, cy: number, r: number, fill: string): string =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"/>`

/**
 * Where the charge sits, per layout, and which colour slot is underneath it.
 *
 * Every anchor is placed inside a *single* colour region with room to spare —
 * the canton of a cross flag, the hoist triangle of a saltire, the disc of a
 * quartered flag. That is what makes one contrast check sufficient: a charge
 * straddling two fields would have to be legible against both, and there is no
 * pair of colours in the palette for which that is always true.
 */
const CHARGE_ANCHOR: Record<FlagLayout, { cx: number; cy: number; size: number; slot: 0 | 1 | 2 }> =
  {
    solid: { cx: 450, cy: 300, size: 300, slot: 0 },
    'bands-h': { cx: 450, cy: 300, size: 168, slot: 1 },
    'bands-v': { cx: 450, cy: 300, size: 232, slot: 1 },
    nordic: { cx: 120, cy: 120, size: 150, slot: 0 },
    saltire: { cx: 145, cy: 300, size: 145, slot: 0 },
    diagonal: { cx: 270, cy: 170, size: 175, slot: 0 },
    quarters: { cx: 450, cy: 300, size: 200, slot: 2 },
  }

/** The field shapes only. The charge is drawn separately, by the caller. */
const LAYOUT_ART: Record<FlagLayout, (colors: readonly string[]) => string> = {
  solid: ([a]) => rect(0, 0, VIEW_W, VIEW_H, a),

  'bands-h': ([a, b, c]) =>
    rect(0, 0, VIEW_W, 200, a) + rect(0, 200, VIEW_W, 200, b) + rect(0, 400, VIEW_W, 200, c),

  'bands-v': ([a, b, c]) =>
    rect(0, 0, 300, VIEW_H, a) + rect(300, 0, 300, VIEW_H, b) + rect(600, 0, 300, VIEW_H, c),

  // Offset cross: the vertical arm sits a third of the way in, which is what
  // makes it read as Nordic rather than as a plus sign.
  nordic: ([a, b, c]) =>
    rect(0, 0, VIEW_W, VIEW_H, a) +
    rect(0, 240, VIEW_W, 120, b) +
    rect(240, 0, 120, VIEW_H, b) +
    rect(0, 282, VIEW_W, 36, c) +
    rect(282, 0, 36, VIEW_H, c),

  saltire: ([a, b, c]) =>
    rect(0, 0, VIEW_W, VIEW_H, a) +
    poly(
      [
        [-84, 19],
        [916, 685],
        [984, 581],
        [-16, -85],
      ],
      b,
    ) +
    poly(
      [
        [-16, 685],
        [984, 19],
        [916, -85],
        [-84, 581],
      ],
      b,
    ) +
    poly(
      [
        [-61.1, -16.4],
        [938.9, 649.6],
        [961.1, 616.4],
        [-38.9, -49.6],
      ],
      c,
    ) +
    poly(
      [
        [-38.9, 649.6],
        [961.1, -16.4],
        [938.9, -49.6],
        [-61.1, 616.4],
      ],
      c,
    ),

  // Two triangles split corner to corner, with a stripe riding the seam. The
  // stripe overhangs the viewBox at both ends; the root svg clips it, which is
  // cheaper and more exact than mitring it by hand.
  diagonal: ([a, b, c]) =>
    poly(
      [
        [0, 0],
        [VIEW_W, 0],
        [0, VIEW_H],
      ],
      a,
    ) +
    poly(
      [
        [VIEW_W, 0],
        [VIEW_W, VIEW_H],
        [0, VIEW_H],
      ],
      b,
    ) +
    poly(
      [
        [-19, 679],
        [981, 13],
        [919, -79],
        [-81, 587],
      ],
      c,
    ),

  quarters: ([a, b, c]) =>
    rect(0, 0, 450, 300, a) +
    rect(450, 0, 450, 300, b) +
    rect(0, 300, 450, 300, b) +
    rect(450, 300, 450, 300, a) +
    circle(450, 300, 170, c),
}

// ---------------------------------------------------------------------------
// Charges
//
// Each is drawn in a 100 x 100 box and scaled into place, so one shape serves
// every layout and every size. Two colours are available: `ink` is his chosen
// charge colour, and `field` is the colour behind the charge, used for cut-outs
// — a bear's eyes, the panels of a football. Cut-outs are painted rather than
// punched with a fill rule because every anchor sits on a single flat colour,
// and painting is the version that cannot be got subtly wrong.

const path = (d: string, fill: string): string => `<path d="${d}" fill="${fill}"/>`

const stroked = (d: string, stroke: string, width: number): string =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`

/** Points of a regular star, first point straight up. */
function starPoints(cx: number, cy: number, outer: number, inner: number, arms = 5): Point[] {
  const points: Point[] = []
  for (let i = 0; i < arms * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const angle = (Math.PI / arms) * i - Math.PI / 2
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
  }
  return points
}

/** The five corners of a regular pentagon, point up. */
const pentagon = (cx: number, cy: number, r: number): Point[] =>
  starPoints(cx, cy, r, r).filter((_, i) => i % 2 === 0)

/** A ring of triangular rays, for the sun. */
function rays(cx: number, cy: number, inner: number, outer: number, count: number): string {
  let d = ''
  for (let i = 0; i < count; i += 1) {
    const mid = ((Math.PI * 2) / count) * i - Math.PI / 2
    const spread = Math.PI / count / 2.2
    d += `M${n(cx + outer * Math.cos(mid))},${n(cy + outer * Math.sin(mid))}`
    d += `L${n(cx + inner * Math.cos(mid - spread))},${n(cy + inner * Math.sin(mid - spread))}`
    d += `L${n(cx + inner * Math.cos(mid + spread))},${n(cy + inner * Math.sin(mid + spread))}Z`
  }
  return d
}

function snowflakeArms(): string {
  let d = ''
  for (let i = 0; i < 6; i += 1) {
    const a = ((Math.PI * 2) / 6) * i - Math.PI / 2
    const [ux, uy] = [Math.cos(a), Math.sin(a)]
    d += `M50,50L${n(50 + 46 * ux)},${n(50 + 46 * uy)}`
    for (const [at, len] of [
      [24, 15],
      [37, 10],
    ]) {
      const [bx, by] = [50 + at * ux, 50 + at * uy]
      for (const side of [-1, 1]) {
        const b = a + side * 0.95
        d += `M${n(bx)},${n(by)}L${n(bx + len * Math.cos(b))},${n(by + len * Math.sin(b))}`
      }
    }
  }
  return d
}

type ChargeArt = (ink: string, field: string) => string

const CHARGE_ART: Record<Exclude<Charge, 'none'>, ChargeArt> = {
  star: (ink) => poly(starPoints(50, 50, 48, 19.2), ink),

  sun: (ink) => circle(50, 50, 26, ink) + path(rays(50, 50, 30, 49, 12), ink),

  // Built from the two circles' arcs rather than by subtracting one disc from
  // the other: a subtraction leaves a stray sliver wherever the cutting circle
  // escapes the outer one.
  crescent: (ink) => path('M55.85,5.38A45,45 0 1,0 89.2,72.09A38,38 0 1,1 55.85,5.38Z', ink),

  bolt: (ink) =>
    poly(
      [
        [60, 4],
        [22, 56],
        [45, 56],
        [37, 96],
        [78, 42],
        [53, 42],
      ],
      ink,
    ),

  flame: (ink, field) =>
    path(
      'M50,4C70,30 80,42 80,60A30,30 0 0,1 20,60C20,42 32,34 38,22C40,40 48,44 48,44C48,32 46,18 50,4Z',
      ink,
    ) + path('M50,46C59,58 63,62 63,69A13,13 0 0,1 37,69C37,62 42,57 50,46Z', field),

  // Silhouette only, deliberately. A snow cap has to be *lighter* than the rock
  // to read as snow, and the only second colour available is whatever is behind
  // the flag — so the cap came out darker than the peak and read as a hole
  // punched in the summit. The plain two-peak outline is unambiguous.
  mountain: (ink) =>
    poly(
      [
        [4, 88],
        [30, 38],
        [42, 56],
        [58, 20],
        [96, 88],
      ],
      ink,
    ),

  wave: (ink) =>
    [18, 44, 70]
      .map((y) =>
        path(
          `M4,${y}C20,${y - 13} 34,${y + 13} 50,${y}C66,${y - 13} 80,${y + 13} 96,${y}L96,${y + 12}C80,${y + 25} 66,${y - 1} 50,${y + 12}C34,${y + 25} 20,${y - 1} 4,${y + 12}Z`,
          ink,
        ),
      )
      .join(''),

  tree: (ink) =>
    path(
      'M50,6L70,34L62,34L80,60L70,60L90,86L58,86L58,96L42,96L42,86L10,86L30,60L20,60L38,34L30,34Z',
      ink,
    ),

  leaf: (ink, field) =>
    path('M50,5C82,24 86,54 68,80C60,92 54,96 50,96C46,96 40,92 32,80C14,54 18,24 50,5Z', ink) +
    stroked('M50,22L50,92M50,46L34,34M50,46L66,34M50,66L36,54M50,66L64,54', field, 4),

  // Inverted, as a badge: light panels on a dark disc still read as a football,
  // and a charge has only one colour of its own to spend.
  ball: (ink, field) =>
    circle(50, 50, 46, ink) +
    poly(pentagon(50, 50, 20), field) +
    stroked(
      pentagon(50, 50, 20)
        .map(([x, y]) => `M${n(x)},${n(y)}L${n(50 + (x - 50) * 2.3)},${n(50 + (y - 50) * 2.3)}`)
        .join(''),
      field,
      6,
    ),

  snowflake: (ink) => stroked(snowflakeArms(), ink, 7),

  // A boot is read from its profile: a high collar at the heel, an instep
  // sloping away, and a long low toe. An upper drawn as one rounded mass merges
  // with the sole and reads as a lump.
  boot: (ink, field) =>
    path(
      'M14,26L38,26C40,38 44,47 54,53C66,60 80,63 90,66C95,67 96,70 96,74L8,74L8,34C8,29 10,26 14,26Z',
      ink,
    ) +
    `<rect x="6" y="74" width="92" height="9" rx="3" fill="${ink}"/>` +
    rect(16, 83, 9, 8, ink) +
    rect(44, 83, 9, 8, ink) +
    rect(74, 83, 9, 8, ink) +
    stroked('M20,38L38,38M20,50L44,50M20,62L54,62', field, 4),

  trophy: (ink) =>
    path('M30,8L70,8L68,40C68,53 60,62 50,62C40,62 32,53 32,40Z', ink) +
    stroked('M30,14C16,14 10,26 20,36C24,40 28,41 31,41', ink, 7) +
    stroked('M70,14C84,14 90,26 80,36C76,40 72,41 69,41', ink, 7) +
    rect(43, 60, 14, 16, ink) +
    `<rect x="26" y="76" width="48" height="9" rx="4" fill="${ink}"/>` +
    `<rect x="18" y="85" width="64" height="11" rx="5" fill="${ink}"/>`,

  crown: (ink) =>
    poly(
      [
        [10, 74],
        [4, 24],
        [28, 44],
        [50, 10],
        [72, 44],
        [96, 24],
        [90, 74],
      ],
      ink,
    ) + `<rect x="10" y="74" width="80" height="16" rx="4" fill="${ink}"/>`,

  shield: (ink) => path('M50,6L88,20L88,52C88,74 70,88 50,96C30,88 12,74 12,52L12,20Z', ink),

  anchor: (ink) =>
    stroked('M50,6A11,11 0 1,1 49.9,6', ink, 7) +
    rect(45.5, 22, 9, 64, ink) +
    `<rect x="22" y="34" width="56" height="9" rx="4" fill="${ink}"/>` +
    path(
      'M50,96C26,91 13,74 11,55L21,53C24,69 34,80 50,84C66,80 76,69 79,53L89,55C87,74 74,91 50,96Z',
      ink,
    ),

  bear: (ink, field) =>
    circle(24, 26, 15, ink) +
    circle(76, 26, 15, ink) +
    circle(50, 56, 33, ink) +
    circle(50, 76, 18, ink) +
    circle(38, 50, 5, field) +
    circle(62, 50, 5, field) +
    circle(50, 71, 7, field),

  // A heraldic spread eagle: head and beak above, wings stepped out in three
  // feathers a side, tail split below. Symmetric and stepped, because a bird
  // drawn with a smooth outline at this size reads as a starfish.
  eagle: (ink, field) =>
    path(
      'M50,20L58,27L74,19L92,15L84,31L96,35L80,43L92,49L72,53L64,61L58,65L64,79L56,77L58,93L50,87L42,93L44,77L36,79L42,65L36,61L28,53L8,49L20,43L4,35L16,31L8,15L26,19L42,27Z',
      ink,
    ) +
    circle(50, 13, 9, ink) +
    poly(
      [
        [58, 10],
        [68, 14],
        [58, 17],
      ],
      ink,
    ) +
    circle(47, 11, 2.4, field),

  // A blunt muzzle rather than a point. Ears plus a chin that tapers to a
  // single vertex is a cat; a wolf's snout ends flat.
  wolf: (ink, field) =>
    poly(
      [
        [44, 93],
        [56, 93],
        [71, 72],
        [80, 46],
        [83, 8],
        [63, 28],
        [50, 24],
        [37, 28],
        [17, 8],
        [20, 46],
        [29, 72],
      ],
      ink,
    ) +
    circle(37, 48, 5, field) +
    circle(63, 48, 5, field) +
    poly(
      [
        [50, 72],
        [57, 82],
        [43, 82],
      ],
      field,
    ),
}

/** The charge, scaled and translated into position. Empty for `none`. */
function paintCharge(
  charge: Charge,
  ink: string,
  field: string,
  cx: number,
  cy: number,
  size: number,
): string {
  if (charge === 'none') return ''
  const art = CHARGE_ART[charge](ink, field)
  return `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(size / 100)})">${art}</g>`
}

// ---------------------------------------------------------------------------
// Normalising

const isLayout = (value: unknown): value is FlagLayout =>
  typeof value === 'string' && Object.hasOwn(LAYOUT_LABELS, value)

const isCharge = (value: unknown): value is Charge =>
  typeof value === 'string' && Object.hasOwn(CHARGE_LABELS, value)

/**
 * Any candidate flag, made renderable.
 *
 * The store keeps `FlagSpec` structurally — plain strings — because persistence
 * only has to tell a flag from a corrupt one, and this module owns the
 * vocabularies. This is the funnel back: a flag off the disk, out of an
 * imported save, or from a build that knew a charge this one has dropped comes
 * through here and is renderable on the other side. Broken parts are replaced
 * individually, because losing a whole flag over one bad colour would cost him
 * a design he made.
 *
 * A *missing* charge and an *unrecognised* one are treated differently on
 * purpose. Nothing is a new flag, and gets the default badge. Something we no
 * longer understand is his flag with a piece removed, and giving it a badge he
 * did not choose would be worse than showing none.
 */
export function normalizeFlagSpec(value: unknown): FlagSpec {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_FLAG }
  const raw = value as Partial<Record<keyof FlagSpec, unknown>>
  const colors = Array.isArray(raw.colors) ? raw.colors : []
  return {
    layout: isLayout(raw.layout) ? raw.layout : DEFAULT_FLAG.layout,
    colors: [
      pickColor(colors[0], DEFAULT_FLAG.colors[0]),
      pickColor(colors[1], DEFAULT_FLAG.colors[1]),
      pickColor(colors[2], DEFAULT_FLAG.colors[2]),
    ],
    charge: raw.charge === undefined ? DEFAULT_FLAG.charge : isCharge(raw.charge) ? raw.charge : 'none',
    chargeColor: pickColor(raw.chargeColor, DEFAULT_FLAG.chargeColor),
  }
}

// ---------------------------------------------------------------------------
// Choices the picker needs

/** The colour immediately behind the charge. */
export function fieldUnderCharge(spec: FlagSpec): string {
  const clean = normalizeFlagSpec(spec)
  return clean.colors[CHARGE_ANCHOR[clean.layout].slot]
}

/**
 * Charge colours that will actually be visible on this flag.
 *
 * Filtering the options rather than warning after the fact: he never sees a
 * choice that would have disappeared, so there is no mistake to explain and
 * nothing that behaves as though he did something wrong.
 */
export function chargeColorOptions(spec: FlagSpec): PaletteColor[] {
  const field = fieldUnderCharge(spec)
  return PALETTE.filter((colour) => contrastRatio(colour.hex, field) >= CHARGE_CONTRAST)
}

/**
 * The charge colour to use, given what he last chose.
 *
 * Called whenever the flag changes underneath the charge. A choice that still
 * works is kept — the whole point is that his decisions stick. One that has
 * stopped working is replaced, preferring gold (this game's colour for
 * achievement), then the two neutrals, and falling back to whatever contrasts
 * most if the palette ever changes out from under it.
 */
export function bestChargeColor(spec: FlagSpec, preferred: string): string {
  const field = fieldUnderCharge(spec)
  if (isHex(preferred) && contrastRatio(preferred, field) >= CHARGE_CONTRAST) {
    return preferred.toUpperCase()
  }
  const options = chargeColorOptions(spec)
  for (const id of ['gold', 'white', 'black']) {
    const found = options.find((colour) => colour.id === id)
    if (found !== undefined) return found.hex
  }
  return [...PALETTE].sort((a, b) => contrastRatio(b.hex, field) - contrastRatio(a.hex, field))[0]
    .hex
}

/**
 * A flag put back into a state the picker's own rules accept.
 *
 * Filtering the swatches stops him *choosing* a colour that would collide, but
 * it cannot stop a collision that appears underneath him: navy/gold/navy is a
 * perfectly good tricolour, and the moment he switches it to quarters the third
 * colour is a disc sitting on a navy quarter and his flag has a bite out of it.
 * Nothing he did was wrong, so nothing should be refused — the clash is
 * repaired instead, and the slot that moves is the later one, so the colours he
 * chose first are the ones that survive.
 *
 * Called on every change in the creator, not only on a layout change, so there
 * is one rule rather than a list of situations to remember.
 */
export function reconcileFlag(spec: FlagSpec): FlagSpec {
  const clean = normalizeFlagSpec(spec)
  const colors: [string, string, string] = [...clean.colors]
  const touching = TOUCHING_SLOTS[clean.layout]

  for (const [a, b] of touching) {
    if (colors[a] !== colors[b]) continue
    const forbidden = new Set(
      touching.filter((pair) => pair.includes(b)).map((pair) => colors[pair[0] === b ? pair[1] : pair[0]]),
    )
    const replacement = PALETTE.find((colour) => !forbidden.has(colour.hex))
    if (replacement !== undefined) colors[b] = replacement.hex
  }

  const settled = { ...clean, colors }
  return { ...settled, chargeColor: bestChargeColor(settled, settled.chargeColor) }
}

/** Colours offered for one slot: everything not already used by a neighbour. */
export function colorOptionsForSlot(spec: FlagSpec, slot: number): PaletteColor[] {
  const clean = normalizeFlagSpec(spec)
  const taken = new Set(
    TOUCHING_SLOTS[clean.layout]
      .filter((pair) => pair.includes(slot))
      .map((pair) => clean.colors[pair[0] === slot ? pair[1] : pair[0]]),
  )
  return PALETTE.filter((colour) => !taken.has(colour.hex))
}

// ---------------------------------------------------------------------------
// Rendering

interface SizeOpts {
  width?: number
  height?: number
}

const DEFAULT_WIDTH = 300

const usableSize = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

/** A requested size, or the default. Never zero, negative or non-finite. */
function resolveSize(opts: SizeOpts | undefined): { width: number; height: number } {
  const width = usableSize(opts?.width)
  const height = usableSize(opts?.height)
  if (width !== undefined && height !== undefined) return { width, height }
  if (width !== undefined) return { width, height: (width * VIEW_H) / VIEW_W }
  if (height !== undefined) return { width: (height * VIEW_W) / VIEW_H, height }
  return { width: DEFAULT_WIDTH, height: (DEFAULT_WIDTH * VIEW_H) / VIEW_W }
}

/**
 * A hairline edge, so a white flag on a white card is still a flag.
 *
 * `non-scaling-stroke` because this is the one line whose job is to be exactly
 * one pixel: scaled with the viewBox it would be a fifth of a pixel on a 24px
 * bracket icon and four pixels on a 600px preview.
 */
const BORDER = `<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="none" stroke="#0F172A" stroke-opacity="0.25" stroke-width="1" vector-effect="non-scaling-stroke"/>`

/**
 * The flag, as SVG.
 *
 * Pure and total: the same spec always produces the same bytes, any spec at all
 * produces a valid `<svg>`, and the geometry is identical at every size because
 * only the root's width and height ever change.
 */
export function flagSvg(spec: FlagSpec, opts?: SizeOpts): string {
  const clean = normalizeFlagSpec(spec)
  const { width, height } = resolveSize(opts)
  const anchor = CHARGE_ANCHOR[clean.layout]
  const field = clean.colors[anchor.slot]
  const body =
    LAYOUT_ART[clean.layout](clean.colors) +
    paintCharge(clean.charge, clean.chargeColor, field, anchor.cx, anchor.cy, anchor.size) +
    BORDER
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${n(width)}" height="${n(height)}">${body}</svg>`
}

/**
 * One charge on its own, for the picker.
 *
 * `field` is the colour the glyph will be shown against, and it matters: the
 * detail on these shapes — a bear's eyes, a football's panels, a boot's laces —
 * is *painted*, not punched. Filling with `none` paints nothing rather than
 * clearing what is underneath, so a caller that does not say what is behind the
 * glyph gets a bear with no eyes and a football that is a plain disc. Defaults
 * to white, which is right for the light card a charge is usually shown on.
 */
export function chargeSvg(
  charge: Charge,
  color: string,
  opts?: { size?: number; field?: string },
): string {
  const ink = safeColor(color)
  const field = pickColor(opts?.field, '#FFFFFF')
  const size = usableSize(opts?.size) ?? 48
  const art = isCharge(charge) && charge !== 'none' ? CHARGE_ART[charge](ink, field) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${n(size)}" height="${n(size)}">${art}</svg>`
}

// ---------------------------------------------------------------------------
// Crest

const CREST_W = 300
const CREST_H = 340

const SHIELD =
  'M40,44L260,44A16,16 0 0,1 276,60L276,190C276,258 222,308 150,332C78,308 24,258 24,190L24,60A16,16 0 0,1 40,44Z'
const SHIELD_BOX = { x: 24, y: 44, w: 252, h: 288 }

/**
 * A stable id per spec.
 *
 * `clipPath` needs one, and two crests in the same document must not share it —
 * a bracket full of crests would otherwise all wear the first one's shield.
 * FNV-1a over the spec: same flag, same id, byte-identical output; different
 * flag, different id.
 */
function specHash(spec: FlagSpec): string {
  const text = `${spec.layout}|${spec.colors.join(',')}|${spec.charge}|${spec.chargeColor}`
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/**
 * The crest: his flag on a shield, with a star for each World Cup won.
 *
 * The charge is redrawn on a roundel rather than left wherever the flag put it,
 * because a shield crops a 3:2 flag hard and a canton charge would be sliced in
 * half. The roundel is filled with the same colour the charge sits on in the
 * flag, so the contrast he was guaranteed in the designer is the contrast he
 * gets here, with no second rule to keep in step.
 *
 * The star band above the shield is reserved whether or not there are stars in
 * it. He will win his first World Cup one day, and the crest he has been
 * looking at for months should gain a star rather than move.
 */
export function crestSvg(spec: FlagSpec, opts?: SizeOpts & { stars?: number }): string {
  const clean = normalizeFlagSpec(spec)
  const id = `wmc-crest-${specHash(clean)}`
  const field = fieldUnderCharge(clean)

  const width = usableSize(opts?.width) ?? ((usableSize(opts?.height) ?? 0) * CREST_W) / CREST_H
  const w = width > 0 ? width : 200
  const height = usableSize(opts?.height) ?? (w * CREST_H) / CREST_W

  const inner = `<svg x="${SHIELD_BOX.x}" y="${SHIELD_BOX.y}" width="${SHIELD_BOX.w}" height="${SHIELD_BOX.h}" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid slice">${LAYOUT_ART[clean.layout](clean.colors)}</svg>`

  const roundel =
    clean.charge === 'none'
      ? ''
      : circle(150, 180, 62, field) +
        '<circle cx="150" cy="180" r="62" fill="none" stroke="#FACC15" stroke-width="6"/>' +
        paintCharge(clean.charge, clean.chargeColor, field, 150, 180, 84)

  const requested = opts?.stars
  const count =
    typeof requested === 'number' && Number.isFinite(requested)
      ? Math.max(0, Math.min(6, Math.floor(requested)))
      : 0
  let stars = ''
  for (let i = 0; i < count; i += 1) {
    stars += poly(starPoints(150 + (i - (count - 1) / 2) * 36, 24, 15, 6), '#FACC15')
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CREST_W} ${CREST_H}" width="${n(w)}" height="${n(height)}">` +
    `<defs><clipPath id="${id}"><path d="${SHIELD}"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">${inner}</g>` +
    `<path d="${SHIELD}" fill="none" stroke="#FACC15" stroke-width="9"/>` +
    roundel +
    stars +
    '</svg>'
  )
}
