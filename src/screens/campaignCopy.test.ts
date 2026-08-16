import { describe, expect, it } from 'vitest'
import {
  campaignCardCopy,
  myGroupStandings,
  opponentName,
  outcomeFor,
  qualifyingLine,
  roundLabel,
  stageLabel,
} from './campaignCopy'
import { ME, KNOCKOUT_ROUNDS } from '../engine/campaign'
import type { CampaignOutcome, GroupCampaign, KnockoutCampaign } from '../engine/campaign'

describe('opponentName', () => {
  it('resolves a real id to its real name', () => {
    expect(opponentName('spain')).toBe('Spain')
  })

  it('falls back to the id itself rather than throwing on an unknown one', () => {
    expect(opponentName('atlantis')).toBe('atlantis')
  })
})

describe('roundLabel / stageLabel', () => {
  it('names every knockout round in words a ten-year-old already uses', () => {
    expect(roundLabel('r16')).toBe('Round of 16')
    expect(roundLabel('qf')).toBe('Quarter-Final')
    expect(roundLabel('sf')).toBe('Semi-Final')
    expect(roundLabel('final')).toBe('Final')
  })

  it('stageLabel reads the pending knockout tie’s round, not just "Knockout"', () => {
    const campaign: KnockoutCampaign = {
      stage: 'knockout',
      seed: 1,
      groups: Array.from({ length: 8 }, (_, i) =>
        i === 0 ? [ME, 'a', 'b', 'c'] : [`t${i}`, `u${i}`, `v${i}`, `w${i}`],
      ) as never,
      groupMatches: [],
      ties: [{ round: 'sf', homeId: ME, awayId: 'spain' }],
    }
    expect(stageLabel(campaign)).toBe('Semi-Final')
  })
})

describe('qualifyingLine', () => {
  it('opens with the target before anything has been played', () => {
    expect(qualifyingLine([])).toMatch(/win two of three/i)
  })

  it('counts wins, losses and what remains', () => {
    expect(qualifyingLine(['win', 'loss'])).toBe('1 win, 1 loss, 1 to play.')
  })

  it('pluralises correctly at zero and one', () => {
    expect(qualifyingLine(['win'])).toContain('1 win,')
    expect(qualifyingLine(['loss', 'loss'])).toContain('2 losses,')
  })
})

describe('outcomeFor', () => {
  it('reads the scoreline from the player’s own side', () => {
    expect(outcomeFor(2, 0)).toBe('win')
    expect(outcomeFor(0, 2)).toBe('loss')
    expect(outcomeFor(1, 1)).toBe('draw')
  })
})

describe('myGroupStandings', () => {
  it('names the player "You" and resolves everyone else to a real team name', () => {
    const campaign: GroupCampaign = {
      stage: 'group',
      seed: 1,
      groups: [
        [ME, 'spain', 'japan', 'haiti'],
        ...Array.from({ length: 7 }, (_, i) => [`t${i}`, `u${i}`, `v${i}`, `w${i}`]),
      ] as never,
      matches: [{ homeId: 'spain', awayId: 'japan', home: 2, away: 0 }],
    }
    const table = myGroupStandings(campaign)
    const names = table.map((r) => r.name)
    expect(names).toContain('You')
    expect(names).toContain('Spain')
    expect(names).not.toContain('spain') // the raw id must not leak through
  })
})

describe('campaignCardCopy — never says the forbidden words, everywhere the log says the game must not', () => {
  const ALL_OUTCOMES: CampaignOutcome[] = [
    { kind: 'qualifying-continues', wins: 1, losses: 0, remaining: 2 },
    { kind: 'qualified' },
    { kind: 'qualifying-failed' },
    { kind: 'group-continues' },
    { kind: 'advanced-to-knockout' },
    { kind: 'eliminated-in-group' },
    ...KNOCKOUT_ROUNDS.slice(0, 3).map((round, i) => ({
      kind: 'advanced' as const,
      round,
      nextRound: KNOCKOUT_ROUNDS[i + 1]!,
    })),
    ...KNOCKOUT_ROUNDS.map((round) => ({ kind: 'eliminated-in-knockout' as const, round })),
    { kind: 'champion' },
  ]

  it('never uses "wrong", "lost", "fail" as a verdict on him, or a losing streak framing', () => {
    for (const outcome of ALL_OUTCOMES) {
      const copy = campaignCardCopy(outcome)
      const text = `${copy.heading} ${copy.body}`
      expect(text, outcome.kind).not.toMatch(/\bwrong\b/i)
      expect(text, outcome.kind).not.toMatch(/\byou lost\b/i)
      expect(text, outcome.kind).not.toMatch(/\byou failed\b/i)
      expect(text, outcome.kind).not.toMatch(/\byou're out\b/i)
    }
  })

  it('every elimination-shaped outcome says the run can start again with no wait', () => {
    const eliminations = ALL_OUTCOMES.filter((o) =>
      ['qualifying-failed', 'eliminated-in-group', 'eliminated-in-knockout'].includes(o.kind),
    )
    expect(eliminations.length).toBeGreaterThan(0)
    for (const outcome of eliminations) {
      const copy = campaignCardCopy(outcome)
      expect(`${copy.heading} ${copy.body}`, outcome.kind).toMatch(/again whenever you like|no waiting/i)
    }
  })

  it('champion is the only outcome that mentions a star', () => {
    for (const outcome of ALL_OUTCOMES) {
      const copy = campaignCardCopy(outcome)
      const mentionsStar = /\bstar\b/i.test(`${copy.heading} ${copy.body}`)
      expect(mentionsStar, outcome.kind).toBe(outcome.kind === 'champion')
    }
  })

  it('every outcome kind produces non-empty heading and body', () => {
    for (const outcome of ALL_OUTCOMES) {
      const copy = campaignCardCopy(outcome)
      expect(copy.heading.trim().length, outcome.kind).toBeGreaterThan(0)
      expect(copy.body.trim().length, outcome.kind).toBeGreaterThan(0)
    }
  })
})
