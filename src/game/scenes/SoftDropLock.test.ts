import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({ Scene: class {} }))

import GuidedPracticeScene from './GuidedPracticeScene'
import PuyoGame from './PuyoGame'
import { GameFieldManager } from '../core/GameField'
import { PuyoColor, type PuyoPair } from '../core/types'
import { InputController } from '../input/InputController'
import { defaultBindings } from '../input/bindings'

const pair = (y: number): PuyoPair => ({
  main: { color: PuyoColor.RED, x: 2, y },
  sub: { color: PuyoColor.BLUE, x: 2, y: y - 1 },
  rotation: 0, falling: true,
})

// Exercise each scene's real frame/input/falling path; only the transaction start is observed.
const prepare = (Scene: typeof PuyoGame | typeof GuidedPracticeScene, y = 11, gravity = true) => {
  const scene = new Scene() as any
  scene.gameField = new GameFieldManager()
  scene.gameState.currentPair = pair(y)
  if (Scene === GuidedPracticeScene) scene.isGravityEnabled = gravity
  scene.lastFallTime = 0
  scene.actionInput = new InputController(defaultBindings())
  scene.updateDisplay = vi.fn()
  scene.landCurrentPair = vi.fn(() => { scene.chainPlayback = { update: vi.fn() } })
  return scene
}

beforeEach(() => vi.stubGlobal('document', { hidden: false }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe.each([['score', PuyoGame], ['guide', GuidedPracticeScene]] as const)('%s soft drop lock', (mode, Scene) => {
  it.each(Scene === PuyoGame ? [true] : [true, false])('locks in the frame soft drop reaches the floor (gravity=%s)', gravity => {
    const scene = prepare(Scene, 11, gravity)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(100, 16)
    expect(scene.gameState.currentPair.main.y).toBe(12)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
    expect(scene.actionInput.isGated()).toBe(true)
  })

  it('locks on stacked puyos before the next gravity tick', () => {
    const scene = prepare(Scene, 9)
    scene.gameField.placePuyo(2, 11, PuyoColor.GREEN)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(100, 16)
    expect(scene.gameState.currentPair.main.y).toBe(10)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it('locks a pair that is already supported and does not lock twice at a due gravity tick', () => {
    const scene = prepare(Scene, 12)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(800, 16)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it('keeps a short down press even when it is released before the frame', () => {
    const scene = prepare(Scene)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.actionInput.releasePhysical('ArrowDown')
    scene.update(100, 16)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it('locks on natural contact during the gap between held down repeats', () => {
    const scene = prepare(Scene, 10)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(790, 16)
    expect(scene.gameState.currentPair.main.y).toBe(11)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
    scene.update(800, 10)
    expect(scene.gameState.currentPair.main.y).toBe(12)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it('does not lock after down is released before natural contact', () => {
    const scene = prepare(Scene, 10)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(790, 16)
    scene.actionInput.releasePhysical('ArrowDown')
    scene.update(800, 10)
    expect(scene.gameState.currentPair.main.y).toBe(12)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
    scene.update(1600, 800)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it('retains the normal landing interval without down input', () => {
    const scene = prepare(Scene)
    scene.update(800, 16)
    expect(scene.gameState.currentPair.main.y).toBe(12)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
    scene.update(1599, 16)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
    scene.update(1600, 16)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it(mode === 'score' ? 'always locks a supported pair at the natural fall tick' : 'does not lock a supported pair without down while guide gravity is disabled', () => {
    const scene = prepare(Scene, 12, false)
    scene.update(799, 16)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
    scene.update(800, 16)
    if (Scene === PuyoGame) expect(scene.landCurrentPair).toHaveBeenCalledOnce()
    else expect(scene.landCurrentPair).not.toHaveBeenCalled()
  })

  it('moves only one cell when soft drop has not reached support', () => {
    const scene = prepare(Scene, 5, false)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(100, 16)
    expect(scene.gameState.currentPair.main.y).toBe(6)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
  })

  it('checks support after the existing same-frame rotation order', () => {
    const scene = prepare(Scene)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.actionInput.pressPhysical('KeyX')
    scene.update(100, 16)
    expect(scene.gameState.currentPair.rotation).toBe(1)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })

  it('requires release and another press before down can affect the next pair', () => {
    const scene = prepare(Scene, 11, false)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(100, 16)
    scene.chainPlayback = undefined
    scene.gameState.currentPair = pair(1)
    scene.actionInput.pressPhysical('ArrowDown', true)
    scene.update(500, 16)
    expect(scene.gameState.currentPair.main.y).toBe(1)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
    scene.actionInput.releasePhysical('ArrowDown')
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(600, 16)
    expect(scene.gameState.currentPair.main.y).toBe(2)
  })

  it.each(['pause', 'chain', 'result'] as const)('does not place during %s', state => {
    const scene = prepare(Scene, 12)
    if (state === 'pause') scene.isPaused = true
    if (state === 'result') scene.isShowingResult = true
    if (state === 'chain') scene.chainPlayback = { update: vi.fn() }
    scene.actionInput.pressPhysical('ArrowDown')
    scene.update(100, 16)
    expect(scene.landCurrentPair).not.toHaveBeenCalled()
  })

  it('keeps quick drop immediately locking without waiting for gravity', () => {
    const scene = prepare(Scene, 1, false)
    scene.actionInput.pressPhysical('ArrowUp')
    scene.update(100, 16)
    expect(scene.gameState.currentPair.main.y).toBe(12)
    expect(scene.landCurrentPair).toHaveBeenCalledOnce()
  })
})
