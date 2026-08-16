/**
 * "Family", the row Settings' grown-up section opens onto: linking this
 * device to a household so a save picks up on a second device, and nothing
 * else. Never a login wall — `Settings.tsx` only renders the row that opens
 * this at all when `isSyncConfigured()`, and this component itself never
 * runs unless a grown-up has already gone looking for it.
 *
 * Three states, driven entirely by `getLink()`:
 *
 *  - **Unlinked.** Join with a 6-character code, or start a new household.
 *    Both mirror `finns-chores`' own bootstrap flow, because a parent who
 *    already knows that shape should not have to learn a second one.
 *  - **Household known, no player chosen yet.** Pick an existing player or
 *    add one. In practice this is almost always "add Rion, once" — the
 *    picker exists so a second child is a row here rather than a rewrite.
 *  - **Linked.** The player's name, the invite code (for adding a third
 *    device later), when this device last synced, a manual "Sync now", and
 *    "Unlink this device" — which never touches the local save, only which
 *    household this device talks to. See `unlinkDevice` for why that
 *    distinction matters.
 *
 * Linking never wipes or replaces anything already on this device. A device
 * with real local play joining a brand-new household uploads that play on
 * its very first sync — there is no separate "migrate" step, because
 * `syncEngine`'s own safety property already treats a device's first-ever
 * sync as a genuine local edit relative to a never-synced baseline.
 */

import { useState } from 'react'
import { createSupabaseTransport } from '../sync/supabaseTransport'
import { getSyncEnv } from '../sync/config'
import { getLastSyncedAt, getLink, setLink, unlinkDevice } from '../sync/link'
import type { Link } from '../sync/link'
import { syncNow } from '../sync/syncNow'
import type { PlayerSummary, SyncTransport } from '../sync/transport'

type Step =
  | { kind: 'choose' }
  | { kind: 'join' }
  | { kind: 'create' }
  | { kind: 'pickPlayer'; householdId: string; inviteCode: string; players: PlayerSummary[] }
  | { kind: 'linked' }

function initialStep(): Step {
  return getLink() !== null ? { kind: 'linked' } : { kind: 'choose' }
}

export interface FamilySyncProps {
  /**
   * Overrides the real Supabase transport. Exists for tests —
   * `FamilySync.test.tsx` drives every flow through `createFakeTransport()`,
   * the same in-memory backend `syncEngine.test.ts` uses, rather than
   * mocking `@supabase/supabase-js` or hitting a network. Production never
   * passes this; `Settings.tsx` renders `<FamilySync />` with no props.
   */
  transport?: SyncTransport
}

export function FamilySync({ transport: injectedTransport }: FamilySyncProps = {}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [confirmingUnlink, setConfirmingUnlink] = useState(false)
  // Bumped after a successful manual sync so the "last synced" line re-reads
  // `getLastSyncedAt()` without the whole component needing a live
  // subscription to a value that changes a few times an hour at most.
  const [syncTick, setSyncTick] = useState(0)

  const env = getSyncEnv()
  if (injectedTransport === undefined && env === null) return null // Settings already gates on this; belt and braces.
  const transport = injectedTransport ?? createSupabaseTransport(env!.url, env!.anonKey)

  async function doJoin() {
    setError(null)
    setBusy(true)
    try {
      const found = await transport.joinHousehold(code)
      if (!found) {
        setError(`No household found with code "${code.toUpperCase()}". Double-check with whoever set it up.`)
        return
      }
      const players = await transport.listPlayers(found.householdId)
      setStep({ kind: 'pickPlayer', householdId: found.householdId, inviteCode: code.toUpperCase(), players })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doCreate() {
    setError(null)
    setBusy(true)
    try {
      const { householdId, inviteCode } = await transport.createHousehold()
      setStep({ kind: 'pickPlayer', householdId, inviteCode, players: [] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function finishLinking(householdId: string, inviteCode: string, playerId: string, playerName: string) {
    const link: Link = { householdId, playerId, inviteCode, playerName }
    setLink(link)
    setStep({ kind: 'linked' })
    // Immediately, rather than waiting for the next opportunistic tick — this
    // is the moment a second device is supposed to catch up, and making that
    // wait feel instant is the entire point of the button that got here.
    await syncNow()
    setSyncTick((t) => t + 1)
  }

  async function pickExisting(householdId: string, inviteCode: string, player: PlayerSummary) {
    setError(null)
    setBusy(true)
    try {
      await finishLinking(householdId, inviteCode, player.playerId, player.name)
    } finally {
      setBusy(false)
    }
  }

  async function createPlayer(householdId: string, inviteCode: string) {
    setError(null)
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setBusy(true)
    try {
      const { playerId } = await transport.createPlayer(householdId, trimmed)
      await finishLinking(householdId, inviteCode, playerId, trimmed)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (step.kind === 'choose') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] leading-relaxed text-white/70">
          Link this device to the same household as another one, so the save carries over between them.
        </p>
        <Row onClick={() => setStep({ kind: 'join' })}>Join with a code</Row>
        <Row onClick={() => setStep({ kind: 'create' })}>Start a new household</Row>
      </div>
    )
  }

  if (step.kind === 'join') {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-[0.15em] text-white/50 uppercase">Household code</span>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
            placeholder="e.g. XK7P4M"
            className="w-full rounded-xl bg-black/40 px-4 py-3 text-center font-mono text-xl tracking-[0.3em] text-white"
          />
        </label>
        {error !== null && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex gap-2">
          <Row onClick={() => setStep({ kind: 'choose' })}>Back</Row>
          <Row onClick={doJoin} disabled={code.length !== 6 || busy}>
            {busy ? 'Checking…' : 'Join'}
          </Row>
        </div>
      </div>
    )
  }

  if (step.kind === 'create') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] leading-relaxed text-white/70">
          This makes a code for the other devices to join with. Nothing here changes on this one.
        </p>
        {error !== null && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex gap-2">
          <Row onClick={() => setStep({ kind: 'choose' })}>Back</Row>
          <Row onClick={doCreate} disabled={busy}>
            {busy ? 'Creating…' : 'Create household'}
          </Row>
        </div>
      </div>
    )
  }

  if (step.kind === 'pickPlayer') {
    const { householdId, inviteCode, players } = step
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.15em] text-white/50 uppercase">The household code</p>
          <p className="mt-1 font-mono text-2xl tracking-[0.3em] text-gold">{inviteCode}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-white/70">
            Use this on the other device to join the same household.
          </p>
        </div>

        {players.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold tracking-[0.15em] text-white/50 uppercase">Who&rsquo;s playing?</p>
            {players.map((p) => (
              <Row key={p.playerId} onClick={() => pickExisting(householdId, inviteCode, p)} disabled={busy}>
                {p.name}
              </Row>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-[0.15em] text-white/50 uppercase">
              {players.length > 0 ? 'Or add another player' : 'Player name'}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="Rion"
              className="w-full rounded-xl bg-black/40 px-4 py-3 text-lg text-white"
            />
          </label>
          {error !== null && <p className="text-sm text-rose-300">{error}</p>}
          <Row onClick={() => createPlayer(householdId, inviteCode)} disabled={name.trim().length === 0 || busy}>
            {busy ? 'Adding…' : `Add ${name.trim() || 'player'}`}
          </Row>
        </div>
      </div>
    )
  }

  // step.kind === 'linked'
  const link = getLink()
  if (link === null) return null // Should be unreachable; falls back to nothing rather than a stale screen.
  void syncTick // read for its re-render effect only; the value itself is unused.
  const lastSynced = getLastSyncedAt()

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-bold tracking-[0.15em] text-white/50 uppercase">Playing as</p>
        <p className="mt-1 text-lg font-bold text-white">{link.playerName}</p>
      </div>
      <div>
        <p className="text-xs font-bold tracking-[0.15em] text-white/50 uppercase">Household code</p>
        <p className="mt-1 font-mono text-xl tracking-[0.3em] text-gold">{link.inviteCode}</p>
      </div>
      <p className="text-sm text-white/60">
        {lastSynced === null ? 'Not synced yet.' : `Last synced ${new Date(lastSynced).toLocaleString()}.`}
      </p>
      <Row
        onClick={async () => {
          setBusy(true)
          await syncNow()
          setBusy(false)
          setSyncTick((t) => t + 1)
        }}
        disabled={busy}
      >
        {busy ? 'Syncing…' : 'Sync now'}
      </Row>

      {!confirmingUnlink ? (
        <Row danger onClick={() => setConfirmingUnlink(true)}>
          Unlink this device
        </Row>
      ) : (
        <div className="rounded-xl bg-black/40 p-3 ring-1 ring-rose-400/40">
          <p className="text-[15px] leading-relaxed text-white/85">
            This only stops the device talking to the household. Nothing already played is deleted.
          </p>
          <div className="mt-3 flex gap-2">
            <Row onClick={() => setConfirmingUnlink(false)}>Stay linked</Row>
            <Row
              danger
              onClick={() => {
                unlinkDevice()
                setConfirmingUnlink(false)
                setStep({ kind: 'choose' })
              }}
            >
              Unlink
            </Row>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Row({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'flex-1 rounded-xl bg-rose-500/20 px-4 py-3 text-left font-bold text-rose-100 ring-1 ring-rose-400/40 active:bg-rose-500/30 disabled:opacity-50'
          : 'flex-1 rounded-xl bg-black/25 px-4 py-3 text-left font-bold text-white ring-1 ring-white/10 active:bg-black/40 disabled:opacity-50'
      }
    >
      {children}
    </button>
  )
}
