import { PuyoColor } from '../core/types'
import type { PuyoGrid } from '../core/ChainSimulator'

interface FoldColors { colorA: PuyoColor; colorB: PuyoColor }

/** The seven required cells of the left, bottom-anchored standard GTR. */
export function getFoldTargets(height: number, { colorA: a, colorB: b }: FoldColors) {
  return [
    { x: 0, y: height - 1, color: b, priority: 3 },
    { x: 1, y: height - 1, color: b, priority: 3 },
    { x: 0, y: height - 2, color: a, priority: 2 },
    { x: 1, y: height - 2, color: a, priority: 2 },
    { x: 2, y: height - 2, color: b, priority: 2 },
    { x: 0, y: height - 3, color: a, priority: 1 },
    { x: 1, y: height - 3, color: b, priority: 1 },
  ]
}

/** Explain a conflict only after ALL color assignments have been ruled out.
 * Missing colors are a wait, not a blockage. An alternate viable fold is not
 * an error just because it differs from the initial teaching color plan.
 */
export function describeFoldBlockage(grid: PuyoGrid, preferred?: FoldColors): string | null {
  const colors = Object.values(PuyoColor)
  const assignments = colors.flatMap(colorA => colors.filter(colorB => colorB !== colorA)
    .map(colorB => ({ colorA, colorB })))
  const options = assignments.map(assignment => {
    const targets = getFoldTargets(grid.length, assignment)
    return {
      conflicts: targets.filter(t => grid[t.y]?.[t.x] != null && grid[t.y][t.x] !== t.color),
      matched: targets.filter(t => grid[t.y]?.[t.x] === t.color).reduce((sum, t) => sum + t.priority, 0),
      preferred: assignment.colorA === preferred?.colorA && assignment.colorB === preferred?.colorB,
    }
  })
  if (options.some(option => option.conflicts.length === 0)) return null
  options.sort((a, b) => a.conflicts.length - b.conflicts.length || b.matched - a.matched ||
    Number(b.preferred) - Number(a.preferred))
  const conflict = options[0].conflicts[0]
  const names: Record<PuyoColor, string> = { red: '赤', green: '緑', blue: '青', yellow: '黄' }
  const more = options[0].conflicts.length > 1 ? 'など' : ''
  return `基本形が塞がれています：${conflict.x + 1}列目・下から${grid.length - conflict.y}段目の${names[grid[conflict.y][conflict.x]!]}${more}（必要色は${names[conflict.color]}）。積むだけでは完成できません。`
}
