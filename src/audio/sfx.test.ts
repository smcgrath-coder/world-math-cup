import { describe, expect, it } from 'vitest'
import { createSfx } from './sfx'
import type { SfxElement, SfxName } from './sfx'

/** A stand-in for `<audio>`, since jsdom has no media stack. */
class FakeElement implements SfxElement {
  currentTime = 0
  plays = 0
  /** When set, `play()` rejects — a browser does this for a missing file, a decode error, or an autoplay block alike. */
  refuse = false

  play(): Promise<void> {
    if (this.refuse) return Promise.reject(new Error('NotSupportedError'))
    this.plays += 1
    return Promise.resolve()
  }
}

function harness() {
  const made = new Map<string, FakeElement>()
  const sfx = createSfx({
    srcFor: (name) => name,
    create: (src) => {
      const el = new FakeElement()
      made.set(src, el)
      return el
    },
  })
  const el = (name: SfxName) => made.get(name)
  return { sfx, made, el }
}

describe('createSfx', () => {
  it('builds nothing until a sound is actually played', () => {
    const { made } = harness()
    expect(made.size).toBe(0)
  })

  it('only builds the sound it is asked for, so an unplayed effect is never downloaded', () => {
    const { sfx, made } = harness()
    sfx.play('goal')
    expect([...made.keys()]).toEqual(['goal'])
  })

  it('starts inside the call rather than waiting for a tick', () => {
    // Same reasoning as music: iOS only allows playback that begins during
    // the gesture that asked for it, and a goal beat is exactly that gesture.
    const { sfx, el } = harness()
    sfx.play('whistle')
    expect(el('whistle')!.plays).toBe(1)
  })

  it('reuses the element on a second play rather than building a new one', () => {
    const { sfx, made, el } = harness()
    sfx.play('save')
    sfx.play('save')
    expect(made.size).toBe(1)
    expect(el('save')!.plays).toBe(2)
  })

  it('rewinds before every play, so a second goal is heard even if the first is still finishing', () => {
    const { sfx, el } = harness()
    sfx.play('goal')
    el('goal')!.currentTime = 1.2
    sfx.play('goal')
    expect(el('goal')!.currentTime).toBe(0)
  })

  it('never throws when the browser refuses to play — a missing file included', async () => {
    const { sfx, el } = harness()
    sfx.play('crowd')
    expect(el('crowd')!.plays).toBe(1)

    el('crowd')!.refuse = true
    expect(() => sfx.play('crowd')).not.toThrow()
    await Promise.resolve()
    // The rejected attempt is silent, not an error surfaced anywhere, and it
    // does not retroactively count as a play either — the whole point of
    // shaping this after `music.ts` is that a file Scott has not shipped yet
    // behaves exactly like a browser that has not allowed audio yet.
    expect(el('crowd')!.plays).toBe(1)
  })

  it('builds each named sound independently', () => {
    const { sfx, made } = harness()
    sfx.play('goal')
    sfx.play('whistle')
    sfx.play('save')
    sfx.play('crowd')
    expect([...made.keys()].sort()).toEqual(['crowd', 'goal', 'save', 'whistle'])
  })
})

describe('the sound switch', () => {
  it('does not play, or download, anything while it is off', () => {
    const { sfx, made } = harness()
    sfx.setEnabled(false)
    sfx.play('goal')
    expect(made.size).toBe(0)
  })

  it('plays again once turned back on', () => {
    const { sfx, el } = harness()
    sfx.setEnabled(false)
    sfx.play('goal')
    sfx.setEnabled(true)
    sfx.play('goal')
    expect(el('goal')!.plays).toBe(1)
  })

  it('is on by default, the same as music starts wanting nothing rather than refusing everything', () => {
    const { sfx, el } = harness()
    sfx.play('save')
    expect(el('save')!.plays).toBe(1)
  })
})
