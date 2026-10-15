import { describe, expect, it } from 'vitest'
import { decodeHumanReplay, normalizeHumanPairs, sameHumanPlacement } from './HumanReplay'
import { simulateTurn, type PuyoGrid } from '../game/core/ChainSimulator'
import { PuyoColor } from '../game/core/types'
import dataset from '../../benchmarks/human/gtr-openings-v1.json'
import expandedDataset from '../../benchmarks/human/gtr-openings-500-v1.json'

describe('public human replay import', () => {
  it('decodes axis, child and rotation against the public simulator after four moves', () => {
    const moves = decodeHumanReplay('_cmmo2Qcy')
    expect(moves).toEqual([
      { main: 'blue', sub: 'blue', placement: { column: 1, rotation: 3 } },
      { main: 'purple', sub: 'blue', placement: { column: 2, rotation: 0 } },
      { main: 'red', sub: 'blue', placement: { column: 5, rotation: 2 } },
      { main: 'blue', sub: 'blue', placement: { column: 3, rotation: 1 } },
    ])
    // Preserve physical equality under color renaming, including purple.
    const pairs = normalizeHumanPairs(moves)
    let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    for (let i = 0; i < moves.length; i++) grid = simulateTurn(grid, pairs[i], moves[i].placement!).stableGrid
    expect(grid[12]).toEqual(['red', 'red', 'green', 'red', 'red', 'red'])
    expect(grid[11]).toEqual([null, null, 'red', null, null, 'blue'])
  })

  it.each(['_c0m0', '_c', '_c?', '$12345', 'abc_cm', '_08c0cm', '_0e', '_0O', '_p8', '_0U'])
    ('rejects colors-only, malformed, non-pair or wall-crossing input %s', record => {
      expect(() => decodeHumanReplay(record)).toThrow()
    })

  it('allows recorded placements followed by unplaced next pairs', () => {
    const moves = decodeHumanReplay('_cmc0m0')
    expect(moves[0].placement).not.toBeNull()
    expect(moves[1].placement).toBeNull()
    expect(moves[2].placement).toBeNull()
  })

  it('rejects five colors instead of merging them', () => {
    expect(() => normalizeHumanPairs(decodeHumanReplay('_18d8o8'))).toThrow('Five-color')
  })

  it('compares doubles by board outcome rather than rotation/axis spelling', () => {
    const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    const pair = normalizeHumanPairs(decodeHumanReplay('_cm'))[0]
    expect(sameHumanPlacement(grid, pair, { column: 0, rotation: 1 }, { column: 1, rotation: 3 })).toBe(true)
    expect(sameHumanPlacement(grid, pair, { column: 0, rotation: 0 }, { column: 1, rotation: 0 })).toBe(false)
    expect(pair.main.color).toBe(PuyoColor.RED)
  })

  it('has 30 unique traces, three players, fixed 21/9 splits and valid early drops', () => {
    expect(dataset.records).toHaveLength(30)
    expect(new Set(dataset.records.map(row => row.record)).size).toBe(30)
    expect(new Set(dataset.records.map(row => row.player)).size).toBe(3)
    expect(dataset.records.filter(row => row.split === 'development')).toHaveLength(21)
    expect(dataset.records.filter(row => row.split === 'holdout')).toHaveLength(9)
    const queuesBySplit = new Map<string, string>()
    for (const row of dataset.records) {
      const moves = decodeHumanReplay(row.record).slice(0, 14)
      const pairs = normalizeHumanPairs(moves)
      const queue = pairs.map(pair => pair.main.color[0] + pair.sub.color[0]).join('')
      expect(queuesBySplit.get(queue) ?? row.split).toBe(row.split)
      queuesBySplit.set(queue, row.split)
      let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
      for (const [i, move] of moves.slice(0, 12).entries()) {
        if (!move.placement) break
        const result = simulateTurn(grid, pairs[i], move.placement)
        expect(result.valid, row.id).toBe(true)
        if (result.chainCount) break
        grid = result.stableGrid
      }
    }
  })

  it('has 500 unique match keys, five players, no split leakage and valid prefixes', () => {
    expect(expandedDataset.records).toHaveLength(500)
    expect(new Set(expandedDataset.records.map(row => row.matchKey)).size).toBe(500)
    expect(new Set(expandedDataset.records.map(row => row.player)).size).toBe(5)
    expect(expandedDataset.records.filter(row => row.split === 'holdout')).toHaveLength(101)
    const keys = new Set<string>()
    for (const row of expandedDataset.records) {
      const moves = decodeHumanReplay(row.record).slice(0, 14)
      expect(moves).toHaveLength(14)
      const pairs = normalizeHumanPairs(moves)
      const key = row.date.split('/').join('-') + ':' + pairs.slice(0, 8)
        .map(pair => [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW].indexOf(pair.main.color).toString()
          + [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW].indexOf(pair.sub.color)).join('')
      expect(key).toBe(row.matchKey)
      expect(keys.has(key)).toBe(false)
      keys.add(key)
      let grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
      for (const [i, move] of moves.slice(0, 12).entries()) {
        expect(move.placement).not.toBeNull()
        const result = simulateTurn(grid, pairs[i], move.placement!)
        expect(result.valid, row.id).toBe(true)
        if (result.chainCount) break
        grid = result.stableGrid
      }
    }
  })
})
