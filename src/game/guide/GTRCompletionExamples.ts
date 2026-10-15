import { PuyoColor, type Field } from '../core/types'
import type { PuyoGrid } from '../core/ChainSimulator'
import type { GTRTrainingPlan } from '../advisor/PlacementAdvisor'
import type { TailShape } from '../advisor/TailPlanner'
import { GTR_COMPLETION_GALLERY } from './GTRCompletionGallery'

export interface CompletionExample {
  shape: TailShape
  label: string
  rows: readonly string[]
}

export const COMPLETION_SHAPES: readonly TailShape[] = ['Y', 'zabuton', 'L']

// A/B are the fold, C/D the continuation. These are teaching diagrams, not
// placements to copy onto the current field.
export const GTR_COMPLETION_EXAMPLES: Readonly<Record<TailShape, CompletionExample>> = {
  Y: { shape: 'Y', label: 'Y字', rows: ['.....A', 'ABCDDA', 'AABCCD', 'BBCAAD'] },
  zabuton: { shape: 'zabuton', label: '座布団', rows: ['.....A', 'ABCAAD', 'AABCCC', 'BBADDD'] },
  L: { shape: 'L', label: 'L字', rows: ['.....A', 'ABCDAA', 'AABCDD', 'BBCCDA'] },
}

const COLORS: readonly PuyoColor[] = [
  PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW,
]

export type CompletionColors = Record<'A' | 'B' | 'C' | 'D', PuyoColor>

/** Keep the illustration's four symbols distinct even when the training plan reuses colors. */
export function getCompletionColors(
  field?: Pick<Field, 'grid'>,
  plan?: Pick<GTRTrainingPlan, 'colorA' | 'colorB'>,
  preferredTailColor?: PuyoColor,
): CompletionColors {
  const grid = field?.grid
  const bottom = grid?.length ? grid.length - 1 : -1
  const placedA = grid?.[bottom - 1]?.[0]
  const placedB = grid?.[bottom]?.[0]
  let A = placedA ?? plan?.colorA ?? PuyoColor.RED
  let B = placedB ?? plan?.colorB ?? COLORS.find(color => color !== A)!
  if (A === B) {
    if (placedB && !placedA) {
      A = plan?.colorA && plan.colorA !== B ? plan.colorA : COLORS.find(color => color !== B)!
    } else {
      B = plan?.colorB && plan.colorB !== A ? plan.colorB : COLORS.find(color => color !== A)!
    }
  }
  const used = new Set([A, B])
  const C = preferredTailColor && !used.has(preferredTailColor)
    ? preferredTailColor : COLORS.find(color => !used.has(color))!
  used.add(C)
  const D = COLORS.find(color => !used.has(color))!
  return { A, B, C, D }
}

export function getCompletionGrid(shape: TailShape, colors: CompletionColors): PuyoGrid {
  return gridFromRows(GTR_COMPLETION_EXAMPLES[shape].rows, colors)
}

/** Three different existing foundations for the selected tab, using one fold palette. */
export function getCompletionExampleGrids(shape: TailShape, colors: CompletionColors): PuyoGrid[] {
  return GTR_COMPLETION_GALLERY.filter(example => example.shape === shape).slice(0, 3)
    .map(example => gridFromRows(example.rows, colors))
}

function gridFromRows(rows: readonly string[], colors: CompletionColors): PuyoGrid {
  return rows.map(row => [...row].map(symbol =>
    symbol === '.' ? null : colors[symbol as keyof CompletionColors],
  ))
}

export function getDisplayedCompletionShape(
  manualShape: TailShape | null,
  advisedShape?: TailShape,
): TailShape {
  return manualShape ?? advisedShape ?? 'Y'
}
