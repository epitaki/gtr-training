import { describe, expect, it } from 'vitest'
import { PlacementAdvisor } from './PlacementAdvisor'
import { simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { decodeHumanReplay, normalizeHumanPairs, sameHumanPlacement } from '../../benchmark/HumanReplay'
import { PuyoColor } from '../core/types'

describe('human-style free-form construction', () => {
  it.each([0, 1, 2, 3])('does not split a near-equal second pair unnecessarily (color rotation %i)', shift => {
    // Public ALF record 619, development set. An alternative first placement
    // is already on the board; the advisor must respond to that actual board.
    const moves = decodeHumanReplay('_mkmcl87kbsdwgol89k7SloememiGhA7S')
    const colors = Object.values(PuyoColor)
    const pairs = normalizeHumanPairs(moves).map(pair => ({ ...pair,
      main: { ...pair.main, color: colors[(colors.indexOf(pair.main.color) + shift) % 4] },
      sub: { ...pair.sub, color: colors[(colors.indexOf(pair.sub.color) + shift) % 4] },
    }))
    const empty: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    const grid = simulateTurn(empty, pairs[0], moves[0].placement!).stableGrid
    const training = PlacementAdvisor.createTrainingPlan(pairs[0], pairs[1])
    const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pairs[1], pairs[2], pairs[3], training)
    const selected = advice.bestPlacement!
    expect(selected.landing.mainPos.x).toBe(selected.landing.subPos.x)
    expect(sameHumanPlacement(grid, pairs[1], selected.placement, moves[1].placement!)).toBe(true)
    expect(selected.immediateChainCount).toBe(0)
    const needlessSplit = advice.allPlacements.find(row => row.placement.column === 1 && row.placement.rotation === 3)!
    expect(selected.totalScore).toBeGreaterThan(needlessSplit.totalScore)
  })
})
