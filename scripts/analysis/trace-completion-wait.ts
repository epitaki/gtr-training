// Diagnostic only: expose a frozen bundle's existing advisor without altering its logic.
import { readFileSync, writeFileSync } from 'node:fs'
import { PlacementAdvisor } from '../../src/game/advisor/PlacementAdvisor'
import { FiveChainPlanner } from '../../src/game/advisor/FiveChainPlanner'
import { PuyoColor, type PuyoPair } from '../../src/game/core/types'
import { simulateTurn, type PuyoGrid } from '../../src/game/core/ChainSimulator'

const [baseline, output] = process.argv.slice(2)
if (!baseline || !output) throw new Error('Expected frozen-engine.js output.json')
const source = readFileSync(baseline, 'utf8') + '\nexport { PlacementAdvisor as DiagnosticAdvisor };\n'
const frozen = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const palette: Record<string, PuyoColor> = { R: PuyoColor.RED, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW, G: PuyoColor.GREEN }
const queue = ['RB', 'RB', 'YB', 'RR', 'BY', 'GY', 'GY', 'YR', 'BG', 'YY', 'BY', 'GR', 'BY', 'RB', 'BG'].map((colors): PuyoPair => ({
  main: { color: palette[colors[0]], x: 2, y: 1 }, sub: { color: palette[colors[1]], x: 2, y: 0 }, rotation: 0, falling: true,
}))
const plan = { colorA: PuyoColor.BLUE, colorB: PuyoColor.RED, colorC: PuyoColor.BLUE, colorD: PuyoColor.RED }
const rows = []
let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
for (let i = 0; i < 14; i++) {
  const field = { grid, width: 6, height: 13 }
  const before = frozen.DiagnosticAdvisor.getAdvice(field, queue[i], queue[i + 1], queue[i + 2], plan) as ReturnType<typeof PlacementAdvisor.getAdvice>
  const after = PlacementAdvisor.getAdvice(field, queue[i], queue[i + 1], queue[i + 2], plan)
  const changed = JSON.stringify(before.bestPlacement?.placement) !== JSON.stringify(after.bestPlacement?.placement)
  rows.push({ turn: i + 1, changed, grid, current: queue[i],
    completion: FiveChainPlanner.inspectCompletion(grid, plan),
    before: before.allPlacements.slice(0, 6).map(p => ({ placement: p.placement, score: p.totalScore })),
    after: after.allPlacements.slice(0, 6).map(p => ({ placement: p.placement, score: p.totalScore })),
  })
  grid = simulateTurn(grid, queue[i], before.bestPlacement!.placement).stableGrid
}
writeFileSync(output, `${JSON.stringify(rows, null, 2)}\n`)
console.log(JSON.stringify(rows.filter(row => row.changed), null, 2))
