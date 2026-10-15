import type { PairColors } from '../../game/core/PairSequence'
import { useEffect, useRef, useState } from 'react'
import type { ScoreAttackRound, ScoreAttackState } from '../../game/scoreAttack/types'
import GalleryBoard from '../gallery/GalleryBoard'
import { createGTREvaluationGrid } from '../../game/gtr/EvaluationRange'
import FoundationChainPreview from './FoundationChainPreview'
import PlacementHistoryPreview from './PlacementHistoryPreview'
import { scoreBreakdown } from '../../game/scoreAttack/scoreBreakdown'

function EvaluationDialog({ round, number, onClose, onPractice }: { round: ScoreAttackRound; number: number; onClose: () => void; onPractice?: (sequence: readonly PairColors[]) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const analysis = round.evaluation!.analysis
  const score = analysis.score
  const items = scoreBreakdown(score)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    closeRef.current?.focus()
    return () => dialog?.close()
  }, [])
  return <dialog ref={dialogRef} aria-labelledby="score-attack-detail-title"
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === dialogRef.current) onClose() }}
    className="w-[min(96vw,640px)] max-h-[94dvh] overflow-auto border border-[#6f648d] bg-[#171426] p-5 text-white shadow-pixel backdrop:bg-black/80">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="score-attack-detail-title" className="text-xl">{number}回目の評価</h2>
      <button ref={closeRef} type="button" onClick={onClose} className="border border-[#6f648d] px-3 py-2">戻る</button>
    </div>
    <div className="mt-5 flex flex-wrap justify-center gap-6">
      <FoundationChainPreview grid={round.snapshot.grid} />
      <div className="min-w-0 flex-1 basis-64">
        <p className="mt-3 text-3xl text-[#ffe99b]">{score.totalScore}点</p>
        {items.length > 0 && <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {items.map(item => <div key={item.label} className="contents"><dt>{item.label}</dt><dd>{item.points}点</dd></div>)}
        </dl>}
      </div>
    </div>
    <PlacementHistoryPreview snapshot={round.snapshot} onPractice={onPractice} />
  </dialog>
}

export default function ScoreAttackResults({ state, onRestart, onExit, onRetry, exitLabel = '終了', onPractice }: {
  onPractice?: (sequence: readonly PairColors[]) => void
  state: ScoreAttackState; onRestart?: () => void; onExit: () => void; onRetry: () => void; exitLabel?: string
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scoreRefs = useRef<Array<HTMLButtonElement | null>>([])
  const hasErrors = state.rounds.some(round => round.error)
  useEffect(() => { headingRef.current?.focus() }, [])
  const closeDetail = () => {
    const button = selected === null ? null : scoreRefs.current[selected]
    setSelected(null)
    requestAnimationFrame(() => button?.focus({ preventScroll: true }))
  }
  return <section aria-label="スコアアタックの結果" className="mx-auto max-w-[800px] pixel-panel p-5 sm:p-8">
    <p className="text-sm text-[#b5a8ff]">SCORE ATTACK</p>
    <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl outline-none">TOTAL SCORE</h1>
    <p aria-live="polite" className="mt-4 text-4xl text-[#ffe99b]">{state.totalScore === null ? '採点中' : `${state.totalScore}点`}</p>
    <p className="mt-5 text-sm text-[#c4bfd3]">GTRの図を選ぶと、消える順番と評価を確認できます。</p>
    <div aria-label="10回のGTRと点数一覧" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {state.rounds.map((round, index) => <button key={index} ref={button => { scoreRefs.current[index] = button }} type="button" disabled={!round.evaluation}
        aria-label={`${index + 1}回目の評価を開く${round.evaluation ? `、${round.evaluation.analysis.score.totalScore}点` : ''}`}
        onClick={() => setSelected(index)}
        className="flex min-w-0 flex-col items-center gap-3 border border-[#6f648d] bg-[#211d33] px-2 py-4 text-xl text-[#ffe99b] hover:border-[#b5a8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5a8ff] disabled:opacity-50">
        <GalleryBoard grid={createGTREvaluationGrid(round.snapshot.grid)} size={15} />
        <span>{round.evaluation ? `${round.evaluation.analysis.score.totalScore}点` : round.error ? '—' : '…'}</span>
      </button>)}
    </div>
    {hasErrors && <div role="alert" className="mt-5 text-sm text-[#ff9aa5]">
      <p>一部の採点を完了できませんでした。盤面は保存されています。</p>
      <button type="button" onClick={onRetry} className="mt-3 border border-[#6f648d] px-3 py-2 text-white">採点をやり直す</button>
    </div>}
    <div className="mt-8 flex flex-wrap gap-3">
      {onRestart && <button type="button" onClick={onRestart} className="bg-[#b5a8ff] px-4 py-3 text-[#0c0a14]">もう一度</button>}
      <button type="button" onClick={onExit} className="border border-[#6f648d] px-4 py-3">{exitLabel}</button>
    </div>
    {selected !== null && state.rounds[selected]?.evaluation && <EvaluationDialog onPractice={onPractice}
      round={state.rounds[selected]} number={selected + 1} onClose={closeDetail} />}
  </section>
}
