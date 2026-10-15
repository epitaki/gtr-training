import type { PairColors } from '../../game/core/PairSequence'
import type { SavedScoreAttackGame } from '../../lib/scoreAttackHistory'
import ScoreAttackHistory from './ScoreAttackHistory'

export default function SavedGamesPage({ userId, checking, onLogin, onReturn, returnLabel, onChanged, onPractice }: {
  onPractice?: (sequence: readonly PairColors[]) => void
  userId?: string; checking: boolean; onLogin: () => void; onReturn: () => void; returnLabel: string; onChanged: (game: SavedScoreAttackGame) => void
}) {
  if (userId) return <ScoreAttackHistory userId={userId} onClose={onReturn} onChanged={onChanged} onPractice={onPractice} presentation="page" returnLabel={returnLabel} />
  return <section aria-labelledby="saved-games-title" className="mx-auto max-w-5xl border border-[#6f648d] bg-[#171426] p-4 text-white sm:p-6">
    <h2 id="saved-games-title" className="text-xl">履歴</h2>
    {checking ? <p role="status" className="mt-4">ログインを確認中...</p> : <>
      <p className="mt-4 text-sm text-[#c4bfd3]">保存したゲームを見るにはログインしてください。</p>
      <button type="button" onClick={onLogin} className="mt-4 border border-[#8f80b5] bg-[#332b4a] px-4 py-3">ログイン</button>
    </>}
    <button type="button" onClick={onReturn} className="ml-3 mt-4 border border-[#6f648d] px-4 py-3">{returnLabel}</button>
  </section>
}
