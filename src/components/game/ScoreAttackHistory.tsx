import type { PairColors } from '../../game/core/PairSequence'
import { useEffect, useMemo, useRef, useState } from 'react'
import { decodeScoreAttackGame } from '../../game/scoreAttack/storageCodec'
import { listScoreAttackGames, setScoreAttackFavorite, type SavedScoreAttackGame } from '../../lib/scoreAttackHistory'
import ScoreAttackResults from './ScoreAttackResults'

export default function ScoreAttackHistory({ userId, onClose, onChanged = () => {}, presentation = 'dialog', returnLabel = '閉じる', onPractice }: {
  onPractice?: (sequence: readonly PairColors[]) => void
  userId: string; onClose: () => void; onChanged?: (game: SavedScoreAttackGame) => void
  presentation?: 'dialog' | 'page'; returnLabel?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [games, setGames] = useState<SavedScoreAttackGame[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const selectedGame = games.find(game => game.id === selected)
  const selectedState = useMemo(() => selectedGame ? decodeScoreAttackGame(selectedGame.data) : null, [selectedGame])
  useEffect(() => {
    const dialog = dialogRef.current
    if (presentation === 'dialog') dialog?.showModal()
    if (presentation === 'dialog') closeRef.current?.focus()
    else headingRef.current?.focus()
    return () => { dialog?.close(); generation.current++ }
  }, [presentation])
  useEffect(() => {
    const version = ++generation.current
    setGames([]); setSelected(null); setLoading(true); setError(null); setBusy(null)
    void listScoreAttackGames(userId).then(next => {
      if (version === generation.current) { setGames(next); setLoading(false) }
    }, caught => { if (version === generation.current) { setError(caught instanceof Error ? caught.message : '履歴を読めませんでした'); setLoading(false) } })
    return () => { generation.current++ }
  }, [userId, revision])
  const favorite = async (game: SavedScoreAttackGame) => {
    if (busy) return
    const version = generation.current
    setBusy(game.id); setError(null)
    try {
      const updated = await setScoreAttackFavorite(game.id, !game.favorite, userId)
      if (version === generation.current) { setGames(old => old.map(item => item.id === updated.id ? updated : item)); onChanged(updated) }
    } catch (caught) { if (version === generation.current) setError(caught instanceof Error ? caught.message : 'お気に入りを更新できませんでした') }
    finally { if (version === generation.current) setBusy(null) }
  }
  const content = <>
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 ref={headingRef} tabIndex={-1} id="score-history-title" className="text-xl">{presentation === 'page' ? '履歴' : '保存したゲーム'} {loading ? '' : `(${games.length}/100)`}</h2>
      {presentation === 'dialog' && <button ref={closeRef} type="button" onClick={onClose} className="border border-[#6f648d] px-3 py-2">{returnLabel}</button>}
    </div>
    {presentation === 'page' && <p className="mb-4 text-sm text-[#c4bfd3]">保存したスコアアタックのゲームを選ぶと、結果と手順を確認できます。</p>}
    {loading && <p role="status">履歴を読み込み中</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(old => old + 1)} className="my-3 border px-3 py-2">読み直す</button></div>}
    {!loading && !selectedGame && <>
      <p className="mb-4 text-sm text-[#c4bfd3]">新しい順に表示しています。100件を超えると、お気に入り以外を古い順に入れ替えます。</p>
      {!games.length && !error && <p>保存したゲームはまだありません。</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {games.map(game => <li key={game.id} className="border border-[#6f648d] bg-[#211d33] p-3">
          <button type="button" onClick={() => setSelected(game.id)} className="block w-full text-left">
            <span className="block text-xs text-[#c4bfd3]">{new Date(game.createdAt).toLocaleString('ja-JP')}</span>
            <span className="mt-2 block text-xl text-[#ffe99b]">{game.totalScore}点</span>
          </button>
          <button type="button" aria-pressed={game.favorite} disabled={!!busy} onClick={() => void favorite(game)}
            className="mt-3 border border-[#6f648d] px-3 py-2 text-sm disabled:opacity-50">{game.favorite ? '★ お気に入り' : '☆ お気に入り'}</button>
        </li>)}
      </ul>
    </>}
    {selectedGame && selectedState && <ScoreAttackResults key={selectedGame.id} state={selectedState} onPractice={onPractice}
      onExit={() => setSelected(null)} exitLabel="履歴に戻る" onRetry={() => {}} />}
  </>
  return presentation === 'page' ? <section aria-labelledby="score-history-title" className="mx-auto max-w-5xl border border-[#6f648d] bg-[#171426] p-4 text-white sm:p-6">{content}</section> :
    <dialog ref={dialogRef} aria-labelledby="score-history-title"
      onCancel={event => { event.preventDefault(); onClose() }}
      className="w-[min(96vw,960px)] max-h-[94dvh] overflow-auto border border-[#6f648d] bg-[#171426] p-4 text-white backdrop:bg-black/80 sm:p-6">{content}</dialog>
}
