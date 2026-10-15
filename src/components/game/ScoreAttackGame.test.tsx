// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ScoreAttackEvaluation, ScoreAttackSnapshot } from '../../game/scoreAttack/types'
import { evaluateScoreAttack } from '../../game/scoreAttack/evaluate'
import { GTR_COMPLETION_GALLERY, getGalleryGrid } from '../../game/guide/GTRCompletionGallery'

const fixtures = vi.hoisted(() => ({ managers: [] as any[], workers: [] as any[] }))
vi.mock('../../game/GameManager', () => ({ GameManager: class {
  onScoreAttackRound?: (snapshot: ScoreAttackSnapshot) => void
  setSuspended = vi.fn()
  startScoreAttack = vi.fn()
  destroy = vi.fn()
  constructor() { fixtures.managers.push(this) }
} }))
vi.mock('../../game/scoreAttack/ScoreAttackWorker', () => ({ ScoreAttackWorker: class {
  jobs: Array<{ snapshot: ScoreAttackSnapshot; resolve: (value: ScoreAttackEvaluation) => void; reject: (error: unknown) => void }> = []
  evaluate = (snapshot: ScoreAttackSnapshot) => new Promise<ScoreAttackEvaluation>((resolve, reject) => this.jobs.push({ snapshot, resolve, reject }))
  dispose = vi.fn()
  constructor() { fixtures.workers.push(this) }
} }))
vi.mock('./GameControls', () => ({ default: () => null }))
vi.mock('./KeyboardInstructions', () => ({ default: () => null }))
vi.mock('../settings/KeySettings', () => ({ default: () => null }))
import ScoreAttackGame from './ScoreAttackGame'

beforeEach(() => { vi.useFakeTimers(); fixtures.managers.length = 0; fixtures.workers.length = 0 })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('keeps playing before grades complete, preserves the set across gallery suspension, and starts a clean retry', async () => {
  const onExit = vi.fn()
  const view = render(<ScoreAttackGame suspended={false} onExit={onExit} />)
  act(() => vi.advanceTimersByTime(200))
  const manager = fixtures.managers[0], worker = fixtures.workers[0]
  expect(manager.startScoreAttack).toHaveBeenCalledOnce()
  const source = { grid: getGalleryGrid(GTR_COMPLETION_GALLERY[0]), currentPair: null }
  act(() => manager.onScoreAttackRound(source))
  expect(screen.queryByText('GTR 2 / 10')).toBeNull()
  expect(screen.queryByRole('region', { name: 'スコアアタックの結果' })).toBeNull()
  view.rerender(<ScoreAttackGame suspended onExit={onExit} />)
  expect(manager.setSuspended).toHaveBeenLastCalledWith(true)
  view.rerender(<ScoreAttackGame suspended={false} onExit={onExit} />)
  expect(fixtures.managers).toHaveLength(1)
  expect(screen.queryByText('GTR 2 / 10')).toBeNull()
  act(() => { for (let i = 1; i < 10; i++) manager.onScoreAttackRound(source) })
  expect(manager.setSuspended).toHaveBeenLastCalledWith(true)
  const list = screen.getByLabelText('10回のGTRと点数一覧')
  expect(within(list).getAllByRole('button')).toHaveLength(10)
  expect(screen.getByText('採点中')).toBeTruthy()
  await act(async () => { for (const job of worker.jobs) job.resolve(evaluateScoreAttack(job.snapshot)) })
  expect(screen.getByText('1000点')).toBeTruthy()
  expect(within(list).getAllByRole('button').every(button => button.textContent === '100点')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
  expect(worker.dispose).toHaveBeenCalledOnce()
  expect(manager.destroy).toHaveBeenCalledOnce()
  expect(screen.queryByText('GTR 1 / 10')).toBeNull()
  expect(fixtures.managers[1].getScoreAttackTotal()).toBe(0)
  expect(screen.queryByText('1000点')).toBeNull()
  act(() => vi.advanceTimersByTime(200))
  expect(fixtures.managers[1].startScoreAttack).toHaveBeenCalledOnce()
  view.unmount()
  expect(fixtures.workers[1].dispose).toHaveBeenCalledOnce()
  expect(fixtures.managers[1].destroy).toHaveBeenCalledOnce()
})

it('reads the submitted GTR total after out-of-order grades without blocking play', async () => {
  render(<ScoreAttackGame suspended={false} onExit={vi.fn()} />)
  act(() => vi.advanceTimersByTime(200))
  const manager = fixtures.managers[0], worker = fixtures.workers[0]
  expect(manager.getScoreAttackTotal()).toBe(0)
  const source = { grid: getGalleryGrid(GTR_COMPLETION_GALLERY[0]), currentPair: null }
  act(() => { manager.onScoreAttackRound(source); manager.onScoreAttackRound(source) })
  expect(manager.getScoreAttackTotal()).toBeNull()
  expect(manager.setSuspended).not.toHaveBeenLastCalledWith(true)
  await act(async () => worker.jobs[1].resolve(evaluateScoreAttack(worker.jobs[1].snapshot)))
  expect(manager.getScoreAttackTotal()).toBeNull()
  await act(async () => worker.jobs[0].resolve(evaluateScoreAttack(worker.jobs[0].snapshot)))
  expect(manager.getScoreAttackTotal()).toBe(200)
  expect(fixtures.managers).toHaveLength(1)
  expect(screen.queryByText(/GTR \d+ \/ 10/)).toBeNull()
})

it('keeps an incomplete total unknown when a submitted grade fails', async () => {
  render(<ScoreAttackGame suspended={false} onExit={vi.fn()} />)
  act(() => vi.advanceTimersByTime(200))
  const manager = fixtures.managers[0], worker = fixtures.workers[0]
  act(() => manager.onScoreAttackRound({ grid: getGalleryGrid(GTR_COMPLETION_GALLERY[0]), currentPair: null }))
  await act(async () => worker.jobs[0].reject(new Error('grade failed')))
  expect(manager.getScoreAttackTotal()).toBeNull()
})
