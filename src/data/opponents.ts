/**
 * The opponent roster.
 *
 * The 48 teams that qualified for the 2026 World Cup, plus a short list of
 * notable absentees who appear in friendlies and lesser tournaments but not in
 * the World Cup itself — which is exactly their real situation, and gives Italy
 * a reason to exist in the game despite missing a third straight tournament.
 *
 * Stars are World Cup titles, worn above the crest. Ratings and tiers are
 * derived from the FIFA/Coca-Cola Men's World Ranking — see
 * `scripts/rerank-opponents.mjs`, which regenerates this list in rank order.
 * Run it when the ranking moves rather than hand-editing numbers here.
 *
 * **Stars and rating are deliberately different facts, and they no longer
 * agree.** Stars are what a country has won; the rating is how good they are
 * today. Brazil still wear five and are 5th; Spain wear two and are 1st, having
 * just won the thing; Italy wear four and did not qualify at all. An earlier
 * version of this file claimed the stars doubled as the difficulty signal.
 * After the 2026 tournament they do not, and the honest version is better — it
 * is exactly the distinction a football-mad ten-year-old already understands.
 */

import type { CardStat } from '../curriculum/standards.generated'

export type Tier = 1 | 2 | 3 | 4

export interface Opponent {
  id: string
  name: string
  /** World Cup titles, worn above the crest. */
  stars: number
  /** Overall strength, 0–99, on the same scale as the player's rating. */
  rating: number
  tier: Tier
  /** Shirt and trim. Teams are recognised by kit, not by an accurate flag. */
  kit: [string, string]
  /** True for the 48 in the 2026 field. Others play friendlies only. */
  inWorldCup: boolean
  /** Nudges to the derived card, so scouting finds real strengths. */
  specialism?: Partial<Record<CardStat, number>>
}

export const OPPONENTS: readonly Opponent[] = [
  // ---- Tier 1: the very best in the world right now ----
  { id: 'spain', name: 'Spain', stars: 2, rating: 92, tier: 1, kit: ['#C60B1E', '#FFC400'], inWorldCup: true, specialism: { PAS: 7, DRI: 3, PHY: -3 } }, // FIFA 1
  { id: 'argentina', name: 'Argentina', stars: 3, rating: 91, tier: 1, kit: ['#75AADB', '#FFFFFF'], inWorldCup: true, specialism: { PAS: 5, SHO: 4 } }, // FIFA 2
  { id: 'france', name: 'France', stars: 2, rating: 91, tier: 1, kit: ['#002395', '#ED2939'], inWorldCup: true, specialism: { PAC: 6, SHO: 3 } }, // FIFA 3
  { id: 'england', name: 'England', stars: 1, rating: 90, tier: 1, kit: ['#FFFFFF', '#001489'], inWorldCup: true, specialism: { PHY: 4, PAC: 3 } }, // FIFA 4
  { id: 'brazil', name: 'Brazil', stars: 5, rating: 89, tier: 1, kit: ['#FEDD00', '#009C3B'], inWorldCup: true, specialism: { DRI: 6, SHO: 4, DEF: -3 } }, // FIFA 5
  { id: 'morocco', name: 'Morocco', stars: 0, rating: 89, tier: 1, kit: ['#C1272D', '#006233'], inWorldCup: true, specialism: { DEF: 6, PHY: 3 } }, // FIFA 6
  { id: 'portugal', name: 'Portugal', stars: 0, rating: 88, tier: 1, kit: ['#DA291C', '#004D3F'], inWorldCup: true, specialism: { SHO: 5, DRI: 3 } }, // FIFA 7
  { id: 'belgium', name: 'Belgium', stars: 0, rating: 87, tier: 1, kit: ['#E30613', '#000000'], inWorldCup: true, specialism: { PAS: 4 } }, // FIFA 8

  // ---- Tier 2: strong sides ----
  { id: 'netherlands', name: 'Netherlands', stars: 0, rating: 87, tier: 2, kit: ['#FF6C00', '#FFFFFF'], inWorldCup: true, specialism: { PAS: 4, DEF: 3 } }, // FIFA 9
  { id: 'mexico', name: 'Mexico', stars: 0, rating: 86, tier: 2, kit: ['#006847', '#FFFFFF'], inWorldCup: true, specialism: { PAC: 4, DRI: 3 } }, // FIFA 10
  { id: 'colombia', name: 'Colombia', stars: 0, rating: 85, tier: 2, kit: ['#FCD116', '#003893'], inWorldCup: true, specialism: { DRI: 5 } }, // FIFA 11
  { id: 'germany', name: 'Germany', stars: 4, rating: 85, tier: 2, kit: ['#FFFFFF', '#000000'], inWorldCup: true, specialism: { DEF: 6, PHY: 4, DRI: -2 } }, // FIFA 12
  { id: 'croatia', name: 'Croatia', stars: 0, rating: 84, tier: 2, kit: ['#FF0000', '#FFFFFF'], inWorldCup: true, specialism: { PAS: 6, PAC: -3 } }, // FIFA 13
  { id: 'switzerland', name: 'Switzerland', stars: 0, rating: 83, tier: 2, kit: ['#D52B1E', '#FFFFFF'], inWorldCup: true, specialism: { DEF: 5 } }, // FIFA 14
  { id: 'italy', name: 'Italy', stars: 4, rating: 83, tier: 2, kit: ['#0064AA', '#FFFFFF'], inWorldCup: false, specialism: { DEF: 8, PHY: 3, PAC: -3 } }, // FIFA 15
  { id: 'usa', name: 'USA', stars: 0, rating: 82, tier: 2, kit: ['#FFFFFF', '#0A3161'], inWorldCup: true, specialism: { PHY: 5, PAC: 4 } }, // FIFA 16
  { id: 'japan', name: 'Japan', stars: 0, rating: 81, tier: 2, kit: ['#000C63', '#FFFFFF'], inWorldCup: true, specialism: { PAC: 5, PAS: 4, PHY: -4 } }, // FIFA 17
  { id: 'senegal', name: 'Senegal', stars: 0, rating: 81, tier: 2, kit: ['#FFFFFF', '#00853F'], inWorldCup: true, specialism: { PHY: 6, PAC: 4 } }, // FIFA 18
  { id: 'norway', name: 'Norway', stars: 0, rating: 80, tier: 2, kit: ['#BA0C2F', '#00205B'], inWorldCup: true, specialism: { SHO: 7, DEF: -3 } }, // FIFA 19
  { id: 'uruguay', name: 'Uruguay', stars: 2, rating: 79, tier: 2, kit: ['#5CBFEB', '#000000'], inWorldCup: true, specialism: { DEF: 5, PHY: 5 } }, // FIFA 20
  { id: 'denmark', name: 'Denmark', stars: 0, rating: 79, tier: 2, kit: ['#C60C30', '#FFFFFF'], inWorldCup: false, specialism: { DEF: 4 } }, // FIFA 21
  { id: 'iran', name: 'IR Iran', stars: 0, rating: 78, tier: 2, kit: ['#FFFFFF', '#239F40'], inWorldCup: true, specialism: { DEF: 5 } }, // FIFA 22

  // ---- Tier 3: solid ----
  { id: 'austria', name: 'Austria', stars: 0, rating: 77, tier: 3, kit: ['#ED2939', '#FFFFFF'], inWorldCup: true, specialism: { DEF: 4 } }, // FIFA 23
  { id: 'egypt', name: 'Egypt', stars: 0, rating: 77, tier: 3, kit: ['#C8102E', '#FFFFFF'], inWorldCup: true, specialism: { SHO: 4 } }, // FIFA 24
  { id: 'ecuador', name: 'Ecuador', stars: 0, rating: 76, tier: 3, kit: ['#FFD100', '#0033A0'], inWorldCup: true, specialism: { PHY: 4 } }, // FIFA 25
  { id: 'nigeria', name: 'Nigeria', stars: 0, rating: 75, tier: 3, kit: ['#008751', '#FFFFFF'], inWorldCup: false, specialism: { PAC: 6, PHY: 4 } }, // FIFA 26
  { id: 'turkiye', name: 'Türkiye', stars: 0, rating: 75, tier: 3, kit: ['#E30A17', '#FFFFFF'], inWorldCup: true, specialism: { SHO: 4 } }, // FIFA 27
  { id: 'australia', name: 'Australia', stars: 0, rating: 74, tier: 3, kit: ['#FFCD00', '#00843D'], inWorldCup: true, specialism: { PHY: 5 } }, // FIFA 28
  { id: 'algeria', name: 'Algeria', stars: 0, rating: 74, tier: 3, kit: ['#FFFFFF', '#007229'], inWorldCup: true, specialism: { DRI: 4 } }, // FIFA 29
  { id: 'canada', name: 'Canada', stars: 0, rating: 73, tier: 3, kit: ['#FF0000', '#FFFFFF'], inWorldCup: true, specialism: { PAC: 5 } }, // FIFA 30
  { id: 'ivorycoast', name: "Côte d'Ivoire", stars: 0, rating: 72, tier: 3, kit: ['#FF8200', '#009E60'], inWorldCup: true, specialism: { PHY: 4 } }, // FIFA 31
  { id: 'korea', name: 'Korea Republic', stars: 0, rating: 72, tier: 3, kit: ['#E4002B', '#FFFFFF'], inWorldCup: true, specialism: { PAC: 6, PHY: -3 } }, // FIFA 32
  { id: 'paraguay', name: 'Paraguay', stars: 0, rating: 71, tier: 3, kit: ['#D52B1E', '#0038A8'], inWorldCup: true, specialism: { DEF: 5 } }, // FIFA 34
  { id: 'poland', name: 'Poland', stars: 0, rating: 70, tier: 3, kit: ['#FFFFFF', '#DC143C'], inWorldCup: false, specialism: { SHO: 6 } }, // FIFA 36
  { id: 'sweden', name: 'Sweden', stars: 0, rating: 70, tier: 3, kit: ['#FECC02', '#005293'], inWorldCup: true, specialism: { PHY: 5 } }, // FIFA 37
  { id: 'wales', name: 'Wales', stars: 0, rating: 69, tier: 3, kit: ['#C8102E', '#FFFFFF'], inWorldCup: false }, // FIFA 38
  { id: 'serbia', name: 'Serbia', stars: 0, rating: 68, tier: 3, kit: ['#C6363C', '#0C4076'], inWorldCup: false, specialism: { PHY: 5 } }, // FIFA 40
  { id: 'congodr', name: 'Congo DR', stars: 0, rating: 68, tier: 3, kit: ['#007FFF', '#F7D618'], inWorldCup: true, specialism: { PHY: 4 } }, // FIFA 41
  { id: 'scotland', name: 'Scotland', stars: 0, rating: 67, tier: 3, kit: ['#0065BD', '#FFFFFF'], inWorldCup: true, specialism: { PHY: 4 } }, // FIFA 42
  { id: 'cameroon', name: 'Cameroon', stars: 0, rating: 66, tier: 3, kit: ['#007A5E', '#CE1126'], inWorldCup: false, specialism: { PHY: 5 } }, // FIFA 43
  { id: 'panama', name: 'Panama', stars: 0, rating: 66, tier: 3, kit: ['#DA121A', '#005293'], inWorldCup: true }, // FIFA 44
  { id: 'czechia', name: 'Czechia', stars: 0, rating: 65, tier: 3, kit: ['#D7141A', '#FFFFFF'], inWorldCup: true, specialism: { DEF: 4 } }, // FIFA 48
  { id: 'chile', name: 'Chile', stars: 0, rating: 64, tier: 3, kit: ['#DA291C', '#0039A6'], inWorldCup: false, specialism: { DRI: 4 } }, // FIFA 49
  { id: 'peru', name: 'Peru', stars: 0, rating: 64, tier: 3, kit: ['#FFFFFF', '#D91023'], inWorldCup: false }, // FIFA 50

  // ---- Tier 4: developing ----
  { id: 'southafrica', name: 'South Africa', stars: 0, rating: 63, tier: 4, kit: ['#007A4D', '#FFB612'], inWorldCup: true }, // FIFA 54
  { id: 'tunisia', name: 'Tunisia', stars: 0, rating: 62, tier: 4, kit: ['#E70013', '#FFFFFF'], inWorldCup: true, specialism: { DEF: 4 } }, // FIFA 57
  { id: 'saudi', name: 'Saudi Arabia', stars: 0, rating: 62, tier: 4, kit: ['#FFFFFF', '#006C35'], inWorldCup: true }, // FIFA 58
  { id: 'qatar', name: 'Qatar', stars: 0, rating: 61, tier: 4, kit: ['#8A1538', '#FFFFFF'], inWorldCup: true }, // FIFA 59
  { id: 'uzbekistan', name: 'Uzbekistan', stars: 0, rating: 60, tier: 4, kit: ['#FFFFFF', '#1EB53A'], inWorldCup: true }, // FIFA 60
  { id: 'bosnia', name: 'Bosnia and Herzegovina', stars: 0, rating: 60, tier: 4, kit: ['#002F6C', '#FECB00'], inWorldCup: true, specialism: { SHO: 4 } }, // FIFA 61
  { id: 'iraq', name: 'Iraq', stars: 0, rating: 59, tier: 4, kit: ['#FFFFFF', '#007A3D'], inWorldCup: true }, // FIFA 63
  { id: 'capeverde', name: 'Cabo Verde', stars: 0, rating: 58, tier: 4, kit: ['#003893', '#FFFFFF'], inWorldCup: true }, // FIFA 64
  { id: 'ghana', name: 'Ghana', stars: 0, rating: 58, tier: 4, kit: ['#FFFFFF', '#CE1126'], inWorldCup: true, specialism: { PAC: 4 } }, // FIFA 65
  { id: 'jordan', name: 'Jordan', stars: 0, rating: 57, tier: 4, kit: ['#FFFFFF', '#007A3D'], inWorldCup: true }, // FIFA 73
  { id: 'curacao', name: 'Curaçao', stars: 0, rating: 56, tier: 4, kit: ['#002B7F', '#F9E814'], inWorldCup: true }, // FIFA 82
  { id: 'newzealand', name: 'New Zealand', stars: 0, rating: 56, tier: 4, kit: ['#FFFFFF', '#000000'], inWorldCup: true }, // FIFA 86
  { id: 'haiti', name: 'Haiti', stars: 0, rating: 55, tier: 4, kit: ['#00209F', '#D21034'], inWorldCup: true }, // FIFA 88
] as const

export const WORLD_CUP_FIELD = OPPONENTS.filter((o) => o.inWorldCup)

export const OPPONENTS_BY_ID: Record<string, Opponent> = Object.fromEntries(
  OPPONENTS.map((o) => [o.id, o]),
)
