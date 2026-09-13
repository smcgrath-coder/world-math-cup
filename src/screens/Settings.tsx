import { useState } from 'react'
import { CoachExplainer } from './CoachExplainer'
import { FamilySync } from './FamilySync'
import { useAttempts, useSettings } from '../store/useGameState'
import { getStore, STORAGE_KEY } from '../store/storage'
import { deriveRatings } from '../store/derive'
import { isSyncConfigured } from '../sync/config'
import { ALL_GENERATORS, generatorFor } from '../engine/items/generators'

/**
 * Settings, and the grown-up view behind it.
 *
 * Two things here are deliberate rather than incidental.
 *
 * The timers switch says exactly which clock it removes. It is the most
 * important control in the app for this particular child — timed work is what
 * went wrong for him last year — and a switch that important must not be a
 * mystery.
 *
 * And nothing anywhere counts days off. No streaks, no "keep it up", no "you
 * haven't played since Tuesday". A guilt-trip about a missed day is the fastest
 * way to lose a child who already associates maths with being kept in.
 */
export interface SettingsScreenProps {
  /** The save was wiped or replaced, so the shell must re-run its gates. */
  onSaveReplaced?: () => void
}

export function SettingsScreen({ onSaveReplaced }: SettingsScreenProps) {
  const settings = useSettings()
  const attempts = useAttempts()

  const [readingCoach, setReadingCoach] = useState(false)
  const [grownUp, setGrownUp] = useState(false)
  const [showingFamily, setShowingFamily] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importNote, setImportNote] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  // Re-reading the Coach is not a first read, so the gate flag is left alone —
  // `CoachExplainer` sets it on the way out and it is already set.
  if (readingCoach) return <CoachExplainer onDone={() => setReadingCoach(false)} />

  return (
    <div className="min-h-full bg-pitch-dark px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <h1 className="text-3xl leading-tight font-black">Settings</h1>

        <section className="flex flex-col gap-3">
          <Toggle
            label="Timers"
            checked={settings.timersEnabled}
            onChange={(next) => getStore().updateSettings({ timersEnabled: next })}
          />
          <p data-testid="timers-note" className="text-[15px] leading-relaxed text-white/70">
            The only clock in the game is the tackle-back, the few seconds to win a loose ball back.
            Turn this off and there is no clock anywhere — you just answer.
          </p>

          <Toggle
            label="Sound"
            checked={settings.soundEnabled}
            onChange={(next) => getStore().updateSettings({ soundEnabled: next })}
          />
          <p data-testid="sound-note" className="text-[15px] leading-relaxed text-white/70">
            Music only — a different loop for the training ground, a match and the tournament. There
            are no sound effects, so nothing will ever go off unexpectedly.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <Row onClick={() => setReadingCoach(true)}>Read the Coach again</Row>
          <Row onClick={() => setGrownUp((open) => !open)}>
            {grownUp ? 'Hide the grown-up bit' : 'Grown-up bit'}
          </Row>
        </section>

        {grownUp && (
          <section className="flex flex-col gap-6">
            {/*
              Absent entirely, not shown-and-disabled, when Supabase is not
              configured — see `getSyncEnv`. A control that promises "link
              your devices" and does nothing is worse than no control.
            */}
            {isSyncConfigured() && (
              <div>
                <Heading>Family</Heading>
                {!showingFamily ? (
                  <Row onClick={() => setShowingFamily(true)}>Link this device / move to another one</Row>
                ) : (
                  <div className="rounded-xl bg-black/20 p-4 ring-1 ring-white/10">
                    <FamilySync />
                  </div>
                )}
              </div>
            )}

            <div>
              <Heading>Where the save lives</Heading>
              <p data-testid="storage-note" className="text-[15px] leading-relaxed text-white/70">
                Everything is kept on this device only, in the browser&rsquo;s localStorage under{' '}
                <code className="rounded bg-black/40 px-1">{STORAGE_KEY}</code>. Nothing is sent
                anywhere, and clearing the browser&rsquo;s data for this site deletes it.
              </p>
            </div>

            <div>
              <Heading>How the save is doing</Heading>
              <SaveHealth />
            </div>

            <div>
              <Heading>Every question answered</Heading>
              <ul className="flex flex-col gap-1.5">
                {[...attempts]
                  .sort((a, b) => b.at - a.at)
                  .map((a) => (
                    <li
                      key={a.id}
                      data-testid="attempt-row"
                      className="flex items-baseline gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        {generatorFor(a.standardId)?.label ?? a.standardId}
                      </span>
                      <span className="shrink-0 text-white/60">
                        answered {a.given === '' ? '(nothing)' : a.given}
                      </span>
                      <span className={a.correct ? 'shrink-0 text-gold' : 'shrink-0 text-white/60'}>
                        {a.correct ? 'right' : 'missed'}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <Heading>Every skill the game can ask about</Heading>
              <StandardRatings />
            </div>

            <div className="flex flex-col gap-2">
              <Heading>Move the save</Heading>
              <Row onClick={() => setExported(getStore().exportJson())}>Export the save</Row>
              {exported !== null && (
                <textarea
                  data-testid="export-box"
                  readOnly
                  value={exported}
                  rows={4}
                  className="w-full rounded-xl bg-black/40 p-2 font-mono text-xs"
                />
              )}

              <textarea
                data-testid="import-box"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={4}
                placeholder="Paste a save here"
                aria-label="Paste a save"
                className="w-full rounded-xl bg-black/40 p-2 font-mono text-xs"
              />
              <Row
                onClick={() => {
                  const report = getStore().importJson(importText)
                  if (report.corrupt) {
                    setImportNote('That didn’t look like a save this game wrote. Nothing changed.')
                    return
                  }
                  setImportNote('Loaded.')
                  onSaveReplaced?.()
                }}
              >
                Load that save
              </Row>
              {importNote !== null && (
                <p data-testid="import-note" className="text-sm text-white/70">
                  {importNote}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Heading>Start again</Heading>
              <Row danger onClick={() => setConfirmingReset(true)}>
                Delete everything
              </Row>
              {confirmingReset && (
                <div
                  data-testid="reset-confirm"
                  className="rounded-xl bg-black/40 p-3 ring-1 ring-rose-400/40"
                >
                  <p className="text-[15px] leading-relaxed">
                    This deletes his country, his card and every question he has answered. It cannot
                    be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Row onClick={() => setConfirmingReset(false)}>No, keep it</Row>
                    <Row
                      danger
                      onClick={() => {
                        getStore().resetAll()
                        setConfirmingReset(false)
                        onSaveReplaced?.()
                      }}
                    >
                      Yes, delete it all
                    </Row>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function StandardRatings() {
  const attempts = useAttempts()
  const ratings = deriveRatings(attempts, Date.now())

  return (
    <ul className="flex flex-col gap-1.5">
      {ALL_GENERATORS.map((generator) => {
        const rating = ratings.get(generator.standardId)
        return (
          <li
            key={generator.standardId}
            data-testid="standard-row"
            className="flex items-baseline gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm"
          >
            <code className="shrink-0 text-white/60">{generator.standardId}</code>
            <span className="min-w-0 flex-1">{generator.label}</span>
            <span className="shrink-0 font-black">{Math.round(rating?.rating ?? 0)}</span>
            {rating?.provisional !== false && (
              <span className="shrink-0 text-xs text-white/50">not proven</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-bold tracking-[0.2em] text-gold uppercase">{children}</h2>
  )
}

function Row({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        danger
          ? 'rounded-xl bg-rose-500/20 px-4 py-3 text-left font-bold text-rose-100 ring-1 ring-rose-400/40 active:bg-rose-500/30'
          : 'rounded-xl bg-black/25 px-4 py-3 text-left font-bold ring-1 ring-white/10 active:bg-black/40'
      }
    >
      {children}
    </button>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-3 ring-1 ring-white/10 active:bg-black/40"
    >
      <span className="font-bold">{label}</span>
      <span
        aria-hidden="true"
        className={
          checked
            ? 'flex h-7 w-12 items-center justify-end rounded-full bg-gold px-1'
            : 'flex h-7 w-12 items-center justify-start rounded-full bg-white/20 px-1'
        }
      >
        <span className="h-5 w-5 rounded-full bg-white" />
      </span>
    </button>
  )
}

/**
 * Whether the save is actually reaching disk, and whether anything was left
 * behind on the way in.
 *
 * The store has recorded both since the beginning — `persistError` when a
 * write fails (a full quota, Safari's private mode, storage switched off) and
 * a `LoadReport` when a load had to drop something corrupt — and its comments
 * said the parent could see them "on the debug screen". Nothing ever rendered
 * them. A match played in a private tab wrote nothing, said nothing, and was
 * gone on relaunch with no explanation anywhere. This is the debug screen.
 *
 * Read on render rather than subscribed to: this screen already re-renders on
 * every store commit (it lists the attempts), and a write failure is set
 * during that same commit.
 */
function SaveHealth() {
  const store = getStore()
  const error = store.getPersistError()
  const report = store.getLoadReport()
  const dropped: string[] = []
  if (report.droppedAttempts > 0) {
    dropped.push(`${report.droppedAttempts} answer${report.droppedAttempts === 1 ? '' : 's'}`)
  }
  if (report.droppedCountry) dropped.push('the country')
  if (report.droppedCampaign) dropped.push('the current cup run')

  if (error === null && dropped.length === 0 && !report.corrupt) {
    return (
      <p data-testid="save-health" className="text-[15px] leading-relaxed text-white/70">
        Saving normally. Every answer is written to this device as it happens.
      </p>
    )
  }

  return (
    <div data-testid="save-health" className="flex flex-col gap-2 text-[15px] leading-relaxed">
      {error !== null && (
        <p className="rounded-xl bg-gold/15 p-3 text-white ring-1 ring-gold/40">
          The last save did not write to this device (<code className="text-white/80">{error}</code>).
          Play carries on from memory, but closing the app now would lose it. Export the save below
          before closing, and check the browser is not in a private window or out of space.
        </p>
      )}
      {report.corrupt && (
        <p className="text-white/70">
          The saved file could not be read at all when the app opened, so it started fresh. If there
          is an export from before, import it below.
        </p>
      )}
      {dropped.length > 0 && (
        <p className="text-white/70">
          When the app opened, {dropped.join(', ')} could not be read and {dropped.length === 1 && !dropped[0]!.includes('answers') ? 'was' : 'were'} left out. Everything else loaded normally.
        </p>
      )}
    </div>
  )
}
