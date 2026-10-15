import type { PuyoPair } from '../../game/core/types'
import { PUYO_COLORS } from '../../game/rendering/VisualConfig'
import { describePairOrientation, pairPreviewCells } from '../../game/feedback/placementDescription'

interface Props {
  pair: PuyoPair | null
  value: number | null
  onChange: (rotation: number | null) => void
}

export default function PairOrientationPicker({ pair, value, onChange }: Props) {
  return <fieldset className="min-w-0 rounded-none border border-[#6f648d] p-3">
    <legend className="px-1 text-sm font-normal text-[#b5a8ff]">期待する向き（任意）</legend>
    <p className="mb-3 text-xs text-[#c4bfd3]">実際の色で選べます。「軸」のぷよが指定した列に入ります。</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[0, 1, 2, 3].map(rotation => {
        const label = describePairOrientation(pair, rotation)
        return <button key={rotation} type="button" disabled={!pair}
          aria-label={`${label}を選ぶ`} aria-pressed={value === rotation}
          onClick={() => onChange(rotation)}
          className={`flex flex-col items-center gap-1 rounded-none border px-1 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40 ${
            value === rotation ? 'border-[#6f648d] bg-[#b5a8ff] text-[#0c0a14]' : 'border-[#6f648d] bg-[#0f0d1b] text-[#c4bfd3] hover:bg-[#211d33]'
          }`}>
          <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden="true">
            {pair && pairPreviewCells(pair, rotation).map(cell => {
              const vertical = rotation % 2 === 0
              const x = vertical ? 40 : 21 + cell.x * 38
              const y = vertical ? 21 + cell.y * 38 : 40
              return <g key={cell.main ? 'main' : 'sub'}>
                <circle cx={x} cy={y} r="17" fill={`#${PUYO_COLORS[cell.color].main.toString(16).padStart(6, '0')}`}
                  stroke={cell.main ? '#fff' : '#ffffff44'} strokeWidth={cell.main ? 2 : 1} />
                <ellipse cx={x - 5} cy={y - 3} rx="4" ry="5" fill="white" />
                <ellipse cx={x + 5} cy={y - 3} rx="4" ry="5" fill="white" />
                <circle cx={x - 4} cy={y - 3} r="2" fill="#242033" />
                <circle cx={x + 4} cy={y - 3} r="2" fill="#242033" />
                {cell.main && <text x={x} y={y + 11} textAnchor="middle" fontSize="14" fontWeight="400" fill="#242033">軸</text>}
              </g>
            })}
          </svg>
          <span>{label}</span>
        </button>
      })}
    </div>
    <button type="button" onClick={() => onChange(null)} aria-pressed={value === null}
      className={`mt-3 rounded-none border px-3 py-2 text-xs ${value === null ? 'border-[#6f648d] text-[#b5a8ff]' : 'border-[#6f648d] text-[#c4bfd3]'}`}>
      指定しない
    </button>
  </fieldset>
}
