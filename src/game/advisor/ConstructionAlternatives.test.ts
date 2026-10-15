import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

// Development regressions from head-extension-20260922-after.json, SHA-256
// 407f8d33b63f8a49710a543ed8311e40728b39d38c4ae7bbd0d915ade381c29c.
// These are simulation inputs, not labels claiming human/optimal placements.
const cases = [
  { id: 98, queue: 'BR BR RR GY RY GB RY BR YY YY BY YG RR BR YR GY BG RB BG BR RR RB' },
  { id: 117, queue: 'GY GR GY RR GB BB RR BR RB RY RG RG BY RB BB RG YR BG RB YR BB RG' },
  { id: 133, queue: 'YY GG RG BB YB RY BR BG GG YR YR BG YR YG YR YG YG GG BR YR YB BB' },
  { id: 202, queue: 'GG YR YY YG YY GR BY RY GB YB GY YY GY YB GB YG RB YY YB BB BB RR' },
]
// Game 117 was a counterexample in ADVISOR-CONSTRUCTION-20260922.md. The
// lower-insertion alternative now recovers its move-20 fire, so keep it here
// as a positive regression as well as preserving the historical failed trace.
const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]

describe('construction alternatives without changing the teaching goal', () => {
  for (const scenario of cases) {
    it.each([0, 1, 2, 3])(`finishes a connected tail and fires five within 20 moves: game ${scenario.id}, colors +%i`, shift => {
      const color = (symbol: string) => palette[('RBYG'.indexOf(symbol) + shift) % 4]
      const pairs: PuyoPair[] = scenario.queue.split(' ').map(text => ({
        main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 },
        rotation: 0, falling: true,
      }))
      const plan = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
      let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
      let completed = false
      let fired = false
      for (let turn = 0; turn < 20; turn++) {
        const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 },
          pairs[turn], pairs[turn + 1], pairs[turn + 2], plan)
        expect(advice.bestPlacement).not.toBeNull()
        const result = simulateTurn(grid, pairs[turn], advice.bestPlacement!.placement)
        expect(result.valid).toBe(true)
        if (result.chainCount > 0) {
          expect(completed).toBe(true)
          expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
          expect(advice.bestPlacement!.intendedMainChainCount).toBeGreaterThanOrEqual(5)
          fired = true
          break
        }
        grid = result.stableGrid
        completed ||= PlacementAdvisor.isAdaptiveTailComplete(grid, plan)
      }
      expect(fired).toBe(true)
    }, 15000)
  }
})
