import { useEffect } from 'react'
import { currentMusic } from './music'
import type { TrackName } from './music'
import { useSettings } from '../store/useGameState'

/**
 * Play `track` for as long as the calling screen wants it.
 *
 * Deliberately not a per-screen effect scattered through the app: `AppShell`
 * already knows which screen is showing and is the only caller, so there is one
 * place to look when the wrong music is playing.
 *
 * A no-op when no music is installed, which is the case in every test.
 */
export function useMusicTrack(track: TrackName | null): void {
  const { soundEnabled } = useSettings()

  useEffect(() => {
    const music = currentMusic()
    if (!music) return
    music.setEnabled(soundEnabled)
    music.want(soundEnabled ? track : null)
  }, [track, soundEnabled])
}
