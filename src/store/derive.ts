/**
 * Everything the player sees about himself, derived from the attempts log.
 *
 * Nothing here is stored. Six card stats, an overall rating, a world rank and
 * the courage counters are all recomputed from the append-only log every time
 * they are asked for, which is what lets the rating mathematics change without
 * a migration and what makes every number below testable from a fixture.
 *
 * Every function is pure. `now` is always a parameter and never read from the
 * clock — decay is a projection from `lastSeenAt` to `now`, so a test can sit
 * three weeks in the future without touching time.
 *
 * Four of the constants here exist because of one specific ten-year-old, and
 * each is explained where it is defined. The short version:
 *
 *  - Being taught something new must never lower his card (domain seeding).
 *  - A new topic cannot swing the card before there is evidence (provisional).
 *  - Nothing may fall far enough to make the game hand him *harder* items than
 *    the pressure band intends (the hard floor).
 *  - Speed may be rewarded; slowness may never be punished (PAC).
 */

import { DOMAIN_TO_STAT, STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { CardStat, DomainCode } from '../curriculum/standards.generated'
import { OPPONENTS } from '../data/opponents'
import { K_MATCH, K_TRAINING, updateRating } from '../engine/elo'
import { ALL_GENERATORS } from '../engine/items/generators'
import { START_DIFFICULTY, nextDifficulty, trackFor } from '../engine/tryout'
import type { TryoutTrack } from '../engine/tryout'
import type { Attempt, AttemptContext, Card, Courage, StandardRating } from './types'

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Where a standard starts when there is nothing at all to go on. */
export const SEED_RATING = 50

/**
 * Attempts before a rating is trusted. Under this, the card segment renders
 * dashed and the standard's updates use half K.
 *
 * A new topic must not be able to swing the card hard before there is enough
 * evidence, and one lucky or unlucky first run must not lock in a false number.
 */
export const PROVISIONAL_ATTEMPTS = 5

/**
 * The hard floor. No rating may sit below this after an update or after decay.
 *
 * Below about 19, `difficultyForSuccess` wants a negative difficulty for the
 * easier pressure bands, clamps to 0, and the player then gets items *harder*
 * than the band intended. That is backwards for a skill he is already losing,
 * and it is precisely the wrong dynamic for a child who freezes in front of
 * things he fears are too hard.
 */
export const RATING_FLOOR = 20

/**
 * Rust stops here. Sits deliberately *above* `RATING_FLOOR`: staleness can only
 * take a rating down to 25, while active misses can push on to 20. Time off is
 * not the same as getting it wrong.
 */
export const DECAY_FLOOR = 25

/** Points lost per week untouched. Spaced repetition, wearing a kit. */
export const DECAY_PER_WEEK = 1.5

/**
 * The clock PAC is measured against: a floor of two seconds to read and type,
 * plus 120ms per point of difficulty.
 *
 * Difficulty rather than a flat threshold because a four-digit multiplication
 * legitimately takes longer than 7 × 8, and a stat that ignored that would just
 * be measuring which standards he happened to draw.
 */
export const PAC_BASE_MS = 2000
export const PAC_MS_PER_DIFFICULTY = 120

export const CARD_STATS: readonly CardStat[] = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']

/**
 * Every standard the game can actually put in front of him.
 *
 * Taken from the generators rather than from the curriculum because a standard
 * with no generator can never be attempted, and a rating for it would be a
 * number with nothing behind it. `FLU.MULT` is in here and is not a Montana
 * code; it belongs to no domain and so drives no domain stat.
 */
export const RATED_STANDARD_IDS: readonly string[] = ALL_GENERATORS.map((g) => g.standardId)

/** The expected answer time for an item of this difficulty. */
export function expectedLatencyMs(difficulty: number): number {
  return PAC_BASE_MS + PAC_MS_PER_DIFFICULTY * clampDifficulty(difficulty)
}

// ---------------------------------------------------------------------------

/**
 * Difficulty, forced onto the scale.
 *
 * Generators only ever emit 0–99, so for real items this is a no-op. It exists
 * because the log is about to become persisted JSON: a truncated write or a
 * hand-edited store can hand back `NaN`, and `NaN` difficulty produces a `NaN`
 * rating, which silently defeats the floor and poisons every stat downstream. A
 * fuzz over corrupt logs found exactly that. Garbage becomes 0 rather than
 * becoming contagious.
 */
const clampDifficulty = (d: number) => (Number.isFinite(d) ? Math.min(99, Math.max(0, d)) : 0)

/**
 * One Elo step, with the floor applied and non-finite results refused.
 *
 * The `isFinite` check is the rail that makes "no rating may fall below 20" a
 * property of this module rather than a property of its inputs.
 */
function stepped(rating: number, difficulty: number, correct: boolean, k: number): number {
  const next = updateRating(rating, clampDifficulty(difficulty), correct, k)
  return Number.isFinite(next) ? floorRating(next) : rating
}

/** Matches count 3x training. Practice prepares; only matches make a rating true. */
function kFor(context: AttemptContext): number {
  switch (context) {
    case 'training':
    case 'tryout':
      return K_TRAINING
    case 'match':
    case 'tackleback':
    case 'penalty':
      return K_MATCH
  }
}

/**
 * Elo is path-dependent, so the log has to be walked in the order it happened
 * no matter what order the array arrives in. Ties break on `id` so that two
 * attempts stamped the same millisecond still fold deterministically.
 */
function byTime(a: Attempt, b: Attempt): number {
  if (a.at !== b.at) return a.at - b.at
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const floorRating = (r: number) => Math.max(RATING_FLOOR, r)

/**
 * Rust, applied at derive time rather than written into the log.
 *
 * Never lifts a rating: a standard already below `DECAY_FLOOR` because it was
 * missed repeatedly stays where the misses left it.
 */
function decayed(raw: number, lastSeenAt: number, now: number): number {
  const elapsed = now - lastSeenAt
  if (!(elapsed > 0)) return raw
  const loss = DECAY_PER_WEEK * (elapsed / WEEK_MS)
  return floorRating(Math.max(Math.min(raw, DECAY_FLOOR), raw - loss))
}

/**
 * Replay the try-out's per-domain ladders out of the log.
 *
 * The try-out is a *placement test*, and the ladder it runs — start at 45, +8
 * for a right answer, −10 for a wrong one — already is an adaptive search. Its
 * final rung is the measurement. Reconstructed here rather than stored, so the
 * whole card still recomputes from history and nothing has to be migrated when
 * the mathematics changes.
 *
 * It has to be replayed from the right/wrong flags rather than read off
 * `attempt.difficulty`, because the screen records the difficulty the generator
 * actually built at, and generators clamp to their own narrower bands. The rung
 * that was asked for and the difficulty that came back are not the same number.
 *
 * `nextDifficulty` is imported rather than reimplemented from the step
 * constants: a silent divergence between the ladder the screen runs and the
 * ladder this replays would be close to impossible to spot from the card.
 */
function tryoutRungs(ordered: readonly Attempt[]): Map<TryoutTrack, number> {
  const rungs = new Map<TryoutTrack, number>()
  for (const a of ordered) {
    if (a.context !== 'tryout') continue
    const track = trackFor(a.standardId)
    rungs.set(track, nextDifficulty(rungs.get(track) ?? START_DIFFICULTY, a.correct))
  }
  return rungs
}

/** Mean of the domain's already-rated standards, or `null` if it has no history. */
function domainAverage(domain: DomainCode, rated: Map<string, number>): number | null {
  let sum = 0
  let n = 0
  for (const [id, rating] of rated) {
    if (STANDARDS_BY_ID[id]?.domain === domain) {
      sum += rating
      n += 1
    }
  }
  return n === 0 ? null : sum / n
}

/**
 * Where a standard starts the first time it is seen.
 *
 * Three answers, in order of how much they know:
 *
 *  1. If the try-out covered this standard's track, the ladder's final rung —
 *     that is a measurement, and it is the whole reason the try-out exists.
 *     Floored at 20, because the ladder bottoms out at 5 and nothing may sit
 *     below the floor.
 *  2. Otherwise, once the player has history anywhere in the standard's domain,
 *     that domain's current average. The curriculum advances during the school
 *     year: when his teacher introduces a new topic and it turns up in the game,
 *     seeding it at 50 would drag his card down for the crime of being taught
 *     something. Being taught something new must never lower his card.
 *  3. Otherwise 50, with nothing to go on.
 */
function seedFor(
  standardId: string,
  rated: Map<string, number>,
  rungs: Map<TryoutTrack, number>,
): number {
  const rung = rungs.get(trackFor(standardId))
  if (rung !== undefined) return floorRating(rung)

  const domain = STANDARDS_BY_ID[standardId]?.domain
  if (!domain) return SEED_RATING
  return domainAverage(domain, rated) ?? SEED_RATING
}

// ---------------------------------------------------------------------------

/**
 * Fold the log into one rating per standard.
 *
 * Two passes. The first replays the try-out's ladders, because a standard's
 * starting rating depends on where its track finished and that is only known
 * once the session has been read to the end. The second walks the log in time
 * order and folds everything else through Elo from that start.
 *
 * Standards that have never been attempted are still present, showing the
 * rating they *would* start at, so item selection has something to aim at
 * without a special case for a debut.
 */
export function deriveRatings(attempts: Attempt[], now: number): Map<string, StandardRating> {
  const ordered = attempts.slice().sort(byTime)
  const rungs = tryoutRungs(ordered)

  /** Running rating per standard. Only ever holds standards that were attempted. */
  const rated = new Map<string, number>()
  const counts = new Map<string, number>()
  const lastSeen = new Map<string, number>()

  for (const a of ordered) {
    const id = a.standardId
    let rating = rated.get(id)
    if (rating === undefined) {
      rating = seedFor(id, rated, rungs)
      rated.set(id, rating)
    }

    const seen = counts.get(id) ?? 0
    // Try-out questions are still questions he answered: they count as evidence
    // and they set `lastSeenAt`, so the card shows the placement and the
    // placement decays like anything else.
    counts.set(id, seen + 1)
    lastSeen.set(id, a.at)

    // But they do not fold through Elo. The ladder already placed this track,
    // and running the same evidence through a second, much slower search only
    // damps it back towards 50 — which is exactly the bug this avoids.
    if (a.context === 'tryout') continue

    // Half K while provisional, for the same reason as domain seeding: not
    // enough evidence yet to move the card hard in either direction.
    const k = kFor(a.context) * (seen < PROVISIONAL_ATTEMPTS ? 0.5 : 1)
    rated.set(id, stepped(rating, a.difficulty, a.correct, k))
  }

  const out = new Map<string, StandardRating>()
  for (const id of new Set([...RATED_STANDARD_IDS, ...rated.keys()])) {
    const attemptCount = counts.get(id) ?? 0
    if (attemptCount === 0) {
      out.set(id, {
        standardId: id,
        // The seed a debut would get, computed against the final ratings. No
        // decay: a standard never attempted has no last-seen time to decay from.
        rating: seedFor(id, rated, rungs),
        attempts: 0,
        lastSeenAt: null,
        provisional: true,
      })
      continue
    }
    const at = lastSeen.get(id)!
    out.set(id, {
      standardId: id,
      rating: decayed(rated.get(id)!, at, now),
      attempts: attemptCount,
      lastSeenAt: at,
      provisional: attemptCount < PROVISIONAL_ATTEMPTS,
    })
  }
  return out
}

/**
 * PAC — pace. Fluency, not a domain.
 *
 * **The rule this obeys: PAC rises from fast correct answers and never falls
 * from slow ones.** Timed maths cost this child recess and produced meltdowns.
 * Speed may be rewarded; slowness may never be punished. So:
 *
 *  - A wrong answer changes nothing, however fast it was. Wrong answers are the
 *    other five stats' business.
 *  - A correct answer at or over the expected time changes nothing either — not
 *    a small penalty, not a fraction of a point. Nothing.
 *  - A correct answer under the expected time gets a positive Elo update scaled
 *    by how far under it came: answering in exactly the expected time is worth
 *    zero, answering instantly is worth the full K. That smooth taper means the
 *    exact threshold is not load-bearing — there is no cliff to fall off, and
 *    being 10% quicker earns 10% of the update.
 *
 * The Elo update is what keeps this honest rather than the clock. Beating the
 * clock on easy items barely moves anything, because the expected score against
 * a low difficulty is already near 1. PAC therefore converges on the difficulty
 * of the items he answers *fast*, not on how many he answers.
 *
 * PAC still decays like the other stats, from the last time he played at all
 * rather than the last time he was quick — staleness is not punishment, and a
 * slow session is still a session.
 */
function derivePace(attempts: Attempt[], now: number): number {
  const ordered = attempts.slice().sort(byTime)
  if (ordered.length === 0) return SEED_RATING

  let pac = SEED_RATING
  let wins = 0

  for (const a of ordered) {
    if (!a.correct) continue

    const difficulty = clampDifficulty(a.difficulty)
    const speed = 1 - a.latencyMs / expectedLatencyMs(difficulty)
    // Written as `!(speed > 0)` so a NaN or missing latency also does nothing.
    if (!(speed > 0)) continue

    const k = kFor(a.context) * (wins < PROVISIONAL_ATTEMPTS ? 0.5 : 1) * Math.min(1, speed)
    // `updateRating` with `correct: true` can only go up, but the `max` is a
    // rail rather than a comment: nothing that happens in here may lower PAC,
    // including a non-finite step arriving from a corrupt log.
    pac = Math.max(pac, stepped(pac, difficulty, true, k))
    wins += 1
  }

  return decayed(pac, ordered[ordered.length - 1]!.at, now)
}

/**
 * The six card stats.
 *
 * Five are the mean of their domain's *attempted* standards. A standard he has
 * never been given does not count as 50 and does not drag the stat down; a
 * domain with no history at all shows the seed.
 *
 * NOTE — this takes `now` on top of the two arguments the plan specified. PAC
 * is derived from the log rather than from the ratings map, and it decays like
 * everything else, so it needs a reference time. A pure function cannot decay
 * without being told when "now" is; the alternative was reading the clock in
 * here, which would make the whole module untestable.
 */
export function deriveCard(
  ratings: Map<string, StandardRating>,
  attempts: Attempt[],
  now: number,
): Card {
  const sums = new Map<CardStat, { sum: number; n: number }>()

  for (const rating of ratings.values()) {
    if (rating.attempts === 0) continue
    const domain = STANDARDS_BY_ID[rating.standardId]?.domain
    if (!domain) continue
    const stat = DOMAIN_TO_STAT[domain]
    const bucket = sums.get(stat) ?? { sum: 0, n: 0 }
    bucket.sum += rating.rating
    bucket.n += 1
    sums.set(stat, bucket)
  }

  const statOf = (stat: CardStat) => {
    const bucket = sums.get(stat)
    return bucket && bucket.n > 0 ? bucket.sum / bucket.n : SEED_RATING
  }

  return {
    PAC: derivePace(attempts, now),
    SHO: statOf('SHO'),
    PAS: statOf('PAS'),
    DRI: statOf('DRI'),
    DEF: statOf('DEF'),
    PHY: statOf('PHY'),
  }
}

/** The number on the front of the card. Left unrounded; the card rounds it. */
export function deriveOverall(card: Card): number {
  let sum = 0
  for (const stat of CARD_STATS) sum += card[stat]
  return sum / CARD_STATS.length
}

/**
 * Where the player sits in the world, among the opponent roster plus himself.
 *
 * A brand-new player at 50 lands below every side on the roster and comes in
 * last, which is the point: the number has somewhere to go. Ties go to the
 * player — matching a side is not being behind it.
 */
export function deriveWorldRank(overall: number): number {
  let ahead = 0
  for (const opponent of OPPONENTS) {
    if (opponent.rating > overall) ahead += 1
  }
  return ahead + 1
}

/**
 * The bravery track.
 *
 * The chores-app reward pays on courage and habit, never on wins or accuracy,
 * so a bicycle kick counts as attempted whether or not it goes in. Order does
 * not matter here — these are counts, not a fold.
 */
export function deriveCourage(attempts: Attempt[]): Courage {
  const courage: Courage = {
    hardShotsAttempted: 0,
    hardShotsScored: 0,
    tackleBacksWon: 0,
    tackleBacksFaced: 0,
  }

  for (const a of attempts) {
    if (a.shot === 'outside18' || a.shot === 'bicycle') {
      courage.hardShotsAttempted += 1
      if (a.correct) courage.hardShotsScored += 1
    }
    if (a.context === 'tackleback') {
      courage.tackleBacksFaced += 1
      if (a.correct) courage.tackleBacksWon += 1
    }
  }

  return courage
}
