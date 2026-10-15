import { expect, it, vi } from 'vitest'
import { ScoreAttackWorker } from './ScoreAttackWorker'
import { evaluateScoreAttack } from './evaluate'
import type { ScoreAttackSnapshot } from './types'

const snapshot: ScoreAttackSnapshot = { grid: Array.from({ length: 13 }, () => Array(6).fill(null)), currentPair: null }
function evaluationWithScore(score: number) {
  const evaluation = evaluateScoreAttack(snapshot)
  evaluation.analysis.score.totalScore = score
  return evaluation
}
function fakeWorker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const value = { postMessage: vi.fn(), terminate: vi.fn(), addEventListener: vi.fn((name: string, handler: (event: unknown) => void) => handlers.set(name, handler)) }
  return { value: value as unknown as Worker, emit: (name: string, data?: unknown) => handlers.get(name)!({ data }) }
}

it('matches delayed responses by id and releases pending work on disposal', async () => {
  const worker = fakeWorker(), factory = vi.fn(() => worker.value), client = new ScoreAttackWorker(factory)
  const first = client.evaluate(snapshot), second = client.evaluate(snapshot)
  const firstEvaluation = evaluationWithScore(11), secondEvaluation = evaluationWithScore(88)
  worker.emit('message', { id: 2, evaluation: secondEvaluation })
  worker.emit('message', { id: 1, evaluation: firstEvaluation })
  await expect(first).resolves.toEqual(firstEvaluation)
  await expect(second).resolves.toEqual(secondEvaluation)
  expect(factory).toHaveBeenCalledOnce()
  const pending = client.evaluate(snapshot)
  client.dispose()
  await expect(pending).rejects.toThrow('終了')
  worker.emit('message', { id: 3, evaluation: firstEvaluation })
  expect(worker.value.terminate).toHaveBeenCalledOnce()
  await expect(client.evaluate(snapshot)).rejects.toThrow('終了')
})

it('rejects all jobs after worker failure and creates a fresh worker for a retry', async () => {
  const old = fakeWorker(), fresh = fakeWorker()
  const factory = vi.fn().mockReturnValueOnce(old.value).mockReturnValue(fresh.value)
  const client = new ScoreAttackWorker(factory)
  const first = client.evaluate(snapshot), second = client.evaluate(snapshot)
  old.emit('error')
  await expect(first).rejects.toThrow('採点できません')
  await expect(second).rejects.toThrow('採点できません')
  let retrySettled = false
  const retry = client.evaluate(snapshot).then(value => { retrySettled = true; return value })
  old.emit('message', { id: 3, evaluation: evaluationWithScore(99) })
  await Promise.resolve()
  expect(retrySettled).toBe(false)
  const retryEvaluation = evaluationWithScore(22)
  fresh.emit('message', { id: 3, evaluation: retryEvaluation })
  await expect(retry).resolves.toEqual(retryEvaluation)
  expect(factory).toHaveBeenCalledTimes(2)
  client.dispose()
})

it('reports creation or postMessage failures without synchronously blocking submission', async () => {
  const client = new ScoreAttackWorker(() => { throw new Error('unavailable') })
  await expect(client.evaluate(snapshot)).rejects.toThrow('unavailable')
  const worker = fakeWorker()
  vi.mocked(worker.value.postMessage).mockImplementation(() => { throw new Error('post failed') })
  await expect(new ScoreAttackWorker(() => worker.value).evaluate(snapshot)).rejects.toThrow('post failed')
})
