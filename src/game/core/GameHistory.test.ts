import { describe, expect, it } from 'vitest'
import { GameHistory } from './GameHistory'
import { PuyoPairManager, PuyoPairRandom } from './PuyoPair'
import { type GameState } from './types'

const stateWithRandom = (random: PuyoPairRandom): GameState => ({
  field: {
    width: 6,
    height: 13,
    grid: Array.from({ length: 13 }, () => Array(6).fill(null)),
  },
  currentPair: PuyoPairManager.createRandomPair(random.next),
  nextPair: PuyoPairManager.createRandomPair(random.next),
  nextNextPair: PuyoPairManager.createRandomPair(random.next),
  score: 0,
  gtrCount: 0,
  gtrScore: 0,
  gameOver: false,
  pairRandomState: random.getState(),
})

describe('GameHistory', () => {
  it('restores the pair random state with the visible queue', () => {
    const history = new GameHistory()
    const random = new PuyoPairRandom(2468)
    const first = stateWithRandom(random)
    history.saveState(first)
    const expectedNextPair = PuyoPairManager.createRandomPair(random.next)
    history.saveState(stateWithRandom(random))

    const previous = history.rewind()
    expect(previous?.pairRandomState).toBe(first.pairRandomState)

    random.setState(previous!.pairRandomState!)
    expect(PuyoPairManager.createRandomPair(random.next)).toEqual(expectedNextPair)
  })

  it('exports an isolated copy of the state before the current turn', () => {
    const history = new GameHistory()
    const random = new PuyoPairRandom(8642)
    const first = stateWithRandom(random)
    const second = stateWithRandom(random)
    history.saveState(first)
    history.saveState(second)

    const previous = history.getPreviousState()
    expect(previous?.currentPair).toEqual(first.currentPair)
    expect(previous?.pairRandomState).toBe(first.pairRandomState)

    previous!.field.grid[12][0] = 'red' as never
    previous!.currentPair!.main.x = 0
    expect(history.rewind()?.field.grid[12][0]).toBeNull()
    expect(history.rewind()).toBeNull()
  })
})
