import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InputController } from '../input/InputController'
import { PhaserInputAdapter } from '../input/PhaserInputAdapter'
import { defaultBindings } from '../input/bindings'

const { justDown } = vi.hoisted(() => ({ justDown: vi.fn((_key?: unknown) => false) }))
vi.mock('phaser', () => ({
  Scene: class {},
  Input: { Keyboard: { JustDown: justDown,
    KeyCodes: { Z: 90, X: 88, SPACE: 32, ESC: 27, P: 80, UP: 38, F: 70, G: 71, R: 82 },
  } },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
}))

import GuidedPracticeScene from './GuidedPracticeScene'
import PuyoGame from './PuyoGame'
import { PuyoPairManager, PuyoPairRandom } from '../core/PuyoPair'
import { applyPairPlacement, resolveChains } from '../core/ChainSimulator'
import { PuyoColor, type Field, type PuyoPair } from '../core/types'
import { GTRDetector } from '../gtr/GTRPatterns'
import { ContinuousAdvisor } from '../advisor/ContinuousAdvisor'
import { GTR_REPORT_READY_EVENT, GTR_REPORT_UNAVAILABLE_EVENT } from '../feedback/GTRIssueReport'
import { GTR_CHAIN_RESOLUTION_ENDED_EVENT } from '../feedback/GTRIssueReport'
import { replayPlacements } from '../scoreAttack/placementHistory'

const pair = (x: number, y: number): PuyoPair => ({
  main: { color: PuyoColor.RED, x, y },
  sub: { color: PuyoColor.BLUE, x, y: y - 1 },
  rotation: 0, falling: true,
})
const field = (threeReds = false): Field => {
  const grid = Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null))
  if (threeReds) for (let x = 0; x < 3; x++) grid[12][x] = PuyoColor.RED
  return { width: 6, height: 13, grid }
}
const sprite = (x = 0, y = 0) => ({
  x, y, alpha: 1, setDisplaySize: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
  setFrame: vi.fn().mockReturnThis(),
  setAlpha: vi.fn(function (this: { alpha: number }, value: number) { this.alpha = value; return this }),
  setVisible: vi.fn().mockReturnThis(),
  setPosition: vi.fn(function (this: { x: number; y: number }, px: number, py: number) { this.x = px; this.y = py; return this }),
  destroy: vi.fn(),
})
const display = () => ({
  setOrigin() { return this }, setDepth() { return this }, setStrokeStyle() { return this },
  setInteractive() { return this }, on: vi.fn(),
  setAlpha() { return this }, setDisplaySize() { return this }, setText() { return this }, destroy: vi.fn(),
})

const prepare = (scene: any, threeReds = false) => {
  scene.gameField.setField(field(threeReds))
  scene.gameState.field = scene.gameField.getField()
  scene.gameState.currentPair = pair(2, 1)
  scene.gameState.nextPair = pair(2, 1)
  scene.gameState.nextNextPair = pair(2, 1)
  scene.time = { now: 500 }
  scene.tweens = { add: vi.fn(), killTweensOf: vi.fn() }
  scene.add = { sprite: vi.fn(sprite), text: vi.fn(() => ({
    setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), setText: vi.fn(), destroy: vi.fn(),
  })) }
  scene.rebuildFieldSprites = vi.fn()
  scene.updateDisplay = vi.fn()
  scene.playScorePopup = vi.fn()
  scene.showGameOver = vi.fn()
  scene.exitToMenu = vi.fn()
  scene.actionInput = new InputController(defaultBindings())
  scene.escKey = { reset: vi.fn() }
  scene.upKey = { reset: vi.fn() }
  scene.pKey = { reset: vi.fn() }
  scene.rKey = { reset: vi.fn() }
  scene.heldGameKeyCodes = new Set()
  scene.captureTurnStart?.()
  scene.captureTurnStartPair?.()
  scene.gameState.currentPair = pair(0, 11)
  return scene
}

// Input-focused tests hold the clock for score attack, whose natural fall is always on.
const setNaturalFall = (scene: any, enabled: boolean) => {
  if (scene instanceof PuyoGame) Object.assign(scene, { FALL_SPEED: enabled ? 800 : Number.POSITIVE_INFINITY })
  else scene.isGravityEnabled = enabled
}

beforeEach(() => {
  justDown.mockReset().mockReturnValue(false)
  vi.stubGlobal('document', { hidden: false })
  vi.stubGlobal('window', { location: { hash: '', href: 'http://localhost/' }, dispatchEvent: vi.fn() })
  vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: unknown) {} })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const finish = (scene: any) => {
  for (let i = 0; i < 200 && scene.chainPlayback; i++) scene.update(500 + i * 50, 50)
  expect(scene.chainPlayback).toBeUndefined()
}

describe('pixel display use in both scenes', () => {
  it.each([GuidedPracticeScene, PuyoGame])('updates stable connection frames when only a neighbour changes', Scene => {
    const scene = prepare(new Scene() as any)
    scene.initializeSprites()
    const board = field()
    board.grid[12][0] = PuyoColor.RED
    scene.gameField.setField(board)
    scene.updateFieldSprites()
    const left = scene.fieldSprites[12][0]
    expect(scene.add.sprite).toHaveBeenCalledWith(scene.FIELD_X + 24, scene.FIELD_Y + 12 * 48 + 24,
      'puyo-pixel-atlas', 'red/connect/0')
    board.grid[12][1] = PuyoColor.RED
    scene.gameField.setField(board)
    scene.updateFieldSprites()
    expect(left.setFrame).toHaveBeenCalledWith('red/connect/2')
    expect(scene.fieldSprites[12][1].setDisplaySize).toHaveBeenCalledWith(48, 48)
  })

  it.each([GuidedPracticeScene, PuyoGame])('shows both queued pairs at board size, in order, without mutating the queue', Scene => {
    const scene = prepare(new Scene() as any)
    const before = structuredClone(scene.gameState)
    scene.updateNextPairSprites()
    const calls = scene.add.sprite.mock.calls.slice(-4)
    expect(calls.map((call: unknown[]) => call.slice(2))).toEqual([
      ['puyo-pixel-atlas', 'blue/idle'], ['puyo-pixel-atlas', 'red/idle'],
      ['puyo-pixel-atlas', 'blue/idle'], ['puyo-pixel-atlas', 'red/idle'],
    ])
    const sprites = [scene.nextPairSprites.sub, scene.nextPairSprites.main, scene.nextNextPairSprites.sub, scene.nextNextPairSprites.main]
    sprites.forEach(sprite => expect(sprite.setDisplaySize).toHaveBeenCalledWith(48, 48))
    expect(calls[0][0]).toBe(calls[1][0])
    expect(calls[2][0]).toBe(calls[3][0])
    expect(calls[1][1] - calls[0][1]).toBe(48)
    expect(calls[3][1] - calls[2][1]).toBe(48)
    expect(calls[2][0]).toBeGreaterThan(calls[0][0])
    expect(calls[2][1] - calls[1][1]).toBeGreaterThan(48)
    expect(scene.gameState).toEqual(before)
    scene.gameState.nextPair.sub.color = PuyoColor.YELLOW
    scene.gameState.nextNextPair.main.color = PuyoColor.GREEN
    scene.updateNextPairSprites()
    sprites.forEach(sprite => expect(sprite.destroy).toHaveBeenCalledOnce())
    expect(scene.add.sprite.mock.calls.slice(-4).map((call: unknown[]) => call[3])).toEqual([
      'yellow/idle', 'red/idle', 'blue/idle', 'green/idle',
    ])
  })
})

const preparedActionScene = () => {
  const scene = prepare(new GuidedPracticeScene() as any, true)
  scene.add = { ...scene.add, rectangle: vi.fn(display), circle: vi.fn(display), text: vi.fn(display) }
  scene.actionInput = new InputController(defaultBindings())
  scene.clearGhostSprites = vi.fn()
  scene.updateGuideState = vi.fn()
  scene.updateAdvice = vi.fn()
  scene.updateGuide = vi.fn()
  scene.landCurrentPair()
  return scene
}

describe('guided chain transaction', () => {
  it.each(['emphasis', 'fade', 'gravity', 'land'])('toggles a %s chain phase on a short pause key press', phase => {
    const scene = preparedActionScene()
    const frame = vi.spyOn(scene.chainRenderer, 'frame')
    const lastPhase = () => (frame.mock.lastCall?.[0] as { phase?: string } | undefined)?.phase
    for (let i = 0; i < 40 && lastPhase() !== phase; i++) scene.update(500 + i * 50, 50)
    expect(lastPhase()).toBe(phase)
    const priorFrames = frame.mock.calls.length
    const priorScore = scene.gameState.score
    const priorHistory = scene.turnHistory.length
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.releasePhysical('Escape')
    scene.update(3000, 50)
    expect(scene.chainPlayback.isPaused).toBe(true)
    expect(frame).toHaveBeenCalledTimes(priorFrames)
    expect(scene.gameState.score).toBe(priorScore)
    expect(scene.turnHistory).toHaveLength(priorHistory)
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.releasePhysical('Escape')
    scene.update(3050, 50)
    expect(scene.chainPlayback.isPaused).toBe(false)
    scene.update(3100, 50)
    expect(frame.mock.calls.length).toBeGreaterThan(priorFrames)
  })

  it('toggles once for key repeat and does not queue a held pause key after state change', () => {
    const scene = preparedActionScene()
    const toggle = vi.spyOn(scene, 'togglePause')
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.pressPhysical('Escape', true)
    scene.update(500, 16)
    expect(toggle).toHaveBeenCalledOnce()
    scene.actionInput.pressPhysical('Escape', true)
    scene.update(550, 16)
    expect(toggle).toHaveBeenCalledOnce()
    scene.actionInput.releasePhysical('Escape')
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.releasePhysical('Escape')
    scene.update(600, 16)
    expect(toggle).toHaveBeenCalledTimes(2)
  })

  it('keeps hidden and user pause independent while playback continues after release', () => {
    const scene = preparedActionScene()
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.releasePhysical('Escape')
    scene.update(500, 16)
    expect(scene.chainPlayback.isPaused).toBe(true)
    ;(document as unknown as { hidden: boolean }).hidden = true
    scene.handleVisibilityChange()
    scene.update(550, 50)
    expect(scene.chainPlayback.isPaused).toBe(true)
    ;(document as unknown as { hidden: boolean }).hidden = false
    scene.handleVisibilityChange()
    scene.update(600, 50)
    expect(scene.chainPlayback.isPaused).toBe(true)
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.releasePhysical('Escape')
    scene.update(650, 50)
    expect(scene.chainPlayback.isPaused).toBe(false)
    const frame = vi.spyOn(scene.chainRenderer, 'frame')
    scene.actionInput.pressPhysical('ArrowDown')
    scene.actionInput.suppressUntilRelease()
    scene.update(700, 50)
    expect(scene.actionInput.isGated()).toBe(true)
    expect(frame).toHaveBeenCalled()
  })

  it('removes DOM input and report listeners once across shutdown and destroy', () => {
    const scene = new GuidedPracticeScene() as any
    const handlers = new Map<string, () => void>()
    const scrollArea = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    scene.scale = { updateBounds: vi.fn() }
    scene.add = { rectangle: vi.fn(display), circle: vi.fn(display), text: vi.fn(display) }
    scene.drawField = vi.fn()
    scene.createGuideDisplay = vi.fn()
    scene.createNextAreas = vi.fn()
    scene.initializeSprites = vi.fn()
    scene.startGame = vi.fn()
    scene.updateGuide = vi.fn()
    scene.getNextAreaLayout = () => ({ baseX: 0, statusY: 0 })
    scene.input = { keyboard: { manager: { preventDefault: true }, enabled: true } }
    scene.game = { canvas: { closest: vi.fn(() => scrollArea), setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), focus: vi.fn() } }
    scene.events = { once: vi.fn((name: string, handler: () => void) => handlers.set(name, handler)) }
    const removeWindow = vi.fn(), removeDocument = vi.fn()
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: removeWindow })
    Object.assign(document, { addEventListener: vi.fn(), removeEventListener: removeDocument,
      activeElement: scene.game.canvas })
    scene.create()
    const updatePointerBounds = scrollArea.addEventListener.mock.calls.find(call => call[0] === 'scroll')![1]
    updatePointerBounds()
    expect(scene.scale.updateBounds).toHaveBeenCalledOnce()
    const cancel = vi.fn(), dispose = vi.fn()
    scene.chainPlayback = { cancel }
    scene.chainRenderer = { dispose }
    handlers.get('shutdown')?.()
    handlers.get('destroy')?.()
    expect(cancel).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(removeWindow).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(removeWindow).toHaveBeenCalledWith('keyup', expect.any(Function), true)
    expect(removeWindow).toHaveBeenCalledWith('blur', scene.handleWindowBlur)
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', scene.handleVisibilityChange)
    expect(scrollArea.removeEventListener).toHaveBeenCalledOnce()
    expect(scrollArea.removeEventListener).toHaveBeenCalledWith('scroll', updatePointerBounds)
  })

  it('cancels reset and exit playbacks without accepting stale completion', () => {
    const scene = prepare(new GuidedPracticeScene() as any, true)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn()
    scene.landCurrentPair()
    const old = scene.chainPlayback
    const sprites = scene.add.sprite.mock.results.map((result: { value: ReturnType<typeof sprite> }) => result.value)
    scene.resetGame()
    old.update(10000)
    expect(scene.turnHistory).toHaveLength(0)
    expect(scene.chainPlayback).toBeUndefined()
    expect(sprites.every((item: ReturnType<typeof sprite>) => item.destroy.mock.calls.length === 1)).toBe(true)
    scene.gameState.currentPair = pair(0, 11)
    scene.landCurrentPair()
    const oldExit = scene.chainPlayback
    const onExit = vi.fn()
    scene.game = { registry: { get: () => onExit } }
    Object.getPrototypeOf(scene).exitToMenu.call(scene)
    oldExit.update(10000)
    expect(onExit).toHaveBeenCalledOnce()
    expect(scene.chainPlayback).toBeUndefined()
  })

  it('matches two synchronous reference turns, queue shifts, history, and saved RNG', () => {
    const scene = prepare(new GuidedPracticeScene() as any, true)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn()
    scene.gameHistory.saveState(scene.gameState)
    const referenceRandom = new PuyoPairRandom(scene.pairRandom.getState())
    let expectedScore = 0
    for (let turn = 0; turn < 2; turn++) {
      const current = scene.gameState.currentPair
      const contact = { ...current,
        main: { ...current.main, x: turn, y: 11 },
        sub: { ...current.sub, x: turn, y: 10 }, rotation: 0 }
      scene.gameState.currentPair = contact
      const next = structuredClone(scene.gameState.nextPair)
      const nextNext = structuredClone(scene.gameState.nextNextPair)
      const source = scene.gameField.getField().grid
      const landing = { mainPos: { x: turn, y: 11 }, subPos: { x: turn, y: 10 }, valid: true }
      const reference = resolveChains(applyPairPlacement(source, contact, landing))
      const supplied = PuyoPairManager.createRandomPair(referenceRandom.next)
      scene.landCurrentPair()
      expect(scene.gameField.getField().grid).toEqual(source)
      finish(scene)
      expectedScore += reference.clearedPuyos * 10
      expect(scene.gameField.getField().grid).toEqual(reference.stableGrid)
      expect(scene.gameState.score).toBe(expectedScore)
      expect(scene.gameState.currentPair).toEqual(next)
      expect(scene.gameState.nextPair).toEqual(nextNext)
      expect(scene.gameState.nextNextPair).toEqual(supplied)
      expect(scene.pairRandom.getState()).toBe(referenceRandom.getState())
      expect(scene.gameState.pairRandomState).toBe(referenceRandom.getState())
      expect(scene.gameHistory.getHistoryLength()).toBe(turn + 2)
      expect(scene.turnHistory.at(-1)).toMatchObject({ turn: turn + 1,
        chainCount: reference.chainCount, clearedPuyos: reference.clearedPuyos,
        placement: { mainPos: landing.mainPos, subPos: landing.subPos } })
    }
  })

  it('rejects F/G/Space during playback, shows guidance, and clears it on cancellation', () => {
    const scene = prepare(new GuidedPracticeScene() as any, true)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn()
    scene.fKey = { reset: vi.fn() }
    scene.gKey = { reset: vi.fn() }
    scene.spaceKey = { reset: vi.fn() }
    const gravity = vi.spyOn(scene, 'toggleGravity')
    const advisor = vi.spyOn(scene, 'toggleAdvisor')
    const evaluate = vi.spyOn(scene, 'evaluateGTR')
    scene.landCurrentPair()
    scene.actionInput.press('gravity', 'test:gravity')
    scene.actionInput.press('guide', 'test:guide')
    scene.actionInput.press('evaluate', 'test:evaluate')
    scene.update(500, 16)
    expect(scene.chainNotice).toBeDefined()
    expect(gravity).not.toHaveBeenCalled()
    expect(advisor).not.toHaveBeenCalled()
    expect(evaluate).not.toHaveBeenCalled()
    const notice = scene.chainNotice
    scene.cancelPendingTurn()
    expect(notice.destroy).toHaveBeenCalled()
    expect(scene.chainNotice).toBeUndefined()
    expect(scene.gameState.currentPair).toEqual(pair(2, 1))
  })

  it('rebuilds advice and ghosts after undo at a shifted replay rotation, while OFF stays hidden', () => {
    const scene = prepare(new GuidedPracticeScene() as any)
    const replayPair = { ...pair(1, 11), rotation: 1, sub: { color: PuyoColor.BLUE, x: 2, y: 11 } }
    scene.gameState.currentPair = replayPair
    scene.captureTurnStart()
    scene.gameHistory.saveState(scene.gameState)
    const random = scene.pairRandom.getState()
    scene.updateGuide = vi.fn()
    const placement = { placement: { column: 4, rotation: 1 }, totalScore: 100,
      landing: { mainPos: { x: 4, y: 12 }, subPos: { x: 5, y: 12 } } }
    const advice = { bestPlacement: placement, allPlacements: [placement] }
    const advisor = vi.spyOn(ContinuousAdvisor, 'getAdvice').mockReturnValue(advice as never)
    scene.updateAdvice()
    const oldGhost = scene.ghostSprites.main
    expect(oldGhost).toBeDefined()
    scene.landCurrentPair()
    expect(oldGhost.destroy).toHaveBeenCalled()
    scene.cancelPendingTurn()
    expect(scene.gameState.currentPair).toEqual(replayPair)
    expect(scene.ghostSprites.main).toBeDefined()
    expect(scene.ghostSprites.main).not.toBe(oldGhost)
    expect(scene.add.sprite).toHaveBeenCalledWith(
      scene.FIELD_X + 4.5 * scene.CELL_SIZE, scene.FIELD_Y + 12.5 * scene.CELL_SIZE, 'puyo-pixel-atlas', 'red/idle')
    expect(advisor).toHaveBeenCalledTimes(2)
    expect(scene.updateGuide).toHaveBeenCalled()
    expect(scene.gameHistory.getHistoryLength()).toBe(1)
    expect(scene.pairRandom.getState()).toBe(random)
    scene.isAdvisorEnabled = false
    scene.restoreTurnStart()
    expect(scene.ghostSprites.main).toBeUndefined()
    expect(scene.currentAdvice).toBeNull()
    scene.isAdvisorEnabled = true
    advisor.mockReturnValue({ bestPlacement: null } as never)
    scene.restoreTurnStart()
    expect(scene.ghostSprites.main).toBeUndefined()
  })

  it('restores an uncommitted turn when a playback frame fails', () => {
    const scene = prepare(new GuidedPracticeScene() as any, true)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn()
    scene.gameHistory.saveState(scene.gameState)
    const beforeField = structuredClone(scene.gameField.getField())
    const beforeRandom = scene.pairRandom.getState()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.landCurrentPair()
    scene.chainRenderer.frame = vi.fn(() => { throw new Error('frame failed') })
    scene.update(500, 16)
    expect(scene.gameField.getField()).toEqual(beforeField)
    expect(scene.gameState.score).toBe(0)
    expect(scene.turnHistory).toHaveLength(0)
    expect(scene.gameHistory.getHistoryLength()).toBe(1)
    expect(scene.pairRandom.getState()).toBe(beforeRandom)
  })

  it('undoes the first pending turn through input without consuming history or RNG', () => {
    const scene = prepare(new GuidedPracticeScene() as any, true)
    scene.time.paused = false
    scene.input = { keyboard: { enabled: true, manager: { preventDefault: true } } }
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateGuide = vi.fn()
    scene.gameHistory.saveState(scene.gameState)
    const beforeRandom = scene.pairRandom.getState()
    const beforeField = structuredClone(scene.gameField.getField())
    scene.landCurrentPair()
    expect(scene.chainPlayback).toBeDefined()
    scene.openIssueReport()
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: GTR_REPORT_UNAVAILABLE_EVENT }))
    expect(window.dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: GTR_REPORT_READY_EVENT }))
    expect(scene.isReportPanelOpen).toBe(false)
    expect(scene.reportSnapshot).toBeUndefined()
    expect(scene.time.paused).toBe(false)
    expect(scene.input.keyboard.enabled).toBe(true)
    expect(scene.input.keyboard.manager.preventDefault).toBe(true)
    expect(window.__GTR_ISSUE_SNAPSHOT__).toBeUndefined()
    expect(scene.gameField.getField()).toEqual(beforeField)
    expect(scene.gameHistory.getHistoryLength()).toBe(1)
    scene.actionInput.press('rewind', 'test:rewind')
    scene.update(516, 16)
    expect(scene.chainPlayback).toBeUndefined()
    expect(scene.gameState.currentPair).toEqual(pair(2, 1))
    expect(scene.gameField.getField()).toEqual(beforeField)
    expect(scene.gameHistory.getHistoryLength()).toBe(1)
    expect(scene.turnHistory).toHaveLength(0)
    expect(scene.pairRandom.getState()).toBe(beforeRandom)
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: GTR_CHAIN_RESOLUTION_ENDED_EVENT }))
  })

  it('preserves a replay pair position when canceling and commits an empty trace once', () => {
    const scene = prepare(new GuidedPracticeScene() as any)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateGuide = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.gameState.currentPair = pair(0, 11)
    scene.captureTurnStart()
    scene.gameHistory.saveState(scene.gameState)
    scene.landCurrentPair()
    scene.cancelPendingTurn()
    expect(scene.gameState.currentPair).toEqual(pair(0, 11))
    scene.landCurrentPair()
    const initialHistory = scene.gameHistory.getHistoryLength()
    for (let i = 0; i < 30 && scene.chainPlayback; i++) scene.update(500, 50)
    expect(scene.gameHistory.getHistoryLength()).toBe(initialHistory + 1)
    expect(scene.turnHistory).toHaveLength(1)
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: GTR_CHAIN_RESOLUTION_ENDED_EVENT }))
    scene.update(500, 100)
    expect(scene.gameHistory.getHistoryLength()).toBe(initialHistory + 1)
    expect(scene.turnHistory).toHaveLength(1)
  })

  it('cancels a later pending turn without popping the committed turn', () => {
    const scene = prepare(new GuidedPracticeScene() as any)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateGuide = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.gameHistory.saveState(scene.gameState)
    scene.landCurrentPair()
    for (let i = 0; i < 30 && scene.chainPlayback; i++) scene.update(500, 50)
    expect(scene.turnHistory).toHaveLength(1)
    scene.update(500, 0) // clear the previous turn's key-release gate
    const committedField = structuredClone(scene.gameField.getField())
    const committedRandom = scene.pairRandom.getState()
    scene.gameState.currentPair = pair(1, 11)
    scene.landCurrentPair()
    expect(scene.chainPlayback).toBeDefined()
    scene.actionInput.press('rewind', 'test:rewind')
    scene.update(516, 50)
    expect(scene.gameHistory.getHistoryLength()).toBe(2)
    expect(scene.turnHistory).toHaveLength(1)
    expect(scene.gameField.getField()).toEqual(committedField)
    expect(scene.gameState.currentPair).toEqual(pair(2, 1))
    expect(scene.pairRandom.getState()).toBe(committedRandom)
  })

  it('commits terminal history despite a guide display failure, then starts a clean game', () => {
    const scene = prepare(new GuidedPracticeScene() as any)
    setNaturalFall(scene, false)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn()
    for (let y = 0; y < 13; y++) scene.gameField.getField().grid[y][2] = y % 2 ? PuyoColor.RED : PuyoColor.BLUE
    scene.captureTurnStart()
    scene.gameHistory.saveState(scene.gameState)
    const beforeRandom = scene.pairRandom.getState()
    scene.updateGuide = vi.fn().mockImplementationOnce(() => { throw new Error('guide display failed') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.landCurrentPair()
    finish(scene)
    expect(scene.gameState.gameOver).toBe(true)
    expect(scene.gameHistory.getHistoryLength()).toBe(2)
    expect(scene.turnHistory).toHaveLength(1)
    expect(scene.gameField.getField().grid[0][2]).not.toBe(null)
    expect(scene.pairRandom.getState()).toBe(beforeRandom)
    expect(scene.showGameOver).not.toHaveBeenCalled()
    scene.actionInput.pressPhysical('ArrowLeft')
    scene.update(10000, 50)
    expect(scene.gameState.gameOver).toBe(false)
    expect(scene.gameField.getField().grid.flat().every((cell: unknown) => cell === null)).toBe(true)
    expect(scene.gameHistory.getHistoryLength()).toBe(1)
    expect(scene.turnHistory).toHaveLength(0)
    expect(scene.guideManager.getGuideContent().comment).toMatch(/最初|同じ色/)
    expect(scene.actionInput.isGated()).toBe(true)
    const newPair = structuredClone(scene.gameState.currentPair)
    scene.update(10001, 16)
    expect(scene.gameState.currentPair).toEqual(newPair)
    scene.actionInput.releasePhysical('ArrowLeft')
    expect(scene.actionInput.isGated()).toBe(false)
  })

  it('does not re-supply after a post-supply guide display error', () => {
    const scene = prepare(new GuidedPracticeScene() as any)
    scene.clearGhostSprites = vi.fn()
    scene.updateGuideState = vi.fn()
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn().mockImplementationOnce(() => { throw new Error('guide display failed') })
    scene.gameHistory.saveState(scene.gameState)
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.landCurrentPair()
    finish(scene)
    expect(scene.turnHistory).toHaveLength(1)
    expect(scene.gameHistory.getHistoryLength()).toBe(2)
    expect(supplier).toHaveBeenCalledTimes(1)
    expect(scene.gameState.pairRandomState).toBe(scene.pairRandom.getState())
    scene.update(10000, 50)
    expect(supplier).toHaveBeenCalledTimes(1)
  })
})

describe('score attack chain transaction', () => {
  it.each([false, true])('resumes gravity from the unpause time after a long pause (grounded: %s)', grounded => {
    const scene = prepare(new PuyoGame() as any)
    scene.add.rectangle = vi.fn(display)
    setNaturalFall(scene, true)
    scene.gameState.currentPair = pair(0, grounded ? 12 : 11)
    const land = vi.spyOn(scene, 'landCurrentPair')
    scene.time.now = 500
    scene.togglePause()
    scene.time.now = 2500
    scene.togglePause()
    const before = structuredClone(scene.gameState.currentPair)
    scene.update(2501, 16)
    expect(scene.gameState.currentPair).toEqual(before)
    expect(land).not.toHaveBeenCalled()
    scene.update(3300, 16)
    if (grounded) expect(land).toHaveBeenCalledOnce()
    else {
      expect(land).not.toHaveBeenCalled()
      expect(scene.gameState.currentPair.main.y).toBe(12)
    }
  })
  it('keeps the hidden chain pause after user resume until visibility returns', () => {
    const scene = prepare(new PuyoGame() as any, true)
    scene.add.rectangle = vi.fn(display)
    scene.landCurrentPair()
    scene.time.now = 500
    scene.togglePause()
    ;(document as unknown as { hidden: boolean }).hidden = true
    scene.handleVisibilityChange()
    scene.time.now = 2500
    scene.togglePause()
    expect(scene.chainPlayback.isPaused).toBe(true)
    ;(document as unknown as { hidden: boolean }).hidden = false
    scene.handleVisibilityChange()
    expect(scene.chainPlayback.isPaused).toBe(false)
    expect(scene.lastFallTime).toBe(2500)
  })
  const prepareScoringGTR = () => {
    const scene = prepare(new PuyoGame() as any)
    const colors: Record<string, PuyoColor> = {
      R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW,
    }
    const rows = ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB']
    const grid = [
      ...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
      ...rows.map(row => [...row].map(cell => colors[cell] ?? null)),
    ]
    for (const y of [6, 7, 8]) grid[y][5] = PuyoColor.BLUE
    scene.gameField.setField({ width: 6, height: 13, grid })
    scene.gameState.field = scene.gameField.getField()
    scene.gameState.currentPair = {
      main: { x: 5, y: 5, color: PuyoColor.BLUE },
      sub: { x: 5, y: 4, color: PuyoColor.YELLOW },
      rotation: 0, falling: true,
    }
    const label = (initial: string) => {
      const text = { value: initial, setText: vi.fn((value: string) => { text.value = value; return text }) }
      return text
    }
    const count = label('GTR: 0回')
    scene.gtrCountText = count
    scene.showGTREffect = vi.fn()
    return { scene, count }
  }

  it('restores the round labels while committing the same GTR score after a popup fails once', () => {
    const { scene, count } = prepareScoringGTR()
    const source = scene.gameField.getField().grid
    const current = scene.gameState.currentPair
    const landing = { mainPos: { x: 5, y: 5 }, subPos: { x: 5, y: 4 }, valid: true }
    const expected = resolveChains(applyPairPlacement(source, current, landing))
    const expectedGTR = GTRDetector.detectGTR(expected.stableGrid)
    expect(expected.chainCount).toBe(1)
    expect(expectedGTR).toMatchObject({ isGTR: true, totalScore: 100, quality: 100 })
    const originalNext = structuredClone(scene.gameState.nextPair)
    const originalNextNext = structuredClone(scene.gameState.nextNextPair)
    const detect = vi.spyOn(GTRDetector, 'detectGTR')
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.playScorePopup = vi.fn().mockImplementationOnce(() => { throw new Error('popup failed') })
    scene.landCurrentPair()
    finish(scene)

    expect(scene.gameField.getField().grid).toEqual(expected.stableGrid)
    expect(scene.gameState.currentPair).toEqual(originalNext)
    expect(scene.gameState.nextPair).toEqual(originalNextNext)
    expect(scene.gameState.nextNextPair).toEqual(supplier.mock.results[0].value)
    expect(scene.gameState.score).toBe(expected.clearedPuyos * 10 + 1000)
    expect(scene.gameState.gtrCount).toBe(1)
    expect(scene.gameState.gtrScore).toBe(100)
    expect(count.value).toBe('GTR: 1 / 10')
    expect(detect).toHaveBeenCalledTimes(1)
    expect(supplier).toHaveBeenCalledTimes(1)
    expect(scene.showGTREffect).not.toHaveBeenCalled()
    scene.update(10000, 50)
    expect(detect).toHaveBeenCalledTimes(1)
    expect(supplier).toHaveBeenCalledTimes(1)
    expect(scene.isVisualStopped).toBe(false)
  })

  it('stops normal input without re-scoring or re-supplying if GTR label recovery also fails', () => {
    const { scene, count } = prepareScoringGTR()
    const detect = vi.spyOn(GTRDetector, 'detectGTR')
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.playScorePopup = vi.fn().mockImplementationOnce(() => { throw new Error('popup failed') })
    count.setText.mockImplementation(() => { throw new Error('GTR label failed') })
    scene.landCurrentPair()
    finish(scene)
    expect(scene.isVisualStopped).toBe(true)
    expect(scene.gameState.gtrCount).toBe(1)
    expect(scene.gameState.gtrScore).toBe(100)
    const committedScore = scene.gameState.score
    const committedField = structuredClone(scene.gameField.getField())
    const committedPair = structuredClone(scene.gameState.currentPair)
    expect(scene.canAcceptAction('gravity')).toBe(false)
    const input = vi.spyOn(scene, 'handleInput')
    scene.update(10000, 16) // clear the key-release gate
    scene.actionInput.press('gravity', 'test:gravity')
    scene.update(10100, 16)
    expect(input).not.toHaveBeenCalled()
    expect(scene.gameField.getField()).toEqual(committedField)
    expect(scene.gameState.currentPair).toEqual(committedPair)
    expect(scene.gameState.score).toBe(committedScore)
    expect(detect).toHaveBeenCalledTimes(1)
    expect(supplier).toHaveBeenCalledTimes(1)
  })

  it('restores the stable turn without scoring or supply when a frame fails', () => {
    const scene = prepare(new PuyoGame() as any, true)
    const before = structuredClone(scene.gameField.getField())
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.landCurrentPair()
    scene.chainRenderer.frame = vi.fn(() => { throw new Error('frame failed') })
    scene.update(500, 16)
    expect(scene.chainPlayback).toBeUndefined()
    expect(scene.gameField.getField()).toEqual(before)
    expect(scene.gameState.score).toBe(0)
    expect(scene.gameState.currentPair).toEqual(pair(2, 1))
    expect(supplier).not.toHaveBeenCalled()
  })

  it('cleans up owned playback and DOM listeners once across shutdown and destroy', () => {
    const scene = new PuyoGame() as any
    const handlers = new Map<string, () => void>()
    scene.add = { rectangle: vi.fn(display), circle: vi.fn(display), text: vi.fn(display) }
    scene.add.graphics = vi.fn(() => ({ setDepth: vi.fn().mockReturnThis(), lineStyle: vi.fn(), lineBetween: vi.fn() }))
    scene.drawGrid = vi.fn()
    scene.createNextAreas = vi.fn()
    scene.initializeSprites = vi.fn()
    scene.startGame = vi.fn()
    scene.input = { keyboard: { manager: { preventDefault: true }, enabled: true } }
    scene.game = { canvas: { setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), focus: vi.fn() } }
    scene.events = { once: vi.fn((name: string, handler: () => void) => handlers.set(name, handler)) }
    const removeWindow = vi.fn(), removeDocument = vi.fn()
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: removeWindow })
    Object.assign(document, { addEventListener: vi.fn(), removeEventListener: removeDocument,
      activeElement: scene.game.canvas })
    scene.create()
    const cancel = vi.fn(), dispose = vi.fn()
    scene.chainPlayback = { cancel }
    scene.chainRenderer = { dispose }
    handlers.get('shutdown')?.()
    handlers.get('destroy')?.()
    expect(cancel).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(removeWindow).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(removeWindow).toHaveBeenCalledWith('keyup', expect.any(Function), true)
    expect(removeWindow).toHaveBeenCalledWith('blur', scene.handleWindowBlur)
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', scene.handleVisibilityChange)
  })

  it('matches two synchronous reference turns and keeps score supplier ordering', () => {
    const scene = prepare(new PuyoGame() as any, true)
    const events: string[] = []
    const detectOriginal = GTRDetector.detectGTR
    vi.spyOn(GTRDetector, 'detectGTR').mockImplementation(grid => {
      events.push('gtr')
      return detectOriginal.call(GTRDetector, grid)
    })
    const supplierOriginal = PuyoPairManager.createRandomPair
    const supplied = vi.spyOn(PuyoPairManager, 'createRandomPair').mockImplementation((random) => {
      events.push('supplier')
      return supplierOriginal.call(PuyoPairManager, random)
    })
    let expectedScore = 0
    for (let turn = 0; turn < 2; turn++) {
      const current = scene.gameState.currentPair
      const contact = { ...current,
        main: { ...current.main, x: turn, y: 11 },
        sub: { ...current.sub, x: turn, y: 10 }, rotation: 0 }
      scene.gameState.currentPair = contact
      const next = structuredClone(scene.gameState.nextPair)
      const nextNext = structuredClone(scene.gameState.nextNextPair)
      const source = scene.gameField.getField().grid
      const landing = { mainPos: { x: turn, y: 11 }, subPos: { x: turn, y: 10 }, valid: true }
      const reference = resolveChains(applyPairPlacement(source, contact, landing))
      const gtrResult = detectOriginal.call(GTRDetector, reference.stableGrid)
      events.length = 0
      scene.landCurrentPair()
      expect(scene.gameField.getField().grid).toEqual(source)
      finish(scene)
      expectedScore += reference.clearedPuyos * 10 + (gtrResult.isGTR ? gtrResult.totalScore * 10 : 0)
      expect(scene.gameField.getField().grid).toEqual(reference.stableGrid)
      expect(scene.gameState.score).toBe(expectedScore)
      expect(scene.gameState.currentPair).toEqual(next)
      expect(scene.gameState.nextPair).toEqual(nextNext)
      expect(supplied).toHaveBeenCalledTimes(turn + 1)
      expect(events).toEqual(['gtr', 'supplier'])
    }
  })

  it.each(['KeyF', 'KeyT'])('ignores gravity toggle %s during and after playback while natural fall continues', code => {
    const scene = prepare(new PuyoGame() as any, true)
    const keys = defaultBindings()
    keys.gravity = [code]
    scene.actionInput.setBindings(keys)
    expect(scene.canAcceptAction('gravity')).toBe(false)
    scene.landCurrentPair()
    scene.actionInput.pressPhysical(code)
    scene.update(500, 16)
    expect(scene.chainNotice).toBeUndefined()
    scene.actionInput.releasePhysical(code)
    finish(scene)
    scene.update(501, 16)
    const y = scene.gameState.currentPair.main.y
    scene.pressAction('gravity', 'button:gravity')
    scene.actionInput.pressPhysical(code)
    scene.update(1300, 16)
    expect(scene.gameState.currentPair.main.y).toBe(y + 1)
    expect(scene.canAcceptAction('gravity')).toBe(false)
    expect(scene.chainNotice).toBeUndefined()
  })

  it('releases a stale key after blur and keeps chain playback moving through input suppression', () => {
    const scene = prepare(new PuyoGame() as any)
    scene.actionInput.pressPhysical('ArrowDown')
    scene.handleWindowBlur()
    expect(scene.actionInput.frame(500)).toEqual(new Set())
    ;(document as unknown as { hidden: boolean }).hidden = true
    scene.handleVisibilityChange()
    ;(document as unknown as { hidden: boolean }).hidden = false
    scene.handleVisibilityChange()
    scene.actionInput.pressPhysical('ArrowDown')
    scene.prepareExternalResume()
    expect(scene.actionInput.frame(516)).toEqual(new Set())
    scene.actionInput.releasePhysical('ArrowDown')
    scene.actionInput.pressPhysical('ArrowDown')
    expect(scene.actionInput.frame(532)).toEqual(new Set(['softDrop']))
    const playback = { update: vi.fn() }
    scene.chainPlayback = playback
    scene.actionInput.suppressUntilRelease()
    scene.update(548, 16)
    expect(playback.update).toHaveBeenCalledWith(16)
  })

  it('keeps a committed score turn and supplies once when its popup fails', () => {
    const scene = prepare(new PuyoGame() as any, true)
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.playScorePopup = vi.fn(() => { throw new Error('popup failed') })
    const next = scene.gameState.nextPair
    scene.landCurrentPair()
    finish(scene)
    expect(scene.gameState.score).toBe(40)
    expect(scene.gameState.currentPair).toEqual(next)
    expect(scene.gameField.getField().grid[12][0]).toBe(PuyoColor.BLUE)
    expect(supplier).toHaveBeenCalledTimes(1)
    scene.update(10000, 50)
    expect(supplier).toHaveBeenCalledTimes(1)
  })
  it('runs GTR once after a zero-chain commit and supplies once', () => {
    const scene = prepare(new PuyoGame() as any)
    const gtr = vi.spyOn(GTRDetector, 'detectGTR')
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    scene.landCurrentPair()
    expect(gtr).not.toHaveBeenCalled()
    expect(supplier).not.toHaveBeenCalled()
    for (let i = 0; i < 30 && scene.chainPlayback; i++) scene.update(500, 50)
    expect(gtr).toHaveBeenCalledTimes(1)
    expect(supplier).toHaveBeenCalledTimes(1)
    scene.update(500, 0)
    expect(gtr).toHaveBeenCalledTimes(1)
    expect(supplier).toHaveBeenCalledTimes(1)
    gtr.mockRestore()
    supplier.mockRestore()
  })

  it('does not supply a pair at terminal spawn and restores an invalid placement', () => {
    const scene = prepare(new PuyoGame() as any)
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    const source = scene.gameField.getField()
    for (let y = 0; y < 13; y++) source.grid[y][2] = y % 2 ? PuyoColor.RED : PuyoColor.BLUE
    scene.landCurrentPair()
    for (let i = 0; i < 30 && scene.chainPlayback; i++) scene.update(500, 50)
    expect(scene.gameState.gameOver).toBe(true)
    expect(supplier).not.toHaveBeenCalled()
    supplier.mockRestore()

    const invalid = prepare(new PuyoGame() as any)
    invalid.gameField.getField().grid[11][0] = PuyoColor.GREEN
    const before = structuredClone(invalid.gameField.getField())
    invalid.landCurrentPair()
    expect(invalid.chainPlayback).toBeUndefined()
    expect(invalid.gameField.getField()).toEqual(before)
    expect(invalid.gameState.currentPair).toEqual(pair(2, 1))
    expect(invalid.gameState.score).toBe(0)
  })
})

describe.each([GuidedPracticeScene, PuyoGame])('%s quick drop', Scene => {
  it('waits for a held pointer to release before another source can confirm the next pair', () => {
    const scene = prepare(new Scene() as any)
    setNaturalFall(scene, false)
    const land = vi.spyOn(scene, 'landCurrentPair')
    scene.pressAction('quickDrop', 'pointer:quickDrop:1')
    scene.update(500, 16)
    expect(land).toHaveBeenCalledOnce()
    expect(scene.actionInput.isGated()).toBe(true)
    if (scene.chainPlayback) {
      const advance = vi.spyOn(scene.chainPlayback, 'update')
      scene.update(550, 50)
      expect(advance).toHaveBeenCalledWith(50)
    }
    finish(scene)
    scene.pressAction('quickDrop', 'pointer:quickDrop:2')
    scene.actionInput.pressPhysical('ArrowUp')
    scene.update(12000, 16)
    expect(land).toHaveBeenCalledOnce()
    scene.actionInput.releasePhysical('ArrowUp')
    expect(scene.actionInput.isGated()).toBe(true)
    scene.releaseAction('pointer:quickDrop:1')
    scene.releaseAction('pointer:quickDrop:2')
    expect(scene.actionInput.isGated()).toBe(false)
    scene.pressAction('quickDrop', 'pointer:quickDrop:3')
    scene.releaseAction('pointer:quickDrop:3')
    scene.update(12016, 16)
    expect(land).toHaveBeenCalledTimes(2)
  })

  it('does not carry a held physical quick drop into the next pair', () => {
    const scene = prepare(new Scene() as any)
    setNaturalFall(scene, false)
    const land = vi.spyOn(scene, 'landCurrentPair')
    scene.actionInput.pressPhysical('ArrowUp')
    scene.update(500, 16)
    expect(land).toHaveBeenCalledOnce()
    finish(scene)
    const nextPair = structuredClone(scene.gameState.currentPair)
    const board = structuredClone(scene.gameField.getField())
    const history = structuredClone(scene.turnHistory)
    const random = scene.pairRandom?.getState()
    scene.update(12000, 16)
    expect(land).toHaveBeenCalledOnce()
    expect(scene.gameState.currentPair).toEqual(nextPair)
    expect(scene.gameField.getField()).toEqual(board)
    expect(scene.turnHistory).toEqual(history)
    expect(scene.pairRandom?.getState()).toBe(random)
    scene.actionInput.releasePhysical('ArrowUp')
  })

  it.each([false, true])('matches normal landing, score, queue and random state (split landing: %s)', split => {
    vi.spyOn(Math, 'random').mockReturnValue(0.31)
    const normal = prepare(new Scene() as any)
    const quick = prepare(new Scene() as any)
    const initial = { ...pair(0, 1), rotation: split ? 1 : 0,
      sub: { ...pair(0, 1).sub, x: split ? 1 : 0, y: split ? 1 : 0 } }
    for (const scene of [normal, quick]) {
      if (split) scene.gameField.getField().grid[10][1] = PuyoColor.GREEN
      scene.gameState.field = scene.gameField.getField()
      scene.gameState.currentPair = structuredClone(initial)
      scene.captureTurnStart?.()
      scene.captureTurnStartPair?.()
    }
    while (PuyoPairManager.canMove(normal.gameState.currentPair, 0, 1,
      (x, y) => normal.gameField.isOccupied(x, y))) {
      normal.gameState.currentPair = PuyoPairManager.movePair(normal.gameState.currentPair, 0, 1)
    }
    normal.landCurrentPair()
    quick.quickDrop()
    finish(normal)
    finish(quick)
    expect(quick.gameField.getField()).toEqual(normal.gameField.getField())
    expect(quick.gameState).toEqual(normal.gameState)
    expect(quick.gameHistory?.getPreviousState()).toEqual(normal.gameHistory?.getPreviousState())
    expect(quick.turnHistory).toEqual(normal.turnHistory)
    expect(quick.pairRandom?.getState()).toBe(normal.pairRandom?.getState())
  })
})

describe.each([GuidedPracticeScene, PuyoGame])('%s result input separation', Scene => {
  it('keeps Down scrolling suppressed through landing, commit release wait and result rejection', () => {
    const scene = prepare(new Scene() as any)
    setNaturalFall(scene, false)
    const listeners = new Map<string, (event: KeyboardEvent) => void>()
    const canvas = { closest: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
    vi.stubGlobal('document', { hidden: false, activeElement: canvas, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('window', { addEventListener: (name: string, handler: (event: KeyboardEvent) => void) => listeners.set(name, handler),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn() })
    scene.actionInput = new PhaserInputAdapter(canvas,
      code => scene.isShowingResult && code === 'Space' ? 'newGame' : undefined,
      action => scene.canAcceptAction(action))
    const down = (code = 'ArrowDown', repeat = false) => {
      const event = { code, target: canvas, keyCode: 0, repeat, isComposing: false,
        ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent
      listeners.get('keydown')!(event)
      return event
    }
    expect(down().preventDefault).toHaveBeenCalledOnce()
    scene.update(500, 16)
    const supplier = vi.spyOn(PuyoPairManager, 'createRandomPair')
    scene.landCurrentPair()
    const snapshot = () => structuredClone({ board: scene.gameField.getField(), score: scene.gameState.score,
      history: scene.turnHistory, random: scene.pairRandom?.getState() })
    const beforeCommit = snapshot()
    const press = vi.spyOn(scene.actionInput, 'press')
    const physical = vi.spyOn(scene.actionInput, 'pressPhysical')
    expect(down('ArrowDown', true).preventDefault).toHaveBeenCalledOnce()
    expect(press).not.toHaveBeenCalled()
    expect(physical).not.toHaveBeenCalled()
    expect(snapshot()).toEqual(beforeCommit)
    expect(supplier).not.toHaveBeenCalled()
    finish(scene)
    expect(supplier).toHaveBeenCalledOnce()
    const next = structuredClone(scene.gameState.currentPair)
    expect(down('ArrowDown', true).preventDefault).toHaveBeenCalledOnce()
    scene.update(12000, 16)
    expect(scene.gameState.currentPair).toEqual(next)
    listeners.get('keyup')!({ code: 'ArrowDown' } as KeyboardEvent)
    expect(down().preventDefault).toHaveBeenCalledOnce()
    scene.update(12016, 16)
    expect(scene.gameState.currentPair.main.y).toBe(next.main.y + 1)
    scene.actionInput.releaseAll()
    scene.isShowingResult = true
    const retry = vi.fn()
    if (scene instanceof GuidedPracticeScene) (scene as any).restartFromResult = retry
    const result = snapshot()
    press.mockClear(); physical.mockClear()
    for (const repeat of [false, true]) {
      expect(down('ArrowDown', repeat).preventDefault).toHaveBeenCalledOnce()
      scene.update(12032, 16)
    }
    expect(press).not.toHaveBeenCalled()
    expect(physical).not.toHaveBeenCalled()
    expect(scene.isShowingResult).toBe(true)
    expect(snapshot()).toEqual(result)
    expect(down('Space').preventDefault).toHaveBeenCalledOnce()
    down('Space', true)
    scene.update(12048, 16)
    expect(retry).toHaveBeenCalledTimes(Scene === GuidedPracticeScene ? 1 : 0)
    scene.actionInput.dispose()
  })
})

describe('guided individual evaluation result input', () => {
  const Scene = GuidedPracticeScene
  it('requires a fresh Space press after Space evaluation enters the result', () => {
    const scene = prepare(new Scene() as any)
    const listeners = new Map<string, (event: KeyboardEvent) => void>()
    const canvas = { closest: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
    vi.stubGlobal('document', { hidden: false, activeElement: canvas,
      addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('window', { addEventListener: vi.fn((name: string, handler: (event: KeyboardEvent) => void) => listeners.set(name, handler)),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn() })
    scene.actionInput = new PhaserInputAdapter(canvas,
      code => scene.isShowingResult ? code === 'Space' ? 'newGame' : code === 'Escape' ? 'exit' : undefined : undefined,
      action => scene.canAcceptAction(action))
    const retry = vi.fn()
    const harness = scene as any
    harness.evaluateGTR = vi.fn(() => { harness.isShowingResult = true; harness.actionInput.suppressUntilRelease() })
    harness.restartFromResult = retry
    const down = (repeat = false) => listeners.get('keydown')!({ code: 'Space', target: canvas, keyCode: 0,
      repeat, isComposing: false, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault: vi.fn() } as unknown as KeyboardEvent)
    const up = () => listeners.get('keyup')!({ code: 'Space' } as KeyboardEvent)
    down()
    scene.update(500, 16)
    expect(scene.isShowingResult).toBe(true)
    down(true)
    scene.update(501, 16)
    expect(retry).not.toHaveBeenCalled()
    up()
    scene.update(502, 16)
    expect(retry).not.toHaveBeenCalled()
    down()
    scene.update(503, 16)
    expect(retry).toHaveBeenCalledOnce()
    scene.actionInput.dispose()
  })

  it('ignores DOM evaluate bindings and retries once on result Space', () => {
    const scene = prepare(new Scene() as any)
    const listeners = new Map<string, (event: KeyboardEvent) => void>()
    const canvas = { closest: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLCanvasElement
    vi.stubGlobal('document', { hidden: false, activeElement: canvas,
      addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('window', { addEventListener: vi.fn((name: string, handler: (event: KeyboardEvent) => void) => listeners.set(name, handler)),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn() })
    scene.isShowingResult = true
    scene.time.delayedCall = vi.fn()
    scene.actionInput = new PhaserInputAdapter(canvas,
      code => scene.isShowingResult ? code === 'Space' ? 'newGame' : code === 'Escape' ? 'exit' : undefined : undefined,
      action => scene.canAcceptAction(action))
    const keys = defaultBindings()
    keys.evaluate = ['KeyE', 'KeyQ']
    scene.actionInput.setBindings(keys)
    const down = (code: string, repeat = false) => {
      const event = { code, target: canvas, keyCode: 0, repeat, isComposing: false,
        ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent
      listeners.get('keydown')!(event)
      return event
    }
    const board = structuredClone(scene.gameField.getField())
    const history = structuredClone(scene.turnHistory)
    const random = scene.pairRandom?.getState()
    for (const code of ['KeyE', 'KeyQ']) {
      expect(down(code).preventDefault).not.toHaveBeenCalled()
      scene.update(500, 16)
      expect(scene.isShowingResult).toBe(true)
      expect(scene.gameField.getField()).toEqual(board)
      expect(scene.turnHistory).toEqual(history)
      expect(scene.pairRandom?.getState()).toBe(random)
      expect(scene.time.delayedCall).not.toHaveBeenCalled()
    }
    expect(down('Space').preventDefault).toHaveBeenCalledOnce()
    down('Space', true)
    scene.update(501, 16)
    scene.update(502, 16)
    expect(scene.time.delayedCall).toHaveBeenCalledOnce()
    scene.actionInput.dispose()
  })

  it('maps the result screen evaluate button to one retry', () => {
    const scene = prepare(new Scene() as any)
    scene.isShowingResult = true
    scene.time.delayedCall = vi.fn()
    scene.pressAction('evaluate', 'pointer:evaluate:1')
    scene.releaseAction('pointer:evaluate:1')
    scene.update(500, 16)
    expect(scene.time.delayedCall).toHaveBeenCalledOnce()
  })
})

describe.each([GuidedPracticeScene, PuyoGame])('%s independent subsequent supply', Scene => {
  it('uses the same opening rule and independent third pair on every new game', () => {
    const opening = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
    const random = vi.spyOn(PuyoPairManager, 'createRandomPair')
    const scene = new Scene() as any
    expect(opening).toHaveBeenCalledOnce()
    expect(random).toHaveBeenCalledOnce()
    expect(scene.gameState.currentPair).toEqual(opening.mock.results[0].value.pair1)
    expect(scene.gameState.nextPair).toEqual(opening.mock.results[0].value.pair2)
    expect(scene.gameState.nextNextPair).toEqual(random.mock.results[0].value)
  })

  it('supplies an independent pair only after commit and never regenerates the opening for later turns', () => {
    const scene = prepare(new Scene() as any)
    const opening = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
    const random = vi.spyOn(PuyoPairManager, 'createRandomPair')
    const oldNext = structuredClone(scene.gameState.nextPair)
    const oldNextNext = structuredClone(scene.gameState.nextNextPair)
    scene.landCurrentPair()
    expect(random).not.toHaveBeenCalled()
    finish(scene)
    expect(opening).not.toHaveBeenCalled()
    expect(random).toHaveBeenCalledOnce()
    expect(scene.gameState.currentPair).toEqual(oldNext)
    expect(scene.gameState.nextPair).toEqual(oldNextNext)
    expect(scene.gameState.nextNextPair).toEqual(random.mock.results[0].value)
    scene.update(12000, 16)
    expect(random).toHaveBeenCalledOnce()
  })

  it('uses the independent generator when the queue advances without a precomputed pair', () => {
    const scene = prepare(new Scene() as any)
    const opening = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
    const random = vi.spyOn(PuyoPairManager, 'createRandomPair')
    scene.spawnNextPair(false)
    expect(opening).not.toHaveBeenCalled()
    expect(random).toHaveBeenCalledOnce()
    expect(scene.gameState.nextNextPair).toEqual(random.mock.results[0].value)
  })
})

describe('ten-round score attack submissions', () => {
  it('displays submitted totals without changing the board or using chain scores', () => {
    let total: number | null = 125
    const scene = prepare(new PuyoGame(undefined, () => total) as any)
    scene.gameState.score = 9000
    const before = structuredClone(scene.gameState)
    scene.totalScoreText = { setText: vi.fn() }
    scene.updateTotalScoreDisplay()
    expect(scene.totalScoreText.setText).toHaveBeenLastCalledWith('125')
    total = null
    scene.updateTotalScoreDisplay()
    expect(scene.totalScoreText.setText).toHaveBeenLastCalledWith('—')
    total = 200
    scene.updateTotalScoreDisplay()
    expect(scene.totalScoreText.setText).toHaveBeenLastCalledWith('200')
    expect(scene.gameState).toEqual(before)
  })

  const makeScene = (onRound = vi.fn()) => {
    const scene = prepare(new PuyoGame(onRound) as any)
    scene.children = { getAll: () => [] }
    setNaturalFall(scene, false)
    return { scene, onRound }
  }

  it('records only committed moves, reproduces the submitted board, and clears steps for the next round', () => {
    const { scene, onRound } = makeScene()
    scene.landCurrentPair()
    finish(scene)
    expect(scene.placedMoves).toHaveLength(3)
    expect(replayPlacements(scene.placedMoves)).toEqual(scene.gameField.getField().grid)
    scene.landCurrentPair()
    scene.cancelChain()
    expect(scene.placedMoves).toHaveLength(3)
    scene.evaluateAndReset()
    const snapshot = onRound.mock.lastCall![0]
    expect(snapshot.moves).toHaveLength(3)
    expect(replayPlacements(snapshot.moves)).toEqual(snapshot.grid)
    expect(scene.placedMoves).toBe('')
    scene.evaluateAndReset()
    expect(onRound.mock.lastCall![0].moves).toBe('')
    expect(snapshot.moves).toHaveLength(3)
  })

  it('captures each submitted board, immediately resets nine times and stops without generating an eleventh board', () => {
    const { scene, onRound } = makeScene()
    const supplier = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
    for (let i = 0; i < 10; i++) {
      const board = field()
      board.grid[12][i % 6] = i % 2 ? PuyoColor.BLUE : PuyoColor.RED
      scene.gameField.setField(board)
      const submittedPair = structuredClone(scene.gameState.currentPair)
      const queued = structuredClone([scene.gameState.nextPair, scene.gameState.nextNextPair])
      scene.evaluateAndReset()
      expect(onRound).toHaveBeenCalledTimes(i + 1)
      const saved = onRound.mock.lastCall![0]
      expect(saved.grid).toEqual(board.grid)
      expect(saved.currentPair).toEqual(submittedPair)
      expect([saved.nextPair, saved.nextNextPair]).toEqual(queued)
      if (i < 9) {
        expect(scene.gameField.getField().grid.flat().every((cell: unknown) => cell === null)).toBe(true)
        expect(scene.isShowingResult).toBe(false)
      }
      board.grid[12][i % 6] = PuyoColor.YELLOW
      expect(saved.grid[12][i % 6]).not.toBe(PuyoColor.YELLOW)
    }
    expect(supplier).toHaveBeenCalledTimes(9)
    expect(scene.isShowingResult).toBe(true)
    scene.evaluateAndReset()
    scene.pressAction('evaluate', 'button:evaluate')
    scene.update(501, 16)
    expect(onRound).toHaveBeenCalledTimes(10)
    expect(supplier).toHaveBeenCalledTimes(9)
  })

  it('accepts custom evaluation keys once per release and submits a game-over board', () => {
    const { scene, onRound } = makeScene()
    const keys = defaultBindings()
    keys.evaluate = ['KeyE', 'KeyQ']
    scene.actionInput.setBindings(keys)
    scene.actionInput.pressPhysical('KeyE')
    scene.update(500, 16)
    scene.actionInput.pressPhysical('KeyE', true)
    scene.update(501, 16)
    expect(onRound).toHaveBeenCalledOnce()
    scene.actionInput.releasePhysical('KeyE')
    scene.gameState.gameOver = true
    const submitted = structuredClone(scene.gameField.getField().grid)
    scene.actionInput.pressPhysical('KeyQ')
    scene.actionInput.releasePhysical('KeyQ')
    scene.update(502, 16)
    expect(onRound).toHaveBeenCalledTimes(2)
    expect(onRound.mock.lastCall![0].grid).toEqual(submitted)
    expect(scene.gameState.gameOver).toBe(false)
  })

  it('holds the committed terminal board while idle and submits only after a fresh evaluation press', () => {
    const { scene, onRound } = makeScene()
    for (let y = 0; y < 13; y++) scene.gameField.getField().grid[y][2] = y % 2 ? PuyoColor.RED : PuyoColor.BLUE
    const supplier = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
    scene.landCurrentPair()
    // A key held during the final animation cannot dismiss GameOver.
    scene.actionInput.pressPhysical('Space')
    finish(scene)
    expect(onRound).not.toHaveBeenCalled()
    expect(scene.gameState.gameOver).toBe(true)
    const board = structuredClone(scene.gameField.getField().grid)
    const moves = scene.placedMoves
    expect(moves).toHaveLength(3)
    const nextPair = structuredClone(scene.gameState.currentPair)
    for (let i = 0; i < 100; i++) scene.update(10000 + i * 60000, 60000)
    expect(scene.showGameOver).toHaveBeenCalled()
    expect(onRound).not.toHaveBeenCalled()
    expect(supplier).not.toHaveBeenCalled()
    expect(scene.submittedRounds).toBe(0)
    expect(scene.isShowingResult).toBe(false)
    expect(scene.gameState.gameOver).toBe(true)
    expect(scene.gameField.getField().grid).toEqual(board)
    expect(scene.placedMoves).toBe(moves)
    expect(scene.gameState.currentPair).toEqual(nextPair)
    expect(scene.actionInput.isGated()).toBe(true)
    scene.actionInput.pressPhysical('Space', true)
    scene.update(7000000, 16)
    expect(onRound).not.toHaveBeenCalled()
    scene.actionInput.releasePhysical('Space')
    scene.pressAction('left', 'button:left')
    scene.update(7000001, 16)
    expect(scene.gameState.currentPair).toEqual(nextPair)
    scene.actionInput.pressPhysical('Space')
    scene.update(7000002, 16)
    expect(onRound).toHaveBeenCalledOnce()
    expect(onRound.mock.lastCall![0]).toMatchObject({ grid: board, moves })
    expect(scene.gameState.gameOver).toBe(false)
    expect(scene.placedMoves).toBe('')
    expect(supplier).toHaveBeenCalledOnce()
    expect(scene.gameField.getField().grid.flat().every((cell: unknown) => cell === null)).toBe(true)
    scene.update(7000003, 16)
    expect(onRound).toHaveBeenCalledOnce()
  })

  it('requires explicit evaluation for each terminal round, including the tenth before results', () => {
    const { scene, onRound } = makeScene()
    const supplier = vi.spyOn(PuyoPairManager, 'createValidTwoHandCombination')
    for (let i = 0; i < 10; i++) {
      const board = field()
      board.grid[0][2] = PuyoColor.BLUE
      scene.gameField.setField(board)
      scene.spawnNextPair()
      scene.update(500 + i, 16)
      expect(onRound).toHaveBeenCalledTimes(i)
      expect(scene.isShowingResult).toBe(false)
      expect(scene.gameState.gameOver).toBe(true)
      scene.pressAction('evaluate', 'button:evaluate')
      scene.releaseAction('button:evaluate')
      scene.update(1000 + i, 16)
      expect(onRound).toHaveBeenCalledTimes(i + 1)
      expect(onRound.mock.lastCall![0].grid[0][2]).toBe(PuyoColor.BLUE)
    }
    expect(scene.isShowingResult).toBe(true)
    expect(supplier).toHaveBeenCalledTimes(9)
    scene.update(2000, 16)
    expect(onRound).toHaveBeenCalledTimes(10)
    expect(supplier).toHaveBeenCalledTimes(9)
  })

  it('creates GameOver once and destroys its overlay before the next round', () => {
    const { scene } = makeScene()
    scene.add.rectangle = vi.fn(display)
    scene.showGameOver.mockImplementation(() => Object.getPrototypeOf(scene).showGameOver.call(scene))
    scene.gameState.gameOver = true
    scene.update(501, 16)
    const text = scene.gameOverText, overlay = scene.gameOverOverlay
    expect(text).toBeDefined()
    expect(overlay).toBeDefined()
    scene.update(502, 16)
    expect(scene.add.rectangle).toHaveBeenCalledOnce()
    expect(scene.add.text).toHaveBeenCalledOnce()
    scene.pressAction('evaluate', 'button:evaluate')
    scene.update(503, 16)
    expect(text.destroy).toHaveBeenCalledOnce()
    expect(overlay.destroy).toHaveBeenCalledOnce()
    expect(scene.gameOverText).toBeUndefined()
    expect(scene.gameOverOverlay).toBeUndefined()
  })

  it.each(['isPaused', 'isDisposed', 'isVisualStopped', 'hidden'])('holds the terminal board while %s', state => {
    const { scene, onRound } = makeScene()
    scene.gameState.gameOver = true
    if (state === 'hidden') (document as unknown as { hidden: boolean }).hidden = true
    else scene[state] = true
    scene.update(501, 16)
    expect(onRound).not.toHaveBeenCalled()
    expect(scene.gameState.gameOver).toBe(true)
  })

  it('rejects evaluation while paused, resolving a chain, hidden or disposed', () => {
    const { scene, onRound } = makeScene()
    const board = structuredClone(scene.gameField.getField())
    scene.isPaused = true
    scene.pressAction('evaluate', 'button:paused')
    scene.evaluateAndReset()
    scene.isPaused = false
    scene.chainPlayback = { cancel: vi.fn() }
    scene.pressAction('evaluate', 'button:chain')
    scene.evaluateAndReset()
    scene.chainPlayback = undefined
    ;(document as unknown as { hidden: boolean }).hidden = true
    scene.pressAction('evaluate', 'button:hidden')
    scene.update(501, 16)
    scene.isDisposed = true
    scene.evaluateAndReset()
    expect(onRound).not.toHaveBeenCalled()
    expect(scene.gameField.getField()).toEqual(board)
  })

  it('does not submit or generate another board after explicit exit', () => {
    const { scene, onRound } = makeScene()
    const onExit = vi.fn()
    scene.game = { registry: { get: () => onExit } }
    const reset = vi.spyOn(scene, 'resetGame')
    Object.getPrototypeOf(scene).exitToMenu.call(scene)
    scene.evaluateAndReset()
    expect(onExit).toHaveBeenCalledOnce()
    expect(onRound).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })
})
