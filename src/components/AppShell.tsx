import { useState } from 'react'
import { CountryCreator } from '../screens/CountryCreator'
import { CoachExplainer } from '../screens/CoachExplainer'
import { Tryout } from '../screens/Tryout'
import { TrainingGround } from '../screens/TrainingGround'
import { Play } from '../screens/Play'
import { MyCard } from '../screens/MyCard'
import { SettingsScreen } from '../screens/Settings'
import { Match } from '../screens/Match'
import type { MatchResult } from '../screens/Match'
import { PostMatch } from '../screens/PostMatch'
import { useAttempts, useCampaign, useCountry, useSettings } from '../store/useGameState'
import { getStore } from '../store/storage'
import { useMusicTrack } from '../audio/useMusicTrack'
import type { TrackName } from '../audio/music'
import { useOpportunisticSync } from '../sync/useOpportunisticSync'
import type { Opponent } from '../data/opponents'
import type { Stakes } from '../engine/match'
import { applyCampaignResult } from '../engine/campaign'
import type { CampaignOutcome } from '../engine/campaign'
import { outcomeFor } from '../screens/campaignCopy'

/**
 * The whole app.
 *
 * Wiping the save has to reopen every gate, and a gate is a snapshot taken at
 * mount (see `Session`), so the only honest way to reopen them is to mount a new
 * session. That is what the key is for.
 */
export function AppShell() {
  const [generation, setGeneration] = useState(0)
  // Here, not inside `Session`: this must survive a save-replace remount
  // rather than tearing down and resubscribing every time `key` changes, and
  // it has nothing to do with which gate `Session` is currently showing.
  useOpportunisticSync()
  return <Session key={generation} onSaveReplaced={() => setGeneration((g) => g + 1)} />
}

type Tab = 'play' | 'training' | 'card' | 'settings'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'training', label: 'Training' },
  { id: 'card', label: 'Card' },
  { id: 'settings', label: 'Settings' },
]

/**
 * Which loop belongs to whichever screen is showing.
 *
 * Kept as a function of the shell's own state, and exported, because "the wrong
 * music is playing" is otherwise the kind of thing nobody notices is a
 * regression. The order matches the render below exactly — a track chosen from
 * a branch the shell has already taken is a track for a screen that is not on.
 *
 * The try-out gets the training loop rather than anything grander. It is a
 * scouting session and the whole design of it is that it does not feel like an
 * exam.
 */
export function trackFor(state: {
  country: boolean
  explained: boolean
  scouted: boolean
  result: unknown | null
  fixture: { stakes: Stakes } | null
  tab: Tab
}): TrackName {
  if (!state.country || !state.explained) return 'main_theme'
  if (!state.scouted) return 'training_grounds'
  if (state.result !== null) return 'tournament'
  // The tensest music for the tensest match: a knockout is the closest thing
  // the game has to a shootout, and it is the only place this track fits.
  if (state.fixture !== null) {
    return state.fixture.stakes === 'knockout' ? 'penalty_shootout' : 'match_ambience'
  }
  if (state.tab === 'training') return 'training_grounds'
  if (state.tab === 'play') return 'tournament'
  return 'main_theme'
}

/**
 * What happens to the campaign when a match ends, folded into the same
 * `MatchResult` `PostMatch` already reads — exported and pure so this is
 * tested directly rather than only through a rendered `Match`.
 *
 * A no-op — the campaign untouched, no outcome attached — for every ordinary
 * exhibition match, which is most of them. `isCampaign` is the only thing
 * that turns this on; the opponent and stakes are not enough, since
 * qualifying shares its `'friendly'` stakes with an ordinary exhibition
 * friendly and could otherwise be mistaken for one.
 *
 * Applying the reducer can throw on a campaign whose internal invariants are
 * broken — the same defensive throws `campaign.ts` uses everywhere else.
 * Caught here rather than left to crash the screen the instant a match ends:
 * a campaign that cannot safely advance costs the run, exactly as a corrupt
 * one loaded from disk does, and never the log underneath it.
 */
export function advanceCampaign(
  played: MatchResult,
  isCampaign: boolean,
  campaign: ReturnType<typeof useCampaign>,
  country: ReturnType<typeof useCountry>,
): MatchResult & { campaignOutcome?: CampaignOutcome } {
  if (!isCampaign || campaign === null) return played

  try {
    const outcome = outcomeFor(played.score[0], played.score[1])
    const { next, outcome: campaignOutcome } = applyCampaignResult(campaign, outcome, played.score)
    getStore().setCampaign(next)
    if (campaignOutcome.kind === 'champion' && country !== null) {
      getStore().setCountry({ ...country, stars: country.stars + 1 })
    }
    return { ...played, campaignOutcome }
  } catch {
    getStore().setCampaign(null)
    return played
  }
}

function Session({ onSaveReplaced }: { onSaveReplaced: () => void }) {
  const country = useCountry()
  const settings = useSettings()
  const attempts = useAttempts()
  const campaign = useCampaign()

  /**
   * The gates, read from the save once and then owned here.
   *
   * Deriving them from the log on every render looks tidier and is wrong: the
   * try-out writes its own attempts on the way to the card reveal, so a live
   * gate would unmount the try-out on its own last answer and take the payoff —
   * the entire reason he sat through it — with it.
   *
   * `country` is deliberately live. The creator has no closing moment to
   * protect, and reading it live is what lets a save appearing from an import
   * move him straight on.
   */
  const [explained, setExplained] = useState(settings.coachExplainerSeen)
  const [scouted, setScouted] = useState(() => attempts.some((a) => a.context === 'tryout'))

  const [tab, setTab] = useState<Tab>('play')
  const [fixture, setFixture] = useState<{
    opponent: Opponent
    stakes: Stakes
    at: number
    /** Set only by the road-to-the-cup card — see `PlayProps.onKickoff`. */
    isCampaign: boolean
  } | null>(null)
  const [result, setResult] = useState<(MatchResult & { campaignOutcome?: CampaignOutcome }) | null>(
    null,
  )

  useMusicTrack(trackFor({ country: country !== null, explained, scouted, result, fixture, tab }))

  if (!country) return <CountryCreator />
  if (!explained) return <CoachExplainer onDone={() => setExplained(true)} />
  if (!scouted) return <Tryout onDone={() => setScouted(true)} />

  if (result !== null) {
    return (
      <PostMatch
        matchId={result.matchId}
        opponent={result.opponent}
        score={result.score}
        questions={result.questions}
        campaignOutcome={result.campaignOutcome}
        onDone={() => setResult(null)}
      />
    )
  }

  if (fixture !== null) {
    return (
      <Match
        // Keyed on the fixture and nothing else. A match writes to the log as it
        // goes, so a key derived from the log — the attempt count was the first
        // attempt at this — remounts the screen mid-match and silently starts a
        // second match over the top of the first.
        key={`${fixture.opponent.id}:${fixture.stakes}:${fixture.at}`}
        opponent={fixture.opponent}
        stakes={fixture.stakes}
        onDone={(played) => {
          setResult(advanceCampaign(played, fixture.isCampaign, campaign, country))
          setFixture(null)
        }}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-pitch-dark">
      {/*
        Only the open tab is mounted. Browsing state — a team sheet he was
        reading, a topic he was half-choosing — is not worth carrying, and coming
        back to a screen mid-thought is more confusing than starting it again. A
        setting is different, and settings live on disk.
      */}
      <main className="min-h-0 flex-1 pb-20">
        {tab === 'play' && (
          <Play
            onKickoff={(opponent, stakes, campaignFixture) =>
              setFixture({ opponent, stakes, at: Date.now(), isCampaign: campaignFixture === true })
            }
            onTrain={() => setTab('training')}
          />
        )}
        {tab === 'training' && <TrainingGround onDone={() => setTab('play')} />}
        {tab === 'card' && <MyCard onTrain={() => setTab('training')} />}
        {tab === 'settings' && <SettingsScreen onSaveReplaced={onSaveReplaced} />}
      </main>

      <nav
        role="navigation"
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 flex border-t border-white/10 bg-pitch-dark/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={
              tab === id
                ? 'flex-1 px-2 py-3.5 text-sm font-black text-gold'
                : 'flex-1 px-2 py-3.5 text-sm font-bold text-white/55'
            }
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
