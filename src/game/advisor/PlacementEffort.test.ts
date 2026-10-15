import { describe, expect, it } from 'vitest'
import { splitDropCost } from './PlacementEffort'

describe('split drop preference', () => {
  it('does not penalize vertical pairs, level horizontal pairs or invalid landings', () => {
    expect(splitDropCost(null)).toBe(0)
    expect(splitDropCost({ valid: true, mainPos: { x: 2, y: 12 }, subPos: { x: 2, y: 11 } })).toBe(0)
    expect(splitDropCost({ valid: true, mainPos: { x: 2, y: 12 }, subPos: { x: 3, y: 12 } })).toBe(0)
    expect(splitDropCost({ valid: false, mainPos: { x: 2, y: 12 }, subPos: { x: 3, y: 11 } })).toBe(0)
  })
  it('is symmetric and capped, preserving the value of a useful template cell', () => {
    for (const difference of [1, 2, 3, 6, 12]) {
      const mainPos = { x: 2, y: 12 }, subPos = { x: 3, y: 12 - difference }
      const cost = splitDropCost({ valid: true, mainPos, subPos })
      expect(cost).toBe(Math.min(3, difference) * 8)
      expect(splitDropCost({ valid: true, mainPos: subPos, subPos: mainPos })).toBe(cost)
      expect(cost).toBeLessThan(100)
    }
  })
})
