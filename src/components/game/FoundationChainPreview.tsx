import { useEffect, useMemo, useRef, useState } from 'react'
import type { PuyoGrid } from '../../game/core/ChainSimulator'
import { createGTRChainPreview } from '../../game/gtr/GTRChainPreview'
import { ResultChainPlayback, type ResultChainFrame } from '../../game/rendering/ResultChainPlayback'
import GalleryBoard from '../gallery/GalleryBoard'

export default function FoundationChainPreview({ grid }: { grid: PuyoGrid }) {
  const preview = useMemo(() => createGTRChainPreview(grid), [grid])
  const [frame, setFrame] = useState<ResultChainFrame | null>(null)
  const [revision, setRevision] = useState(0)
  const explicitReplay = useRef(false)

  useEffect(() => {
    if (!preview.trace) { setFrame(null); return }
    const starterId = preview.starter ? preview.trace.initial.ids[preview.starter.y][preview.starter.x] ?? undefined : undefined
    const playback = new ResultChainPlayback(preview.trace, { frame: setFrame }, starterId)
    let raf: number | null = null, last: number | null = null
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const autoPlay = explicitReplay.current || !reduced
    const tick = (now: number) => {
      raf = null
      if (document.hidden || playback.isFinished) { last = null; return }
      if (last !== null) playback.update(now - last)
      last = now
      if (!playback.isFinished) raf = requestAnimationFrame(tick)
    }
    const start = () => { if (autoPlay && !document.hidden && !playback.isFinished && raf === null) raf = requestAnimationFrame(tick) }
    const visibility = () => {
      if (document.hidden) { if (raf !== null) cancelAnimationFrame(raf); raf = null; last = null }
      else start()
    }
    start()
    document.addEventListener('visibilitychange', visibility)
    return () => { if (raf !== null) cancelAnimationFrame(raf); playback.cancel(); document.removeEventListener('visibilitychange', visibility) }
  }, [preview, revision])

  return <div className="flex flex-col items-center gap-3" aria-label="土台の消去アニメーション">
    <GalleryBoard grid={frame?.grid ?? preview.initialGrid} size={36} fading={frame?.fading}
      alpha={frame?.alpha} starter={frame ? frame.starterPosition : preview.starter} />
    <p role="status" className="sr-only">{frame?.chainIndex ? `${frame.chainIndex}連鎖目` : frame?.phase === 'complete' ? `${preview.trace?.result.chainCount ?? 0}連鎖・余り${frame.grid.flat().filter(color => color !== null).length}個` : preview.trace ? '再生待ち' : preview.unavailableReason}</p>
    <button type="button" disabled={!preview.trace} onClick={() => { explicitReplay.current = true; setRevision(old => old + 1) }}
      title={preview.trace ? undefined : preview.unavailableReason ?? undefined}
      className="border border-[#6f648d] px-3 py-2 disabled:opacity-50">もう一度再生</button>
  </div>
}
