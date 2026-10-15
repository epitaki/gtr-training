// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PuyoColor } from '../../game/core/types'
import { evaluateScoreAttack } from '../../game/scoreAttack/evaluate'
import type { ScoreAttackState } from '../../game/scoreAttack/types'
import ScoreAttackResults from './ScoreAttackResults'
import { encodePlacedPair, replayPlacements } from '../../game/scoreAttack/placementHistory'

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true,
    value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true,
    value: function (this: HTMLDialogElement) { this.open = false } })
})
afterEach(() => {
  cleanup()
  delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal
  delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).close
  vi.restoreAllMocks()
})
const state = (): ScoreAttackState => ({
  finished: true, totalScore: 450,
  rounds: Array.from({ length: 10 }, (_, index) => {
    const snapshot = { grid: Array.from({ length: 13 }, () => Array(6).fill(null)), currentPair: null }
    snapshot.grid[index][0] = PuyoColor.RED
    const evaluation = evaluateScoreAttack(snapshot)
    evaluation.analysis.score.totalScore = index * 10
    return { snapshot, evaluation, error: null }
  }),
})

it('shows ten submitted GTR diagrams above scores and opens playback and points', async () => {
  const callbacks = { onRestart: vi.fn(), onExit: vi.fn(), onRetry: vi.fn() }
  render(<ScoreAttackResults state={state()} {...callbacks} />)
  const list = screen.getByLabelText('10回のGTRと点数一覧')
  const buttons = within(list).getAllByRole('button')
  expect(buttons.map(button => button.textContent)).toEqual(Array.from({ length: 10 }, (_, index) => `${index * 10}点`))
  expect(buttons.every(button => button.firstElementChild?.children.length === 24)).toBe(true)
  expect(screen.getByText('450点')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'TOTAL SCORE' }))
  fireEvent.click(buttons[3])
  const dialog = screen.getByRole('dialog', { name: '4回目の評価' })
  expect(within(dialog).getAllByText('30点')).toHaveLength(2)
  expect(within(dialog).getByLabelText('土台の消去アニメーション')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: '戻る' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(buttons[3]))
  expect(screen.getByText('450点')).toBeTruthy()
  fireEvent.click(buttons[9])
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(buttons[9]))
  fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
  fireEvent.click(screen.getByRole('button', { name: '終了' }))
  expect(callbacks.onRestart).toHaveBeenCalledOnce()
  expect(callbacks.onExit).toHaveBeenCalledOnce()
})

it('keeps pending and failed grades unavailable and offers retry outside the score list', () => {
  const value = state(), onRetry = vi.fn()
  value.totalScore = null
  value.rounds[2].evaluation = null
  value.rounds[5].evaluation = null
  value.rounds[5].error = '採点失敗'
  render(<ScoreAttackResults state={value} onRestart={() => {}} onExit={() => {}} onRetry={onRetry} />)
  expect(screen.getByText('採点中')).toBeTruthy()
  const buttons = within(screen.getByLabelText('10回のGTRと点数一覧')).getAllByRole('button') as HTMLButtonElement[]
  expect(buttons[2].disabled).toBe(true)
  expect(buttons[2].textContent).toBe('…')
  expect(buttons[5].disabled).toBe(true)
  expect(buttons[5].textContent).toBe('—')
  fireEvent.click(screen.getByRole('button', { name: '採点をやり直す' }))
  expect(onRetry).toHaveBeenCalledOnce()
  expect(within(screen.getByRole('alert')).getByText('一部の採点を完了できませんでした。盤面は保存されています。')).toBeTruthy()
})

it('offers practice for the selected saved round and passes that round’s colors', () => {
  const value = state(), onPractice = vi.fn()
  const moves = encodePlacedPair({ main: { color: PuyoColor.BLUE, x: 0, y: 12 },
    sub: { color: PuyoColor.GREEN, x: 0, y: 11 }, rotation: 0, falling: true })
  value.rounds[2].snapshot = { moves, grid: replayPlacements(moves), currentPair: null }
  render(<ScoreAttackResults state={value} onExit={() => {}} onRetry={() => {}} onPractice={onPractice} />)
  fireEvent.click(within(screen.getByLabelText('10回のGTRと点数一覧')).getAllByRole('button')[2])
  const dialog = screen.getByRole('dialog', { name: '3回目の評価' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'このツモで練習' }))
  expect(onPractice).toHaveBeenCalledWith([[PuyoColor.BLUE, PuyoColor.GREEN]])
})
