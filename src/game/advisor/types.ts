import type { PuyoColor } from '../core/types'
import type { LandingResult } from '../core/ChainSimulator'
import type { TailShape } from './TailPlanner'

export enum GamePhase {
  FOLD_BUILDING = 'fold_building',
  CHAIN_TAIL = 'chain_tail',
  COMPLETION = 'completion',
}

export interface PlacementScore {
  placement: { column: number; rotation: number }
  landing: LandingResult
  immediateChainCount: number
  clearedPuyos: number
  isIntendedMainFire: boolean
  hasCollateralClear: boolean
  intendedMainChainCount: number
  intendedMainClearedPuyos: number
  totalScore: number
  phase: GamePhase
  tailShape?: TailShape
  tailColor?: PuyoColor
}

export interface PlacementAdvice {
  bestPlacement: PlacementScore | null
  allPlacements: PlacementScore[]
  phase: GamePhase
  phaseMessage: string
}

export interface FoldPlan {
  colorA: PuyoColor
  colorB: PuyoColor
  missingColors: PuyoColor[]
}

export interface YJointPlan {
  colorC: PuyoColor
  colorD: PuyoColor
  missingColors: PuyoColor[]
  matchedCells: number
  totalCells: number
}

export interface ChainPotential {
  chainCount: number
  clearedPuyos: number
  triggerColumn: number | null
  triggerColor: PuyoColor | null
  trackedPuyosCleared: number
}

export interface GTRTrainingPlan {
  colorA: PuyoColor
  colorB: PuyoColor
  colorC: PuyoColor
  colorD: PuyoColor
}
