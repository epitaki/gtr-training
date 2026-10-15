import { describe, expect, it } from 'vitest'
import { FIVE_CHAIN_SKELETONS } from './FiveChainSkeletons'
import { PlacementAdvisor } from './PlacementAdvisor'
import { TailPlanner } from './TailPlanner'
import { TAIL_CONSTRUCTION_COST } from './TailPreference'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'

const palette = [PuyoColor.RED, PuyoColor.YELLOW, PuyoColor.BLUE, PuyoColor.GREEN]

describe('physically verified alternatives to a fixed right-side staircase', () => {
  it('preserves the teaching preference and all three original skeletons', () => {
    expect(TAIL_CONSTRUCTION_COST.Y).toBeLessThan(TAIL_CONSTRUCTION_COST.zabuton)
    expect(TAIL_CONSTRUCTION_COST.zabuton).toBeLessThan(TAIL_CONSTRUCTION_COST.L)
    expect(TAIL_CONSTRUCTION_COST.L).toBeLessThan(100)
    expect(FIVE_CHAIN_SKELETONS.slice(0, 3)).toEqual([
      ['..DE..', 'ABCDE.', 'AABCCE', 'BBCDDE'],
      ['..DE..', 'ABCDE.', 'AABCDE', 'BBCCDE'],
      ['..E...', '..D...', 'ABCEE.', 'AABCCC', 'BBDDDE'],
    ])
    expect(new Set(FIVE_CHAIN_SKELETONS.map(rows => rows.join('/'))).size).toBe(FIVE_CHAIN_SKELETONS.length)
  })

  for (const [index, rows] of FIVE_CHAIN_SKELETONS.entries()) {
    it.each([0, 1, 2, 3])(`skeleton ${index}: stable, connected, and actually fires five (colors +%i)`, shift => {
      const color = (i: number) => palette[(i + shift) % palette.length]
      const mapping: Record<string, PuyoColor> = { A: color(0), B: color(1), C: color(2), D: color(3), E: color(0) }
      const grid: PuyoGrid = [
        ...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
        ...rows.map(row => [...row].map(c => mapping[c] ?? null)),
      ]
      expect(rows.every(row => row.length === 6)).toBe(true)
      expect(grid.flat().filter(Boolean)).toHaveLength(19)
      for (let x = 0; x < 6; x++) {
        let occupied = false
        for (let y = 0; y < 13; y++) {
          if (grid[y][x] !== null) occupied = true
          else expect(occupied, `hole in column ${x}`).toBe(false)
        }
      }
      expect(resolveChains(grid).chainCount).toBe(0)
      const tail = TailPlanner.getPlans(grid, mapping.B).find(plan => plan.templateFilled)
      expect(tail).toBeDefined()
      if (index >= 3) expect(grid.filter(row => row[5] !== null).length).toBeGreaterThanOrEqual(3)
      const pair: PuyoPair = {
        main: { color: mapping.A, x: 2, y: 1 }, sub: { color: mapping.B, x: 2, y: 0 }, rotation: 0, falling: true,
      }
      const training = { colorA: mapping.A, colorB: mapping.B, colorC: mapping.A, colorD: mapping.B }
      const snapshot = JSON.stringify(grid)
      const advice = PlacementAdvisor.getAdvice({ grid, width: 6, height: 13 }, pair, undefined, undefined, training)
      expect(advice.bestPlacement).toMatchObject({ isIntendedMainFire: true, intendedMainChainCount: 5 })
      expect(simulateTurn(grid, pair, advice.bestPlacement!.placement).chainCount).toBe(5)
      expect(JSON.stringify(grid)).toBe(snapshot)
    })
  }
})
