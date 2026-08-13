import { describe, expect, it } from 'vitest'
import { createMusic, FADE_MS, MASTER_VOLUME } from './music'
import type { MusicElement, TrackName } from './music'

/** A stand-in for `<audio>`, since jsdom has no media stack. */
class FakeElement implements MusicElement {
  loop = false
  volume = 1
  paused = true
  plays = 0
  /** When set, `play()` rejects the way a browser does before a gesture. */
  refuse = false

  play(): Promise<void> {
    if (this.refuse) return Promise.reject(new Error('NotAllowedError'))
    this.plays += 1
    this.paused = false
    return Promise.resolve()
  }

  pause(): void {
    this.paused = true
  }
}

function harness() {
  const made = new Map<string, FakeElement>()
  const music = createMusic({
    srcFor: (track) => track,
    create: (src) => {
      const el = new FakeElement()
      made.set(src, el)
      return el
    },
  })
  const el = (track: TrackName) => made.get(track)
  return { music, made, el }
}

/** Run enough ticks for any fade to have finished. */
function settle(music: ReturnType<typeof createMusic>) {
  for (let i = 0; i < 40; i++) music.step(FADE_MS / 10)
}

describe('createMusic', () => {
  it('builds nothing until a track is wanted', () => {
    const { music, made } = harness()
    music.step(100)
    expect(made.size).toBe(0)
  })

  it('only builds the tracks it is asked for, so unplayed music is never downloaded', () => {
    const { music, made } = harness()
    music.want('main_theme')
    settle(music)
    music.want('training_grounds')
    settle(music)
    expect([...made.keys()].sort()).toEqual(['main_theme', 'training_grounds'])
  })

  it('loops, because the files are built as loops', () => {
    const { music, el } = harness()
    music.want('main_theme')
    expect(el('main_theme')!.loop).toBe(true)
  })

  it('starts inside the call rather than waiting for a tick', () => {
    // iOS only allows playback that begins during the gesture that asked for it.
    const { music, el } = harness()
    music.want('main_theme')
    expect(el('main_theme')!.plays).toBe(1)
  })

  it('fades in from silence rather than arriving at full volume', () => {
    const { music, el } = harness()
    music.want('main_theme')
    expect(el('main_theme')!.volume).toBe(0)

    music.step(FADE_MS / 4)
    const quarter = el('main_theme')!.volume
    expect(quarter).toBeGreaterThan(0)
    expect(quarter).toBeLessThan(MASTER_VOLUME)

    settle(music)
    expect(el('main_theme')!.volume).toBeCloseTo(MASTER_VOLUME, 5)
  })

  it('never goes above the master ceiling', () => {
    const { music, el } = harness()
    music.want('tournament')
    for (let i = 0; i < 200; i++) {
      music.step(FADE_MS)
      expect(el('tournament')!.volume).toBeLessThanOrEqual(MASTER_VOLUME)
    }
  })

  it('crossfades: the old loop is still audible while the new one comes up', () => {
    const { music, el } = harness()
    music.want('tournament')
    settle(music)

    music.want('match_ambience')
    music.step(FADE_MS / 2)

    // Both sounding at once is the point. A switch that silenced the old track
    // first would leave a hole.
    expect(el('tournament')!.volume).toBeGreaterThan(0)
    expect(el('match_ambience')!.volume).toBeGreaterThan(0)
    expect(el('tournament')!.paused).toBe(false)
  })

  it('pauses the old loop once it has faded out, but keeps its position', () => {
    const { music, el } = harness()
    music.want('tournament')
    settle(music)
    music.want('match_ambience')
    settle(music)

    expect(el('tournament')!.paused).toBe(true)
    expect(el('tournament')!.volume).toBe(0)
    expect(el('match_ambience')!.volume).toBeCloseTo(MASTER_VOLUME, 5)

    // Coming back resumes rather than rebuilding, so the loop picks up where it
    // was instead of restarting.
    music.want('tournament')
    expect(el('tournament')!.plays).toBe(2)
  })

  it('fades to silence on null', () => {
    const { music, el } = harness()
    music.want('main_theme')
    settle(music)
    music.want(null)
    settle(music)
    expect(el('main_theme')!.volume).toBe(0)
    expect(el('main_theme')!.paused).toBe(true)
  })

  it('reports what it was last asked for', () => {
    const { music } = harness()
    expect(music.wanted()).toBe(null)
    music.want('training_grounds')
    expect(music.wanted()).toBe('training_grounds')
  })
})

describe('the sound switch', () => {
  it('fades out when turned off rather than cutting', () => {
    const { music, el } = harness()
    music.want('main_theme')
    settle(music)

    music.setEnabled(false)
    music.step(FADE_MS / 4)
    expect(el('main_theme')!.volume).toBeGreaterThan(0)

    settle(music)
    expect(el('main_theme')!.paused).toBe(true)
  })

  it('does not download anything while it is off', () => {
    const { music, made } = harness()
    music.setEnabled(false)
    music.want('main_theme')
    expect(made.size).toBe(0)
  })

  it('comes back to the track the screen still wants', () => {
    const { music, el } = harness()
    music.want('match_ambience')
    settle(music)
    music.setEnabled(false)
    settle(music)

    music.setEnabled(true)
    settle(music)
    expect(el('match_ambience')!.volume).toBeCloseTo(MASTER_VOLUME, 5)
  })
})

describe('autoplay blocking', () => {
  it('does not retry on every tick after the browser refuses', async () => {
    const { music, el } = harness()
    music.want('main_theme')
    const audio = el('main_theme')!
    audio.refuse = true
    // The `want` above already attempted once and resolved; make the element
    // refuse and drive it from a paused state.
    audio.pause()
    music.step(1)
    await Promise.resolve()

    const before = audio.plays
    for (let i = 0; i < 20; i++) music.step(FADE_MS / 10)
    expect(audio.plays).toBe(before)
  })

  it('starts on the first tap once the browser allows it', async () => {
    const { music, el } = harness()
    music.want('main_theme')
    const audio = el('main_theme')!
    audio.refuse = true
    audio.pause()
    music.step(1)
    await Promise.resolve()

    audio.refuse = false
    music.resume()
    expect(audio.paused).toBe(false)
  })

  it('ignores a tap when the sound is off', () => {
    const { music, made } = harness()
    music.setEnabled(false)
    music.want('main_theme')
    music.resume()
    expect(made.size).toBe(0)
  })
})
