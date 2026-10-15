import { PuyoColor, type PuyoPair } from '../core/types'
import { isSpawnBlocked, resolveChains, simulateTurn, type OriginGrid, type Placement, type PuyoGrid } from '../core/ChainSimulator'

const colors = [PuyoColor.GREEN, PuyoColor.RED, PuyoColor.BLUE, PuyoColor.YELLOW] as const
const placements: readonly Placement[] = [
  { column: 3, rotation: 1 }, { column: 5, rotation: 0 },
  { column: 4, rotation: 1 }, { column: 3, rotation: 0 }, { column: 4, rotation: 0 },
]

export interface FoundationExtensionExample {
  color: PuyoColor
  first: Placement
  second: Placement
  finalGrid: PuyoGrid
  addedOrigins: string[]
}

const originSteps = (steps: ReturnType<typeof resolveChains>['clearSteps']): string[][] => steps.map(step =>
  step.clearedPuyos.map(p => p.origin ? `${p.origin.x},${p.origin.y}` : 'starter').sort(),
)

/** At most 4 colors × 5 first placements × 5 second placements. Called only by the open gallery modal. */
export function findFoundationExtensionExample(source: PuyoGrid): FoundationExtensionExample | null {
  if (source.length !== 13 || source.some(row => row.length !== 6) || source[9][0] !== null || source[10][0] === null) return null
  const initial = source.map(row => [...row])
  initial[9][0] = initial[10][0]
  const baselineOrigins: OriginGrid = source.map((row, y) => row.map((color, x) => color === null ? null : { x, y }))
  const baseline = resolveChains(initial, { origins: baselineOrigins })
  if (baseline.chainCount !== 5 || !baseline.allClear) return null
  const expected = originSteps(baseline.clearSteps)

  for (const color of colors) {
    const pair: PuyoPair = { main: { color, x: 2, y: 1 }, sub: { color, x: 2, y: 0 }, rotation: 0, falling: true }
    for (const first of placements) {
      const a = simulateTurn(source, pair, first)
      if (!a.valid || a.chainCount !== 0 || !a.landing || isSpawnBlocked(a.stableGrid)) continue
      for (const second of placements) {
        const b = simulateTurn(a.stableGrid, pair, second)
        if (!b.valid || b.chainCount !== 0 || !b.landing || isSpawnBlocked(b.stableGrid)) continue
        const added = [a.landing.mainPos, a.landing.subPos, b.landing.mainPos, b.landing.subPos]
        const addedOrigins = added.map(p => `${p.x},${p.y}`).sort()
        const fired = b.stableGrid.map(row => [...row])
        fired[9][0] = fired[10][0]
        const origins: OriginGrid = b.stableGrid.map((row, y) => row.map((cell, x) => cell === null ? null : { x, y }))
        const result = resolveChains(fired, { origins })
        if (result.chainCount !== 6 || !result.allClear) continue
        const steps = originSteps(result.clearSteps)
        if (expected.some((step, index) => JSON.stringify(step) !== JSON.stringify(steps[index]))) continue
        if (JSON.stringify(steps[5]) !== JSON.stringify(addedOrigins)) continue
        return { color, first, second, finalGrid: b.stableGrid, addedOrigins }
      }
    }
  }
  return null
}

/** Occupied cells per column and the largest adjacent step across columns 3–6. */
export function describeFoundationSurface(grid: PuyoGrid): { heights: number[]; rightMaxStep: number } {
  const heights = Array.from({ length: 6 }, (_, x) => grid.reduce((count, row) => count + Number(row[x] !== null), 0))
  const rightMaxStep = Math.max(...[2, 3, 4].map(x => Math.abs(heights[x] - heights[x + 1])))
  return { heights, rightMaxStep }
}
