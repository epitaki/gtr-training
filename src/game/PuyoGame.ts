import * as Phaser from 'phaser'
import { GameFieldManager } from './GameField'
import { PuyoPairManager } from './PuyoPair'
import { GameState } from './types'
import { GTRDetector, GTRScore } from './GTRPatterns'
import { PuyoRenderer } from './PuyoRenderer'
import { FIELD_CONFIG, LAYOUT_SCORE_ATTACK, NEXT_AREA_CONFIG, TEXT_STYLES, ANIMATION_CONFIG } from './VisualConfig'

export default class PuyoGame extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private zKey?: Phaser.Input.Keyboard.Key
  private xKey?: Phaser.Input.Keyboard.Key
  private spaceKey?: Phaser.Input.Keyboard.Key
  private escKey?: Phaser.Input.Keyboard.Key
  private fKey?: Phaser.Input.Keyboard.Key

  // ゲーム状態
  private gameField: GameFieldManager
  private gameState: GameState
  private isGravityEnabled: boolean = true

  // 描画関連
  private fieldSprites: (Phaser.GameObjects.Sprite | null)[][] = []
  private currentPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextNextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}

  // GTR表示関連
  private gtrScoreText?: Phaser.GameObjects.Text
  private gtrCountText?: Phaser.GameObjects.Text
  private gtrQualityText?: Phaser.GameObjects.Text
  private gravityStatusText?: Phaser.GameObjects.Text

  // レイアウト設定（VisualConfigから）
  private readonly CELL_SIZE = FIELD_CONFIG.CELL_SIZE
  private readonly FIELD_X = LAYOUT_SCORE_ATTACK.FIELD_X
  private readonly FIELD_Y = LAYOUT_SCORE_ATTACK.FIELD_Y
  private readonly FALL_SPEED = 800

  // 着地アニメーション用
  private landedPositions: Set<string> = new Set()

  // タイマー
  private lastFallTime = 0
  private lastMoveTime = 0
  private readonly MOVE_DELAY = 150

  constructor() {
    super({ key: 'PuyoGame' })
    this.gameField = new GameFieldManager()
    this.gameState = this.createInitialGameState()
  }

  private createInitialGameState(): GameState {
    const twoHandCombination = PuyoPairManager.createValidTwoHandCombination()

    return {
      field: this.gameField.getField(),
      currentPair: twoHandCombination.pair1,
      nextPair: twoHandCombination.pair2,
      nextNextPair: PuyoPairManager.createRandomPair(),
      score: 0,
      gtrCount: 0,
      gtrScore: 0,
      gameOver: false
    }
  }

  preload() {
    PuyoRenderer.createTextures(this)
    PuyoRenderer.createGhostTextures(this)
  }

  create() {
    const canvasW = LAYOUT_SCORE_ATTACK.CANVAS_WIDTH
    const canvasH = LAYOUT_SCORE_ATTACK.CANVAS_HEIGHT

    // 背景
    this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, LAYOUT_SCORE_ATTACK.BG_COLOR)

    // フィールドの枠線
    const fieldW = FIELD_CONFIG.COLS * this.CELL_SIZE
    const fieldH = FIELD_CONFIG.ROWS * this.CELL_SIZE
    const fieldCenterX = this.FIELD_X + fieldW / 2
    const fieldCenterY = this.FIELD_Y + fieldH / 2

    // 外枠
    this.add.rectangle(fieldCenterX, fieldCenterY, fieldW + FIELD_CONFIG.FIELD_BORDER_WIDTH * 2, fieldH + FIELD_CONFIG.FIELD_BORDER_WIDTH * 2, FIELD_CONFIG.FIELD_BORDER_COLOR)

    // 内枠（黒いぷよフィールド）
    this.add.rectangle(fieldCenterX, fieldCenterY, fieldW, fieldH, FIELD_CONFIG.FIELD_BG_COLOR)

    // フィールドグリッド
    this.drawGrid()

    // ネクストぷよ表示エリア
    this.createNextAreas()

    // スプライト配列の初期化
    this.initializeSprites()

    // タイトル
    this.add.text(this.FIELD_X, 10, 'GTR Training', {
      ...TEXT_STYLES.title,
    })

    // NEXTエリア下にGTR情報パネルを配置
    const infoPanelX = this.FIELD_X + fieldW + 24
    const nextBoxH = NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2
    const nnBoxH = NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2
    const infoPanelY = this.FIELD_Y + nextBoxH + NEXT_AREA_CONFIG.GAP_BETWEEN + nnBoxH + 30

    // 情報パネル背景
    this.add.rectangle(
      infoPanelX + NEXT_AREA_CONFIG.AREA_WIDTH / 2,
      infoPanelY + 70,
      NEXT_AREA_CONFIG.AREA_WIDTH,
      160,
      NEXT_AREA_CONFIG.BG_COLOR
    ).setStrokeStyle(1, NEXT_AREA_CONFIG.BORDER_COLOR)

    this.gtrCountText = this.add.text(infoPanelX + 10, infoPanelY + 10, 'GTR: 0回', {
      fontSize: '18px',
      color: '#ffdd44',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 2
    })

    this.gtrScoreText = this.add.text(infoPanelX + 10, infoPanelY + 38, 'Score: 0', {
      fontSize: '16px',
      color: '#44dd88',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 2
    })

    this.gtrQualityText = this.add.text(infoPanelX + 10, infoPanelY + 62, '形の質: -', {
      fontSize: '14px',
      color: '#66ccff',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 1
    })

    // 自由落下状態表示（情報パネル内）
    this.gravityStatusText = this.add.text(infoPanelX + 10, infoPanelY + 90, '自由落下: ON', {
      fontSize: '14px',
      color: '#00ff00',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 2
    })
    this.gravityStatusText.setDepth(100)

    // 操作説明（画面下部にコンパクト表示）
    this.add.text(canvasW / 2, canvasH - 12,
      '← → ↓ 移動 | Z X 回転 | F 落下 | Space 評価 | Esc 戻る',
      { fontSize: '12px', color: '#666688', fontFamily: TEXT_STYLES.title.fontFamily }
    ).setOrigin(0.5)

    // キー入力設定
    this.cursors = this.input.keyboard?.createCursorKeys()
    this.zKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.xKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.fKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F)

    // ゲーム開始
    this.startGame()
  }

  update(time: number) {
    if (Phaser.Input.Keyboard.JustDown(this.escKey!)) {
      this.exitToMenu()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.fKey!)) {
      this.toggleGravity()
    }

    if (this.gameState.gameOver) return

    this.handleInput(time)

    if (this.isGravityEnabled) {
      this.updateFalling(time)
    }

    this.updateDisplay()
  }

  private handleInput(time: number) {
    if (!this.gameState.currentPair || time - this.lastMoveTime < this.MOVE_DELAY) {
      return
    }

    const pair = this.gameState.currentPair

    if (this.cursors?.left.isDown) {
      if (PuyoPairManager.canMove(pair, -1, 0, (x, y) => this.gameField.isOccupied(x, y))) {
        this.gameState.currentPair = PuyoPairManager.movePair(pair, -1, 0)
        this.lastMoveTime = time
      }
    }

    if (this.cursors?.right.isDown) {
      if (PuyoPairManager.canMove(pair, 1, 0, (x, y) => this.gameField.isOccupied(x, y))) {
        this.gameState.currentPair = PuyoPairManager.movePair(pair, 1, 0)
        this.lastMoveTime = time
      }
    }

    if (this.cursors?.down.isDown) {
      if (PuyoPairManager.canMove(pair, 0, 1, (x, y) => this.gameField.isOccupied(x, y))) {
        this.gameState.currentPair = PuyoPairManager.movePair(pair, 0, 1)
        this.lastMoveTime = time
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.zKey!)) {
      const newRotation = PuyoPairManager.rotateLeft(pair)
      const rotateResult = PuyoPairManager.canRotate(pair, newRotation, (x, y) => this.gameField.isOccupied(x, y))
      if (rotateResult.canRotate) {
        let updatedPair = pair
        if (rotateResult.offsetX !== 0) {
          updatedPair = PuyoPairManager.movePair(pair, rotateResult.offsetX, 0)
        }
        this.gameState.currentPair = PuyoPairManager.rotatePair(updatedPair, newRotation)
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.xKey!)) {
      const newRotation = PuyoPairManager.rotateRight(pair)
      const rotateResult = PuyoPairManager.canRotate(pair, newRotation, (x, y) => this.gameField.isOccupied(x, y))
      if (rotateResult.canRotate) {
        let updatedPair = pair
        if (rotateResult.offsetX !== 0) {
          updatedPair = PuyoPairManager.movePair(pair, rotateResult.offsetX, 0)
        }
        this.gameState.currentPair = PuyoPairManager.rotatePair(updatedPair, newRotation)
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey!)) {
      this.evaluateAndReset()
    }
  }

  private updateFalling(time: number) {
    if (!this.gameState.currentPair || time - this.lastFallTime < this.FALL_SPEED) {
      return
    }

    const pair = this.gameState.currentPair

    if (PuyoPairManager.canMove(pair, 0, 1, (x, y) => this.gameField.isOccupied(x, y))) {
      this.gameState.currentPair = PuyoPairManager.movePair(pair, 0, 1)
    } else {
      this.landCurrentPair()
    }

    this.lastFallTime = time
  }

  private landCurrentPair() {
    if (!this.gameState.currentPair) return

    const pair = this.gameState.currentPair
    const positions = PuyoPairManager.getRotatedPositions(pair)

    // フィールドに配置
    this.gameField.placePuyo(positions.main.x, positions.main.y, pair.main.color)
    this.gameField.placePuyo(positions.sub.x, positions.sub.y, pair.sub.color)

    // 着地位置を記録（バウンスアニメーション用）
    this.landedPositions.add(`${positions.main.x},${positions.main.y}`)
    this.landedPositions.add(`${positions.sub.x},${positions.sub.y}`)

    // 重力を適用して連鎖処理
    this.processChain()

    // 次のペアを準備
    this.spawnNextPair()
  }

  private processChain() {
    while (this.gameField.applyGravity()) {
      // 落下が完了するまで繰り返し
    }

    const result = this.gameField.clearConnectedPuyos()
    if (result.cleared) {
      this.gameState.score += result.count * 10

      // スコアフロート表示
      const fieldCenterX = this.FIELD_X + 3 * this.CELL_SIZE
      this.playScorePopup(fieldCenterX, this.FIELD_Y + 2 * this.CELL_SIZE, `+${result.count * 10}`)

      // 再帰的に連鎖チェック
      setTimeout(() => this.processChain(), 300)
    } else {
      this.checkGTR()
    }
  }

  private checkGTR() {
    const field = this.gameField.getField()
    const gtrResult = GTRDetector.detectGTR(field.grid)

    if (gtrResult.isGTR) {
      this.gameState.gtrCount++
      this.gameState.gtrScore += gtrResult.totalScore
      this.updateGTRDisplay(gtrResult)
      this.gameState.score += gtrResult.totalScore * 10
      this.showGTREffect()
    }
  }

  private updateGTRDisplay(gtrResult: GTRScore) {
    if (this.gtrCountText) {
      this.gtrCountText.setText(`GTR: ${this.gameState.gtrCount}回`)
    }

    if (this.gtrScoreText) {
      this.gtrScoreText.setText(`Score: ${this.gameState.gtrScore}`)
    }

    if (this.gtrQualityText) {
      let qualityText = '形の質: '
      if (gtrResult.quality >= 90) {
        qualityText += '完璧！'
      } else if (gtrResult.quality >= 70) {
        qualityText += '良い'
      } else if (gtrResult.quality >= 50) {
        qualityText += '普通'
      } else {
        qualityText += '改善可能'
      }
      qualityText += ` (${gtrResult.quality}点)`

      if (gtrResult.chainTailScore >= 80) {
        qualityText += ' 連鎖尾:◎'
      } else if (gtrResult.chainTailScore >= 50) {
        qualityText += ' 連鎖尾:○'
      } else {
        qualityText += ' 連鎖尾:△'
      }

      this.gtrQualityText.setText(qualityText)
    }
  }

  private showGTREffect() {
    const centerX = this.FIELD_X + 3 * this.CELL_SIZE
    const centerY = this.FIELD_Y + 10 * this.CELL_SIZE
    const w = 4 * this.CELL_SIZE
    const h = 4 * this.CELL_SIZE

    // パルスグロー
    const glow = this.add.rectangle(centerX, centerY, w, h, 0xffdd44, 0.0)
    glow.setDepth(200)
    this.tweens.add({
      targets: glow,
      alpha: 0.35,
      duration: 300,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => glow.destroy(),
    })

    // 星パーティクル
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8
      const dist = Math.max(w, h) * 0.6
      const px = centerX + Math.cos(angle) * dist
      const py = centerY + Math.sin(angle) * dist

      const star = this.add.text(px, py, '★', {
        fontSize: '18px',
        color: '#ffdd44',
      }).setOrigin(0.5).setDepth(201)

      this.tweens.add({
        targets: star,
        y: py - 30,
        alpha: 0,
        scale: 0.3,
        duration: ANIMATION_CONFIG.GTR_CELEBRATION_DURATION,
        ease: 'Quad.easeOut',
        delay: i * 80,
        onComplete: () => star.destroy(),
      })
    }
  }

  private spawnNextPair() {
    if (this.gameField.isGameOver()) {
      this.gameState.gameOver = true
      this.showGameOver()
      return
    }

    const newTwoHandCombination = PuyoPairManager.createValidTwoHandCombination()

    this.gameState.currentPair = this.gameState.nextPair
    this.gameState.nextPair = this.gameState.nextNextPair
    this.gameState.nextNextPair = newTwoHandCombination.pair1
  }

  private showGameOver() {
    const centerX = LAYOUT_SCORE_ATTACK.CANVAS_WIDTH / 2
    const centerY = LAYOUT_SCORE_ATTACK.CANVAS_HEIGHT / 2

    const bg = this.add.rectangle(centerX, centerY, 400, 200, 0x0a0a1a, 0.92)
    bg.setStrokeStyle(2, 0x4444aa)
    bg.setDepth(1000)

    this.add.text(centerX, centerY - 30, 'Game Over', {
      fontSize: '32px',
      color: '#ff6666',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5).setDepth(1001)

    this.add.text(centerX, centerY + 20, `スコア: ${this.gameState.score}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5).setDepth(1001)
  }

  private startGame() {
    this.lastFallTime = this.time.now
  }

  private initializeSprites() {
    this.fieldSprites = Array(FIELD_CONFIG.ROWS).fill(null).map(() => Array(FIELD_CONFIG.COLS).fill(null))
  }

  private updateDisplay() {
    this.updateFieldSprites()
    this.updateCurrentPairSprites()
    this.updateNextPairSprites()
  }

  private updateFieldSprites() {
    const field = this.gameField.getField()

    for (let y = 0; y < field.height; y++) {
      for (let x = 0; x < field.width; x++) {
        const color = field.grid[y][x]
        const currentSprite = this.fieldSprites[y][x]

        if (color && !currentSprite) {
          const sprite = this.add.sprite(
            this.FIELD_X + x * this.CELL_SIZE + this.CELL_SIZE / 2,
            this.FIELD_Y + y * this.CELL_SIZE + this.CELL_SIZE / 2,
            `puyo-${color}`
          )
          sprite.setDisplaySize(this.CELL_SIZE - FIELD_CONFIG.CELL_GAP, this.CELL_SIZE - FIELD_CONFIG.CELL_GAP)
          this.fieldSprites[y][x] = sprite

          // 着地バウンスアニメーション
          if (this.landedPositions.has(`${x},${y}`)) {
            this.tweens.add({
              targets: sprite,
              scaleY: sprite.scaleY * ANIMATION_CONFIG.LANDING_BOUNCE_SCALE_Y,
              scaleX: sprite.scaleX * 1.15,
              duration: ANIMATION_CONFIG.LANDING_BOUNCE_DURATION / 2,
              ease: 'Quad.easeOut',
              yoyo: true,
            })
            this.landedPositions.delete(`${x},${y}`)
          }
        } else if (!color && currentSprite) {
          // 消滅アニメーション
          this.fieldSprites[y][x] = null
          this.tweens.add({
            targets: currentSprite,
            scaleX: currentSprite.scaleX * ANIMATION_CONFIG.CHAIN_POP_SCALE,
            scaleY: currentSprite.scaleY * ANIMATION_CONFIG.CHAIN_POP_SCALE,
            alpha: 0,
            duration: ANIMATION_CONFIG.CHAIN_POP_DURATION,
            ease: 'Back.easeIn',
            onComplete: () => currentSprite.destroy(),
          })
          // パーティクル
          this.emitParticles(currentSprite.x, currentSprite.y)
        } else if (color && currentSprite && currentSprite.texture.key !== `puyo-${color}`) {
          // 重力落下で色が変わった → スプライト差し替え
          currentSprite.destroy()
          const sprite = this.add.sprite(
            this.FIELD_X + x * this.CELL_SIZE + this.CELL_SIZE / 2,
            this.FIELD_Y + y * this.CELL_SIZE + this.CELL_SIZE / 2,
            `puyo-${color}`
          )
          sprite.setDisplaySize(this.CELL_SIZE - FIELD_CONFIG.CELL_GAP, this.CELL_SIZE - FIELD_CONFIG.CELL_GAP)
          this.fieldSprites[y][x] = sprite
        }
      }
    }
  }

  private updateCurrentPairSprites() {
    if (!this.gameState.currentPair) {
      this.currentPairSprites.main?.setVisible(false)
      this.currentPairSprites.sub?.setVisible(false)
      return
    }

    const pair = this.gameState.currentPair
    const positions = PuyoPairManager.getRotatedPositions(pair)

    // メインスプライト - テクスチャが変わった時のみ再生成
    if (!this.currentPairSprites.main || this.currentPairSprites.main.texture.key !== `puyo-${pair.main.color}`) {
      this.currentPairSprites.main?.destroy()
      this.currentPairSprites.main = this.add.sprite(0, 0, `puyo-${pair.main.color}`)
      this.currentPairSprites.main.setDisplaySize(this.CELL_SIZE - FIELD_CONFIG.CELL_GAP, this.CELL_SIZE - FIELD_CONFIG.CELL_GAP)
      this.currentPairSprites.main.setAlpha(0.95)
      this.currentPairSprites.main.setDepth(10)
    }
    this.currentPairSprites.main.setPosition(
      this.FIELD_X + positions.main.x * this.CELL_SIZE + this.CELL_SIZE / 2,
      this.FIELD_Y + positions.main.y * this.CELL_SIZE + this.CELL_SIZE / 2
    )
    this.currentPairSprites.main.setVisible(true)

    // サブスプライト
    if (!this.currentPairSprites.sub || this.currentPairSprites.sub.texture.key !== `puyo-${pair.sub.color}`) {
      this.currentPairSprites.sub?.destroy()
      this.currentPairSprites.sub = this.add.sprite(0, 0, `puyo-${pair.sub.color}`)
      this.currentPairSprites.sub.setDisplaySize(this.CELL_SIZE - FIELD_CONFIG.CELL_GAP, this.CELL_SIZE - FIELD_CONFIG.CELL_GAP)
      this.currentPairSprites.sub.setAlpha(0.95)
      this.currentPairSprites.sub.setDepth(10)
    }
    this.currentPairSprites.sub.setPosition(
      this.FIELD_X + positions.sub.x * this.CELL_SIZE + this.CELL_SIZE / 2,
      this.FIELD_Y + positions.sub.y * this.CELL_SIZE + this.CELL_SIZE / 2
    )
    this.currentPairSprites.sub.setVisible(true)
  }

  private drawGrid() {
    const graphics = this.add.graphics()
    graphics.lineStyle(FIELD_CONFIG.GRID_LINE_WIDTH, FIELD_CONFIG.GRID_LINE_COLOR, FIELD_CONFIG.GRID_LINE_ALPHA)

    for (let i = 0; i <= FIELD_CONFIG.COLS; i++) {
      graphics.moveTo(this.FIELD_X + i * this.CELL_SIZE, this.FIELD_Y)
      graphics.lineTo(this.FIELD_X + i * this.CELL_SIZE, this.FIELD_Y + FIELD_CONFIG.ROWS * this.CELL_SIZE)
    }

    for (let i = 0; i <= FIELD_CONFIG.ROWS; i++) {
      graphics.moveTo(this.FIELD_X, this.FIELD_Y + i * this.CELL_SIZE)
      graphics.lineTo(this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE, this.FIELD_Y + i * this.CELL_SIZE)
    }

    graphics.strokePath()
  }

  private evaluateAndReset() {
    const field = this.gameField.getField()
    const gtrResult = GTRDetector.detectGTR(field.grid)
    this.displayEvaluationResult(gtrResult)
  }

  private manualReset() {
    this.resetGame()
  }

  private displayEvaluationResult(result: GTRScore) {
    const centerX = this.cameras.main.width / 2
    const centerY = this.cameras.main.height / 2

    // リッチな背景パネル
    const bg = this.add.rectangle(centerX, centerY + 50, 480, 300, 0x0a0a1a, 0.92)
    bg.setStrokeStyle(2, 0x4444aa)
    bg.setDepth(1000)

    // スライドインアニメーション
    bg.y = centerY + 100
    bg.alpha = 0
    this.tweens.add({
      targets: bg,
      y: centerY,
      alpha: 0.92,
      duration: 200,
      ease: 'Back.easeOut',
    })

    const titleColor = result.isGTR ? '#44dd88' : '#ff6666'
    const titleText = result.isGTR ? 'GTR Complete!' : 'GTR未完成'
    const title = this.add.text(centerX, centerY - 80, titleText, {
      fontSize: '28px',
      color: titleColor,
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1001)

    const scoreText = `スコア: ${result.totalScore}点`
    const score = this.add.text(centerX, centerY - 40, scoreText, {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5).setDepth(1001)

    const chainText = `連鎖数: ${result.chainCount}連鎖`
    const chain = this.add.text(centerX, centerY - 10, chainText, {
      fontSize: '18px',
      color: '#ffdd44',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5).setDepth(1001)

    let msgEl: Phaser.GameObjects.Text | undefined
    if (result.message) {
      msgEl = this.add.text(centerX, centerY + 20, result.message, {
        fontSize: '16px',
        color: '#aaaacc',
        fontFamily: TEXT_STYLES.title.fontFamily,
      }).setOrigin(0.5).setDepth(1001)
    }

    const instruction = this.add.text(centerX, centerY + 70, 'Space: 続ける / Esc: TOPページへ', {
      fontSize: '14px',
      color: '#666688',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5).setDepth(1001)

    const elements: Phaser.GameObjects.GameObject[] = [bg, title, score, chain, instruction]
    if (msgEl) elements.push(msgEl)

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        elements.forEach(el => el.destroy())
        this.input.keyboard?.off('keydown', handleKey)
        this.manualReset()
      } else if (event.key === 'Escape') {
        this.input.keyboard?.off('keydown', handleKey)
        this.exitToMenu()
      }
    }
    this.input.keyboard?.on('keydown', handleKey)
  }

  private resetGame() {
    this.gameField.clear()
    this.clearAllSprites()
    this.gameState = this.createInitialGameState()

    if (this.gtrCountText) {
      this.gtrCountText.setText('GTR: 0回')
    }
    if (this.gtrScoreText) {
      this.gtrScoreText.setText('Score: 0')
    }
    if (this.gtrQualityText) {
      this.gtrQualityText.setText('形の質: -')
    }

    this.lastFallTime = this.time.now
  }

  private createNextAreas() {
    const baseX = this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE + 24
    const baseY = this.FIELD_Y

    // NEXTラベル
    this.add.text(baseX, baseY - 24, 'NEXT', {
      ...TEXT_STYLES.label,
      fontSize: '16px',
      color: '#aaaacc',
    })

    // NEXTボックス
    const nextBoxH = NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2
    const nextBoxCX = baseX + NEXT_AREA_CONFIG.AREA_WIDTH / 2
    const nextBoxCY = baseY + nextBoxH / 2

    this.add.rectangle(nextBoxCX, nextBoxCY, NEXT_AREA_CONFIG.AREA_WIDTH, nextBoxH, NEXT_AREA_CONFIG.BG_COLOR)
      .setStrokeStyle(2, NEXT_AREA_CONFIG.BORDER_COLOR)

    // ネクネクストボックス
    const nnBoxY = baseY + nextBoxH + NEXT_AREA_CONFIG.GAP_BETWEEN
    const nnBoxH = NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2
    const nnBoxCY = nnBoxY + nnBoxH / 2

    this.add.rectangle(nextBoxCX, nnBoxCY, NEXT_AREA_CONFIG.AREA_WIDTH, nnBoxH, NEXT_AREA_CONFIG.BG_COLOR)
      .setStrokeStyle(1, NEXT_AREA_CONFIG.BORDER_COLOR).setAlpha(0.7)
  }

  private updateNextPairSprites() {
    this.clearNextSprites()

    const baseX = this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE + 24
    const baseY = this.FIELD_Y
    const boxCenterX = baseX + NEXT_AREA_CONFIG.AREA_WIDTH / 2

    // NEXTぷよ - 縦並びで表示（サブが上、メインが下）
    if (this.gameState.nextPair) {
      const subY = baseY + NEXT_AREA_CONFIG.AREA_PADDING + NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 0.5
      const mainY = baseY + NEXT_AREA_CONFIG.AREA_PADDING + NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 1.5

      this.nextPairSprites.sub = this.add.sprite(boxCenterX, subY, `puyo-${this.gameState.nextPair.sub.color}`)
      this.nextPairSprites.sub.setDisplaySize(NEXT_AREA_CONFIG.NEXT_CELL_SIZE, NEXT_AREA_CONFIG.NEXT_CELL_SIZE)

      this.nextPairSprites.main = this.add.sprite(boxCenterX, mainY, `puyo-${this.gameState.nextPair.main.color}`)
      this.nextPairSprites.main.setDisplaySize(NEXT_AREA_CONFIG.NEXT_CELL_SIZE, NEXT_AREA_CONFIG.NEXT_CELL_SIZE)
    }

    // ネクネクストぷよ
    if (this.gameState.nextNextPair) {
      const nextBoxH = NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2
      const nnBaseY = baseY + nextBoxH + NEXT_AREA_CONFIG.GAP_BETWEEN
      const subY = nnBaseY + NEXT_AREA_CONFIG.AREA_PADDING + NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE * 0.5
      const mainY = nnBaseY + NEXT_AREA_CONFIG.AREA_PADDING + NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE * 1.5

      this.nextNextPairSprites.sub = this.add.sprite(boxCenterX, subY, `puyo-${this.gameState.nextNextPair.sub.color}`)
      this.nextNextPairSprites.sub.setDisplaySize(NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE, NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE)

      this.nextNextPairSprites.main = this.add.sprite(boxCenterX, mainY, `puyo-${this.gameState.nextNextPair.main.color}`)
      this.nextNextPairSprites.main.setDisplaySize(NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE, NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE)
    }
  }

  private clearNextSprites() {
    if (this.nextPairSprites.main) {
      this.nextPairSprites.main.destroy()
      this.nextPairSprites.main = undefined
    }
    if (this.nextPairSprites.sub) {
      this.nextPairSprites.sub.destroy()
      this.nextPairSprites.sub = undefined
    }
    if (this.nextNextPairSprites.main) {
      this.nextNextPairSprites.main.destroy()
      this.nextNextPairSprites.main = undefined
    }
    if (this.nextNextPairSprites.sub) {
      this.nextNextPairSprites.sub.destroy()
      this.nextNextPairSprites.sub = undefined
    }
  }

  private clearAllSprites() {
    for (let y = 0; y < this.fieldSprites.length; y++) {
      for (let x = 0; x < this.fieldSprites[y].length; x++) {
        if (this.fieldSprites[y][x]) {
          this.fieldSprites[y][x]?.destroy()
          this.fieldSprites[y][x] = null
        }
      }
    }

    if (this.currentPairSprites.main) {
      this.currentPairSprites.main.destroy()
      this.currentPairSprites.main = undefined
    }
    if (this.currentPairSprites.sub) {
      this.currentPairSprites.sub.destroy()
      this.currentPairSprites.sub = undefined
    }

    this.clearNextSprites()
  }

  private toggleGravity() {
    this.isGravityEnabled = !this.isGravityEnabled

    if (this.gravityStatusText) {
      if (this.isGravityEnabled) {
        this.gravityStatusText.setText('自由落下: ON')
        this.gravityStatusText.setColor('#00ff00')
      } else {
        this.gravityStatusText.setText('自由落下: OFF')
        this.gravityStatusText.setColor('#ff4444')
      }
    }

    if (this.isGravityEnabled) {
      this.lastFallTime = this.time.now
    }
  }

  // スコアフロートアニメーション
  private playScorePopup(x: number, y: number, text: string) {
    const scoreText = this.add.text(x, y, text, {
      fontSize: '20px',
      color: '#ffdd44',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(500)

    this.tweens.add({
      targets: scoreText,
      y: y + ANIMATION_CONFIG.SCORE_FLOAT_DISTANCE,
      alpha: 0,
      duration: ANIMATION_CONFIG.SCORE_FLOAT_DURATION,
      ease: 'Quad.easeOut',
      onComplete: () => scoreText.destroy(),
    })
  }

  // パーティクル飛散
  private emitParticles(x: number, y: number) {
    for (let i = 0; i < ANIMATION_CONFIG.PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / ANIMATION_CONFIG.PARTICLE_COUNT + Math.random() * 0.5
      const speed = 40 + Math.random() * 60
      const particle = this.add.circle(x, y, 3 + Math.random() * 3, 0xffffff, 0.8)
      particle.setDepth(300)

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.2,
        duration: 400 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      })
    }
  }

  private exitToMenu() {
    const onExit = this.game.registry.get('onExit')
    if (onExit && typeof onExit === 'function') {
      onExit()
    }
  }
}
