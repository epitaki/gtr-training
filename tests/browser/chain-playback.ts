import * as Phaser from 'phaser'
import PuyoGame from '../../src/game/scenes/PuyoGame'
import GuidedPracticeScene from '../../src/game/scenes/GuidedPracticeScene'
import { GameFieldManager } from '../../src/game/core/GameField'
import { GameHistory } from '../../src/game/core/GameHistory'
import { PuyoPairManager, PuyoPairRandom } from '../../src/game/core/PuyoPair'
import { applyPairPlacement, canApplyPairPlacement, resolveChains, simulateLanding } from '../../src/game/core/ChainSimulator'
import { PuyoColor, type GameState, type PuyoPair } from '../../src/game/core/types'
import { LAYOUT_GUIDED, LAYOUT_SCORE_ATTACK } from '../../src/game/rendering/VisualConfig'
import type { ChainPlayback } from '../../src/game/rendering/ChainPlayback'
import fixtureJson from '../../docs/research/animation-five-chain-fixture.json'
import type { GTRReplayState } from '../../src/game/feedback/GTRIssueReport'
import headFixture from '../../docs/research/head-construction-feedback-20260926.json'

// Test-only access to existing scene setup and observations. No production entry imports this file.
interface ScoreInspection {
  gameField: GameFieldManager
  gameState: GameState
  chainPlayback?: ChainPlayback
  chainRenderer?: unknown
  isGravityEnabled: boolean
  isPaused: boolean
  toggleGravity(): void
  resetGame(): void
  captureTurnStartPair(): void
  rebuildFieldSprites(): void
  updateDisplay(): void
}
interface GuideInspection extends Omit<ScoreInspection, 'captureTurnStartPair'> {
  gameHistory: GameHistory
  turnHistory: unknown[]
  pairRandom: PuyoPairRandom
  trainingPlan: GTRReplayState['trainingPlan']
  openingPairs: GTRReplayState['openingPairs']
  isAdvisorEnabled: boolean
  toggleAdvisor(): void
  startGame(): void
}
const isGuideMode = new URLSearchParams(location.search).get('mode') === 'guide'
type VerificationScene = ScoreVerificationScene | GuideVerificationScene

const required = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing test control: ${id}`)
  return element
}
const status = required('status')
const snapshot = required('snapshot')
required('mode').textContent = isGuideMode ? 'ガイド付きGTR練習' : 'スコアアタック'
const five = fixtureJson as GTRReplayState
type FixtureKind = 'one' | 'five' | 'core' | 'three' | 'head'
const testFixture = (kind: FixtureKind): GTRReplayState => {
  const result = structuredClone(five)
  result.sourceSettings.gravityEnabled = false
  if (kind === 'one') {
    result.field.grid = result.field.grid.map(row => row.map(() => null))
    for (let x = 0; x < 3; x++) result.field.grid[12][x] = PuyoColor.RED
    result.currentPair!.main = { color: PuyoColor.RED, x: 0, y: 1 }
    result.currentPair!.sub = { color: PuyoColor.BLUE, x: 0, y: 0 }
  }
  if (kind === 'core' || kind === 'three' || kind === 'head') {
    const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
    const rows = kind === 'core' ? ['RG....', 'RRG...', 'GGY...']
      : kind === 'three' ? ['RGY...', 'RRG...', 'GGYYY.'] : headFixture.horizontalRows
    result.field.grid = [...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
      ...rows.map(row => [...row].map(c => c === '.' ? null : colors['RGBY'.indexOf(c)]))]
    result.currentPair!.main = { color: PuyoColor.BLUE, x: 2, y: 1 }
    result.currentPair!.sub = { color: PuyoColor.YELLOW, x: 2, y: 0 }
  }
  return result
}
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)
let activeScene: VerificationScene | undefined
let loadedKind: FixtureKind = 'five'
let expected: ReturnType<typeof resolveChains>
let loadedPair: PuyoPair
let loadedNext: PuyoPair
let loadedNextNext: PuyoPair
let expectedGeneratedNext: PuyoPair
let expectedRandomState: number
let loadedRandomState: number
let loadedHistoryLength = 0
let inFlight = false
let observedPlayback = false
let completed = 0
let checking = false
let remaining = 0
let settleUntil = 0
let startedAt = 0
let finishedAt = 0
let lastRenderAt = 0
let frames: number[] = []
let idleCounts: Partial<Record<FixtureKind, number>> = {}
const failures: string[] = []
const events: string[] = []
const recordFailure = (message: string): void => {
  if (!failures.includes(message)) failures.push(message)
  checking = false
}
const describeObjects = (scene: Phaser.Scene) => {
  const objects = scene.children.getAll()
  return { total: objects.length, chainObjects: objects.filter(object => {
    const depth = (object as Phaser.GameObjects.GameObject & { depth?: number }).depth
    return depth === 20 || depth === 21 || depth === 200
  }).length }
}
const viewState = (scene: VerificationScene) => {
  const inspection = scene as unknown as ScoreInspection
  const guide = scene as unknown as GuideInspection
  return { mode: isGuideMode ? 'guide' : 'score', grid: inspection.gameField.getField().grid, current: inspection.gameState.currentPair,
    next: inspection.gameState.nextPair, nextNext: inspection.gameState.nextNextPair,
    score: inspection.gameState.score, gtrCount: inspection.gameState.gtrCount,
    gtrScore: inspection.gameState.gtrScore, playing: Boolean(inspection.chainPlayback),
    paused: inspection.isPaused, rendererPresent: Boolean(inspection.chainRenderer),
    display: describeObjects(scene), visibility: document.visibilityState,
    ...(isGuideMode ? { historyLength: guide.gameHistory.getHistoryLength(), turns: guide.turnHistory.length,
      randomState: guide.pairRandom.getState(), advisorEnabled: guide.isAdvisorEnabled } : {}),
    evaluationTexts: scene.children.getAll().flatMap(object => object instanceof Phaser.GameObjects.Text && object.depth === 1001 ? [object.text] : []) }
}
const renderStatus = (): void => {
  const sorted = [...frames].sort((a, b) => a - b)
  status.textContent = JSON.stringify({ mode: isGuideMode ? 'guide' : 'score', completed, checking, remaining,
    elapsedSeconds: startedAt ? Math.round(((finishedAt || performance.now()) - startedAt) / 1000) : 0,
    frameSamples: frames.length, frameMedianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
    frameP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
    idleCounts, failures, events: events.slice(-12) }, null, 2)
  if (activeScene) snapshot.textContent = JSON.stringify(viewState(activeScene), null, 2)
}
const setFixture = (kind: FixtureKind): void => {
  if (!activeScene || inFlight) return
  const inspection = activeScene as unknown as ScoreInspection
  if (inspection.isPaused) {
    recordFailure('停止状態の解除後に局面をセットしてください')
    return
  }
  inspection.resetGame()
  const source = testFixture(kind)
  inspection.gameField.setField(source.field)
  inspection.gameState = { field: inspection.gameField.getField(), currentPair: source.currentPair,
    nextPair: source.nextPair, nextNextPair: source.nextNextPair,
    score: source.score, gtrCount: source.gtrCount, gtrScore: source.gtrScore, gameOver: false }
  if (inspection.isGravityEnabled) inspection.toggleGravity()
  if (isGuideMode) {
    const guide = activeScene as unknown as GuideInspection
    guide.trainingPlan = structuredClone(source.trainingPlan)
    guide.openingPairs = structuredClone(source.openingPairs)
    guide.pairRandom.setState(source.pairRandomState)
    guide.gameState.pairRandomState = source.pairRandomState
    if (guide.isAdvisorEnabled !== source.sourceSettings.advisorEnabled) guide.toggleAdvisor()
    guide.startGame()
    loadedRandomState = guide.pairRandom.getState()
    loadedHistoryLength = guide.gameHistory.getHistoryLength()
    const random = new PuyoPairRandom()
    random.setState(loadedRandomState)
    expectedGeneratedNext = PuyoPairManager.createRandomPair(random.next)
    expectedRandomState = random.getState()
  } else {
    inspection.captureTurnStartPair()
    inspection.rebuildFieldSprites()
    inspection.updateDisplay()
  }
  loadedKind = kind
  loadedPair = structuredClone(source.currentPair!)
  loadedNext = structuredClone(source.nextPair!)
  loadedNextNext = structuredClone(source.nextNextPair!)
  const landing = simulateLanding(source.field.grid, loadedPair,
    { column: loadedPair.main.x, rotation: loadedPair.rotation })
  if (!canApplyPairPlacement(source.field.grid, landing)) throw new Error('Invalid test fixture')
  expected = resolveChains(applyPairPlacement(source.field.grid, loadedPair, landing))
  events.push(`セット: ${kind} / 期待${expected.chainCount}連鎖${expected.clearedPuyos}消去`)
  renderStatus()
}
const drop = (): void => {
  if (!activeScene || inFlight) return
  observedPlayback = false
  inFlight = true
  activeScene.pressAction('quickDrop', 'browser-test:drop')
  activeScene.releaseAction('browser-test:drop')
}
class ScoreVerificationScene extends PuyoGame {
  create(): void {
    super.create()
    activeScene = this
    setFixture('five')
  }
  update(time: number, delta: number): void {
    super.update(time, delta)
    observeFrame(this, delta)
  }
}
class GuideVerificationScene extends GuidedPracticeScene {
  create(): void {
    super.create()
    activeScene = this
    setFixture('five')
  }
  update(time: number, delta: number): void {
    super.update(time, delta)
    observeFrame(this, delta)
  }
}
function observeFrame(scene: VerificationScene, delta: number): void {
    const inspection = scene as unknown as ScoreInspection
    const guide = scene as unknown as GuideInspection
    if (checking && delta > 0) frames.push(delta)
    if (inFlight && inspection.chainPlayback) {
      observedPlayback = true
      if (inspection.gameState.score !== 0) recordFailure('連鎖途中に得点が確定した')
      if (!same(inspection.gameState.nextPair, loadedNext)
        || !same(inspection.gameState.nextNextPair, loadedNextNext)) recordFailure('連鎖途中にNEXTが進んだ')
      if (isGuideMode && (guide.turnHistory.length !== 0 || guide.gameHistory.getHistoryLength() !== loadedHistoryLength
        || guide.pairRandom.getState() !== loadedRandomState)) recordFailure('連鎖途中に履歴または乱数が進んだ')
    }
    if (inFlight && observedPlayback && !inspection.chainPlayback) {
      inFlight = false
      completed++
      if (!same(inspection.gameField.getField().grid, expected.stableGrid)) recordFailure('最終盤面が共通物理と不一致')
      if (inspection.gameState.score !== expected.clearedPuyos * 10) recordFailure('確定得点が不一致')
      if (!same(inspection.gameState.currentPair, loadedNext)
        || !same(inspection.gameState.nextPair, loadedNextNext)) recordFailure('終了後のツモ進行が不一致')
      if (isGuideMode && (guide.turnHistory.length !== 1 || guide.gameHistory.getHistoryLength() !== loadedHistoryLength + 1
        || guide.pairRandom.getState() !== expectedRandomState
        || !same(guide.gameState.nextNextPair, expectedGeneratedNext))) recordFailure('ガイドの確定履歴・乱数・新NEXT2が不一致')
      if (inspection.chainRenderer || describeObjects(scene).chainObjects > 0) recordFailure('連鎖描画が終了後に残った')
      events.push(`完了: ${loadedKind} / ${expected.chainCount}連鎖 / ${inspection.gameState.score}点`)
      settleUntil = performance.now() + 1100 // Observe the real 800ms score popup's disposal.
    }
    if (checking && !inFlight && settleUntil && performance.now() >= settleUntil) {
      settleUntil = 0
      const count = describeObjects(scene).total
      if (idleCounts[loadedKind] === undefined) idleCounts[loadedKind] = count
      else if (idleCounts[loadedKind] !== count) recordFailure(`${loadedKind}: 安定時描画数が増減した`)
      if (--remaining <= 0) {
        checking = false
        finishedAt = performance.now()
        events.push('120回の実フレーム検査完了')
      } else if (checking) {
        setFixture(remaining % 2 ? 'one' : 'five')
        drop()
      }
    }
    if (performance.now() - lastRenderAt >= 250) {
      lastRenderAt = performance.now()
      renderStatus()
    }
}
const layout = isGuideMode ? LAYOUT_GUIDED : LAYOUT_SCORE_ATTACK
const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game',
  width: layout.CANVAS_WIDTH, height: layout.CANVAS_HEIGHT,
  backgroundColor: '#12121a', scene: [isGuideMode ? GuideVerificationScene : ScoreVerificationScene],
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } } })
required('five').onclick = () => { checking = false; setFixture('five') }
required('one').onclick = () => { checking = false; setFixture('one') }
for (const kind of ['core', 'three', 'head'] as const) required(kind).onclick = () => { checking = false; setFixture(kind) }
required('evaluate').onclick = () => {
  activeScene?.pressAction('evaluate', 'browser-test:evaluate')
  activeScene?.releaseAction('browser-test:evaluate')
}
required('drop').onclick = drop
required('pause').onclick = () => {
  activeScene?.pressAction('pause', 'browser-test:pause')
  activeScene?.releaseAction('browser-test:pause')
}
required('repeat').onclick = () => {
  if (inFlight || !activeScene || (activeScene as unknown as ScoreInspection).isPaused) return
  completed = 0; failures.length = 0; frames = []; idleCounts = {}
  startedAt = performance.now(); finishedAt = 0; remaining = 120; checking = true; settleUntil = 0
  setFixture('five'); drop()
}
required('stop').onclick = () => { checking = false; remaining = 0; renderStatus() }
required('dispose').onclick = () => {
  checking = false
  const scene = activeScene
  if (scene) {
    scene.scene.stop()
    requestAnimationFrame(() => {
      events.push(`破棄後: ${scene.children.getAll().length}描画`)
      renderStatus()
    })
  }
  activeScene = undefined
  renderStatus()
}
document.addEventListener('visibilitychange', () => {
  events.push(`実表示状態: ${document.visibilityState}`)
  renderStatus()
})
window.addEventListener('pagehide', () => game.destroy(true), { once: true })
