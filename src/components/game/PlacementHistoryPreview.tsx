import type { PairColors } from '../../game/core/PairSequence'
import { useMemo, useState } from 'react'
import type { ScoreAttackSnapshot } from '../../game/scoreAttack/types'
import { getPracticeSequence } from '../../game/scoreAttack/practiceSequence'
import { encodeBoard, replayPlacements } from '../../game/scoreAttack/placementHistory'
import { getPlacementPreviewPairs } from '../../game/scoreAttack/placementPreview'
import NextPairPreview from './NextPairPreview'
import GalleryBoard from '../gallery/GalleryBoard'

function Steps({ snapshot }: { snapshot: ScoreAttackSnapshot }) {
  const moves = snapshot.moves!, count = moves.length / 3
  const [step, setStep] = useState(0)
  const valid = useMemo(() => {
    try {
      return encodeBoard(replayPlacements(moves)) === encodeBoard(snapshot.grid)
    } catch { return false }
  }, [moves, snapshot.grid])
  const result = useMemo(() => valid ? replayPlacements(moves, step) : null, [valid, moves, step])
  const pairs = useMemo(() => valid ? getPlacementPreviewPairs(snapshot, step) : null, [valid, snapshot, step])
  if (!result || !pairs) return <p role="alert">構築手順を再現できませんでした。</p>
  return <div className="flex flex-col items-center gap-3">
    <div className="flex items-start justify-center gap-4" aria-label="手順の盤面と次の組">
      <GalleryBoard grid={result} size={18} fromRow={0} pair={pairs.current} />
      <NextPairPreview next={pairs.next} nextNext={pairs.nextNext} />
    </div>
    <p aria-live="polite">{step} / {count}手</p>
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" disabled={step === 0} onClick={() => setStep(old => old - 1)} className="border px-3 py-2 disabled:opacity-40">前の手</button>
      <button type="button" disabled={step === count} onClick={() => setStep(old => old + 1)} className="border px-3 py-2 disabled:opacity-40">次の手</button>
    </div>
  </div>
}
export default function PlacementHistoryPreview({ snapshot, onPractice }: { snapshot: ScoreAttackSnapshot; onPractice?: (sequence: readonly PairColors[]) => void }) {
  const sequence = useMemo(() => onPractice ? getPracticeSequence(snapshot) : null, [snapshot, onPractice])
  const [open, setOpen] = useState(false)
  if (snapshot.moves === undefined) return null
  return <div className="mt-5 border-t border-[#6f648d] pt-4">
    <div className="flex flex-wrap gap-3">
    <button type="button" aria-expanded={open} onClick={() => setOpen(old => !old)} className="border border-[#6f648d] px-3 py-2">
      {open ? '手順を閉じる' : '手順を見る'}
    </button>
    {onPractice && <button type="button" disabled={!sequence}
      onClick={() => { if (sequence) onPractice(sequence) }}
      className="border border-[#6f648d] bg-[#b5a8ff] px-3 py-2 text-[#0c0a14] disabled:opacity-40">
      このツモで練習
    </button>}
    </div>
    {open && <div className="mt-4"><Steps snapshot={snapshot} /></div>}
  </div>
}
