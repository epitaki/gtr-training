import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { justDown } = vi.hoisted(() => ({ justDown: vi.fn((_key?: unknown) => false) }))

vi.mock('phaser', () => ({
  Scene: class {
    input: unknown
    time: unknown
    tweens: unknown
  },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  Textures: { FilterMode: { NEAREST: 1 } },
  Input: {
    Keyboard: {
      JustDown: justDown,
      KeyCodes: { Z: 90, X: 88, SPACE: 32, ESC: 27, P: 80, UP: 38, F: 70, G: 71, R: 82 },
    },
  },
}))

import GuidedPracticeScene from './GuidedPracticeScene'
import { GuideManager } from '../guide/GuideManager'
import { GTRDetector } from '../gtr/GTRPatterns'
import type { PlacementAdvice, GTRTrainingPlan } from '../advisor/PlacementAdvisor'
import { ContinuousAdvisor } from '../advisor/ContinuousAdvisor'
import { PuyoColor, type Field, type GameState } from '../core/types'
import { ResultChainPlayback } from '../rendering/ResultChainPlayback'
import { InputController } from '../input/InputController'
import { defaultBindings, type GameAction } from '../input/bindings'
import { getBindings, saveBindings, subscribeBindings } from '../input/settings'
import { GameManager } from '../GameManager'

it('keeps three examples and their controls inside the panel with long saved shortcuts', () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  const previous = structuredClone(getBindings())
  const field: Field = { width: 6, height: 13, grid: Array.from({ length: 13 }, () => Array(6).fill(null)) }
  const advice = { phaseMessage: '基本形が塞がれています：3列目・下から2段目の赤（必要色は青）。積むだけでは完成できません。', bestPlacement: null } as PlacementAdvice
  const scene = new GuidedPracticeScene() as unknown as {
    currentAdvice: PlacementAdvice; guideDisplay: unknown; add: unknown
    gameField: { getField: () => Field }; guideManager: GuideManager
    gameState: { field: Field; pairRandomState: number }; turnHistory: unknown[]
    isPaused: boolean; isInspectionFrozen: boolean; isReplayInspection: boolean
    time: { paused: boolean }; updateGuide: () => void; refreshBindingLabels: () => void
  }
  type Label = { x: number; y: number; height: number; text: string; setOrigin: () => Label; setText: (text: string) => Label }
  let labels: Label[] = []
  let autoBottom = 0
  let cards: Array<{ top: number; bottom: number }> = []
  scene.guideDisplay = { add: vi.fn(), removeAll: () => { labels = []; autoBottom = 0; cards = [] } }
  scene.add = {
    text: (x: number, y: number, text: string, style: { fontSize: string; wordWrap?: { width: number }; lineSpacing?: number }) => {
      const fontSize = Number.parseInt(style.fontSize)
      // Model a renderer returning wrapped text heights, rather than fixed test stubs.
      const measure = (value: string) => Math.ceil([...value].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? fontSize / 2 : fontSize), 0) / (style.wordWrap?.width ?? 10000)) * (fontSize + (style.lineSpacing ?? 0))
      const label: Label = { x, y, text, height: measure(text), setOrigin: () => label,
        setText: value => { label.text = value; label.height = measure(value); return label } }
      labels.push(label)
      return label
    },
    rectangle: (_x: number, y: number, width: number, height: number) => {
      if (width === 160 && height === 44) autoBottom = y + height / 2
      if (width === 330 && height === 160) cards.push({ top: y - height / 2, bottom: y + height / 2 })
      const shape = { setStrokeStyle: () => shape, setFillStyle: () => shape, setInteractive: () => shape, on: vi.fn() }
      return shape
    },
    sprite: () => ({ setDisplaySize: vi.fn() }),
  }
  scene.currentAdvice = advice
  scene.gameField = { getField: () => field }
  scene.guideManager = new GuideManager()
  scene.gameState = { field, pairRandomState: 1234 }
  scene.turnHistory = [{ turn: 1 }]
  scene.isPaused = true
  scene.isInspectionFrozen = true
  scene.isReplayInspection = true
  scene.time = { paused: true }
  const state = () => ({ advice: scene.currentAdvice, field: scene.gameState.field, history: scene.turnHistory,
    random: scene.gameState.pairRandomState, paused: scene.isPaused, inspection: scene.isInspectionFrozen,
    replay: scene.isReplayInspection, clock: scene.time.paused })
  const before = structuredClone(state())
  const example = () => labels.find(label => label.text === '完成例')!
  const assertLayout = () => {
    expect(cards).toHaveLength(3)
    expect(cards[0].top).toBeGreaterThan(example().y)
    expect(cards[1].top).toBeGreaterThan(cards[0].bottom)
    expect(cards[2].top).toBeGreaterThan(cards[1].bottom)
    expect(autoBottom - 44).toBeGreaterThan(cards[2].bottom)
    expect(autoBottom).toBeLessThanOrEqual(684)
  }
  const unsubscribe = subscribeBindings(() => scene.refreshBindingLabels())
  try {
    saveBindings(defaultBindings())
    scene.updateGuide()
    const shortExampleTop = example().y
    assertLayout()
    const long = defaultBindings()
    long.rewind = ['KeyA', 'KeyU', 'Backspace', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Slash']
    long.evaluate = ['Space', 'KeyE', 'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad5', 'Numpad7']
    saveBindings(long)
    expect(example().y).toBe(shortExampleTop)
    assertLayout()
    expect(state()).toEqual(before)
    const updatedTop = example().y
    scene.updateGuide() // Saved bindings do not change the example layout on a fresh draw either.
    expect(example().y).toBe(updatedTop)
    assertLayout()
  } finally {
    unsubscribe()
    saveBindings(previous)
  }
})

it('reports an already built tail even while the horizontal head is waiting for its key', () => {
  const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
  const grid = [...Array.from({ length: 9 }, () => Array(6).fill(null)),
    ...['BBB..Y', 'GRGBBY', 'GGRGGB', 'RRGYYB'].map(row => [...row].map(c => colors[c] ?? null))]
  const field: Field = { grid, width: 6, height: 13 }
  const scene = new GuidedPracticeScene() as unknown as {
    gameField: { getField: () => Field }; guideManager: { updateState: ReturnType<typeof vi.fn> }; updateGuideState: () => void
    trainingPlan?: GTRTrainingPlan
  }
  scene.gameField = { getField: () => field }
  scene.trainingPlan = undefined
  scene.guideManager = { updateState: vi.fn() }
  scene.updateGuideState()
  expect(scene.guideManager.updateState).toHaveBeenCalledWith(field, true)
})

type KeyStub = { isDown: boolean; reset: ReturnType<typeof vi.fn> }
type SceneHarness = {
  time: { paused: boolean; now: number }
  tweens: { timeScale: number }
  input: { keyboard: { enabled: boolean; manager: { preventDefault: boolean } } }
  isInspectionFrozen: boolean
  isReplayInspection: boolean
  isShowingResult: boolean
  isPaused: boolean
  isGravityEnabled: boolean
  isAdvisorEnabled: boolean
  isReportPanelOpen: boolean
  actionInput: InputController
  waitForKeyRelease: boolean
  lastFallTime: number
  lastMoveTime: number
  keyboardWasEnabled: boolean
  keyboardPreventDefaultWas: boolean
  heldGameKeyCodes: Set<string>
  turnHistory: Array<{ turn: number }>
  rKey?: KeyStub
  escKey?: KeyStub
  pKey?: KeyStub
  upKey?: KeyStub
  cursors?: { left: KeyStub; right: KeyStub; down: KeyStub; up: KeyStub }
  freezeInspection: () => void
  unfreezeInspection: () => void
  handleReportClose: () => void
  handleReplayResume: () => void
  handleWindowBlur: () => void
  suppressHeldInputUntilRelease: () => void
  canProcessResultInput: () => boolean
  getReportTurnNumber: () => number
  currentAdvice: unknown
  getReportAdvice: () => unknown
  spawnNextPair: () => void
  rewind: ReturnType<typeof vi.fn>
  update: (time: number, delta?: number) => void
  handleInput: (actions: Set<GameAction>) => void
  updateFalling: (time: number) => void
  updateDisplay: () => void
  trackPhysicalKeys: () => () => void
  gameField: { isGameOver: () => boolean; getField: () => unknown }
  gameState: { gameOver: boolean; field: unknown; pairRandomState?: number }
  gameHistory: { saveState: ReturnType<typeof vi.fn> }
  pairRandom: { getState: () => number }
  showGameOver: ReturnType<typeof vi.fn>
}

const key = (isDown = false): KeyStub => ({ isDown, reset: vi.fn(function (this: KeyStub) {
  this.isDown = false
}) })

const createHarness = (): SceneHarness => {
  const scene = new GuidedPracticeScene() as unknown as SceneHarness
  scene.time = { paused: false, now: 500 }
  scene.tweens = { timeScale: 0.75 }
  scene.input = { keyboard: { enabled: true, manager: { preventDefault: true } } }
  scene.rKey = key()
  scene.escKey = key()
  scene.pKey = key()
  scene.upKey = key()
  scene.cursors = { left: key(), right: key(), down: key(), up: key() }
  scene.actionInput = new InputController(defaultBindings())
  return scene
}

const resultGrid = (): Field => {
  const colors: Record<string, PuyoColor> = {
    R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW,
  }
  const rows = ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB']
  return { width: 6, height: 13, grid: [
    ...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
    ...rows.map(row => [...row].map(value => colors[value] ?? null)),
  ] }
}

const createResultHarness = () => {
  const scene = createHarness() as SceneHarness & {
    add: unknown
    displayGTRField: ReturnType<typeof vi.fn>
    showDetailedResult: (result: ReturnType<typeof GTRDetector.detectGTR>) => void
    resultPlayback?: ResultChainPlayback
    resultKeyHandler?: (event: KeyboardEvent) => void
    cleanupResult: () => void
    exitToMenu: () => void
    isDisposed: boolean
    game: { registry: { get: ReturnType<typeof vi.fn> } }
    turnHistory: Array<{ turn: number }>
  }
  const field = resultGrid()
  scene.gameField = { getField: () => field, isGameOver: () => false }
  const texts = new Map<string, { on: ReturnType<typeof vi.fn>; setText: ReturnType<typeof vi.fn> }>()
  const graphic = () => {
    const item = {
      texture: { setFilter: vi.fn() },
      setDepth: vi.fn(), setOrigin: vi.fn(), setAlpha: vi.fn(), setText: vi.fn(), setInteractive: vi.fn(),
      on: vi.fn(), add: vi.fn(), destroy: vi.fn(),
    }
    item.setOrigin.mockReturnValue(item)
    item.setAlpha.mockReturnValue(item)
    return item
  }
  scene.add = {
    rectangle: vi.fn(() => graphic()), container: vi.fn(() => graphic()),
    text: vi.fn((_x: number, _y: number, content: string) => {
      const item = graphic()
      texts.set(content, item)
      return item
    }),
  }
  scene.displayGTRField = vi.fn(() => vi.fn())
  const on = vi.fn(), off = vi.fn()
  Object.assign(scene.input.keyboard, { on, off })
  scene.game = { registry: { get: vi.fn() } }
  return { scene, field, texts, on, off }
}

describe('GuidedPracticeScene tail guide', () => {
  it('shows three manually selected L examples while preserving the advised Y', () => {
    const grid = Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null))
    grid[12][0] = grid[12][1] = PuyoColor.GREEN
    grid[11][0] = grid[11][1] = grid[10][0] = PuyoColor.BLUE
    grid[11][2] = grid[10][1] = PuyoColor.GREEN
    const field: Field = { grid, width: 6, height: 13 }
    const manager = new GuideManager()
    manager.updateState(field, false)
    manager.setSuggestedTailPlan('Y', PuyoColor.RED, field)
    const scene = new GuidedPracticeScene() as unknown as {
      manualCompletionShape: 'Y' | 'zabuton' | 'L' | null
      currentAdvice: PlacementAdvice | null
      guideManager: GuideManager
      gameField: { getField: () => Field }
      guideDisplay: { removeAll: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> }
      add: { text: ReturnType<typeof vi.fn>; rectangle: ReturnType<typeof vi.fn>; sprite: ReturnType<typeof vi.fn> }
      updateGuide: () => void
    }
    scene.manualCompletionShape = 'L'
    scene.currentAdvice = { bestPlacement: { tailShape: 'Y' }, phaseMessage: '連鎖尾を伸ばそう' } as PlacementAdvice
    scene.guideManager = manager
    scene.gameField = { getField: () => field }
    scene.guideDisplay = { removeAll: vi.fn(), add: vi.fn() }
    const shape = { setStrokeStyle: vi.fn(), setFillStyle: vi.fn(), setInteractive: vi.fn(), on: vi.fn() }
    scene.add = {
      rectangle: vi.fn(() => shape),
      text: vi.fn(() => {
        const label = { height: 20, setOrigin: vi.fn() }
        label.setOrigin.mockReturnValue(label)
        return label
      }),
      sprite: vi.fn(() => ({ setDisplaySize: vi.fn() })),
    }
    scene.updateGuide()
    const labels = scene.add.text.mock.calls.map(call => String(call[2]))
    expect(labels).toEqual(['完成例', 'Y字', '座布団', 'L字', '1', '2', '3', 'ガイドに合わせる'])
    const tabs = scene.add.rectangle.mock.calls.filter(call => call[2] === 104)
    expect(tabs.map(call => call[4])).toEqual([0x302a46, 0x302a46, 0x4b3e76])
    expect(scene.add.sprite).toHaveBeenCalledTimes(19 * 3)
    expect(scene.manualCompletionShape).toBe('L')
    expect(scene.currentAdvice?.bestPlacement?.tailShape).toBe('Y')
    expect(scene.gameField.getField()).toBe(field)
  })

  it('browses completion examples without changing advice, field, pairs, or history', () => {
    const scene = new GuidedPracticeScene() as unknown as {
      manualCompletionShape: 'Y' | 'zabuton' | 'L' | null
      currentAdvice: PlacementAdvice | null
      gameState: GameState
      gameField: { getField: () => Field }
      gameHistory: unknown
      isReportPanelOpen: boolean
      isShowingResult: boolean
      isReplayInspection: boolean
      isInspectionFrozen: boolean
      updateGuide: ReturnType<typeof vi.fn>
      selectCompletionExample: (shape: 'Y' | 'zabuton' | 'L' | null) => void
    }
    const advice = { bestPlacement: { tailShape: 'L' } } as PlacementAdvice
    const state = scene.gameState
    const field = scene.gameField.getField()
    const history = scene.gameHistory
    scene.currentAdvice = advice
    scene.updateGuide = vi.fn()

    scene.selectCompletionExample('zabuton')
    expect(scene.manualCompletionShape).toBe('zabuton')
    scene.selectCompletionExample(null)
    expect(scene.manualCompletionShape).toBeNull()
    expect(scene.currentAdvice).toBe(advice)
    expect(scene.gameState).toBe(state)
    expect(scene.gameField.getField()).toBe(field)
    expect(scene.gameHistory).toBe(history)
    expect(scene.updateGuide).toHaveBeenCalledTimes(2)

    for (const blocked of ['isReportPanelOpen', 'isShowingResult', 'isReplayInspection', 'isInspectionFrozen'] as const) {
      scene[blocked] = true
      scene.selectCompletionExample('Y')
      expect(scene.manualCompletionShape).toBeNull()
      scene[blocked] = false
    }
    scene.gameState.gameOver = true
    scene.selectCompletionExample('Y')
    expect(scene.manualCompletionShape).toBeNull()
    expect(scene.updateGuide).toHaveBeenCalledTimes(2)
  })

  it('blocks leftover tab and auto callbacks after committed display recovery stops visually', () => {
    const scene = new GuidedPracticeScene() as unknown as {
      manualCompletionShape: 'Y' | 'zabuton' | 'L' | null
      isVisualStopped: boolean
      guideDisplay: { add: ReturnType<typeof vi.fn> }
      add: { rectangle: ReturnType<typeof vi.fn>; text: ReturnType<typeof vi.fn>; sprite: ReturnType<typeof vi.fn> }
      rebuildFieldSprites: ReturnType<typeof vi.fn>
      updateGuide: ReturnType<typeof vi.fn>
      drawCompletionExample: () => void
      recoverCommittedDisplay: (error: unknown) => void
    }
    scene.manualCompletionShape = 'Y'
    scene.guideDisplay = { add: vi.fn() }
    const pointerDowns: Array<() => void> = []
    const rectangle = {
      setStrokeStyle: vi.fn(), setInteractive: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'pointerdown') pointerDowns.push(callback)
      }),
    }
    scene.add = {
      rectangle: vi.fn(() => rectangle),
      text: vi.fn(() => {
        const label = { setOrigin: vi.fn() }
        label.setOrigin.mockReturnValue(label)
        return label
      }),
      sprite: vi.fn(() => ({ setDisplaySize: vi.fn() })),
    }
    scene.updateGuide = vi.fn()
    scene.drawCompletionExample()
    expect(pointerDowns).toHaveLength(4) // Y, zabuton, L, auto
    scene.rebuildFieldSprites = vi.fn(() => { throw new Error('display recovery failed') })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      scene.recoverCommittedDisplay(new Error('committed display failed'))
    } finally {
      log.mockRestore()
    }
    expect(scene.isVisualStopped).toBe(true)
    pointerDowns[2]() // leftover L tab
    pointerDowns[3]() // leftover auto button
    expect(scene.manualCompletionShape).toBe('Y')
    expect(scene.updateGuide).not.toHaveBeenCalled()
  })

  it('removes stale placement ghosts when a fold is blocked', () => {
    const scene = new GuidedPracticeScene() as unknown as {
      currentAdvice: PlacementAdvice
      ghostSprites: { main?: { destroy: ReturnType<typeof vi.fn> }; sub?: { destroy: ReturnType<typeof vi.fn> } }
      tweens: { killTweensOf: ReturnType<typeof vi.fn> }
      add: { sprite: ReturnType<typeof vi.fn> }
      updateGhostDisplay: () => void
    }
    const main = { destroy: vi.fn() }, sub = { destroy: vi.fn() }
    scene.ghostSprites = { main, sub }
    scene.tweens = { killTweensOf: vi.fn() }
    scene.add = { sprite: vi.fn() }
    scene.currentAdvice = { bestPlacement: null, allPlacements: [], phase: 'fold_building',
      phaseMessage: '基本形が塞がれています' } as PlacementAdvice
    scene.updateGhostDisplay()
    expect(main.destroy).toHaveBeenCalledOnce()
    expect(sub.destroy).toHaveBeenCalledOnce()
    expect(scene.ghostSprites.main).toBeUndefined()
    expect(scene.ghostSprites.sub).toBeUndefined()
    expect(scene.add.sprite).not.toHaveBeenCalled()
  })

  it.each([
    ['Y', 0], ['zabuton', 1], ['L', 2],
  ] as const)('automatically selects the recommended %s tab and renders three examples', (tailShape, selectedIndex) => {
    const scene = new GuidedPracticeScene() as unknown as {
      currentAdvice: PlacementAdvice
      guideDisplay: { removeAll: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> }
      guideManager: GuideManager
      add: { text: ReturnType<typeof vi.fn>; rectangle: ReturnType<typeof vi.fn>; sprite: ReturnType<typeof vi.fn> }
      updateGuide: () => void
    }
    const advice = { bestPlacement: { tailShape } } as PlacementAdvice
    scene.currentAdvice = advice
    scene.guideDisplay = { removeAll: vi.fn(), add: vi.fn() }
    scene.guideManager = new GuideManager()
    const fallback = vi.spyOn(scene.guideManager, 'getGuideContent')
    const shape = { setStrokeStyle: vi.fn(), setFillStyle: vi.fn(), setInteractive: vi.fn(), on: vi.fn() }
    scene.add = {
      rectangle: vi.fn(() => shape),
      text: vi.fn(() => ({ setOrigin: vi.fn().mockReturnValue({ height: 40 }) })),
      sprite: vi.fn(() => ({ setDisplaySize: vi.fn() })),
    }
    scene.updateGuide()
    const tabs = scene.add.rectangle.mock.calls.filter(call => call[2] === 104)
    expect(tabs).toHaveLength(3)
    expect(tabs.map(call => call[4])).toEqual([0, 1, 2].map(index => index === selectedIndex ? 0x4b3e76 : 0x302a46))
    expect(scene.add.sprite).toHaveBeenCalledTimes(19 * 3)
    expect(scene.currentAdvice).toBe(advice)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('updates pause shortcuts without rebuilding examples or recommendations', () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    const previous = structuredClone(getBindings())
    const scene = new GuidedPracticeScene() as unknown as {
      pauseText: { setText: ReturnType<typeof vi.fn> }
      isPaused: boolean
      isShowingResult: boolean
      currentAdvice: Pick<PlacementAdvice, 'phaseMessage'>
      gameState: { field: Field; pairRandomState: number }
      turnHistory: Array<{ turn: number }>
      refreshBindingLabels: () => void
      updateAdvice: ReturnType<typeof vi.fn>
      updateGuide: ReturnType<typeof vi.fn>
    }
    const field = resultGrid()
    const advice = { phaseMessage: '基本形が塞がれています' }
    scene.currentAdvice = advice
    scene.gameState = { field, pairRandomState: 1234 }
    scene.turnHistory = [{ turn: 1 }]
    scene.pauseText = { setText: vi.fn() }
    scene.isPaused = true
    scene.isShowingResult = false
    scene.updateAdvice = vi.fn()
    scene.updateGuide = vi.fn()
    const before = structuredClone({ field, history: scene.turnHistory, random: scene.gameState.pairRandomState })
    const unsubscribe = subscribeBindings(() => scene.refreshBindingLabels())
    try {
      const changed = structuredClone(previous)
      changed.rewind = ['KeyT']
      changed.evaluate = ['KeyQ']
      changed.pause = ['KeyP']
      saveBindings(changed)
      expect(scene.pauseText.setText).toHaveBeenCalledWith(expect.stringContaining('P'))
      expect(scene.currentAdvice).toBe(advice)
      expect({ field: scene.gameState.field, history: scene.turnHistory, random: scene.gameState.pairRandomState }).toEqual(before)
      expect(scene.updateAdvice).not.toHaveBeenCalled()
      expect(scene.updateGuide).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
      saveBindings(previous)
    }
  })

  it.each([
    { name: 'avalanche', rows: ['...G..', '..GRG.', 'RYBGR.', 'RRYBBR', 'YYBGGR'], column: 5, rotation: 0 },
    { name: 'tsurukame', rows: ['....G.', '..GRG.', 'RYBGR.', 'RRYBBR', 'YYBGGR'], column: 4, rotation: 1 },
  ])('renders the actual $name recovery recommendation as the placement ghost', ({ rows, column, rotation }) => {
    const scene = new GuidedPracticeScene() as unknown as {
      isAdvisorEnabled: boolean
      gameState: GameState
      gameField: { getField: () => Field }
      trainingPlan: GTRTrainingPlan
      guideManager: GuideManager
      currentAdvice: PlacementAdvice | null
      updateAdvice: () => void
      FIELD_X: number
      FIELD_Y: number
      CELL_SIZE: number
      add: { sprite: ReturnType<typeof vi.fn> }
      tweens: { add: ReturnType<typeof vi.fn> }
    }
    const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, Y: PuyoColor.YELLOW, B: PuyoColor.BLUE, G: PuyoColor.GREEN }
    const field: Field = { width: 6, height: 13, grid: [
      ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
      ...rows.map(row => [...row].map(c => colors[c] ?? null)),
    ] }
    const before = JSON.stringify(field)
    scene.gameState = { currentPair: {
      main: { color: PuyoColor.GREEN, x: 2, y: 1 }, sub: { color: PuyoColor.GREEN, x: 2, y: 0 }, rotation: 0, falling: true,
    } } as GameState
    scene.gameField = { getField: () => field }
    scene.trainingPlan = { colorA: PuyoColor.RED, colorB: PuyoColor.YELLOW, colorC: PuyoColor.RED, colorD: PuyoColor.YELLOW }
    scene.guideManager = new GuideManager()
    scene.add = { sprite: vi.fn(() => ({ setDisplaySize: vi.fn(), setAlpha: vi.fn(), setDepth: vi.fn() })) }
    scene.tweens = { add: vi.fn() }
    scene.isAdvisorEnabled = true
    // Real advisor, real updateAdvice and real ghost positioning; only the
    // graphics backend is stubbed. This is not just a result-screen score.
    scene.updateAdvice()
    expect(scene.currentAdvice?.bestPlacement?.placement).toEqual({ column, rotation })
    const landing = scene.currentAdvice!.bestPlacement!.landing
    for (const [index, pos] of [landing.mainPos, landing.subPos].entries()) {
      expect(scene.add.sprite).toHaveBeenNthCalledWith(index + 1,
        scene.FIELD_X + (pos.x + 0.5) * scene.CELL_SIZE,
        scene.FIELD_Y + (pos.y + 0.5) * scene.CELL_SIZE, 'puyo-pixel-atlas', 'green/idle')
    }
    expect(JSON.stringify(field)).toBe(before)
  })

  it('clears stale plans while disabled and immediately refreshes on enable without a status label', () => {
    const scene = new GuidedPracticeScene() as unknown as {
      isAdvisorEnabled: boolean
      gameState: GameState
      gameField: { getField: () => Field }
      guideManager: GuideManager
      currentAdvice: PlacementAdvice | null
      toggleAdvisor: () => void
      updateAdvice: () => void
      updateGuide: () => void
      clearGhostSprites: () => void
      updateGhostDisplay: () => void
    }
    const field: Field = { width: 6, height: 13, grid: Array.from({ length: 13 }, () => Array(6).fill(null)) }
    scene.gameState = { currentPair: { main: { color: PuyoColor.BLUE, x: 2, y: 1 }, sub: { color: PuyoColor.RED, x: 2, y: 0 }, rotation: 0, falling: true } } as GameState
    scene.gameField = { getField: () => field }
    scene.guideManager = new GuideManager()
    const setPlan = vi.spyOn(scene.guideManager, 'setSuggestedTailPlan')
    scene.guideManager.setSuggestedTailPlan('Y', PuyoColor.RED, field)
    scene.clearGhostSprites = vi.fn()
    scene.updateGhostDisplay = vi.fn()
    scene.updateGuide = vi.fn()
    scene.isAdvisorEnabled = true
    scene.currentAdvice = {} as PlacementAdvice
    scene.toggleAdvisor()
    expect(scene.isAdvisorEnabled).toBe(false)
    expect(scene.currentAdvice).toBeNull()
    expect(setPlan).toHaveBeenLastCalledWith(undefined, undefined)
    expect(scene.updateGuide).toHaveBeenCalledOnce()
    scene.updateAdvice()
    expect(setPlan).toHaveBeenLastCalledWith(undefined, undefined)
    const advice = { bestPlacement: { tailShape: 'L', tailColor: PuyoColor.BLUE } } as PlacementAdvice
    const getAdvice = vi.spyOn(ContinuousAdvisor, 'getAdvice').mockReturnValue(advice)
    try {
      scene.toggleAdvisor()
      expect(scene.currentAdvice).toBe(advice)
      expect(setPlan).toHaveBeenLastCalledWith('L', PuyoColor.BLUE, field)
      expect(scene.updateGuide).toHaveBeenCalledTimes(2)
    } finally {
      getAdvice.mockRestore()
    }
  })

})

describe('GuidedPracticeScene inspection controls', () => {
  let testDocument: { hidden: boolean; activeElement: null; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    justDown.mockClear()
    testDocument = { hidden: false, activeElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('document', testDocument)
    vi.stubGlobal('window', {
      location: { hash: '', href: 'http://localhost/' },
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const settingHarness = () => {
    type Label = { text: string; setOrigin: () => Label; setDepth: () => Label; setText: (text: string) => Label; setColor: () => Label }
    const scene = createHarness() as SceneHarness & {
      add: unknown; game: { canvas: { focus: ReturnType<typeof vi.fn> } }
      createSettingToggle: (action: 'gravity' | 'guide', x: number, top: number, label: string, color: string) => Label
      gravityStatusText: Label; advisorStatusText: Label
      isGravityEnabled: boolean; isAdvisorEnabled: boolean
      updateAdvice: ReturnType<typeof vi.fn>; updateGuide: ReturnType<typeof vi.fn>
    }
    const clicks: Array<() => void> = []
    scene.add = {
      rectangle: () => {
        const button = { setStrokeStyle: () => button, setDepth: () => button, setInteractive: () => button,
          on: (_event: string, click: () => void) => { clicks.push(click); return button } }
        return button
      },
      text: (_x: number, _y: number, text: string) => {
        const label: Label = { text, setOrigin: () => label, setDepth: () => label,
          setText: value => { label.text = value; return label }, setColor: () => label }
        return label
      },
    }
    scene.game = { canvas: { focus: vi.fn() } }
    scene.updateAdvice = vi.fn(); scene.updateGuide = vi.fn()
    scene.gravityStatusText = scene.createSettingToggle('gravity', 416, 404, '自由落下 ON', '#66e0aa')
    scene.advisorStatusText = scene.createSettingToggle('guide', 416, 456, 'ガイド ON', '#b5a8ff')
    return { scene, clicks }
  }

  it.each(['gravity', 'guide'] as const)('shares %s state and labels between click and keyboard without changing the game', action => {
    const { scene, clicks } = settingHarness()
    const before = { state: structuredClone(scene.gameState), grid: structuredClone(scene.gameField.getField()), random: scene.pairRandom.getState() }
    const index = action === 'gravity' ? 0 : 1
    const enabled = () => action === 'gravity' ? scene.isGravityEnabled : scene.isAdvisorEnabled
    const label = action === 'gravity' ? scene.gravityStatusText : scene.advisorStatusText
    const name = action === 'gravity' ? '自由落下' : 'ガイド'
    clicks[index]()
    scene.update(1001, 0)
    expect(enabled()).toBe(false)
    expect(label.text).toBe(`${name} OFF`)
    expect(scene.game.canvas.focus).toHaveBeenCalledWith({ preventScroll: true })
    const code = action === 'gravity' ? 'KeyF' : 'KeyG'
    scene.actionInput.pressPhysical(code); scene.actionInput.releasePhysical(code)
    scene.update(1002, 0)
    expect(enabled()).toBe(true)
    expect(label.text).toBe(`${name} ON`)
    expect(scene.gameState).toEqual(before.state)
    expect(scene.gameField.getField()).toEqual(before.grid)
    expect(scene.pairRandom.getState()).toBe(before.random)
  })

  it.each(['isPaused', 'isShowingResult', 'isReplayInspection', 'isReportPanelOpen', 'isDisposed', 'hidden', 'held-key gate'])('ignores setting clicks during %s', blocked => {
    const { scene, clicks } = settingHarness()
    if (blocked === 'hidden') testDocument.hidden = true
    else if (blocked === 'held-key gate') { scene.actionInput.pressPhysical('ArrowDown'); scene.actionInput.suppressUntilRelease() }
    else Object.assign(scene, { [blocked]: true })
    clicks.forEach(click => click())
    expect(scene.actionInput.frame(1001).size).toBe(0)
    expect(scene.isGravityEnabled).toBe(true)
    expect(scene.isAdvisorEnabled).toBe(true)
    expect(scene.game.canvas.focus).not.toHaveBeenCalled()
  })

  it.each([3, 5, 7])('does not grade seven chains as a training target (observed chains: %i)', chainCount => {
    const scene = createHarness() as SceneHarness & {
      add: unknown
      displayGTRField: () => void
      showDetailedResult: (result: ReturnType<typeof GTRDetector.detectGTR>) => void
    }
    const graphic = { texture: { setFilter: vi.fn() }, setDepth: vi.fn(), setOrigin: vi.fn(), add: vi.fn() }
    graphic.setOrigin.mockReturnValue(graphic)
    const text = vi.fn((_x: number, _y: number, _content: string) => graphic)
    scene.add = { rectangle: () => graphic, container: () => graphic, text }
    scene.displayGTRField = vi.fn()
    Object.assign(scene.input.keyboard, { on: vi.fn() })
    const result = { ...GTRDetector.detectGTR(Array.from({ length: 13 }, () => Array(6).fill(null))),
      chainCount, isGTR: true, hasBasicPattern: true, totalScore: 75 }
    scene.showDetailedResult(result)
    const labels = text.mock.calls.map(call => call[2])
    expect(labels).toContain('SCORE: 75点')
    expect(labels).toContain('○ 基本形')
    expect(labels).toContain('評価範囲内のぷよだけを採点します。')
    expect(labels).toContain(`${chainCount >= 5 ? '○' : '×'} 5連鎖`)
    expect(labels.some(label => /^[○×] 7連鎖$/.test(label))).toBe(false)
    expect(result.chainCount).toBe(chainCount)
  })

  it.each([true, false])('shows no leftovers as a positive result only after firing (perfect: %s)', perfect => {
    const scene = createHarness() as SceneHarness & {
      add: unknown
      displayGTRField: () => void
      showDetailedResult: (result: ReturnType<typeof GTRDetector.detectGTR>) => void
    }
    const graphic = { texture: { setFilter: vi.fn() }, setDepth: vi.fn(), setOrigin: vi.fn(), add: vi.fn() }
    graphic.setOrigin.mockReturnValue(graphic)
    const text = vi.fn((_x: number, _y: number, _content: string) => graphic)
    scene.add = { rectangle: () => graphic, container: () => graphic, text }
    scene.displayGTRField = vi.fn()
    Object.assign(scene.input.keyboard, { on: vi.fn() })
    const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, Y: PuyoColor.YELLOW, B: PuyoColor.BLUE }
    const rows = perfect ? ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'] : []
    const grid = [
      ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
      ...rows.map(row => [...row].map(color => colors[color] ?? null)),
    ]
    scene.showDetailedResult(GTRDetector.detectGTR(grid))
    const labels = text.mock.calls.map(call => call[2])
    expect(labels).toContain(`SCORE: ${perfect ? 100 : 0}点`)
    expect(labels).toContain(`${perfect ? '○' : '×'} 余りなし・1個・同色連結`)
    expect(labels).toContain(`${perfect ? '○' : '×'} 最小土台が完成`)
  })

  it.each([false, undefined])('does not infer minimal completion from the old raised-edge diagnostic (%s)', rightEdgeRaised => {
    const scene = createHarness() as SceneHarness & {
      add: unknown
      displayGTRField: () => void
      showDetailedResult: (result: ReturnType<typeof GTRDetector.detectGTR>) => void
    }
    const graphic = { texture: { setFilter: vi.fn() }, setDepth: vi.fn(), setOrigin: vi.fn(), add: vi.fn() }
    graphic.setOrigin.mockReturnValue(graphic)
    const text = vi.fn((_x: number, _y: number, _content: string) => graphic)
    scene.add = { rectangle: () => graphic, container: () => graphic, text }
    scene.displayGTRField = vi.fn()
    Object.assign(scene.input.keyboard, { on: vi.fn() })
    const result = GTRDetector.detectGTR(Array.from({ length: 13 }, () => Array(6).fill(null)))
    scene.showDetailedResult({ ...result, row10Usage: 'minimal', rightEdgeRaised })
    const labels = text.mock.calls.map(call => call[2])
    expect(labels).toContain('× 最小土台が完成')
  })

  it('keeps the perfect score while omitting unconfirmed outside connections from the display', () => {
    const scene = createHarness() as SceneHarness & {
      add: unknown; displayGTRField: () => void
      showDetailedResult: (result: ReturnType<typeof GTRDetector.detectGTR>) => void
    }
    const graphic = { texture: { setFilter: vi.fn() }, setDepth: vi.fn(), setOrigin: vi.fn(), add: vi.fn() }
    graphic.setOrigin.mockReturnValue(graphic)
    const text = vi.fn((_x: number, _y: number, _content: string) => graphic)
    scene.add = { rectangle: () => graphic, container: () => graphic, text }
    scene.displayGTRField = vi.fn()
    Object.assign(scene.input.keyboard, { on: vi.fn() })
    const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, Y: PuyoColor.YELLOW, B: PuyoColor.BLUE }
    const grid = [...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
      ...['B....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'].map(row => [...row].map(c => colors[c] ?? null))]
    scene.gameField.getField = () => ({ grid, width: 6, height: 13 })
    scene.showDetailedResult(GTRDetector.detectGTR(grid))
    const labels = text.mock.calls.map(call => call[2])
    expect(labels).toContain('SCORE: 100点')
    expect(labels).toContain('評価範囲内のぷよだけを採点します。')
    expect(labels.some(label => label.includes('接続未確認') || label.includes('土台5連鎖'))).toBe(false)
  })

  it('waits for the evaluation key release before accepting a result new-game action', () => {
    const scene = createHarness() as SceneHarness & {
      add: unknown; displayGTRField: () => void
      showDetailedResult: (result: ReturnType<typeof GTRDetector.detectGTR>) => void
      resetGame: ReturnType<typeof vi.fn>
    }
    const graphic = { texture: { setFilter: vi.fn() }, setDepth: vi.fn(), setOrigin: vi.fn(), add: vi.fn(), destroy: vi.fn() }
    graphic.setOrigin.mockReturnValue(graphic)
    scene.add = { rectangle: () => graphic, container: () => graphic, text: () => graphic }
    scene.displayGTRField = vi.fn()
    scene.resetGame = vi.fn()
    scene.actionInput.pressPhysical('Space')
    scene.showDetailedResult(GTRDetector.detectGTR(Array.from({ length: 13 }, () => Array(6).fill(null))))
    expect(scene.actionInput.isGated()).toBe(true)
    scene.actionInput.press('newGame', 'key:Space')
    expect(scene.actionInput.frame(501)).toEqual(new Set())
    scene.actionInput.releasePhysical('Space')
    scene.actionInput.press('newGame', 'key:Space')
    expect(scene.actionInput.frame(502)).toEqual(new Set(['newGame']))
  })

  it('does not advance gravity when input opens the result screen in the same frame', () => {
    const scene = createHarness()
    justDown.mockReturnValue(false)
    scene.gameState = { gameOver: false, field: {} }
    scene.isGravityEnabled = true
    scene.handleInput = vi.fn(() => { scene.isPaused = true; scene.isShowingResult = true })
    scene.updateFalling = vi.fn()
    scene.updateDisplay = vi.fn()
    scene.update(1500)
    expect(scene.handleInput).toHaveBeenCalledOnce()
    expect(scene.updateFalling).not.toHaveBeenCalled()
    expect(scene.updateDisplay).not.toHaveBeenCalled()
  })

  it('tracks a held pause key through report close until release', () => {
    const scene = createHarness()
    scene.actionInput.pressPhysical('Escape')
    scene.isReportPanelOpen = true
    scene.handleReportClose()
    expect(scene.actionInput.isGated()).toBe(true)
    scene.actionInput.pressPhysical('Escape', true)
    expect(scene.actionInput.frame(501)).toEqual(new Set())
    scene.actionInput.releasePhysical('Escape')
    expect(scene.actionInput.isGated()).toBe(false)
    scene.actionInput.pressPhysical('Escape')
    expect(scene.actionInput.frame(502)).toEqual(new Set(['pause']))
  })

  it('freezes and restores the prior Phaser clock and tween states idempotently', () => {
    const scene = createHarness()

    scene.freezeInspection()
    scene.freezeInspection()
    expect(scene.time.paused).toBe(true)
    expect(scene.tweens.timeScale).toBe(0)

    scene.unfreezeInspection()
    expect(scene.time.paused).toBe(false)
    expect(scene.tweens.timeScale).toBe(0.75)
  })

  it('restores keyboard and inspection state after closing a report while held input stays gated', () => {
    const scene = createHarness()
    scene.isReportPanelOpen = true
    scene.isInspectionFrozen = true
    scene.keyboardWasEnabled = false
    scene.keyboardPreventDefaultWas = false
    scene.actionInput.pressPhysical('KeyR')
    scene.handleReportClose()
    expect(scene.isReportPanelOpen).toBe(false)
    expect(scene.input.keyboard.enabled).toBe(false)
    expect(scene.input.keyboard.manager.preventDefault).toBe(false)
    expect(scene.actionInput.isGated()).toBe(true)
    expect(scene.isInspectionFrozen).toBe(false)
    scene.actionInput.releasePhysical('KeyR')
    expect(scene.actionInput.isGated()).toBe(false)
  })

  it('does not process an old key held across explicit replay resume', () => {
    const scene = createHarness()
    scene.isReplayInspection = true
    scene.isInspectionFrozen = true
    scene.actionInput.pressPhysical('ArrowRight')
    scene.handleReplayResume()
    expect(scene.isReplayInspection).toBe(false)
    expect(scene.actionInput.isGated()).toBe(true)
    expect(scene.actionInput.frame(501)).toEqual(new Set())
    scene.handleWindowBlur()
    expect(scene.actionInput.isGated()).toBe(false)
    expect(scene.actionInput.frame(502)).toEqual(new Set())
  })

  it('suppresses every held action across a state transition', () => {
    const scene = createHarness()
    scene.actionInput.pressPhysical('Escape')
    scene.actionInput.pressPhysical('ArrowLeft')
    scene.suppressHeldInputUntilRelease()
    expect(scene.actionInput.isGated()).toBe(true)
    expect(scene.actionInput.frame(501)).toEqual(new Set())
    scene.actionInput.releasePhysical('Escape')
    scene.actionInput.releasePhysical('ArrowLeft')
    expect(scene.actionInput.isGated()).toBe(false)
  })

  it('records the terminal state without drawing a game-over overlay', () => {
    const scene = createHarness()
    const terminalField = { width: 6, height: 13, grid: [] }
    const saveState = vi.fn()
    scene.gameField = { isGameOver: () => true, getField: () => terminalField }
    scene.gameState = { gameOver: false, field: {}, pairRandomState: 1 }
    scene.gameHistory = { saveState }
    scene.pairRandom = { getState: () => 987 }
    scene.showGameOver = vi.fn()

    scene.spawnNextPair()

    expect(scene.gameState.gameOver).toBe(true)
    expect(scene.gameState.field).toBe(terminalField)
    expect(scene.gameState.pairRandomState).toBe(987)
    expect(saveState).toHaveBeenCalledOnce()
    expect(scene.showGameOver).not.toHaveBeenCalled()
  })

  it('routes result input to the result action without moving the board', () => {
    const scene = createHarness() as SceneHarness & { restartFromResult: ReturnType<typeof vi.fn> }
    scene.isShowingResult = true
    scene.gameState = { gameOver: false, field: {} }
    scene.restartFromResult = vi.fn()
    scene.handleInput = vi.fn()
    scene.actionInput.press('newGame', 'key:Space')
    scene.update(501)
    expect(scene.restartFromResult).toHaveBeenCalledOnce()
    expect(scene.handleInput).not.toHaveBeenCalled()
  })

  it('rejects mobile evaluation during replay inspection and allows one retry only after explicit resume', () => {
    const scene = createHarness() as any
    const board = resultGrid()
    scene.gameField = { getField: () => board }
    scene.gameState = { field: board, gameOver: false, pairRandomState: 718 }
    scene.turnHistory = [{ turn: 1 }]
    scene.gameHistory = { getHistoryLength: () => 1 }
    scene.pairRandom = { getState: () => 718 }
    const manager = Object.create(GameManager.prototype) as any
    manager.game = { scene: { getScenes: () => [scene] } }
    manager.suspended = false
    scene.isShowingResult = true
    scene.isReplayInspection = true
    scene.isInspectionFrozen = true
    scene.isPaused = true
    scene.time.paused = true
    scene.resultPlayback = { update: vi.fn(), cancel: vi.fn() }
    scene.time.delayedCall = vi.fn()
    scene.resetGame = vi.fn()
    scene.startGame = vi.fn()
    const before = {
      field: structuredClone(scene.gameField.getField()),
      state: structuredClone(scene.gameState),
      turns: structuredClone(scene.turnHistory),
      history: scene.gameHistory.getHistoryLength(),
      random: scene.pairRandom.getState(),
      generation: scene.resultGeneration,
    }
    manager.pressAction('evaluate', 'pointer:evaluate:1')
    manager.releaseAction('pointer:evaluate:1')
    scene.update(501)
    expect(scene.resultPlayback.cancel).not.toHaveBeenCalled()
    expect(scene.time.delayedCall).not.toHaveBeenCalled()
    expect(scene.resultGeneration).toBe(before.generation)
    expect(scene.gameField.getField()).toEqual(before.field)
    expect(scene.gameState).toEqual(before.state)
    expect(scene.turnHistory).toEqual(before.turns)
    expect(scene.gameHistory.getHistoryLength()).toBe(before.history)
    expect(scene.pairRandom.getState()).toBe(before.random)

    scene.handleReplayResume()
    scene.update(502)
    expect(scene.time.delayedCall).not.toHaveBeenCalled()
    manager.pressAction('evaluate', 'pointer:evaluate:2')
    manager.releaseAction('pointer:evaluate:2')
    scene.update(503)
    expect(scene.time.delayedCall).toHaveBeenCalledOnce()
    scene.time.delayedCall.mock.calls[0][1]()
    expect(scene.resetGame).toHaveBeenCalledOnce()
    expect(scene.startGame).toHaveBeenCalledOnce()
  })

  it('does not let a mobile rewind bypass the user pause during chain playback', () => {
    const scene = createHarness() as any
    const manager = Object.create(GameManager.prototype) as any
    manager.game = { scene: { getScenes: () => [scene] } }
    scene.isPaused = true
    scene.chainPlayback = { update: vi.fn() }
    scene.cancelPendingTurn = vi.fn()
    manager.pressAction('rewind', 'pointer:rewind:1')
    manager.releaseAction('pointer:rewind:1')
    scene.update(501, 16)
    expect(scene.cancelPendingTurn).not.toHaveBeenCalled()
  })

  it('advances result playback while the game is paused, but stops during sharing and replay inspection', () => {
    const scene = createHarness() as SceneHarness & { resultPlayback: { update: ReturnType<typeof vi.fn> } }
    scene.isShowingResult = true
    scene.isPaused = true
    scene.resultPlayback = { update: vi.fn() }
    scene.update(501, 50)
    expect(scene.resultPlayback.update).toHaveBeenCalledWith(50)
    scene.isReportPanelOpen = true
    scene.update(502, 50)
    scene.isReportPanelOpen = false
    scene.isReplayInspection = true
    scene.update(503, 50)
    scene.isReplayInspection = false
    testDocument.hidden = true
    try { scene.update(504, 50) } finally { testDocument.hidden = false }
    expect(scene.resultPlayback.update).toHaveBeenCalledOnce()
  })

  it('draws the hypothetical starter but omits all other out-of-range cells', () => {
    const scene = createHarness() as SceneHarness & {
      add: unknown
      displayGTRField: (container: unknown, x: number, y: number) => (frame: unknown) => void
    }
    const layer = { add: vi.fn(), removeAll: vi.fn() }
    const rectangle = { setStrokeStyle: vi.fn(), setFillStyle: vi.fn() }
    const addRectangle = vi.fn((_x: number, _y: number, _width: number, _height: number) => rectangle)
    const sprite = { setDisplaySize: vi.fn(), setAlpha: vi.fn() }
    const addSprite = vi.fn((_x: number, _y: number, _texture: string, _frame: string) => sprite)
    scene.add = {
      rectangle: addRectangle, container: vi.fn(() => layer), sprite: addSprite,
      text: vi.fn(() => ({ texture: { setFilter: vi.fn() }, setOrigin: vi.fn().mockReturnThis() })),
    }
    const grid = Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null))
    grid[9][0] = PuyoColor.RED // hypothetical starter, outside the grading range
    grid[9][1] = PuyoColor.BLUE // never display a real out-of-range cell
    grid[9][2] = PuyoColor.GREEN
    const render = scene.displayGTRField(layer, -180, 92)
    render({ grid, fading: [], alpha: 1, chainIndex: null,
      starterPosition: { x: 0, y: 9 }, phase: 'initial' })
    expect(addSprite).toHaveBeenCalledTimes(2)
    expect(addSprite.mock.calls.map(call => call[3])).toEqual(['red/mini12', 'green/mini12'])
    expect(rectangle.setFillStyle).toHaveBeenCalledWith(0, 0)
    expect(addRectangle.mock.calls[1].slice(0, 2)).toEqual([-300, 116])

    const settled = structuredClone(grid)
    settled[9][0] = null
    settled[10][0] = PuyoColor.RED // starter and another red are distinct individuals
    settled[11][0] = PuyoColor.RED
    render({ grid: settled, fading: [{ x: 0, y: 10 }], alpha: 0.5,
      chainIndex: 1, starterPosition: { x: 0, y: 10 }, phase: 'fade' })
    expect(addRectangle.mock.calls[2].slice(0, 2)).toEqual([-300, 164])
    render({ grid: settled, fading: [], alpha: 1,
      chainIndex: 1, starterPosition: null, phase: 'gap' })
    expect(addRectangle).toHaveBeenCalledTimes(3) // background plus two tracked markers
  })

  it('cancels result playback and blocks a delayed new game after disposal', () => {
    const { scene, field } = createResultHarness()
    const delayedCall = vi.fn()
    Object.assign(scene.time, { delayedCall })
    const runtime = scene as typeof scene & { restartFromResult: () => void; resetGame: ReturnType<typeof vi.fn>;
      startGame: ReturnType<typeof vi.fn> }
    runtime.resetGame = vi.fn()
    runtime.startGame = vi.fn()
    scene.showDetailedResult(GTRDetector.detectGTR(field.grid))
    const cancel = vi.spyOn(scene.resultPlayback!, 'cancel')
    runtime.restartFromResult()
    expect(cancel).toHaveBeenCalledOnce()
    expect(delayedCall).toHaveBeenCalledOnce()
    scene.isDisposed = true
    delayedCall.mock.calls[0][1]()
    expect(runtime.resetGame).not.toHaveBeenCalled()
    expect(runtime.startGame).not.toHaveBeenCalled()
  })

  it('replays only through the guarded button and leaves game data unchanged', () => {
    const { scene, field, texts } = createResultHarness()
    const before = {
      field: structuredClone(field), state: structuredClone(scene.gameState),
      turns: structuredClone(scene.turnHistory), random: scene.pairRandom.getState(),
      advice: scene.currentAdvice,
    }
    scene.showDetailedResult(GTRDetector.detectGTR(field.grid))
    const playback = scene.resultPlayback!
    const replay = vi.spyOn(playback, 'replay')
    const button = texts.get('もう一度')!
    const pointerdown = button.on.mock.calls.find(call => call[0] === 'pointerdown')![1]
    pointerdown()
    expect(replay).toHaveBeenCalledOnce()
    scene.isReportPanelOpen = true
    pointerdown()
    scene.isReportPanelOpen = false
    scene.isReplayInspection = true
    pointerdown()
    scene.isReplayInspection = false
    scene.actionInput.pressPhysical('KeyX')
    scene.actionInput.suppressUntilRelease()
    pointerdown()
    scene.actionInput.releasePhysical('KeyX')
    testDocument.hidden = true
    try { pointerdown() } finally { testDocument.hidden = false }
    expect(replay).toHaveBeenCalledOnce()
    for (let frame = 0; frame < 120; frame++) scene.update(500 + frame * 50, 50)
    expect(playback.isFinished).toBe(true)
    pointerdown()
    expect(replay).toHaveBeenCalledTimes(2)
    expect(field).toEqual(before.field)
    expect(scene.gameState).toEqual(before.state)
    expect(scene.turnHistory).toEqual(before.turns)
    expect(scene.pairRandom.getState()).toBe(before.random)
    expect(scene.currentAdvice).toBe(before.advice)
  })

  it('replaces the result playback and cancels the old trace', () => {
    const { scene, field } = createResultHarness()
    const result = GTRDetector.detectGTR(field.grid)
    scene.showDetailedResult(result)
    const oldPlayback = scene.resultPlayback!
    const cancel = vi.spyOn(oldPlayback, 'cancel')
    scene.showDetailedResult(result)
    expect(cancel).toHaveBeenCalledOnce()
    expect(scene.resultPlayback).not.toBe(oldPlayback)
  })

  it('cancels the trace on result Escape before exit', () => {
    const { scene, field } = createResultHarness()
    scene.showDetailedResult(GTRDetector.detectGTR(field.grid))
    const cancel = vi.spyOn(scene.resultPlayback!, 'cancel')
    scene.actionInput.press('exit', 'key:Escape')
    scene.update(501)
    expect(cancel).toHaveBeenCalledOnce()
    expect(scene.resultPlayback).toBeUndefined()
    expect(scene.isShowingResult).toBe(false)
    expect(scene.game.registry.get).toHaveBeenCalledWith('onExit')
  })

  it('cancels the trace on result Space and blocks stale delayed reset after replacement', () => {
    const { scene, field } = createResultHarness()
    const delayedCall = vi.fn()
    Object.assign(scene.time, { delayedCall })
    const result = GTRDetector.detectGTR(field.grid)
    scene.showDetailedResult(result)
    const cancel = vi.spyOn(scene.resultPlayback!, 'cancel')
    scene.actionInput.press('newGame', 'key:Space')
    scene.update(501)
    expect(cancel).toHaveBeenCalledOnce()
    scene.showDetailedResult(result)
    delayedCall.mock.calls[0][1]()
    expect(scene.isShowingResult).toBe(true)
    expect(scene.resultPlayback).toBeDefined()
  })

  it('cancels result playback exactly once on repeated cleanup', () => {
    const { scene, field } = createResultHarness()
    scene.showDetailedResult(GTRDetector.detectGTR(field.grid))
    const cancel = vi.spyOn(scene.resultPlayback!, 'cancel')
    scene.cleanupResult()
    scene.cleanupResult()
    expect(cancel).toHaveBeenCalledOnce()
    expect(scene.resultPlayback).toBeUndefined()
  })

  it('keeps result actions gated until held keys are released', () => {
    const scene = createHarness()
    scene.actionInput.pressPhysical('Space')
    scene.actionInput.suppressUntilRelease()
    scene.actionInput.press('newGame', 'key:Space')
    expect(scene.actionInput.frame(501)).toEqual(new Set())
    scene.actionInput.releasePhysical('Space')
    scene.actionInput.press('newGame', 'key:Space')
    expect(scene.actionInput.frame(502)).toEqual(new Set(['newGame']))
  })

  it('reports the completed final turn instead of a nonexistent next turn on game over', () => {
    const scene = createHarness()
    scene.turnHistory = [{ turn: 6 }]
    scene.gameState = { gameOver: false, field: {} }
    expect(scene.getReportTurnNumber()).toBe(7)

    scene.gameState.gameOver = true
    expect(scene.getReportTurnNumber()).toBe(6)
  })

  it('reports the advice that was actually presented and omits it when the guide is off', () => {
    const scene = createHarness()
    const presentedAdvice = { phaseMessage: 'presented advice' }
    scene.currentAdvice = presentedAdvice
    scene.isAdvisorEnabled = true
    expect(scene.getReportAdvice()).toBe(presentedAdvice)

    scene.isAdvisorEnabled = false
    expect(scene.getReportAdvice()).toBeNull()
  })

  it('automatically starts a new game instead of waiting for game-over rewind', () => {
    const scene = createHarness() as SceneHarness & { resetGame: ReturnType<typeof vi.fn>; startGame: ReturnType<typeof vi.fn> }
    scene.gameState = { gameOver: true, field: {} }
    scene.rewind = vi.fn()
    scene.resetGame = vi.fn(() => { scene.gameState.gameOver = false })
    scene.startGame = vi.fn()
    scene.handleInput = vi.fn()
    scene.updateFalling = vi.fn()
    scene.updateDisplay = vi.fn()
    scene.actionInput.press('rewind', 'key:KeyU')
    scene.update(501)
    expect(scene.rewind).not.toHaveBeenCalled()
    expect(scene.resetGame).toHaveBeenCalledOnce()
    expect(scene.startGame).toHaveBeenCalledOnce()
    expect(scene.handleInput).not.toHaveBeenCalled()
  })

  it.each(['isPaused', 'isReportPanelOpen', 'isReplayInspection', 'isDisposed', 'isVisualStopped', 'hidden'])('holds the terminal board while %s', state => {
    const scene = createHarness() as SceneHarness & { resetGame: ReturnType<typeof vi.fn>; startGame: ReturnType<typeof vi.fn> }
    scene.gameState = { gameOver: true, field: {} }
    scene.resetGame = vi.fn()
    scene.startGame = vi.fn()
    if (state === 'hidden') vi.stubGlobal('document', { hidden: true })
    else Object.assign(scene, { [state]: true })
    scene.update(501)
    expect(scene.resetGame).not.toHaveBeenCalled()
    expect(scene.startGame).not.toHaveBeenCalled()
    expect(scene.gameState.gameOver).toBe(true)
  })
})
