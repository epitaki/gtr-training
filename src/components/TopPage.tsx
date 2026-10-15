import type { GameMode } from '../App'
import { GTR_COMPLETION_GALLERY, getGalleryGrid } from '../game/guide/GTRCompletionGallery'
import GalleryBoard from './gallery/GalleryBoard'

interface TopPageProps { onSelectMode: (mode: GameMode) => void }

const homeGTRGrid = getGalleryGrid(GTR_COMPLETION_GALLERY.find(example => example.id === 'Y-01')!)

export default function TopPage({ onSelectMode }: TopPageProps) {
  return (
    <div className="mx-auto max-w-6xl font-puyo">
      <section className="relative overflow-hidden rounded-none border border-[#6f648d] bg-[#171426] px-6 py-10 shadow-pixel sm:px-10 lg:px-14 lg:py-14">

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <h1 className="text-xl font-normal leading-relaxed text-white sm:text-2xl">GTRの練習用サイトです。</h1>

          </div>

          <div className="relative mx-auto min-w-0 w-full max-w-sm" aria-hidden="true">
            <div className="relative rounded-none border border-[#6f648d] bg-[#0d0b16]/90 p-3 shadow-pixel sm:p-5">
              <div className="mb-4 flex items-center justify-between text-xs font-normal text-[#c4bfd3]">
                <span>GTR FORMATION</span>
              </div>
              <div className="flex min-w-0 justify-center">
                <GalleryBoard grid={homeGTRGrid} size={24} />
              </div>

            </div>
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => onSelectMode('guided')} className="flex min-h-28 items-center gap-4 border border-[#6f648d] bg-[#211d33] p-6 text-left text-[#f2ecff] shadow-pixel hover:border-[#b5a8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5a8ff]">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center bg-[#b5a8ff] text-2xl text-[#0c0a14]">◆</span>
          <span className="text-xl">ガイド練習</span>
          <span aria-hidden="true" className="ml-auto text-xl text-[#b5a8ff]">→</span>
        </button>
        <button type="button" onClick={() => onSelectMode('score-attack')} className="flex min-h-28 items-center gap-4 border border-[#6f648d] bg-[#211d33] p-6 text-left text-[#f2ecff] shadow-pixel hover:border-[#ffe99b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffe99b]">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center bg-[#171426] text-2xl text-[#ffe99b]">↑</span>
          <span className="text-xl">スコアアタック</span>
          <span aria-hidden="true" className="ml-auto text-xl text-[#ffe99b]">→</span>
        </button>
      </div>

    </div>
  )
}
