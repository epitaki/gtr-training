// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { evaluateScoreAttack } from '../../game/scoreAttack/evaluate'
import { emptyScoreAttackState } from '../../game/scoreAttack/ScoreAttackSession'
import type { SavedScoreAttackGame } from '../../lib/scoreAttackHistory'
import { encodeScoreAttackGame } from '../../game/scoreAttack/storageCodec'

const api = vi.hoisted(() => ({ save: vi.fn(), favorite: vi.fn() }))
vi.mock('../../lib/scoreAttackHistory', () => ({ saveScoreAttackGame: api.save, setScoreAttackFavorite: api.favorite }))
import { useScoreAttackSave } from './useScoreAttackSave'

const snapshot = { grid: Array.from({ length: 13 }, () => Array(6).fill(null)), currentPair: null }
const state = { finished: true, totalScore: 0, rounds: Array.from({ length: 10 }, () => ({ snapshot, evaluation: evaluateScoreAttack(snapshot), error: null })) }
const saved: SavedScoreAttackGame = { id: 'run-1', createdAt: '2026-10-04T00:00:00Z', favorite: false, totalScore: 0, data: encodeScoreAttackGame(state) }
beforeEach(() => { vi.clearAllMocks(); api.save.mockResolvedValue(saved); api.favorite.mockResolvedValue({ ...saved, favorite: true }) })
afterEach(cleanup)

it('waits for all ten grades and saves only the matching owner', async () => {
  const view = renderHook(({ value, owner, user }) => useScoreAttackSave(value, 'run-1', owner, user),
    { initialProps: { value: emptyScoreAttackState(), owner: 'A' as string | null, user: 'A' as string | undefined } })
  expect(api.save).not.toHaveBeenCalled()
  view.rerender({ value: { ...state, rounds: state.rounds.slice(0, 9), finished: false, totalScore: null }, owner: 'A', user: 'A' })
  expect(api.save).not.toHaveBeenCalled()
  view.rerender({ value: state, owner: null, user: undefined }); expect(api.save).not.toHaveBeenCalled()
  view.rerender({ value: state, owner: 'A', user: 'B' }); expect(api.save).not.toHaveBeenCalled()
  view.rerender({ value: state, owner: 'A', user: 'A' })
  await waitFor(() => expect(view.result.current.status).toBe('saved'))
  expect(api.save).toHaveBeenCalledWith('run-1', state, 'A')
})
it('ignores a late save response after identity changes', async () => {
  let resolve!: (game: SavedScoreAttackGame) => void
  api.save.mockImplementation(() => new Promise<SavedScoreAttackGame>(done => { resolve = done }))
  const view = renderHook(({ user }) => useScoreAttackSave(state, 'run-1', 'A', user), { initialProps: { user: 'A' } })
  view.rerender({ user: 'B' })
  await act(async () => resolve(saved))
  expect(view.result.current.saved).toBeNull(); expect(view.result.current.status).toBe('idle')
})
it('retries with the same game id and lets the owner protect the saved result', async () => {
  api.save.mockRejectedValueOnce(new Error('保存失敗'))
  const view = renderHook(() => useScoreAttackSave(state, 'run-1', 'A', 'A'))
  await waitFor(() => expect(view.result.current.status).toBe('error'))
  act(() => view.result.current.retry())
  await waitFor(() => expect(view.result.current.status).toBe('saved'))
  expect(api.save.mock.calls.map(call => call[0])).toEqual(['run-1', 'run-1'])
  await act(async () => view.result.current.toggleFavorite())
  expect(api.favorite).toHaveBeenCalledWith('run-1', true, 'A')
  expect(view.result.current.saved?.favorite).toBe(true)
})

it('accepts an external favorite change only for the currently saved game', async () => {
  const view = renderHook(() => useScoreAttackSave(state, 'run-1', 'A', 'A'))
  await waitFor(() => expect(view.result.current.status).toBe('saved'))
  act(() => view.result.current.acceptUpdate({ ...saved, id: 'another-run', favorite: true }))
  expect(view.result.current.saved?.favorite).toBe(false)
  act(() => view.result.current.acceptUpdate({ ...saved, favorite: true }))
  expect(view.result.current.saved?.favorite).toBe(true)
})
