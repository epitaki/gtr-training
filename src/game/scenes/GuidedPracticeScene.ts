import { isPairSequence, pairFromSequence, type PairColors } from '../core/PairSequence'
import { addUIText } from '../rendering/UIText'
import * as Phaser from 'phaser'
import { GameFieldManager } from '../core/GameField'
import { PuyoPairManager, PuyoPairRandom } from '../core/PuyoPair'
import { GameState } from '../core/types'
import { GTRDetector, GTRScore } from '../gtr/GTRPatterns'
import { isInGTREvaluationRange } from '../gtr/EvaluationRange'
import { createGTRChainPreview } from '../gtr/GTRChainPreview'
import { GuideManager } from '../guide/GuideManager'
import {
  COMPLETION_SHAPES, GTR_COMPLETION_EXAMPLES, getCompletionColors,
  getCompletionExampleGrids, getDisplayedCompletionShape,
} from '../guide/GTRCompletionExamples'
import type { TailShape } from '../advisor/TailPlanner'
import { GameHistory, cloneGameHistoryState, type GameHistoryState } from '../core/GameHistory'
import { applyPairPlacement, canApplyPairPlacement, isSpawnBlocked, resolveChainsWithTrace } from '../core/ChainSimulator'
import { ChainPlayback } from '../rendering/ChainPlayback'
import { ResultChainPlayback, type ResultChainFrame } from '../rendering/ResultChainPlayback'
import { drawEvaluationRange } from '../rendering/EvaluationRangeBackground'
import { PuyoBoardRenderer } from '../rendering/PuyoBoardRenderer'
import { PuyoRenderer } from '../rendering/PuyoRenderer'
import { cellMask } from '../rendering/PuyoConnections'
import { FIELD_CONFIG, LAYOUT_GUIDED, TEXT_STYLES, ANIMATION_CONFIG, NEXT_AREA_CONFIG } from '../rendering/VisualConfig'
import { createNextPairSprites, drawNextPreview, getNextPreviewLayout } from '../rendering/NextPreview'
import { PlacementAdvisor, PlacementAdvice, type GTRTrainingPlan } from '../advisor/PlacementAdvisor'
import { PhaserInputAdapter } from '../input/PhaserInputAdapter'
import { actionKeys, type GameAction } from '../input/bindings'
import { getBindings, subscribeBindings } from '../input/settings'
import { ContinuousAdvisor } from '../advisor/ContinuousAdvisor'
import { isGuidedTailComplete } from '../advisor/GuidedTail'
import {
  GTR_REPORT_CLOSE_EVENT,
  GTR_REPORT_READY_EVENT,
  GTR_REPORT_REQUEST_EVENT,
  GTR_REPORT_SCENE_READY_EVENT,
  GTR_REPORT_UNAVAILABLE_EVENT,
  GTR_CHAIN_RESOLUTION_ENDED_EVENT,
  GTR_REPLAY_RESUME_EVENT,
  clearGTRReplayHash,
  cloneReportPair,
  cloneTurnRecords,
  createGTRIssueSnapshot,
  createSafeGTRPageUrl,
  readGTRReplayFromLocation,
  type GTROpeningPairs,
  type GTRIssueSnapshot,
  type GTRReportUnavailableDetail,
  type GTRTurnRecord,
} from '../feedback/GTRIssueReport'

// Keep dot-font contours crisp when sampling the high-density result text.
function addResultText(scene: Phaser.Scene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  const label = addUIText(scene, x, y, text, { ...style, resolution: 4 })
  label.texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
  return label
}

export default class GuidedPracticeScene extends Phaser.Scene {
  private actionInput?: PhaserInputAdapter

  public pressAction(action: GameAction, source: string): void {
    const mapped = this.isShowingResult && action === 'evaluate' && source.startsWith('pointer:') ? 'newGame' : action
    if (this.canAcceptAction(mapped)) this.actionInput?.press(mapped, source)
  }
  public releaseAction(source: string): void { this.actionInput?.release(source) }

  private canAcceptAction(action: GameAction): boolean {
    if (this.isDisposed || (typeof document !== 'undefined' && document.hidden) ||
        this.isReportPanelOpen || this.isReplayInspection) return false
    if (this.isShowingResult) return ['newGame', 'exit', 'share'].includes(action)
    if (this.isPaused) return action === 'pause' || action === 'exit'
    if (this.chainPlayback) return ['pause', 'rewind', 'gravity', 'guide', 'evaluate', 'share', 'exit'].includes(action)
    if (this.gameState.gameOver || this.isVisualStopped) return action === 'rewind' || action === 'exit'
    return true
  }

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
  private trainingPlan?: GTRTrainingPlan
  private practiceSequence?: readonly PairColors[]
  private readonly pairRandom = new PuyoPairRandom()
  private openingPairs!: GTROpeningPairs
  private turnHistory: GTRTurnRecord[] = []
  private isReportPanelOpen: boolean = false
  private isReplayInspection: boolean = false
  private isInspectionFrozen: boolean = false
  private clockWasPaused: boolean = false
  private tweenTimeScale: number = 1
  private isDisposed: boolean = false
  private keyboardWasEnabled: boolean = true
  private keyboardPreventDefaultWas: boolean = true
  private reportSnapshot?: GTRIssueSnapshot
  private replayPreviousState?: GameHistoryState
  private chainPlayback?: ChainPlayback
  private chainRenderer?: PuyoBoardRenderer
  private chainRun = 0
  private turnStartSnapshot?: GameHistoryState
  private pendingPlacement?: { pair: NonNullable<GameState['currentPair']>; mainPos: { x: number; y: number }; subPos: { x: number; y: number } }
  private chainNotice?: Phaser.GameObjects.Text
  private isVisualStopped = false

  // 描画関連
  private fieldSprites: (Phaser.GameObjects.Sprite | null)[][] = []
  private currentPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private nextNextPairSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private guideDisplay?: Phaser.GameObjects.Container
  private manualCompletionShape: TailShape | null = null
  private ghostSprites: { main?: Phaser.GameObjects.Sprite; sub?: Phaser.GameObjects.Sprite } = {}
  private pauseOverlay?: Phaser.GameObjects.Rectangle
  private pauseText?: Phaser.GameObjects.Text
  private gravityStatusText?: Phaser.GameObjects.Text
  private advisorStatusText?: Phaser.GameObjects.Text
  private resultOverlay?: Phaser.GameObjects.Rectangle
  private resultContainer?: Phaser.GameObjects.Container
  private resultPlayback?: ResultChainPlayback
  private resultGeneration = 0

  // レイアウト設定（VisualConfigから）
  private readonly CELL_SIZE = FIELD_CONFIG.CELL_SIZE
  private readonly FIELD_X = LAYOUT_GUIDED.FIELD_X
  private readonly FIELD_Y = LAYOUT_GUIDED.FIELD_Y
  private readonly FALL_SPEED = 800
  private readonly GUIDE_X = LAYOUT_GUIDED.GUIDE_X
  private readonly GUIDE_Y = LAYOUT_GUIDED.GUIDE_Y

  // 着地アニメーション用

  // タイマー
  private lastFallTime = 0

  constructor(practiceSequence?: readonly PairColors[]) {
    super({ key: 'GuidedPracticeScene' })
    this.gameField = new GameFieldManager()
    this.guideManager = new GuideManager()
    this.gameHistory = new GameHistory()
    if (practiceSequence !== undefined) {
      if (!isPairSequence(practiceSequence)) throw new Error('練習するツモが正しくありません')
      this.practiceSequence = practiceSequence.map(pair => [...pair] as PairColors)
    }
    const replay = practiceSequence ? null : readGTRReplayFromLocation()
    if (replay) {
      this.practiceSequence = replay.practiceSequence?.map(pair => [...pair] as PairColors)
      this.gameField.setField(replay.field)
      this.pairRandom.setState(replay.pairRandomState)
      this.trainingPlan = { ...replay.trainingPlan }
      this.openingPairs = {
        pair1: cloneReportPair(replay.openingPairs.pair1)!,
        pair2: cloneReportPair(replay.openingPairs.pair2)!,
      }
      this.turnHistory = cloneTurnRecords(replay.recentTurns)
      this.replayPreviousState = replay.previousState
        ? cloneGameHistoryState(replay.previousState)
        : undefined
      this.isGravityEnabled = replay.sourceSettings.gravityEnabled
      this.isAdvisorEnabled = replay.sourceSettings.advisorEnabled
      this.isPaused = replay.sourceSettings.paused
      this.isShowingResult = replay.sourceSettings.showingResult
      this.isReplayInspection = true
      this.gameState = {
        field: this.gameField.getField(),
        currentPair: cloneReportPair(replay.currentPair),
        nextPair: cloneReportPair(replay.nextPair),
        nextNextPair: cloneReportPair(replay.nextNextPair),
        score: replay.score,
        gtrCount: replay.gtrCount,
        gtrScore: replay.gtrScore,
        gameOver: replay.gameOver,
        pairRandomState: replay.pairRandomState,
      }
    } else {
      this.gameState = this.createInitialGameState()
    }
  }

  private createInitialGameState(): GameState {
    const twoHandCombination = this.practiceSequence
      ? { pair1: this.createPracticePair(0), pair2: this.createPracticePair(1) }
      : PuyoPairManager.createValidTwoHandCombination(this.pairRandom.next)
    this.trainingPlan = PlacementAdvisor.createTrainingPlan(
      twoHandCombination.pair1,
      twoHandCombination.pair2,
    )
    this.openingPairs = {
      pair1: cloneReportPair(twoHandCombination.pair1)!,
      pair2: cloneReportPair(twoHandCombination.pair2)!,
    }

    return {
      field: this.gameField.getField(),
      currentPair: twoHandCombination.pair1,
      nextPair: twoHandCombination.pair2,
      nextNextPair: this.createPracticePair(2),
      score: 0,
      gtrCount: 0,
      gtrScore: 0,
      gameOver: false,
      pairRandomState: this.pairRandom.getState(),
    }
  }

  private createPracticePair(index: number) {
    return pairFromSequence(this.practiceSequence, index) ?? PuyoPairManager.createRandomPair(this.pairRandom.next)
  }

  preload() {
    PuyoRenderer.preload(this)
  }

  create() {
    if (this.textures) PuyoRenderer.createTextures(this)
    this.isDisposed = false
    this.isVisualStopped = false
    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    // 背景
    this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, LAYOUT_GUIDED.BG_COLOR)
    this.add.circle(canvasW - 40, 30, 230, 0x6d5bd0, 0.07)
    this.add.circle(40, canvasH - 20, 170, 0x3ecf8e, 0.035)

    // タイトル
    addUIText(this, canvasW / 2, 27, 'GUIDED PRACTICE', { ...TEXT_STYLES.label, fontSize: '14px', color: '#b5a8ff', letterSpacing: 2 }).setOrigin(0.5)
    addUIText(this, canvasW / 2, 49, 'ガイド付きGTR練習', {
      ...TEXT_STYLES.title,
      fontSize: '24px',
    }).setOrigin(0.5)

    const stopInstructions = subscribeBindings(() => this.refreshBindingLabels())

    // フィールド描画
    this.drawField()

    addUIText(this, this.FIELD_X + this.CELL_SIZE * 2.5, this.FIELD_Y + this.CELL_SIZE * 0.5, '×', {
      fontSize: '22px', color: '#f47582', fontFamily: TEXT_STYLES.title.fontFamily, 
    }).setOrigin(0.5).setAlpha(0.72).setDepth(0)

    // ガイド表示エリア
    this.createGuideDisplay()

    // ネクストぷよ表示エリア
    this.createNextAreas()

    // スプライト配列の初期化
    this.initializeSprites()

    this.game.canvas.setAttribute('tabindex', '0')
    this.game.canvas.addEventListener('pointerdown', () => this.game.canvas.focus())
    this.game.canvas.focus()
    this.actionInput = new PhaserInputAdapter(this.game.canvas, code => this.isShowingResult
      ? code === 'Space' ? 'newGame' : code === 'Escape' ? 'exit' : undefined
      : (this.isVisualStopped || this.gameState.gameOver) && code === 'Escape' ? 'exit' : undefined,
    action => this.canAcceptAction(action))
    const scrollArea = this.game.canvas.closest('.canvas-scroll')
    const updatePointerBounds = () => this.scale.updateBounds()
    scrollArea?.addEventListener('scroll', updatePointerBounds)
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener(GTR_REPORT_REQUEST_EVENT, this.handleReportRequest)
    window.addEventListener(GTR_REPORT_CLOSE_EVENT, this.handleReportClose)
    window.addEventListener(GTR_REPLAY_RESUME_EVENT, this.handleReplayResume)
    const cleanupReportEvents = () => {
      if (this.isDisposed) return
      this.isDisposed = true
      this.cleanupResult()
      this.cancelChain()
      this.actionInput?.dispose()
      scrollArea?.removeEventListener('scroll', updatePointerBounds)
      stopInstructions()
      window.removeEventListener(GTR_REPORT_REQUEST_EVENT, this.handleReportRequest)
      window.removeEventListener(GTR_REPORT_CLOSE_EVENT, this.handleReportClose)
      window.removeEventListener(GTR_REPLAY_RESUME_EVENT, this.handleReplayResume)
      window.removeEventListener('blur', this.handleWindowBlur)
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
      const keyboard = this.input.keyboard
      if (this.isReportPanelOpen && keyboard?.manager) {
        keyboard.enabled = this.keyboardWasEnabled
        keyboard.manager.preventDefault = this.keyboardPreventDefaultWas
      }
      if (window.__GTR_ISSUE_SNAPSHOT__ === this.reportSnapshot) {
        delete window.__GTR_ISSUE_SNAPSHOT__
      }
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupReportEvents)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanupReportEvents)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)

    const nextLayout = this.getNextAreaLayout()

    // Keep both toggle buttons below NEXT without covering the queue or guide.
    const toggleX = nextLayout.baseX + NEXT_AREA_CONFIG.AREA_WIDTH / 2
    this.gravityStatusText = this.createSettingToggle('gravity', toggleX, nextLayout.statusY,
      this.isGravityEnabled ? '自由落下 ON' : '自由落下 OFF', this.isGravityEnabled ? '#66e0aa' : '#f47582')
    this.advisorStatusText = this.createSettingToggle('guide', toggleX, nextLayout.statusY + 52,
      this.isAdvisorEnabled ? 'ガイド ON' : 'ガイド OFF', this.isAdvisorEnabled ? '#b5a8ff' : '#f47582')

    // ゲーム開始
    this.startGame()
    this.updateGuide()
    if (this.isReplayInspection) this.freezeInspection()
    window.dispatchEvent(new Event(GTR_REPORT_SCENE_READY_EVENT))
  }

  update(time: number, delta = 0) {
    if (this.isReportPanelOpen) return
    const actions = this.actionInput?.frame(time) ?? new Set<GameAction>()
    if (this.isShowingResult) {
      if (actions.has('share')) { this.openIssueReport(); return }
      if (actions.has('newGame')) { this.restartFromResult(); return }
      if (actions.has('exit')) { this.cleanupResult(); this.isShowingResult = false; this.exitToMenu(); return }
      if (!this.isReplayInspection && !document.hidden) this.resultPlayback?.update(delta)
      return
    }
    if (actions.has('share')) { this.openIssueReport(); return }
    if (this.isReplayInspection) return
    if (actions.has('exit')) { this.exitToMenu(); return }
    if (actions.has('pause')) { this.togglePause(); return }
    if (this.chainPlayback) {
      if (actions.has('rewind')) { this.cancelPendingTurn(); return }
      if (actions.has('gravity') || actions.has('guide') || actions.has('evaluate')) this.showChainNotice()
      try { this.chainPlayback?.update(delta) }
      catch (error) {
        console.error('連鎖アニメーションを再生できませんでした', error)
        this.restoreTurnStart('連鎖を表示できませんでした。もう一度お試しください')
      }
      return
    }
    if (this.isPaused) return
    if (this.isVisualStopped) {
      if (actions.has('rewind')) this.rewind()
      return
    }
    if (this.gameState.gameOver) {
      if (!this.isDisposed && !document.hidden) {
        this.resetGame()
        this.startGame()
      }
      return
    }
    if (actions.has('gravity')) { this.toggleGravity(); return }
    if (actions.has('guide')) { this.toggleAdvisor(); return }
    if (actions.has('rewind')) { this.rewind(); return }
    if (actions.has('evaluate')) { this.evaluateGTR(); this.actionInput?.suppressUntilRelease(); return }
    if (actions.has('quickDrop')) { this.quickDrop(); return }
    this.handleInput(actions)
    if (this.isPaused || this.isShowingResult || this.gameState.gameOver || this.chainPlayback) return
    this.updateFalling(time, actions.has('softDrop') || Boolean(this.actionInput?.isHeld('softDrop')))
    this.updateDisplay()
  }

  private restartFromResult(): void {
    this.cleanupResult()
    const generation = this.resultGeneration
    this.time.delayedCall(100, () => {
      if (this.isDisposed || generation !== this.resultGeneration) return
      this.isPaused = false
      this.isShowingResult = false
      this.resetGame()
      this.startGame()
    })
  }

  private handleReportRequest = () => {
    if (this.isDisposed) return
    this.openIssueReport()
  }

  private handleWindowBlur = () => { this.actionInput?.releaseAll() }

  private refreshBindingLabels(): void {
    if (this.isPaused && !this.isShowingResult) this.pauseText?.setText(this.pauseLabel())
  }
  private pauseLabel(): string {
    return `ポーズ中\n${actionKeys(getBindings(), 'pause')}で再開\n設定・終了は画面のボタンから`
  }
  private handleVisibilityChange = () => {
    if (document.hidden) { this.chainPlayback?.pause('hidden'); this.handleWindowBlur() }
    else { this.chainPlayback?.resume('hidden'); this.lastFallTime = this.time.now; this.suppressHeldInputUntilRelease() }
  }

  private handleReportClose = () => {
    if (this.isDisposed) return
    this.isReportPanelOpen = false
    this.lastFallTime = this.time.now
    const keyboard = this.input.keyboard
    if (keyboard?.manager) {
      keyboard.enabled = this.keyboardWasEnabled
      keyboard.manager.preventDefault = this.keyboardPreventDefaultWas
    }
    this.suppressHeldInputUntilRelease()
    if (!this.isReplayInspection) this.unfreezeInspection()
  }

  private handleReplayResume = () => {
    if (this.isDisposed) return
    this.isReplayInspection = false
    this.lastFallTime = this.time.now
    this.suppressHeldInputUntilRelease()
    if (!this.isReportPanelOpen) this.unfreezeInspection()
  }

  private suppressHeldInputUntilRelease() { this.actionInput?.suppressUntilRelease() }

  public prepareExternalResume(): void {
    this.lastFallTime = this.time.now
    this.suppressHeldInputUntilRelease()
  }

  private getReportTurnNumber(): number {
    const lastCompletedTurn = this.turnHistory[this.turnHistory.length - 1]?.turn ?? 0
    return this.gameState.gameOver && lastCompletedTurn > 0
      ? lastCompletedTurn
      : lastCompletedTurn + 1
  }

  private getReportAdvice(): PlacementAdvice | null {
    return this.isAdvisorEnabled ? this.currentAdvice : null
  }

  private freezeInspection() {
    if (this.isInspectionFrozen) return
    this.clockWasPaused = this.time.paused
    this.tweenTimeScale = this.tweens.timeScale
    this.time.paused = true
    this.tweens.timeScale = 0
    this.isInspectionFrozen = true
  }

  private unfreezeInspection() {
    if (!this.isInspectionFrozen) return
    this.time.paused = this.clockWasPaused
    this.tweens.timeScale = this.tweenTimeScale
    this.isInspectionFrozen = false
  }

  private openIssueReport() {
    if (this.chainPlayback) {
      window.dispatchEvent(new CustomEvent<GTRReportUnavailableDetail>(GTR_REPORT_UNAVAILABLE_EVENT, {
        detail: { reason: 'chain-resolving' },
      }))
      return
    }
    if (!this.trainingPlan) return

    let snapshot: GTRIssueSnapshot
    try {
      const field = this.gameField.getField()
      snapshot = createGTRIssueSnapshot({
        page: createSafeGTRPageUrl(),
        turnNumber: this.getReportTurnNumber(),
        gameState: {
          ...this.gameState,
          field,
        },
        openingPairs: this.openingPairs,
        practiceSequence: this.practiceSequence,
        pairRandomState: this.pairRandom.getState(),
        trainingPlan: this.trainingPlan,
        settings: {
          gravityEnabled: this.isGravityEnabled,
          advisorEnabled: this.isAdvisorEnabled,
          paused: this.isPaused,
          showingResult: this.isShowingResult,
        },
        gtrEvaluation: GTRDetector.detectGTR(field.grid),
        tailPlans: PlacementAdvisor.getTailPlans(field.grid, this.trainingPlan),
        advice: this.getReportAdvice(),
        recentTurns: this.turnHistory,
        previousState: this.gameHistory.getPreviousState(),
      })
    } catch (error) {
      console.error('GTR報告用スナップショットを作成できませんでした', error)
      return
    }

    const wasOpen = this.isReportPanelOpen
    this.isReportPanelOpen = true
    const keyboard = this.input.keyboard
    if (!wasOpen && keyboard?.manager) {
      this.keyboardWasEnabled = keyboard.enabled
      this.keyboardPreventDefaultWas = keyboard.manager.preventDefault
      keyboard.manager.preventDefault = false
      keyboard.enabled = false
    }

    if (!wasOpen) this.freezeInspection()
    this.reportSnapshot = snapshot
    window.__GTR_ISSUE_SNAPSHOT__ = snapshot
    window.dispatchEvent(new CustomEvent(GTR_REPORT_READY_EVENT, { detail: snapshot }))
  }

  private togglePause() {
    this.isPaused = !this.isPaused
    if (this.isPaused) this.chainPlayback?.pause('user')
    else this.chainPlayback?.resume('user')
    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    if (this.isPaused) {
      this.pauseOverlay = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, 0x000000, 0.7).setDepth(500)
      this.pauseText = addUIText(this, canvasW / 2, canvasH / 2, this.pauseLabel(), {
        fontSize: '32px',
        color: '#f6f2ff',
        fontFamily: TEXT_STYLES.title.fontFamily,
        align: 'center', wordWrap: { width: canvasW - 64, useAdvancedWrap: true },
      }).setOrigin(0.5).setDepth(501)
    } else {
      this.pauseOverlay?.destroy()
      this.pauseText?.destroy()
    }
    this.suppressHeldInputUntilRelease()
  }

  private rewind() {
    if (this.chainPlayback) { this.cancelPendingTurn(); return }
    const previousState = this.gameHistory.rewind()
    if (previousState) {
      this.gameState.gameOver = false
      this.gameField.setField(previousState.field)
      this.gameState.field = this.gameField.getField()
      this.gameState.currentPair = previousState.currentPair
      this.gameState.nextPair = previousState.nextPair
      this.gameState.nextNextPair = previousState.nextNextPair
      this.gameState.score = previousState.score
      this.gameState.gtrCount = previousState.gtrCount
      this.gameState.gtrScore = previousState.gtrScore
      this.turnStartSnapshot = cloneGameHistoryState(previousState)
      if (previousState.pairRandomState !== undefined) {
        this.pairRandom.setState(previousState.pairRandomState)
        this.gameState.pairRandomState = previousState.pairRandomState
      }
      this.turnHistory.pop()

      this.updateGuideState()
      this.updateAdvice()
      this.updateGuide()
      this.updateDisplay()
      this.suppressHeldInputUntilRelease()
    }
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

    if (this.isGravityEnabled && time - this.lastFallTime >= this.FALL_SPEED) {
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

    this.clearGhostSprites()

    const pair = this.gameState.currentPair
    const placedPair = cloneReportPair(pair)!
    const positions = PuyoPairManager.getRotatedPositions(pair)

    const landing = { mainPos: positions.main, subPos: positions.sub, valid: true }
    const field = this.gameField.getField()
    if (!canApplyPairPlacement(field.grid, landing)) {
      this.restoreTurnStart('配置できませんでした。もう一度お試しください')
      return
    }
    try {
      const trace = resolveChainsWithTrace(applyPairPlacement(field.grid, pair, landing), {}, String(++this.chainRun))
      const run = this.chainRun
      this.pendingPlacement = { pair: placedPair, mainPos: { ...positions.main }, subPos: { ...positions.sub } }
      this.hideFieldForChain()
      this.chainRenderer = new PuyoBoardRenderer(this, this.FIELD_X, this.FIELD_Y, trace, field.grid)
      this.chainPlayback = new ChainPlayback(trace, {
        frame: frame => this.chainRenderer?.frame(frame),
        complete: () => this.commitChain(run, trace.result),
      })
      if (this.isPaused) this.chainPlayback.pause('user')
      if (document.hidden) this.chainPlayback.pause('hidden')
    } catch (error) {
      console.error('連鎖アニメーションを開始できませんでした', error)
      this.restoreTurnStart('連鎖を表示できませんでした。もう一度お試しください')
    }
  }

  private commitChain(run: number, result: ReturnType<typeof resolveChainsWithTrace>['result']) {
    if (run !== this.chainRun || !this.pendingPlacement || this.isDisposed) return
    const terminal = isSpawnBlocked(result.stableGrid)
    const nextPair = terminal ? undefined : this.createPracticePair((this.turnHistory[this.turnHistory.length - 1]?.turn ?? 0) + 3)
    const { pair, mainPos, subPos } = this.pendingPlacement
    this.pendingPlacement = undefined
    this.chainPlayback = undefined
    this.chainRun++
    const renderer = this.chainRenderer
    this.chainRenderer = undefined
    this.gameField.setField({ ...this.gameField.getField(), grid: result.stableGrid })
    this.gameState.field = this.gameField.getField()
    this.gameState.score += result.clearedPuyos * 10
    this.turnHistory.push({
      turn: (this.turnHistory[this.turnHistory.length - 1]?.turn ?? 0) + 1,
      pair,
      placement: {
        column: mainPos.x,
        rotation: pair.rotation,
        mainPos, subPos,
      },
      chainCount: result.chainCount, clearedPuyos: result.clearedPuyos,
    })
    if (this.turnHistory.length > 100) this.turnHistory.shift()

    this.spawnNextPair(false, nextPair)
    this.lastFallTime = this.time.now
    this.suppressHeldInputUntilRelease()

    try {
      this.suppressHeldInputUntilRelease()
      this.dismissChainNotice()
      renderer?.dispose()
      this.rebuildFieldSprites()
      this.updateDisplay()
      this.updateGuideState()
      this.updateAdvice()
      this.updateGuide()
      if (result.chainCount > 0) this.playScorePopup(
        this.FIELD_X + 3 * this.CELL_SIZE, this.FIELD_Y + 2 * this.CELL_SIZE,
        `${result.chainCount}連鎖! +${result.clearedPuyos * 10}`)
    } catch (error) {
      this.recoverCommittedDisplay(error)
    } finally {
      this.notifyChainEnded()
    }
  }

  private notifyChainEnded() {
    try { window.dispatchEvent(new Event(GTR_CHAIN_RESOLUTION_ENDED_EVENT)) }
    catch (error) { console.error('連鎖終了通知に失敗しました', error) }
  }

  private recoverCommittedDisplay(error: unknown) {
    console.error('確定済みの連鎖の表示を復旧できませんでした', error)
    try {
      this.rebuildFieldSprites()
      this.updateDisplay()
      this.updateGuideState()
      this.updateAdvice()
      this.updateGuide()
    } catch (recoveryError) {
      console.error('盤面表示の復旧に失敗しました', recoveryError)
      this.isVisualStopped = true
      try { addUIText(this, this.FIELD_X, this.FIELD_Y - 22, '表示を復旧できません。Escで戻れます。', { ...TEXT_STYLES.subtitle, color: '#ff9aa5', wordWrap: { width: LAYOUT_GUIDED.CANVAS_WIDTH - this.FIELD_X - 24, useAdvancedWrap: true } }) }
      catch { /* The scene is no longer drawable. */ }
    }
  }

  private showChainNotice() {
    if (this.chainNotice) return
    this.chainNotice = addUIText(this, this.FIELD_X, this.FIELD_Y - 22,
      '連鎖中は設定・評価を変更できません。終了後に操作してください。', {
        fontSize: '14px', color: '#ffe99b', fontFamily: TEXT_STYLES.title.fontFamily,
        wordWrap: { width: LAYOUT_GUIDED.CANVAS_WIDTH - this.FIELD_X - 24, useAdvancedWrap: true },
      }).setDepth(200)
  }

  private dismissChainNotice() {
    this.chainNotice?.destroy()
    this.chainNotice = undefined
  }

  private hideFieldForChain() {
    this.clearGhostSprites()
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
    const wasResolving = Boolean(this.chainPlayback || this.pendingPlacement)
    this.chainRun++
    this.chainPlayback?.cancel()
    this.chainPlayback = undefined
    this.chainRenderer?.dispose()
    this.chainRenderer = undefined
    this.pendingPlacement = undefined
    this.dismissChainNotice()
    if (wasResolving) this.notifyChainEnded()
  }

  private cancelPendingTurn() {
    this.cancelChain()
    this.restoreTurnStart()
  }

  private restoreTurnStart(message?: string) {
    this.cancelChain()
    if (this.turnStartSnapshot) {
      const state = cloneGameHistoryState(this.turnStartSnapshot)
      this.gameField.setField(state.field)
      this.gameState = { ...this.gameState, ...state, field: this.gameField.getField(), gameOver: false }
      if (state.pairRandomState !== undefined) this.pairRandom.setState(state.pairRandomState)
    }
    this.rebuildFieldSprites()
    this.updateDisplay()
    this.updateGuideState()
    this.updateAdvice()
    this.updateGuide()
    this.lastFallTime = this.time.now
    this.suppressHeldInputUntilRelease()
    if (message) addUIText(this, this.FIELD_X, this.FIELD_Y - 20, message, { ...TEXT_STYLES.subtitle, color: '#ff9aa5', wordWrap: { width: LAYOUT_GUIDED.CANVAS_WIDTH - this.FIELD_X - 24, useAdvancedWrap: true } })
  }

  private updateGuideState() {
    const field = this.gameField.getField()
    this.guideManager.updateState(
      field,
      isGuidedTailComplete(field.grid, this.trainingPlan),
    )
  }

  private captureTurnStart(): void {
    this.turnStartSnapshot = cloneGameHistoryState({
      ...this.gameState,
      field: this.gameField.getField(),
      pairRandomState: this.pairRandom.getState(),
    })
  }

  private spawnNextPair(showVisuals = true, suppliedPair?: NonNullable<GameState['currentPair']>) {
    if (this.gameField.isGameOver()) {
      this.gameState.gameOver = true
      this.gameState.field = this.gameField.getField()
      this.gameState.pairRandomState = this.pairRandom.getState()
      this.gameHistory.saveState(this.gameState)
      return
    }

    this.gameState.currentPair = this.gameState.nextPair
    this.gameState.nextPair = this.gameState.nextNextPair
    this.gameState.nextNextPair = suppliedPair ?? this.createPracticePair((this.turnHistory[this.turnHistory.length - 1]?.turn ?? 0) + 2)
    this.gameState.pairRandomState = this.pairRandom.getState()

    // 新ペア生成後に状態を保存: currentPairがトップ位置の新ペアになってから保存することで
    // 巻き戻し時に「着地済みペアが再着地して連鎖発火」するバグを防ぐ
    this.gameState.field = this.gameField.getField()
    this.gameHistory.saveState(this.gameState)
    this.captureTurnStart()

    if (showVisuals) this.updateAdvice()
  }

  private evaluateGTR() {
    const field = this.gameField.getField()
    const gtrResult = GTRDetector.detectGTR(field.grid)
    this.showDetailedResult(gtrResult)
  }

  private showDetailedResult(result: GTRScore) {
    this.cleanupResult()
    this.isPaused = true
    this.isShowingResult = true
    this.suppressHeldInputUntilRelease()

    const canvasW = LAYOUT_GUIDED.CANVAS_WIDTH
    const canvasH = LAYOUT_GUIDED.CANVAS_HEIGHT

    const overlay = this.add.rectangle(canvasW / 2, canvasH / 2, canvasW, canvasH, 0x000000, 0.9)
    overlay.setDepth(1000)
    this.resultOverlay = overlay

    const container = this.add.container(canvasW / 2, 0)
    container.setDepth(1001)
    this.resultContainer = container

    // スコア
    const score = addResultText(this, 0, Math.round(canvasH * 0.09), `SCORE: ${result.totalScore}点`, {
      fontSize: '48px',
      color: '#ffe99b',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5, 0)
    container.add(score)
    const previewTop = Math.round(canvasH * 0.325)
    const previewX = -Math.round(canvasW / 4)

    // GTRフィールド表示
    const grid = this.gameField.getField().grid
    const preview = createGTRChainPreview(grid)
    const renderPreview = this.displayGTRField(container, previewX, previewTop)
    renderPreview?.({ grid: preview.initialGrid, fading: [], alpha: 1,
      chainIndex: null, starterPosition: preview.starter, phase: 'initial' })

    // チェック項目（成功・失敗の両方を表示）
    const checks: { label: string; checked: boolean }[] = [
      { label: '基本形', checked: result.hasBasicPattern },
      { label: '3連鎖', checked: result.chainCount >= 3 },
      { label: '4連鎖', checked: result.chainCount >= 4 },
      { label: '5連鎖', checked: result.chainCount >= 5 },
      { label: '最小土台が完成', checked: result.minimalFoundationComplete === true },
      { label: '余りなし・1個・同色連結', checked: result.chainCount > 0 && (result.leftoverPuyos <= 1 || result.leftoverConnected) }
    ]

    let yOffset = previewTop
    const xOffset = 60
    checks.forEach(check => {
      const icon = check.checked ? '○' : '×'
      const color = check.checked ? '#91ecc2' : '#ff9aa5'
      const text = addResultText(this, xOffset, yOffset, `${icon} ${check.label}`, {
        fontSize: '24px',
        color: color,
        fontFamily: TEXT_STYLES.title.fontFamily,
        wordWrap: { width: 330, useAdvancedWrap: true },
      })
      container.add(text)
      yOffset += (text.height || 28) + 16
    })

    const playbackStatus = addResultText(this, previewX, previewTop + 4 * 48 + 24,
      preview.unavailableReason ?? '仮発火：再生待ち', {
        fontSize: '24px', color: '#d7c8ff', fontFamily: TEXT_STYLES.title.fontFamily,
      wordWrap: { width: 330, useAdvancedWrap: true },
      }).setOrigin(0.5, 0)
    container.add(playbackStatus)
    const replayTop = playbackStatus.y + (playbackStatus.height || 28) + 16
    if (preview.trace) {
      this.resultPlayback = new ResultChainPlayback(preview.trace, {
        frame: frame => {
          renderPreview?.(frame)
          playbackStatus.setText?.(frame.phase === 'complete'
            ? `仮発火：${preview.trace!.result.chainCount}連鎖 終了`
            : frame.chainIndex === null ? '仮発火：再生待ち'
              : `仮発火：${frame.chainIndex}連鎖目`)
        },
      }, preview.trace.initial.ids[preview.starter!.y][preview.starter!.x] ?? undefined)
      const replayButton = addResultText(this, previewX, replayTop, 'もう一度', {
        fontSize: '24px', color: '#e8dcff', backgroundColor: '#40366f',
        padding: { x: 12, y: 12 }, fontFamily: TEXT_STYLES.title.fontFamily,
      }).setOrigin(0.5, 0)
      replayButton.setInteractive?.({ useHandCursor: true })
      replayButton.on?.('pointerdown', () => {
        if (this.isShowingResult && !this.isDisposed && !document.hidden && !this.isReportPanelOpen && !this.isReplayInspection && !this.actionInput?.isGated()) this.resultPlayback?.replay()
      })
      container.add(replayButton)
    }

    const scopeNote = addResultText(this, 0, canvasH - 176, '評価範囲内のぷよだけを採点します。', {
      fontSize: '16px', color: '#c4bfd3', fontFamily: TEXT_STYLES.title.fontFamily,
      wordWrap: { width: canvasW - 80, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5, 0)
    container.add(scopeNote)

    // 操作説明
    const instruction = addResultText(this, 0, canvasH - 112, 'Space 新しいゲーム\nEsc ホーム', {
      fontSize: '24px',
      color: '#c4bfd3',
      fontFamily: TEXT_STYLES.title.fontFamily,
      align: 'center', wordWrap: { width: canvasW - 80, useAdvancedWrap: true },
    }).setOrigin(0.5, 0)
    container.add(instruction)


  }

  private displayGTRField(
    container: Phaser.GameObjects.Container, offsetX: number, offsetY: number,
  ): (frame: ResultChainFrame) => void {
    const cellSize = 48

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

    const activeLayer = this.add.container(0, 0)
    container.add(activeLayer)

    const label = addResultText(this, offsetX, offsetY - 36, 'GTR評価範囲', {
      fontSize: '24px',
      color: '#c4bfd3',
      fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5)
    container.add(label)

    return frame => {
      activeLayer.removeAll(true)
      const fading = new Set(frame.fading.map(({ x, y }) => `${x},${y}`))
      const starter = frame.starterPosition
      for (let y = minRow; y <= maxRow; y++) for (let x = 0; x < 6; x++) {
        if (!isInGTREvaluationRange(x, y) && !(starter?.x === x && starter.y === y)) continue
        const color = frame.grid[y]?.[x]
        if (!color) continue
        const px = offsetX + (x - 3) * cellSize + cellSize / 2
        const py = offsetY + (y - minRow) * cellSize + cellSize / 2
        const sprite = this.add.sprite(px, py, PuyoRenderer.textureKey, PuyoRenderer.frame(color, 'mini12'))
        sprite.setDisplaySize(cellSize - 2, cellSize - 2)
        if (fading.has(`${x},${y}`)) sprite.setAlpha(frame.alpha)
        activeLayer.add(sprite)
      }
      if (starter && frame.grid[starter.y]?.[starter.x]) {
        const px = offsetX + (starter.x - 3) * cellSize + cellSize / 2
        const py = offsetY + (starter.y - minRow) * cellSize + cellSize / 2
        const marker = this.add.rectangle(px, py, cellSize - 1, cellSize - 1)
        marker.setFillStyle(0, 0)
        marker.setStrokeStyle(2, 0xffdd66)
        activeLayer.add(marker)
      }
    }
  }

  private cleanupResult(): void {
    this.resultGeneration++
    this.resultPlayback?.cancel()
    this.resultPlayback = undefined
    this.resultOverlay?.destroy()
    this.resultOverlay = undefined
    this.resultContainer?.destroy(true)
    this.resultContainer = undefined
  }

  private resetGame() {
    this.cleanupResult()
    this.cancelChain()
    this.isVisualStopped = false
    this.gameField.clear()
    this.clearGhostSprites()
    this.clearAllSprites()
    this.practiceSequence = undefined
    this.gameState = this.createInitialGameState()
    this.captureTurnStart()
    this.gameHistory.clear()
    this.guideManager.reset()
    this.currentAdvice = null
    this.manualCompletionShape = null
    this.turnHistory = []
    clearGTRReplayHash()
    this.lastFallTime = this.time.now
    this.suppressHeldInputUntilRelease()
  }

  private startGame() {
    const restorePause = this.isPaused
    const restoreResult = this.isShowingResult
    this.isPaused = false
    this.isShowingResult = false
    this.lastFallTime = this.time.now
    this.guideManager.initialize(this.openingPairs.pair1, this.openingPairs.pair2, this.trainingPlan)
    this.updateGuideState()

    // 初期状態を保存（1手目を巻き戻せるようにするため）
    this.gameState.field = this.gameField.getField()
    if (this.replayPreviousState) {
      this.gameHistory.saveState({ ...this.replayPreviousState, gameOver: false })
      this.replayPreviousState = undefined
    }
    this.gameHistory.saveState(this.gameState)
    this.captureTurnStart()

    this.updateAdvice()
    this.updateGuide()
    this.updateDisplay()
    if (restoreResult && !this.gameState.gameOver) {
      const field = this.gameField.getField()
      this.showDetailedResult(GTRDetector.detectGTR(field.grid))
    } else if (restorePause) {
      this.togglePause()
    }
  }

  private drawField() {
    const fieldW = FIELD_CONFIG.COLS * this.CELL_SIZE
    const fieldH = FIELD_CONFIG.ROWS * this.CELL_SIZE

    this.add.rectangle(this.FIELD_X + fieldW / 2 + 7, this.FIELD_Y + fieldH / 2 + 9, fieldW + 12, fieldH + 12, 0x05040a, 0.45)

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

    drawEvaluationRange(this, this.FIELD_X, this.FIELD_Y, this.CELL_SIZE)

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
  }

  private updateGuide() {
    if (!this.guideDisplay) return

    this.guideDisplay.removeAll(true)

    const guideW = LAYOUT_GUIDED.GUIDE_WIDTH
    const guideH = LAYOUT_GUIDED.CANVAS_HEIGHT - this.GUIDE_Y - 16
    const bg = this.add.rectangle(0, guideH / 2, guideW, guideH, 0x211d33, 0.96)
    this.guideDisplay.add(bg)

    const border = this.add.rectangle(0, guideH / 2, guideW, guideH)
    border.setStrokeStyle(2, 0x6f648d)
    border.setFillStyle()
    this.guideDisplay.add(border)

    this.drawCompletionExample()
  }

  private canBrowseCompletionExample(): boolean {
    return !this.isDisposed && !this.isVisualStopped && !this.isReportPanelOpen && !this.isShowingResult &&
      !this.gameState.gameOver &&
      !this.isReplayInspection && !this.isInspectionFrozen
  }

  private selectCompletionExample(shape: TailShape | null): void {
    if (!this.canBrowseCompletionExample()) return
    this.manualCompletionShape = shape
    this.updateGuide()
  }

  private drawCompletionExample(top = 16): void {
    const advisedShape = this.isAdvisorEnabled
      ? this.currentAdvice?.bestPlacement?.tailShape : undefined
    const shape = getDisplayedCompletionShape(this.manualCompletionShape, advisedShape)
    const isCurrentAdvice = this.manualCompletionShape === null && advisedShape === shape
    const field = this.gameField.getField()
    const colors = getCompletionColors(field, this.trainingPlan,
      isCurrentAdvice ? this.currentAdvice?.bestPlacement?.tailColor : undefined)
    const exampleTitle = addUIText(this, -165, top, '完成例', {
      fontSize: '16px', color: '#f3c94f', fontFamily: TEXT_STYLES.title.fontFamily,
    })
    this.guideDisplay?.add(exampleTitle)

    const cellSize = 36
    const cardHeight = 160
    const cardGap = 8
    const tabsY = top + 28 + 22
    for (const [index, tabShape] of COMPLETION_SHAPES.entries()) {
      const selected = shape === tabShape
      const x = -112 + index * 112
      const tab = this.add.rectangle(x, tabsY, 104, 44, selected ? 0x4b3e76 : 0x302a46)
      tab.setStrokeStyle(1, selected ? 0xb5a8ff : 0x51496b)
      tab.setInteractive({ useHandCursor: true })
      tab.on('pointerdown', () => this.selectCompletionExample(tabShape))
      this.guideDisplay?.add(tab)
      this.guideDisplay?.add(addUIText(this, x, tabsY, GTR_COMPLETION_EXAMPLES[tabShape].label, {
        fontSize: '14px', color: selected ? '#f6f2ff' : '#b7aecb', fontFamily: TEXT_STYLES.title.fontFamily,
      }).setOrigin(0.5))
    }
    const grids = getCompletionExampleGrids(shape, colors)
    const cardsTop = tabsY + 22 + 8
    for (const [index, grid] of grids.entries()) {
      const cardTop = cardsTop + index * (cardHeight + cardGap)
      const card = this.add.rectangle(0, cardTop + cardHeight / 2, 330, cardHeight, 0x302a46)
      card.setStrokeStyle(1, 0x51496b)
      this.guideDisplay?.add(card)
      this.guideDisplay?.add(addUIText(this, -145, cardTop + cardHeight / 2, String(index + 1), {
        fontSize: '14px', color: '#b7aecb', fontFamily: TEXT_STYLES.title.fontFamily,
      }).setOrigin(0.5))

      const diagramTop = cardTop + 8
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
        const px = (x - 2.5) * cellSize
        const py = diagramTop + (y + 0.5) * cellSize
        const bg = this.add.rectangle(px, py, cellSize - 1, cellSize - 1, 0x10101d)
        bg.setStrokeStyle(1, 0x38334f)
        this.guideDisplay?.add(bg)
        const color = grid[y][x]
        if (color) {
          const mask = cellMask(grid, x, y)
          const frame = `connect/${mask}`
          const sprite = this.add.sprite(px, py, PuyoRenderer.textureKey, PuyoRenderer.frame(color, frame))
          sprite.setDisplaySize(cellSize, cellSize)
          this.guideDisplay?.add(sprite)
        }
      }
    }

    const autoY = cardsTop + grids.length * (cardHeight + cardGap) - cardGap + 12 + 22
    const auto = this.add.rectangle(0, autoY, 160, 44,
      this.manualCompletionShape === null ? 0x4b3e76 : 0x302a46)
    auto.setStrokeStyle(1, this.manualCompletionShape === null ? 0xb5a8ff : 0x51496b)
    auto.setInteractive({ useHandCursor: true })
    auto.on('pointerdown', () => this.selectCompletionExample(null))
    this.guideDisplay?.add(auto)
    this.guideDisplay?.add(addUIText(this, 0, autoY, 'ガイドに合わせる', {
      fontSize: '14px', color: '#f6f2ff', fontFamily: TEXT_STYLES.title.fontFamily,
    }).setOrigin(0.5))
  }

  private initializeSprites() {
    this.fieldSprites = Array(FIELD_CONFIG.ROWS).fill(null).map(() => Array(FIELD_CONFIG.COLS).fill(null))
  }

  private updateDisplay() {
    if (this.chainPlayback) return
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

  private updateNextPairSprites() {
    this.clearNextSprites()
    const layout = this.getNextAreaLayout()
    if (this.gameState.nextPair) this.nextPairSprites = createNextPairSprites(this, this.gameState.nextPair, layout.next)
    if (this.gameState.nextNextPair) this.nextNextPairSprites = createNextPairSprites(this, this.gameState.nextNextPair, layout.nextNext)
  }

  private getNextAreaLayout() {
    return getNextPreviewLayout(this.FIELD_X + FIELD_CONFIG.COLS * this.CELL_SIZE + 20, this.FIELD_Y)
  }

  private createNextAreas() {
    const layout = this.getNextAreaLayout()
    drawNextPreview(this, layout)
    this.add.rectangle(
      layout.baseX + layout.width / 2,
      layout.statusY + 32,
      layout.width,
      64,
      0x191628,
      0.92,
    ).setStrokeStyle(1, 0x3f3955)
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

  private createSettingToggle(action: 'gravity' | 'guide', x: number, top: number, label: string, color: string) {
    const button = this.add.rectangle(x, top + 22, NEXT_AREA_CONFIG.AREA_WIDTH, 44, NEXT_AREA_CONFIG.BG_COLOR)
      .setStrokeStyle(1, NEXT_AREA_CONFIG.BORDER_COLOR).setDepth(100)
      .setInteractive({ useHandCursor: true })
    button.on('pointerdown', () => {
      if (!this.canAcceptAction(action) || this.actionInput?.isGated()) return
      this.game.canvas.focus({ preventScroll: true })
      const source = `pointer:setting:${action}`
      this.pressAction(action, source)
      this.releaseAction(source)
    })
    return addUIText(this, x, top + 22, label, { fontSize: '16px', color })
      .setOrigin(0.5).setDepth(101)
  }

  private toggleGravity() {
    this.isGravityEnabled = !this.isGravityEnabled

    if (this.gravityStatusText) {
      if (this.isGravityEnabled) {
        this.gravityStatusText.setText('自由落下 ON')
        this.gravityStatusText.setColor('#66e0aa')
      } else {
        this.gravityStatusText.setText('自由落下 OFF')
        this.gravityStatusText.setColor('#f47582')
      }
    }

    if (this.isGravityEnabled) {
      this.lastFallTime = this.time.now
    }
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

  // --- アドバイザー機能 ---

  private toggleAdvisor() {
    this.isAdvisorEnabled = !this.isAdvisorEnabled

    if (this.advisorStatusText) {
      if (this.isAdvisorEnabled) {
        this.advisorStatusText.setText('ガイド ON')
        this.advisorStatusText.setColor('#b5a8ff')
      } else {
        this.advisorStatusText.setText('ガイド OFF')
        this.advisorStatusText.setColor('#f47582')
      }
    }
    this.updateAdvice()
    this.updateGuide()
  }

  private updateAdvice() {
    if (!this.isAdvisorEnabled || !this.gameState.currentPair) {
      this.currentAdvice = null
      this.guideManager.setSuggestedTailPlan(undefined, undefined)
      this.clearGhostSprites()
      return
    }

    const field = this.gameField.getField()
    this.currentAdvice = ContinuousAdvisor.getAdvice(
      field,
      this.gameState.currentPair,
      this.gameState.nextPair ?? undefined,
      this.gameState.nextNextPair ?? undefined,
      this.trainingPlan,
    )
    this.guideManager.setSuggestedTailPlan(
      this.currentAdvice.bestPlacement?.tailShape,
      this.currentAdvice.bestPlacement?.tailColor,
      field,
    )
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
    this.ghostSprites.main = this.add.sprite(mainX, mainY, PuyoRenderer.textureKey, PuyoRenderer.frame(pair.main.color, 'idle'))
    this.ghostSprites.main.setDisplaySize(this.CELL_SIZE, this.CELL_SIZE)
    this.ghostSprites.main.setAlpha(0.4)
    this.ghostSprites.main.setDepth(5)

    // subゴースト
    const subX = this.FIELD_X + landing.subPos.x * this.CELL_SIZE + this.CELL_SIZE / 2
    const subY = this.FIELD_Y + landing.subPos.y * this.CELL_SIZE + this.CELL_SIZE / 2
    this.ghostSprites.sub = this.add.sprite(subX, subY, PuyoRenderer.textureKey, PuyoRenderer.frame(pair.sub.color, 'idle'))
    this.ghostSprites.sub.setDisplaySize(this.CELL_SIZE, this.CELL_SIZE)
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
    this.cleanupResult()
    this.cancelChain()
    const onExit = this.game.registry.get('onExit')
    if (onExit && typeof onExit === 'function') {
      onExit()
    }
  }
}
