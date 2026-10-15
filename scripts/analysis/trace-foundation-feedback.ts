import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeGTRReplayState } from '../../src/game/feedback/replay'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { encodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { summarizeFoundationGames } from '../../src/benchmark/FoundationQuality'
import type { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { inspectBoardSurface } from '../../src/game/advisor/BoardSurface'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [attachment, before, after, output] = process.argv.slice(2)
if (!attachment || !before || !after || !output) throw new Error('Expected feedback.txt before.js after.js new-output.json')
const text = readFileSync(attachment, 'utf8')
const code = text.match(/#gtr-replay=([A-Za-z0-9_-]+)/)?.[1]
if (!code) throw new Error('Replay missing')
const replay = decodeGTRReplayState(code)
if (!replay.trainingPlan || !replay.recentTurns.length || replay.recentTurns.some((turn, i) => turn.turn !== i + 1)) {
  throw new Error('A complete recorded prefix and training plan are required')
}
const empty = (): PuyoGrid => Array.from({ length: 13 }, () => Array(6).fill(null))
let recorded = empty()
for (const turn of replay.recentTurns) {
  const outcome = simulateTurn(recorded, turn.pair, turn.placement)
  if (!outcome.valid || outcome.chainCount !== turn.chainCount || outcome.clearedPuyos !== turn.clearedPuyos) throw new Error('Invalid recorded move')
  recorded = outcome.stableGrid
}
if (JSON.stringify(recorded) !== JSON.stringify(replay.field.grid)) throw new Error('Recorded prefix does not reproduce the reported board')
const pairs = [...replay.recentTurns.map(turn => turn.pair), replay.currentPair, replay.nextPair, replay.nextNextPair]
if (pairs.some(pair => !pair)) throw new Error('Missing visible pairs')
async function run(path: string) {
  const frozen = readFileSync(path, 'utf8')
  if (!frozen.includes('class PlacementAdvisor {')) throw new Error('Unsupported frozen bundle')
  const module = await import(`data:text/javascript;base64,${Buffer.from(`${frozen}\nexport { PlacementAdvisor };`).toString('base64')}`)
  const advisor = module.PlacementAdvisor as typeof PlacementAdvisor
  let grid = empty(), actualFire = false, maxIntendedChain = 0
  const turns = []
  for (let i = 0; i < pairs.length - 2; i++) {
    // Strictly the three visible pairs, never the rest of the saved sequence.
    const advice = advisor.getAdvice({ grid, width: 6, height: 13 }, pairs[i]!, pairs[i + 1]!, pairs[i + 2]!, replay.trainingPlan)
    const best = advice.bestPlacement
    if (!best) break
    const outcome = simulateTurn(grid, pairs[i]!, best.placement)
    if (!outcome.valid) throw new Error('Invalid recommended placement')
    turns.push({ turn: i + 1, pair: [pairs[i]!.main.color, pairs[i]!.sub.color], placement: best.placement,
      gridBefore: encodeBenchmarkGrid(grid), gridAfter: encodeBenchmarkGrid(outcome.stableGrid),
      heightsBefore: inspectBoardSurface(grid).heights, chainCount: outcome.chainCount,
      intendedMainChainCount: best.intendedMainChainCount, collateralClear: best.hasCollateralClear })
    grid = outcome.stableGrid
    if (outcome.chainCount > 0) {
      actualFire = best.isIntendedMainFire
      maxIntendedChain = actualFire ? best.intendedMainChainCount : 0
      break
    }
  }
  const finalGrid = encodeBenchmarkGrid(grid)
  return { path, hash: createHash('sha256').update(frozen).digest('hex'), turns,
    finalGrid, actualFire, maxIntendedChain, leftovers: actualFire ? grid.flat().filter(Boolean).length : null,
    foundation: summarizeFoundationGames([{ gameIndex: 0, turns, finalGrid, actualFire, maxIntendedChain }]) }
}
const result = { capturedAt: replay.sourceCapturedAt, recordedBoardValidated: true,
  condition: 'Same recorded pairs from the empty board; at most CURRENT/NEXT/NEXT2 per decision, stop at first clear or end of recorded prefix.',
  evaluatorHashes: captureAdvisorSourceHashes(), before: await run(before), after: await run(after) }
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
for (const side of ['before', 'after'] as const) {
  const { turns, ...summary } = result[side]
  console.log(JSON.stringify({ side, moves: turns.length, ...summary }))
}
