import { PuyoColor } from '../core/types'
import { findConnectedGroup, type LandingResult } from '../core/ChainSimulator'
import { tailPreference } from './TailPreference'

export type TailShape = 'Y' | 'zabuton' | 'L'

export interface TailPlan {
  shape: TailShape
  color: PuyoColor
  chainCells: { x: number; y: number }[]
  supportCells: { x: number; y: number }[]
  matchedChainCells: number
  filledSupportCells: number
  matchedCells: number
  totalCells: number
  continuationCount: number
  templateFilled: boolean
}

export interface TailPlacementProgress {
  plan: TailPlan | null
  newChainCells: number
  newSupportCells: number
  previousMatchedChainCells: number
  previousMatchedCells: number
  filledTemplate: boolean
  blocksEstablishedPlan: boolean
}

interface TailTemplate {
  shape: TailShape
  chainCells: { x: number; rowFromBottom: number }[]
  supportCells: { x: number; rowFromBottom: number }[]
}

const ALL_COLORS: PuyoColor[] = [
  PuyoColor.RED,
  PuyoColor.GREEN,
  PuyoColor.BLUE,
  PuyoColor.YELLOW,
]

// Physical progress first; equal-progress plans follow the teaching order.
const TEMPLATES: TailTemplate[] = [
  {
    shape: 'Y',
    chainCells: [
      { x: 2, rowFromBottom: 0 },
      { x: 3, rowFromBottom: 1 },
      { x: 4, rowFromBottom: 1 },
      { x: 2, rowFromBottom: 2 },
    ],
    // 支持ぷよは3連鎖目を作る時点では同色である必要がない。後続の伸ばしに再利用できる。
    supportCells: [
      { x: 3, rowFromBottom: 0 },
      { x: 4, rowFromBottom: 0 },
    ],
  },
  {
    shape: 'zabuton',
    chainCells: [
      { x: 2, rowFromBottom: 2 },
      { x: 3, rowFromBottom: 1 },
      { x: 4, rowFromBottom: 1 },
      { x: 5, rowFromBottom: 1 },
    ],
    supportCells: [
      { x: 2, rowFromBottom: 0 },
      { x: 3, rowFromBottom: 0 },
      { x: 4, rowFromBottom: 0 },
      { x: 5, rowFromBottom: 0 },
    ],
  },
  {
    shape: 'L',
    chainCells: [
      { x: 2, rowFromBottom: 0 },
      { x: 3, rowFromBottom: 0 },
      { x: 3, rowFromBottom: 1 },
      { x: 2, rowFromBottom: 2 },
    ],
    supportCells: [],
  },
]

const key = (x: number, y: number) => `${x},${y}`

export class TailPlanner {
  /** Check the eventual chain cells without dropping through missing supports. */
  static canFillChainCells(
    grid: (PuyoColor | null)[][],
    chainCells: { x: number; y: number }[],
    color: PuyoColor,
  ): boolean {
    if (chainCells.some(({ x, y }) =>
      grid[y]?.[x] === undefined || (grid[y][x] !== null && grid[y][x] !== color),
    )) return false
    const filled = grid.map(row => [...row])
    for (const { x, y } of chainCells) filled[y][x] = color
    return chainCells.every(({ x, y }) => findConnectedGroup(filled, x, y, color).length < 4)
  }

  static getPlans(
    grid: (PuyoColor | null)[][],
    foldColor?: PuyoColor,
  ): TailPlan[] {
    const height = grid.length
    const plans: TailPlan[] = []

    for (const template of TEMPLATES) {
      const chainCells = template.chainCells.map(cell => ({
        x: cell.x,
        y: height - 1 - cell.rowFromBottom,
      }))
      const supportCells = template.supportCells.map(cell => ({
        x: cell.x,
        y: height - 1 - cell.rowFromBottom,
      }))

      for (const color of ALL_COLORS) {
        // GTRの2連鎖目と同色では、支持色が消えると一緒に消えて尾にならない。
        if (color === foldColor) continue
        if (chainCells.some(cell => {
          const current = grid[cell.y]?.[cell.x]
          return current !== null && current !== undefined && current !== color
        })) continue

        // Existing same-color spares can turn a nominal three-puyo arm into an
        // immediate four-group when filled. Such a shape cannot wait for GTR.
        // Check adjacency without gravity: the still-missing supports/core will
        // be placed before these targets, so their empty cells are intentional.
        if (!this.canFillChainCells(grid, chainCells, color)) continue

        const matchedChainCells = chainCells.filter(
          cell => grid[cell.y]?.[cell.x] === color,
        ).length
        const filledSupportCells = supportCells.filter(
          cell => grid[cell.y]?.[cell.x] != null,
        ).length
        const missingCells = [...chainCells, ...supportCells].filter(
          cell => grid[cell.y]?.[cell.x] === null,
        )
        const continuationCount = missingCells.filter(
          cell => this.isNextReachableCell(grid, cell.x, cell.y),
        ).length

        plans.push({
          shape: template.shape,
          color,
          chainCells,
          supportCells,
          matchedChainCells,
          filledSupportCells,
          matchedCells: matchedChainCells + filledSupportCells,
          totalCells: chainCells.length + supportCells.length,
          continuationCount,
          templateFilled:
            matchedChainCells === chainCells.length &&
            filledSupportCells === supportCells.length,
        })
      }
    }

    return plans.sort((left, right) =>
      Number(right.templateFilled) - Number(left.templateFilled) ||
      right.matchedCells - left.matchedCells ||
      right.continuationCount - left.continuationCount ||
      tailPreference(left.shape) - tailPreference(right.shape),
    )
  }

  static evaluatePlacement(
    gridBefore: (PuyoColor | null)[][],
    gridAfter: (PuyoColor | null)[][],
    landing: LandingResult,
    foldColor?: PuyoColor,
  ): TailPlacementProgress {
    const beforePlans = this.getPlans(gridBefore, foldColor)
    const afterPlans = this.getPlans(gridAfter, foldColor)
    const beforeById = new Map(
      beforePlans.map(plan => [this.planId(plan), plan]),
    )
    const landed = new Set([
      key(landing.mainPos.x, landing.mainPos.y),
      key(landing.subPos.x, landing.subPos.y),
    ])

    let best: TailPlacementProgress | null = null
    for (const plan of afterPlans) {
      const previous = beforeById.get(this.planId(plan))
      const newChainCellList = plan.chainCells.filter(cell =>
        landed.has(key(cell.x, cell.y)) &&
        gridBefore[cell.y]?.[cell.x] === null &&
        gridAfter[cell.y]?.[cell.x] === plan.color,
      )
      const newChainCells = newChainCellList.length
      const newSupportCellList = plan.supportCells.filter(cell =>
        landed.has(key(cell.x, cell.y)) &&
        gridBefore[cell.y]?.[cell.x] === null &&
        gridAfter[cell.y]?.[cell.x] != null,
      )
      const newSupportCells = newSupportCellList.length
      const progress: TailPlacementProgress = {
        plan,
        newChainCells,
        newSupportCells,
        previousMatchedChainCells: previous?.matchedChainCells ?? 0,
        previousMatchedCells: previous?.matchedCells ?? 0,
        filledTemplate: plan.templateFilled && !previous?.templateFilled,
        blocksEstablishedPlan: false,
      }
      if (!best || this.compareProgress(progress, best) > 0) best = progress
    }

    const blocksEstablishedPlan = beforePlans.some(plan =>
      plan.matchedChainCells > 0 &&
      plan.chainCells.some(cell =>
        landed.has(key(cell.x, cell.y)) &&
        gridBefore[cell.y]?.[cell.x] === null &&
        gridAfter[cell.y]?.[cell.x] !== plan.color,
      ) &&
      !afterPlans.some(after => this.planId(after) === this.planId(plan)),
    )

    if (best) return { ...best, blocksEstablishedPlan }
    return {
      plan: null,
      newChainCells: 0,
      newSupportCells: 0,
      previousMatchedChainCells: 0,
      previousMatchedCells: 0,
      filledTemplate: false,
      blocksEstablishedPlan,
    }
  }

  private static compareProgress(
    left: TailPlacementProgress,
    right: TailPlacementProgress,
  ): number {
    const leftNew = left.newChainCells * 5 + left.newSupportCells * 2
    const rightNew = right.newChainCells * 5 + right.newSupportCells * 2
    return leftNew - rightNew ||
      Number(left.filledTemplate) - Number(right.filledTemplate) ||
      left.previousMatchedChainCells - right.previousMatchedChainCells ||
      left.previousMatchedCells - right.previousMatchedCells ||
      (left.plan?.continuationCount ?? 0) - (right.plan?.continuationCount ?? 0) ||
      (right.plan ? tailPreference(right.plan.shape) : 0) - (left.plan ? tailPreference(left.plan.shape) : 0)
  }

  private static planId(plan: TailPlan): string {
    return `${plan.shape}:${plan.color}`
  }

  private static isNextReachableCell(
    grid: (PuyoColor | null)[][],
    x: number,
    y: number,
  ): boolean {
    for (let row = grid.length - 1; row > y; row--) {
      if (grid[row]?.[x] === null) return false
    }
    return true
  }
}
