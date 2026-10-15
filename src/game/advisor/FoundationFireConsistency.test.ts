import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { PuyoColor, type PuyoPair } from '../core/types'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'

const colors = [PuyoColor.RED, PuyoColor.BLUE, PuyoColor.GREEN, PuyoColor.YELLOW]
const fixtures = [
  { grid: '......................................G.G...G.Y..RY.Y..GY.Y.RBYGGGRRBYYYBBGGRR',
    fold: 'RB', queue: 'YR RY RB BG YR', leftovers: 7 },
  { grid: '...................................................G.G..BG.GBRBY.GBBRBBYRRBGGG',
    fold: 'BR', queue: 'BG YY BG RR RG', leftovers: 2 },
]

describe('foundation fire survives visible-pair replanning', () => {
  for (const [index, fixture] of fixtures.entries()) it.each([0, 1, 2, 3])(`case ${index}, colors +%i`, shift => {
    const color = (c: string) => colors[('RBGY'.indexOf(c) + shift) % 4]
    let grid: PuyoGrid = fixture.grid.match(/.{6}/g)!.map(row => [...row].map(c => c === '.' ? null : color(c)))
    const queue: PuyoPair[] = fixture.queue.split(' ').map(p => ({ main: { x: 2, y: 1, color: color(p[0]) },
      sub: { x: 2, y: 0, color: color(p[1]) }, rotation: 0, falling: true }))
    const training = { colorA: color(fixture.fold[0]), colorB: color(fixture.fold[1]),
      colorC: color(fixture.fold[0]), colorD: color(fixture.fold[1]) }
    for (let turn = 0; turn < 3; turn++) {
      const input = structuredClone({ grid, queue, training })
      // Reveal exactly CURRENT/NEXT/NEXT2, even as a new pair becomes visible.
      const best = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, queue[turn], queue[turn + 1], queue[turn + 2], training).bestPlacement!
      expect({ grid, queue, training }).toEqual(input)
      const outcome = simulateTurn(grid, queue[turn], best.placement)
      expect(outcome.valid).toBe(true)
      expect(outcome.chainCount).toBe(turn === 2 ? 5 : 0)
      if (turn === 2) {
        expect(GTRDetector.detectGTR(grid).chainCount).toBe(5)
        expect(best).toMatchObject({ isIntendedMainFire: true, hasCollateralClear: false })
        expect(outcome.stableGrid.flat().filter(Boolean)).toHaveLength(fixture.leftovers)
      }
      grid = outcome.stableGrid
    }
  })
})
