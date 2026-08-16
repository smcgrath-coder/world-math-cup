/**
 * Whether this build even knows how to reach Supabase, and the credentials if so.
 *
 * Mirrors `finns-chores`' own `supabaseConfigured()` gate: the whole Family
 * row in Settings is absent, not disabled-and-explained, when these are
 * unset — a control that promises something and does not work is worse than
 * no control at all. Vite only inlines `VITE_`-prefixed variables into the
 * client bundle; see `.env.example` for the two names this expects.
 */

export interface SyncEnv {
  url: string
  anonKey: string
}

export function getSyncEnv(): SyncEnv | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function isSyncConfigured(): boolean {
  return getSyncEnv() !== null
}
