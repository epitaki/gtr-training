import * as Phaser from 'phaser'
import PuyoGame from './PuyoGame'
import MenuScene from './scenes/MenuScene'
import GuidedPracticeScene from './scenes/GuidedPracticeScene'
import { LAYOUT_GUIDED, LAYOUT_SCORE_ATTACK } from './VisualConfig'

export class GameManager {
  private game?: Phaser.Game
  private config: Phaser.Types.Core.GameConfig
  public onExit?: () => void

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
    this.game = new Phaser.Game(this.config)
  }

  startGuidedPractice(): void {
    if (this.game) {
      this.game.destroy(true)
    }

    const guidedConfig = {
      ...this.config,
      width: LAYOUT_GUIDED.CANVAS_WIDTH,
      scene: [GuidedPracticeScene]
    }

    this.game = new Phaser.Game(guidedConfig)

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
      scene: [PuyoGame]
    }

    this.game = new Phaser.Game(scoreAttackConfig)

    if (this.game && this.onExit) {
      this.game.registry.set('onExit', this.onExit)
    }
  }

  destroy(): void {
    if (this.game) {
      this.game.destroy(true)
      this.game = undefined
    }
  }

  getGame(): Phaser.Game | undefined {
    return this.game
  }
}
