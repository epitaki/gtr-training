import { describe, expect, it } from 'vitest'
import { runBenchmarkGame, type BenchmarkOpeningKind } from './AdvisorBenchmark'

describe('keep completion when reducing spares', () => {
  it.each([
    // Wider construction-use reranking lost game 159 and delayed game 105.
    // The aggregate-rate acceptance permits a changed route: move 16 with
    // 6 leftovers instead of move 15 with 7; never skip an available fire.
    { id: 159, seed: 2817078501, opening: 'ABAC', fireBy: 16, leftovers: 7 },
    { id: 105, seed: 3954864145, opening: 'ABAC', fireBy: 16, leftovers: 9 },
    // The adopted surface-preserving fire comparison reduces 14 to 13 here.
    { id: 98, seed: 1513237319, opening: 'ABAB', fireBy: 18, leftovers: 13 },
  ])('preserves completion and firing time in saved game $id', sample => {
    const game = runBenchmarkGame('random', sample.id, sample.seed, sample.opening as BenchmarkOpeningKind, 20)
    expect(game.guidedTargetCompleted).toBe(true)
    expect(game.actualFire).toBe(true)
    expect(game.maxIntendedChain).toBeGreaterThanOrEqual(5)
    expect(game.fireTurn).toBeLessThanOrEqual(sample.fireBy)
    expect(game.leftoverPuyos).toBeLessThanOrEqual(sample.leftovers)
    expect(game.gameOver).toBe(false)
    expect(game.unintendedClearCount).toBe(0)
  }, 15000)
})
