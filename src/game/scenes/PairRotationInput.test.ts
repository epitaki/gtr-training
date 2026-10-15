import { describe, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({ Scene: class {} }))

import GuidedPracticeScene from './GuidedPracticeScene'
import PuyoGame from './PuyoGame'
import { GameFieldManager } from '../core/GameField'
import { PuyoColor, type PuyoPair } from '../core/types'
import type { GameAction } from '../input/bindings'

type Harness = {
  gameField: GameFieldManager
  gameState: { currentPair: PuyoPair }
  handleInput(actions: Set<GameAction>): void
}

describe.each([GuidedPracticeScene, PuyoGame])('%s rotation input', Scene => {
  it.each(['rotateLeft', 'rotateRight'] as const)('applies the vertical swap via %s in both modes', action => {
    const scene = new Scene() as unknown as Harness
    scene.gameField = new GameFieldManager()
    for (const x of [1, 3]) for (const y of [7, 8, 9]) scene.gameField.placePuyo(x, y, PuyoColor.BLUE)
    scene.gameState.currentPair = {
      main: { color: PuyoColor.GREEN, x: 2, y: 9 }, sub: { color: PuyoColor.RED, x: 2, y: 8 },
      rotation: 0, falling: true,
    }
    const original = structuredClone(scene.gameState.currentPair)
    scene.handleInput(new Set([action]))
    expect(scene.gameState.currentPair.rotation).toBe(2)
    expect(scene.gameState.currentPair.main).toEqual({ color: PuyoColor.GREEN, x: 2, y: 8 })
    expect(scene.gameState.currentPair.sub).toEqual({ color: PuyoColor.RED, x: 2, y: 9 })
    scene.handleInput(new Set([action]))
    expect(scene.gameState.currentPair).toEqual(original)
  })

  it('rotates the current position after a down input in the same frame', () => {
    const scene = new Scene() as unknown as Harness
    scene.gameField = new GameFieldManager()
    for (const x of [1, 3]) scene.gameField.placePuyo(x, 9, PuyoColor.BLUE)
    scene.gameState.currentPair = {
      main: { color: PuyoColor.GREEN, x: 2, y: 8 }, sub: { color: PuyoColor.RED, x: 2, y: 7 },
      rotation: 0, falling: true,
    }
    scene.handleInput(new Set(['softDrop', 'rotateRight']))
    expect(scene.gameState.currentPair.rotation).toBe(2)
    expect(scene.gameState.currentPair.main.y).toBe(8)
    expect(scene.gameState.currentPair.sub.y).toBe(9)
  })
})
