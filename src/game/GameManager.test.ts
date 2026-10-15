import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  AUTO: 0,
  Core: { Events: { BOOT: 'boot', READY: 'ready' } },
  Scale: { NONE: 0, CENTER_BOTH: 0 },
  Scene: class {},
  Game: class {
    isBooted = false
    isPaused = false
    input = { enabled: true, keyboard: { enabled: false } }
    activeScenes: unknown[] = []
    scene = { getScenes: () => this.activeScenes }
    registry = { set: vi.fn() }
    private callbacks = new Map<string, (() => void)[]>()
    events = { once: (event: string, callback: () => void) => {
      this.callbacks.set(event, [...this.callbacks.get(event) ?? [], callback])
    } }
    pause = vi.fn(() => { this.isPaused = true })
    resume = vi.fn(() => { this.isPaused = false })
    destroy = vi.fn()
    ready() {
      this.isBooted = true
      this.input.keyboard.enabled = true
      this.callbacks.get('boot')?.forEach(callback => callback())
      this.callbacks.get('ready')?.forEach(callback => callback())
    }
  },
}))

import { GameManager } from './GameManager'
import PuyoGame from './scenes/PuyoGame'

type SnapshotCallback = (snapshot: { src: string } | undefined) => void
type GameManagerHarness = {
  game?: {
    renderer: {
      snapshot: (callback: SnapshotCallback, type: string, quality: number) => void
    }
  }
}
type RendererSnapshot = NonNullable<GameManagerHarness['game']>['renderer']['snapshot']
type RunningGame = {
  isPaused: boolean
  input: { enabled: boolean; keyboard: { enabled: boolean } }
  activeScenes: unknown[]
  ready: () => void
  pause: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
}

const attachRenderer = (
  manager: GameManager,
  snapshot: RendererSnapshot,
) => {
  ;(manager as unknown as GameManagerHarness).game = { renderer: { snapshot } }
}

describe('GameManager.captureScreenshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the renderer post-frame snapshot and returns its PNG blob', async () => {
    const manager = new GameManager()
    const snapshot = vi.fn((callback: SnapshotCallback) => {
      callback({ src: 'data:image/png;base64,AQID' })
    })
    attachRenderer(manager, snapshot)

    const blob = await manager.captureScreenshot()

    expect(snapshot).toHaveBeenCalledWith(expect.any(Function), 'image/png', 1)
    expect(blob.type).toBe('image/png')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('rejects a missing or invalid renderer snapshot', async () => {
    const manager = new GameManager()
    await expect(manager.captureScreenshot()).rejects.toThrow('準備ができていません')

    attachRenderer(manager, (callback: SnapshotCallback) => callback(undefined))
    await expect(manager.captureScreenshot()).rejects.toThrow('画像に変換できませんでした')

    attachRenderer(manager, () => { throw new Error('renderer stopped') })
    await expect(manager.captureScreenshot()).rejects.toThrow('renderer stopped')
  })
})

describe('GameManager gallery suspension', () => {
  it('retains a request made before the delayed game starts and reapplies it after keyboard boot', () => {
    const manager = new GameManager()
    manager.setSuspended(true)
    manager.startGuidedPractice()
    const game = manager.getGame() as unknown as RunningGame
    expect(game.isPaused).toBe(true)
    game.ready()
    expect(game.input.keyboard.enabled).toBe(false)
    expect(game.input.enabled).toBe(false)
    manager.setSuspended(false)
    expect(game.isPaused).toBe(false)
    expect(game.input.keyboard.enabled).toBe(true)
    expect(game.input.enabled).toBe(true)
    expect(game.resume).toHaveBeenCalledOnce()
  })

  it('does not apply a stale suspension if the gallery closes before boot', () => {
    const manager = new GameManager()
    manager.setSuspended(true)
    manager.startGuidedPractice()
    const game = manager.getGame() as unknown as RunningGame
    manager.setSuspended(false)
    game.ready()
    expect(game.isPaused).toBe(false)
    expect(game.input.enabled).toBe(true)
    expect(game.input.keyboard.enabled).toBe(true)
  })

  it('stops an already running game and restores its exact prior pause and keyboard state', () => {
    const manager = new GameManager()
    manager.startScoreAttack()
    const game = manager.getGame() as unknown as RunningGame
    game.ready()
    game.isPaused = true
    game.input.enabled = false
    game.input.keyboard.enabled = false
    manager.setSuspended(true)
    expect(game.pause).not.toHaveBeenCalled()
    manager.setSuspended(false)
    expect(game.resume).not.toHaveBeenCalled()
    expect(game.input.keyboard.enabled).toBe(false)
    expect(game.input.enabled).toBe(false)

    game.isPaused = false
    game.input.enabled = true
    game.input.keyboard.enabled = true
    manager.setSuspended(true)
    expect(game.isPaused).toBe(true)
    expect(game.input.keyboard.enabled).toBe(false)
    expect(game.input.enabled).toBe(false)
    manager.setSuspended(false)
    expect(game.isPaused).toBe(false)
    expect(game.input.keyboard.enabled).toBe(true)
    expect(game.input.enabled).toBe(true)
  })

  it('clears scene key latches before resuming and ignores stale READY from an old game', () => {
    const manager = new GameManager()
    manager.setSuspended(true)
    manager.startScoreAttack()
    const oldGame = manager.getGame() as unknown as RunningGame
    manager.startScoreAttack()
    const game = manager.getGame() as unknown as RunningGame
    oldGame.ready()
    game.ready()
    const scene = Object.create(PuyoGame.prototype) as PuyoGame
    scene.prepareExternalResume = vi.fn()
    game.activeScenes.push(scene)
    manager.setSuspended(false)
    expect(scene.prepareExternalResume).toHaveBeenCalledOnce()
    expect(game.isPaused).toBe(false)
    expect(game.input.keyboard.enabled).toBe(true)
  })
})
