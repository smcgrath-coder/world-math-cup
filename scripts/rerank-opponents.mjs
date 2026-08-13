/**
 * Re-derive opponent ratings and tiers from the FIFA/Coca-Cola Men's World
 * Ranking.
 *
 * Run this when the ranking moves. FIFA update it roughly quarterly.
 *
 *   1. open https://inside.fifa.com/fifa-rankings/world-ranking/men
 *   2. click "Show full rankings"
 *   3. update FIFA_RANK below
 *   4. node scripts/rerank-opponents.mjs
 *
 * Why derive rather than hand-tune: a hand-picked rating is a judgement that has
 * to be re-made and re-argued every time the world moves. A derived one is a
 * data refresh. It also means the ladder Rion climbs is the real one.
 */

import { readFileSync, writeFileSync } from 'node:fs'

/** Rank as published 20 July 2026, for the teams on our roster only. */
const FIFA_RANK = {
  spain: 1,
  argentina: 2,
  france: 3,
  england: 4,
  brazil: 5,
  morocco: 6,
  portugal: 7,
  belgium: 8,
  netherlands: 9,
  mexico: 10,
  colombia: 11,
  germany: 12,
  croatia: 13,
  switzerland: 14,
  italy: 15,
  usa: 16,
  japan: 17,
  senegal: 18,
  norway: 19,
  uruguay: 20,
  denmark: 21,
  iran: 22,
  austria: 23,
  egypt: 24,
  ecuador: 25,
  nigeria: 26,
  turkiye: 27,
  australia: 28,
  algeria: 29,
  canada: 30,
  ivorycoast: 31,
  korea: 32,
  paraguay: 34,
  poland: 36,
  sweden: 37,
  wales: 38,
  serbia: 40,
  congodr: 41,
  scotland: 42,
  cameroon: 43,
  panama: 44,
  czechia: 48,
  chile: 49,
  peru: 50,
  southafrica: 54,
  tunisia: 57,
  saudi: 58,
  qatar: 59,
  uzbekistan: 60,
  bosnia: 61,
  iraq: 63,
  capeverde: 64,
  ghana: 65,
  jordan: 73,
  curacao: 82,
  newzealand: 86,
  haiti: 88,
}

/**
 * Our rating scale.
 *
 * Spaced by *position on our roster* rather than by raw FIFA points. Points
 * would be more faithful to real strength gaps, but Spain lead Brazil by 191
 * points after winning the tournament, and mapping that literally drops Brazil
 * into the low 80s and leaves a cliff at the top of the table. Even spacing
 * gives a ladder where every rung up is worth something, and the ORDER is still
 * exactly FIFA's.
 */
const TOP = 92
const BOTTOM = 55

/** Tier by position, so the number of sides in each band stays sane. */
const TIER_CUTS = [8, 22, 44]

const path = 'src/data/opponents.ts'
const src = readFileSync(path, 'utf8')

const entries = [...src.matchAll(/^\s*(\{ id: '([^']+)',[\s\S]*?\}),$/gm)].map((m) => ({
  id: m[2],
  text: m[1],
}))

const missing = entries.filter((e) => FIFA_RANK[e.id] === undefined)
if (missing.length) throw new Error(`no FIFA rank for: ${missing.map((e) => e.id).join(', ')}`)
const extra = Object.keys(FIFA_RANK).filter((id) => !entries.some((e) => e.id === id))
if (extra.length) throw new Error(`rank given for unknown id: ${extra.join(', ')}`)

const ordered = [...entries].sort((a, b) => FIFA_RANK[a.id] - FIFA_RANK[b.id])
const step = (TOP - BOTTOM) / (ordered.length - 1)

const plan = ordered.map((e, i) => ({
  id: e.id,
  fifa: FIFA_RANK[e.id],
  rating: Math.round(TOP - i * step),
  tier: i < TIER_CUTS[0] ? 1 : i < TIER_CUTS[1] ? 2 : i < TIER_CUTS[2] ? 3 : 4,
  text: e.text
    .replace(/rating: [\d.]+, tier: \d/, `rating: ${Math.round(TOP - i * step)}, tier: ${i < TIER_CUTS[0] ? 1 : i < TIER_CUTS[1] ? 2 : i < TIER_CUTS[2] ? 3 : 4}`),
}))

for (const p of plan) {
  console.log(
    `${String(p.fifa).padStart(3)}  ${p.id.padEnd(13)} rating ${String(p.rating).padStart(3)}  tier ${p.tier}`,
  )
}

/**
 * No team's card may clip the 0–99 scale.
 *
 * `opponentCard` re-centres a team's specialism nudges on their own mean so the
 * six stats average back to the stated rating — which is what keeps a side's
 * card and its place in the table agreeing. Clamping breaks that silently.
 * Spain at 95 with a +7 passing nudge was landing on 100.8, clipping to 99, and
 * putting their card two thirds of a point below their rating.
 *
 * Checked here rather than left to a unit test because the fix is to move TOP,
 * and this is the only place that knows what TOP is.
 */
for (const p of plan) {
  const nudges = Object.values(
    JSON.parse(
      (p.text.match(/specialism: \{([^}]*)\}/)?.[1] ?? '')
        .replace(/(\w+):/g, '"$1":')
        .replace(/^(.*)$/, '{$1}'),
    ),
  )
  if (nudges.length === 0) continue
  const mean = nudges.reduce((t, n) => t + n, 0) / 6
  const highest = p.rating + Math.max(...nudges) - mean
  const lowest = p.rating + Math.min(...nudges) - mean
  if (highest > 99 || lowest < 0) {
    throw new Error(
      `${p.id} would clip: stats span ${lowest.toFixed(1)}..${highest.toFixed(1)} ` +
        `at rating ${p.rating}. Lower TOP or soften the specialism.`,
    )
  }
}

const HEADINGS = {
  1: '  // ---- Tier 1: the very best in the world right now ----',
  2: '  // ---- Tier 2: strong sides ----',
  3: '  // ---- Tier 3: solid ----',
  4: '  // ---- Tier 4: developing ----',
}

// Rebuild the whole array in rank order, so the tier headings can never drift
// away from the tiers they claim to introduce.
const lines = []
let tier = 0
for (const p of plan) {
  if (p.tier !== tier) {
    tier = p.tier
    if (lines.length) lines.push('')
    lines.push(HEADINGS[tier])
  }
  lines.push(`  ${p.text}, // FIFA ${p.fifa}`)
}

const block = `export const OPPONENTS: readonly Opponent[] = [\n${lines.join('\n')}\n] as const`
const out = src.replace(
  /export const OPPONENTS: readonly Opponent\[\] = \[[\s\S]*?\n\] as const/,
  block,
)
if (out === src) throw new Error('could not find the OPPONENTS block to replace')

writeFileSync(path, out)
console.log(`\nrewrote ${plan.length} entries in ${path}, in rank order`)
