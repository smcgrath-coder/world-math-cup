#!/usr/bin/env node
/**
 * Builds `src/curriculum/standards.generated.ts` from the vendored Montana
 * Mathematics Content Standards (2026) CASE export.
 *
 * The CSV is parsed here, once, at build time — never at runtime. The standards
 * are a fixed input that changes at most once a year, so shipping a CSV parser
 * to the browser and awaiting a load before the first question can be asked
 * would buy nothing.
 *
 * Run with: npm run build:standards
 *
 * Output is deterministic: same CSV in, byte-identical file out. Nothing here
 * may depend on the clock, the filesystem order, or anything else that varies
 * between runs.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_CSV = 'docs/curriculum/montana-math-standards-2026-CASE.csv'
const SCRIPT = 'scripts/build-standards.mjs'
const OUTPUT_TS = 'src/curriculum/standards.generated.ts'

const EXPECTED_HEADER = [
  'Item Type',
  'Sequence',
  'Human Code',
  'Full Statement',
  'Ed. Level',
  'Last Modified',
]
const EXPECTED_DATA_ROWS = 535

/** Grades this game covers: refresh grade 4, then carry grade 5 through the year. */
const GRADES = { '04': 4, '05': 5 }
/** Curricular order, used to group the generated output. */
const DOMAIN_ORDER = ['OA', 'NBT', 'NF', 'MD', 'G']
/** The five domains become five of the six player-card stats; PAC is fluency. */
const DOMAIN_TO_STAT = { OA: 'PAS', NBT: 'DEF', NF: 'DRI', MD: 'PHY', G: 'SHO' }
const CODE_RE = /^MT\.(\d)\.([A-Z]+)/

/** Documented counts. A mismatch means the parser is wrong, not the numbers. */
const EXPECTED_STANDARD_COUNTS = {
  4: { OA: 5, NBT: 6, NF: 7, MD: 7, G: 3 },
  5: { OA: 3, NBT: 7, NF: 7, MD: 5, G: 4 },
}

function fail(message) {
  console.error(`build-standards: ${message}`)
  process.exit(1)
}

/**
 * RFC 4180 CSV parser.
 *
 * `Full Statement` fields carry commas, quoted sections and doubled quote
 * escapes ("" for a literal quote), so splitting on commas would corrupt them.
 * Embedded newlines inside quoted fields are handled too — the current export
 * has none, but a future one is not obliged to stay that way.
 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    // A quote only opens a quoted section at the very start of a field;
    // anywhere else it is a literal character.
    if (ch === '"' && field === '') {
      quoted = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    field += ch
    i += 1
  }

  if (quoted) fail('CSV ended inside a quoted field — the source file is malformed')
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Sorts `MT.4.NF.10` after `MT.4.NF.9`, and `MT.4.NF.3` before `MT.4.NF.3.a`. */
function compareCodes(a, b) {
  const as = a.split('.')
  const bs = b.split('.')
  for (let i = 0; i < Math.max(as.length, bs.length); i += 1) {
    const x = as[i]
    const y = bs[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y)
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

function tsString(value) {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`
}

// ---------------------------------------------------------------------------

const csvPath = join(ROOT, SOURCE_CSV)
// The export is UTF-8 with a BOM; strip it so the first header cell matches.
const raw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
const rows = parseCsv(raw)

const [header, ...data] = rows
if (header === undefined) fail('CSV is empty')
if (header.join('|') !== EXPECTED_HEADER.join('|')) {
  fail(`unexpected CSV header: ${JSON.stringify(header)}`)
}
if (data.length !== EXPECTED_DATA_ROWS) {
  fail(`expected ${EXPECTED_DATA_ROWS} data rows, parsed ${data.length}`)
}

const standards = []
for (const row of data) {
  if (row.length !== EXPECTED_HEADER.length) {
    fail(`row has ${row.length} fields, expected ${EXPECTED_HEADER.length}: ${JSON.stringify(row)}`)
  }
  const [itemType, , code, statement, edLevel] = row
  if (!Object.hasOwn(GRADES, edLevel)) continue
  if (itemType !== 'Standard' && itemType !== 'Component') continue

  const match = code.match(CODE_RE)
  if (match === null) fail(`Human Code "${code}" does not look like MT.<grade>.<domain>...`)
  const domain = match[2]
  if (!DOMAIN_ORDER.includes(domain)) fail(`unknown domain "${domain}" in "${code}"`)

  const grade = GRADES[edLevel]
  if (Number(match[1]) !== grade) {
    fail(`"${code}" claims grade ${match[1]} but its Ed. Level is ${edLevel}`)
  }

  // Statements are preserved verbatim apart from surrounding whitespace.
  // The `*...*` emphasis wrapping a parent statement on Component rows is
  // content, not formatting noise — a later task decides how to render it.
  const text = statement.trim()
  if (text === '') fail(`"${code}" has an empty Full Statement`)

  const standard = { id: code, grade, domain, statement: text, itemType }
  if (itemType === 'Component') {
    const parentId = code.slice(0, code.lastIndexOf('.'))
    if (parentId === '' || parentId === code) fail(`cannot derive a parent for "${code}"`)
    standard.parentId = parentId
  }
  standards.push(standard)
}

standards.sort(
  (a, b) =>
    a.grade - b.grade ||
    DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) ||
    compareCodes(a.id, b.id),
)

// --- sanity checks: loud failure beats a quietly wrong data file ------------

const ids = new Set(standards.map((s) => s.id))
if (ids.size !== standards.length) fail('duplicate standard ids')
for (const s of standards) {
  if (s.itemType === 'Component' && !ids.has(s.parentId)) {
    fail(`component "${s.id}" has no parent "${s.parentId}" in the selected rows`)
  }
}

for (const [grade, byDomain] of Object.entries(EXPECTED_STANDARD_COUNTS)) {
  for (const [domain, expected] of Object.entries(byDomain)) {
    const actual = standards.filter(
      (s) => s.itemType === 'Standard' && s.grade === Number(grade) && s.domain === domain,
    ).length
    if (actual !== expected) {
      fail(`grade ${grade} ${domain}: expected ${expected} standards, got ${actual}`)
    }
  }
}

// --- emit ------------------------------------------------------------------

const lines = []
const push = (line = '') => lines.push(line)

push('/**')
push(' * GENERATED FILE — DO NOT EDIT BY HAND.')
push(' *')
push(` * Source: ${SOURCE_CSV}`)
push(` * Script: ${SCRIPT}`)
push(' * Regenerate: npm run build:standards')
push(' *')
push(' * The Montana Mathematics Content Standards (2026) for grades 4 and 5,')
push(' * parsed from the CASE export at build time so nothing has to parse CSV in')
push(' * the browser. Edit the CSV or the script, then regenerate — hand edits here')
push(' * are lost on the next run.')
push(' */')
push()
push("export type DomainCode = 'OA' | 'NBT' | 'NF' | 'MD' | 'G'")
push("export type CardStat = 'PAC' | 'SHO' | 'PAS' | 'DRI' | 'DEF' | 'PHY'")
push()
push('export interface Standard {')
push('  /** Montana code, e.g. `MT.4.NF.3`. */')
push('  id: string')
push('  grade: 4 | 5')
push('  domain: DomainCode')
push('  /** Verbatim `Full Statement`, including any `*...*` emphasis. */')
push('  statement: string')
push("  itemType: 'Standard' | 'Component'")
push('  /** Components only: the id of the standard they sit under. */')
push('  parentId?: string')
push('}')
push()
push('export const STANDARDS: Standard[] = [')
for (const s of standards) {
  push('  {')
  push(`    id: ${tsString(s.id)},`)
  push(`    grade: ${s.grade},`)
  push(`    domain: ${tsString(s.domain)},`)
  push(`    statement: ${tsString(s.statement)},`)
  push(`    itemType: ${tsString(s.itemType)},`)
  if (s.parentId !== undefined) push(`    parentId: ${tsString(s.parentId)},`)
  push('  },')
}
push(']')
push()
push('/**')
push(' * Each domain drives one stat on the player card. The sixth stat, PAC, is')
push(' * fluency — speed rather than any single domain — so nothing maps to it.')
push(' */')
push('export const DOMAIN_TO_STAT: Record<DomainCode, CardStat> = {')
for (const domain of DOMAIN_ORDER) {
  push(`  ${domain}: ${tsString(DOMAIN_TO_STAT[domain])},`)
}
push('}')
push()
push('/** Built once here so downstream modules can look up by id without rebuilding it. */')
push('export const STANDARDS_BY_ID: Record<string, Standard> = Object.fromEntries(')
push('  STANDARDS.map((s) => [s.id, s]),')
push(')')
push()

const output = lines.join('\n')
mkdirSync(join(ROOT, dirname(OUTPUT_TS)), { recursive: true })
writeFileSync(join(ROOT, OUTPUT_TS), output, 'utf8')

const count = (grade, itemType) =>
  standards.filter((s) => s.grade === grade && s.itemType === itemType).length
console.log(
  `build-standards: ${data.length} CSV rows → ${standards.length} entries ` +
    `(grade 4: ${count(4, 'Standard')} standards + ${count(4, 'Component')} components, ` +
    `grade 5: ${count(5, 'Standard')} standards + ${count(5, 'Component')} components) ` +
    `→ ${OUTPUT_TS}`,
)
