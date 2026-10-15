import type { PairColors } from '../core/PairSequence'
import type { GTRScore } from '../gtr/GTRPatterns'
import type { GamePhase, GTRTrainingPlan, PlacementAdvice, PlacementScore } from '../advisor/types'
import type { TailPlan } from '../advisor/TailPlanner'
import type { GameHistoryState } from '../core/GameHistory'
import type { GameField, GameState, Position, PuyoPair } from '../core/types'
import type { GTR_REPORT_VERSION } from './constants'

export interface GTROpeningPairs {
  pair1: PuyoPair
  pair2: PuyoPair
}

export interface GTRTurnRecord {
  turn: number
  pair: PuyoPair
  placement: {
    column: number
    rotation: number
    mainPos: Position
    subPos: Position
  }
  chainCount: number
  clearedPuyos: number
}

export interface GTRReportSettings {
  gravityEnabled: boolean
  advisorEnabled: boolean
  paused: boolean
  showingResult: boolean
}

export interface GTRReportUnavailableDetail {
  reason: 'chain-resolving'
}

export interface GTRAdviceSnapshot {
  phase: GamePhase
  phaseMessage: string
  bestPlacement: PlacementScore | null
  candidates: PlacementScore[]
}

export interface GTRIssueSnapshot {
  kind: 'gtr-issue-snapshot'
  version: typeof GTR_REPORT_VERSION
  appVersion: string
  capturedAt: string
  mode: 'guided'
  page: string
  turnNumber: number
  field: GameField
  currentPair: PuyoPair | null
  nextPair: PuyoPair | null
  nextNextPair: PuyoPair | null
  openingPairs: GTROpeningPairs
  score: number
  gtrCount: number
  gtrScore: number
  gameOver: boolean
  pairRandomState: number
  trainingPlan: GTRTrainingPlan
  settings: GTRReportSettings
  gtrEvaluation: GTRScore
  tailPlans: TailPlan[]
  advice: GTRAdviceSnapshot | null
  recentTurns: GTRTurnRecord[]
  practiceSequence?: readonly PairColors[]
  previousState?: GameHistoryState | null
}

export interface GTRReplayState {
  kind: 'gtr-replay'
  version: typeof GTR_REPORT_VERSION
  sourceCapturedAt: string
  field: GameField
  currentPair: PuyoPair | null
  nextPair: PuyoPair | null
  nextNextPair: PuyoPair | null
  openingPairs: GTROpeningPairs
  score: number
  gtrCount: number
  gtrScore: number
  gameOver: boolean
  pairRandomState: number
  trainingPlan: GTRTrainingPlan
  sourceSettings: GTRReportSettings
  recentTurns: GTRTurnRecord[]
  practiceSequence?: readonly PairColors[]
  previousState?: GameHistoryState | null
  sourceAnalysis?: {
    appVersion: string
    gtrEvaluation: GTRScore
    tailPlans: TailPlan[]
    advice: GTRAdviceSnapshot | null
  }
}

export type GTRReplayReadResult =
  | { status: 'absent' }
  | { status: 'valid'; replay: GTRReplayState }
  | { status: 'invalid'; message: string }

export interface GTRIssueFeedback {
  comment: string
  expectedColumn: number | null
  expectedRotation: number | null
}

export interface StoredGTRIssueReport {
  id: string
  savedAt: string
  snapshot: GTRIssueSnapshot
  feedback: GTRIssueFeedback
}

export interface GTRIssueSnapshotInput {
  page: string
  turnNumber: number
  gameState: GameState
  openingPairs: GTROpeningPairs
  pairRandomState: number
  trainingPlan: GTRTrainingPlan
  settings: GTRReportSettings
  gtrEvaluation: GTRScore
  tailPlans: TailPlan[]
  advice: PlacementAdvice | null
  recentTurns: GTRTurnRecord[]
  practiceSequence?: readonly PairColors[]
  previousState?: GameHistoryState | null
}

declare global {
  interface Window {
    __GTR_ISSUE_SNAPSHOT__?: GTRIssueSnapshot
  }
}
