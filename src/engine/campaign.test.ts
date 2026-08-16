import { describe, expect, it } from 'vitest'
import {
  ME,
  applyCampaignResult,
  drawGroups,
  drawQualifying,
  groupTable,
  myGroup,
  nextFixture,
  simulateMatch,
  startGroupStage,
} from './campaign'
import type { Campaign, GroupCampaign, KnockoutCampaign, KnockoutRound, QualifyingCampaign } from './campaign'
import { OPPONENTS, WORLD_CUP_FIELD } from '../data/opponents'
import { makeRng } from './items/rng'

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 97 + 1)

// ---------------------------------------------------------------------------

describe('simulateMatch', () => {
  it('a draw is always really level', () => {
    const rng = makeRng(1)
    let checked = 0
    for (let i = 0; i < 2000 && checked < 100; i++) {
      const [a, b] = simulateMatch(75, 74, rng)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeGreaterThanOrEqual(0)
      if (a === b) checked++
    }
    expect(checked, 'never drew a level score to check').toBeGreaterThan(0)
  })

  it('scores are never negative', () => {
    const rng = makeRng(3)
    for (let i = 0; i < 500; i++) {
      const [a, b] = simulateMatch(rng.int(50, 95), rng.int(50, 95), rng)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeGreaterThanOrEqual(0)
    }
  })

  it('the better-rated side wins more often over many matches', () => {
    const rng = makeRng(11)
    let strongWins = 0
    let weakWins = 0
    const trials = 4000
    for (let i = 0; i < trials; i++) {
      const [strong, weak] = simulateMatch(90, 60, rng)
      if (strong > weak) strongWins++
      if (weak > strong) weakWins++
    }
    expect(strongWins).toBeGreaterThan(weakWins * 3)
  })

  it('evenly matched sides are close to a coin flip', () => {
    const rng = makeRng(23)
    let aWins = 0
    let bWins = 0
    const trials = 4000
    for (let i = 0; i < trials; i++) {
      const [a, b] = simulateMatch(75, 75, rng)
      if (a > b) aWins++
      if (b > a) bWins++
    }
    const ratio = aWins / bWins
    expect(ratio, `aWins=${aWins} bWins=${bWins}`).toBeGreaterThan(0.75)
    expect(ratio, `aWins=${aWins} bWins=${bWins}`).toBeLessThan(1.33)
  })
})

// ---------------------------------------------------------------------------

describe('drawQualifying', () => {
  it('always returns exactly three distinct opponents', () => {
    for (const seed of SEEDS) {
      for (const overall of [30, 50, 58, 75, 95]) {
        const q = drawQualifying(overall, seed)
        expect(q.opponentIds).toHaveLength(3)
        expect(new Set(q.opponentIds).size).toBe(3)
      }
    }
  })

  it('is deterministic for the same seed and rating', () => {
    expect(drawQualifying(58, 42)).toEqual(drawQualifying(58, 42))
  })

  it('draws opponents near his own level, not the extremes of the roster', () => {
    const q = drawQualifying(58, 5)
    for (const id of q.opponentIds) {
      const rating = OPPONENTS.find((o) => o.id === id)!.rating
      expect(rating, id).toBeGreaterThan(30)
      expect(rating, id).toBeLessThan(90)
    }
  })

  it('still returns three even at the very top of the roster, where the band is thin', () => {
    const q = drawQualifying(99, 7)
    expect(q.opponentIds).toHaveLength(3)
    expect(new Set(q.opponentIds).size).toBe(3)
  })

  it('still returns three at the very bottom too', () => {
    const q = drawQualifying(1, 7)
    expect(q.opponentIds).toHaveLength(3)
    expect(new Set(q.opponentIds).size).toBe(3)
  })
})

// ---------------------------------------------------------------------------

describe('drawGroups', () => {
  const topSeedId = [...WORLD_CUP_FIELD].filter((o) => o.tier === 1).sort((a, b) => b.rating - a.rating)[0]!.id

  it('is eight groups of four', () => {
    for (const seed of SEEDS) {
      const groups = drawGroups(seed)
      expect(groups).toHaveLength(8)
      for (const g of groups) expect(g).toHaveLength(4)
    }
  })

  it('the player appears exactly once, always in group 0', () => {
    for (const seed of SEEDS) {
      const groups = drawGroups(seed)
      expect(groups[0]).toContain(ME)
      for (let i = 1; i < 8; i++) expect(groups[i]).not.toContain(ME)
    }
  })

  it('every team across the whole draw is distinct', () => {
    for (const seed of SEEDS) {
      const groups = drawGroups(seed)
      const all = groups.flat()
      expect(new Set(all).size).toBe(all.length)
    }
  })

  it('every drawn id is either the player or a real World Cup field team', () => {
    const validIds = new Set(WORLD_CUP_FIELD.map((o) => o.id))
    for (const seed of SEEDS) {
      for (const id of drawGroups(seed).flat()) {
        if (id === ME) continue
        expect(validIds.has(id), id).toBe(true)
      }
    }
  })

  it('all eight tier-1 sides are always drawn, one per group', () => {
    const tier1Ids = new Set(WORLD_CUP_FIELD.filter((o) => o.tier === 1).map((o) => o.id))
    for (const seed of SEEDS) {
      const groups = drawGroups(seed)
      for (const group of groups) {
        const tier1InGroup = group.filter((id) => tier1Ids.has(id))
        expect(tier1InGroup, `seed ${seed}`).toHaveLength(1)
      }
      const allTier1Drawn = new Set(groups.flat().filter((id) => tier1Ids.has(id)))
      expect(allTier1Drawn.size, `seed ${seed}`).toBe(8)
    }
  })

  it('THE FINAL-BOSS PROPERTY: the run’s top-rated side is always in group 4, on the opposite bracket half from the player', () => {
    for (const seed of SEEDS) {
      const groups = drawGroups(seed)
      expect(groups[4], `seed ${seed}`).toContain(topSeedId)
      // Never in the player's own group.
      expect(groups[0], `seed ${seed}`).not.toContain(topSeedId)
    }
  })

  it('on the current roster, the top seed is Spain', () => {
    // Not load-bearing for the mechanism above — the rule is general ("the
    // run's highest-rated side"), and this just confirms it resolves to what
    // Scott actually asked for on today's data.
    expect(topSeedId).toBe('spain')
  })

  it('produces different draws for different seeds — a second run does not look like the first', () => {
    const a = drawGroups(1).flat().join(',')
    const b = drawGroups(2).flat().join(',')
    expect(a).not.toBe(b)
  })

  it('is deterministic for a repeated seed', () => {
    expect(drawGroups(99)).toEqual(drawGroups(99))
  })
})

// ---------------------------------------------------------------------------

describe('groupTable', () => {
  const teams: [string, string, string, string] = ['a', 'b', 'c', 'd']

  it('awards points by the stated rule: W3 D1 L0', () => {
    const table = groupTable(teams, [
      { homeId: 'a', awayId: 'b', home: 2, away: 0 },
      { homeId: 'c', awayId: 'd', home: 1, away: 1 },
    ])
    const points = Object.fromEntries(table.map((t) => [t.teamId, t.points]))
    expect(points.a).toBe(3)
    expect(points.b).toBe(0)
    expect(points.c).toBe(1)
    expect(points.d).toBe(1)
  })

  it('sorts by points first', () => {
    const table = groupTable(teams, [
      { homeId: 'a', awayId: 'b', home: 3, away: 0 },
      { homeId: 'c', awayId: 'd', home: 0, away: 0 },
    ])
    expect(table[0]!.teamId).toBe('a') // 3 points beats 1 point
  })

  it('breaks a points tie on goal difference', () => {
    const table = groupTable(teams, [
      { homeId: 'a', awayId: 'b', home: 4, away: 0 }, // a: +4
      { homeId: 'c', awayId: 'd', home: 2, away: 0 }, // c: +2
      { homeId: 'a', awayId: 'c', home: 0, away: 0 }, // a and c draw each other
      { homeId: 'b', awayId: 'd', home: 0, away: 0 },
    ])
    // a: W1 D1 = 4 pts, GD +4. c: W1 D1 = 4 pts, GD +2 — same points, a ahead on GD.
    const aIdx = table.findIndex((t) => t.teamId === 'a')
    const cIdx = table.findIndex((t) => t.teamId === 'c')
    expect(aIdx).toBeLessThan(cIdx)
  })

  it('ignores matches that do not belong to this group', () => {
    const table = groupTable(teams, [{ homeId: 'a', awayId: 'zz', home: 9, away: 0 }])
    expect(table.find((t) => t.teamId === 'a')!.played).toBe(0)
  })

  it('gives an unplayed team an honest all-zero row', () => {
    const table = groupTable(teams, [])
    for (const row of table) {
      expect(row).toMatchObject({ played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 })
    }
  })
})

// ---------------------------------------------------------------------------

describe('startGroupStage', () => {
  it('pre-simulates every match that does not involve the player — 45 of the 48', () => {
    const campaign = startGroupStage(5)
    expect(campaign.matches).toHaveLength(45)
    expect(campaign.matches.every((m) => m.homeId !== ME && m.awayId !== ME)).toBe(true)
  })

  it('includes all three non-player matches inside the player’s own group', () => {
    const campaign = startGroupStage(5)
    const group = myGroup(campaign)
    const others = group.filter((id) => id !== ME)
    const withinGroup = campaign.matches.filter(
      (m) => others.includes(m.homeId) && others.includes(m.awayId),
    )
    expect(withinGroup).toHaveLength(3) // a 3-team round robin among the other three
  })

  it('every one of the other seven groups has its full six-match round robin', () => {
    const campaign = startGroupStage(5)
    for (let g = 1; g < 8; g++) {
      const group = campaign.groups[g]!
      const inGroup = campaign.matches.filter(
        (m) => group.includes(m.homeId) && group.includes(m.awayId),
      )
      expect(inGroup, `group ${g}`).toHaveLength(6)
    }
  })
})

// ---------------------------------------------------------------------------
// The reducer, end to end

function win(us = 2, them = 0): readonly [number, number] {
  return [us, them]
}
function loss(us = 0, them = 2): readonly [number, number] {
  return [us, them]
}
function draw(): readonly [number, number] {
  return [1, 1]
}

describe('applyCampaignResult — qualifying', () => {
  it('qualifies as soon as two wins are reached, without needing a third match', () => {
    const q = drawQualifying(58, 1)
    const r1 = applyCampaignResult(q, 'win', win())
    expect(r1.outcome.kind).toBe('qualifying-continues')
    const r2 = applyCampaignResult(r1.next as QualifyingCampaign, 'win', win())
    expect(r2.outcome.kind).toBe('qualified')
    expect(r2.next?.stage).toBe('group')
  })

  it('fails as soon as two losses are reached', () => {
    const q = drawQualifying(58, 1)
    const r1 = applyCampaignResult(q, 'loss', loss())
    const r2 = applyCampaignResult(r1.next as QualifyingCampaign, 'loss', loss())
    expect(r2.outcome.kind).toBe('qualifying-failed')
    expect(r2.next).toBeNull()
  })

  it('fails after three draws — two wins were never reached', () => {
    const q = drawQualifying(58, 1)
    let state: Campaign | null = q
    let outcome
    for (let i = 0; i < 3; i++) {
      const r = applyCampaignResult(state as Campaign, 'draw', draw())
      state = r.next
      outcome = r.outcome
    }
    expect(outcome!.kind).toBe('qualifying-failed')
    expect(state).toBeNull()
  })

  it('a win then a draw then a win still qualifies', () => {
    const q = drawQualifying(58, 1)
    const r1 = applyCampaignResult(q, 'win', win())
    const r2 = applyCampaignResult(r1.next as QualifyingCampaign, 'draw', draw())
    expect(r2.outcome.kind).toBe('qualifying-continues')
    const r3 = applyCampaignResult(r2.next as QualifyingCampaign, 'win', win())
    expect(r3.outcome.kind).toBe('qualified')
  })
})

/** Plays out an entire group stage, winning every one of the player's own matches, and returns the resulting knockout campaign. */
function qualifyAndWinGroup(seed: number): KnockoutCampaign {
  let state: Campaign = startGroupStage(seed)
  let last
  for (let i = 0; i < 3; i++) {
    last = applyCampaignResult(state, 'win', win(3, 0))
    state = last.next as Campaign
  }
  expect(last!.outcome.kind).toBe('advanced-to-knockout')
  return state as KnockoutCampaign
}

describe('applyCampaignResult — group stage', () => {
  it('reports group-continues for the first two of his three matches', () => {
    let state: Campaign = startGroupStage(9)
    const r1 = applyCampaignResult(state, 'win', win())
    expect(r1.outcome.kind).toBe('group-continues')
    state = r1.next as Campaign
    const r2 = applyCampaignResult(state, 'win', win())
    expect(r2.outcome.kind).toBe('group-continues')
  })

  it('advances to the knockout stage on finishing top two, after the third match', () => {
    const knockout = qualifyAndWinGroup(9)
    expect(knockout.stage).toBe('knockout')
    expect(knockout.ties.filter((t) => t.round === 'r16')).toHaveLength(8)
  })

  it('eliminates a team that finishes bottom of its group despite the other seven groups already being decided', () => {
    let state: Campaign = startGroupStage(13)
    let last
    for (let i = 0; i < 3; i++) {
      last = applyCampaignResult(state, 'loss', loss(0, 5))
      state = last.next as Campaign
    }
    expect(last!.outcome.kind).toBe('eliminated-in-group')
    expect(last!.next).toBeNull()
  })

  it('the R16 draw is fully formed: the player is in exactly one tie, everyone else already has a result', () => {
    const knockout = qualifyAndWinGroup(21)
    const r16 = knockout.ties.filter((t) => t.round === 'r16')
    const mine = r16.filter((t) => t.homeId === ME || t.awayId === ME)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.result).toBeUndefined() // his own is the one still to play
    for (const tie of r16) {
      if (tie === mine[0]) continue
      expect(tie.result, `${tie.homeId} v ${tie.awayId}`).toBeDefined()
    }
  })
})

describe('applyCampaignResult — knockout, full run to champion', () => {
  it('winning all four rounds ends in champion, with next: null', () => {
    let state: Campaign = qualifyAndWinGroup(33)
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      const nf = nextFixture(state)
      expect(nf, `round ${i}`).not.toBeNull()
      const r = applyCampaignResult(state, 'win', win(3, 0))
      seen.push(r.outcome.kind)
      state = r.next as Campaign
    }
    expect(seen[0]).toBe('advanced')
    expect(seen[1]).toBe('advanced')
    expect(seen[2]).toBe('advanced')
    expect(seen[3]).toBe('champion')
    expect(state).toBeNull()
  })

  it('losing the first knockout match ends the run cleanly', () => {
    const knockout = qualifyAndWinGroup(41)
    const r = applyCampaignResult(knockout, 'loss', loss(0, 4))
    expect(r.outcome).toEqual({ kind: 'eliminated-in-knockout', round: 'r16' })
    expect(r.next).toBeNull()
  })

  it('a drawn knockout match advances the player rather than deciding it on penalties', () => {
    // The specific, deliberate design choice: the player is never eliminated
    // by a coin toss after fighting an opponent to a draw.
    const knockout = qualifyAndWinGroup(51)
    const r = applyCampaignResult(knockout, 'draw', draw())
    expect(r.outcome.kind).toBe('advanced')
    expect(r.next).not.toBeNull()
  })

  it('advances round by round in the right order: r16, qf, sf, final', () => {
    let state: Campaign = qualifyAndWinGroup(61)
    const rounds: (KnockoutRound | undefined)[] = []
    for (let i = 0; i < 4; i++) {
      const fixture = nextFixture(state)
      const tie = (state as KnockoutCampaign).ties.find(
        (t) => !t.result && (t.homeId === ME || t.awayId === ME),
      )
      rounds.push(tie?.round)
      void fixture
      const r = applyCampaignResult(state, 'win', win())
      state = r.next as Campaign
    }
    expect(rounds).toEqual(['r16', 'qf', 'sf', 'final'])
  })
})

describe('nextFixture', () => {
  it('names the right opponent and stakes at every stage of a full run', () => {
    const q = drawQualifying(58, 71)
    expect(nextFixture(q)).toEqual({ opponentId: q.opponentIds[0], stakes: 'friendly' })

    let state: Campaign = startGroupStage(71)
    const group = myGroup(state as GroupCampaign)
    const firstOpponent = group.filter((id) => id !== ME)[0]
    expect(nextFixture(state)).toEqual({ opponentId: firstOpponent, stakes: 'group' })

    const knockout = qualifyAndWinGroup(71)
    const nf = nextFixture(knockout)
    expect(nf?.stakes).toBe('knockout')
    expect(nf?.opponentId).not.toBe(ME)
  })
})

// ---------------------------------------------------------------------------
// The plan's own acceptance criteria, checked as properties

describe('acceptance: no sequence of results can strand a campaign', () => {
  it('every non-terminal outcome leaves a campaign for which nextFixture resolves', () => {
    const rng = makeRng(777)
    for (let trial = 0; trial < 60; trial++) {
      let state: Campaign | null = drawQualifying(58, trial + 1)
      let guard = 0
      while (state !== null && guard++ < 40) {
        const fixture = nextFixture(state)
        expect(fixture, `trial ${trial}, stage ${state.stage}`).not.toBeNull()
        const outcome = rng.pick(['win', 'draw', 'loss'] as const)
        const score = outcome === 'win' ? win() : outcome === 'loss' ? loss() : draw()
        const result = applyCampaignResult(state, outcome, score)
        state = result.next
      }
      expect(guard, `trial ${trial} never terminated`).toBeLessThan(40)
    }
  })
})

describe('acceptance: eliminated always means a fresh qualifying run is available', () => {
  it('every terminal outcome produces next: null', () => {
    const rng = makeRng(555)
    const terminalKinds = new Set([
      'qualifying-failed',
      'eliminated-in-group',
      'eliminated-in-knockout',
      'champion',
    ])
    let sawTerminal = 0
    for (let trial = 0; trial < 80; trial++) {
      let state: Campaign | null = drawQualifying(58, trial + 1)
      let guard = 0
      while (state !== null && guard++ < 40) {
        const outcome = rng.pick(['win', 'draw', 'loss'] as const)
        const score = outcome === 'win' ? win() : outcome === 'loss' ? loss() : draw()
        const result = applyCampaignResult(state, outcome, score)
        if (terminalKinds.has(result.outcome.kind)) {
          expect(result.next, result.outcome.kind).toBeNull()
          sawTerminal++
        }
        state = result.next
      }
    }
    expect(sawTerminal).toBeGreaterThan(0)
    // And nothing about having just been eliminated stops a brand new
    // qualifying draw from being built — it takes no campaign state at all.
    expect(() => drawQualifying(58, 999)).not.toThrow()
  })
})

describe('acceptance: stars increment exactly on a won final, never anywhere else', () => {
  it('champion is only ever reported after winning the final round', () => {
    let state: Campaign = qualifyAndWinGroup(81)
    for (const round of ['r16', 'qf', 'sf'] as const) {
      const nf = nextFixture(state)
      expect(nf).not.toBeNull()
      const r = applyCampaignResult(state, 'win', win())
      expect(r.outcome.kind, round).not.toBe('champion')
      state = r.next as Campaign
    }
    const final = applyCampaignResult(state, 'win', win())
    expect(final.outcome.kind).toBe('champion')
  })

  it('no other outcome kind is ever "champion" in a losing run', () => {
    const rng = makeRng(444)
    for (let trial = 0; trial < 40; trial++) {
      let state: Campaign | null = drawQualifying(58, trial + 1)
      let guard = 0
      let champions = 0
      while (state !== null && guard++ < 40) {
        // Never win — this run must never become champion.
        const outcome = rng.pick(['draw', 'loss'] as const)
        const score = outcome === 'loss' ? loss() : draw()
        const result = applyCampaignResult(state, outcome, score)
        if (result.outcome.kind === 'champion') champions++
        state = result.next
      }
      expect(champions, `trial ${trial}`).toBe(0)
    }
  })
})

describe('the qualifying stakes and the group/knockout stakes match the plan', () => {
  it('qualifying is friendly, group is group, knockout is knockout', () => {
    expect(nextFixture(drawQualifying(58, 1))?.stakes).toBe('friendly')
    expect(nextFixture(startGroupStage(1))?.stakes).toBe('group')
    expect(nextFixture(qualifyAndWinGroup(1))?.stakes).toBe('knockout')
  })
})
