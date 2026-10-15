import { describe, expect, it } from 'vitest'
import source from '../../benchmarks/human/piropuyo-tail-20260924-v1.json'
import { decodeHumanReplay, normalizeHumanPairs } from './HumanReplay'
import { simulateTurn, type PuyoGrid } from '../game/core/ChainSimulator'

describe('saved tutorial links, not optimal move labels', () => {
  it.each(source.records)('replays $id without fetching the site again', record => {
    expect(source.isCorrectMoveLabel).toBe(false)
    const moves = decodeHumanReplay(record.record)
    const pairs = normalizeHumanPairs(moves)
    let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    const clears: { turn: number; chains: number }[] = []
    let placed = 0
    for (const [index, move] of moves.entries()) {
      if (!move.placement) break
      const result = simulateTurn(grid, pairs[index], move.placement)
      expect(result.valid).toBe(true)
      placed++
      if (result.chainCount) clears.push({ turn: index + 1, chains: result.chainCount })
      grid = result.stableGrid
    }
    expect(placed).toBe(record.placedMoves)
    expect(clears).toEqual(record.observedClears)
  })
})
