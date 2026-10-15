import atlasUrl from '../../assets/puyo/atlas.png?url'
import manifest from '../../assets/puyo/manifest.json'
import type { PuyoPair } from '../../game/core/types'

function Pair({ pair }: { pair: PuyoPair | null }) {
  if (!pair) return <span className="flex h-9 items-center justify-center text-[#c4bfd3]" aria-label="未記録">—</span>
  return <div className="flex flex-col items-center">
    {[pair.sub, pair.main].map((puyo, index) => {
      const frame = manifest.frames[`${puyo.color}/idle` as keyof typeof manifest.frames]
      return <span key={index} data-color={puyo.color} className="relative block h-[18px] w-[18px] overflow-hidden" aria-label={puyo.color}>
        <img src={atlasUrl} alt="" draggable={false} className="absolute max-w-none" style={{ width: 448 * 18 / 24, height: 336 * 18 / 24,
          left: -frame.rect[0] * 18 / 24, top: -frame.rect[1] * 18 / 24, imageRendering: 'pixelated' }} />
      </span>
    })}
  </div>
}
export default function NextPairPreview({ next, nextNext }: { next: PuyoPair | null; nextNext: PuyoPair | null }) {
  return <div className="relative h-36 w-[72px] shrink-0" aria-label="次の組">
    <svg className="absolute inset-0" width="72" height="144" viewBox="0 0 72 144" aria-hidden="true">
      <path d="M 0.5 0.5 H 59.5 V 72.5 H 71.5 V 143.5 H 12.5 V 71.5 H 0.5 Z" fill="#211d33" stroke="#4d4568" />
    </svg>
    <div className="absolute left-0 top-2 w-[60px] text-center" role="group" aria-label="NEXT">
      <p className="mb-2 text-[10px] text-[#f6f2ff]">NEXT</p><Pair pair={next} />
    </div>
    <div className="absolute left-3 top-20 w-[60px] text-center" role="group" aria-label="NEXT2">
      <p className="mb-2 text-[10px] text-[#f6f2ff]">NEXT2</p><Pair pair={nextNext} />
    </div>
  </div>
}
