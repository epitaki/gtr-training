import { isPairSequence } from '../core/PairSequence'
import { PuyoColor, type Position, type PuyoPair, type GameField } from '../core/types'
import { GamePhase, type GTRTrainingPlan, type PlacementScore } from '../advisor/types'
import type { GTRScore } from '../gtr/GTRPatterns'
import { GTR_SCORING_CONFIG } from '../gtr/GTRScoringConfig'
import type { TailPlan } from '../advisor/TailPlanner'
import type { GameHistoryState } from '../core/GameHistory'
import { GTR_REPORT_VERSION, REPORT_TURN_LIMIT } from './constants'
import type { GTRTurnRecord, GTRReplayState, GTRAdviceSnapshot, GTRIssueSnapshot } from './types'
import { toGTRReplayState } from './snapshot'

const VALID_COLORS = new Set<string>(Object.values(PuyoColor))
const VALID_PHASES = new Set<string>(Object.values(GamePhase))
const VALID_TAIL_SHAPES = new Set(['Y', 'zabuton', 'L'])
const VALID_CHAIN_TAIL_TYPES = new Set(['Y', 'zabuton', 'L', 'stairs'])
const VALID_ROW10_USAGE = new Set(['minimal', 'moderate', 'heavy'])

export const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

export const isIntegerBetween = (value: unknown, min: number, max: number): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
)

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
)

const isStringInSet = (value: unknown, allowed: ReadonlySet<string>): value is string => (
  typeof value === 'string' && allowed.has(value)
)

const isPosition = (value: unknown): value is Position => (
  isRecord(value) && isIntegerBetween(value.x, -1, 6) && isIntegerBetween(value.y, -1, 13)
)

const isGridPosition = (value: unknown): value is Position => (
  isRecord(value) && isIntegerBetween(value.x, 0, 5) && isIntegerBetween(value.y, 0, 12)
)

const isPair = (value: unknown, nullable = false): boolean => {
  if (nullable && value === null) return true
  if (!isRecord(value) || !isRecord(value.main) || !isRecord(value.sub)) return false
  if (!isStringInSet(value.main.color, VALID_COLORS) ||
    !isStringInSet(value.sub.color, VALID_COLORS) ||
    !isGridPosition(value.main) ||
    !isGridPosition(value.sub) ||
    !isIntegerBetween(value.rotation, 0, 3) ||
    typeof value.falling !== 'boolean') return false
  const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }] as const
  const offset = offsets[value.rotation]
  return value.sub.x === value.main.x + offset.x && value.sub.y === value.main.y + offset.y
}

const isActivePair = (value: unknown): value is PuyoPair => (
  isPair(value) && isRecord(value) && value.falling === true
)

const isSpawnPair = (value: unknown): value is PuyoPair => {
  if (!isActivePair(value)) return false
  return value.main.x === 2 && value.main.y === 1 &&
    value.sub.x === 2 && value.sub.y === 0 &&
    value.rotation === 0 && value.falling === true
}

const isField = (value: unknown): value is GameField => {
  if (!isRecord(value) || value.width !== 6 || value.height !== 13 || !Array.isArray(value.grid)) return false
  if (value.grid.length !== value.height) return false
  return value.grid.every(row => Array.isArray(row) && row.length === value.width &&
    row.every(cell => cell === null || isStringInSet(cell, VALID_COLORS)))
}

const isTrainingPlan = (value: unknown): value is GTRTrainingPlan => {
  if (!isRecord(value)) return false
  return ['colorA', 'colorB', 'colorC', 'colorD'].every(key => isStringInSet(value[key], VALID_COLORS))
}

const isTurnRecord = (value: unknown): value is GTRTurnRecord => {
  if (!isRecord(value) || !isRecord(value.placement) || !isPair(value.pair)) return false
  const pair = value.pair as PuyoPair
  return isIntegerBetween(value.turn, 1, 100_000) &&
    isIntegerBetween(value.placement.column, 0, 5) &&
    isIntegerBetween(value.placement.rotation, 0, 3) &&
    isPosition(value.placement.mainPos) &&
    isPosition(value.placement.subPos) &&
    value.placement.column === pair.main.x &&
    value.placement.rotation === pair.rotation &&
    value.placement.mainPos.x === pair.main.x && value.placement.mainPos.y === pair.main.y &&
    value.placement.subPos.x === pair.sub.x && value.placement.subPos.y === pair.sub.y &&
    isIntegerBetween(value.chainCount, 0, 100) &&
    isIntegerBetween(value.clearedPuyos, 0, 1_000)
}

const isGameHistoryState = (value: unknown): value is GameHistoryState => {
  if (!isRecord(value)) return false
  const field = value.field
  const currentPair = value.currentPair
  if (!isField(field) ||
    !isActivePair(currentPair) ||
    !isSpawnPair(value.nextPair) ||
    !isSpawnPair(value.nextNextPair) ||
    ![value.score, value.gtrCount, value.gtrScore].every(isFiniteNumber) ||
    !isIntegerBetween(value.pairRandomState, 0, 0xffffffff)) return false

  return ![currentPair.main, currentPair.sub]
    .some(position => field.grid[position.y][position.x] !== null)
}

export function assertValidGTRReplayState(value: unknown): asserts value is GTRReplayState {
  if (!isRecord(value) || value.kind !== 'gtr-replay' || value.version !== GTR_REPORT_VERSION) {
    throw new Error('対応していない再現コードです')
  }
  if (value.practiceSequence !== undefined && !isPairSequence(value.practiceSequence)) {
    throw new Error('再現コードの練習ツモが不正です')
  }
  if (!isField(value.field)) throw new Error('再現コードの盤面が不正です')
  const field = value.field
  if (![value.score, value.gtrCount, value.gtrScore].every(isFiniteNumber) || typeof value.gameOver !== 'boolean') {
    throw new Error('再現コードのゲーム状態が不正です')
  }
  if (!isActivePair(value.currentPair) || !isSpawnPair(value.nextPair) || !isSpawnPair(value.nextNextPair)) {
    throw new Error('再現コードのツモ情報が不正です')
  }
  if (!value.gameOver) {
    const pair = value.currentPair as unknown as PuyoPair
    const occupiedByField = [pair.main, pair.sub].some(position => field.grid[position.y][position.x] !== null)
    if (occupiedByField) throw new Error('再現コードの現在ツモが盤面と重なっています')
  }
  if (!isRecord(value.openingPairs) || !isSpawnPair(value.openingPairs.pair1) || !isSpawnPair(value.openingPairs.pair2)) {
    throw new Error('再現コードの初手情報が不正です')
  }
  if (!isTrainingPlan(value.trainingPlan)) throw new Error('再現コードの練習計画が不正です')
  if (!isRecord(value.sourceSettings) || typeof value.sourceSettings.gravityEnabled !== 'boolean' ||
    typeof value.sourceSettings.advisorEnabled !== 'boolean' ||
    typeof value.sourceSettings.paused !== 'boolean' ||
    typeof value.sourceSettings.showingResult !== 'boolean') {
    throw new Error('再現コードの設定が不正です')
  }
  if ((value.sourceSettings.showingResult && !value.sourceSettings.paused) ||
    (value.gameOver && (value.sourceSettings.paused || value.sourceSettings.showingResult))) {
    throw new Error('再現コードの画面状態が不正です')
  }
  if (!isIntegerBetween(value.pairRandomState, 0, 0xffffffff)) {
    throw new Error('再現コードの乱数状態が不正です')
  }
  if (typeof value.sourceCapturedAt !== 'string' || value.sourceCapturedAt.length > 100) {
    throw new Error('再現コードの取得日時が不正です')
  }
  if (!Array.isArray(value.recentTurns) || value.recentTurns.length > REPORT_TURN_LIMIT ||
    !value.recentTurns.every(isTurnRecord) ||
    value.recentTurns.some((turn, index, turns) => index > 0 && turn.turn !== turns[index - 1].turn + 1)) {
    throw new Error('再現コードの手順履歴が不正です')
  }
  if (value.previousState !== undefined && value.previousState !== null && !isGameHistoryState(value.previousState)) {
    throw new Error('再現コードの巻き戻し状態が不正です')
  }
  if (value.sourceAnalysis !== undefined) {
    if (!isRecord(value.sourceAnalysis) ||
      typeof value.sourceAnalysis.appVersion !== 'string' || value.sourceAnalysis.appVersion.length > 100 ||
      !isGTRScore(value.sourceAnalysis.gtrEvaluation) ||
      !Array.isArray(value.sourceAnalysis.tailPlans) || value.sourceAnalysis.tailPlans.length > 64 ||
      !value.sourceAnalysis.tailPlans.every(isTailPlan) ||
      !(value.sourceAnalysis.advice === null || isAdviceSnapshot(value.sourceAnalysis.advice))) {
      throw new Error('再現コードの報告時評価が不正です')
    }
  }
}

const isPlacementScore = (value: unknown): value is PlacementScore => {
  if (!isRecord(value) || !isRecord(value.placement) || !isRecord(value.landing)) return false
  return isIntegerBetween(value.placement.column, 0, 5) &&
    isIntegerBetween(value.placement.rotation, 0, 3) &&
    typeof value.landing.valid === 'boolean' &&
    isPosition(value.landing.mainPos) &&
    isPosition(value.landing.subPos) &&
    isIntegerBetween(value.immediateChainCount, 0, 100) &&
    isIntegerBetween(value.clearedPuyos, 0, 1_000) &&
    typeof value.isIntendedMainFire === 'boolean' &&
    typeof value.hasCollateralClear === 'boolean' &&
    isIntegerBetween(value.intendedMainChainCount, 0, 100) &&
    isIntegerBetween(value.intendedMainClearedPuyos, 0, 1_000) &&
    isFiniteNumber(value.totalScore) &&
    isStringInSet(value.phase, VALID_PHASES) &&
    (value.tailShape === undefined || isStringInSet(value.tailShape, VALID_TAIL_SHAPES)) &&
    (value.tailColor === undefined || isStringInSet(value.tailColor, VALID_COLORS))
}

const isGTRScore = (value: unknown): value is GTRScore => (
  isRecord(value) &&
  (value.scoringVersion === undefined || value.scoringVersion === GTR_SCORING_CONFIG.VERSION) &&
  (value.minimalFoundationComplete === undefined || typeof value.minimalFoundationComplete === 'boolean') &&
  typeof value.isGTR === 'boolean' &&
  isFiniteNumber(value.quality) &&
  isFiniteNumber(value.chainTailScore) &&
  isFiniteNumber(value.totalScore) &&
  isIntegerBetween(value.chainCount, 0, 100) &&
  isIntegerBetween(value.leftoverPuyos, 0, 1_000) &&
  (value.message === undefined || (typeof value.message === 'string' && value.message.length <= 2_000)) &&
  typeof value.hasBasicPattern === 'boolean' &&
  (value.chainTailType === undefined || isStringInSet(value.chainTailType, VALID_CHAIN_TAIL_TYPES)) &&
  isStringInSet(value.row10Usage, VALID_ROW10_USAGE) &&
  (value.rightEdgeRaised === undefined || typeof value.rightEdgeRaised === 'boolean') &&
  typeof value.leftoverConnected === 'boolean'
)

const isTailPlan = (value: unknown): value is TailPlan => (
  isRecord(value) &&
  isStringInSet(value.shape, VALID_TAIL_SHAPES) &&
  isStringInSet(value.color, VALID_COLORS) &&
  Array.isArray(value.chainCells) && value.chainCells.length <= 64 && value.chainCells.every(isPosition) &&
  Array.isArray(value.supportCells) && value.supportCells.length <= 64 && value.supportCells.every(isPosition) &&
  isIntegerBetween(value.matchedChainCells, 0, 64) &&
  isIntegerBetween(value.filledSupportCells, 0, 64) &&
  isIntegerBetween(value.matchedCells, 0, 128) &&
  isIntegerBetween(value.totalCells, 0, 128) &&
  isIntegerBetween(value.continuationCount, 0, 128) &&
  typeof value.templateFilled === 'boolean'
)

const isAdviceSnapshot = (value: unknown): value is GTRAdviceSnapshot => (
  isRecord(value) &&
  isStringInSet(value.phase, VALID_PHASES) &&
  typeof value.phaseMessage === 'string' && value.phaseMessage.length <= 1_000 &&
  (value.bestPlacement === null || isPlacementScore(value.bestPlacement)) &&
  Array.isArray(value.candidates) && value.candidates.length <= 64 && value.candidates.every(isPlacementScore)
)

export function assertValidGTRIssueSnapshot(value: unknown): asserts value is GTRIssueSnapshot {
  if (!isRecord(value) || value.kind !== 'gtr-issue-snapshot' || value.version !== GTR_REPORT_VERSION ||
    value.mode !== 'guided' || typeof value.appVersion !== 'string' || value.appVersion.length > 100 ||
    typeof value.page !== 'string' || value.page.length > 2_000 ||
    !isIntegerBetween(value.turnNumber, 1, 100_001)) {
    throw new Error('診断スナップショットの基本情報が不正です')
  }
  try {
    assertValidGTRReplayState(toGTRReplayState(value as unknown as GTRIssueSnapshot))
  } catch {
    throw new Error('診断スナップショットの再現情報が不正です')
  }
  if (!isGTRScore(value.gtrEvaluation)) throw new Error('診断スナップショットのGTR評価が不正です')
  if (!Array.isArray(value.tailPlans) || value.tailPlans.length > 64 || !value.tailPlans.every(isTailPlan)) {
    throw new Error('診断スナップショットの連鎖尾情報が不正です')
  }
  if (!(value.advice === null || isAdviceSnapshot(value.advice))) {
    throw new Error('診断スナップショットの推薦情報が不正です')
  }
}
