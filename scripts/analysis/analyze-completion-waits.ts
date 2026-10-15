// Describe saved failures. This never supplies hidden pairs to the advisor.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { FiveChainPlanner } from '../../src/game/advisor/FiveChainPlanner'
import { createMainFireBaseline } from '../../src/game/advisor/MainFireAnalysis'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'
import { simulateTurn } from '../../src/game/core/ChainSimulator'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Expected report.json output.json')
const bytes = readFileSync(input)
const report = parseBenchmarkReportJson(bytes.toString('utf8'), input)
if (report.modes.length !== 1 || report.modes[0].mode !== 'random') throw new Error('Expected random only')
const rows = report.modes.flatMap(mode => mode.games.filter(game =>
  game.guidedTargetCompleted && !game.actualFire).map(game => {
  const snapshots = game.turns.filter(turn => turn.chainCount === 0 && turn.turn >= game.completionTurn!).map(turn => {
    const grid = decodeBenchmarkGrid(turn.gridAfter)
    const plan = FiveChainPlanner.inspectCompletion(grid, game.trainingPlan)
    const conditionalChain = createMainFireBaseline(grid)?.resolution.chainCount ?? 0
    const tags: string[] = []
    if (!plan) tags.push('outside_supported_skeletons')
    if (conditionalChain >= 5) tags.push('conditional_five_ready')
    if (plan && plan.missingCount > 0) {
      if (Math.max(...Object.values(plan.missingByColor)) >= 3 &&
          Math.max(...Object.values(plan.missingByColor)) > plan.missingCount / 2) tags.push('concentrated_color')
      if (plan.blockedColors.length) tags.push('blocked_color')
      if (plan.orderOverhead > 0.001) tags.push('order_wait')
    }
    return { turn: turn.turn, conditionalChain, tags, plan }
  })
  // The first actual pair after tail completion: compare legal companion-aware
  // landings, not single-puyo drops. Only the saved CURRENT is used here.
  const firstAfterTail = game.turns.find(turn => turn.turn === game.completionTurn! + 1)
  const visiblePairOptions = []
  if (firstAfterTail) {
    const grid = decodeBenchmarkGrid(firstAfterTail.gridBefore)
    const pair = { main: { color: firstAfterTail.currentPair.main, x: 2, y: 1 },
      sub: { color: firstAfterTail.currentPair.sub, x: 2, y: 0 }, rotation: 0, falling: true }
    for (let column = 0; column < 6; column++) for (let rotation = 0; rotation < 4; rotation++) {
      const placement = { column, rotation }
      const outcome = simulateTurn(grid, pair, placement)
      if (!outcome.valid || outcome.chainCount !== 0) continue
      const completion = FiveChainPlanner.inspectCompletion(outcome.stableGrid, game.trainingPlan)
      if (!completion) continue
      visiblePairOptions.push({ placement, selected: column === firstAfterTail.placement.column && rotation === firstAfterTail.placement.rotation,
        targetId: completion.targetId, missingCount: completion.missingCount,
        orderedDraws: completion.orderedDraws, orderOverhead: completion.orderOverhead })
    }
  }
  return { gameIndex: game.gameIndex, tailTurn: game.completionTurn,
    firstVisiblePair: firstAfterTail?.currentPair ?? null, visiblePairOptions,
    firstConditionalFive: snapshots.find(row => row.conditionalChain >= 5)?.turn ?? null, snapshots }
}))
const tags = ['outside_supported_skeletons', 'conditional_five_ready', 'concentrated_color', 'blocked_color', 'order_wait']
const summary = {
  games: rows.length,
  tagsAtTailCompletion: Object.fromEntries(tags.map(tag => [tag, rows.filter(row => row.snapshots[0]?.tags.includes(tag)).length])),
  tagsEverAfterTailCompletion: Object.fromEntries(tags.map(tag => [tag, rows.filter(row => row.snapshots.some(snapshot => snapshot.tags.includes(tag))).length])),
  conditionalFiveAt19Or20: rows.filter(row => row.firstConditionalFive !== null && row.firstConditionalFive >= 19).length,
}
const result = { input, inputSha256: createHash('sha256').update(bytes).digest('hex'),
  sourceSha256: captureAdvisorSourceHashes(), config: report.config,
  notes: [
    'Tags overlap; these are observations, not proven causal categories.',
    'Targets are the current planner best physically valid skeleton, not every possible human construction.',
    'Concentration means at least 3 missing of one color, comprising more than half the missing cells.',
    'Expected draws assume independent uniform single colors and ideal column-prefix placement; they are NOT expected legal pair turns.',
    'Missing queues cover skeleton cells only, not the final firing color or additional head-extension cells.',
    'Conditional five uses hypothetical firing additions, never evidence of an available actual-pair fire.',
  ], summary, rows }
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
