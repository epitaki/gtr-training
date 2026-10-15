import { decodeBenchmarkGrid, encodeBenchmarkGrid, type BenchmarkGameResult } from './AdvisorBenchmark'
import { simulateTurn } from '../game/core/ChainSimulator'

export type BirthStage = 'throughFoldCompletion' | 'throughTailCompletion' | 'afterTailBeforeFire' | 'tailNeverCertified' | 'firePair'
export interface RemainingPuyo { turn: number; half: 'main' | 'sub'; column: number; row: number; stage: BirthStage }

/** Track birth turns through the shared simulator's original-cell clear trace.
 * This is provenance only: it does not predict color supply or score moves. */
export function inspectRemainingPuyos(game: BenchmarkGameResult): RemainingPuyo[] {
  type Tag = { turn: number; half: 'main' | 'sub' }
  let tags: (Tag | null)[][] = Array.from({ length: 13 }, () => Array(6).fill(null))
  let previous = '.'.repeat(78)
  for (const turn of game.turns) {
    if (turn.gridBefore !== previous) throw new Error(`Discontinuous game ${game.gameIndex}, turn ${turn.turn}`)
    const pair = { main: { color: turn.currentPair.main, x: 2, y: 1 },
      sub: { color: turn.currentPair.sub, x: 2, y: 0 }, rotation: 0, falling: true }
    const result = simulateTurn(decodeBenchmarkGrid(turn.gridBefore), pair, turn.placement)
    if (!result.valid || !result.landing || encodeBenchmarkGrid(result.stableGrid) !== turn.gridAfter) {
      throw new Error(`Invalid saved replay ${game.gameIndex}, turn ${turn.turn}`)
    }
    for (const half of ['main', 'sub'] as const) {
      const position = half === 'main' ? result.landing.mainPos : result.landing.subPos
      if (tags[position.y][position.x]) throw new Error('Placement overlaps an existing origin')
      tags[position.y][position.x] = { turn: turn.turn, half }
    }
    for (const step of result.clearSteps) for (const cleared of step.clearedPuyos) {
      if (!cleared.origin || !tags[cleared.origin.y][cleared.origin.x]) throw new Error('Missing/duplicate clear origin')
      tags[cleared.origin.y][cleared.origin.x] = null
    }
    const settled: (Tag | null)[][] = Array.from({ length: 13 }, () => Array(6).fill(null))
    for (let x = 0; x < 6; x++) {
      let nextRow = 12
      for (let y = 12; y >= 0; y--) if (tags[y][x]) settled[nextRow--][x] = tags[y][x]
    }
    if (settled.some((row, y) => row.some((tag, x) => Boolean(tag) !== (result.stableGrid[y][x] !== null)))) {
      throw new Error('Origin occupancy disagrees with simulation')
    }
    tags = settled
    previous = turn.gridAfter
  }
  if (previous !== game.finalGrid) throw new Error('Final grid disagrees with saved turns')
  const cells: RemainingPuyo[] = []
  tags.forEach((row, y) => row.forEach((tag, x) => {
    if (!tag) return
    const stage: BirthStage = game.fireTurn === tag.turn ? 'firePair'
      : game.coreTurn === null || tag.turn <= game.coreTurn ? 'throughFoldCompletion'
        : game.completionTurn === null ? 'tailNeverCertified'
          : tag.turn <= game.completionTurn ? 'throughTailCompletion' : 'afterTailBeforeFire'
    cells.push({ ...tag, column: x, row: y, stage })
  }))
  if (game.actualFire && cells.length !== game.leftoverPuyos) throw new Error('Leftover count disagrees with origins')
  return cells
}

export function summarizeSparePuyos(games: readonly BenchmarkGameResult[]) {
  const fired = games.filter(game => game.actualFire)
  const residuals = fired.map(game => ({ gameIndex: game.gameIndex, cells: inspectRemainingPuyos(game) }))
  const counts = residuals.map(game => game.cells.length).sort((a, b) => a - b)
  const stages: Record<BirthStage, number> = { throughFoldCompletion: 0, throughTailCompletion: 0,
    afterTailBeforeFire: 0, tailNeverCertified: 0, firePair: 0 }
  const columns = Array<number>(6).fill(0)
  for (const game of residuals) for (const cell of game.cells) { stages[cell.stage]++; columns[cell.column]++ }
  return {
    games: games.length, firedGames: fired.length, nonFiredGames: games.length - fired.length,
    total: counts.reduce((sum, count) => sum + count, 0),
    average: counts.length ? counts.reduce((sum, count) => sum + count, 0) / counts.length : null,
    median: counts.length ? (counts[Math.floor((counts.length - 1) / 2)] + counts[Math.floor(counts.length / 2)]) / 2 : null,
    p90: counts.length ? counts[Math.ceil(counts.length * 0.9) - 1] : null,
    atLeast8: counts.filter(count => count >= 8).length,
    atMost2: counts.filter(count => count <= 2).length,
    stages, columns, residuals,
  }
}
