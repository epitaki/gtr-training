import type { Position } from './types'
import type { PuyoGrid, ChainResolution } from './ChainSimulator'
import type { PuyoColor } from './types'

export type PuyoIdGrid = (string | null)[][]

export interface ChainSnapshot {
  grid: PuyoGrid
  ids: PuyoIdGrid
}

export interface GravityMove {
  id: string
  from: Position
  to: Position
}

export interface GravityStage {
  kind: 'gravity'
  moves: GravityMove[]
  after: ChainSnapshot
}

export interface ClearStage {
  kind: 'clear'
  chainIndex: number
  cleared: { id: string; position: Position; color: PuyoColor }[]
  after: ChainSnapshot
}

export type ChainStage = GravityStage | ClearStage

export interface ChainTrace {
  initial: ChainSnapshot
  stages: ChainStage[]
  result: ChainResolution
}
