import { describe, expect, it } from 'vitest'
import { measureContinuousGame } from './measure-continuous-guide'
import { deriveBenchmarkGameSeed, runBenchmarkGame } from '../../src/benchmark/AdvisorBenchmark'
import { GamePhase } from '../../src/game/advisor/types'

describe('continuous-guide measurement', () => {
  it('keeps the old seeded supplier and opening order while recording only real turns', () => {
    const legacy = runBenchmarkGame('random', 0, deriveBenchmarkGameSeed(20260904, 0), 'AAAB', 2)
    const current = measureContinuousGame(0, 2)
    expect(current.turns).toHaveLength(2)
    expect(current.turns.map(t => t.visiblePairs)).toEqual(legacy.turns.map(t => [t.currentPair, t.nextPair, t.nextNextPair]))
    expect(current.foundationTurn).toBeNull()
    expect(current.perfect).toBe(false)
    expect(current.clears).toBe(0)
    expect(current.stop).toBe('turn_limit')
  })

  it('records an absent recommendation as a stop, not as success or a fire with zero leftovers', () => {
    const result = measureContinuousGame(0, 20, () => ({ phase: GamePhase.FOLD_BUILDING,
      phaseMessage: '', allPlacements: [], bestPlacement: null }))
    expect(result.stop).toBe('no_advice')
    expect(result.foundationTurn).toBeNull()
    expect(result.perfect).toBe(false)
    expect(result.postCompletionMoves).toBe(0)
    expect(result.conditionalExtension).toBeNull()
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0].gridAfter).toBe(result.turns[0].gridBefore)
  })
})
