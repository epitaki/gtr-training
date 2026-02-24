import * as Phaser from 'phaser'
import { GameFieldManager } from '../GameField'
import { PuyoPairManager } from '../PuyoPair'
import { GameState } from '../types'
import { GTRDetector, GTRScore } from '../GTRPatterns'
import { GuideManager } from '../GuideManager'
import { GameHistory } from '../GameHistory'
import { PuyoRenderer } from '../PuyoRenderer'
import { FIELD_CONFIG, LAYOUT_GUIDED, NEXT_AREA_CONFIG, TEXT_STYLES, ANIMATION_CONFIG } from '../VisualConfig'
import { PlacementAdvisor, PlacementAdvice } from '../PlacementAdvisor'

export default class GuidedPracticeScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private zKey?: Phaser.Input.Keyboard.Key
  private xKey?: Phaser.Input.Keyboard.Key
  private spaceKey?: Phaser.Input.Keyboard.Key
  private escKey?: Phaser.Input.Keyboard.Key
  private pKey?: Phaser.Input.Keyboard.Key
  private upKey?: Phaser.Input.Keyboard.Key
  private fKey?: Phaser.Input.Keyboard.Key
  private gKey?: Phaser.Input.Keyboard.Key

  // ゲーム状態
  private gameField: GameFieldManager
  private gameState: GameState
  private guideManager: GuideManager
  private gameHistory: GameHistory
  private isPaused: boolean = false
  private isShowingResult: boolean = false
  private isGravityEnabled: boolean = true
  private isAdvisorEnabled: boolean = true
  private currentAdvice: PlacementAdvice | null = null

  // 描画関連
  private fieldSprites: (Phaser.GameObjects.Sprite | null)[][] = []
  private currentPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextNextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private guideDisplay?: Phaser.GameObjects.Container
  private ghostSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private pauseOverlay?: Phaser.GameObjects.Rectangle
  private pauseText?: Phaser.GameObjects.Text
  private gravityStatusText?: Phaser.GameObjects.Text
  private advisorStatusText?: Phaser.GameObjects.Text

  // レイアウト設定（VisualConfigから）
  private readonly CELL_SIZE = FIELD_CONFIG.CELL_SIZE
  private readonly FIELD_X = LAYOUT_GUIDED.FIELD_X
  private readonly FIELD_Y = LAYOUT_GUIDED.FIELD_Y
  private readonly FALL_SPEED = 800
  private readonly GUIDE_X = LAYOUT_GUIDED.GUIDE_X
  private readonly GUIDE_Y = LAYOUT_GUIDED.GUIDE_Y

  // 着地アニメーション用
  private landedPositions: Set<string> = new Set()

  // タイマー
  private lastFallTime = 0
  private lastMoveTime = 0
  private readonly MOVE_DELAY = 150

  constructor() {
    super({ key: 'GuidedPracticeScene' })
    this.gameField = new GameFieldManager()
    this.guideManager = new GuideManager()
    this.gameHistory = new GameHistory()
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
    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    // 背景
    this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, LAYOUT_GUIDED.BG_COLOR)

    // タイトル
    this.add.text(canvasW / 2, 30, '初心者用ガイド付きGTR練習', {
      ...TEXT_STYLES.title,
      fontSize: '24px',
    }).setOrigin(0.5)

    // 操作説明（コンパクト表示）
    this.add.text(canvasW / 2, 60, '← → ↓ 移動 | Z X 回転 | ↑ 巻き戻し | P ポーズ | F 落下 | G アドバイス | Space 評価 | Esc 戻る', {
      ...TEXT_STYLES.subtitle,
      fontSize: '12px',
    }).setOrigin(0.5)

    // フィールド描画
    this.drawField()

    // ガイド表示エリア
    this.createGuideDisplay()

    // ネクストぷよ表示エリア
    this.createNextAreas()

    // スプライト配列の初期化
    this.initializeSprites()

    // キー入力設定
    this.cursors = this.input.keyboard?.createCursorKeys()
    this.zKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.xKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.pKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P)
    this.upKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP)
    this.fKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F)
    this.gKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.G)

    // 自由落下状態表示
    this.gravityStatusText = this.add.text(10, 10, '自由落下: ON', {
      fontSize: '16px',
      color: '#00ff00',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 2
    })
    this.gravityStatusText.setDepth(100)

    // アドバイザー状態表示
    this.advisorStatusText = this.add.text(10, 32, 'アドバイザー: ON (G)', {
      fontSize: '16px',
      color: '#44ddff',
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 2
    })
    this.advisorStatusText.setDepth(100)

    // ゲーム開始
    this.startGame()
    this.updateGuide()
  }

  update(time: number) {
    if (Phaser.Input.Keyboard.JustDown(this.escKey!)) {
      this.exitToMenu()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.pKey!)) {
      this.togglePause()
    }

    if (Phaser.Input.Keyboard.JustDown(this.fKey!)) {
      this.toggleGravity()
    }

    if (Phaser.Input.Keyboard.JustDown(this.gKey!)) {
      this.toggleAdvisor()
    }

    if (this.isPaused || this.gameState.gameOver || this.isShowingResult) return

    if (Phaser.Input.Keyboard.JustDown(this.upKey!)) {
      this.rewind()
      return
    }

    this.handleInput(time)

    if (this.isGravityEnabled) {
      this.updateFalling(time)
    }

    this.updateDisplay()
  }

  private togglePause() {
    this.isPaused = !this.isPaused
    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    if (this.isPaused) {
      this.pauseOverlay = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, 0x000000, 0.7)
      this.pauseText = this.add.text(canvasW / 2, canvasH / 2, 'ポーズ中\nPキーで再開', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: TEXT_STYLES.title.fontFamily,
        align: 'center'
      }).setOrigin(0.5)
    } else {
      this.pauseOverlay?.destroy()
      this.pauseText?.destroy()
    }
  }

  private rewind() {
    const previousState = this.gameHistory.rewind()
    if (previousState) {
      this.gameField.setField(previousState.field)
      this.gameState.field = this.gameField.getField()
      this.gameState.currentPair = previousState.currentPair
      this.gameState.nextPair = previousState.nextPair
      this.gameState.nextNextPair = previousState.nextNextPair
      this.gameState.score = previousState.score
      this.gameState.gtrCount = previousState.gtrCount
      this.gameState.gtrScore = previousState.gtrScore

      this.guideManager.updateState(this.gameField.getField())
      this.updateGuide()
      this.updateDisplay()
      this.updateAdvice()
    }
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

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey!) && !this.isShowingResult) {
      this.evaluateGTR()
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

    this.clearGhostSprites()

    const pair = this.gameState.currentPair
    const positions = PuyoPairManager.getRotatedPositions(pair)

    this.gameField.placePuyo(positions.main.x, positions.main.y, pair.main.color)
    this.gameField.placePuyo(positions.sub.x, positions.sub.y, pair.sub.color)

    // 着地位置を記録
    this.landedPositions.add(`${positions.main.x},${positions.main.y}`)
    this.landedPositions.add(`${positions.sub.x},${positions.sub.y}`)

    this.processChain()

    // 連鎖処理完了後の状態を履歴に保存
    this.gameState.field = this.gameField.getField()
    this.gameHistory.saveState(this.gameState)

    this.spawnNextPair()

    this.guideManager.updateState(this.gameField.getField())
    this.updateGuide()
  }

  private processChain() {
    let chainCount = 0
    let totalCleared = 0

    while (true) {
      while (this.gameField.applyGravity()) {}

      const result = this.gameField.clearConnectedPuyos()
      if (!result.cleared) {
        break
      }

      chainCount++
      totalCleared += result.count
      this.gameState.score += result.count * 10
    }

    if (chainCount > 0) {
      // スコアフロート
      const fieldCenterX = this.FIELD_X + 3 * this.CELL_SIZE
      this.playScorePopup(fieldCenterX, this.FIELD_Y + 2 * this.CELL_SIZE, `${chainCount}連鎖! +${totalCleared * 10}`)
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

    this.updateAdvice()
  }

  private evaluateGTR() {
    const field = this.gameField.getField()
    const gtrResult = GTRDetector.detectGTR(field.grid)
    this.showDetailedResult(gtrResult)
  }

  private showDetailedResult(result: GTRScore) {
    this.isPaused = true
    this.isShowingResult = true
    this.spaceKey?.reset()

    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    const overlay = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, 0x000000, 0.9)
    overlay.setDepth(1000)

    const container = this.add.container(canvasW / 2, 180)
    container.setDepth(1001)

    // タイトル
    const titleColor = result.isGTR ? '#44dd88' : '#ff6666'
    const titleText = result.isGTR ? 'GTR Complete!' : 'GTR未完成'
    const title = this.add.text(0, 0, titleText, {
      fontSize: '32px',
      color: titleColor,
      fontFamily: TEXT_STYLES.title.fontFamily,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5)
    container.add(title)

    // スコア
    const score = this.add.text(0, 50, `スコア: ${result.totalScore}点`, {
      fontSize: '24px',
      color: '#ffdd44',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)
    container.add(score)

    // GTRフィールド表示
    this.displayGTRField(container, -200, 80)

    // チェック項目（成功・失敗の両方を表示）
    const checks: { label: string; checked: boolean }[] = [
      { label: '折り返し', checked: result.hasBasicPattern },
      { label: 'Y字連鎖尾', checked: result.chainTailType === 'Y' },
      { label: 'L字連鎖尾', checked: result.chainTailType === 'L' },
      { label: '階段連鎖尾', checked: result.chainTailType === 'stairs' },
      { label: '4連鎖', checked: result.chainCount >= 4 },
      { label: '5連鎖', checked: result.chainCount >= 5 },
      { label: '右上が立っている', checked: result.row10Usage === 'minimal' },
      { label: 'あまりぷよが連結', checked: result.leftoverConnected }
    ]

    let yOffset = 100
    const xOffset = 100
    checks.forEach(check => {
      const icon = check.checked ? '✓' : '✗'
      const color = check.checked ? '#44dd88' : '#ff6666'
      const text = this.add.text(xOffset, yOffset, `${icon} ${check.label}`, {
        fontSize: '16px',
        color: color,
        fontFamily: TEXT_STYLES.title.fontFamily,
      })
      container.add(text)
      yOffset += 24
    })

    // 操作説明
    const instruction = this.add.text(0, 350, 'Spaceキーで新しいゲームを開始\nEscキーでメニューに戻る', {
      fontSize: '16px',
      color: '#666688',
      fontFamily: TEXT_STYLES.title.fontFamily,
      align: 'center'
    }).setOrigin(0.5)
    container.add(instruction)

    // キー入力待ち
    const handleKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === ' ') {
        this.input.keyboard?.off('keydown', handleKey)
        overlay.destroy()
        container.destroy()

        this.time.delayedCall(100, () => {
          this.isPaused = false
          this.isShowingResult = false
          this.spaceKey?.reset()
          this.resetGame()
          this.startGame()
        })
      } else if (event.key === 'Escape') {
        this.input.keyboard?.off('keydown', handleKey)
        overlay.destroy()
        container.destroy()
        this.isShowingResult = false
        this.exitToMenu()
      }
    }
    this.input.keyboard?.on('keydown', handleKey)
  }

  private displayGTRField(container: Phaser.GameObjects.Container, offsetX: number, offsetY: number) {
    const field = this.gameField.getField()
    const cellSize = 18

    const evaluationRanges = [
      { x: 0, yStart: 10, yEnd: 12 },
      { x: 1, yStart: 10, yEnd: 12 },
      { x: 2, yStart: 9, yEnd: 12 },
      { x: 3, yStart: 9, yEnd: 12 },
      { x: 4, yStart: 9, yEnd: 12 },
      { x: 5, yStart: 9, yEnd: 12 },
    ]

    const minRow = 9
    const maxRow = 12
    const displayRows = maxRow - minRow + 1

    // フィールド背景
    const fieldBg = this.add.rectangle(
      offsetX,
      offsetY + (displayRows * cellSize) / 2,
      6 * cellSize + 2,
      displayRows * cellSize + 2,
      0x1a1a2e
    )
    fieldBg.setStrokeStyle(2, 0x4444aa)
    container.add(fieldBg)

    for (let y = minRow; y <= maxRow; y++) {
      for (let x = 0; x < 6; x++) {
        const color = field.grid[y]?.[x]
        if (color) {
          const px = offsetX + (x - 3) * cellSize + cellSize / 2
          const py = offsetY + (y - minRow) * cellSize + cellSize / 2

          let isInEvaluationRange = false
          for (const range of evaluationRanges) {
            if (x === range.x && y >= range.yStart && y <= range.yEnd) {
              isInEvaluationRange = true
              break
            }
          }

          const puyoSprite = this.add.sprite(px, py, `puyo-${color}`)
          puyoSprite.setDisplaySize(cellSize - 2, cellSize - 2)

          if (!isInEvaluationRange) {
            puyoSprite.setAlpha(0.3)
          }

          container.add(puyoSprite)
        }
      }
    }

    const label = this.add.text(offsetX, offsetY - 20, 'GTR評価範囲', {
      fontSize: '14px',
      color: '#aaaacc',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)
    container.add(label)
  }

  private showGameOver() {
    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    const bg = this.add.rectangle(canvasW / 2, canvasH / 2, 400, 200, 0x0a0a1a, 0.92)
    bg.setStrokeStyle(2, 0x4444aa)

    this.add.text(canvasW / 2, canvasH / 2 - 20, 'Game Over', {
      fontSize: '32px',
      color: '#ff6666',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)

    this.add.text(canvasW / 2, canvasH / 2 + 20, `スコア: ${this.gameState.score}`, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)
  }

  private resetGame() {
    this.gameField.clear()
    this.clearGhostSprites()
    this.clearAllSprites()
    this.gameState = this.createInitialGameState()
    this.gameHistory.clear()
    this.guideManager.reset()
    this.currentAdvice = null
    this.lastFallTime = this.time.now
  }

  private startGame() {
    this.lastFallTime = this.time.now
    this.guideManager.initialize(this.gameState.currentPair!, this.gameState.nextPair!)
    this.updateGuide()
    this.updateDisplay()
    this.updateAdvice()
  }

  private drawField() {
    const fieldW = FIELD_CONFIG.COLS * this.CELL_SIZE
    const fieldH = FIELD_CONFIG.ROWS * this.CELL_SIZE

    // 外枠
    this.add.rectangle(
      this.FIELD_X + fieldW / 2,
      this.FIELD_Y + fieldH / 2,
      fieldW + FIELD_CONFIG.FIELD_BORDER_WIDTH * 2,
      fieldH + FIELD_CONFIG.FIELD_BORDER_WIDTH * 2,
      FIELD_CONFIG.FIELD_BORDER_COLOR
    )

    // 内枠
    this.add.rectangle(
      this.FIELD_X + fieldW / 2,
      this.FIELD_Y + fieldH / 2,
      fieldW,
      fieldH,
      FIELD_CONFIG.FIELD_BG_COLOR
    )

    // グリッド線
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

  private createGuideDisplay() {
    this.guideDisplay = this.add.container(this.GUIDE_X, this.GUIDE_Y)

    const fieldH = FIELD_CONFIG.ROWS * this.CELL_SIZE
    const bg = this.add.rectangle(0, fieldH / 2, LAYOUT_GUIDED.GUIDE_WIDTH, fieldH, 0x1a1a2e, 0.9)
    this.guideDisplay.add(bg)

    // 枠線（紫系ボーダー）
    const border = this.add.rectangle(0, fieldH / 2, LAYOUT_GUIDED.GUIDE_WIDTH, fieldH)
    border.setStrokeStyle(2, 0x4444aa)
    border.setFillStyle()
    this.guideDisplay.add(border)

    const title = this.add.text(0, -30, 'ガイド', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)
    this.guideDisplay.add(title)
  }

  private updateGuide() {
    if (!this.guideDisplay) return

    this.guideDisplay.removeAll(true)

    const fieldH = FIELD_CONFIG.ROWS * this.CELL_SIZE
    const guideW = 350
    const guideH = Math.max(fieldH, 500)
    const bg = this.add.rectangle(0, guideH / 2, guideW, guideH, 0x1a1a2e, 0.9)
    this.guideDisplay.add(bg)

    const border = this.add.rectangle(0, guideH / 2, guideW, guideH)
    border.setStrokeStyle(2, 0x4444aa)
    border.setFillStyle()
    this.guideDisplay.add(border)

    const title = this.add.text(0, -30, 'ガイド', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)
    this.guideDisplay.add(title)

    const guideContent = this.guideManager.getGuideContent()

    const comment = this.add.text(0, -10, guideContent.comment, {
      fontSize: '16px',
      color: '#ffdd44',
      fontFamily: TEXT_STYLES.title.fontFamily,
      wordWrap: { width: 320 }
    }).setOrigin(0.5)
    this.guideDisplay.add(comment)

    if (guideContent.pattern) {
      this.drawGuidePattern(guideContent.pattern, 50)
    }

    if (guideContent.description) {
      const desc = this.add.text(0, 300, guideContent.description, {
        fontSize: '14px',
        color: '#aaaacc',
        fontFamily: TEXT_STYLES.title.fontFamily,
        wordWrap: { width: 320 },
        align: 'center'
      }).setOrigin(0.5)
      this.guideDisplay.add(desc)
    }
  }

  private drawGuidePattern(pattern: string[][], offsetY: number) {
    const cellSize = 18
    const startX = -cellSize * 3
    let currentY = offsetY

    pattern.forEach((row) => {
      if (row.every(cell => cell === '_') && row.length === 6) {
        currentY += cellSize * 0.8
        return
      }

      row.forEach((cell, x) => {
        const px = startX + x * cellSize
        const py = currentY

        if (cell !== '_') {
          const cellBg = this.add.rectangle(px, py, cellSize - 1, cellSize - 1, 0x000000)
          cellBg.setStrokeStyle(1, 0x333355)
          this.guideDisplay?.add(cellBg)

          const puyoColor = this.getActualColorForLetter(cell)
          const puyoSprite = this.add.sprite(px, py, `puyo-${puyoColor}`)
          puyoSprite.setDisplaySize(cellSize - 2, cellSize - 2)
          this.guideDisplay?.add(puyoSprite)
        } else {
          const emptyCell = this.add.rectangle(
            px, py,
            cellSize - 1, cellSize - 1,
            0x000000, 0.2
          )
          emptyCell.setStrokeStyle(1, 0x1a1a2e)
          this.guideDisplay?.add(emptyCell)
        }
      })
      currentY += cellSize
    })
  }

  private getActualColorForLetter(letter: string): string {
    const colorMap: { [key: string]: string } = {
      'A': 'red',
      'B': 'green',
      'C': 'blue',
      'D': 'yellow'
    }
    return colorMap[letter] || 'red'
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

          // 着地バウンス
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
          this.fieldSprites[y][x] = null
          // 消滅アニメーション
          this.tweens.add({
            targets: currentSprite,
            scaleX: currentSprite.scaleX * ANIMATION_CONFIG.CHAIN_POP_SCALE,
            scaleY: currentSprite.scaleY * ANIMATION_CONFIG.CHAIN_POP_SCALE,
            alpha: 0,
            duration: ANIMATION_CONFIG.CHAIN_POP_DURATION,
            ease: 'Back.easeIn',
            onComplete: () => currentSprite.destroy(),
          })
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

  private updateNextPairSprites() {
    this.clearNextSprites()

    const baseX = this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE + 20
    const baseY = this.FIELD_Y
    const boxCenterX = baseX + NEXT_AREA_CONFIG.AREA_WIDTH / 2

    if (this.gameState.nextPair) {
      const subY = baseY + NEXT_AREA_CONFIG.AREA_PADDING + NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 0.5
      const mainY = baseY + NEXT_AREA_CONFIG.AREA_PADDING + NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 1.5

      this.nextPairSprites.sub = this.add.sprite(boxCenterX, subY, `puyo-${this.gameState.nextPair.sub.color}`)
      this.nextPairSprites.sub.setDisplaySize(NEXT_AREA_CONFIG.NEXT_CELL_SIZE, NEXT_AREA_CONFIG.NEXT_CELL_SIZE)

      this.nextPairSprites.main = this.add.sprite(boxCenterX, mainY, `puyo-${this.gameState.nextPair.main.color}`)
      this.nextPairSprites.main.setDisplaySize(NEXT_AREA_CONFIG.NEXT_CELL_SIZE, NEXT_AREA_CONFIG.NEXT_CELL_SIZE)
    }

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

  private createNextAreas() {
    const baseX = this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE + 20
    const baseY = this.FIELD_Y

    // NEXTラベル
    this.add.text(baseX, baseY - 24, 'NEXT', {
      fontSize: '16px',
      color: '#aaaacc',
      fontFamily: TEXT_STYLES.title.fontFamily,
    })

    // NEXTボックス
    const nextBoxH = NEXT_AREA_CONFIG.NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2
    const boxCenterX = baseX + NEXT_AREA_CONFIG.AREA_WIDTH / 2

    this.add.rectangle(boxCenterX, baseY + nextBoxH / 2, NEXT_AREA_CONFIG.AREA_WIDTH, nextBoxH, NEXT_AREA_CONFIG.BG_COLOR)
      .setStrokeStyle(2, NEXT_AREA_CONFIG.BORDER_COLOR)

    // ネクネクストボックス
    const nnBoxY = baseY + nextBoxH + NEXT_AREA_CONFIG.GAP_BETWEEN
    const nnBoxH = NEXT_AREA_CONFIG.NEXT_NEXT_CELL_SIZE * 2 + NEXT_AREA_CONFIG.AREA_PADDING * 2

    this.add.rectangle(boxCenterX, nnBoxY + nnBoxH / 2, NEXT_AREA_CONFIG.AREA_WIDTH, nnBoxH, NEXT_AREA_CONFIG.BG_COLOR)
      .setStrokeStyle(1, NEXT_AREA_CONFIG.BORDER_COLOR).setAlpha(0.7)
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

  // --- アドバイザー機能 ---

  private toggleAdvisor() {
    this.isAdvisorEnabled = !this.isAdvisorEnabled

    if (this.advisorStatusText) {
      if (this.isAdvisorEnabled) {
        this.advisorStatusText.setText('アドバイザー: ON (G)')
        this.advisorStatusText.setColor('#44ddff')
        this.updateAdvice()
      } else {
        this.advisorStatusText.setText('アドバイザー: OFF (G)')
        this.advisorStatusText.setColor('#ff4444')
        this.clearGhostSprites()
      }
    }
  }

  private updateAdvice() {
    if (!this.isAdvisorEnabled || !this.gameState.currentPair) {
      this.clearGhostSprites()
      return
    }

    const field = this.gameField.getField()
    this.currentAdvice = PlacementAdvisor.getAdvice(field, this.gameState.currentPair, this.gameState.nextPair ?? undefined)
    this.updateGhostDisplay()
  }

  private updateGhostDisplay() {
    this.clearGhostSprites()

    if (!this.currentAdvice?.bestPlacement) return

    const best = this.currentAdvice.bestPlacement
    const landing = best.landing
    const pair = this.gameState.currentPair
    if (!pair) return

    // mainゴースト
    const mainX = this.FIELD_X + landing.mainPos.x * this.CELL_SIZE + this.CELL_SIZE / 2
    const mainY = this.FIELD_Y + landing.mainPos.y * this.CELL_SIZE + this.CELL_SIZE / 2
    this.ghostSprites.main = this.add.sprite(mainX, mainY, `puyo-ghost-${pair.main.color}`)
    this.ghostSprites.main.setDisplaySize(this.CELL_SIZE - FIELD_CONFIG.CELL_GAP, this.CELL_SIZE - FIELD_CONFIG.CELL_GAP)
    this.ghostSprites.main.setAlpha(0.4)
    this.ghostSprites.main.setDepth(5)

    // subゴースト
    const subX = this.FIELD_X + landing.subPos.x * this.CELL_SIZE + this.CELL_SIZE / 2
    const subY = this.FIELD_Y + landing.subPos.y * this.CELL_SIZE + this.CELL_SIZE / 2
    this.ghostSprites.sub = this.add.sprite(subX, subY, `puyo-ghost-${pair.sub.color}`)
    this.ghostSprites.sub.setDisplaySize(this.CELL_SIZE - FIELD_CONFIG.CELL_GAP, this.CELL_SIZE - FIELD_CONFIG.CELL_GAP)
    this.ghostSprites.sub.setAlpha(0.4)
    this.ghostSprites.sub.setDepth(5)

    // パルスアニメーション
    for (const sprite of [this.ghostSprites.main, this.ghostSprites.sub]) {
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.3, to: 0.5 },
        duration: 800,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      })
    }
  }

  private clearGhostSprites() {
    if (this.ghostSprites.main) {
      this.tweens.killTweensOf(this.ghostSprites.main)
      this.ghostSprites.main.destroy()
      this.ghostSprites.main = undefined
    }
    if (this.ghostSprites.sub) {
      this.tweens.killTweensOf(this.ghostSprites.sub)
      this.ghostSprites.sub.destroy()
      this.ghostSprites.sub = undefined
    }
  }

  private exitToMenu() {
    const onExit = this.game.registry.get('onExit')
    if (onExit && typeof onExit === 'function') {
      onExit()
    }
  }
}
