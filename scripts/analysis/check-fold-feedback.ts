import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { decodeGTRReplayState } from '../../src/game/feedback/replay'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { ContinuousAdvisor } from '../../src/game/advisor/ContinuousAdvisor'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { encodeBenchmarkGrid } from '../../src/benchmark/AdvisorBenchmark'
import { captureAdvisorSourceHashes } from '../shared/source-fingerprint'

const [attachment, frozenBefore, output] = process.argv.slice(2)
if (!attachment || !frozenBefore || !output || existsSync(output)) {
  throw new Error('Expected feedback.txt frozen-continuous-before.js new-output.json')
}
const raw = readFileSync(attachment, 'utf8')
const code = raw.match(/#gtr-replay=([A-Za-z0-9_-]+)/)?.[1]
if (!code) throw new Error('Missing replay')
const replay = decodeGTRReplayState(code)
if (!replay.trainingPlan || !replay.recentTurns.length ||
    replay.recentTurns.some((turn, i) => turn.turn !== i + 1)) throw new Error('Complete recorded prefix required')
const before = (await import(pathToFileURL(frozenBefore).href)).ContinuousAdvisor as typeof ContinuousAdvisor
const pairs = [...replay.recentTurns.map(turn => turn.pair), replay.currentPair, replay.nextPair, replay.nextNextPair]
if (pairs.some(pair => !pair)) throw new Error('Missing supply')
const empty = (): PuyoGrid => Array.from({ length: 13 }, () => Array(6).fill(null))
const field = (grid: PuyoGrid) => ({ grid, width: 6, height: 13 })
const summarize = (advice: ReturnType<typeof ContinuousAdvisor.getAdvice>) => ({
  placement: advice.bestPlacement?.placement ?? null, phaseMessage: advice.phaseMessage,
  candidates: advice.allPlacements.map(c => c.placement),
})
let grid = empty()
const recordedPrefixes = []
for (let i = 0; i <= replay.recentTurns.length; i++) {
  const turn = replay.recentTurns[i]
  const oldAdvice = before.getAdvice(field(grid), pairs[i]!, pairs[i + 1]!, pairs[i + 2]!, replay.trainingPlan)
  const newAdvice = ContinuousAdvisor.getAdvice(field(grid), pairs[i]!, pairs[i + 1]!, pairs[i + 2]!, replay.trainingPlan)
  const outcome = turn ? simulateTurn(grid, turn.pair, turn.placement) : null
  if (outcome && (!outcome.valid || outcome.chainCount !== turn.chainCount || outcome.clearedPuyos !== turn.clearedPuyos)) {
    throw new Error(`Recorded physics mismatch at ${i + 1}`)
  }
  recordedPrefixes.push({ turn: i + 1, grid: encodeBenchmarkGrid(grid), recorded: turn?.placement ?? null,
    foldViable: PlacementAdvisor.getFoldPlan(grid) !== null, before: summarize(oldAdvice), after: summarize(newAdvice) })
  if (outcome) grid = outcome.stableGrid
}
if (JSON.stringify(grid) !== JSON.stringify(replay.field.grid)) throw new Error('Reported board mismatch')
function run(advisor: typeof ContinuousAdvisor) {
  let grid = empty()
  const turns = []
  for (let i = 0; i < pairs.length - 2; i++) {
    const advice = advisor.getAdvice(field(grid), pairs[i]!, pairs[i + 1]!, pairs[i + 2]!, replay.trainingPlan)
    const placement = advice.bestPlacement?.placement
    if (!placement) { turns.push({ turn: i + 1, ...summarize(advice) }); break }
    const outcome = simulateTurn(grid, pairs[i]!, placement)
    if (!outcome.valid || outcome.chainCount) throw new Error('Invalid or clearing guide')
    grid = outcome.stableGrid
    turns.push({ turn: i + 1, ...summarize(advice), gridAfter: encodeBenchmarkGrid(grid) })
  }
  return turns
}
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const result = {
  condition: 'Recorded prefix physics verified; same visible CURRENT/NEXT/NEXT2 only. Recorded placements do not prove what the old UI showed.',
  capturedAt: replay.sourceCapturedAt, attachmentSha256: sha(raw), beforeSha256: sha(readFileSync(frozenBefore)),
  scriptSha256: sha(readFileSync(import.meta.filename)), hashes: captureAdvisorSourceHashes(),
  recordedPrefixes, guidedFromEmpty: { before: run(before), after: run(ContinuousAdvisor) },
}
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ recordedBoardVerified: true,
  changedPrefixTurns: recordedPrefixes.filter(t => JSON.stringify(t.before.placement) !== JSON.stringify(t.after.placement)).map(t => t.turn),
  guidedFromEmptyPlacementsEqual: JSON.stringify(result.guidedFromEmpty.before.map(t => t.placement)) ===
    JSON.stringify(result.guidedFromEmpty.after.map(t => t.placement)), last: recordedPrefixes[recordedPrefixes.length - 1]?.after }))
