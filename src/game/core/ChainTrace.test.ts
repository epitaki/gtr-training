import { describe, expect, it } from 'vitest'
import { resolveChains, resolveChainsWithTrace, type PuyoGrid } from './ChainSimulator'
import { PuyoColor } from './types'
import { PuyoPairManager } from './PuyoPair'
import { applyPairPlacement } from './ChainSimulator'

const grid = (...rows: string[]): PuyoGrid => {
  const result: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  rows.forEach((row, index) => {
    result[13 - rows.length + index] = [...row].map(color => ({
      R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW,
    })[color as 'R' | 'G' | 'B' | 'Y'] ?? null)
  })
  return result
}

describe('chain trace', () => {
  it('keeps ordinary resolution equal for zero, one, two, and five chains', () => {
    const cases = [
      grid('......'),
      grid('RRRR..'),
      grid('.B....', 'RR....', 'RRBBB.'),
      grid('.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB').map((row, y) =>
        y === 9 ? row.map((cell, x) => x === 0 ? PuyoColor.RED : cell) : row),
    ]
    for (const [index, source] of cases.entries()) {
      const before = source.map(row => [...row])
      const normal = resolveChains(source)
      const trace = resolveChainsWithTrace(source)
      expect(trace.result).toEqual(normal)
      expect(normal.chainCount).toBe([0, 1, 2, 5][index])
      expect(source).toEqual(before)
      expect(trace.initial.grid).toEqual(source)
      expect(trace.stages.filter(stage => stage.kind === 'clear')).toHaveLength(normal.chainCount)
      for (const stage of trace.stages) {
        expect(stage.after.grid).not.toBe(source)
        expect(stage.after.grid).not.toBe(trace.initial.grid)
        expect(stage.after.ids).not.toBe(trace.initial.ids)
      }
    }
  })

  it('tracks split and same-color stack identities separately from origins', () => {
    const source = grid('R.....', 'R.....', 'B.....', '......')
    const origins = source.map(row => row.map(() => null))
    const trace = resolveChainsWithTrace(source, { origins }, 'run-7')
    const moves = trace.stages.flatMap(stage => stage.kind === 'gravity' ? stage.moves : [])
    expect(moves.map(move => move.id)).toEqual(['run-7:11:0', 'run-7:10:0', 'run-7:9:0'])
    expect(new Set(trace.initial.ids.flat().filter(Boolean)).size).toBe(3)
    expect(trace.result.clearSteps).toEqual(resolveChains(source, { origins }).clearSteps)
  })

  it('clears independent groups simultaneously', () => {
    for (const source of [grid('RRRRBB', '....BB'), grid('RR..RR', 'RR..RR')]) {
      const trace = resolveChainsWithTrace(source)
      const clears = trace.stages.filter(stage => stage.kind === 'clear')
      expect(clears).toHaveLength(1)
      expect(clears[0].chainIndex).toBe(1)
      expect(clears[0].cleared).toHaveLength(8)
      expect(new Set(clears[0].cleared.map(puyo => puyo.id)).size).toBe(8)
      expect(trace.result.chainCount).toBe(1)
    }
  })

  it('starts a horizontal split at real contact and preserves the falling identity', () => {
    const source = grid('R.....')
    const pair = {
      main: { color: PuyoColor.RED, x: 0, y: 11 },
      sub: { color: PuyoColor.BLUE, x: 1, y: 11 },
      rotation: 1, falling: true,
    }
    const positions = PuyoPairManager.getRotatedPositions(pair)
    expect(positions).toEqual({ main: { x: 0, y: 11 }, sub: { x: 1, y: 11 } })
    const placed = applyPairPlacement(source, pair, { ...positions, mainPos: positions.main, subPos: positions.sub, valid: true })
    const trace = resolveChainsWithTrace(placed, {}, 'split')
    expect(trace.initial.grid[11][1]).toBe(PuyoColor.BLUE)
    expect(trace.initial.ids[11][1]).toBe('split:11:1')
    const fall = trace.stages[0]
    expect(fall.kind).toBe('gravity')
    if (fall.kind !== 'gravity') return
    expect(fall.moves).toEqual([{ id: 'split:11:1', from: { x: 1, y: 11 }, to: { x: 1, y: 12 } }])
    expect(fall.after.grid[12][1]).toBe(PuyoColor.BLUE)
    expect(fall.after.ids[12][1]).toBe('split:11:1')
    expect(fall.after.ids[11][1]).toBe(null)
  })

  it('keeps all stage cells, IDs, origins, and result snapshots independent', () => {
    const source = grid('.B....', 'RR....', 'RRBBB.')
    const origins = source.map(row => row.map(() => null))
    const trace = resolveChainsWithTrace(source, { origins }, 'isolated')
    const snapshots = [trace.initial, ...trace.stages.map(stage => stage.after)]
    for (const snapshot of snapshots) {
      expect(snapshot.grid).toHaveLength(13)
      expect(snapshot.ids).toHaveLength(13)
      for (let y = 0; y < 13; y++) {
        expect(snapshot.grid[y]).toHaveLength(6)
        expect(snapshot.ids[y]).toHaveLength(6)
        for (let x = 0; x < 6; x++) {
          expect(snapshot.ids[y][x] === null).toBe(snapshot.grid[y][x] === null)
        }
      }
      const occupied = snapshot.ids.flat().filter(Boolean)
      expect(new Set(occupied).size).toBe(occupied.length)
    }
    for (let i = 0; i < snapshots.length; i++) for (let j = i + 1; j < snapshots.length; j++) {
      expect(snapshots[i].grid).not.toBe(snapshots[j].grid)
      expect(snapshots[i].ids).not.toBe(snapshots[j].ids)
      expect(snapshots[i].grid[12]).not.toBe(snapshots[j].grid[12])
    }
    expect(trace.result.stableGrid).not.toBe(snapshots[snapshots.length - 1]?.grid)
    expect(trace.result.clearSteps.flatMap(step => step.clearedPuyos).every(puyo => puyo.origin === null)).toBe(true)
    const saved = trace.stages[0].after.grid[12][0]
    source[12][0] = PuyoColor.YELLOW
    trace.initial.grid[12][0] = PuyoColor.BLUE
    expect(trace.stages[0].after.grid[12][0]).toBe(saved)
  })
})
