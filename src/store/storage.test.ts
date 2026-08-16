import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attempt } from './types'
import { RATING_FLOOR, deriveRatings } from './derive'
import {
  DEFAULT_SETTINGS,
  GameStore,
  STORAGE_KEY,
  attemptIdFor,
  defaultState,
  getStore,
  isLocallyMintedId,
  parseState,
  resetStoreForTest,
} from './storage'
import type { AttemptDraft, Country, GameState } from './storage'

/** 2026-01-01T00:00:00Z. Nothing here reads the wall clock. */
const T0 = 1767225600000
const MINUTE = 60_000

function draft(over: Partial<AttemptDraft> = {}): AttemptDraft {
  return {
    at: T0,
    standardId: 'MT.4.NF.1',
    difficulty: 50,
    params: { a: 1, b: 2 },
    given: '1/2',
    correct: true,
    latencyMs: 8000,
    context: 'training',
    ...over,
  }
}

/** A stored attempt, as it would sit in the blob. */
function stored(n: number, over: Partial<Attempt> = {}): Attempt {
  return { id: attemptIdFor(n), ...draft(), at: T0 + n * MINUTE, ...over }
}

const COUNTRY: Country = {
  name: 'Riondia',
  flag: { layout: 'bands-h', colors: ['#ff0000', '#ffffff', '#0000ff'], charge: 'star', chargeColor: '#ffd700' },
  kit: ['#ff0000', '#ffffff'],
  stars: 0,
}

/** Write a blob straight into localStorage, bypassing the store. */
function seed(value: unknown): void {
  localStorage.setItem(STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value))
}

const raw = () => localStorage.getItem(STORAGE_KEY)

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('defaults', () => {
  it('an empty store loads the default state', () => {
    const store = new GameStore()
    expect(store.getState()).toEqual({
      version: 1,
      country: null,
      attempts: [],
      settings: DEFAULT_SETTINGS,
    })
  })

  it('defaults timers on, sound on, and the coach explainer unseen', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      timersEnabled: true,
      soundEnabled: true,
      coachExplainerSeen: false,
    })
  })

  it('reports a clean load', () => {
    const store = new GameStore()
    expect(store.getLoadReport()).toEqual({
      corrupt: false,
      droppedAttempts: 0,
      droppedCountry: false,
    })
  })

  it('does not write to storage merely by being constructed', () => {
    new GameStore()
    expect(raw()).toBeNull()
  })

  it('hands out a fresh default object each time, so one caller cannot mutate the next', () => {
    const a = defaultState()
    a.attempts.push(stored(1))
    expect(defaultState().attempts).toEqual([])
  })

  it('survives an environment with no localStorage at all', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    const store = new GameStore()
    expect(store.getState().attempts).toEqual([])
    spy.mockRestore()
  })
})

describe('appendAttempt', () => {
  it('assigns an id and returns the stored attempt', () => {
    const store = new GameStore()
    const a = store.appendAttempt(draft())
    expect(a).not.toBeNull()
    expect(a!.id).toBe(attemptIdFor(1))
    expect(store.getState().attempts).toEqual([a])
  })

  it('notifies subscribers', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    store.appendAttempt(draft())
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('notifies every subscriber', () => {
    const store = new GameStore()
    const a = vi.fn()
    const b = vi.fn()
    store.subscribe(a)
    store.subscribe(b)
    store.appendAttempt(draft())
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const store = new GameStore()
    const seen = vi.fn()
    const off = store.subscribe(seen)
    store.appendAttempt(draft())
    off()
    store.appendAttempt(draft())
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('unsubscribing twice is harmless', () => {
    const store = new GameStore()
    const seen = vi.fn()
    const off = store.subscribe(seen)
    off()
    off()
    store.appendAttempt(draft())
    expect(seen).not.toHaveBeenCalled()
  })

  it('replaces the attempts array rather than mutating the old snapshot', () => {
    const store = new GameStore()
    store.appendAttempt(draft())
    const before = store.getState()
    store.appendAttempt(draft())
    expect(before.attempts).toHaveLength(1)
    expect(store.getState().attempts).toHaveLength(2)
    expect(store.getState()).not.toBe(before)
  })

  it('returns a stable state reference while nothing is written', () => {
    // useSyncExternalStore re-renders forever if getSnapshot returns a new
    // object each call, so this is load-bearing rather than cosmetic.
    const store = new GameStore()
    expect(store.getState()).toBe(store.getState())
    store.appendAttempt(draft())
    const after = store.getState()
    expect(store.getState()).toBe(after)
  })

  it('persists across a reload of the same key', () => {
    const store = new GameStore()
    store.appendAttempt(draft({ standardId: 'MT.4.NF.2' }))
    const reloaded = new GameStore()
    expect(reloaded.getState().attempts).toHaveLength(1)
    expect(reloaded.getState().attempts[0]!.standardId).toBe('MT.4.NF.2')
  })

  it('appends a batch with one notification', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    const out = store.appendAttempts([draft(), draft(), draft()])
    expect(out).toHaveLength(3)
    expect(store.getState().attempts).toHaveLength(3)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('an empty batch changes nothing and notifies nobody', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    const before = store.getState()
    expect(store.appendAttempts([])).toEqual([])
    expect(store.getState()).toBe(before)
    expect(seen).not.toHaveBeenCalled()
  })

  it('refuses an attempt that would poison the ratings, rather than storing it', () => {
    const store = new GameStore()
    expect(store.appendAttempt(draft({ difficulty: Number.NaN }))).toBeNull()
    expect(store.appendAttempt(draft({ latencyMs: Number.POSITIVE_INFINITY }))).toBeNull()
    expect(store.getState().attempts).toEqual([])
  })

  it('does not notify subscribers about a refused attempt', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    store.appendAttempt(draft({ difficulty: Number.NaN }))
    expect(seen).not.toHaveBeenCalled()
  })

  it('keeps the good attempts from a batch containing a poisoned one', () => {
    const store = new GameStore()
    const out = store.appendAttempts([draft(), draft({ difficulty: Number.NaN }), draft()])
    expect(out).toHaveLength(2)
    expect(store.getState().attempts).toHaveLength(2)
  })

  it('a failed write does not throw and does not lose the in-memory log', () => {
    // Safari private browsing and a full quota both do exactly this. A child
    // must not see a white screen because the disk said no.
    const store = new GameStore()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => store.appendAttempt(draft())).not.toThrow()
    expect(store.getState().attempts).toHaveLength(1)
    expect(store.getPersistError()).toContain('QuotaExceededError')
    spy.mockRestore()
  })
})

describe('attempt ids', () => {
  it('sorts lexically in the order they were appended', () => {
    const store = new GameStore()
    const ids = Array.from({ length: 25 }, () => store.appendAttempt(draft())!.id)
    expect(ids.slice().sort()).toEqual(ids)
  })

  it('keeps rising across a reload', () => {
    const store = new GameStore()
    const first = store.appendAttempt(draft())!.id
    const second = new GameStore().appendAttempt(draft())!.id
    expect(second > first).toBe(true)
  })

  it('recovers the counter from the log when the counter itself is missing', () => {
    // A hand-edited store, or a write truncated after the attempts array.
    seed({ version: 1, country: null, settings: DEFAULT_SETTINGS, attempts: [stored(7), stored(8)] })
    const store = new GameStore()
    const next = store.appendAttempt(draft())!
    expect(next.id > attemptIdFor(8)).toBe(true)
  })

  it('never reuses an id after a counter that went backwards', () => {
    seed({ version: 1, country: null, settings: DEFAULT_SETTINGS, seq: 2, attempts: [stored(1), stored(9)] })
    const store = new GameStore()
    const next = store.appendAttempt(draft())!
    expect(store.getState().attempts.map((a) => a.id)).toEqual([
      attemptIdFor(1),
      attemptIdFor(9),
      next.id,
    ])
    expect(next.id > attemptIdFor(9)).toBe(true)
  })

  it('always mints an id of the same width, whatever the counter says', () => {
    // Past twelve digits the padding stops padding and lexical order inverts:
    // `a9999999999999` compares as greater than `a10000000000000`. A counter
    // that arrives corrupt must not be able to reorder the log.
    for (const seq of [1, 5, 1e15, 9.9e99, -3, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const id = attemptIdFor(seq)
      expect(id, `seq ${seq}`).toMatch(/^a\d{12}$/)
      expect(id.length, `seq ${seq}`).toBe(13)
    }
  })

  it('keeps ids sortable when the stored counter is nonsense', () => {
    for (const seq of [9.9e99, 1e15, -5, 'lots', null, Number.NaN]) {
      localStorage.clear()
      seed({ version: 1, country: null, settings: DEFAULT_SETTINGS, seq, attempts: [stored(1), stored(2)] })
      const store = new GameStore()
      const next = store.appendAttempt(draft())!
      expect(next.id, `seq ${String(seq)}`).toMatch(/^a\d{12}$/)
      const ids = store.getState().attempts.map((a) => a.id)
      expect(ids.slice().sort(), `seq ${String(seq)}`).toEqual(ids)
    }
  })

  it('breaks ties in the derive sort by insertion order for attempts sharing a millisecond', () => {
    // `derive` sorts by (at, id). Two answers stamped the same millisecond must
    // still fold in the order they happened, across a reload.
    const store = new GameStore()
    const ids = Array.from({ length: 5 }, () => store.appendAttempt(draft({ at: T0 }))!.id)
    const reloaded = new GameStore().getState().attempts
    const sorted = reloaded.slice().sort((a, b) => (a.at !== b.at ? a.at - b.at : a.id < b.id ? -1 : 1))
    expect(sorted.map((a) => a.id)).toEqual(ids)
  })

  it('writing twice and reloading preserves order', () => {
    const store = new GameStore()
    store.appendAttempt(draft({ standardId: 'MT.4.NF.1' }))
    store.appendAttempt(draft({ standardId: 'MT.4.NF.2' }))
    const one = new GameStore()
    one.appendAttempt(draft({ standardId: 'MT.4.NF.3' }))
    const two = new GameStore()
    two.appendAttempt(draft({ standardId: 'MT.4.NF.4' }))
    expect(new GameStore().getState().attempts.map((a) => a.standardId)).toEqual([
      'MT.4.NF.1',
      'MT.4.NF.2',
      'MT.4.NF.3',
      'MT.4.NF.4',
    ])
  })
})

describe('a corrupt blob', () => {
  const junk: [string, string][] = [
    ['unparseable', '{not json at all'],
    ['truncated mid-array', '{"version":1,"attempts":[{"id":"a0000000'],
    ['empty string', ''],
    ['the literal null', 'null'],
    ['an array', '[1,2,3]'],
    ['a number', '42'],
    ['a bare string', '"hello"'],
    ['a boolean', 'true'],
  ]

  for (const [name, blob] of junk) {
    it(`falls back to defaults for ${name}`, () => {
      seed(blob)
      const store = new GameStore()
      expect(store.getState()).toEqual(defaultState())
      expect(store.getLoadReport().corrupt).toBe(true)
    })
  }

  it('never throws, whatever it is handed', () => {
    for (const [, blob] of junk) {
      seed(blob)
      expect(() => new GameStore()).not.toThrow()
    }
  })

  it('treats a non-array attempts field as no attempts', () => {
    seed({ version: 1, country: null, settings: DEFAULT_SETTINGS, attempts: 'lots' })
    expect(new GameStore().getState().attempts).toEqual([])
  })
})

describe('attempt validation', () => {
  it('loads exactly three of three valid and two NaN-difficulty attempts, and reports two dropped', () => {
    seed({
      version: 1,
      country: null,
      settings: DEFAULT_SETTINGS,
      attempts: [
        stored(1),
        // `JSON.stringify(NaN)` is `null`, so this is what a real NaN looks
        // like once it has been through a write.
        { ...stored(2), difficulty: null },
        stored(3),
        // And this is what `1e999` in a hand-edited file parses back as.
        JSON.parse('{"id":"a000000000004","at":1,"standardId":"MT.4.NF.1","difficulty":1e999,"params":{},"given":"1","correct":true,"latencyMs":10,"context":"training"}'),
        stored(5),
      ],
    })
    const store = new GameStore()
    expect(store.getState().attempts).toHaveLength(3)
    expect(store.getLoadReport().droppedAttempts).toBe(2)
    expect(store.getState().attempts.map((a) => a.id)).toEqual([
      attemptIdFor(1),
      attemptIdFor(3),
      attemptIdFor(5),
    ])
  })

  const poison: [string, unknown][] = [
    ['a NaN difficulty', { difficulty: null }],
    ['a string difficulty', { difficulty: 'NaN' }],
    ['a missing difficulty', { difficulty: undefined }],
    ['a NaN timestamp', { at: null }],
    ['a string timestamp', { at: '2026-01-01' }],
    ['a NaN latency', { latencyMs: null }],
    ['a non-boolean correct', { correct: 'yes' }],
    ['a numeric correct', { correct: 1 }],
    ['a blank standardId', { standardId: '' }],
    ['a whitespace standardId', { standardId: '   ' }],
    ['a non-string standardId', { standardId: 42 }],
    ['an unknown context', { context: 'banana' }],
    ['a missing context', { context: undefined }],
    ['a blank id', { id: '' }],
    ['a non-string id', { id: 12 }],
    ['a null attempt', null],
    ['a string where an attempt should be', 'nope'],
  ]

  for (const [name, over] of poison) {
    it(`drops an attempt with ${name}`, () => {
      const bad = over === null || typeof over === 'string' ? over : { ...stored(2), ...over }
      seed({ version: 1, country: null, settings: DEFAULT_SETTINGS, attempts: [stored(1), bad, stored(3)] })
      const store = new GameStore()
      expect(store.getState().attempts).toHaveLength(2)
      expect(store.getLoadReport().droppedAttempts).toBe(1)
    })
  }

  it('keeps an attempt whose params are junk, because params do not drive the maths', () => {
    seed({
      version: 1,
      country: null,
      settings: DEFAULT_SETTINGS,
      attempts: [{ ...stored(1), params: { good: 3, bad: null, worse: 'x' } }, { ...stored(2), params: 'gone' }],
    })
    const store = new GameStore()
    expect(store.getState().attempts).toHaveLength(2)
    expect(store.getState().attempts[0]!.params).toEqual({ good: 3 })
    expect(store.getState().attempts[1]!.params).toEqual({})
    expect(store.getLoadReport().droppedAttempts).toBe(0)
  })

  it('drops an unknown shot rather than letting it reach the courage counters', () => {
    seed({
      version: 1,
      country: null,
      settings: DEFAULT_SETTINGS,
      attempts: [{ ...stored(1), shot: 'overhead' }, { ...stored(2), shot: 'bicycle' }],
    })
    const attempts = new GameStore().getState().attempts
    expect(attempts[0]!.shot).toBeUndefined()
    expect(attempts[1]!.shot).toBe('bicycle')
  })

  it('drops a non-string misconceptionId and matchId but keeps the attempt', () => {
    seed({
      version: 1,
      country: null,
      settings: DEFAULT_SETTINGS,
      attempts: [{ ...stored(1), misconceptionId: 7, matchId: {} }],
    })
    const a = new GameStore().getState().attempts[0]!
    expect(a.misconceptionId).toBeUndefined()
    expect(a.matchId).toBeUndefined()
  })

  it('coerces a non-string given rather than losing the rating history behind it', () => {
    seed({ version: 1, country: null, settings: DEFAULT_SETTINGS, attempts: [{ ...stored(1), given: 5 }] })
    const attempts = new GameStore().getState().attempts
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.given).toBe('')
  })

  it('what survives a poisoned blob cannot poison a rating', () => {
    // The property the whole validator exists for: no NaN reaches `derive`,
    // so the hard floor stays a floor.
    seed({
      version: 1,
      country: null,
      settings: DEFAULT_SETTINGS,
      attempts: [
        stored(1),
        { ...stored(2), difficulty: null },
        { ...stored(3), latencyMs: null },
        { ...stored(4), at: null },
        { ...stored(5), correct: 'yes' },
        stored(6, { correct: false }),
      ],
    })
    const ratings = deriveRatings(new GameStore().getState().attempts, T0 + 10 * MINUTE)
    for (const r of ratings.values()) {
      expect(Number.isFinite(r.rating)).toBe(true)
      expect(r.rating).toBeGreaterThanOrEqual(RATING_FLOOR)
    }
  })
})

describe('country and settings', () => {
  it('round-trips a country', () => {
    const store = new GameStore()
    store.setCountry(COUNTRY)
    expect(new GameStore().getState().country).toEqual(COUNTRY)
  })

  it('notifies on setCountry', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    store.setCountry(COUNTRY)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  const badCountries: [string, unknown][] = [
    ['a bare string', 'Riondia'],
    ['a blank name', { ...COUNTRY, name: '  ' }],
    ['a missing flag', { ...COUNTRY, flag: null }],
    ['a one-colour flag', { ...COUNTRY, flag: { ...COUNTRY.flag, colors: ['#fff'] } }],
    ['a one-colour kit', { ...COUNTRY, kit: ['#fff'] }],
    ['NaN stars', { ...COUNTRY, stars: null }],
  ]

  for (const [name, country] of badCountries) {
    it(`falls back to no country for ${name}, so the creator runs again`, () => {
      seed({ version: 1, country, settings: DEFAULT_SETTINGS, attempts: [] })
      const store = new GameStore()
      expect(store.getState().country).toBeNull()
      expect(store.getLoadReport().droppedCountry).toBe(true)
    })
  }

  it('a missing country is not a dropped country', () => {
    seed({ version: 1, settings: DEFAULT_SETTINGS, attempts: [] })
    expect(new GameStore().getLoadReport().droppedCountry).toBe(false)
  })

  it('merges a settings patch and keeps the rest', () => {
    const store = new GameStore()
    store.updateSettings({ timersEnabled: false })
    expect(store.getState().settings).toEqual({ ...DEFAULT_SETTINGS, timersEnabled: false })
    expect(new GameStore().getState().settings.timersEnabled).toBe(false)
  })

  it('takes only the settings that are actually booleans', () => {
    seed({
      version: 1,
      country: null,
      attempts: [],
      settings: { timersEnabled: 'no', soundEnabled: false, coachExplainerSeen: 1 },
    })
    expect(new GameStore().getState().settings).toEqual({
      timersEnabled: true,
      soundEnabled: false,
      coachExplainerSeen: false,
    })
  })

  it('ignores a settings blob that is not an object', () => {
    seed({ version: 1, country: null, attempts: [], settings: 'loud' })
    expect(new GameStore().getState().settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('resetAll', () => {
  it('clears everything and notifies', () => {
    const store = new GameStore()
    store.setCountry(COUNTRY)
    store.appendAttempt(draft())
    const seen = vi.fn()
    store.subscribe(seen)
    store.resetAll()
    expect(store.getState()).toEqual(defaultState())
    expect(seen).toHaveBeenCalledTimes(1)
    expect(new GameStore().getState()).toEqual(defaultState())
  })

  it('restarts ids from the beginning, and they still sort correctly', () => {
    const store = new GameStore()
    store.appendAttempt(draft())
    store.appendAttempt(draft())
    store.resetAll()
    expect(store.appendAttempt(draft())!.id).toBe(attemptIdFor(1))
  })
})

describe('export and import', () => {
  it('round-trips through JSON', () => {
    const store = new GameStore()
    store.setCountry(COUNTRY)
    store.appendAttempt(draft())
    store.appendAttempt(draft({ correct: false }))
    const json = store.exportJson()

    const fresh = new GameStore()
    fresh.resetAll()
    fresh.importJson(json)
    expect(fresh.getState()).toEqual(store.getState())
  })

  it('keeps ids rising after an import', () => {
    const store = new GameStore()
    store.appendAttempt(draft())
    store.appendAttempt(draft())
    const json = store.exportJson()

    const fresh = new GameStore()
    fresh.resetAll()
    fresh.importJson(json)
    expect(fresh.appendAttempt(draft())!.id).toBe(attemptIdFor(3))
  })

  it('exports something a human can read', () => {
    const store = new GameStore()
    store.appendAttempt(draft())
    expect(store.exportJson()).toContain('\n')
    expect(JSON.parse(store.exportJson()).attempts).toHaveLength(1)
  })

  it('reports dropped attempts on import', () => {
    const store = new GameStore()
    const report = store.importJson(
      JSON.stringify({
        version: 1,
        country: null,
        settings: DEFAULT_SETTINGS,
        attempts: [stored(1), { ...stored(2), difficulty: null }],
      }),
    )
    expect(report.droppedAttempts).toBe(1)
    expect(store.getState().attempts).toHaveLength(1)
  })

  it('leaves the existing state alone when the import is unreadable', () => {
    const store = new GameStore()
    store.appendAttempt(draft())
    const before = store.getState()
    const report = store.importJson('{ nope')
    expect(report.corrupt).toBe(true)
    expect(store.getState()).toBe(before)
  })

  it('notifies subscribers on a successful import only', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    store.importJson('garbage')
    expect(seen).not.toHaveBeenCalled()
    store.importJson(JSON.stringify(defaultState()))
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('parseState', () => {
  it('is pure — the same blob always parses the same way', () => {
    const blob = JSON.stringify({ version: 1, country: COUNTRY, settings: DEFAULT_SETTINGS, attempts: [stored(1)] })
    expect(parseState(blob)).toEqual(parseState(blob))
  })

  it('treats a null blob as an empty store rather than a corrupt one', () => {
    expect(parseState(null)).toEqual({ state: defaultState(), seq: 1, report: { corrupt: false, droppedAttempts: 0, droppedCountry: false } })
  })

  it('ignores an unknown schema version rather than refusing the save', () => {
    // There is no v2 yet. When there is, a migration belongs here — until then
    // a stamped-forward version must not cost a child his season.
    const state: GameState = { ...defaultState(), attempts: [stored(1)] }
    const result = parseState(JSON.stringify({ ...state, version: 9 }))
    expect(result.state.attempts).toHaveLength(1)
    expect(result.state.version).toBe(1)
  })
})

describe('isLocallyMintedId', () => {
  it('recognises exactly what attemptIdFor produces', () => {
    expect(isLocallyMintedId(attemptIdFor(1))).toBe(true)
    expect(isLocallyMintedId(attemptIdFor(999_999))).toBe(true)
  })

  it('rejects a namespaced id from sync — the whole reason this predicate exists', () => {
    expect(isLocallyMintedId(`ipad-${attemptIdFor(1)}`)).toBe(false)
  })

  it('rejects garbage without throwing', () => {
    expect(isLocallyMintedId('')).toBe(false)
    expect(isLocallyMintedId('a')).toBe(false)
    expect(isLocallyMintedId('not-an-id-at-all')).toBe(false)
  })
})

describe('mergeRemoteAttempts', () => {
  const synced = (id: string): Attempt => ({
    id,
    at: T0,
    standardId: 'MT.4.NF.1',
    difficulty: 50,
    params: {},
    given: '1/2',
    correct: true,
    latencyMs: 8000,
    context: 'training',
  })

  it('replaces the log with the array it is given', () => {
    const store = new GameStore()
    store.appendAttempt(draft())
    store.mergeRemoteAttempts([synced('ipad-a000001'), synced('ipad-a000002')])
    expect(store.getState().attempts.map((a) => a.id)).toEqual(['ipad-a000001', 'ipad-a000002'])
  })

  it('notifies subscribers when the log actually changes', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    store.mergeRemoteAttempts([synced('ipad-a000001')])
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('is a silent no-op when handed the exact array already held — the sync engine’s unchanged case', () => {
    const store = new GameStore()
    const seen = vi.fn()
    store.subscribe(seen)
    // `attemptMerge.foldRemoteAttempts` returns the *same reference* when a
    // sync found nothing new; this proves the store honours that contract
    // rather than re-committing (and re-rendering, and re-persisting) on
    // every opportunistic sync tick even when nothing changed.
    const current = store.getState().attempts
    store.mergeRemoteAttempts(current)
    expect(seen).not.toHaveBeenCalled()
  })

  it('persists across a reload, same as any other write', () => {
    const store = new GameStore()
    store.mergeRemoteAttempts([synced('ipad-a000001')])
    const reloaded = new GameStore()
    expect(reloaded.getState().attempts.map((a) => a.id)).toEqual(['ipad-a000001'])
  })

  it('does not disturb the local id counter — synced ids do not match the counter pattern', () => {
    const store = new GameStore()
    store.mergeRemoteAttempts([synced('ipad-a000001'), synced('a-not-a-real-counter-id')])
    // The next locally-minted attempt must still start from 1: nothing about
    // a synced id, however it is shaped, should be read as advancing the
    // local counter — that is `seqOf`'s job to ignore, and this is the
    // integration point where a regression there would actually bite.
    const a = store.appendAttempt(draft())
    expect(a!.id).toBe(attemptIdFor(1))
  })
})

describe('the shared store', () => {
  it('is the same instance every time', () => {
    expect(getStore()).toBe(getStore())
  })

  it('starts clean after resetStoreForTest', () => {
    getStore().appendAttempt(draft())
    resetStoreForTest()
    localStorage.clear()
    expect(getStore().getState().attempts).toEqual([])
  })
})
