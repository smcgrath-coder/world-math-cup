/**
 * Turning campaign state into words and numbers a screen can show — shared
 * between `Play.tsx` (what's coming) and `PostMatch.tsx` (what just
 * happened), so the two screens describe the same run consistently rather
 * than drifting into two voices for one arc.
 *
 * Every function here is pure and takes the campaign state it needs
 * explicitly, so it is testable without rendering anything.
 */

import { ME, groupTable, myGroup } from '../engine/campaign'
import type { Campaign, CampaignOutcome, GroupCampaign, GroupStanding, KnockoutCampaign, KnockoutRound, MatchOutcome } from '../engine/campaign'
import { OPPONENTS_BY_ID } from '../data/opponents'

export function opponentName(id: string): string {
  return OPPONENTS_BY_ID[id]?.name ?? id
}

const ROUND_LABEL: Record<KnockoutRound, string> = {
  r16: 'Round of 16',
  qf: 'Quarter-Final',
  sf: 'Semi-Final',
  final: 'Final',
}

export function roundLabel(round: KnockoutRound): string {
  return ROUND_LABEL[round]
}

/** The player's own tie that has not been played yet, or `null` if every round he reached is decided (should only happen for the instant between winning the Final and the campaign clearing). */
export function myPendingTie(campaign: KnockoutCampaign) {
  return campaign.ties.find((t) => !t.result && (t.homeId === ME || t.awayId === ME)) ?? null
}

export function stageLabel(campaign: Campaign): string {
  if (campaign.stage === 'qualifying') return 'Qualifying'
  if (campaign.stage === 'group') return 'Group stage'
  const tie = myPendingTie(campaign)
  return tie ? roundLabel(tie.round) : 'Knockout'
}

/** A short line of where things stand — for the qualifying series specifically, since it's the one stage with a running tally worth saying out loud. */
export function qualifyingLine(results: readonly MatchOutcome[]): string {
  const wins = results.filter((r) => r === 'win').length
  const losses = results.filter((r) => r === 'loss').length
  const remaining = 3 - results.length
  if (results.length === 0) return 'Win two of three to reach the group stage.'
  return `${wins} win${wins === 1 ? '' : 's'}, ${losses} loss${losses === 1 ? '' : 'es'}, ${remaining} to play.`
}

/** The player's own group table, with real names resolved. */
export function myGroupStandings(campaign: GroupCampaign): (GroupStanding & { name: string })[] {
  const group = myGroup(campaign)
  const table = groupTable(group, campaign.matches)
  return table.map((row) => ({ ...row, name: row.teamId === ME ? 'You' : opponentName(row.teamId) }))
}

/** [win, loss, draw] scored from the player's own side. */
export function outcomeFor(us: number, them: number): MatchOutcome {
  if (us > them) return 'win'
  if (us < them) return 'loss'
  return 'draw'
}

// ---------------------------------------------------------------------------
// Post-match

export interface CampaignCardCopy {
  heading: string
  body: string
}

/**
 * What the post-match campaign card says, for every kind of outcome.
 *
 * Two rules this project has been strict about everywhere else, kept here:
 * the word "wrong" never appears, and elimination reads as the run ending
 * rather than as him losing something — "the run ends here, and qualifying
 * is open again whenever you like" rather than "you're out" or "you lost the
 * cup". A cup run is exactly as retriable as everything else in this game.
 */
export function campaignCardCopy(outcome: CampaignOutcome): CampaignCardCopy {
  switch (outcome.kind) {
    case 'qualifying-continues':
      return {
        heading: 'Qualifying continues',
        body: `${outcome.wins} win${outcome.wins === 1 ? '' : 's'} so far. Win one more and the group stage is yours.`,
      }
    case 'qualified':
      return {
        heading: 'Qualified!',
        body: 'The group stage draw is in. Find your group on the Play screen whenever you’re ready.',
      }
    case 'qualifying-failed':
      return {
        heading: 'The run ends here',
        body: 'Not through this time. Qualifying is open again whenever you like — no waiting.',
      }
    case 'group-continues':
      return {
        heading: 'Group stage',
        body: 'One down. Check the table on the Play screen to see where that leaves you.',
      }
    case 'advanced-to-knockout':
      return {
        heading: 'Through to the knockout stage!',
        body: 'Top two in the group. From here it’s one match at a time — win and you’re through.',
      }
    case 'eliminated-in-group':
      return {
        heading: 'The run ends here',
        body: 'Not through the group this time. Qualifying is open again whenever you like — no waiting.',
      }
    case 'advanced':
      return {
        heading: `Through to the ${roundLabel(outcome.nextRound)}!`,
        body: `${roundLabel(outcome.round)} beaten. On to the next one.`,
      }
    case 'eliminated-in-knockout':
      return {
        heading: 'The run ends here',
        body: `Out at the ${roundLabel(outcome.round)}. Qualifying is open again whenever you like — no waiting.`,
      }
    case 'champion':
      return {
        heading: 'World champions.',
        body: 'Every round of it. A star goes up on the crest for this one.',
      }
  }
}
