import { describe, expect, it } from 'vitest'
import { inspectRemainingPuyos, summarizeSparePuyos } from './SparePuyoAnalysis'
import { runBenchmarkGame, type BenchmarkGameResult } from './AdvisorBenchmark'

describe('leftover birth provenance', () => {
  it('tracks each initial pair cell and does not turn a non-fire into zero leftovers', () => {
    const game = runBenchmarkGame('random', 0, 42, 'AABB', 1)
    const cells = inspectRemainingPuyos(game)
    expect(cells).toHaveLength(2)
    expect(new Set(cells.map(cell => cell.half))).toEqual(new Set(['main', 'sub']))
    expect(cells.every(cell => cell.turn === 1 && cell.stage === 'throughFoldCompletion')).toBe(true)
    expect(summarizeSparePuyos([game])).toMatchObject({ firedGames: 0, nonFiredGames: 1, average: null, median: null, p90: null })
    const broken: BenchmarkGameResult = structuredClone(game)
    broken.turns[0].gridAfter = '.'.repeat(78)
    expect(() => inspectRemainingPuyos(broken)).toThrow('Invalid saved replay')
  })

  it('replays a physical fire and partitions actual residuals exactly', () => {
    const game = runBenchmarkGame('random', 2, 2294077934, 'ABAB', 20)
    expect(game.actualFire).toBe(true)
    const snapshot = JSON.stringify(game)
    const cells = inspectRemainingPuyos(game)
    expect(cells).toHaveLength(game.finalGrid.replace(/\./g, '').length)
    const summary = summarizeSparePuyos([game])
    expect(Object.values(summary.stages).reduce((sum, value) => sum + value, 0)).toBe(summary.total)
    expect(summary.columns.reduce((sum, value) => sum + value, 0)).toBe(summary.total)
    expect(JSON.stringify(game)).toBe(snapshot)
  })
})
