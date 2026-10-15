import { describe, expect, it } from 'vitest'
import { ADVISOR_SOURCE_PATHS, captureAdvisorSourceHashes } from './source-fingerprint'

describe('advisor source fingerprints', () => {
  it('resolves every relocated module and includes extracted decision logic', () => {
    const hashes = captureAdvisorSourceHashes()
    expect(Object.keys(hashes)).toEqual(Object.keys(ADVISOR_SOURCE_PATHS))
    expect(hashes.MainFireAnalysis).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.FiveChainSkeletons).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.LowerChainInsertion).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.BoardSurface).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.PairPlacementUse).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.CompletionWait).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.TailCascadeRecovery).toMatch(/^[a-f0-9]{64}$/)
    expect(hashes.AdvisorTypes).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.values(hashes).every(hash => /^[a-f0-9]{64}$/.test(hash))).toBe(true)
    expect(captureAdvisorSourceHashes()).toEqual(hashes)
  })
})
