import { describe, expect, it } from 'vitest'
import { mergeContinuousReports } from './merge-continuous-guide'
import { measureContinuousGame } from './measure-continuous-guide'
import { DEFAULT_BENCHMARK_CONFIG } from '../../src/benchmark/AdvisorBenchmark'
import { GamePhase } from '../../src/game/advisor/types'

const shard = (start: number) => ({ version: 1, mode: 'continuous-guide', seed: 20260904, start,
  maxTurns: 1, openingKinds: DEFAULT_BENCHMARK_CONFIG.openingKinds, hashes: { scorer: 'same' },
  harnessSha256: 'harness', supplierSha256: 'supplier',
  games: [measureContinuousGame(start, 1, () => ({ bestPlacement: null, allPlacements: [],
    phase: GamePhase.FOLD_BUILDING, phaseMessage: '' }))] })

describe('continuous-guide shard merge', () => {
  it('sorts contiguous ranges and computes the combined denominator', () => {
    const merged = mergeContinuousReports([shard(1), shard(0)])
    expect(merged.games.map(g => g.gameIndex)).toEqual([0, 1])
    expect(merged.summary).toMatchObject({ games: 2, foundationFive: 0, perfect: 0, stops: { no_advice: 2 }, actualFireLeftovers: null })
  })
  it('rejects duplicates, gaps, empty reports, wrong identity, and differing code versions', () => {
    expect(() => mergeContinuousReports([])).toThrow()
    expect(() => mergeContinuousReports([shard(0), shard(0)])).toThrow()
    expect(() => mergeContinuousReports([shard(1)])).toThrow()
    expect(() => mergeContinuousReports([shard(0), shard(2)])).toThrow()
    const altered = shard(1); altered.games[0].gameSeed++
    expect(() => mergeContinuousReports([shard(0), altered])).toThrow()
    expect(() => mergeContinuousReports([shard(0), { ...shard(1), harnessSha256: 'other' }])).toThrow()
    expect(() => mergeContinuousReports([shard(0), { ...shard(1), hashes: { scorer: 'other' } }])).toThrow()
    expect(() => mergeContinuousReports([shard(0), { ...shard(1), tailDefinition: 'guided-pending-head-v1' }])).toThrow()
    expect(() => mergeContinuousReports([{ ...shard(0), games: [] }])).toThrow()
  })
})
