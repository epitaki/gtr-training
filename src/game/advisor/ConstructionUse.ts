import type { Position, PuyoColor } from '../core/types'
import type { ClearStep, PuyoGrid } from '../core/ChainSimulator'
import type { HeadExtension } from '../gtr/HeadExtension'
import { recoveredSkeletonExtraOrigins } from './SkeletonRecovery'
import type { ViablePairTarget } from './PairPlacementUse'

export interface ConstructionCellUse {
  position: Position
  color: PuyoColor
  role: 'target' | 'main-recovery' | 'head-setup' | 'unassigned'
  evidence: 'target-plan' | 'current-virtual-fire' | 'conditional' | 'none'
}

/** A single compatible target; no missing target cells are supplied here. */
export function inspectConstructionUse(
  grid: PuyoGrid,
  target: ViablePairTarget,
  currentFireSteps: readonly ClearStep[],
  head: Pick<HeadExtension, 'missing'> | null,
): ConstructionCellUse[] {
  // A two-color head resolution invents a non-trigger cell. It cannot prove
  // that an existing extra already participates in the current main chain.
  const recovered = new Set((head?.missing === 2 ? [] : recoveredSkeletonExtraOrigins(
    currentFireSteps, target.columns.map(column => column.length),
  )).map(p => `${p.x}:${p.y}`))
  const cells: ConstructionCellUse[] = []
  grid.forEach((row, y) => row.forEach((color, x) => {
    if (color === null) return
    const position = { x, y }
    const targetCell = target.columns[x]?.[grid.length - 1 - y] === color
    if (targetCell) cells.push({ position, color, role: 'target', evidence: 'target-plan' })
    else if (recovered.has(`${x}:${y}`)) cells.push({ position, color, role: 'main-recovery', evidence: 'current-virtual-fire' })
    else if (head && x <= 1 && (y === 8 || y === 9)) cells.push({ position, color, role: 'head-setup', evidence: 'conditional' })
    else cells.push({ position, color, role: 'unassigned', evidence: 'none' })
  }))
  return cells
}
