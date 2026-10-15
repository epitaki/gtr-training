import { describe, expect, it } from 'vitest'
import { LOW_FIVE_CHAIN_SKELETONS } from './LowFiveChainSkeletons'
import { FIVE_CHAIN_SKELETONS } from './FiveChainSkeletons'
import { resolveChains, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'
import { TailPlanner } from './TailPlanner'

describe('low five-chain construction alternatives', () => {
  it('adds unique compact nineteen-cell candidates without replacing existing shapes', () => {
    const originals = new Set(FIVE_CHAIN_SKELETONS.map(rows => rows.join('/')))
    expect(new Set(LOW_FIVE_CHAIN_SKELETONS.map(rows => rows.join('/'))).size).toBe(LOW_FIVE_CHAIN_SKELETONS.length)
    for (const rows of LOW_FIVE_CHAIN_SKELETONS) {
      expect(originals.has(rows.join('/'))).toBe(false)
      expect(rows).toHaveLength(4)
      expect(rows.join('').replace(/\./g, '')).toHaveLength(19)
      expect(rows[0].replace(/\./g, '')).toHaveLength(1)
      expect(rows.slice(1).every(row => row.length === 6 && !row.includes('.'))).toBe(true)
      expect(rows[0].slice(0,2)).toBe('..') // the left firing entrance stays free
    }
  })

  it.each(LOW_FIVE_CHAIN_SKELETONS.map(rows => ({ rows, id: rows.join('/') })))('has a physically valid four-color interpretation: $id', ({ rows }) => {
    let valid = 0
    for (const C of Object.values(PuyoColor)) for (const D of Object.values(PuyoColor)) for (const E of Object.values(PuyoColor)) {
      const mapping: Record<string,PuyoColor> = { A:PuyoColor.RED, B:PuyoColor.BLUE, C,D,E }
      const grid: PuyoGrid = [...Array.from({length:9},()=>Array(6).fill(null)), ...rows.map(row=>[...row].map(c=>mapping[c]??null))]
      if (resolveChains(grid).chainCount || !TailPlanner.getPlans(grid,PuyoColor.BLUE).some(p=>p.templateFilled)) continue
      grid[9][0] = PuyoColor.RED
      const fire=resolveChains(grid)
      if (fire.chainCount === 5 && fire.allClear) valid++
    }
    expect(valid).toBeGreaterThan(0)
  })
})
