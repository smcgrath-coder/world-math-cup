import { useEffect } from 'react'
import { currentSfx } from './sfx'
import { useSettings } from '../store/useGameState'

/**
 * Keeps the installed sfx module's mute state in step with the setting.
 *
 * A one-line sibling to `useMusicTrack`, mounted once rather than per screen:
 * sound effects have no "which one is playing" state for a screen to own,
 * only on or off, and every screen shares the same answer to that.
 */
export function useSfxEnabled(): void {
  const { soundEnabled } = useSettings()

  useEffect(() => {
    currentSfx()?.setEnabled(soundEnabled)
  }, [soundEnabled])
}
