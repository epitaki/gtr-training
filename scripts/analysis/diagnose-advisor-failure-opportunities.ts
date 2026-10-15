import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid, type BenchmarkPair, type BenchmarkTurn } from '../../src/benchmark/AdvisorBenchmark'
import { PlacementAdvisor, type PlacementScore } from '../../src/game/advisor/PlacementAdvisor'
import { GTRDetector } from '../../src/game/gtr/GTRPatterns'
import { isSpawnBlocked, simulateTurn } from '../../src/game/core/ChainSimulator'
import type { PuyoPair } from '../../src/game/core/types'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected input-report.json output-analysis.json')
const bytes = readFileSync(input)
const report = parseBenchmarkReportJson(bytes.toString('utf8'), input)
if (report.config.modes.length !== 1 || report.config.modes[0] !== 'random') throw new Error('Requires random mode')
const games = report.modes.flatMap(mode => mode.games)
const pair = (p: BenchmarkPair): PuyoPair => ({
  main: { color: p.main, x: 2, y: 1 }, sub: { color: p.sub, x: 2, y: 0 }, rotation: 0, falling: true,
})
const compact = (c: PlacementScore) => ({
  placement: c.placement, score: c.totalScore, intendedChain: c.intendedMainChainCount,
  mainFire: c.isIntendedMainFire, collateral: c.hasCollateralClear, physicalChain: c.immediateChainCount,
})
const fireOpportunities = []
const shortFires = []
const foldMisses = []
for (const game of games.filter(g => g.maxIntendedChain < 5)) {
  const advice = (t: BenchmarkTurn) => {
    const grid = decodeBenchmarkGrid(t.gridBefore)
    const a = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair(t.currentPair), pair(t.nextPair), pair(t.nextNextPair), game.trainingPlan)
    if (!a.bestPlacement || JSON.stringify(a.bestPlacement.placement) !== JSON.stringify(t.placement) ||
        Math.abs(a.bestPlacement.totalScore - t.totalScore) > 1e-6) throw new Error(`Replay mismatch ${game.gameIndex}:${t.turn}`)
    return a
  }
  for (const t of game.turns) {
    const grid = decodeBenchmarkGrid(t.gridBefore)
    const gtr = GTRDetector.detectGTR(grid)
    if (gtr.chainCount >= 5 && [t.currentPair.main, t.currentPair.sub].includes(grid[10][0]!)) {
      const a = advice(t)
      const safeFires = a.allPlacements.filter(c => c.isIntendedMainFire && c.intendedMainChainCount >= 5 &&
        !c.hasCollateralClear && !isSpawnBlocked(simulateTurn(grid, pair(t.currentPair), c.placement).stableGrid))
      fireOpportunities.push({ gameIndex: game.gameIndex, turn: t.turn, grid: t.gridBefore,
        current: t.currentPair, next: t.nextPair, next2: t.nextNextPair,
        tailShape: PlacementAdvisor.getCompletedTailShape(grid, game.trainingPlan),
        potentialChain: gtr.chainCount, chosen: compact(a.bestPlacement!), cleanFiveFires: safeFires.map(compact),
        allMainFires: a.allPlacements.filter(c => c.isIntendedMainFire).map(compact),
      })
    }
    if (t.intendedMainFire && t.intendedMainChainCount < 5) {
      const a = advice(t)
      const nonClear = a.allPlacements.filter(c => c.immediateChainCount === 0 &&
        !isSpawnBlocked(simulateTurn(grid, pair(t.currentPair), c.placement).stableGrid))
      shortFires.push({ gameIndex: game.gameIndex, turn: t.turn, chosen: compact(a.bestPlacement!),
        safeNonClearAlternatives: nonClear.length, topAlternative: nonClear[0] ? compact(nonClear[0]) : null,
      })
    }
    if (!game.coreCompleted) {
      const before = PlacementAdvisor.getFoldPlan(grid, game.trainingPlan)
      if (!before || !before.missingColors.length) continue
      const selectedAfter = PlacementAdvisor.getFoldPlan(decodeBenchmarkGrid(t.gridAfter), game.trainingPlan)
      const selectedMissing = selectedAfter?.missingColors.length ?? Infinity
      const advances = []
      for (let rotation = 0; rotation < 4; rotation++) for (let column = 0; column < 6; column++) {
        const outcome = simulateTurn(grid, pair(t.currentPair), { column, rotation })
        if (!outcome.valid || outcome.chainCount || isSpawnBlocked(outcome.stableGrid)) continue
        const fold = PlacementAdvisor.getFoldPlan(outcome.stableGrid, game.trainingPlan)
        if (fold && fold.missingColors.length < before.missingColors.length && fold.missingColors.length < selectedMissing) {
          advances.push({ placement: { column, rotation }, missing: fold.missingColors.length })
        }
      }
      if (advances.length) foldMisses.push({ gameIndex: game.gameIndex, turn: t.turn,
        grid: t.gridBefore, current: t.currentPair, next: t.nextPair, next2: t.nextNextPair,
        beforeMissing: before.missingColors, chosen: t.placement,
        chosenMissing: selectedAfter?.missingColors ?? null, alternatives: advances,
      })
    }
  }
}
const summary = {
  inspectedGames: games.filter(g => g.maxIntendedChain < 5).length,
  fiveAndFireColorTurns: fireOpportunities.length,
  gamesWithMissedCleanFive: [...new Set(fireOpportunities.filter(t => t.cleanFiveFires.length > 0).map(t => t.gameIndex))],
  shapeUnrecognizedWithMissedCleanFive: [...new Set(fireOpportunities.filter(t => t.tailShape === null && t.cleanFiveFires.length > 0).map(t => t.gameIndex))],
  readyButNoCleanFire: fireOpportunities.filter(t => t.cleanFiveFires.length === 0).map(t => ({ gameIndex: t.gameIndex, turn: t.turn })),
  shortFireGames: shortFires.length,
  shortFireWithSafeNonClear: shortFires.filter(t => t.safeNonClearAlternatives > 0).length,
  incompleteCoreWithMissedProgress: [...new Set(foldMisses.map(t => t.gameIndex))],
  missedCoreProgressTurns: foldMisses.length,
}
writeFileSync(output, JSON.stringify({ input, inputSha256: createHash('sha256').update(bytes).digest('hex'),
  note: 'Legal alternatives are local counterfactuals, not proof of a better long-term continuation. Only available current/next/next2 were used for replay.',
  summary, fireOpportunities, shortFires, foldMisses }, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
