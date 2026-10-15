import { addUIText } from '../rendering/UIText'
import * as Phaser from 'phaser'
import { GameFieldManager } from '../core/GameField'
import { PuyoPairManager } from '../core/PuyoPair'
import { applyPairPlacement, canApplyPairPlacement, isSpawnBlocked, resolveChainsWithTrace } from '../core/ChainSimulator'
import { ChainPlayback } from '../rendering/ChainPlayback'
import { PuyoBoardRenderer } from '../rendering/PuyoBoardRenderer'
import { GameState, type PuyoPair } from '../core/types'
import { GTRDetector, GTRScore } from '../gtr/GTRPatterns'
import { PuyoRenderer } from '../rendering/PuyoRenderer'
import { cellMask } from '../rendering/PuyoConnections'
import { FIELD_CONFIG, LAYOUT_SCORE_ATTACK, NEXT_AREA_CONFIG, TEXT_STYLES, ANIMATION_CONFIG } from '../rendering/VisualConfig'
import { createNextPairSprites, drawNextPreview, getNextPreviewLayout } from '../rendering/NextPreview'
import { PhaserInputAdapter } from '../input/PhaserInputAdapter'
import { actionKeys, type GameAction } from '../input/bindings'
import { getBindings, subscribeBindings } from '../input/settings'
import { SCORE_ATTACK_ROUNDS, type ScoreAttackSnapshot } from '../scoreAttack/types'
import { drawEvaluationRange } from '../rendering/EvaluationRangeBackground'
import { encodePlacedPair } from '../scoreAttack/placementHistory'

export default class PuyoGame extends Phaser.Scene {

  // ゲーム状態
  private gameField: GameFieldManager
  private gameState: GameState
  private isShowingResult: boolean = false
  private chainPlayback?: ChainPlayback
  private chainRenderer?: PuyoBoardRenderer
  private chainRun = 0
  private turnStartPair?: PuyoPair
  private isVisualStopped = false
  private isDisposed = false
  private actionInput?: PhaserInputAdapter
  private isPaused = false
  private pauseOverlay?: Phaser.GameObjects.Rectangle
  private pauseText?: Phaser.GameObjects.Text
  private gameOverOverlay?: Phaser.GameObjects.Rectangle
  private gameOverText?: Phaser.GameObjects.Text
  private submittedRounds = 0
  private instructionText?: Phaser.GameObjects.Text

  public pressAction(action: GameAction, source: string): void {
    if (this.canAcceptAction(action)) this.actionInput?.press(action, source)
  }
  public releaseAction(source: string): void { this.actionInput?.release(source) }

  private canAcceptAction(action: GameAction): boolean {
    if (action === 'gravity' || this.isDisposed || (typeof document !== 'undefined' && document.hidden)) return false
    if (this.isShowingResult) return action === 'exit'
    if (this.isPaused) return action === 'pause' || action === 'exit'
    if (this.chainPlayback) return action === 'pause' || action === 'exit'
    if (this.isVisualStopped) return action === 'exit'
    if (this.gameState.gameOver) return action === 'exit' || action === 'evaluate'
    return true
  }

  // 描画関連
  private fieldSprites: (Phaser.GameObjects.Sprite | null)[][] = []
  private currentPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextNextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}

  // 回数・合計点表示
  private gtrCountText?: Phaser.GameObjects.Text
  private totalScoreText?: Phaser.GameObjects.Text

  // レイアウト設定（VisualConfigから）
  private readonly CELL_SIZE = FIELD_CONFIG.CELL_SIZE
  private readonly FIELD_X = LAYOUT_SCORE_ATTACK.FIELD_X
  private readonly FIELD_Y = LAYOUT_SCORE_ATTACK.FIELD_Y
  private readonly FALL_SPEED = 800

  // 着地アニメーション用

  // タイマー
  private lastFallTime = 0
  private placedMoves = ''

  constructor(
    private readonly onRound?: (snapshot: ScoreAttackSnapshot) => void,
    private readonly getTotalScore?: () => number | null,
  ) {
    super({ key: 'PuyoGame' })
    this.gameField = new GameFieldManager()
    this.gameState = this.createInitialGameState()
    this.captureTurnStartPair()
  }

  private captureTurnStartPair() {
    const pair = this.gameState.currentPair
    this.turnStartPair = pair ? { ...pair, main: { ...pair.main }, sub: { ...pair.sub } } : undefined
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
    PuyoRenderer.preload(this)
  }

  create() {
    if (this.textures) PuyoRenderer.createTextures(this)
    this.isDisposed = false
    this.isVisualStopped = false
    const canvasW = LAYOUT_SCORE_ATTACK.CANVAS_WIDTH
    const canvasH = LAYOUT_SCORE_ATTACK.CANVAS_HEIGHT

    // 背景
    this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, LAYOUT_SCORE_ATTACK.BG_COLOR)
    this.add.circle(canvasW - 50, 40, 180, 0x6d5bd0, 0.08)
    this.add.circle(30, canvasH - 20, 140, 0x3ecf8e, 0.04)

    // フィールドの枠線
    const fieldW = FIELD_CONFIG.COLS * this.CELL_SIZE
    const fieldH = FIELD_CONFIG.ROWS * this.CELL_SIZE
    const fieldCenterX = this.FIELD_X + fieldW / 2
    const fieldCenterY = this.FIELD_Y + fieldH / 2

    // フィールドの奥行きと外枠
    this.add.rectangle(fieldCenterX + 7, fieldCenterY + 9, fieldW + 12, fieldH + 12, 0x05040a, 0.45)
    this.add.rectangle(fieldCenterX, fieldCenterY, fieldW + FIELD_CONFIG.FIELD_BORDER_WIDTH * 2, fieldH + FIELD_CONFIG.FIELD_BORDER_WIDTH * 2, FIELD_CONFIG.FIELD_BORDER_COLOR)

    // 内枠（黒いぷよフィールド）
    this.add.rectangle(fieldCenterX, fieldCenterY, fieldW, fieldH, FIELD_CONFIG.FIELD_BG_COLOR)
    drawEvaluationRange(this, this.FIELD_X, this.FIELD_Y, this.CELL_SIZE)

    // フィールドグリッド
    this.drawGrid()

    addUIText(this, this.FIELD_X + this.CELL_SIZE * 2.5, this.FIELD_Y + this.CELL_SIZE * 0.5, '×', {
      fontSize: '22px', color: '#f47582', fontFamily: TEXT_STYLES.title.fontFamily, 
    }).setOrigin(0.5).setAlpha(0.72).setDepth(0)

    // ネクストぷよ表示エリア
    this.createNextAreas()

    // スプライト配列の初期化
    this.initializeSprites()

    // タイトル
    addUIText(this, this.FIELD_X, 24, 'SCORE ATTACK', { ...TEXT_STYLES.label, fontSize: '14px', color: '#b5a8ff' })
    this.gtrCountText = addUIText(this, this.FIELD_X, 48, 'GTR: 1 / 10', { ...TEXT_STYLES.title, fontSize: '24px', color: '#ffe99b' })

    // NEXTエリア下にGTR情報パネルを配置
    const infoPanelX = this.FIELD_X + fieldW + 24
    const infoPanelY = this.getNextAreaLayout().statusY + 14

    // TOTAL SCOREには、提出済み回のGTR評価合計だけを表示する。
    this.add.rectangle(
      infoPanelX + NEXT_AREA_CONFIG.AREA_WIDTH / 2,
      infoPanelY + 22,
      NEXT_AREA_CONFIG.AREA_WIDTH,
      88,
      NEXT_AREA_CONFIG.BG_COLOR
    ).setStrokeStyle(1, NEXT_AREA_CONFIG.BORDER_COLOR)
    addUIText(this, infoPanelX + 10, infoPanelY - 14, 'TOTAL SCORE', {
      ...TEXT_STYLES.label, fontSize: '14px', color: '#f8f7ff',
    })
    this.totalScoreText = addUIText(this, infoPanelX + NEXT_AREA_CONFIG.AREA_WIDTH / 2, infoPanelY + 16, '0', {
      ...TEXT_STYLES.score, fontSize: '28px', color: '#ffe99b',
    }).setOrigin(0.5, 0)

    // 操作説明（画面下部にコンパクト表示）
    this.instructionText = addUIText(this, this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE / 2, canvasH - 20,
      this.instructionLabel(),
      { ...TEXT_STYLES.subtitle, align: 'center' }
    ).setOrigin(0.5, 1)
    const stopInstructions = subscribeBindings(() => {
      this.instructionText?.setText(this.instructionLabel())
      if (this.isPaused) this.pauseText?.setText(this.pauseLabel())
    })

    this.game.canvas.setAttribute('tabindex', '0')
    this.game.canvas.addEventListener('pointerdown', () => this.game.canvas.focus())
    this.game.canvas.focus()
    this.actionInput = new PhaserInputAdapter(this.game.canvas, code =>
      (this.isShowingResult || this.isVisualStopped || this.gameState.gameOver) && code === 'Escape' ? 'exit' : undefined,
    action => this.canAcceptAction(action))

    // ゲーム開始
    this.startGame()
    const cleanup = () => {
      if (this.isDisposed) return
      this.isDisposed = true
      this.cancelChain()
      this.actionInput?.dispose()
      stopInstructions()
      window.removeEventListener('blur', this.handleWindowBlur)
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    window.addEventListener('blur', this.handleWindowBlur)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private handleWindowBlur = () => { this.actionInput?.releaseAll() }
  private instructionLabel(): string {
    return '操作キーはキー設定で確認'
  }
  private pauseLabel(): string {
    return `ポーズ中\n${actionKeys(getBindings(), 'pause')}で再開\n設定・終了は画面のボタンから`
  }
  private handleVisibilityChange = () => {
    if (document.hidden) { this.chainPlayback?.pause('hidden'); this.actionInput?.releaseAll() }
    else { this.chainPlayback?.resume('hidden'); this.lastFallTime = this.time.now; this.actionInput?.suppressUntilRelease() }
  }

  public prepareExternalResume(): void {
    this.actionInput?.suppressUntilRelease()
    this.lastFallTime = this.time.now
  }

  update(time: number, delta = 0) {
    this.updateTotalScoreDisplay()
    const actions = this.actionInput?.frame(time) ?? new Set<GameAction>()
    if (actions.has('exit')) { this.exitToMenu(); return }
    if (this.isShowingResult) return
    if (actions.has('pause')) { this.togglePause(); return }
    if (this.isPaused) return
    if (this.chainPlayback) {
      try { this.chainPlayback.update(delta) }
      catch (error) {
        console.error('連鎖アニメーションを再生できませんでした', error)
        this.cancelChain()
        this.showChainError('連鎖を表示できませんでした。もう一度お試しください')
      }
      return
    }
    if (this.isVisualStopped) return
    if (this.gameState.gameOver) {
      this.showGameOver()
      if (actions.has('evaluate')) this.evaluateAndReset()
      return
    }
    if (actions.has('evaluate')) { this.evaluateAndReset(); this.actionInput?.suppressUntilRelease(); return }
    if (actions.has('quickDrop')) { this.quickDrop(); return }
    this.handleInput(actions)
    if (this.isShowingResult || this.gameState.gameOver || this.chainPlayback) return
    this.updateFalling(time, actions.has('softDrop') || Boolean(this.actionInput?.isHeld('softDrop')))
    this.updateDisplay()
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused
    if (!this.isPaused) this.lastFallTime = this.time.now
    if (this.isPaused) this.chainPlayback?.pause('user')
    else this.chainPlayback?.resume('user')
    if (this.isPaused) {
      const width = LAYOUT_SCORE_ATTACK.CANVAS_WIDTH, height = LAYOUT_SCORE_ATTACK.CANVAS_HEIGHT
      this.pauseOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(500)
      this.pauseText = addUIText(this, width / 2, height / 2, this.pauseLabel(), {
        fontSize: '32px', wordWrap: { width: width - 64, useAdvancedWrap: true }, color: '#f6f2ff', fontFamily: TEXT_STYLES.title.fontFamily, align: 'center',
      }).setOrigin(0.5).setDepth(501)
    } else { this.pauseOverlay?.destroy(); this.pauseText?.destroy() }
    this.actionInput?.suppressUntilRelease()
  }

  private handleInput(actions: Set<GameAction>) {
    if (!this.gameState.currentPair) return
    const horizontal = actions.has('left') ? -1 : actions.has('right') ? 1 : 0
    if (horizontal && PuyoPairManager.canMove(this.gameState.currentPair, horizontal, 0, (x, y) => this.gameField.isOccupied(x, y)))
      this.gameState.currentPair = PuyoPairManager.movePair(this.gameState.currentPair, horizontal, 0)
    if (actions.has('softDrop') && PuyoPairManager.canMove(this.gameState.currentPair, 0, 1, (x, y) => this.gameField.isOccupied(x, y)))
      this.gameState.currentPair = PuyoPairManager.movePair(this.gameState.currentPair, 0, 1)
    if (actions.has('rotateLeft') || actions.has('rotateRight')) {
      const current = this.gameState.currentPair
      const rotated = PuyoPairManager.tryRotate(current,
        actions.has('rotateLeft') ? PuyoPairManager.rotateLeft(current) : PuyoPairManager.rotateRight(current),
        (x, y) => this.gameField.isOccupied(x, y))
      if (rotated) this.gameState.currentPair = rotated
    }
  }

  private quickDrop(): void {
    let pair = this.gameState.currentPair
    if (!pair) return
    while (PuyoPairManager.canMove(pair, 0, 1, (x, y) => this.gameField.isOccupied(x, y)))
      pair = PuyoPairManager.movePair(pair, 0, 1)
    this.gameState.currentPair = pair
    this.actionInput?.suppressUntilRelease()
    this.landCurrentPair()
  }

  private updateFalling(time: number, softDrop = false) {
    if (!this.gameState.currentPair) return

    if (time - this.lastFallTime >= this.FALL_SPEED) {
      this.lastFallTime = time
      const pair = this.gameState.currentPair
      if (PuyoPairManager.canMove(pair, 0, 1, (x, y) => this.gameField.isOccupied(x, y))) {
        this.gameState.currentPair = PuyoPairManager.movePair(pair, 0, 1)
      } else {
        if (softDrop) this.actionInput?.suppressUntilRelease()
        this.landCurrentPair()
        return
      }
    }

    if (softDrop && !PuyoPairManager.canMove(this.gameState.currentPair, 0, 1, (x, y) => this.gameField.isOccupied(x, y))) {
      this.actionInput?.suppressUntilRelease()
      this.landCurrentPair()
    }
  }

  private landCurrentPair() {
    if (!this.gameState.currentPair || this.chainPlayback) return

    const pair = this.gameState.currentPair
    const positions = PuyoPairManager.getRotatedPositions(pair)

    const field = this.gameField.getField()
    const landing = { mainPos: positions.main, subPos: positions.sub, valid: true }
    if (!canApplyPairPlacement(field.grid, landing)) {
      this.showChainError('配置できませんでした。もう一度お試しください')
      return
    }
    try {
      const move = encodePlacedPair({ ...pair, main: { ...pair.main, ...positions.main }, sub: { ...pair.sub, ...positions.sub } })
      const trace = resolveChainsWithTrace(applyPairPlacement(field.grid, pair, landing), {}, String(++this.chainRun))
      const run = this.chainRun
      this.hideFieldForChain()
      this.chainRenderer = new PuyoBoardRenderer(this, this.FIELD_X, this.FIELD_Y, trace, field.grid)
      this.chainPlayback = new ChainPlayback(trace, {
        frame: frame => this.chainRenderer?.frame(frame),
        complete: () => this.commitChain(run, trace.result, move),
      })
      if (document.hidden) this.chainPlayback.pause('hidden')
    } catch (error) {
      console.error('連鎖アニメーションを開始できませんでした', error)
      this.cancelChain()
      this.showChainError('連鎖を表示できませんでした。もう一度お試しください')
    }
  }

  private commitChain(run: number, result: ReturnType<typeof resolveChainsWithTrace>['result'], move = '') {
    if (run !== this.chainRun || !this.chainPlayback || this.isDisposed) return
    // Compute fallible decisions before changing the live turn.
    const gtrResult = GTRDetector.detectGTR(result.stableGrid)
    const terminal = isSpawnBlocked(result.stableGrid)
    const suppliedPair = terminal ? undefined : PuyoPairManager.createRandomPair()
    this.placedMoves += move
    this.chainPlayback = undefined
    this.chainRun++
    const renderer = this.chainRenderer
    this.chainRenderer = undefined
    this.gameField.setField({ ...this.gameField.getField(), grid: result.stableGrid })
    this.gameState.field = this.gameField.getField()
    this.gameState.score += result.clearedPuyos * 10
    this.applyGTRScore(gtrResult)
    this.spawnNextPair(false, suppliedPair)
    this.lastFallTime = this.time.now
    this.actionInput?.suppressUntilRelease()

    // Visual failures cannot turn an already committed move into an undo.
    try {
        renderer?.dispose()
      this.rebuildFieldSprites()
      this.updateDisplay()
      if (result.chainCount > 0) this.playScorePopup(
        this.FIELD_X + 3 * this.CELL_SIZE, this.FIELD_Y + 2 * this.CELL_SIZE,
        `${result.chainCount}連鎖! +${result.clearedPuyos * 10}`)
      if (gtrResult.isGTR) {
        this.updateGTRDisplay(gtrResult)
        this.showGTREffect()
      }
    } catch (error) {
      this.recoverCommittedDisplay(error, gtrResult)
    }
  }

  private recoverCommittedDisplay(error: unknown, gtrResult: GTRScore) {
    console.error('確定済みの連鎖の表示を復旧できませんでした', error)
    try {
      this.rebuildFieldSprites()
      this.updateDisplay()
      if (gtrResult.isGTR) this.updateGTRDisplay(gtrResult)
    } catch (recoveryError) {
      console.error('盤面表示の復旧に失敗しました', recoveryError)
      this.isVisualStopped = true
      try { addUIText(this, this.FIELD_X, this.FIELD_Y - 22, '表示を復旧できません。Escで戻れます。', { ...TEXT_STYLES.subtitle, color: '#ff9aa5', wordWrap: { width: LAYOUT_SCORE_ATTACK.CANVAS_WIDTH - this.FIELD_X - 24, useAdvancedWrap: true } }) }
      catch { /* The scene is no longer drawable. */ }
    }
  }

  private hideFieldForChain() {
    this.currentPairSprites.main?.setVisible(false)
    this.currentPairSprites.sub?.setVisible(false)
    for (const row of this.fieldSprites) for (const sprite of row) sprite?.setVisible(false)
  }

  private rebuildFieldSprites() {
    for (const row of this.fieldSprites) for (const sprite of row) sprite?.destroy()
    this.initializeSprites()
    this.updateFieldSprites()
  }

  private cancelChain() {
    this.chainRun++
    this.chainPlayback?.cancel()
    this.chainPlayback = undefined
    this.chainRenderer?.dispose()
    this.chainRenderer = undefined
  }

  private showChainError(message: string) {
    if (this.turnStartPair) this.gameState.currentPair = {
      ...this.turnStartPair, main: { ...this.turnStartPair.main }, sub: { ...this.turnStartPair.sub },
    }
    this.rebuildFieldSprites()
    this.updateDisplay()
    addUIText(this, this.FIELD_X, this.FIELD_Y - 20, message, { ...TEXT_STYLES.subtitle, color: '#ff9aa5', wordWrap: { width: LAYOUT_SCORE_ATTACK.CANVAS_WIDTH - this.FIELD_X - 24, useAdvancedWrap: true } })
    this.lastFallTime = this.time.now
    this.actionInput?.suppressUntilRelease()
  }

  /*
  private processChainLegacy() {
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
  */

  private applyGTRScore(gtrResult: GTRScore) {
    if (gtrResult.isGTR) {
      this.gameState.gtrCount++
      this.gameState.gtrScore += gtrResult.totalScore
      this.gameState.score += gtrResult.totalScore * 10
    }
  }

  private updateGTRDisplay(_gtrResult: GTRScore) {
    this.gtrCountText?.setText(`GTR: ${Math.min(this.submittedRounds + 1, SCORE_ATTACK_ROUNDS)} / ${SCORE_ATTACK_ROUNDS}`)
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

      const star = addUIText(this, px, py, '★', {
        fontSize: '18px',
        color: '#ffe99b',
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

  private spawnNextPair(_showVisuals = true, suppliedPair?: PuyoPair) {
    if (this.gameField.isGameOver()) {
      this.gameState.gameOver = true
      return
    }

    const nextPair = suppliedPair ?? PuyoPairManager.createRandomPair()

    this.gameState.currentPair = this.gameState.nextPair
    this.gameState.nextPair = this.gameState.nextNextPair
    this.gameState.nextNextPair = nextPair
    this.captureTurnStartPair()
  }

  private showGameOver(): void {
    if (this.isDisposed || !this.gameState.gameOver || this.gameOverText) return
    const width = FIELD_CONFIG.COLS * this.CELL_SIZE
    const height = FIELD_CONFIG.ROWS * this.CELL_SIZE
    const x = this.FIELD_X + width / 2
    const y = this.FIELD_Y + height / 2
    this.gameOverOverlay = this.add.rectangle(x, y, width, height, 0x0c0a14, 0.72).setDepth(500)
    this.gameOverText = addUIText(this, x, y, 'GameOver', {
      ...TEXT_STYLES.title, fontSize: '32px', color: '#ff9aa5', align: 'center',
    }).setOrigin(0.5).setDepth(501)
  }

  private clearGameOver(): void {
    this.gameOverOverlay?.destroy()
    this.gameOverText?.destroy()
    this.gameOverOverlay = undefined
    this.gameOverText = undefined
  }

  private startGame() {
    this.lastFallTime = this.time.now
  }

  private initializeSprites() {
    this.fieldSprites = Array(FIELD_CONFIG.ROWS).fill(null).map(() => Array(FIELD_CONFIG.COLS).fill(null))
  }

  private updateDisplay() {
    if (this.chainPlayback) return
    this.updateFieldSprites()
    this.updateCurrentPairSprites()
    this.updateNextPairSprites()
    if (this.gameState.gameOver) this.showGameOver()
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
            PuyoRenderer.textureKey, PuyoRenderer.frame(color, `connect/${cellMask(field.grid, x, y)}`)
          )
          sprite.setDisplaySize(this.CELL_SIZE, this.CELL_SIZE)
          this.fieldSprites[y][x] = sprite
        } else if (!color && currentSprite) {
          this.fieldSprites[y][x] = null
          currentSprite.destroy()
        } else if (color && currentSprite) {
          currentSprite.setFrame(PuyoRenderer.frame(color, `connect/${cellMask(field.grid, x, y)}`))
        }
      }
    }
  }

  private updateCurrentPairSprites() {
    if (!this.gameState.currentPair || this.gameState.gameOver) {
      this.currentPairSprites.main?.setVisible(false)
      this.currentPairSprites.sub?.setVisible(false)
      return
    }

    const pair = this.gameState.currentPair
    const positions = PuyoPairManager.getRotatedPositions(pair)

    // メインスプライト - テクスチャが変わった時のみ再生成
    if (!this.currentPairSprites.main) {
      this.currentPairSprites.main = this.add.sprite(0, 0, PuyoRenderer.textureKey, PuyoRenderer.frame(pair.main.color, 'idle'))
      this.currentPairSprites.main.setDisplaySize(this.CELL_SIZE, this.CELL_SIZE)
      this.currentPairSprites.main.setAlpha(0.95)
      this.currentPairSprites.main.setDepth(10)
    }
    this.currentPairSprites.main.setFrame(PuyoRenderer.frame(pair.main.color, 'idle'))
    this.currentPairSprites.main.setPosition(
      this.FIELD_X + positions.main.x * this.CELL_SIZE + this.CELL_SIZE / 2,
      this.FIELD_Y + positions.main.y * this.CELL_SIZE + this.CELL_SIZE / 2
    )
    this.currentPairSprites.main.setVisible(true)

    // サブスプライト
    if (!this.currentPairSprites.sub) {
      this.currentPairSprites.sub = this.add.sprite(0, 0, PuyoRenderer.textureKey, PuyoRenderer.frame(pair.sub.color, 'idle'))
      this.currentPairSprites.sub.setDisplaySize(this.CELL_SIZE, this.CELL_SIZE)
      this.currentPairSprites.sub.setAlpha(0.95)
      this.currentPairSprites.sub.setDepth(10)
    }
    this.currentPairSprites.sub.setFrame(PuyoRenderer.frame(pair.sub.color, 'idle'))
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
    if (this.isDisposed || this.isShowingResult || this.isPaused || this.chainPlayback || this.isVisualStopped) return
    const snapshot: ScoreAttackSnapshot = structuredClone({
      grid: this.gameField.getField().grid, currentPair: this.gameState.currentPair, moves: this.placedMoves,
      nextPair: this.gameState.nextPair, nextNextPair: this.gameState.nextNextPair,
    })
    this.submittedRounds++
    this.actionInput?.suppressUntilRelease()
    if (this.submittedRounds < SCORE_ATTACK_ROUNDS) {
      this.resetGame()
      this.updateDisplay()
    } else {
      this.clearGameOver()
      this.isShowingResult = true
    }
    this.onRound?.(snapshot)
  }

  private resetGame() {
    this.clearGameOver()
    this.cancelChain()
    this.isVisualStopped = false
    this.gameField.clear()
    this.placedMoves = ''
    this.clearAllSprites()
    this.gameState = this.createInitialGameState()
    this.captureTurnStartPair()

    if (this.gtrCountText) {
      this.gtrCountText.setText(`GTR: ${this.submittedRounds + 1} / ${SCORE_ATTACK_ROUNDS}`)
    }
    this.lastFallTime = this.time.now
  }

  private updateNextPairSprites() {
    this.clearNextSprites()
    const layout = this.getNextAreaLayout()
    if (this.gameState.nextPair) this.nextPairSprites = createNextPairSprites(this, this.gameState.nextPair, layout.next)
    if (this.gameState.nextNextPair) this.nextNextPairSprites = createNextPairSprites(this, this.gameState.nextNextPair, layout.nextNext)
  }

  private getNextAreaLayout() {
    return getNextPreviewLayout(this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE + 24, this.FIELD_Y)
  }

  private createNextAreas() {
    const layout = this.getNextAreaLayout()
    drawNextPreview(this, layout)
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

  private updateTotalScoreDisplay(): void {
    const total = this.getTotalScore ? this.getTotalScore() : 0
    this.totalScoreText?.setText(total === null ? '—' : String(total))
  }

  // スコアフロートアニメーション
  private playScorePopup(x: number, y: number, text: string) {
    const scoreText = addUIText(this, x, y, text, {
      fontSize: '20px',
      color: '#ffe99b',
      fontFamily: TEXT_STYLES.title.fontFamily,
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

  private exitToMenu() {
    this.isShowingResult = true
    this.actionInput?.suppressUntilRelease()
    this.cancelChain()
    const onExit = this.game.registry.get('onExit')
    if (onExit && typeof onExit === 'function') {
      onExit()
    }
  }
}
