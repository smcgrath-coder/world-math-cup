import { describe, expect, it } from 'vitest'
import {
  CHARGES,
  CHARGE_LABELS,
  DEFAULT_FLAG,
  LAYOUTS,
  LAYOUT_LABELS,
  LAYOUT_SLOT_LABELS,
  PALETTE,
  bestChargeColor,
  chargeColorOptions,
  chargeSvg,
  colorOptionsForSlot,
  contrastRatio,
  crestSvg,
  fieldUnderCharge,
  flagSvg,
  normalizeFlagSpec,
  reconcileFlag,
} from './flag'
import type { FlagSpec } from './flag'

const spec = (over: Partial<FlagSpec> = {}): FlagSpec => ({ ...DEFAULT_FLAG, ...over })

/** Every layout crossed with every charge. 7 x 20 today. */
const everyCombination = LAYOUTS.flatMap((layout) =>
  CHARGES.map((charge) => ({ layout, charge, spec: spec({ layout, charge }) })),
)

// ---------------------------------------------------------------------------
// Perceptual distance, for the palette curation guard only.
//
// CIE76 in Lab. Crude by modern standards, but the question it answers here is
// only "could a child mistake these two for the same colour", and for a set of
// sixteen deliberately spread hues that is exactly the question it is good at.

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]
  // sRGB -> XYZ (D65), then XYZ -> Lab.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

const firstGroup = (pattern: RegExp, text: string): string => {
  const found = text.match(pattern)
  if (found === null) throw new Error(`no match for ${String(pattern)}`)
  return found[1]
}

// ---------------------------------------------------------------------------

describe('the palette', () => {
  it('is curated rather than open — sixteen colours, no duplicates', () => {
    expect(PALETTE).toHaveLength(16)
    expect(new Set(PALETTE.map((c) => c.hex)).size).toBe(16)
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(16)
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(16)
  })

  it('is uppercase six-digit hex throughout, so output is byte-stable', () => {
    for (const colour of PALETTE) expect(colour.hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('holds no two colours a child could mistake for each other', () => {
    // Any two of these can end up in touching regions of a flag, so a near-pair
    // in the palette is a flag that looks broken rather than designed. The
    // guard is on the *palette* rather than on his choices: curation is what
    // keeps every reachable combination deliberate.
    let worst = { pair: '', distance: Number.POSITIVE_INFINITY }
    for (let i = 0; i < PALETTE.length; i += 1) {
      for (let j = i + 1; j < PALETTE.length; j += 1) {
        const distance = deltaE(PALETTE[i].hex, PALETTE[j].hex)
        if (distance < worst.distance) {
          worst = { pair: `${PALETTE[i].name}/${PALETTE[j].name}`, distance }
        }
      }
    }
    // The closest pair today is Blue/Purple at ~28.7, which is comfortably two
    // colours. The floor sits below that with room, but high enough that the
    // pairs this test has already rejected — a silver next to white, a slate
    // black next to navy — could not come back.
    expect(worst.distance, `closest pair: ${worst.pair}`).toBeGreaterThan(25)
  })
})

describe('contrastRatio', () => {
  it('runs from 1 to 21', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#FF00AA', '#FF00AA')).toBeCloseTo(1, 5)
  })

  it('does not care which way round the arguments go', () => {
    expect(contrastRatio('#FFFFFF', '#1D4ED8')).toBeCloseTo(contrastRatio('#1D4ED8', '#FFFFFF'), 8)
  })

  it('treats an unusable colour as the default rather than returning NaN', () => {
    expect(Number.isFinite(contrastRatio('nonsense', '#FFFFFF'))).toBe(true)
  })
})

describe('charge colours', () => {
  it('never offers a charge colour that would disappear into the field', () => {
    for (const colour of PALETTE) {
      const options = chargeColorOptions(spec({ colors: [colour.hex, colour.hex, colour.hex] }))
      for (const option of options) {
        expect(
          contrastRatio(option.hex, colour.hex),
          `${option.name} on ${colour.name}`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('always leaves a real choice, whatever the field colour', () => {
    for (const colour of PALETTE) {
      const options = chargeColorOptions(spec({ colors: [colour.hex, colour.hex, colour.hex] }))
      expect(options.length, `options on ${colour.name}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('reads the field from under the charge, not from the first colour', () => {
    // The charge sits on the middle band of a tricolour, so that is the colour
    // it has to be legible against.
    const s = spec({ layout: 'bands-h', colors: ['#FFFFFF', '#0B2A5B', '#E11D2E'] })
    expect(fieldUnderCharge(s)).toBe('#0B2A5B')
  })

  it('keeps a chosen colour that still works', () => {
    const s = spec({ layout: 'solid', colors: ['#0B2A5B', '#FFFFFF', '#E11D2E'] })
    expect(bestChargeColor(s, '#FACC15')).toBe('#FACC15')
  })

  it('replaces a chosen colour that has stopped working', () => {
    // He picked a navy star, then made the field navy too. The star must not
    // silently vanish.
    const s = spec({ layout: 'solid', colors: ['#0B2A5B', '#FFFFFF', '#E11D2E'] })
    const repaired = bestChargeColor(s, '#0B2A5B')
    expect(repaired).not.toBe('#0B2A5B')
    expect(contrastRatio(repaired, '#0B2A5B')).toBeGreaterThanOrEqual(3)
  })

  it('repairs an unusable colour rather than passing it through', () => {
    const repaired = bestChargeColor(spec(), 'not-a-colour')
    expect(repaired).toMatch(/^#[0-9A-F]{6}$/)
  })
})

describe('colour slots', () => {
  it('labels exactly the slots each layout paints', () => {
    expect(LAYOUT_SLOT_LABELS.solid).toHaveLength(1)
    for (const layout of LAYOUTS) {
      const labels = LAYOUT_SLOT_LABELS[layout]
      expect(labels.length).toBeGreaterThanOrEqual(1)
      expect(labels.length).toBeLessThanOrEqual(3)
      for (const label of labels) expect(label.length).toBeGreaterThan(0)
    }
  })

  it('does not offer a colour already used by a touching region', () => {
    // A quartered flag whose disc matches a quarter is a flag with no disc.
    const s = spec({ layout: 'quarters', colors: ['#E11D2E', '#FFFFFF', '#0B2A5B'] })
    const forDisc = colorOptionsForSlot(s, 2).map((c) => c.hex)
    expect(forDisc).not.toContain('#E11D2E')
    expect(forDisc).not.toContain('#FFFFFF')
    expect(forDisc).toContain('#FACC15')
  })

  it('still allows the outer bands of a tricolour to match', () => {
    // Green/white/green is a flag, not a mistake.
    const s = spec({ layout: 'bands-h', colors: ['#16A34A', '#FFFFFF', '#16A34A'] })
    expect(colorOptionsForSlot(s, 2).map((c) => c.hex)).toContain('#16A34A')
  })

  it('leaves plenty of choice in every slot of every layout', () => {
    for (const layout of LAYOUTS) {
      const s = spec({ layout })
      for (let slot = 0; slot < LAYOUT_SLOT_LABELS[layout].length; slot += 1) {
        expect(colorOptionsForSlot(s, slot).length, `${layout} slot ${slot}`).toBeGreaterThanOrEqual(
          13,
        )
      }
    }
  })
})

describe('reconcileFlag', () => {
  it('repairs a clash the layout he just picked has created', () => {
    // The default flag is navy/gold/navy, which is a fine tricolour: the outer
    // bands do not touch. Switch it to quarters and slot three is suddenly the
    // disc sitting on a navy quarter, and his flag has a bite out of it rather
    // than a circle. Filtering the swatches cannot catch this — he never picked
    // the clashing colour, the layout change created it under him.
    const clashing = reconcileFlag({ ...DEFAULT_FLAG, layout: 'quarters' })
    expect(clashing.colors[2]).not.toBe(clashing.colors[0])
    expect(clashing.colors[2]).not.toBe(clashing.colors[1])
    expect(clashing.colors[0]).not.toBe(clashing.colors[1])
  })

  it('repairs the diagonal stripe the same way', () => {
    const clashing = reconcileFlag({ ...DEFAULT_FLAG, layout: 'diagonal' })
    expect(clashing.colors[2]).not.toBe(clashing.colors[0])
    expect(clashing.colors[2]).not.toBe(clashing.colors[1])
  })

  it('replaces with a colour from the palette', () => {
    const repaired = reconcileFlag({ ...DEFAULT_FLAG, layout: 'quarters' })
    for (const hex of repaired.colors) {
      expect(PALETTE.map((c) => c.hex)).toContain(hex)
    }
  })

  it('leaves a flag that is already fine completely alone', () => {
    const fine: FlagSpec = {
      layout: 'bands-v',
      colors: ['#E11D2E', '#FFFFFF', '#0B2A5B'],
      charge: 'star',
      chargeColor: '#E11D2E',
    }
    expect(reconcileFlag(fine)).toEqual(fine)
  })

  it('keeps the outer bands of a tricolour matching, because they do not touch', () => {
    const nigeria: FlagSpec = {
      layout: 'bands-v',
      colors: ['#16A34A', '#FFFFFF', '#16A34A'],
      charge: 'none',
      chargeColor: '#171717',
    }
    expect(reconcileFlag(nigeria).colors).toEqual(['#16A34A', '#FFFFFF', '#16A34A'])
  })

  it('repairs the charge colour as well as the field', () => {
    const hidden: FlagSpec = {
      layout: 'solid',
      colors: ['#171717', '#FFFFFF', '#E11D2E'],
      charge: 'star',
      chargeColor: '#171717',
    }
    const repaired = reconcileFlag(hidden)
    expect(contrastRatio(repaired.chargeColor, fieldUnderCharge(repaired))).toBeGreaterThanOrEqual(3)
  })

  it('settles in one pass', () => {
    for (const layout of LAYOUTS) {
      const once = reconcileFlag({ ...DEFAULT_FLAG, layout })
      expect(reconcileFlag(once), layout).toEqual(once)
    }
  })

  it('leaves every layout in a state its own rules accept', () => {
    for (const layout of LAYOUTS) {
      const repaired = reconcileFlag({ ...DEFAULT_FLAG, layout })
      LAYOUT_SLOT_LABELS[layout].forEach((_, slot) => {
        expect(colorOptionsForSlot(repaired, slot).map((c) => c.hex), `${layout} ${slot}`).toContain(
          repaired.colors[slot],
        )
      })
    }
  })
})

describe('flagSvg', () => {
  it('renders an svg root for every layout crossed with every charge', () => {
    expect(everyCombination.length).toBe(LAYOUTS.length * CHARGES.length)
    for (const { layout, charge, spec: s } of everyCombination) {
      const svg = flagSvg(s)
      expect(svg.startsWith('<svg '), `${layout}/${charge}`).toBe(true)
      expect(svg.endsWith('</svg>'), `${layout}/${charge}`).toBe(true)
      expect(svg, `${layout}/${charge}`).toContain('viewBox="0 0 900 600"')
    }
  })

  it('never emits a NaN or an undefined into the markup', () => {
    for (const { layout, charge, spec: s } of everyCombination) {
      expect(flagSvg(s), `${layout}/${charge}`).not.toMatch(/NaN|undefined|null/)
    }
  })

  it('has balanced tags for every combination', () => {
    for (const { layout, charge, spec: s } of everyCombination) {
      const svg = flagSvg(s)
      const opens = (svg.match(/<[a-z]/g) ?? []).length
      const closes = (svg.match(/(\/>|<\/[a-z]+>)/g) ?? []).length
      expect(opens, `${layout}/${charge}`).toBe(closes)
    }
  })

  it('is deterministic — the same spec is byte-identical every time', () => {
    for (const { spec: s } of everyCombination) {
      expect(flagSvg(s)).toBe(flagSvg({ ...s }))
    }
  })

  it('does not depend on the key order of the spec object', () => {
    const a: FlagSpec = {
      layout: 'nordic',
      colors: ['#E11D2E', '#FFFFFF', '#0B2A5B'],
      charge: 'bear',
      chargeColor: '#0B2A5B',
    }
    const b: FlagSpec = {
      chargeColor: '#0B2A5B',
      charge: 'bear',
      colors: ['#E11D2E', '#FFFFFF', '#0B2A5B'],
      layout: 'nordic',
    }
    expect(flagSvg(a)).toBe(flagSvg(b))
  })

  it('paints every colour slot the layout claims to use', () => {
    // Guards against a slot that the picker offers but the renderer ignores.
    const colors: [string, string, string] = ['#E11D2E', '#FACC15', '#0B2A5B']
    for (const layout of LAYOUTS) {
      const svg = flagSvg(spec({ layout, colors, charge: 'none' }))
      LAYOUT_SLOT_LABELS[layout].forEach((label, slot) => {
        expect(svg, `${layout}: ${label}`).toContain(colors[slot])
      })
    }
  })

  it('draws something for every charge', () => {
    // Guards against a charge that is offered in the picker and renders nothing.
    for (const layout of LAYOUTS) {
      const bare = flagSvg(spec({ layout, charge: 'none' }))
      for (const charge of CHARGES) {
        if (charge === 'none') continue
        const marked = flagSvg(spec({ layout, charge }))
        expect(marked, `${layout}/${charge}`).not.toBe(bare)
        expect(marked.length, `${layout}/${charge}`).toBeGreaterThan(bare.length + 40)
      }
    }
  })

  it('puts the charge inside the flag, whatever the layout', () => {
    for (const layout of LAYOUTS) {
      const svg = flagSvg(spec({ layout, charge: 'star' }))
      const found = svg.match(/translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/)
      expect(found, layout).not.toBeNull()
      const [x, y, scale] = [Number(found![1]), Number(found![2]), Number(found![3])]
      expect(x, layout).toBeGreaterThanOrEqual(0)
      expect(y, layout).toBeGreaterThanOrEqual(0)
      expect(x + 100 * scale, layout).toBeLessThanOrEqual(900)
      expect(y + 100 * scale, layout).toBeLessThanOrEqual(600)
    }
  })

  it('defaults to a size that is useful on its own', () => {
    const svg = flagSvg(spec())
    expect(svg).toContain('width="300"')
    expect(svg).toContain('height="200"')
  })

  it('honours a requested size', () => {
    expect(flagSvg(spec(), { width: 600, height: 400 })).toContain('width="600"')
    expect(flagSvg(spec(), { width: 600, height: 400 })).toContain('height="400"')
  })

  it('keeps the flag proportions when given only one dimension', () => {
    expect(flagSvg(spec(), { width: 24 })).toContain('height="16"')
    expect(flagSvg(spec(), { height: 90 })).toContain('width="135"')
  })

  it('scales without redrawing — the geometry is identical at 24px and 600px', () => {
    const small = flagSvg(spec(), { width: 24 })
    const large = flagSvg(spec(), { width: 600 })
    expect(small.replace('width="24" height="16"', 'width="600" height="400"')).toBe(large)
  })

  it('falls back to a sane size rather than emitting a broken one', () => {
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const svg = flagSvg(spec(), { width: bad })
      expect(svg, String(bad)).toContain('width="300"')
    }
  })

  it('keeps its outline visible at any size', () => {
    // A white flag on a white card needs an edge, and a hairline that scales
    // with the viewBox is invisible at 24px.
    expect(flagSvg(spec(), { width: 24 })).toContain('vector-effect="non-scaling-stroke"')
  })

  it('falls back to the default flag when the layout or charge is unknown', () => {
    const rogue = { ...DEFAULT_FLAG, layout: 'spiral', charge: 'unicorn' } as unknown as FlagSpec
    expect(flagSvg(rogue)).toBe(flagSvg(spec({ layout: DEFAULT_FLAG.layout, charge: 'none' })))
  })

  it('lets nothing that is not a hex colour reach the markup', () => {
    // The renderer's output is set as markup by FlagPreview, so a colour is the
    // one field on this type that could carry an injection. Colours are checked
    // rather than escaped: anything that is not six hex digits is not a colour,
    // and there is no reason to try to salvage it.
    const hostile = {
      layout: 'bands-h',
      colors: ['#FFF" onload="alert(1)', '</svg><script>steal()</script>', '#000000'],
      charge: 'star',
      chargeColor: 'javascript:alert(1)',
    } as unknown as FlagSpec
    const svg = flagSvg(hostile)
    expect(svg).not.toContain('onload')
    expect(svg).not.toContain('script')
    expect(svg).not.toContain('alert')
    expect(svg).not.toContain('javascript')
    expect(svg.startsWith('<svg ')).toBe(true)
  })

  it('accepts a colour a child never sees, as long as it is a colour', () => {
    // Nothing in the UI can produce this, but an imported save can, and a valid
    // colour is not a reason to throw the flag away.
    const svg = flagSvg(spec({ colors: ['#123456', '#abcdef', '#000000'] }))
    expect(svg).toContain('#123456')
    expect(svg).toContain('#ABCDEF')
  })
})

describe('normalizeFlagSpec', () => {
  it('turns anything unusable into the default flag', () => {
    for (const junk of [null, undefined, 42, 'flag', {}, { layout: 'bands-h' }, []]) {
      expect(normalizeFlagSpec(junk)).toEqual(DEFAULT_FLAG)
    }
  })

  it('keeps a stored flag that is still valid', () => {
    const stored = {
      layout: 'saltire',
      colors: ['#0B2A5B', '#FFFFFF', '#E11D2E'],
      charge: 'anchor',
      chargeColor: '#FACC15',
    }
    expect(normalizeFlagSpec(stored)).toEqual(stored)
  })

  it('normalises casing so a re-save cannot change the bytes', () => {
    const stored = {
      layout: 'solid',
      colors: ['#0b2a5b', '#ffffff', '#e11d2e'],
      charge: 'star',
      chargeColor: '#facc15',
    }
    expect(normalizeFlagSpec(stored).colors[0]).toBe('#0B2A5B')
  })

  it('repairs only the parts that are broken', () => {
    const half = {
      layout: 'quarters',
      colors: ['#E11D2E', 'rgb(1,2,3)', '#FACC15'],
      charge: 'ball',
      chargeColor: '#0B2A5B',
    }
    const clean = normalizeFlagSpec(half)
    expect(clean.layout).toBe('quarters')
    expect(clean.charge).toBe('ball')
    expect(clean.colors[0]).toBe('#E11D2E')
    expect(clean.colors[1]).toMatch(/^#[0-9A-F]{6}$/)
  })
})

describe('the default flag', () => {
  it('is a flag a child who taps straight through would be happy with', () => {
    expect(normalizeFlagSpec(DEFAULT_FLAG)).toEqual(DEFAULT_FLAG)
    expect(DEFAULT_FLAG.charge).not.toBe('none')
    expect(
      contrastRatio(DEFAULT_FLAG.chargeColor, fieldUnderCharge(DEFAULT_FLAG)),
    ).toBeGreaterThanOrEqual(3)
  })
})

describe('chargeSvg', () => {
  it('renders every charge on its own, for the picker', () => {
    for (const charge of CHARGES) {
      const svg = chargeSvg(charge, '#FFFFFF')
      expect(svg.startsWith('<svg '), charge).toBe(true)
      expect(svg, charge).toContain('viewBox="0 0 100 100"')
    }
  })

  it('is deterministic', () => {
    expect(chargeSvg('eagle', '#FACC15')).toBe(chargeSvg('eagle', '#FACC15'))
  })

  it('will not take a colour that is not a colour', () => {
    expect(chargeSvg('star', '"><script>x</script>')).not.toContain('script')
    expect(chargeSvg('bear', '#FFFFFF', { field: 'red; drop table' })).not.toContain('drop')
  })

  it('draws its detail in the colour it is being shown against', () => {
    // A bear's eyes and a football's panels are drawn, not punched: an SVG fill
    // of `none` paints nothing at all rather than clearing what is beneath it,
    // so a picker that does not say what is behind the glyph gets a blank disc
    // where the football should be.
    for (const charge of ['ball', 'bear', 'wolf', 'leaf', 'boot', 'flame', 'eagle'] as const) {
      const glyph = chargeSvg(charge, '#FFFFFF', { field: '#166534' })
      expect(glyph, charge).toContain('#166534')
    }
  })

  it('still renders without being told the backdrop', () => {
    for (const charge of CHARGES) {
      expect(chargeSvg(charge, '#FFFFFF').startsWith('<svg '), charge).toBe(true)
    }
  })
})

describe('crestSvg', () => {
  it('renders for every layout crossed with every charge', () => {
    for (const { layout, charge, spec: s } of everyCombination) {
      const svg = crestSvg(s)
      expect(svg.startsWith('<svg '), `${layout}/${charge}`).toBe(true)
      expect(svg, `${layout}/${charge}`).not.toMatch(/NaN|undefined/)
    }
  })

  it('is deterministic', () => {
    expect(crestSvg(DEFAULT_FLAG, { stars: 2 })).toBe(crestSvg(DEFAULT_FLAG, { stars: 2 }))
  })

  it('gives different flags different clip ids, so two crests cannot share one', () => {
    const a = crestSvg(spec({ layout: 'nordic' }))
    const b = crestSvg(spec({ layout: 'saltire' }))
    expect(firstGroup(/id="([^"]+)"/, a)).not.toBe(firstGroup(/id="([^"]+)"/, b))
  })

  it('wears one star per title', () => {
    const none = crestSvg(DEFAULT_FLAG, { stars: 0 })
    const three = crestSvg(DEFAULT_FLAG, { stars: 3 })
    expect(three.length).toBeGreaterThan(none.length)
    expect(crestSvg(DEFAULT_FLAG, { stars: 1 }).length).toBeLessThan(three.length)
  })

  it('does not fall over on a nonsense star count', () => {
    for (const stars of [-3, Number.NaN, 999, 2.5]) {
      expect(crestSvg(DEFAULT_FLAG, { stars }), String(stars)).not.toMatch(/NaN|undefined/)
    }
  })

  it('keeps the space for the first star before it is won', () => {
    // The crest must not jump the day he wins a World Cup.
    expect(crestSvg(DEFAULT_FLAG, { stars: 0 })).toContain('viewBox="0 0 300 340"')
    expect(crestSvg(DEFAULT_FLAG, { stars: 4 })).toContain('viewBox="0 0 300 340"')
  })
})

describe('the vocabularies', () => {
  it('offers about twenty charges, all labelled', () => {
    expect(CHARGES.length).toBeGreaterThanOrEqual(18)
    expect(CHARGES.length).toBeLessThanOrEqual(24)
    expect(CHARGES[0]).toBe('none')
    for (const charge of CHARGES) expect(CHARGE_LABELS[charge].length).toBeGreaterThan(0)
    expect(new Set(CHARGES).size).toBe(CHARGES.length)
  })

  it('offers the seven layouts, all labelled', () => {
    expect(LAYOUTS).toHaveLength(7)
    for (const layout of LAYOUTS) expect(LAYOUT_LABELS[layout].length).toBeGreaterThan(0)
  })
})
