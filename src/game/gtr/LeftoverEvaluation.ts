import type { PuyoColor } from '../core/types'
import { GTR_SCORING_CONFIG } from './GTRScoringConfig'

type Cell = { x: number; y: number; color: PuyoColor }

/** Score settled leftovers from the masked foundation, not upper extension puyos. */
export function evaluateLeftovers(cells: readonly Cell[]) {
  const points = GTR_SCORING_CONFIG.LEFTOVER_PUYOS
  if (!cells.length) return { score: points.NO_LEFTOVER, connected: false, kind: 'none' as const }
  if (new Set(cells.map(c => c.color)).size !== 1) return { score: points.MULTIPLE_COLORS, connected: false, kind: 'mixed' as const }
  const pending = [cells[0]], seen = new Set<string>()
  while (pending.length) {
    const cell = pending.pop()!, key = `${cell.x}:${cell.y}`
    if (seen.has(key)) continue
    seen.add(key)
    for (const next of cells) if (Math.abs(cell.x - next.x) + Math.abs(cell.y - next.y) === 1) pending.push(next)
  }
  if (seen.size !== cells.length) return { score: points.SINGLE_COLOR_SEPARATED, connected: false, kind: 'separated' as const }
  return { score: points.SINGLE_OR_CONNECTED, connected: cells.length > 1,
    kind: cells.length === 1 ? 'single' as const : 'connected' as const }
}
