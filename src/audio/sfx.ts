/**
 * One-shot sound effects: a goal, a whistle, a save, the crowd.
 *
 * Shaped like `music.ts` on purpose, for two of its three reasons. It respects
 * `soundEnabled`, exactly the same setting music does. And it does not
 * preload — the file for a sound he may never trigger this session should not
 * cost anything until he does. The one thing it does not need from `music.ts`
 * is the crossfade machinery: an effect either fires or it does not, it never
 * fades into another one, so there is no `step` and no gain map here.
 *
 * **The files do not exist yet, and that is not a special case.** `playSfx`
 * reaching for a missing one produces the same rejected `play()` a browser
 * already hands back before the first tap, caught the same way music.ts
 * catches that. So this module is finished and correct before a single file
 * lands in `public/audio/sfx/` — wire the call sites now, drop files in
 * later, and they simply start being heard. `check-assets.mjs` does not learn
 * these names until the files actually exist; teaching it the names sooner
 * would fail every deploy between now and then for something missing by
 * design.
 */

export const SFX_NAMES = ['goal', 'whistle', 'save', 'crowd'] as const

export type SfxName = (typeof SFX_NAMES)[number]

/**
 * The part of `HTMLAudioElement` this module touches.
 *
 * Narrow for the same reason `music.ts`'s `MusicElement` is: jsdom has no real
 * media stack, so tests stand a plain object in here rather than asserting
 * against a browser that is not there.
 */
export interface SfxElement {
  currentTime: number
  play(): Promise<void> | undefined
}

export interface Sfx {
  play(name: SfxName): void
  setEnabled(enabled: boolean): void
}

export interface SfxOptions {
  create?: (src: string) => SfxElement
  srcFor?: (name: SfxName) => string
}

function browserElement(src: string): SfxElement {
  const el = new Audio(src)
  el.preload = 'none'
  return el
}

export function createSfx(options: SfxOptions = {}): Sfx {
  const create = options.create ?? browserElement
  const srcFor = options.srcFor ?? ((name: SfxName) => `/audio/sfx/${name}.m4a`)

  const elements = new Map<SfxName, SfxElement>()
  let enabled = true

  function elementFor(name: SfxName): SfxElement {
    const existing = elements.get(name)
    if (existing) return existing
    const el = create(srcFor(name))
    elements.set(name, el)
    return el
  }

  return {
    play(name) {
      if (!enabled) return
      // Built the first time it is actually wanted, same as a music track —
      // a session that never scores never downloads the goal sound.
      const el = elementFor(name)
      // Rewound rather than trusted to already be at the start: two goals in
      // the same match must both be heard, not the second one silently
      // dropped because the first was still finishing.
      el.currentTime = 0
      const started = el.play()
      if (started && typeof started.catch === 'function') {
        // A missing file, a decode error, an autoplay block before the first
        // tap — none of it is this module's business to report. Silence is
        // the correct outcome for every one of those, not only the one Scott
        // has not shipped yet.
        started.catch(() => {})
      }
    },

    setEnabled(next) {
      enabled = next
    },
  }
}

// ---------------------------------------------------------------------------

/**
 * The instance the app talks to.
 *
 * Installed explicitly from `main.tsx`, same as music — a test render never
 * reaches for a media stack jsdom does not have, and `playSfx` is a silent
 * no-op wherever nothing is installed.
 */
let installed: Sfx | null = null

export function installSfx(sfx: Sfx | null): void {
  installed = sfx
}

export function currentSfx(): Sfx | null {
  return installed
}

/** Fire and forget, from wherever the moment happens. */
export function playSfx(name: SfxName): void {
  currentSfx()?.play(name)
}

/** Build the real thing. Browser only — call once, from `main.tsx`. */
export function installBrowserSfx(): Sfx {
  const sfx = createSfx()
  installSfx(sfx)
  return sfx
}
