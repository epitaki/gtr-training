import { describe, expect, it } from 'vitest'
import { PuyoPairManager, PuyoPairRandom } from './PuyoPair'

describe('PuyoPairRandom', () => {
  it('restores the same future pair from a saved state', () => {
    const random = new PuyoPairRandom(12345)
    PuyoPairManager.createRandomPair(random.next)
    const savedState = random.getState()
    const expected = PuyoPairManager.createRandomPair(random.next)

    random.setState(savedState)
    const replayed = PuyoPairManager.createRandomPair(random.next)

    expect(replayed).toEqual(expected)
  })

  it('rejects invalid saved states', () => {
    const random = new PuyoPairRandom(1)
    expect(() => random.setState(-1)).toThrow('invalid puyo pair random state')
    expect(() => random.setState(0x100000000)).toThrow('invalid puyo pair random state')
  })
})
