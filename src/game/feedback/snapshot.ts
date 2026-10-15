import packageInfo from '../../../package.json'
import { cloneGameHistoryState } from '../core/GameHistory'
import type { PuyoPair } from '../core/types'
import { GTR_REPORT_VERSION, REPORT_TURN_LIMIT } from './constants'
import type { GTROpeningPairs, GTRTurnRecord, GTRIssueSnapshotInput, GTRIssueSnapshot, GTRReplayState } from './types'

export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const cloneReportPair = (pair: PuyoPair | null): PuyoPair | null => pair ? {
  main: {
    color: pair.main.color,
    x: pair.main.x,
    y: pair.main.y,
  },
  sub: {
    color: pair.sub.color,
    x: pair.sub.x,
    y: pair.sub.y,
  },
  rotation: pair.rotation,
  falling: pair.falling,
} : null

const cloneOpeningPairs = (pairs: GTROpeningPairs): GTROpeningPairs => ({
  pair1: cloneReportPair(pairs.pair1)!,
  pair2: cloneReportPair(pairs.pair2)!,
})

export const cloneTurnRecords = (records: GTRTurnRecord[]): GTRTurnRecord[] => records.map(record => ({
  ...record,
  pair: cloneReportPair(record.pair)!,
  placement: {
    ...record.placement,
    mainPos: { ...record.placement.mainPos },
    subPos: { ...record.placement.subPos },
  },
}))

export const createGTRIssueSnapshot = (input: GTRIssueSnapshotInput): GTRIssueSnapshot => ({
  ...(input.practiceSequence !== undefined ? { practiceSequence: cloneJson(input.practiceSequence) } : {}),
  kind: 'gtr-issue-snapshot',
  version: GTR_REPORT_VERSION,
  appVersion: packageInfo.version,
  capturedAt: new Date().toISOString(),
  mode: 'guided',
  page: input.page,
  turnNumber: input.turnNumber,
  field: cloneJson(input.gameState.field),
  currentPair: cloneReportPair(input.gameState.currentPair),
  nextPair: cloneReportPair(input.gameState.nextPair),
  nextNextPair: cloneReportPair(input.gameState.nextNextPair),
  openingPairs: cloneOpeningPairs(input.openingPairs),
  score: input.gameState.score,
  gtrCount: input.gameState.gtrCount,
  gtrScore: input.gameState.gtrScore,
  gameOver: input.gameState.gameOver,
  pairRandomState: input.pairRandomState,
  trainingPlan: { ...input.trainingPlan },
  settings: { ...input.settings },
  gtrEvaluation: cloneJson(input.gtrEvaluation),
  tailPlans: cloneJson(input.tailPlans),
  advice: input.advice ? {
    phase: input.advice.phase,
    phaseMessage: input.advice.phaseMessage,
    bestPlacement: cloneJson(input.advice.bestPlacement),
    candidates: cloneJson(input.advice.allPlacements),
  } : null,
  recentTurns: cloneTurnRecords(input.recentTurns.slice(-REPORT_TURN_LIMIT)),
  previousState: input.previousState ? cloneGameHistoryState(input.previousState) : null,
})

export const toGTRReplayState = (snapshot: GTRIssueSnapshot): GTRReplayState => ({
  ...(snapshot.practiceSequence !== undefined ? { practiceSequence: cloneJson(snapshot.practiceSequence) } : {}),
  kind: 'gtr-replay',
  version: GTR_REPORT_VERSION,
  sourceCapturedAt: snapshot.capturedAt,
  field: cloneJson(snapshot.field),
  currentPair: cloneReportPair(snapshot.currentPair),
  nextPair: cloneReportPair(snapshot.nextPair),
  nextNextPair: cloneReportPair(snapshot.nextNextPair),
  openingPairs: cloneOpeningPairs(snapshot.openingPairs),
  score: snapshot.score,
  gtrCount: snapshot.gtrCount,
  gtrScore: snapshot.gtrScore,
  gameOver: snapshot.gameOver,
  pairRandomState: snapshot.pairRandomState,
  trainingPlan: { ...snapshot.trainingPlan },
  sourceSettings: { ...snapshot.settings },
  recentTurns: cloneTurnRecords(snapshot.recentTurns),
  previousState: snapshot.previousState ? cloneGameHistoryState(snapshot.previousState) : null,
  sourceAnalysis: {
    appVersion: snapshot.appVersion,
    gtrEvaluation: cloneJson(snapshot.gtrEvaluation),
    tailPlans: cloneJson(snapshot.tailPlans),
    advice: cloneJson(snapshot.advice),
  },
})
