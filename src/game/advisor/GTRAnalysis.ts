import type { PuyoColor, PuyoPair, Position } from '../core/types'
import { applyGravity, findClearPositions, isSpawnBlocked, resolveChains, simulateTurn,
  type PuyoGrid, type Placement } from '../core/ChainSimulator'
import { GTRDetector, type GTRScore } from '../gtr/GTRPatterns'
import { createGTREvaluationGrid, isInGTREvaluationRange } from '../gtr/EvaluationRange'
import { analyzeCandidateFire, createMainFireBaseline } from './MainFireAnalysis'
import { connectedOffset, followsTrigger, inspectConnectedExtension, traceFoundation } from './ConnectedExtension'
import { inspectHeadScaffold } from './HeadScaffold'

export type PuyoUse = 'core' | 'foundation-link' | 'foundation-spare' | 'outside-connected' | 'outside-unconfirmed'
export interface AnalyzedPuyo extends Position { color: PuyoColor; use: PuyoUse }
export interface GTRAnalysis {
  score: GTRScore
  stage: 'unfinished' | 'core' | 'building' | 'foundation' | 'unstable'
  title: string
  fire: { status: 'current' | 'future' | 'unconfirmed' | 'blocked' | 'unstable'; chainCount: number; placement: Placement | null }
  fireText: string
  cells: AnalyzedPuyo[]
  useText: string
  scoreExplanation: string
}
const key = ({ x, y }: Position) => `${x}:${y}`
const coreCells = new Set(['0:10', '1:10', '0:11', '1:11', '2:11', '0:12', '1:12'])
const uses: PuyoUse[] = ['core', 'foundation-link', 'foundation-spare', 'outside-connected', 'outside-unconfirmed']

/** Display analysis only: no scoring/ranking changes and no consumption of supplied pairs. */
export function analyzeGTR(grid: PuyoGrid, current: PuyoPair | null, score = GTRDetector.detectGTR(grid)): GTRAnalysis {
  const valid = grid.length === 13 && grid.every(row => row.length === 6)
  const unstable = !valid || applyGravity(grid).moved || findClearPositions(grid).length > 0
  const blocked = !valid || isSpawnBlocked(grid)
  const stage: GTRAnalysis['stage'] = unstable ? 'unstable' : !score.hasBasicPattern ? 'unfinished'
    : score.chainCount >= 5 ? 'foundation' : score.chainCount >= 3 ? 'building' : 'core'
  const title = { unfinished: '標準コア未完成', core: '標準コア完成', building: '土台を伸ばそう',
    foundation: '土台5連鎖完成', unstable: '消去・落下前の盤面' }[stage]
  const foundation = valid && !unstable && score.hasBasicPattern ? traceFoundation(grid, 3) : null
  const connection = foundation && !blocked ? inspectConnectedExtension(grid, foundation) : null
  const scaffold = foundation && !blocked ? inspectHeadScaffold(grid, foundation) : null
  let hypothetical: PuyoGrid | null = null
  let potentialChains = 0
  if (scaffold && (!connection || scaffold.chainCount > connection.chainCount)) {
    hypothetical = grid.map(row => [...row])
    for (const cell of [...scaffold.missing, scaffold.trigger]) hypothetical[cell.position.y][cell.position.x] = cell.color
    potentialChains = scaffold.chainCount
  } else if (connection) {
    hypothetical = grid.map(row => [...row])
    const top = grid.findIndex(row => row[connection.triggerColumn] !== null)
    const y = (top < 0 ? grid.length : top) - 1
    for (let i = 0; i < connection.needed; i++) hypothetical[y - i][connection.triggerColumn] = connection.triggerColor
    potentialChains = connection.chainCount
  }
  const baseline = foundation ? createMainFireBaseline(grid) : null
  let currentFire: { chainCount: number; placement: Placement } | null = null
  if (current && foundation && !blocked) {
    for (let rotation = 0; rotation < 4; rotation++) for (let column = 0; column < 6; column++) {
      const placement = { column, rotation }, outcome = simulateTurn(grid, current, placement)
      if (!outcome.valid || !outcome.landing || outcome.chainCount < 3) continue
      const main = analyzeCandidateFire(current, outcome, baseline)
      // Also covers the supported horizontal/L heads, whose key can move.
      const connected = connectedOffset(outcome.clearSteps, foundation) !== null
        && [outcome.landing.mainPos, outcome.landing.subPos].some(position =>
          followsTrigger(outcome.placedGrid, outcome.clearSteps, new Set([key(position)])))
      if ((main.isIntendedMainFire && !main.hasCollateralClear || connected)
          && (!currentFire || currentFire.chainCount < outcome.chainCount)) currentFire = { chainCount: outcome.chainCount, placement }
    }
  }
  const fire: GTRAnalysis['fire'] = { status: unstable ? 'unstable' : blocked ? 'blocked'
    : currentFire ? 'current' : potentialChains >= 3 ? 'future' : 'unconfirmed',
    chainCount: currentFire?.chainCount ?? potentialChains, placement: currentFire?.placement ?? null }
  const fireText = fire.status === 'current' ? `今の組で本線${fire.chainCount}連鎖を発火可能（まだ未発火）`
    : fire.status === 'future' ? `将来の色・配置待ち（仮置きでは本線${fire.chainCount}連鎖。今の組では未確認）`
    : fire.status === 'blocked' ? '出現位置が塞がり、今の組を操作できません'
    : fire.status === 'unstable' ? '消去・落下前なので発火可能性は未確認'
    : '本線の発火可能性は未確認。別の色や配置が必要です'

  const masked = createGTREvaluationGrid(grid)
  if (score.hasBasicPattern && valid) masked[9][0] = masked[10][0]
  const foundationUsed = new Set(resolveChains(masked).clearSteps.flatMap(step => step.clearedPuyos
    .flatMap(p => p.origin ? [key(p.origin)] : [])))
  const connectedUsed = new Set(hypothetical ? resolveChains(hypothetical).clearSteps.flatMap(step => step.clearedPuyos
    .flatMap(p => p.origin ? [key(p.origin)] : [])) : [])
  const cells: AnalyzedPuyo[] = grid.flatMap((row, y) => row.flatMap((color, x) => color === null ? [] : [{ x, y, color,
    use: score.hasBasicPattern && coreCells.has(`${x}:${y}`) ? 'core' as const
      : isInGTREvaluationRange(x, y) ? foundationUsed.has(`${x}:${y}`) ? 'foundation-link' as const : 'foundation-spare' as const
      : connectedUsed.has(`${x}:${y}`) ? 'outside-connected' as const : 'outside-unconfirmed' as const }]))
  const counts = Object.fromEntries(uses.map(use => [use, cells.filter(cell => cell.use === use).length]))
  const useText = `実在ぷよ：コア${counts.core}／土台参加${counts['foundation-link']}／土台余り${counts['foundation-spare']}\n`
    + `範囲外：接続見込み${counts['outside-connected']}／接続未確認${counts['outside-unconfirmed']}（この仮想本線での分類）`
  const scoreExplanation = score.totalScore === 100 ? '100点は最小19個の土台。範囲外の接続や実発火とは別です'
    : !score.hasBasicPattern ? '標準コアが未完成のため土台0点'
    : `${counts['outside-connected'] > 0 || scaffold ? '頭や範囲外の接続見込みは土台へ加点しません。' : ''}`
      + `土台の仮想${score.chainCount}連鎖・余り${score.leftoverPuyos}個。100点には安定した19個の5連鎖全消しが必要です`
  return { score, stage, title, fire, fireText, cells, useText, scoreExplanation }
}
