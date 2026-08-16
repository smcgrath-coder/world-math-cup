/**
 * The saved game: one blob in `localStorage`, and the only thing in the app
 * that is allowed to write it.
 *
 * The log is append-only. Everything the player sees about himself is derived
 * from it by `derive.ts`, so this file's whole job is to make sure that what
 * comes back off the disk is something `derive` can safely fold. Two rules
 * follow from that, and they are the reason this file is longer than a
 * `JSON.parse` wrapper:
 *
 * **Nothing that comes off the disk is trusted.** A non-finite `difficulty`
 * produces a `NaN` rating, and a `NaN` rating silently defeats the hard floor
 * and poisons every stat downstream — a fuzz over corrupt logs found exactly
 * that. A truncated write, a full quota, or a curious parent with the devtools
 * open all produce precisely that shape. So every attempt is validated on the
 * way in, bad ones are dropped rather than repaired, and the count is reported
 * instead of being swallowed. `derive` also clamps, so this is the outer of two
 * rails rather than the only one.
 *
 * **A corrupt store must never be a white screen.** Anything unreadable falls
 * back to defaults. Losing a season is bad; a ten-year-old opening the app to a
 * stack trace is worse, and he cannot fix it himself.
 *
 * Ids are a zero-padded counter, so they sort lexically in the order they were
 * appended. `derive` breaks ties on `(at, id)`, so two answers stamped the same
 * millisecond must still fold in the order they happened — including after a
 * reload, which rules out anything random.
 */

import type { Attempt, AttemptContext, ShotChoice } from './types'

export const STORAGE_KEY = 'wmc_v1'
export const SCHEMA_VERSION = 1

/**
 * A flag, as the store needs to know it.
 *
 * Deliberately minimal and structural: Task 13 owns the layout and charge
 * vocabularies and the SVG renderer, and will narrow these strings to unions
 * there. Persistence only needs to know the shape well enough to tell a real
 * flag from a corrupt one.
 */
export interface FlagSpec {
  layout: string
  colors: [string, string, string]
  charge: string
  chargeColor: string
}

export interface Country {
  name: string
  flag: FlagSpec
  /** Shirt and trim. */
  kit: [string, string]
  /** World Cup titles won in-game, worn above the crest. */
  stars: number
}

export interface Settings {
  /**
   * The global off switch for every clock in the game.
   *
   * Timed maths cost this child recess and produced meltdowns. There has to be
   * a single switch that makes all of it go away, and it lives here rather than
   * being threaded through each screen so that nothing can forget to check it.
   */
  timersEnabled: boolean
  soundEnabled: boolean
  coachExplainerSeen: boolean
}

export interface GameState {
  version: 1
  /** Null until the country creator has run. */
  country: Country | null
  /** Append-only. Nothing outside this module may reorder or remove entries. */
  attempts: Attempt[]
  settings: Settings
}

/** An attempt on its way in. The store owns the id. */
export type AttemptDraft = Omit<Attempt, 'id'>

export interface LoadReport {
  /** The blob was unreadable, and everything fell back to defaults. */
  corrupt: boolean
  /** Attempts thrown away because a field that drives the maths was unusable. */
  droppedAttempts: number
  /** The saved country failed validation, so the creator will run again. */
  droppedCountry: boolean
}

export interface LoadResult {
  state: GameState
  /** The next id number to hand out. */
  seq: number
  report: LoadReport
}

export const DEFAULT_SETTINGS: Settings = {
  timersEnabled: true,
  soundEnabled: true,
  coachExplainerSeen: false,
}

export function defaultState(): GameState {
  return {
    version: SCHEMA_VERSION,
    country: null,
    attempts: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

const cleanReport = (): LoadReport => ({
  corrupt: false,
  droppedAttempts: 0,
  droppedCountry: false,
})

// ---------------------------------------------------------------------------
// Ids

/**
 * Digits in an attempt id.
 *
 * Fixed width is the whole point: it makes string comparison agree with numeric
 * comparison, which is what lets `derive`'s `(at, id)` tie-break reproduce the
 * order the attempts were actually made in. Twelve digits is a trillion
 * attempts, which is comfortably more than a childhood.
 */
const ID_DIGITS = 12

/**
 * The largest counter the fixed width can hold.
 *
 * Past this the padding stops padding, ids start varying in length, and lexical
 * order silently inverts — `a9999999999999` compares as *greater* than
 * `a10000000000000`. That would reorder tied attempts on a reload and change the
 * ratings they fold into, which is the exact failure the fixed width exists to
 * prevent. A trillion attempts is not reachable by playing; a hand-edited or
 * truncated counter reaches it immediately, so it is clamped rather than
 * trusted.
 */
const MAX_SEQ = 10 ** ID_DIGITS - 1
const ID_PATTERN = new RegExp(`^a\\d{${ID_DIGITS}}$`)

/** A counter forced into the range the id format can actually represent. */
function safeSeq(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_SEQ, Math.max(1, Math.floor(value)))
}

export function attemptIdFor(seq: number): string {
  return `a${String(safeSeq(seq)).padStart(ID_DIGITS, '0')}`
}

/**
 * Whether `id` was minted by *this* device's counter, as opposed to arriving
 * from `mergeRemoteAttempts` (this device's own uploads bouncing back keep
 * their bare id too, so this is really "id has the shape the counter
 * produces" — see `sync/attemptMerge.ts`).
 *
 * The sync engine needs this to decide what to push: an attempt that already
 * carries another device's namespace (`ipad-a000042`) must never be pushed
 * back up under *this* device's id — that would relabel its origin and either
 * manufacture a phantom third copy or, worse, collide with the real device
 * that actually minted it.
 */
export function isLocallyMintedId(id: string): boolean {
  return ID_PATTERN.test(id)
}

/** The counter value an id was minted from, or 0 if it was not one of ours. */
function seqOf(id: string): number {
  return ID_PATTERN.test(id) ? Number(id.slice(1)) : 0
}

// ---------------------------------------------------------------------------
// Validation

/**
 * Written as an exhaustive record rather than a `Set` of strings so that adding
 * a context to the union fails to compile here instead of silently becoming a
 * value the validator throws away.
 */
const CONTEXTS: Record<AttemptContext, true> = {
  tryout: true,
  training: true,
  match: true,
  tackleback: true,
  penalty: true,
}

const SHOTS: Record<ShotChoice, true> = {
  wide: true,
  box: true,
  outside18: true,
  bicycle: true,
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isFilledString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Only finite numbers survive, so nothing downstream can read a `NaN` param. */
function cleanParams(value: unknown): Record<string, number> {
  if (!isObject(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, v] of Object.entries(value)) {
    if (isFiniteNumber(v)) out[key] = v
  }
  return out
}

/**
 * One attempt off the disk, or `null` if it cannot be trusted.
 *
 * The drop/repair line is drawn deliberately. A field that drives the rating
 * mathematics — `at`, `difficulty`, `latencyMs`, `correct`, `standardId`,
 * `context`, `id` — cannot be guessed at, so a bad one costs the whole attempt.
 * Everything else is presentation (`given`, `params`) or an optional tag
 * (`shot`, `misconceptionId`, `matchId`), and dropping a whole attempt over one
 * of those would throw away real rating history to fix a cosmetic problem. Those
 * are normalised instead.
 */
export function validateAttempt(value: unknown): Attempt | null {
  if (!isObject(value)) return null

  const { id, at, standardId, difficulty, latencyMs, correct, context } = value
  if (!isFilledString(id)) return null
  if (!isFiniteNumber(at)) return null
  if (!isFiniteNumber(difficulty)) return null
  if (!isFiniteNumber(latencyMs)) return null
  if (typeof correct !== 'boolean') return null
  if (!isFilledString(standardId)) return null
  if (typeof context !== 'string' || !(context in CONTEXTS)) return null

  const attempt: Attempt = {
    id,
    at,
    standardId,
    difficulty,
    params: cleanParams(value.params),
    given: typeof value.given === 'string' ? value.given : '',
    correct,
    latencyMs,
    context: context as AttemptContext,
  }

  if (typeof value.shot === 'string' && value.shot in SHOTS) attempt.shot = value.shot as ShotChoice
  if (isFilledString(value.misconceptionId)) attempt.misconceptionId = value.misconceptionId
  if (isFilledString(value.matchId)) attempt.matchId = value.matchId

  /*
   * `choices` does affect the mathematics, so by the rule above a bad one might
   * be expected to cost the whole attempt. It is normalised instead, for two
   * reasons. Its *absence* is meaningful rather than missing — every attempt
   * written before choices existed was a typed answer and scores correctly with
   * no floor at all — so there is no way to tell an old attempt from a corrupt
   * one. And dropping the attempt throws away all of its rating evidence to fix
   * a field that, at worst, scores one answer without its guess correction. The
   * smaller distortion wins.
   *
   * Two is the minimum a real choice can have. Anything below it would give
   * `floorFor` a floor of 1 or a division by zero.
   */
  if (isFiniteNumber(value.choices) && Number.isInteger(value.choices) && value.choices >= 2) {
    attempt.choices = value.choices
  }

  return attempt
}

/**
 * The saved country, or `null` if it is unusable and the creator should re-run.
 *
 * Exported for `sync/`: a country pulled from another device's household row
 * is exactly as untrusted as one read off local disk, and must be dropped
 * rather than applied if it does not validate — the same rule `validateAttempt`
 * exists for, extended to the one other piece of state that leaves the device.
 */
export function validateCountry(value: unknown): Country | null {
  if (!isObject(value)) return null
  if (!isFilledString(value.name)) return null
  if (!isFiniteNumber(value.stars)) return null

  const kit = value.kit
  if (!Array.isArray(kit) || kit.length !== 2 || !kit.every((c) => isFilledString(c))) return null

  const flag = value.flag
  if (!isObject(flag)) return null
  if (typeof flag.layout !== 'string' || typeof flag.charge !== 'string') return null
  if (typeof flag.chargeColor !== 'string') return null
  const colors = flag.colors
  if (!Array.isArray(colors) || colors.length !== 3 || !colors.every((c) => typeof c === 'string')) {
    return null
  }

  return {
    name: value.name,
    stars: value.stars,
    kit: [kit[0] as string, kit[1] as string],
    flag: {
      layout: flag.layout,
      charge: flag.charge,
      chargeColor: flag.chargeColor,
      colors: [colors[0] as string, colors[1] as string, colors[2] as string],
    },
  }
}

/** Only real booleans override a default, so `"no"` cannot read as `true`. Exported for `sync/`, same reasoning as `validateCountry`. */
export function validateSettings(value: unknown): Settings {
  const out = { ...DEFAULT_SETTINGS }
  if (!isObject(value)) return out
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof value[key] === 'boolean') out[key] = value[key]
  }
  return out
}

/**
 * Read a stored blob. Pure, total, and never throws — the store is a thin shell
 * over this, and the interesting tests point straight at it.
 *
 * NOTE — `version` is stamped on write and ignored on read. There is no v2 yet,
 * and refusing to read a version we do not recognise would mean a stamped-forward
 * blob costs a child his whole season. When there is a v2, its migration belongs
 * here; until then every field is validated individually anyway, so a
 * forward-stamped blob loads whatever still makes sense.
 */
export function parseState(raw: string | null): LoadResult {
  const report = cleanReport()
  // A missing key is a new player. An *empty* one is a write that went wrong,
  // and falls through to the corrupt path so the debug screen says so.
  if (raw === null) return { state: defaultState(), seq: 1, report }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: defaultState(), seq: 1, report: { ...report, corrupt: true } }
  }

  if (!isObject(parsed)) {
    return { state: defaultState(), seq: 1, report: { ...report, corrupt: true } }
  }

  const attempts: Attempt[] = []
  let maxSeq = 0
  if (Array.isArray(parsed.attempts)) {
    for (const candidate of parsed.attempts) {
      const attempt = validateAttempt(candidate)
      if (attempt === null) {
        report.droppedAttempts += 1
        continue
      }
      attempts.push(attempt)
      maxSeq = Math.max(maxSeq, seqOf(attempt.id))
    }
  }

  let country: Country | null = null
  if (parsed.country !== undefined && parsed.country !== null) {
    country = validateCountry(parsed.country)
    if (country === null) report.droppedCountry = true
  }

  // The counter is persisted, but the log is the authority when they disagree:
  // a truncated write can lose the counter while keeping the attempts, and a
  // reused id would let a reload change the order two tied attempts fold in.
  const savedSeq = isFiniteNumber(parsed.seq) ? parsed.seq : 1
  const seq = safeSeq(Math.max(savedSeq, maxSeq + 1))

  return {
    state: {
      version: SCHEMA_VERSION,
      country,
      attempts,
      settings: validateSettings(parsed.settings),
    },
    seq,
    report,
  }
}

// ---------------------------------------------------------------------------
// The store

/** What actually goes on the disk: the state, plus the id counter. */
interface Persisted extends GameState {
  seq: number
}

type Listener = () => void

export class GameStore {
  private readonly key: string
  private state: GameState
  private seq: number
  private report: LoadReport
  private persistError: string | null = null
  private listeners = new Set<Listener>()

  constructor(key: string = STORAGE_KEY) {
    this.key = key
    const loaded = parseState(readRaw(key))
    this.state = loaded.state
    this.seq = loaded.seq
    this.report = loaded.report
  }

  /**
   * The current state. Stable by reference between writes, because
   * `useSyncExternalStore` re-renders forever if the snapshot changes identity
   * on every call.
   */
  getState(): GameState {
    return this.state
  }

  /** What the last load had to throw away. For the debug screen. */
  getLoadReport(): LoadReport {
    return this.report
  }

  /** The last write failure, if any. A full quota is the realistic cause. */
  getPersistError(): string | null {
    return this.persistError
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Append one attempt, minting its id.
   *
   * Returns `null` if the attempt would have poisoned the log — the same rule
   * the load path applies, on the way in as well as on the way out, because a
   * `NaN` difficulty arriving from a bug upstream would otherwise corrupt the
   * live session and only be caught on the next reload. Refusing rather than
   * throwing: a bad attempt must not end a match.
   */
  appendAttempt(draft: AttemptDraft): Attempt | null {
    return this.appendAttempts([draft])[0] ?? null
  }

  /**
   * Append a batch in one write and one notification — a finished match flushes
   * fourteen attempts at once, and fourteen re-renders is not a thing to do to
   * a phone. Poisoned drafts are refused individually; the good ones still land.
   */
  appendAttempts(drafts: readonly AttemptDraft[]): Attempt[] {
    const added: Attempt[] = []
    let seq = this.seq

    for (const d of drafts) {
      const attempt = validateAttempt({ ...d, id: attemptIdFor(seq) })
      if (attempt === null) continue
      added.push(attempt)
      seq += 1
    }

    if (added.length === 0) return []

    this.seq = seq
    this.commit({ ...this.state, attempts: [...this.state.attempts, ...added] })
    return added
  }

  setCountry(country: Country): void {
    this.commit({ ...this.state, country })
  }

  updateSettings(patch: Partial<Settings>): void {
    this.commit({ ...this.state, settings: { ...this.state.settings, ...patch } })
  }

  /**
   * Fold in attempts pulled from another device during sync, with ids that are
   * already final.
   *
   * Deliberately distinct from `appendAttempts`, which mints a fresh id from
   * the local counter for every draft it is given. These ids are not drafts —
   * `sync/attemptMerge.ts` has already decided what each one must be (this
   * device's own bounced back under its existing bare id, another device's
   * namespaced by its origin) — and re-minting them here would hand every
   * synced attempt a *second*, different id on top of the one it already has,
   * duplicating it in the log on every single sync.
   *
   * Takes the already-merged array rather than a delta so the caller (the sync
   * engine) can do the dedup/validate pass with `foldRemoteAttempts`, which
   * returns the *same reference* when nothing changed — so this is a cheap
   * `===` no-op on every sync after the state has converged, exactly like
   * `mergeRemoteAttempts` deciding not to touch anything else.
   */
  mergeRemoteAttempts(nextAttempts: readonly Attempt[]): void {
    if (nextAttempts === this.state.attempts) return
    this.commit({ ...this.state, attempts: nextAttempts as Attempt[] })
  }

  /** The only sanctioned way to lose the log. */
  resetAll(): void {
    this.seq = 1
    this.report = cleanReport()
    this.commit(defaultState())
  }

  /** The whole save, formatted for a human to read. */
  exportJson(): string {
    return JSON.stringify({ ...this.state, seq: this.seq } satisfies Persisted, null, 2)
  }

  /**
   * Replace the save from a JSON blob, validating exactly as a load would.
   *
   * An unreadable blob leaves the current state untouched rather than wiping
   * it: import is a debugging tool, and a slip of the clipboard must not cost
   * a season.
   */
  importJson(json: string): LoadReport {
    const loaded = parseState(json)
    if (loaded.report.corrupt) return loaded.report
    this.seq = loaded.seq
    this.report = loaded.report
    this.commit(loaded.state)
    return loaded.report
  }

  private commit(next: GameState): void {
    this.state = next
    this.persist()
    for (const listener of [...this.listeners]) listener()
  }

  private persist(): void {
    try {
      const payload: Persisted = { ...this.state, seq: this.seq }
      localStorage.setItem(this.key, JSON.stringify(payload))
      this.persistError = null
    } catch (err) {
      // A full quota, Safari's private mode, or storage switched off entirely.
      // The in-memory log stays correct and play continues; the parent can see
      // what happened on the debug screen.
      this.persistError = err instanceof Error ? err.message : String(err)
    }
  }
}

/** Reading storage can throw outright when the browser has it disabled. */
function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

let shared: GameStore | null = null

/** The one store the app uses. */
export function getStore(): GameStore {
  if (shared === null) shared = new GameStore()
  return shared
}

export function resetStoreForTest(): void {
  shared = null
}
