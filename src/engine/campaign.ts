/**
 * The World Cup: qualify, then a group, then a knockout bracket, exactly the
 * shape the game's own name has been promising since phase one. Verified
 * missing before this file existed — `country.stars` was never incremented,
 * no campaign state existed anywhere, and `'group'` stakes sat in the type
 * system unreachable from any screen.
 *
 * **A correction to the design this was built from.** The plan assumed the
 * roster held 32 real World Cup teams; `WORLD_CUP_FIELD` actually holds 48 —
 * the true 2026 field. Redrawing all 48 into the real format (12 groups, best
 * thirds, a round of 32) is authentic but is a lot of matches for one arc, and
 * this project has been deliberately careful about session length for this
 * child since the very first design doc. So a cup run draws **32 of the 48**,
 * fresh each time a run starts — which keeps the plan's already-agreed shape
 * (8 groups of 4, R16 → QF → SF → Final) exactly as specified, while using
 * real data instead of an assumed roster size, and means a second run doesn't
 * necessarily look like the first one.
 *
 * **Pure, and nothing but the current campaign is stored.** Like `match.ts`,
 * this file is a reducer: `MatchOutcome` in, `Campaign | null` and a
 * description of what just happened out. Scorelines are not recoverable from
 * the attempts log — established when the film room was built — so a group
 * table and a bracket have to be their own state, validated and
 * corruption-tolerant exactly like `country` and `settings` are.
 *
 * **Everyone the player does not personally play is simulated**, deterministic
 * from the campaign's own seed. A 32-team draw is 8 groups times 6 matches —
 * 48 matches — and the player only ever plays a handful of them: 3 in their
 * own group, then one per knockout round survived. The rest exist so a table
 * and a bracket can be shown honestly, computed once from the two sides'
 * ratings, never touching the maths engine or an item generator.
 *
 * **Elimination is never final.** Every terminal outcome — failed qualifying,
 * knocked out of the group, knocked out of the bracket — returns `next: null`,
 * and `null` campaign state is exactly what re-enables "qualify for a cup" on
 * the Play screen. The run ends; nothing locks.
 */

import { OPPONENTS, WORLD_CUP_FIELD } from '../data/opponents'
import type { Opponent } from '../data/opponents'
import { makeRng } from './items/rng'
import type { Rng } from './items/types'

export const ME = 'me'

export type MatchOutcome = 'win' | 'draw' | 'loss'
export type KnockoutRound = 'r16' | 'qf' | 'sf' | 'final'
export const KNOCKOUT_ROUNDS: readonly KnockoutRound[] = ['r16', 'qf', 'sf', 'final']

/** A completed fixture, `[home, away]` — for the player's own matches `home` is always `ME` in the group stage's own bookkeeping, though a scoreline itself has no real home/away meaning here. */
export interface PlayedFixture {
  homeId: string
  awayId: string
  home: number
  away: number
}

export interface QualifyingCampaign {
  stage: 'qualifying'
  seed: number
  /** Exactly three, drawn once at the start of the series. */
  opponentIds: readonly [string, string, string]
  /** Grows as he plays. Stops as soon as the series is decided — see `applyCampaignResult`. */
  results: readonly MatchOutcome[]
}

export interface GroupCampaign {
  stage: 'group'
  seed: number
  /** Eight groups of four team ids. `ME` appears exactly once, in `groups[0]`. Index 0–3 is one bracket half, 4–7 the other. */
  groups: readonly (readonly [string, string, string, string])[]
  /** Every match across all eight groups — 48 once complete. The 45 that do not involve the player are simulated the moment the group stage begins; his own 3 are added as he plays them. */
  matches: readonly PlayedFixture[]
}

export interface KnockoutTie {
  round: KnockoutRound
  homeId: string
  awayId: string
  /** Present once decided, played or simulated. */
  result?: PlayedFixture & { wentToPenalties: boolean; winnerId: string }
}

export interface KnockoutCampaign {
  stage: 'knockout'
  seed: number
  groups: readonly (readonly [string, string, string, string])[]
  groupMatches: readonly PlayedFixture[]
  /** Every tie decided or pending, across every round reached so far. */
  ties: readonly KnockoutTie[]
}

export type Campaign = QualifyingCampaign | GroupCampaign | KnockoutCampaign

/** What just happened, for the screens to say something true about. Never `null` on its own — always paired with the `Campaign | null` it produced. */
export type CampaignOutcome =
  | { kind: 'qualifying-continues'; wins: number; losses: number; remaining: number }
  | { kind: 'qualified' }
  | { kind: 'qualifying-failed' }
  | { kind: 'group-continues' }
  | { kind: 'advanced-to-knockout' }
  | { kind: 'eliminated-in-group' }
  | { kind: 'advanced'; round: KnockoutRound; nextRound: KnockoutRound }
  | { kind: 'eliminated-in-knockout'; round: KnockoutRound }
  | { kind: 'champion' }

// ---------------------------------------------------------------------------
// Simulating a match between two sides that are not the player

/**
 * A scoreline between two opponents, deterministic from `rng`.
 *
 * Not a goals model, and not trying to be one — this exists purely so a group
 * table and a bracket can have real, honest-looking numbers in them. Two
 * properties are the ones that actually matter and the ones the tests check:
 * the better-rated side wins more often over many matches, and a draw always
 * really is a draw (equal scores), never a coin flip dressed up as one.
 *
 * A fresh, small logistic curve rather than reusing `elo.ts`'s
 * `expectedScore` — that one is calibrated to the 0–99 maths-rating scale and
 * a child's actual performance; this is team strength standing in for a
 * result nobody plays, and coupling the two would make a future change to
 * either one silently move the other.
 */
export function simulateMatch(ratingA: number, ratingB: number, rng: Rng): [number, number] {
  const diff = ratingA - ratingB
  const roll = () => rng.int(0, 999_999) / 1_000_000

  const winRaw = 1 / (1 + 10 ** (-diff / 12))
  // Draws are commonest between evenly matched sides and rarer the further
  // apart they are rated — a blowout is rarely a 1–1.
  const drawChance = Math.max(0.1, 0.3 - Math.abs(diff) * 0.006)
  const aWin = winRaw * (1 - drawChance)

  const r = roll()
  if (r < aWin) return scoreline(rng, diff)
  if (r < aWin + drawChance) {
    const level = rng.pick([0, 1, 1, 2])
    return [level, level]
  }
  const [b, a] = scoreline(rng, -diff)
  return [a, b]
}

/** A winning margin for the favoured side, wider when the rating gap is bigger, plus a small, less-likely reply from the other side. */
function scoreline(rng: Rng, favouredDiff: number): [number, number] {
  const bigGap = favouredDiff > 20
  const margin = bigGap ? rng.pick([2, 2, 3, 3, 4]) : rng.pick([1, 1, 1, 2, 2, 3])
  const reply = rng.pick([0, 0, 0, 1])
  const base = rng.pick([0, 1])
  return [base + margin, Math.min(reply, base + margin - 1)]
}

// ---------------------------------------------------------------------------
// Qualifying

/** Three mid-tier opponents, close to his own level or a little above — earnable, not a gimme. */
export function drawQualifying(overall: number, seed: number): QualifyingCampaign {
  const rng = makeRng(seed)
  const band = OPPONENTS.filter((o) => o.rating >= overall - 8 && o.rating <= overall + 12)
  const pool = band.length >= 3 ? band : [...OPPONENTS].sort((a, b) => Math.abs(a.rating - overall) - Math.abs(b.rating - overall))

  const chosen: Opponent[] = []
  const available = [...pool]
  for (let i = 0; i < 3 && available.length > 0; i++) {
    const pick = rng.int(0, available.length - 1)
    chosen.push(available[pick]!)
    available.splice(pick, 1)
  }
  // The band can be thinner than 3 at the very top or bottom of the roster;
  // top up from the full list rather than ever hand back fewer than three.
  while (chosen.length < 3) {
    const rest = OPPONENTS.filter((o) => !chosen.includes(o))
    if (rest.length === 0) break
    chosen.push(rest[rng.int(0, rest.length - 1)]!)
  }

  return {
    stage: 'qualifying',
    seed,
    opponentIds: [chosen[0]!.id, chosen[1]!.id, chosen[2]!.id],
    results: [],
  }
}

// ---------------------------------------------------------------------------
// The group draw

/**
 * Eight groups of four, drawn from the World Cup field.
 *
 * All eight tier-1 sides are always in the draw — this is what keeps "tiers
 * seed the bracket so tier-1 sides appear from QF on" true every single run
 * rather than true only when the dice happened to include them, and it is
 * what makes the final-boss rule below meaningful every time. The other 24
 * slots are dealt from three rating bands across the remaining 40 sides —
 * roughly a strong tier, a middling tier, and a developing one — one per
 * group per band, so no group is accidentally four minnows or four giants.
 *
 * **The final-boss rule.** The run's highest-rated tier-1 side — which, on
 * the current roster, is always Spain — is placed in a group on the
 * opposite bracket half from the player's own group. Groups 0–3 are one half
 * and 4–7 the other, and a half never meets the other half before the Final.
 * The player's own group can therefore never draw that side, and can only
 * ever meet it in a final they have both reached.
 */
export function drawGroups(seed: number): readonly (readonly [string, string, string, string])[] {
  const rng = makeRng(seed)

  const tier1 = WORLD_CUP_FIELD.filter((o) => o.tier === 1)
  const others = WORLD_CUP_FIELD.filter((o) => o.tier !== 1).sort((a, b) => b.rating - a.rating)

  const bandSize = Math.ceil(others.length / 3)
  const bands = [others.slice(0, bandSize), others.slice(bandSize, bandSize * 2), others.slice(bandSize * 2)]
  const drawnBands = bands.map((band) => shuffle(band, rng).slice(0, 8))

  const topSeed = [...tier1].sort((a, b) => b.rating - a.rating)[0]!
  const restOfTier1 = shuffle(
    tier1.filter((o) => o.id !== topSeed.id),
    rng,
  )

  // Group 0 is always the player's. Group 4 always holds the top seed — the
  // first slot of the opposite half — so the two can only meet in the Final.
  const tier1ByGroup = new Array<Opponent>(8)
  tier1ByGroup[4] = topSeed
  let cursor = 0
  for (let g = 0; g < 8; g++) {
    if (g === 4) continue
    tier1ByGroup[g] = restOfTier1[cursor]!
    cursor++
  }

  const groups: (readonly [string, string, string, string])[] = []
  for (let g = 0; g < 8; g++) {
    const teamIds = [
      g === 0 ? ME : tier1ByGroup[g]!.id,
      g === 0 ? tier1ByGroup[g]!.id : drawnBands[0]![g]!.id,
      drawnBands[1]![g]!.id,
      drawnBands[2]![g]!.id,
    ] as [string, string, string, string]
    groups.push(teamIds)
  }
  return groups
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function ratingOf(id: string): number {
  if (id === ME) throw new Error('ratingOf: cannot rate the player — this path must never be reached for ME')
  const opponent = WORLD_CUP_FIELD.find((o) => o.id === id) ?? OPPONENTS.find((o) => o.id === id)
  if (!opponent) throw new Error(`ratingOf: unknown opponent ${id}`)
  return opponent.rating
}

/** Every match in a 4-team round robin, as unordered pairs. Six matches: every team plays every other team once. */
function roundRobinPairs(teamIds: readonly [string, string, string, string]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) pairs.push([teamIds[i]!, teamIds[j]!])
  }
  return pairs
}

/** Simulates every match in every group that does not involve the player. The player's own three are added separately, as he plays them. */
function simulateGroupMatches(
  groups: readonly (readonly [string, string, string, string])[],
  seed: number,
): PlayedFixture[] {
  const rng = makeRng(seed + 1) // offset from the draw's own seed, so shuffling the draw never changes these results
  const out: PlayedFixture[] = []
  for (const group of groups) {
    for (const [homeId, awayId] of roundRobinPairs(group)) {
      if (homeId === ME || awayId === ME) continue
      const [home, away] = simulateMatch(ratingOf(homeId), ratingOf(awayId), rng)
      out.push({ homeId, awayId, home, away })
    }
  }
  return out
}

export function startGroupStage(seed: number): GroupCampaign {
  const groups = drawGroups(seed)
  return { stage: 'group', seed, groups, matches: simulateGroupMatches(groups, seed) }
}

// ---------------------------------------------------------------------------
// Group standings

export interface GroupStanding {
  teamId: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

const emptyStanding = (teamId: string): GroupStanding => ({
  teamId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  points: 0,
})

/** The table for one group, sorted points first and goal difference second — the two rules the plan asks for, and the only two: this format never needs head-to-head or a coin toss to separate two of four teams. */
export function groupTable(
  teamIds: readonly [string, string, string, string],
  matches: readonly PlayedFixture[],
): GroupStanding[] {
  const table = new Map(teamIds.map((id) => [id, emptyStanding(id)]))

  for (const m of matches) {
    if (!teamIds.includes(m.homeId) || !teamIds.includes(m.awayId)) continue
    const home = table.get(m.homeId)!
    const away = table.get(m.awayId)!
    home.played++
    away.played++
    home.gf += m.home
    home.ga += m.away
    away.gf += m.away
    away.ga += m.home
    if (m.home > m.away) {
      home.won++
      home.points += 3
      away.lost++
    } else if (m.home < m.away) {
      away.won++
      away.points += 3
      home.lost++
    } else {
      home.drawn++
      away.drawn++
      home.points++
      away.points++
    }
  }

  return [...table.values()].sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga))
}

function groupOf(campaign: GroupCampaign, teamId: string): readonly [string, string, string, string] {
  const group = campaign.groups.find((g) => g.includes(teamId))
  if (!group) throw new Error(`groupOf: ${teamId} is not in any group`)
  return group
}

export function myGroup(campaign: GroupCampaign): readonly [string, string, string, string] {
  return groupOf(campaign, ME)
}

// ---------------------------------------------------------------------------
// Building the knockout bracket once every group is complete

/**
 * R16 pairings, in the standard crossed shape: each group's winner meets a
 * *different* group's runner-up, and every pairing on one bracket half stays
 * on that half all the way to the Final. Fixed and always the same shape —
 * only which teams occupy the slots changes run to run.
 */
const R16_PAIRING: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [2, 3],
  [3, 2],
  [4, 5],
  [5, 4],
  [6, 7],
  [7, 6],
]

function qualifiersOf(campaign: GroupCampaign): { winner: string; runnerUp: string }[] {
  return campaign.groups.map((group) => {
    const table = groupTable(group, campaign.matches)
    return { winner: table[0]!.teamId, runnerUp: table[1]!.teamId }
  })
}

function buildR16(campaign: GroupCampaign): KnockoutTie[] {
  const qualifiers = qualifiersOf(campaign)
  return R16_PAIRING.map(([groupIdx, oppositeGroupIdx]) => ({
    round: 'r16' as const,
    homeId: qualifiers[groupIdx]!.winner,
    awayId: qualifiers[oppositeGroupIdx]!.runnerUp,
  }))
}

// ---------------------------------------------------------------------------
// Deciding one match — played by the player, or simulated

/**
 * The rule for a *simulated* knockout tie that finishes level — one where
 * neither side is the player, decided at group-to-knockout time or lazily as
 * later rounds are built. A coin has to decide; shootouts really are close to
 * a fair toss regardless of which side is better, so this lightly favours the
 * higher-rated side and calls it "penalties" rather than pretending to model
 * one.
 *
 * The player's own drawn tie is deliberately **not** decided here. It never
 * reaches this function at all — `decideRoundExceptPlayer`, the only caller,
 * skips any tie involving `ME` before it gets this far — and its outcome is
 * decided inline in `applyKnockoutResult` instead: he advances outright,
 * because he has just fought a real opponent to a draw with real answers, and
 * reaching for a dice roll to decide whether that counted would be exactly
 * the kind of chance-based reversal this whole project has been built to
 * avoid — "a miss never ends a possession," "you can lose and still climb,"
 * and this is the same rule at the scale of a whole tie rather than one
 * question. (An earlier version of this function tried to express that rule
 * *here* too, as a defensive early return — it was unreachable dead code, and
 * a mutation test proved it by removing the return with no test noticing.)
 */
function decideLevelTie(homeId: string, awayId: string, seed: number): { winnerId: string } {
  const rng = makeRng(seed)
  const home = ratingOf(homeId)
  const away = ratingOf(awayId)
  const pHome = 0.5 + (home - away) * 0.004 // a small nudge, never a certainty
  return { winnerId: rng.int(0, 999_999) / 1_000_000 < pHome ? homeId : awayId }
}

function decideTie(tie: KnockoutTie, seed: number): KnockoutTie {
  const [home, away] = simulateMatch(ratingOf(tie.homeId), ratingOf(tie.awayId), makeRng(seed))
  if (home !== away) {
    return { ...tie, result: { homeId: tie.homeId, awayId: tie.awayId, home, away, wentToPenalties: false, winnerId: home > away ? tie.homeId : tie.awayId } }
  }
  const { winnerId } = decideLevelTie(tie.homeId, tie.awayId, seed + 7)
  return { ...tie, result: { homeId: tie.homeId, awayId: tie.awayId, home, away, wentToPenalties: true, winnerId } }
}

/** Every tie in `round` that does not involve the player, decided immediately. */
function decideRoundExceptPlayer(ties: readonly KnockoutTie[], round: KnockoutRound, seed: number): KnockoutTie[] {
  return ties.map((tie, i) => {
    if (tie.round !== round || tie.result || tie.homeId === ME || tie.awayId === ME) return tie
    return decideTie(tie, seed + i * 13)
  })
}

function nextRoundOf(round: KnockoutRound): KnockoutRound | null {
  const i = KNOCKOUT_ROUNDS.indexOf(round)
  return i < KNOCKOUT_ROUNDS.length - 1 ? KNOCKOUT_ROUNDS[i + 1]! : null
}

/** Pairs up the winners of a completed round into the next one, preserving bracket-half order. */
function buildNextRound(ties: readonly KnockoutTie[], round: KnockoutRound, nextRound: KnockoutRound): KnockoutTie[] {
  const winners = ties.filter((t) => t.round === round).map((t) => t.result!.winnerId)
  const out: KnockoutTie[] = []
  for (let i = 0; i < winners.length; i += 2) {
    out.push({ round: nextRound, homeId: winners[i]!, awayId: winners[i + 1]! })
  }
  return out
}

// ---------------------------------------------------------------------------
// The reducer

/**
 * Apply the result of a match the player just finished. `null` if nothing
 * about the log had a campaign attached — callers only reach this once they
 * already know a campaign fixture was in play.
 */
export function applyCampaignResult(
  campaign: Campaign,
  outcome: MatchOutcome,
  score: readonly [number, number],
): { next: Campaign | null; outcome: CampaignOutcome } {
  if (campaign.stage === 'qualifying') return applyQualifyingResult(campaign, outcome)
  if (campaign.stage === 'group') return applyGroupResult(campaign, score)
  return applyKnockoutResult(campaign, score)
}

function applyQualifyingResult(
  campaign: QualifyingCampaign,
  outcome: MatchOutcome,
): { next: Campaign | null; outcome: CampaignOutcome } {
  const results = [...campaign.results, outcome]
  const wins = results.filter((r) => r === 'win').length
  const losses = results.filter((r) => r === 'loss').length

  if (wins >= 2) {
    return { next: startGroupStage(campaign.seed), outcome: { kind: 'qualified' } }
  }
  if (losses >= 2 || results.length >= 3) {
    return { next: null, outcome: { kind: 'qualifying-failed' } }
  }
  return {
    next: { ...campaign, results },
    outcome: { kind: 'qualifying-continues', wins, losses, remaining: 3 - results.length },
  }
}

function applyGroupResult(
  campaign: GroupCampaign,
  score: readonly [number, number],
): { next: Campaign | null; outcome: CampaignOutcome } {
  const group = myGroup(campaign)
  const played = group.filter((id) => id !== ME)
  const playedSoFar = campaign.matches.filter(
    (m) => (m.homeId === ME || m.awayId === ME) && group.includes(m.homeId) && group.includes(m.awayId),
  ).length
  const opponentId = played[playedSoFar]
  if (opponentId === undefined) throw new Error('applyGroupResult: he has already played everyone in his group')

  const fixture: PlayedFixture = { homeId: ME, awayId: opponentId, home: score[0], away: score[1] }
  const matches = [...campaign.matches, fixture]

  const myMatchesPlayed = playedSoFar + 1
  if (myMatchesPlayed < 3) {
    return { next: { ...campaign, matches }, outcome: { kind: 'group-continues' } }
  }

  // His three are in. The table is now final for his own group; every other
  // group already was, the moment the stage began.
  const table = groupTable(group, matches)
  const through = table.slice(0, 2).some((s) => s.teamId === ME)
  if (!through) {
    return { next: null, outcome: { kind: 'eliminated-in-group' } }
  }

  const withGroup: GroupCampaign = { ...campaign, matches }
  const r16 = buildR16(withGroup)
  const decided = decideRoundExceptPlayer(r16, 'r16', campaign.seed + 101)
  return {
    next: { stage: 'knockout', seed: campaign.seed, groups: campaign.groups, groupMatches: matches, ties: decided },
    outcome: { kind: 'advanced-to-knockout' },
  }
}

function applyKnockoutResult(
  campaign: KnockoutCampaign,
  score: readonly [number, number],
): { next: Campaign | null; outcome: CampaignOutcome } {
  const myTie = campaign.ties.find((t) => !t.result && (t.homeId === ME || t.awayId === ME))
  if (!myTie) throw new Error('applyKnockoutResult: no pending tie involves the player')

  const home = myTie.homeId === ME ? score[0] : score[1]
  const away = myTie.homeId === ME ? score[1] : score[0]
  const wentToPenalties = home === away
  // See `decideLevelTie`: the player advances outright on a level score,
  // never on a coin toss.
  const winnerId = wentToPenalties ? ME : home > away ? myTie.homeId : myTie.awayId

  const decidedMine: KnockoutTie = {
    ...myTie,
    result: { homeId: myTie.homeId, awayId: myTie.awayId, home, away, wentToPenalties, winnerId },
  }
  const ties = campaign.ties.map((t) => (t === myTie ? decidedMine : t))

  if (winnerId !== ME) {
    return { next: null, outcome: { kind: 'eliminated-in-knockout', round: myTie.round } }
  }

  const nextRound = nextRoundOf(myTie.round)
  if (nextRound === null) {
    // The Final, won.
    return { next: null, outcome: { kind: 'champion' } }
  }

  const roundComplete = ties.filter((t) => t.round === myTie.round).every((t) => t.result)
  if (!roundComplete) {
    // Other ties in this round have not resolved yet from the campaign's own
    // seed — decide them now so the next round can be built.
    const finished = decideRoundExceptPlayer(ties, myTie.round, campaign.seed + 211 + KNOCKOUT_ROUNDS.indexOf(myTie.round) * 17)
    const nextTies = buildNextRound(finished, myTie.round, nextRound)
    return {
      next: { ...campaign, ties: [...finished, ...nextTies] },
      outcome: { kind: 'advanced', round: myTie.round, nextRound },
    }
  }

  const nextTies = buildNextRound(ties, myTie.round, nextRound)
  return {
    next: { ...campaign, ties: [...ties, ...nextTies] },
    outcome: { kind: 'advanced', round: myTie.round, nextRound },
  }
}

// ---------------------------------------------------------------------------
// What to play next

export interface NextFixture {
  opponentId: string
  /** Which `Stakes` this fixture should be played under. */
  stakes: 'friendly' | 'group' | 'knockout'
}

/** The player's next campaign fixture, or `null` if there is genuinely nothing pending — should not happen for a well-formed campaign, but a corrupt one must fail safe rather than crash a screen. */
export function nextFixture(campaign: Campaign): NextFixture | null {
  if (campaign.stage === 'qualifying') {
    const id = campaign.opponentIds[campaign.results.length]
    return id === undefined ? null : { opponentId: id, stakes: 'friendly' }
  }
  if (campaign.stage === 'group') {
    const group = myGroup(campaign)
    const played = group.filter((id) => id !== ME)
    const playedSoFar = campaign.matches.filter(
      (m) => (m.homeId === ME || m.awayId === ME) && group.includes(m.homeId) && group.includes(m.awayId),
    ).length
    const id = played[playedSoFar]
    return id === undefined ? null : { opponentId: id, stakes: 'group' }
  }
  const myTie = campaign.ties.find((t) => !t.result && (t.homeId === ME || t.awayId === ME))
  if (!myTie) return null
  const opponentId = myTie.homeId === ME ? myTie.awayId : myTie.homeId
  return { opponentId, stakes: 'knockout' }
}
