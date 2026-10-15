import { describe, expect, it } from 'vitest'
import { measureContinuousGame } from '../benchmark/measure-continuous-guide'
import { DEFAULT_BENCHMARK_CONFIG } from '../../src/benchmark/AdvisorBenchmark'
import { GamePhase } from '../../src/game/advisor/types'
import { compareContinuousFoundations, rescoreContinuousReport, type ContinuousReport } from './compare-continuous-foundations'

const report = (): ContinuousReport => ({ version: 1, mode: 'continuous-guide', seed: DEFAULT_BENCHMARK_CONFIG.seed,
  start: 0, maxTurns: 2, openingKinds: [...DEFAULT_BENCHMARK_CONFIG.openingKinds], games: [measureContinuousGame(0, 2)] })

describe('continuous foundation comparison', () => {
  it('replays real moves, compares both reports with the same scorer, and does not mutate input', () => {
    const data = report(), original = structuredClone(data)
    const result = compareContinuousFoundations(data, structuredClone(data))
    expect(result.before.verifiedPlacements).toBe(2)
    expect(result.before.summary).toMatchObject({ games: 1, perfectGames: 0, perfectRate: 0 })
    expect(result.before).toEqual(result.after)
    expect(result.changedGames).toEqual([])
    expect(result.fiveGained).toEqual([])
    expect(result.fiveLost).toEqual([])
    expect(result.tailGained).toEqual([])
    expect(result.tailLost).toEqual([])
    expect(result.style.before.placements).toBe(2)
    expect(result.style.before).toEqual(result.style.after)
    expect(data).toEqual(original)
  })

  it('does not compare recorded tail flags from different classifiers as new achievements', () => {
    const before = report(), after = structuredClone(before)
    after.games[0].tail = true
    const result = compareContinuousFoundations(before, after)
    expect(result.before.summary.recordedTailGames).toBe(0)
    expect(result.after.summary.recordedTailGames).toBe(1)
    expect(result.tailGained).toEqual([])
    expect(result.tailLost).toEqual([])
  })

  it('includes an unplayed no-advice game in the denominator', () => {
    const data = report()
    data.games = [measureContinuousGame(0, 2, () => ({ bestPlacement: null, allPlacements: [],
      phase: GamePhase.FOLD_BUILDING, phaseMessage: '' }))]
    expect(rescoreContinuousReport(data)).toMatchObject({ verifiedPlacements: 0,
      summary: { games: 1, perfectGames: 0, perfectRate: 0 } })
  })

  it('rejects edited physics, duplicate identities, mixed conditions, and hidden supply substitutions', () => {
    const original = report()
    const badBoard = structuredClone(original); badBoard.games[0].turns[0].gridAfter = '.'.repeat(78)
    expect(() => rescoreContinuousReport(badBoard)).toThrow('Physics mismatch')
    const duplicate = structuredClone(original); duplicate.games.push(duplicate.games[0])
    expect(() => rescoreContinuousReport(duplicate)).toThrow('Bad game identity')
    const supply = structuredClone(original); supply.games[0].turns[0].visiblePairs.reverse()
    expect(() => rescoreContinuousReport(supply)).toThrow('Input mismatch')
    expect(() => compareContinuousFoundations(original, { ...original, maxTurns: 3 })).toThrow('Mixed comparison')
  })
})
