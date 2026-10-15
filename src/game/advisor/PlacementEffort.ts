import type { LandingResult } from '../core/ChainSimulator'

/** Soft preference, not a ban: useful split drops must remain possible.
 * Capped below one template-cell reward (100); this is not a timing model.
 * Vertical pairs differ by one row but do NOT perform a split drop.
 */
export function splitDropCost(landing: LandingResult | null): number {
  if (!landing?.valid || landing.mainPos.x === landing.subPos.x) return 0
  return Math.min(3, Math.abs(landing.mainPos.y - landing.subPos.y)) * 8
}
