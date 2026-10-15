import { describe, expect, it } from 'vitest'
import { simulateTurn } from '../game/core/ChainSimulator'
import { PuyoColor } from '../game/core/types'
import {
  SeededRandom,
  classifyOpening,
  compareBenchmarkReports,
  createOpeningPairs,
  decodeBenchmarkGrid,
  encodeBenchmarkGrid,
  replayBenchmarkGame,
  runAdvisorBenchmark,
  runBenchmarkGame,
  deriveBenchmarkGameSeed,
  type BenchmarkOpeningKind,
  type BenchmarkMode,
  type BenchmarkPair,
} from './AdvisorBenchmark'

const pair = (main: PuyoColor, sub: PuyoColor): BenchmarkPair => ({ main, sub })

describe('AdvisorBenchmark', () => {
  it('fixed-index shards produce exactly the serial games, regardless of execution order', () => {
    const report = runAdvisorBenchmark({ gamesPerMode: 6, maxTurns: 2, modes: ['random'] })
    const config = report.config
    const shards = [5, 2, 0, 4, 1, 3].map(index => runBenchmarkGame('random', index,
      deriveBenchmarkGameSeed(config.seed, index), config.openingKinds[index % config.openingKinds.length], config.maxTurns))
    expect(shards.sort((a, b) => a.gameIndex - b.gameIndex)).toEqual(report.modes[0].games)
  })

  it('progress reporting does not change games or expose mutable game data', () => {
    const config = { gamesPerMode: 2, maxTurns: 1, modes: ['random'] as BenchmarkMode[] }
    const plain = runAdvisorBenchmark(config)
    const progress: unknown[] = []
    const observed = runAdvisorBenchmark(config, event => { progress.push({ ...event }); event.completedGames = 999 })
    expect(observed).toEqual(plain)
    expect(progress).toEqual([1, 2].map(completedGames => ({
      mode: 'random', completedGames, totalGames: 2, tailCompletions: 0, chain5Fires: 0,
    })))
  })

  it('同じseedから同じ乱数列を生成する', () => {
    const left = new SeededRandom(12345)
    const right = new SeededRandom(12345)

    expect(Array.from({ length: 10 }, () => left.next())).toEqual(
      Array.from({ length: 10 }, () => right.next()),
    )
  })

  it('初手を色名に依存せず分類する', () => {
    const R = PuyoColor.RED
    const G = PuyoColor.GREEN
    const B = PuyoColor.BLUE
    const Y = PuyoColor.YELLOW

    expect(classifyOpening(pair(R, R), pair(R, R))).toBe('AAAA')
    expect(classifyOpening(pair(G, R), pair(R, R))).toBe('AAAB')
    expect(classifyOpening(pair(R, R), pair(G, G))).toBe('AABB')
    expect(classifyOpening(pair(R, G), pair(G, R))).toBe('ABAB')
    expect(classifyOpening(pair(R, R), pair(G, B))).toBe('AABC')
    expect(classifyOpening(pair(R, G), pair(R, B))).toBe('ABAC')
    expect(classifyOpening(pair(R, G), pair(B, Y))).toBe('ABCD')
  })

  it('指定した各初手分類を生成する', () => {
    const kinds: BenchmarkOpeningKind[] = [
      'AAAA', 'AAAB', 'AABB', 'ABAB', 'AABC', 'ABAC', 'ABCD',
    ]

    for (const [index, kind] of kinds.entries()) {
      const [first, second] = createOpeningPairs(kind, new SeededRandom(index + 1))
      expect(classifyOpening(
        { main: first.main.color, sub: first.sub.color },
        { main: second.main.color, sub: second.sub.color },
      )).toBe(kind)
    }
  })

  it('圧縮した盤面を欠損なく復元する', () => {
    const grid = Array.from(
      { length: 13 },
      () => Array<PuyoColor | null>(6).fill(null),
    )
    grid[0][0] = PuyoColor.RED
    grid[4][2] = PuyoColor.GREEN
    grid[8][4] = PuyoColor.BLUE
    grid[12][5] = PuyoColor.YELLOW

    expect(decodeBenchmarkGrid(encodeBenchmarkGrid(grid))).toEqual(grid)
  })

  it('同じ設定のベンチマーク結果を完全に再現する', () => {
    const config = {
      seed: 9876,
      gamesPerMode: 1,
      maxTurns: 3,
      modes: ['random', 'adversarial'] as const,
      openingKinds: ['AAAB'] as const,
    }

    const first = runAdvisorBenchmark({
      ...config,
      modes: [...config.modes],
      openingKinds: [...config.openingKinds],
    })
    const second = runAdvisorBenchmark({
      ...config,
      modes: [...config.modes],
      openingKinds: [...config.openingKinds],
    })

    expect(second).toEqual(first)
    expect(first.modes.map(mode => mode.mode)).toEqual(['random', 'adversarial'])
    const thirdPairs = first.modes.map(mode => mode.games[0].turns[2].currentPair)
    expect(thirdPairs[1]).toEqual(thirdPairs[0])
  })

  it('保存したツモ・配置・盤面からゲームを再生できる', () => {
    const report = runAdvisorBenchmark({
      seed: 2468,
      gamesPerMode: 1,
      maxTurns: 3,
      modes: ['random'],
      openingKinds: ['ABAC'],
    })
    const game = report.modes[0].games[0]

    expect(game.turns.length).toBeGreaterThan(0)
    const replay = replayBenchmarkGame(game)
    expect(replay).toMatchObject({
      matched: true,
      mismatches: [],
    })
    expect(encodeBenchmarkGrid(replay.finalGrid)).toBe(game.finalGrid)
  })

  it('replays the stored placement instead of the current recommendation', () => {
    const report = runAdvisorBenchmark({
      seed: 1122,
      gamesPerMode: 1,
      maxTurns: 1,
      modes: ['random'],
      openingKinds: ['AAAB'],
    })
    const changed = structuredClone(report.modes[0].games[0])
    const originalPlacement = changed.turns[0].placement
    const storedPlacement = originalPlacement.column === 0 && originalPlacement.rotation === 0
      ? { column: 1, rotation: 0 }
      : { column: 0, rotation: 0 }
    changed.turns[0].placement = storedPlacement

    const emptyGrid = Array.from(
      { length: 13 },
      () => Array<PuyoColor | null>(6).fill(null),
    )
    const current = changed.turns[0].currentPair
    const outcome = simulateTurn(emptyGrid, {
      main: { color: current.main, x: 2, y: 1 },
      sub: { color: current.sub, x: 2, y: 0 },
      rotation: 0,
      falling: true,
    }, storedPlacement)
    const replay = replayBenchmarkGame(changed)

    expect(replay.matched).toBe(false)
    expect(encodeBenchmarkGrid(replay.finalGrid)).toBe(encodeBenchmarkGrid(outcome.stableGrid))
  })

  it('rejects duplicate opening classifications', () => {
    expect(() => runAdvisorBenchmark({
      seed: 1,
      gamesPerMode: 1,
      maxTurns: 1,
      modes: ['random'],
      openingKinds: ['AAAB', 'AAAB'],
    })).toThrow('unique')
  })

  it('rejects the removed assisted mode at runtime', () => {
    expect(() => runAdvisorBenchmark({
      modes: ['assisted'] as unknown as BenchmarkMode[],
    })).toThrow('unique benchmark modes')
  })

  it('rejects incomplete and overlong stored traces', () => {
    const report = runAdvisorBenchmark({
      seed: 3344,
      gamesPerMode: 1,
      maxTurns: 1,
      modes: ['random'],
      openingKinds: ['AAAB'],
    })
    const original = report.modes[0].games[0]
    expect(original.actualFire).toBe(false)
    expect(original.gameOver).toBe(false)
    expect(original.terminalInput).toBeNull()

    const incomplete = structuredClone(original)
    incomplete.maxTurns = 3
    expect(replayBenchmarkGame(incomplete).mismatches).toContainEqual({
      turn: null,
      message: 'trace ended before maxTurns',
    })

    const overlong = structuredClone(original)
    overlong.turns.push(structuredClone(overlong.turns[0]))
    const overlongMismatches = replayBenchmarkGame(overlong).mismatches
    expect(overlongMismatches).toContainEqual({
      turn: null,
      message: 'turn count exceeds maxTurns',
    })
    expect(overlongMismatches).not.toContainEqual({
      turn: null,
      message: 'trace ended before maxTurns',
    })
  })

  it('同一レポートの比較差分はすべて0になる', () => {
    const report = runAdvisorBenchmark({
      seed: 1357,
      gamesPerMode: 1,
      maxTurns: 1,
      modes: ['random'],
      openingKinds: ['AAAA'],
    })
    const comparison = compareBenchmarkReports(report, report)

    expect(comparison.configDifferences).toEqual([])
    expect(comparison.overall.metrics.every(metric => metric.delta === 0)).toBe(true)
    expect(comparison.overall.failureReasons.every(reason => reason.delta === 0)).toBe(true)
    expect(comparison.modes[0].metrics.every(metric => metric.delta === 0)).toBe(true)
    expect(comparison.modes[0].byOpening[0].metrics.every(metric => metric.delta === 0)).toBe(true)
  })

  it('初手別指標と失敗理由だけの変化も比較できる', () => {
    const baseline = runAdvisorBenchmark({
      seed: 9753,
      gamesPerMode: 1,
      maxTurns: 1,
      modes: ['random'],
      openingKinds: ['AAAB'],
    })
    const current = structuredClone(baseline)
    const opening = current.modes[0].byOpening.AAAB!
    opening.metrics.coreCompletionRate = 1
    opening.failureReasons.core_not_completed++

    const comparison = compareBenchmarkReports(baseline, current)
    const openingComparison = comparison.modes[0].byOpening[0]
    expect(comparison.overall.metrics.every(metric => metric.delta === 0)).toBe(true)
    expect(openingComparison.metrics.find(
      metric => metric.metric === 'coreCompletionRate',
    )?.delta).toBe(1)
    expect(openingComparison.failureReasons.find(
      reason => reason.reason === 'core_not_completed',
    )?.delta).toBe(1)
  })

  it('keeps legacy seven-chain observations out of all evaluation comparisons', () => {
    const baseline = runAdvisorBenchmark({ gamesPerMode: 1, maxTurns: 1, modes: ['random'], openingKinds: ['AAAB'] })
    const current = structuredClone(baseline)
    // Synthetic aggregates exercise comparison policy, not physical validation.
    for (const aggregate of [current.overall, current.modes[0], current.modes[0].byOpening.AAAB!]) {
      aggregate.metrics.chain7Rate = 1
      aggregate.metrics.chain5Rate = 1
    }
    const comparison = compareBenchmarkReports(baseline, current)
    for (const aggregate of [comparison.overall, comparison.modes[0], comparison.modes[0].byOpening[0]]) {
      expect(aggregate.metrics.map(item => item.metric)).not.toContain('chain7Rate')
      expect(aggregate.metrics.find(item => item.metric === 'chain5Rate')?.delta).toBe(1)
    }
    expect(current.overall.metrics.chain7Rate).toBe(1)
    expect(baseline.overall.metrics.chain7Rate).toBe(0)
  })

  it('発火分類・失敗理由・終端入力の改変を再生不一致として検出する', () => {
    const report = runAdvisorBenchmark({
      seed: 8642,
      gamesPerMode: 1,
      maxTurns: 2,
      modes: ['random'],
      openingKinds: ['AABC'],
    })
    const original = report.modes[0].games[0]

    const changedTurn = structuredClone(original)
    changedTurn.turns[0].intendedMainFire = !changedTurn.turns[0].intendedMainFire
    expect(replayBenchmarkGame(changedTurn).matched).toBe(false)

    const changedTurnNumber = structuredClone(original)
    changedTurnNumber.turns[0].turn = 99
    expect(replayBenchmarkGame(changedTurnNumber).mismatches).toContainEqual({
      turn: 1,
      message: 'turn changed',
    })

    const changedFailure = structuredClone(original)
    changedFailure.failureReason = 'game_over'
    expect(replayBenchmarkGame(changedFailure).mismatches).toContainEqual({
      turn: null,
      message: 'failureReason changed',
    })

    const changedTerminal = structuredClone(original)
    changedTerminal.terminalInput = {
      turn: original.turns.length + 1,
      currentPair: original.openingPairs[0],
      nextPair: original.openingPairs[1],
      nextNextPair: original.openingPairs[0],
      gridBefore: original.finalGrid,
      recommendedPlacement: null,
    }
    expect(replayBenchmarkGame(changedTerminal).mismatches).toContainEqual({
      turn: null,
      message: 'terminalInput changed',
    })
  })
})
