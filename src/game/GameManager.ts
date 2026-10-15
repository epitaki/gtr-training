import type { PairColors } from './core/PairSequence'
import * as Phaser from 'phaser'
import PuyoGame from './scenes/PuyoGame'
import MenuScene from './scenes/MenuScene'
import GuidedPracticeScene from './scenes/GuidedPracticeScene'
import { LAYOUT_GUIDED, LAYOUT_SCORE_ATTACK } from './rendering/VisualConfig'
import type { GameAction } from './input/bindings'
import type { ScoreAttackSnapshot } from './scoreAttack/types'

export class GameManager {
  private game?: Phaser.Game
  private config: Phaser.Types.Core.GameConfig
  private suspended = false
  private pausedByGallery = false
  private inputEnabledBeforeGallery: boolean | null = null
  private keyboardEnabledBeforeGallery: boolean | null = null
  public onExit?: () => void
  public onScoreAttackRound?: (snapshot: ScoreAttackSnapshot) => void
  public getScoreAttackTotal?: () => number | null

  constructor() {
    this.config = {
      type: Phaser.AUTO,
      width: LAYOUT_GUIDED.CANVAS_WIDTH,
      height: LAYOUT_GUIDED.CANVAS_HEIGHT,
      parent: 'phaser-game',
      backgroundColor: '#12121a',
      scene: [MenuScene, GuidedPracticeScene, PuyoGame],
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0, x: 0 },
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    }
  }

  start(): void {
    if (this.game) {
      this.game.destroy(true)
    }
    this.attachGame(new Phaser.Game(this.config))
  }

  startGuidedPractice(practiceSequence?: readonly PairColors[]): void {
    if (this.game) {
      this.game.destroy(true)
    }

    const guidedConfig = {
      ...this.config,
      width: LAYOUT_GUIDED.CANVAS_WIDTH,
      scene: [practiceSequence ? new GuidedPracticeScene(practiceSequence) : GuidedPracticeScene]
    }

    this.attachGame(new Phaser.Game(guidedConfig))

    if (this.game && this.onExit) {
      this.game.registry.set('onExit', this.onExit)
    }
  }

  startScoreAttack(): void {
    if (this.game) {
      this.game.destroy(true)
    }

    const scoreAttackConfig = {
      ...this.config,
      width: LAYOUT_SCORE_ATTACK.CANVAS_WIDTH,
      scene: [new PuyoGame(this.onScoreAttackRound, this.getScoreAttackTotal)]
    }

    this.attachGame(new Phaser.Game(scoreAttackConfig))

    if (this.game && this.onExit) {
      this.game.registry.set('onExit', this.onExit)
    }
  }

  destroy(): void {
    if (this.game) {
      this.game.destroy(true)
      this.game = undefined
    }
    this.pausedByGallery = false
    this.inputEnabledBeforeGallery = null
    this.keyboardEnabledBeforeGallery = null
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return
    this.suspended = suspended
    this.applySuspension()
  }

  private attachGame(game: Phaser.Game): void {
    this.game = game
    this.pausedByGallery = false
    this.inputEnabledBeforeGallery = null
    this.keyboardEnabledBeforeGallery = null
    // The keyboard manager boots after Game construction and resets `enabled`.
    // BOOT closes that gap; READY covers delayed texture/scene setup as well.
    const reapply = () => {
      if (this.game === game) this.applySuspension()
    }
    game.events.once(Phaser.Core.Events.BOOT, reapply)
    game.events.once(Phaser.Core.Events.READY, reapply)
    this.applySuspension()
  }

  private applySuspension(): void {
    const game = this.game
    if (!game) return
    const keyboard = game.isBooted ? game.input.keyboard : null
    if (this.suspended) {
      if (game.isBooted && this.inputEnabledBeforeGallery === null) {
        this.inputEnabledBeforeGallery = game.input.enabled
        game.input.enabled = false
      }
      if (this.keyboardEnabledBeforeGallery === null && keyboard) {
        this.keyboardEnabledBeforeGallery = keyboard.enabled
        keyboard.enabled = false
      }
      if (!game.isPaused) {
        game.pause()
        this.pausedByGallery = true
      }
      return
    }
    if (this.inputEnabledBeforeGallery !== null) {
      if (!game.input.enabled) game.input.enabled = this.inputEnabledBeforeGallery
      this.inputEnabledBeforeGallery = null
    }
    if (keyboard && this.keyboardEnabledBeforeGallery !== null) {
      if (!keyboard.enabled) keyboard.enabled = this.keyboardEnabledBeforeGallery
      this.keyboardEnabledBeforeGallery = null
    }
    if (game.isBooted) this.prepareSceneInput(game)
    if (this.pausedByGallery && game.isPaused) game.resume()
    this.pausedByGallery = false
  }

  private prepareSceneInput(game: Phaser.Game): void {
    for (const scene of game.scene.getScenes(true)) {
      if (scene instanceof GuidedPracticeScene || scene instanceof PuyoGame) {
        scene.prepareExternalResume()
      }
    }
  }

  getGame(): Phaser.Game | undefined {
    return this.game
  }

  pressAction(action: GameAction, source: string): void {
    if (this.suspended) return
    for (const scene of this.game?.scene.getScenes(true) ?? []) {
      if (scene instanceof GuidedPracticeScene || scene instanceof PuyoGame) scene.pressAction(action, source)
    }
  }

  releaseAction(source: string): void {
    for (const scene of this.game?.scene.getScenes(true) ?? []) {
      if (scene instanceof GuidedPracticeScene || scene instanceof PuyoGame) scene.releaseAction(source)
    }
  }

  captureScreenshot(): Promise<Blob> {
    if (!this.game) return Promise.reject(new Error('ゲーム画面の準備ができていません'))

    return new Promise((resolve, reject) => {
      let settled = false
      const settle = <T>(callback: (value: T) => void, value: T) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeout)
        callback(value)
      }
      const timeout = globalThis.setTimeout(() => {
        settle(reject, new Error('ゲーム画面の取得がタイムアウトしました'))
      }, 5000)

      try {
        this.game!.renderer.snapshot(snapshot => {
          if (!snapshot || !('src' in snapshot) || typeof snapshot.src !== 'string' || !snapshot.src) {
            settle(reject, new Error('ゲーム画面を画像に変換できませんでした'))
            return
          }
          fetch(snapshot.src)
            .then(response => {
              if (!response.ok) throw new Error('ゲーム画面を画像に変換できませんでした')
              return response.blob()
            })
            .then(blob => settle(resolve, blob), error => settle(reject, error))
        }, 'image/png', 1)
      } catch (error) {
        settle(reject, error)
      }
    })
  }
}
