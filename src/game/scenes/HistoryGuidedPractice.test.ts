import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({ Scene: class {} }))
import GuidedPracticeScene from './GuidedPracticeScene'
import { PuyoColor as C } from '../core/types'
import { PuyoPairManager, PuyoPairRandom } from '../core/PuyoPair'
import { type PairColors } from '../core/PairSequence'
import { resolveChains } from '../core/ChainSimulator'
import { createGTRReplayUrl } from '../feedback/GTRIssueReport'

const sequence: readonly PairColors[] = [[C.RED, C.BLUE], [C.GREEN, C.YELLOW], [C.BLUE, C.YELLOW], [C.RED, C.GREEN], [C.YELLOW, C.BLUE]]
const colors = (pair: any) => [pair.main.color, pair.sub.color]
const queue = (scene: any) => [scene.gameState.currentPair, scene.gameState.nextPair, scene.gameState.nextNextPair].map(colors)
beforeEach(() => {
  vi.stubGlobal('document', { hidden: false })
  vi.stubGlobal('window', { location: { hash: '', href: 'http://localhost/' }, history: { replaceState: vi.fn() }, dispatchEvent: vi.fn() })
  vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: unknown) {} })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function harness(pairs: readonly PairColors[] = sequence) {
  const scene = new GuidedPracticeScene(pairs) as any
  scene.time = { now: 500, paused: false }
  scene.tweens = { timeScale: 1 }
  scene.input = { keyboard: { enabled: true, manager: { preventDefault: true } } }
  for (const method of ['rebuildFieldSprites', 'updateDisplay', 'updateAdvice', 'updateGuide', 'updateGuideState',
    'suppressHeldInputUntilRelease', 'clearGhostSprites', 'clearAllSprites', 'playScorePopup']) scene[method] = vi.fn()
  scene.gameHistory.saveState(scene.gameState)
  scene.captureTurnStart()
  return scene
}
function commit(scene: any) {
  const pair = structuredClone(scene.gameState.currentPair)
  // An already resolved stable board exercises the real turn commit and queue without rendering.
  scene.pendingPlacement = { pair, mainPos: pair.main, subPos: pair.sub }
  scene.commitChain(scene.chainRun, resolveChains(scene.gameField.getField().grid))
}

it('starts empty and keeps current/NEXT/NEXT2 through the exact recorded/random boundary', () => {
  const scene = harness()
  expect(scene.gameState.field.grid.flat().every((cell: unknown) => cell === null)).toBe(true)
  expect(queue(scene)).toEqual(sequence.slice(0, 3))
  const random = new PuyoPairRandom(scene.pairRandom.getState())
  const randomPairs = Array.from({ length: 6 }, () => colors(PuyoPairManager.createRandomPair(random.next)))
  const expected = [...sequence, ...randomPairs]
  for (let turn = 1; turn <= sequence.length + 1; turn++) {
    commit(scene)
    expect(queue(scene)).toEqual(expected.slice(turn, turn + 3))
    expect(scene.turnHistory[scene.turnHistory.length - 1].turn).toBe(turn)
  }
})

it.each([1, 2])('uses the normal random source to fill previews after a short %i-pair record', count => {
  const create = vi.spyOn(PuyoPairManager, 'createRandomPair')
  const scene = harness(sequence.slice(0, count))
  expect(queue(scene).slice(0, count)).toEqual(sequence.slice(0, count))
  expect(create).toHaveBeenCalledTimes(3 - count)
  commit(scene)
  expect(create).toHaveBeenCalledTimes(4 - count)
})

it.each([1, 3, 5])('rewinds and repeats the same queue and random state at turn %i', turn => {
  const scene = harness()
  for (let i = 0; i < turn; i++) commit(scene)
  const after = structuredClone({ state: scene.gameState, turns: scene.turnHistory, random: scene.pairRandom.getState() })
  scene.rewind()
  commit(scene)
  expect({ state: scene.gameState, turns: scene.turnHistory, random: scene.pairRandom.getState() }).toEqual(after)
})

it('restores a cancelled turn without consuming a recorded pair and resets to normal generation for a new game', () => {
  const scene = harness()
  const before = structuredClone({ state: scene.gameState, random: scene.pairRandom.getState() })
  scene.gameState.currentPair.main.x = 4
  scene.restoreTurnStart()
  expect({ state: scene.gameState, random: scene.pairRandom.getState() }).toEqual(before)
  const normalOpening = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
  scene.resetGame()
  expect(scene.practiceSequence).toBeUndefined()
  expect(normalOpening).toHaveBeenCalledOnce()
})

it('preserves the remaining recorded pairs when a report URL is reopened', () => {
  const scene = harness()
  commit(scene)
  scene.openIssueReport()
  const report = (window as any).__GTR_ISSUE_SNAPSHOT__
  expect(report.practiceSequence).toEqual(sequence)
  const url = new URL(createGTRReplayUrl(report))
  Object.assign(window.location, { href: url.href, hash: url.hash })
  const restored = new GuidedPracticeScene() as any
  expect(restored.practiceSequence).toEqual(sequence)
  expect(restored.isReplayInspection).toBe(true)
  expect(queue(restored)).toEqual(queue(scene))
  expect(colors(restored.createPracticePair(3))).toEqual(sequence[3])
})

it('uses absolute turn numbers after the capped move history has dropped old turns', () => {
  const long = Array.from({ length: 110 }, (_, index) => sequence[index % sequence.length])
  const scene = harness(long)
  for (let i = 0; i < 102; i++) commit(scene)
  expect(scene.turnHistory).toHaveLength(100)
  expect(queue(scene)).toEqual(long.slice(102, 105))
  scene.rewind()
  commit(scene)
  expect(queue(scene)).toEqual(long.slice(102, 105))
})
