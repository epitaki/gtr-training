import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

// Full 22-pair queues from known seed20260922. Unlike a trace
// ending at an early fire, these also cover 20 moves after a changed choice.
// IDs are provenance only: no IDs/seeds/future generator enter the advisor.
const cases = [
  { id: 6, queue: 'BG GG GB BY RB GG BY BR YR BB RR RB RY RB BY BY YB YB RY RG BY GB', tail: true, minimumChain: 5 },
  { id: 77, queue: 'BB BB RG GY RB RB YB RY YR YY BR BY YG RG RB YY GY YB YY GB BB RB', tail: true, minimumChain: 0 },
  { id: 97, queue: 'GG BB BG BG BY BB GB GB GB YY RB BR YB GR YB YB GG BB BR GY GG YR', tail: true, minimumChain: 5 },
  { id: 134, queue: 'BR BR BY YY RR RR YR YB GG BG YB GB GR RY GG RR RB GR YB GR BG GY', tail: false, minimumChain: 3 },
  // v2 lost this five-chain by changing the green double before the fold
  // existed. Pair-use preference must not displace opening/fold construction.
  { id: 371, queue: 'YY YY GG GG BB BG BG YR RB YY RY BB BY RB GR BY GB RG RB YR RB GG', tail: true, minimumChain: 5 },
]
const palette = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW, PuyoColor.GREEN]

describe('known pair-use gains and counterexamples', () => {
  it.each([0, 1, 2, 3])('uses both green-equivalent puyos in the actual five-chain (game 104, colors +%i)', shift => {
    const color = (symbol: string) => palette[('RBYG'.indexOf(symbol) + shift) % 4]
    const pairs: PuyoPair[] = 'RB RB BR BY YR GY GG GY YB GY GG YR BG YB BY BG GG'.split(' ').map(text => ({
      main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 }, rotation: 0, falling: true,
    }))
    const plan = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
    let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    let tracked: { x: number; y: number }[] = []
    for (let turn = 0; turn < 15; turn++) {
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[turn], pairs[turn + 1], pairs[turn + 2], plan)
      const result = simulateTurn(grid, pairs[turn], advice.bestPlacement!.placement)
      expect(result.valid).toBe(true)
      expect(result.chainCount).toBe(turn === 14 ? 5 : 0)
      if (turn === 6) tracked = [result.landing!.mainPos, result.landing!.subPos]
      if (turn === 14) {
        expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
        const consumed = new Set(result.clearSteps.flatMap(step => step.clearedPuyos
          .filter(p => p.origin).map(p => `${p.origin!.x},${p.origin!.y}`)))
        expect(tracked).toHaveLength(2)
        for (const p of tracked) expect(consumed.has(`${p.x},${p.y}`)).toBe(true)
        // Aggregate-success approval allows per-game trade-offs. This route
        // leaves 6 instead of 4, but both originally wasted green cells must
        // still participate in the same real clean five-chain above.
        expect(result.stableGrid.flat().filter(Boolean).length).toBeLessThanOrEqual(6)
      }
      grid = result.stableGrid
    }
  }, 15000)

  for (const scenario of cases) {
    it.each([0, 1, 2, 3])(`preserves the baseline goal for game ${scenario.id}, colors +%i`, shift => {
      const color = (symbol: string) => palette[('RBYG'.indexOf(symbol) + shift) % 4]
      const pairs: PuyoPair[] = scenario.queue.split(' ').map(text => ({
        main: { color: color(text[0]), x: 2, y: 1 }, sub: { color: color(text[1]), x: 2, y: 0 },
        rotation: 0, falling: true,
      }))
      const plan = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
      let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
      let completed = false
      let mainChain = 0
      for (let turn = 0; turn < 20; turn++) {
        const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 },
          pairs[turn], pairs[turn + 1], pairs[turn + 2], plan)
        expect(advice.bestPlacement).not.toBeNull()
        const result = simulateTurn(grid, pairs[turn], advice.bestPlacement!.placement)
        expect(result.valid).toBe(true)
        if (advice.bestPlacement!.isIntendedMainFire) {
          mainChain = advice.bestPlacement!.intendedMainChainCount
          expect(advice.bestPlacement!.hasCollateralClear).toBe(false)
          break
        }
        grid = result.stableGrid
        completed ||= PlacementAdvisor.isAdaptiveTailComplete(grid, plan)
      }
      if (scenario.tail) expect(completed).toBe(true)
      expect(mainChain).toBeGreaterThanOrEqual(scenario.minimumChain)
    }, 15000)
  }
})
