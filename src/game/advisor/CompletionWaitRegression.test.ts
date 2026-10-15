import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, isSpawnBlocked, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]

describe('completion wait after a connected tail', () => {
  it.each([0, 1, 2, 3])('preserves a usable completion order and fires the stalled game 89 (colors +%i)', shift => {
    const color = (symbol: string) => palette[('RBYG'.indexOf(symbol) + shift) % 4]
    // Known development record, just after the Y tail completed at turn 8.
    // Old advice blocked the useful continuation and never fired within 20.
    // Only the three visible pairs of each decision enter the advisor.
    const encoded = '.......................................................B....RGY...RRGYYGGGYBBG'
    let grid: PuyoGrid = encoded.match(/.{6}/g)!.map(row => [...row].map(c => c === '.' ? null : color(c)))
    const pairs: PuyoPair[] = 'RR BY BB YY RR YR BR GR BY YR RR BB RG BG'.split(' ').map(text => ({
      main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 }, rotation: 0, falling: true,
    }))
    const plan = { colorA: color('R'), colorB: color('G'), colorC: color('R'), colorD: color('G') }
    expect(PlacementAdvisor.getCompletedTailShape(grid, plan)).toBe('Y')
    let fired = false
    for (let index = 0; index < 8; index++) {
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 },
        pairs[index], pairs[index + 1], pairs[index + 2], plan)
      const result = simulateTurn(grid, pairs[index], advice.bestPlacement!.placement)
      expect(result.valid).toBe(true)
      expect(isSpawnBlocked(result.stableGrid)).toBe(false)
      if (result.chainCount > 0) {
        expect(result.chainCount).toBe(5)
        expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true,
          intendedMainChainCount: 5, hasCollateralClear: false })
        fired = true
        break
      }
      expect(PlacementAdvisor.isAdaptiveTailComplete(result.stableGrid, plan)).toBe(true)
      grid = result.stableGrid
    }
    expect(fired).toBe(true) // earlier success is allowed, never later than the old 8 pairs
  })
})
