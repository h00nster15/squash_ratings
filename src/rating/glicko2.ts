/**
 * Glicko-2 rating system (Glickman, 2012).
 * http://www.glicko.net/glicko/glicko2.pdf
 *
 * Each player carries three numbers:
 *   rating     – skill estimate (1500 = average)
 *   rd         – rating deviation: how uncertain the estimate is
 *   volatility – how erratic the player's results have been
 *
 * Ratings are updated once per "rating period". A player who plays no
 * matches in a period still has their RD increased by their volatility,
 * so long-absent players move quickly when they return.
 */

export interface Glicko2Rating {
  rating: number
  rd: number
  volatility: number
}

/** One opponent faced during a rating period. `score` is in [0, 1]. */
export interface GameResult {
  opponent: Glicko2Rating
  score: number
}

export const DEFAULT_RATING = 1500
export const DEFAULT_RD = 350
export const DEFAULT_VOLATILITY = 0.06

/**
 * System constant τ. Constrains how much volatility can change per period.
 * Glickman recommends 0.3–1.2; smaller values suit small pools with
 * occasional upsets, which describes a club ladder well.
 */
export const TAU = 0.5

const EPSILON = 0.000001
/** Scale factor between the Glicko (1500-centred) and Glicko-2 (0-centred) scales. */
const SCALE = 173.7178

export function newRating(): Glicko2Rating {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, volatility: DEFAULT_VOLATILITY }
}

/** Step 2: convert to the Glicko-2 internal scale. */
function toInternal(r: Glicko2Rating) {
  return { mu: (r.rating - DEFAULT_RATING) / SCALE, phi: r.rd / SCALE }
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)))
}

/**
 * Update a single player's rating from the games they played this period.
 * With no games, only the RD is increased (step 6 with no results).
 */
export function updateRating(player: Glicko2Rating, results: GameResult[]): Glicko2Rating {
  const { mu, phi } = toInternal(player)
  const sigma = player.volatility

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma)
    return { rating: player.rating, rd: phiStar * SCALE, volatility: sigma }
  }

  // Step 3: estimated variance of the player's rating based on game outcomes.
  // Step 4: estimated improvement in rating (delta).
  let vInv = 0
  let deltaSum = 0
  for (const { opponent, score } of results) {
    const { mu: muJ, phi: phiJ } = toInternal(opponent)
    const gj = g(phiJ)
    const e = E(mu, muJ, phiJ)
    vInv += gj * gj * e * (1 - e)
    deltaSum += gj * (score - e)
  }
  const v = 1 / vInv
  const delta = v * deltaSum

  // Step 5: determine the new volatility via the Illinois algorithm.
  const a = Math.log(sigma * sigma)
  const f = (x: number): number => {
    const ex = Math.exp(x)
    const num = ex * (delta * delta - phi * phi - v - ex)
    const den = 2 * Math.pow(phi * phi + v + ex, 2)
    return num / den - (x - a) / (TAU * TAU)
  }

  let A = a
  let B: number
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * TAU) < 0) k++
    B = a - k * TAU
  }

  let fA = f(A)
  let fB = f(B)
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA = fA / 2
    }
    B = C
    fB = fC
  }
  const sigmaNew = Math.exp(A / 2)

  // Step 6: update the rating deviation to the new pre-rating period value.
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew)

  // Step 7: update the rating and RD to the new values.
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const muNew = mu + phiNew * phiNew * deltaSum

  // Step 8: convert back to the Glicko scale.
  return {
    rating: muNew * SCALE + DEFAULT_RATING,
    rd: phiNew * SCALE,
    volatility: sigmaNew,
  }
}

/** Probability that `a` beats `b`, accounting for both players' uncertainty. */
export function winProbability(a: Glicko2Rating, b: Glicko2Rating): number {
  const { mu: muA, phi: phiA } = toInternal(a)
  const { mu: muB, phi: phiB } = toInternal(b)
  const gCombined = g(Math.sqrt(phiA * phiA + phiB * phiB))
  return 1 / (1 + Math.exp(-gCombined * (muA - muB)))
}
