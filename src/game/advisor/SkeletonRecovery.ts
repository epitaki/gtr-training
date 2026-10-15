import type { ClearStep } from '../core/ChainSimulator'
import type { Position } from '../core/types'

/** Count spare cells cleared with the completed skeleton, not an independent
 * side chain. Origins identify the spare even after it falls several rows.
 * The fixed 13-row skeleton and its column-0 firing cell are the caller's model.
 */
export function countRecoveredSkeletonExtras(steps: readonly ClearStep[], columnHeights: readonly number[]): number {
  return recoveredSkeletonExtraOrigins(steps, columnHeights).length
}

/** Original cells, allowing construction diagnostics to account for each only once. */
export function recoveredSkeletonExtraOrigins(steps: readonly ClearStep[], columnHeights: readonly number[]): Position[] {
  const recovered: Position[] = []
  for (const step of steps) {
    const byCell = new Map(step.clearedPuyos.map(puyo => [puyo.position.y * 6 + puyo.position.x, puyo]))
    const visited = new Set<number>()
    for (const start of step.clearedPuyos) {
      const stack = [start]
      let hasSkeleton = false
      const extras: Position[] = []
      while (stack.length) {
        const puyo = stack.pop()!
        const key = puyo.position.y * 6 + puyo.position.x
        if (visited.has(key)) continue
        visited.add(key)
        const origin = puyo.origin
        if (origin) {
          const height = columnHeights[origin.x]
          if (height !== undefined && origin.y >= 13 - height) hasSkeleton = true
          else if (origin.x === 0 && origin.y === 9) hasSkeleton = true
          else if (height !== undefined && origin.x > 0) extras.push(origin)
        }
        const { x, y } = puyo.position
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= 6 || ny < 0 || ny >= 13) continue
          const neighbor = byCell.get(ny * 6 + nx)
          if (neighbor?.color === puyo.color) stack.push(neighbor)
        }
      }
      if (hasSkeleton) recovered.push(...extras)
    }
  }
  return recovered
}
