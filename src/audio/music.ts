/**
 * One music loop at a time, crossfaded.
 *
 * The files in `public/audio` were built into true loops (see
 * `scripts/build-audio.py`), so playback needs nothing clever: an `<audio>` with
 * `loop` set repeats seamlessly on its own. All this module does is decide which
 * one is playing and ride the volume between them.
 *
 * Two things it does not do, on purpose:
 *
 * It never cuts. A hard switch from the tournament theme to match ambience the
 * instant a fixture opens sounds like a bug, so every change is a fade and the
 * old loop keeps playing underneath until it is gone.
 *
 * It does not preload. Five tracks is 6MB, and pulling all of it on launch to
 * play one of them is a long wait on an iPad over a phone connection. An element
 * is built the first time its track is actually wanted, so a session that never
 * reaches a knockout never downloads the knockout music.
 */

export const TRACK_NAMES = [
  'main_theme',
  'tournament',
  'training_grounds',
  'match_ambience',
  'penalty_shootout',
] as const

export type TrackName = (typeof TRACK_NAMES)[number]

/**
 * The part of `HTMLAudioElement` this module touches.
 *
 * Narrow on purpose: jsdom has no real media stack, so tests stand a plain
 * object in here rather than asserting against a browser that is not there.
 */
export interface MusicElement {
  loop: boolean
  volume: number
  readonly paused: boolean
  play(): Promise<void> | undefined
  pause(): void
}

/**
 * Ceiling on every loop. The tracks are already mixed against each other at
 * build time; this is the one number that decides how loud the game is in a
 * room, and it is set to sit under a conversation rather than lead it.
 */
export const MASTER_VOLUME = 0.7

/** Long enough to read as a transition rather than a glitch. */
export const FADE_MS = 800

export interface Music {
  /** The loop that should be playing, or `null` for silence. */
  want(track: TrackName | null): void
  setEnabled(enabled: boolean): void
  /** Advance every fade by `dtMs`. Driven by a timer in the browser. */
  step(dtMs: number): void
  /** Retry anything the browser refused to start before it had a gesture. */
  resume(): void
  /** The gain currently applied to each live track, for tests and debugging. */
  levels(): Partial<Record<TrackName, number>>
  /** What `want` was last asked for, which is not yet what can be heard. */
  wanted(): TrackName | null
}

export interface MusicOptions {
  create?: (src: string) => MusicElement
  srcFor?: (track: TrackName) => string
}

function browserElement(src: string): MusicElement {
  const el = new Audio(src)
  el.preload = 'auto'
  return el
}

export function createMusic(options: MusicOptions = {}): Music {
  const create = options.create ?? browserElement
  const srcFor = options.srcFor ?? ((track: TrackName) => `/audio/${track}.m4a`)

  const elements = new Map<TrackName, MusicElement>()
  const gains = new Map<TrackName, number>()
  let target: TrackName | null = null
  let enabled = true

  /**
   * Set when the browser refused a `play()`.
   *
   * Every browser blocks audio until the page has been touched, so the first
   * `play()` after a cold load is expected to fail and is not an error. The flag
   * stops `step` from retrying sixty times a second until then; `resume`, wired
   * to the first tap anywhere, clears it.
   */
  let blocked = false

  function elementFor(track: TrackName): MusicElement {
    const existing = elements.get(track)
    if (existing) return existing
    const el = create(srcFor(track))
    el.loop = true
    el.volume = 0
    elements.set(track, el)
    gains.set(track, 0)
    return el
  }

  function start(el: MusicElement): void {
    // jsdom returns undefined here rather than a promise, hence the guard.
    const started = el.play()
    if (started && typeof started.catch === 'function') {
      started.catch(() => {
        blocked = true
      })
    }
  }

  return {
    want(track) {
      target = track
      if (track === null || !enabled) return
      // Built and started here rather than on the next tick because this call
      // usually sits inside the tap that caused it — kicking off, opening the
      // training ground — and starting inside the gesture is what lets iOS
      // allow it at all.
      const el = elementFor(track)
      if (el.paused) start(el)
    },

    setEnabled(next) {
      enabled = next
      if (next) {
        // Coming back from muted should not wait for a tap.
        blocked = false
        if (target !== null) {
          const el = elementFor(target)
          if (el.paused) start(el)
        }
      }
    },

    step(dtMs) {
      const delta = dtMs / FADE_MS
      for (const [track, el] of elements) {
        const goal = enabled && track === target ? 1 : 0
        const level = gains.get(track) ?? 0
        const next =
          level < goal ? Math.min(goal, level + delta) : Math.max(goal, level - delta)
        gains.set(track, next)
        el.volume = next * MASTER_VOLUME
        if (next <= 0) {
          // Paused rather than stopped: coming back to a screen picks the loop
          // up where it was, which is less noticeable than restarting it.
          if (!el.paused) el.pause()
        } else if (el.paused && !blocked) {
          start(el)
        }
      }
    },

    resume() {
      blocked = false
      if (!enabled || target === null) return
      const el = elementFor(target)
      if (el.paused) start(el)
    },

    levels() {
      return Object.fromEntries(gains) as Partial<Record<TrackName, number>>
    },

    wanted() {
      return target
    },
  }
}

// ---------------------------------------------------------------------------

/**
 * The instance the screens talk to.
 *
 * Installed explicitly from `main.tsx` rather than created on first use, so that
 * a test render does not reach for a media stack jsdom does not have. When
 * nothing is installed the hook is a no-op, which is exactly what a headless
 * test wants.
 */
let installed: Music | null = null

export function installMusic(music: Music | null): void {
  installed = music
}

export function currentMusic(): Music | null {
  return installed
}

/** Frequent enough that an 800ms fade is smooth, cheap enough to ignore. */
const TICK_MS = 50

/**
 * Build the real thing, start its clock, and arrange for the first tap to
 * un-block it. Browser only — call once, from `main.tsx`.
 */
export function installBrowserMusic(): Music {
  const music = createMusic()
  installMusic(music)

  let last = performance.now()
  setInterval(() => {
    const now = performance.now()
    music.step(now - last)
    last = now
  }, TICK_MS)

  // Not `once`: a tap can land while the tab is hidden or before the element
  // exists, and a retry that does nothing costs nothing.
  const retry = () => music.resume()
  document.addEventListener('pointerdown', retry)
  document.addEventListener('keydown', retry)

  return music
}
