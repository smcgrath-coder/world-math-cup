#!/usr/bin/env node
/**
 * Every asset the code asks for exists in the build, spelled exactly.
 *
 *     node scripts/check-assets.mjs
 *
 * This guards a failure that **cannot happen locally**. macOS filesystems are
 * case-insensitive and Cloudflare serves static assets case-sensitively, so
 * `Coach.png` referenced as `/art/coach.png` works on the machine it was built
 * on and 404s in production. That already happened once here.
 *
 * Nothing else catches it. The type checker sees a template literal, the tests
 * render into jsdom which fetches nothing, and `Character` is deliberately built
 * to render *nothing at all* when an image fails — so in production the picture
 * would simply never appear and no error would be reported anywhere.
 *
 * Runs as part of `npm run deploy`, before wrangler, so a bad build cannot ship.
 *
 * The lists are read out of the source rather than repeated here. A copy would
 * drift, and a drifted copy passes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'

/** Pull a declaration out of a source file, or die saying which one moved. */
function extract(file, pattern, what) {
  const found = readFileSync(file, 'utf8').match(pattern)
  if (!found) {
    console.error(
      `check-assets: could not find ${what} in ${file}.\n` +
        'The declaration moved or changed shape. Fix this script rather than ' +
        'deleting the check — it is the only thing standing between a ' +
        'misspelled asset and a silent 404 in production.',
    )
    process.exit(1)
  }
  return [...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const tracks = extract(
  'src/audio/music.ts',
  /export const TRACK_NAMES = \[([\s\S]*?)\] as const/,
  'TRACK_NAMES',
)

const characters = extract(
  'src/components/Character.tsx',
  /export type CharacterName =([\s\S]*?)\n\nexport interface/,
  'CharacterName',
)

const wanted = [
  ...tracks.map((name) => `/audio/${name}.m4a`),
  ...characters.map((name) => `/art/${name}.png`),
  '/favicon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/manifest.webmanifest',
]

// The manifest names its own icons, and those paths are as breakable as any.
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))
for (const icon of manifest.icons ?? []) wanted.push(icon.src)

/**
 * Case-exact: `existsSync` alone would pass on macOS for the very mistake this
 * exists to catch, so each name is checked against the directory listing.
 */
function present(path) {
  const at = path.lastIndexOf('/')
  const dir = join(DIST, path.slice(0, at))
  const name = path.slice(at + 1)
  if (!existsSync(dir)) return false
  return readdirSync(dir).includes(name)
}

const missing = [...new Set(wanted)].filter((path) => !present(path))

if (missing.length > 0) {
  console.error(`check-assets: ${missing.length} asset(s) missing from ${DIST}/:`)
  for (const path of missing) console.error(`  ${path}`)
  console.error('\nCheck the spelling, including capitals. Cloudflare is case-sensitive.')
  process.exit(1)
}

console.log(`check-assets: ${new Set(wanted).size} assets, all present and spelled right`)
