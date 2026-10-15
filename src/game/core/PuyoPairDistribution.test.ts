import { describe, expect, it, vi } from 'vitest'
import { PuyoPairManager } from './PuyoPair'

describe('independent four-color supply', () => {
  it('allows all sixteen ordered color pairs, including four doubles, with two independent draws', () => {
    const draws = [0.125, 0.375, 0.625, 0.875]
    const observed = new Set<string>()
    let doubles = 0
    for (const main of draws) for (const sub of draws) {
      const random = vi.fn().mockReturnValueOnce(main).mockReturnValueOnce(sub)
      const pair = PuyoPairManager.createRandomPair(random)
      observed.add(`${pair.main.color}/${pair.sub.color}`)
      doubles += Number(pair.main.color === pair.sub.color)
      expect(random).toHaveBeenCalledTimes(2)
      expect(pair).toMatchObject({ main: { x: 2, y: 1 }, sub: { x: 2, y: 0 }, rotation: 0, falling: true })
    }
    expect(observed.size).toBe(16)
    expect(doubles).toBe(4)
  })
})
