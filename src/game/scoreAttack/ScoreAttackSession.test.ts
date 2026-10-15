import { describe, expect, it, vi } from 'vitest'
import { PuyoColor } from '../core/types'
import { GTR_COMPLETION_GALLERY, getGalleryGrid } from '../guide/GTRCompletionGallery'
import { ScoreAttackSession } from './ScoreAttackSession'
import { evaluateScoreAttack } from './evaluate'
import type { ScoreAttackEvaluation, ScoreAttackSnapshot } from './types'

const snapshot = (): ScoreAttackSnapshot => ({
  grid: Array.from({ length: 13 }, () => Array(6).fill(null)), currentPair: null,
})
const evaluation = (score: number): ScoreAttackEvaluation => {
  const value = evaluateScoreAttack(snapshot())
  value.analysis.score.totalScore = score
  return value
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('ten-round score attack', () => {
  it('fixes ten independent snapshots immediately and sums in submission order after delayed evaluations', async () => {
    const jobs: Array<{ snapshot: ScoreAttackSnapshot; resolve: (value: ScoreAttackEvaluation) => void }> = []
    const evaluator = { evaluate: vi.fn((saved: ScoreAttackSnapshot) => new Promise<ScoreAttackEvaluation>(resolve => jobs.push({ snapshot: saved, resolve }))), dispose: vi.fn() }
    const session = new ScoreAttackSession(evaluator)
    const source = snapshot()
    source.grid[12][0] = PuyoColor.RED
    expect(session.submit(source)).toBe(true)
    source.grid[12][0] = PuyoColor.BLUE
    for (let i = 1; i < 10; i++) expect(session.submit(source)).toBe(true)
    expect(session.submit(source)).toBe(false)
    expect(session.getSnapshot().finished).toBe(true)
    expect(session.getSnapshot().totalScore).toBeNull()
    expect(jobs[0].snapshot.grid[12][0]).toBe(PuyoColor.RED)
    expect(jobs[1].snapshot.grid[12][0]).toBe(PuyoColor.BLUE)
    for (let i = 9; i >= 0; i--) jobs[i].resolve(evaluation(i * 10))
    await flush()
    expect(session.getSnapshot().rounds.map(round => round.evaluation!.analysis.score.totalScore)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90])
    expect(session.getSnapshot().totalScore).toBe(450)
    session.dispose()
  })

  it('retries failed saved boards without another submission or a fabricated zero score', async () => {
    const evaluator = { evaluate: vi.fn().mockRejectedValueOnce(new Error('worker failed')).mockResolvedValue(evaluation(100)), dispose: vi.fn() }
    const session = new ScoreAttackSession(evaluator)
    session.submit(snapshot())
    await flush()
    expect(session.getSnapshot().rounds[0].evaluation).toBeNull()
    expect(session.getSnapshot().rounds[0].error).toContain('再試行')
    session.retryFailed()
    session.retryFailed()
    await flush()
    expect(evaluator.evaluate).toHaveBeenCalledTimes(2)
    expect(session.getSnapshot().rounds).toHaveLength(1)
    expect(session.getSnapshot().rounds[0].error).toBeNull()
    expect(session.getSnapshot().rounds[0].evaluation!.analysis.score.totalScore).toBe(100)
  })

  it('ignores delayed results after disposal and stops the worker', async () => {
    let resolve!: (value: ScoreAttackEvaluation) => void
    const evaluator = { evaluate: () => new Promise<ScoreAttackEvaluation>(done => { resolve = done }), dispose: vi.fn() }
    const session = new ScoreAttackSession(evaluator)
    const changed = vi.fn()
    session.subscribe(changed)
    session.submit(snapshot())
    const before = session.getSnapshot()
    session.dispose()
    resolve(evaluation(100))
    await flush()
    expect(session.getSnapshot()).toBe(before)
    expect(changed).toHaveBeenCalledOnce()
    expect(evaluator.dispose).toHaveBeenCalledOnce()
    expect(session.submit(snapshot())).toBe(false)
  })

  it('uses the existing 100-point grading and preserves every input cell', () => {
    const source = { grid: getGalleryGrid(GTR_COMPLETION_GALLERY[0]), currentPair: null }
    const before = structuredClone(source)
    expect(evaluateScoreAttack(source).analysis.score.totalScore).toBe(100)
    expect(evaluateScoreAttack(snapshot()).analysis.score.totalScore).toBe(0)
    expect(source).toEqual(before)
  })
})
