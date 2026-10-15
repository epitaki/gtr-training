import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createGTRChainPreview } from '../../game/gtr/GTRChainPreview'
import { GALLERY_SHAPES, GTR_COMPLETION_GALLERY, getGalleryGrid, type GalleryExample } from '../../game/guide/GTRCompletionGallery'
import type { TailShape } from '../../game/advisor/TailPlanner'
import { ResultChainPlayback, type ResultChainFrame } from '../../game/rendering/ResultChainPlayback'
import GalleryBoard from './GalleryBoard'
import { GALLERY_DISPLAY_LABELS, GALLERY_SHAPE_GRIDS, galleryExampleLabel } from './GalleryShapeDisplay'

interface CompletionGalleryProps { onReturn: () => void; returnLabel: string }
function GalleryDialog({ example, onClose }: { example: GalleryExample; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const preview = useMemo(() => createGTRChainPreview(getGalleryGrid(example)), [example])
  const [frame, setFrame] = useState<ResultChainFrame | null>(null)
  const [playing, setPlaying] = useState(false)
  const playbackRef = useRef<ResultChainPlayback | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const playingRef = useRef(false)
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  const stopClock = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    lastTimeRef.current = null
  }, [])

  const tick = useCallback((now: number) => {
    const playback = playbackRef.current
    if (!playingRef.current || !playback || document.hidden) { stopClock(); return }
    if (lastTimeRef.current !== null) playback.update(now - lastTimeRef.current)
    lastTimeRef.current = now
    if (playback.isFinished) {
      playingRef.current = false
      setPlaying(false)
      stopClock()
    } else {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [stopClock])

  const startClock = useCallback(() => {
    if (rafRef.current === null && !document.hidden) rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    closeRef.current?.focus()
    if (preview.trace) {
      const starterId = preview.starter ? preview.trace.initial.ids[preview.starter.y][preview.starter.x] ?? undefined : undefined
      playbackRef.current = new ResultChainPlayback(preview.trace, { frame: setFrame }, starterId)
      if (!reducedMotion.current) {
        playingRef.current = true
        setPlaying(true)
        startClock()
      }
    }
    const visibility = () => {
      if (document.hidden) stopClock()
      else if (playingRef.current) startClock()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      playingRef.current = false
      stopClock()
      playbackRef.current?.cancel()
      playbackRef.current = null
      dialog?.close()
    }
  }, [preview, startClock, stopClock])

  const replay = () => {
    playbackRef.current?.replay()
    playingRef.current = true
    setPlaying(true)
    stopClock()
    startClock()
  }

  const displayFrame = frame?.phase === 'complete' ? null : frame

  return (
    <dialog ref={dialogRef} aria-labelledby="gallery-dialog-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === dialogRef.current) onClose() }} className="w-[min(96vw,560px)] max-h-[94dvh] overflow-y-auto rounded-none border border-[#6f648d] bg-[#171426] p-0 text-white shadow-pixel backdrop:bg-[#211d33]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#6f648d] px-4 py-3 sm:px-6">
        <h2 id="gallery-dialog-title" className="text-xl font-normal">{galleryExampleLabel(example)}</h2>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-none border border-[#6f648d] px-3 py-1.5 text-sm font-normal hover:bg-[#211d33]">閉じる</button>
      </div>
      <div className="flex flex-col items-center gap-3 px-3 py-4 sm:py-6">
        {[36, 48].map(size => <div key={size} className={size === 36 ? 'sm:hidden' : 'hidden sm:block'}>
          <GalleryBoard grid={displayFrame?.grid ?? preview.initialGrid} size={size} fading={displayFrame?.fading} alpha={displayFrame?.alpha} starter={displayFrame ? displayFrame.starterPosition : preview.starter} />
        </div>)}
        <p role="status" aria-live="polite" className="min-h-6 font-normal text-[#ffe99b]">{frame?.chainIndex ? `${frame.chainIndex}連鎖目` : frame?.phase === 'complete' ? `${preview.trace?.result.chainCount ?? 0}連鎖・全消し` : playing ? '再生中' : '再生待ち'}</p>
        {preview.unavailableReason && <p role="alert">{preview.unavailableReason}</p>}
        <button type="button" disabled={!preview.trace} onClick={replay} className="rounded-none bg-[#b5a8ff] px-5 py-2.5 text-sm font-normal text-[#0c0a14] hover:bg-[#b5a8ff] disabled:opacity-50">もう一度再生</button>
      </div>
    </dialog>
  )
}

export default function CompletionGallery({ onReturn, returnLabel }: CompletionGalleryProps) {
  const [shape, setShape] = useState<TailShape>('Y')
  const [selected, setSelected] = useState<GalleryExample | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const examples = GTR_COMPLETION_GALLERY.filter(example => example.shape === shape)
  const closeDialog = useCallback(() => {
    setSelected(null)
    requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }))
  }, [])

  return (
    <section className="mx-auto max-w-6xl font-puyo">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-normal text-[#c4bfd3] sm:text-3xl">GTR完成形例</h1>
        <button type="button" onClick={onReturn} className="rounded-none border border-[#6f648d] bg-[#211d33] px-4 py-2 text-sm font-normal text-[#c4bfd3] hover:bg-[#211d33]">{returnLabel}</button>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="完成形の骨格を選ぶ">
        {GALLERY_SHAPES.map(item => (
          <button key={item} type="button" aria-label={GALLERY_DISPLAY_LABELS[item]} aria-pressed={shape === item} onClick={() => setShape(item)} className={`flex min-w-0 items-center justify-center gap-3 rounded-none border-2 p-2 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffe99b] sm:flex-col sm:gap-2 ${shape === item ? 'border-[#b5a8ff] bg-[#393052] text-white' : 'border-[#494257] bg-[#171426] text-[#c4bfd3] hover:border-[#6f648d]'}`}>
            <GalleryBoard grid={GALLERY_SHAPE_GRIDS[item]} size={18} />
            <span>{GALLERY_DISPLAY_LABELS[item]}</span>
          </button>
        ))}
      </div>
      <div role="region" aria-label={`${GALLERY_DISPLAY_LABELS[shape]}の完成形`} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
        {examples.map(example => (
          <button key={example.id} type="button" onClick={event => { openerRef.current = event.currentTarget; setSelected(example) }} className="flex flex-col items-center gap-3 rounded-none border border-[#6f648d] bg-[#211d33] p-3 text-[#c4bfd3] shadow-pixel transition hover:-translate-y-0.5 hover:border-[#6f648d] hover:shadow-pixel focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 sm:p-4">
            <GalleryBoard grid={getGalleryGrid(example)} size={36} />
            <span className="text-lg font-normal">{galleryExampleLabel(example)}</span>
          </button>
        ))}
      </div>
      {selected && <GalleryDialog key={selected.id} example={selected} onClose={closeDialog} />}
    </section>
  )
}
