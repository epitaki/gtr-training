import { describe, expect, it } from 'vitest'
import { GTRDetector } from '../gtr/GTRPatterns'
import { GameHistory } from '../core/GameHistory'
import {
  GTR_REPORT_STORAGE_KEY,
  createGTRIssueSnapshot,
  createGTRReplayUrl,
  createStoredGTRIssueReport,
  decodeGTRReplayState,
  encodeGTRReplayState,
  formatGTRIssueMarkdown,
  getBrowserGTRReportStorage,
  loadStoredGTRIssueReports,
  readGTRReplayFromHash,
  readGTRReplayResultFromHash,
  saveStoredGTRIssueReport,
  toGTRReplayState,
  tryCreateGTRReplayUrl,
} from './GTRIssueReport'
import { GamePhase, PlacementAdvisor, type PlacementAdvice } from '../advisor/PlacementAdvisor'
import { PuyoColor, type GameField, type PuyoPair } from '../core/types'

const pair = (main: PuyoColor, sub: PuyoColor, rotation = 0): PuyoPair => ({
  main: { color: main, x: 2, y: 1 },
  sub: { color: sub, x: 2, y: 0 },
  rotation,
  falling: true,
})

const field: GameField = {
  width: 6,
  height: 13,
  grid: Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null)),
}
field.grid[12][0] = PuyoColor.YELLOW
field.grid[12][1] = PuyoColor.YELLOW
field.grid[12][2] = PuyoColor.GREEN

const currentPair = pair(PuyoColor.GREEN, PuyoColor.BLUE)
const nextPair = pair(PuyoColor.RED, PuyoColor.YELLOW)
const nextNextPair = pair(PuyoColor.BLUE, PuyoColor.GREEN)
const openingPairs = {
  pair1: pair(PuyoColor.YELLOW, PuyoColor.YELLOW),
  pair2: pair(PuyoColor.GREEN, PuyoColor.BLUE),
}
const trainingPlan = PlacementAdvisor.createTrainingPlan(openingPairs.pair1, openingPairs.pair2)
const previousState = {
  field,
  currentPair: openingPairs.pair2,
  nextPair: currentPair,
  nextNextPair: nextPair,
  score: 80,
  gtrCount: 0,
  gtrScore: 20,
  pairRandomState: 135792468,
}
const advice: PlacementAdvice = {
  phase: GamePhase.CHAIN_TAIL,
  phaseMessage: '連鎖尾を伸ばそう',
  bestPlacement: {
    placement: { column: 2, rotation: 1 },
    landing: { valid: true, mainPos: { x: 2, y: 11 }, subPos: { x: 3, y: 11 } },
    immediateChainCount: 0,
    clearedPuyos: 0,
    isIntendedMainFire: false,
    hasCollateralClear: false,
    intendedMainChainCount: 0,
    intendedMainClearedPuyos: 0,
    totalScore: 123.5,
    phase: GamePhase.CHAIN_TAIL,
    tailShape: 'Y',
    tailColor: PuyoColor.GREEN,
  },
  allPlacements: [],
}
advice.allPlacements = [advice.bestPlacement!]

const createSnapshot = (placementAdvice: PlacementAdvice = advice) => createGTRIssueSnapshot({
  page: 'http://localhost:5173/',
  turnNumber: 4,
  gameState: {
    field,
    currentPair,
    nextPair,
    nextNextPair,
    score: 120,
    gtrCount: 0,
    gtrScore: 30,
    gameOver: false,
    pairRandomState: 246813579,
  },
  openingPairs,
  pairRandomState: 246813579,
  trainingPlan,
  settings: {
    gravityEnabled: true,
    advisorEnabled: true,
    paused: false,
    showingResult: false,
  },
  gtrEvaluation: GTRDetector.detectGTR(field.grid),
  tailPlans: PlacementAdvisor.getTailPlans(field.grid, trainingPlan),
  advice: placementAdvice,
  recentTurns: [{
    turn: 3,
    pair: {
      ...openingPairs.pair2,
      main: { ...openingPairs.pair2.main, y: 11 },
      sub: { ...openingPairs.pair2.sub, y: 10 },
    },
    placement: {
      column: 2,
      rotation: 0,
      mainPos: { x: 2, y: 11 },
      subPos: { x: 2, y: 10 },
    },
    chainCount: 0,
    clearedPuyos: 0,
  }],
  previousState,
})

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('GTRIssueReport', () => {
  it('can share and rewind after resuming a moved and rotated imported current pair', () => {
    const imported = toGTRReplayState(createSnapshot())
    imported.currentPair = {
      main: { color: PuyoColor.BLUE, x: 3, y: 5 },
      sub: { color: PuyoColor.YELLOW, x: 2, y: 5 }, rotation: 3, falling: true,
    }
    const history = new GameHistory()
    history.saveState(decodeGTRReplayState(encodeGTRReplayState(imported)))
    const resumed = toGTRReplayState(createSnapshot())
    history.saveState(resumed)
    resumed.previousState = history.getPreviousState()
    const decoded = decodeGTRReplayState(encodeGTRReplayState(resumed))
    expect(decoded.previousState!.currentPair).toEqual(imported.currentPair)
    expect(history.rewind()).toEqual(decoded.previousState)
  })

  it('still rejects stopped, inconsistent, displaced next, or out-of-bounds rewind pairs', () => {
    for (const modify of [
      (p: PuyoPair) => { p.falling = false },
      (p: PuyoPair) => { p.rotation = 1 },
      (p: PuyoPair) => { p.main.x = 6; p.sub.x = 6 },
    ]) {
      const replay = toGTRReplayState(createSnapshot())
      modify(replay.previousState!.currentPair!)
      expect(() => encodeGTRReplayState(replay)).toThrow('巻き戻し状態が不正')
    }
    const replay = toGTRReplayState(createSnapshot())
    replay.previousState!.nextPair!.main.y++
    replay.previousState!.nextPair!.sub.y++
    expect(() => encodeGTRReplayState(replay)).toThrow('巻き戻し状態が不正')
  })

  it('replays the exact field, queue, opening colors, RNG state, and recent turns', () => {
    const replay = toGTRReplayState(createSnapshot())
    const decoded = decodeGTRReplayState(encodeGTRReplayState(replay))

    expect(decoded).toEqual(replay)
    expect(decoded.field.grid[12]).toEqual([
      PuyoColor.YELLOW,
      PuyoColor.YELLOW,
      PuyoColor.GREEN,
      null,
      null,
      null,
    ])
    expect(decoded.currentPair).toEqual(currentPair)
    expect(decoded.nextPair).toEqual(nextPair)
    expect(decoded.nextNextPair).toEqual(nextNextPair)
    expect(decoded.pairRandomState).toBe(246813579)
    expect(decoded.recentTurns[decoded.recentTurns.length - 1]?.turn).toBe(3)
    expect(decoded.previousState).toEqual(previousState)
    expect(decoded.sourceAnalysis?.appVersion).toBe(createSnapshot().appVersion)
    expect(decoded.sourceAnalysis?.advice?.bestPlacement).toEqual(advice.bestPlacement)
  })

  it('creates a shareable URL that can be read from its hash', () => {
    const url = new URL(createGTRReplayUrl(
      createSnapshot(),
      'https://user:secret@example.test/play?access_token=secret#tracking=123',
    ))
    const replay = readGTRReplayFromHash(url.hash)

    expect(url.pathname).toBe('/play')
    expect(url.username).toBe('')
    expect(url.password).toBe('')
    expect(url.search).toBe('')
    expect(url.hash).not.toContain('tracking')
    expect(replay?.pairRandomState).toBe(246813579)
    expect(replay?.trainingPlan).toEqual(trainingPlan)
  })

  it('rejects a replay whose board dimensions have been tampered with', () => {
    const replay = toGTRReplayState(createSnapshot())
    replay.field.grid.pop()

    expect(() => encodeGTRReplayState(replay)).toThrow('盤面が不正')
  })

  it('rejects impossible or internally inconsistent falling pairs', () => {
    const outside = toGTRReplayState(createSnapshot())
    outside.currentPair!.main.x = 6
    outside.currentPair!.sub.x = 6
    expect(() => encodeGTRReplayState(outside)).toThrow('ツモ情報が不正')

    const inconsistent = toGTRReplayState(createSnapshot())
    inconsistent.currentPair!.sub.x = 3
    expect(() => encodeGTRReplayState(inconsistent)).toThrow('ツモ情報が不正')

    const displacedNext = toGTRReplayState(createSnapshot())
    displacedNext.nextPair!.main.y = 2
    displacedNext.nextPair!.sub.y = 1
    expect(() => encodeGTRReplayState(displacedNext)).toThrow('ツモ情報が不正')

    const stoppedCurrent = toGTRReplayState(createSnapshot())
    stoppedCurrent.currentPair!.falling = false
    expect(() => encodeGTRReplayState(stoppedCurrent)).toThrow('ツモ情報が不正')

    const overlappingCurrent = toGTRReplayState(createSnapshot())
    overlappingCurrent.field.grid[1][2] = PuyoColor.RED
    expect(() => encodeGTRReplayState(overlappingCurrent)).toThrow('盤面と重なっています')
  })

  it('distinguishes an absent replay hash from a broken replay code', () => {
    expect(readGTRReplayResultFromHash('#section=guide')).toEqual({ status: 'absent' })
    expect(readGTRReplayResultFromHash('#gtr-replay=broken')).toMatchObject({
      status: 'invalid',
    })
  })

  it('keeps replay codes created before source analysis was added readable', () => {
    const replay = toGTRReplayState(createSnapshot())
    delete replay.sourceAnalysis
    expect(decodeGTRReplayState(encodeGTRReplayState(replay)).sourceAnalysis).toBeUndefined()
  })

  it.each([true, false, undefined])('round-trips the optional raised-edge assessment (%s)', rightEdgeRaised => {
    const snapshot = createSnapshot()
    snapshot.gtrEvaluation.rightEdgeRaised = rightEdgeRaised
    const replay = toGTRReplayState(snapshot)
    const decoded = decodeGTRReplayState(encodeGTRReplayState(replay))
    expect(decoded.sourceAnalysis?.gtrEvaluation.rightEdgeRaised).toBe(rightEdgeRaised)
    const markdown = formatGTRIssueMarkdown(snapshot,
      { comment: '', expectedColumn: null, expectedRotation: null }, 'https://example.test/replay')
    expect(markdown).toContain(`右上の土台段差: ${rightEdgeRaised ?? '未記録'}`)
  })

  it('records the current scoring definition and reads legacy unversioned analysis', () => {
    const snapshot = createSnapshot()
    expect(snapshot.gtrEvaluation.scoringVersion).toBe('masked-foundation-minimal-v2')
    const markdown = formatGTRIssueMarkdown(snapshot,
      { comment: '', expectedColumn: null, expectedRotation: null }, 'https://example.test/replay')
    expect(markdown).toContain('採点版: masked-foundation-minimal-v2')
    const old = toGTRReplayState(snapshot)
    delete old.sourceAnalysis!.gtrEvaluation.scoringVersion
    delete old.sourceAnalysis!.gtrEvaluation.minimalFoundationComplete
    const decoded = decodeGTRReplayState(encodeGTRReplayState(old))
    expect(decoded.sourceAnalysis?.gtrEvaluation.scoringVersion).toBeUndefined()
    expect(decoded.sourceAnalysis?.gtrEvaluation.minimalFoundationComplete).toBeUndefined()
  })

  it.each(['true', 1, null, []])('rejects nonboolean raised-edge assessment (%j)', value => {
    const replay = toGTRReplayState(createSnapshot())
    replay.sourceAnalysis!.gtrEvaluation.rightEdgeRaised = value as never
    expect(() => encodeGTRReplayState(replay)).toThrow('報告時評価が不正')
  })

  it('keeps replay codes created before rewind state was added readable', () => {
    const replay = toGTRReplayState(createSnapshot())
    delete replay.previousState
    expect(decodeGTRReplayState(encodeGTRReplayState(replay)).previousState).toBeUndefined()
  })

  it('rejects impossible combinations of game and result-screen state', () => {
    const resultWithoutPause = toGTRReplayState(createSnapshot())
    resultWithoutPause.sourceSettings.showingResult = true
    expect(() => encodeGTRReplayState(resultWithoutPause)).toThrow('画面状態が不正')

    const pausedGameOver = toGTRReplayState(createSnapshot())
    pausedGameOver.gameOver = true
    pausedGameOver.sourceSettings.paused = true
    expect(() => encodeGTRReplayState(pausedGameOver)).toThrow('画面状態が不正')
  })

  it('rejects a rewind state whose falling pair overlaps its field', () => {
    const replay = toGTRReplayState(createSnapshot())
    replay.previousState!.field.grid[1][2] = PuyoColor.RED

    expect(() => encodeGTRReplayState(replay)).toThrow('巻き戻し状態が不正')
  })

  it('rejects array values that only stringify to valid enum members', () => {
    const fieldColor = toGTRReplayState(createSnapshot())
    fieldColor.field.grid[12][0] = [PuyoColor.YELLOW] as never
    expect(() => encodeGTRReplayState(fieldColor)).toThrow('盤面が不正')

    const pairColor = toGTRReplayState(createSnapshot())
    pairColor.currentPair!.main.color = [PuyoColor.GREEN] as never
    expect(() => encodeGTRReplayState(pairColor)).toThrow('ツモ情報が不正')

    const planColor = toGTRReplayState(createSnapshot())
    planColor.trainingPlan.colorA = [trainingPlan.colorA] as never
    expect(() => encodeGTRReplayState(planColor)).toThrow('練習計画が不正')

    const phase = toGTRReplayState(createSnapshot())
    phase.sourceAnalysis!.advice!.phase = [GamePhase.CHAIN_TAIL] as never
    expect(() => encodeGTRReplayState(phase)).toThrow('報告時評価が不正')
  })

  it('never emits a replay code that the decoder must reject as oversized', () => {
    const cells = Array.from({ length: 64 }, (_, index) => ({ x: index % 6, y: index % 13 }))
    const oversizedPlan = {
      shape: 'Y' as const,
      color: PuyoColor.GREEN,
      chainCells: cells,
      supportCells: cells,
      matchedChainCells: 64,
      filledSupportCells: 64,
      matchedCells: 128,
      totalCells: 128,
      continuationCount: 128,
      templateFilled: true,
    }
    const snapshot = createSnapshot()
    snapshot.tailPlans = Array.from({ length: 64 }, () => ({
      ...oversizedPlan,
      chainCells: [...cells],
      supportCells: [...cells],
    }))
    const replay = toGTRReplayState(snapshot)

    expect(() => encodeGTRReplayState(replay)).toThrow('長すぎます')
    expect(tryCreateGTRReplayUrl(snapshot, 'https://example.test/')).toBeNull()
  })

  it('formats one self-contained Codex report with feedback and replay data', () => {
    const markdown = formatGTRIssueMarkdown(createSnapshot(), {
      comment: 'Y字では緑を下に置くべきです',
      expectedColumn: 3,
      expectedRotation: 2,
    }, 'https://example.test/#gtr-replay=sample')

    expect(markdown).toContain('Y字では緑を下に置くべきです')
    expect(markdown).toContain('4列・下向き')
    expect(markdown).toContain('下から青→緑')
    expect(markdown).toContain('現在の推薦: 3列・右向き')
    expect(markdown).toContain('Y Y G . . .')
    expect(markdown).toContain('https://example.test/#gtr-replay=sample')
  })

  it('keeps independently specified expected columns and rotations truthful', () => {
    const snapshot = createSnapshot()
    const columnOnly = formatGTRIssueMarkdown(snapshot, {
      comment: '',
      expectedColumn: 1,
      expectedRotation: null,
    }, 'https://example.test/column')
    const rotationOnly = formatGTRIssueMarkdown(snapshot, {
      comment: '',
      expectedColumn: null,
      expectedRotation: 3,
    }, 'https://example.test/rotation')

    expect(columnOnly).toContain('期待する配置: 2列・向き未指定')
    expect(rotationOnly).toContain('期待する配置: 列未指定・左向き')
  })

  it('keeps every placement candidate in diagnostics while Markdown shows only the top five', () => {
    const placements = Array.from({ length: 15 }, (_, index) => ({
      ...advice.bestPlacement!,
      placement: { column: index % 6, rotation: index % 4 },
      totalScore: 200 - index,
    }))
    const snapshot = createSnapshot({
      ...advice,
      bestPlacement: placements[0],
      allPlacements: placements,
    })
    const markdown = formatGTRIssueMarkdown(snapshot, {
      comment: '',
      expectedColumn: null,
      expectedRotation: null,
    }, 'https://example.test/replay')

    expect(snapshot.advice?.candidates).toHaveLength(15)
    expect(markdown.match(/^\| [1-5] \|/gm)).toHaveLength(5)
  })

  it('reports physical leftovers for the saved immediate fire without changing old snapshot formats', () => {
    const palette: Record<string, PuyoColor> = { R: PuyoColor.RED, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW, G: PuyoColor.GREEN }
    const board = '..........................................................YYYRGBYBYYRGGYRRGBBY'
    const fireField: GameField = { width: 6, height: 13,
      grid: board.match(/.{6}/g)!.map(row => [...row].map(c => palette[c] ?? null)) }
    const current = pair(PuyoColor.GREEN, PuyoColor.YELLOW)
    const actualAdvice = PlacementAdvisor.getAdvice(fireField, current)
    const snapshot = createSnapshot(actualAdvice)
    snapshot.field = fireField; snapshot.currentPair = current
    const before = JSON.stringify(snapshot)
    const markdown = formatGTRIssueMarkdown(snapshot, { comment: '', expectedColumn: null, expectedRotation: null }, 'https://example.test/replay')
    expect(markdown).toContain('本線発火後残数')
    expect(markdown.match(/^\| 1 \|.*\| 5 \| 1 \|$/m)).not.toBeNull()
    expect(JSON.stringify(snapshot)).toBe(before)
    const building = formatGTRIssueMarkdown(createSnapshot(), { comment: '', expectedColumn: null, expectedRotation: null }, 'https://example.test/replay')
    expect(building.match(/^\| 1 \|.*\| 0 \| - \|$/m)).not.toBeNull()
  })

  it('stores newest reports first without exceeding the history limit', () => {
    const storage = new MemoryStorage()
    const snapshot = createSnapshot()
    for (let index = 0; index < 25; index++) {
      const report = createStoredGTRIssueReport(snapshot, {
        comment: `report-${index}`,
        expectedColumn: null,
        expectedRotation: null,
      })
      report.id = String(index)
      saveStoredGTRIssueReport(storage, report)
    }

    const reports = loadStoredGTRIssueReports(storage)
    expect(reports).toHaveLength(20)
    expect(reports[0].feedback.comment).toBe('report-24')
    expect(reports[reports.length - 1]?.feedback.comment).toBe('report-5')
    expect(storage.getItem(GTR_REPORT_STORAGE_KEY)).not.toBeNull()
  })

  it('ignores malformed report history instead of crashing the report panel', () => {
    const storage = new MemoryStorage()
    const invalidTurn = createStoredGTRIssueReport(createSnapshot(), {
      comment: 'invalid turn',
      expectedColumn: null,
      expectedRotation: null,
    }) as unknown as Record<string, any>
    invalidTurn.snapshot.turnNumber = {}
    const invalidAdvice = createStoredGTRIssueReport(createSnapshot(), {
      comment: 'invalid advice',
      expectedColumn: null,
      expectedRotation: null,
    }) as unknown as Record<string, any>
    invalidAdvice.snapshot.advice.bestPlacement = {}
    storage.setItem(GTR_REPORT_STORAGE_KEY, JSON.stringify([invalidTurn, invalidAdvice]))

    expect(loadStoredGTRIssueReports(storage)).toEqual([])
  })

  it('keeps reporting available when browser storage access itself is denied', () => {
    const denied = Object.defineProperty({}, 'localStorage', {
      get: () => { throw new DOMException('denied', 'SecurityError') },
    }) as { readonly localStorage: Storage }

    expect(getBrowserGTRReportStorage(denied)).toBeNull()
    expect(loadStoredGTRIssueReports(null)).toEqual([])
  })
})

it.each([[], [['red', 'invalid']], [['red']], Array(10001).fill(['red', 'green'])].map(invalid => ({ invalid })))('rejects malformed practice sequences in shared replays', ({ invalid }) => {
  const replay = { ...toGTRReplayState(createSnapshot()), practiceSequence: invalid }
  expect(() => encodeGTRReplayState(replay as ReturnType<typeof toGTRReplayState>)).toThrow('練習ツモ')
})
