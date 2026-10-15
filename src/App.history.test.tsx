// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import ScoreAttackHistory from './components/game/ScoreAttackHistory'
import { encodeScoreAttackGame } from './game/scoreAttack/storageCodec'
import { evaluateScoreAttack } from './game/scoreAttack/evaluate'
import type { AccountProfile } from './auth/account'
import type { SavedScoreAttackGame } from './lib/scoreAttackHistory'

const fake = vi.hoisted(() => ({ profile: null as AccountProfile | null, list: vi.fn(), favorite: vi.fn(), instances: 0 }))
vi.mock('./auth/useAccount', () => ({ useAccount: () => ({ profile: fake.profile, status: 'ready', error: null, configuredCloud: true, availableLocal: false, loginCloud: vi.fn(), loginLocal: vi.fn(), saveName: vi.fn(), saveAvatar: vi.fn(), logout: vi.fn() }) }))
vi.mock('./lib/scoreAttackHistory', () => ({ listScoreAttackGames: fake.list, setScoreAttackFavorite: fake.favorite }))
vi.mock('./components/TopPage', () => ({ default: () => <p>ホーム画面</p> }))
vi.mock('./components/gallery/CompletionGallery', () => ({ default: () => <p>完成形ページ</p> }))
vi.mock('./components/game/GuidedGame', () => ({ default: ({ suspended, practiceSequence }: { suspended: boolean; practiceSequence?: unknown }) => {
  const [instance] = useState(() => ++fake.instances)
  return <div data-testid="guided" data-sequence={JSON.stringify(practiceSequence)} data-instance={instance} data-suspended={String(suspended)}>練習ゲーム</div>
} }))
vi.mock('./components/game/ScoreAttackGame', () => ({ default: ({ suspended, savedGameUpdate }: { suspended: boolean; savedGameUpdate?: SavedScoreAttackGame }) => {
  const [instance] = useState(() => ++fake.instances)
  return <div data-favorite={String(savedGameUpdate?.favorite)} data-testid="score" data-instance={instance} data-suspended={String(suspended)}>スコアゲーム</div>
} }))
vi.mock('./components/game/ScoreAttackResults', () => ({ default: ({ state, onExit, onRestart, onPractice }: any) => <section>
  <p>保存結果 {state.rounds.length}回 {state.totalScore}点</p>
  {onPractice && <button onClick={() => onPractice([['red', 'blue'], ['green', 'yellow']])}>このツモで練習</button>}
  <button onClick={onExit}>履歴に戻る</button>{onRestart && <button onClick={onRestart}>もう一度</button>}
</section> }))

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
function profile(id = userA): AccountProfile { return { id, environment: 'cloud', role: 'user', display_name: 'Player' } }
function game(id = '33333333-3333-4333-8333-333333333333'): SavedScoreAttackGame {
  const snapshot = { grid: Array.from({ length: 13 }, () => Array(6).fill(null)), currentPair: null }
  const state = { finished: true, totalScore: 0, rounds: Array.from({ length: 10 }, () => ({ snapshot, evaluation: evaluateScoreAttack(snapshot), error: null })) }
  return { id, createdAt: '2026-10-10T05:00:00Z', favorite: false, totalScore: 0, data: encodeScoreAttackGame(state) }
}
const menu = (name: string) => screen.getByRole('button', { name })
beforeEach(() => { vi.resetAllMocks(); fake.profile = null; fake.instances = 0; history.replaceState(null, '', location.pathname + location.search); fake.list.mockResolvedValue([]) })
afterEach(cleanup)

it('opens history directly for guests and offers the account modal', () => {
  render(<App />)
  fireEvent.click(menu('履歴'))
  expect(menu('履歴').getAttribute('aria-current')).toBe('page')
  expect(screen.getByText('保存したゲームを見るにはログインしてください。')).toBeTruthy()
  expect(fake.list).not.toHaveBeenCalled()
  fireEvent.click(menu('ログイン'))
  expect(screen.getByRole('dialog', { name: 'アカウント' })).toBeTruthy()
})
it('opens a saved game without restart and resumes the same score game from the left menu', async () => {
  fake.profile = profile(); fake.list.mockResolvedValue([game()])
  render(<App />)
  fireEvent.click(menu('スコアアタック'))
  const old = screen.getByTestId('score').getAttribute('data-instance')
  fireEvent.click(menu('履歴'))
  expect(screen.getByTestId('score').getAttribute('data-suspended')).toBe('true')
  fireEvent.click(await screen.findByRole('button', { name: /0点/ }))
  expect(screen.getByText('保存結果 10回 0点')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '練習に戻る' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'もう一度' })).toBeNull()
  fireEvent.click(menu('履歴に戻る'))
  fireEvent.click(screen.getByRole('button', { name: /0点/ }))
  fireEvent.click(menu('スコアアタック'))
  expect(menu('スコアアタック').getAttribute('aria-current')).toBe('page')
  expect(screen.getByTestId('score').getAttribute('data-instance')).toBe(old)
  expect(screen.getByTestId('score').getAttribute('data-suspended')).toBe('false')
})
it('pauses the same practice instance during history and resumes it on return', async () => {
  fake.profile = profile()
  render(<App />)
  fireEvent.click(menu('ガイド練習'))
  const instance = screen.getByTestId('guided').getAttribute('data-instance')
  fireEvent.click(menu('履歴'))
  await screen.findByText('保存したゲームはまだありません。')
  expect(screen.getByTestId('guided').getAttribute('data-suspended')).toBe('true')
  fireEvent.click(menu('ガイド練習'))
  expect(screen.getByTestId('guided').getAttribute('data-instance')).toBe(instance)
  expect(screen.getByTestId('guided').getAttribute('data-suspended')).toBe('false')
})
it.each(['identity', 'environment'])('discards a pending read after an %s switch', async kind => {
  fake.profile = profile()
  let resolveOld!: (games: SavedScoreAttackGame[]) => void
  fake.list.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce([])
  const view = render(<App />)
  fireEvent.click(menu('履歴'))
  expect(screen.getByText('履歴を読み込み中')).toBeTruthy()
  fake.profile = kind === 'identity' ? profile(userB) : { ...profile(), environment: 'local' }; view.rerender(<App />)
  await screen.findByText('保存したゲームはまだありません。')
  await act(async () => resolveOld([game()]))
  await waitFor(() => expect(screen.queryByRole('button', { name: /0点/ })).toBeNull())
  expect(fake.list).toHaveBeenLastCalledWith(fake.profile.id)
})
it('retries a failed list request and lets the left menu replace history with the gallery', async () => {
  fake.profile = profile(); fake.list.mockRejectedValueOnce(Error('履歴取得失敗')).mockResolvedValueOnce([])
  render(<App />)
  fireEvent.click(menu('履歴'))
  await screen.findByText('履歴取得失敗')
  fireEvent.click(menu('読み直す'))
  await screen.findByText('保存したゲームはまだありません。')
  fireEvent.click(menu('GTR完成形例'))
  expect(screen.queryByRole('heading', { name: /履歴/ })).toBeNull()
  expect(screen.getByText('完成形ページ')).toBeTruthy()
})

it('retains the existing modal presentation and its close action', async () => {
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
  const onClose = vi.fn()
  render(<ScoreAttackHistory userId={userA} onClose={onClose} />)
  await screen.findByText('保存したゲームはまだありません。')
  expect(showModal).toHaveBeenCalledOnce()
  fireEvent.click(menu('閉じる'))
  expect(onClose).toHaveBeenCalledOnce()
})

it('passes a history favorite change to the paused result for the same account', async () => {
  fake.profile = profile(); const saved = game(); fake.list.mockResolvedValue([saved]); fake.favorite.mockResolvedValue({ ...saved, favorite: true })
  const view = render(<App />)
  fireEvent.click(menu('スコアアタック'))
  fireEvent.click(menu('履歴'))
  fireEvent.click(await screen.findByRole('button', { name: '☆ お気に入り' }))
  await screen.findByRole('button', { name: '★ お気に入り' })
  fireEvent.click(menu('スコアアタック'))
  expect(screen.getByTestId('score').getAttribute('data-favorite')).toBe('true')
  fake.profile = profile(userB); view.rerender(<App />)
  expect(screen.getByTestId('score').getAttribute('data-favorite')).toBe('undefined')
})

it('starts a fresh guided game from history, resumes it after browsing, and clears its sequence on a normal start', async () => {
  fake.profile = profile(); fake.list.mockResolvedValue([game()])
  render(<App />)
  fireEvent.click(menu('ガイド練習'))
  const previous = screen.getByTestId('guided').getAttribute('data-instance')
  fireEvent.click(menu('履歴'))
  fireEvent.click(await screen.findByRole('button', { name: /0点/ }))
  fireEvent.click(menu('このツモで練習'))
  const practice = screen.getByTestId('guided')
  expect(practice.getAttribute('data-sequence')).toBe(JSON.stringify([['red', 'blue'], ['green', 'yellow']]))
  expect(practice.getAttribute('data-instance')).not.toBe(previous)
  expect(practice.getAttribute('data-suspended')).toBe('false')
  expect(menu('ガイド練習').getAttribute('aria-current')).toBe('page')
  const instance = practice.getAttribute('data-instance')
  fireEvent.click(menu('履歴'))
  await screen.findByRole('button', { name: /0点/ })
  fireEvent.click(menu('ガイド練習'))
  expect(screen.getByTestId('guided').getAttribute('data-instance')).toBe(instance)
  expect(screen.getByTestId('guided').getAttribute('data-sequence')).toBe(practice.getAttribute('data-sequence'))
  fireEvent.click(menu('ホーム'))
  fireEvent.click(menu('ガイド練習'))
  expect(screen.getByTestId('guided').getAttribute('data-sequence')).toBeNull()
})
