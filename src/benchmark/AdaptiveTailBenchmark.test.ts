import { describe, expect, it } from 'vitest'
import baseline from '../../benchmarks/baseline/advisor-v3.json'
import { PlacementAdvisor } from '../game/advisor/PlacementAdvisor'
import { decodeBenchmarkGrid, replayBenchmarkGame } from './AdvisorBenchmark'
import { parseBenchmarkReportJson } from './BenchmarkReportValidation'

describe('adaptive tail benchmark definition', () => {
  it.each([[3, 10], [4, 9]])('replays adaptive-tail completion in historical game %i at turn %i', (index, completionTurn) => {
    const report = parseBenchmarkReportJson(JSON.stringify(baseline))
    const random = report.modes.find(mode => mode.mode === 'random')!
    expect(random.metrics.guidedTargetCompletionRate).toBeCloseTo(2 / 6)
    const game = random.games[index]
    expect(game.guidedTargetCompleted).toBe(true)
    expect(game.completionTurn).toBe(completionTurn)
    const grid = decodeBenchmarkGrid(game.turns[completionTurn - 1].gridAfter)
    expect(PlacementAdvisor.isAdaptiveTailComplete(grid, game.trainingPlan)).toBe(true)
    expect(PlacementAdvisor.isGuidedTargetComplete(grid, game.trainingPlan)).toBe(false)
    // Stored physical placements still reproduce the historical board even
    // when a newer advisor intentionally chooses different moves/scores.
    const replay = replayBenchmarkGame(game)
    expect(replay.finalGrid).toEqual(decodeBenchmarkGrid(game.finalGrid))
    const changedMoves = new Set(replay.mismatches
      .filter(mismatch => mismatch.message === 'placement changed').map(mismatch => mismatch.turn))
    const fireFields = new Set(['intendedMainFire changed', 'collateralClear changed',
      'intendedMainChainCount changed', 'intendedMainClearedPuyos changed'])
    expect(replay.mismatches.every(mismatch =>
      mismatch.message === 'totalScore changed' || mismatch.message === 'placement changed' ||
      (changedMoves.has(mismatch.turn) && fireFields.has(mismatch.message)),
    )).toBe(true)
    // A newly preferred actual fire may replace the historical building move.
    // Its label may differ, but the stored move's fire classification must not.
    for (const turn of new Set(replay.mismatches.filter(m => fireFields.has(m.message)).map(m => m.turn))) {
      const record = game.turns[turn! - 1]
      const pair = (colors: typeof record.currentPair) => ({
        main: { color: colors.main, x: 2, y: 1 }, sub: { color: colors.sub, x: 2, y: 0 }, rotation: 0, falling: true,
      })
      const advice = PlacementAdvisor.getAdvice(
        { grid: decodeBenchmarkGrid(record.gridBefore), width: 6, height: 13 },
        pair(record.currentPair), pair(record.nextPair), pair(record.nextNextPair), game.trainingPlan,
      )
      const stored = advice.allPlacements.find(candidate => candidate.placement.column === record.placement.column &&
        candidate.placement.rotation === record.placement.rotation)!
      expect(stored).toMatchObject({ isIntendedMainFire: record.intendedMainFire, hasCollateralClear: record.collateralClear,
        intendedMainChainCount: record.intendedMainChainCount, intendedMainClearedPuyos: record.intendedMainClearedPuyos })
    }
  })

  it('does not accept fixed-Y v2 rates as adaptive-tail v3 rates', () => {
    expect(() => parseBenchmarkReportJson(JSON.stringify({ ...baseline, version: 2 })))
      .toThrow('expected 3, got 2')
  })
})
