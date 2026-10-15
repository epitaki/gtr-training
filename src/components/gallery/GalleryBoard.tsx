import atlasUrl from '../../assets/puyo/atlas.png?url'
import manifest from '../../assets/puyo/manifest.json'
import type { PuyoGrid } from '../../game/core/ChainSimulator'
import type { Position, PuyoPair } from '../../game/core/types'
import { cellMask } from '../../game/rendering/PuyoConnections'

interface GalleryBoardProps {
  grid: PuyoGrid
  size: number
  fromRow?: number
  fading?: readonly Position[]
  alpha?: number
  starter?: Position | null
  pair?: PuyoPair | null
}

/** The atlas is shared with Phaser; the gallery only crops its existing idle frames. */
export default function GalleryBoard({ grid, size, fading = [], alpha = 1, starter, pair, fromRow = 9 }: GalleryBoardProps) {
  const visible = grid.slice(fromRow, 13)
  return (
    <div className="grid rounded-none border border-[#6f648d] bg-[#090a15] p-2 shadow-pixel" style={{ gridTemplateColumns: `repeat(6, ${size}px)`, width: 'max-content' }} aria-hidden="true">
      {visible.flatMap((row, localY) => row.map((color, x) => {
        const y = localY + fromRow
        const active = pair && [pair.main, pair.sub].find(puyo => puyo.x === x && puyo.y === y)
        const frame = active ? manifest.frames[`${active.color}/idle` as keyof typeof manifest.frames]
          : color ? manifest.frames[`${color}/connect/${cellMask(grid, x, y)}` as keyof typeof manifest.frames] : null
        const isFading = fading.some(cell => cell.x === x && cell.y === y)
        const isStarter = starter?.x === x && starter.y === y
        return (
          <span key={`${y}-${x}`} className={`relative block rounded-none bg-[#211d33] ${isStarter ? 'ring-2 ring-amber-200 ring-offset-1 ring-offset-[#090a15]' : ''}`} style={{ width: size, height: size }}>
            {frame && (
              <span className="absolute inset-0 overflow-hidden">
                <img src={atlasUrl} alt="" draggable={false} className="absolute max-w-none" style={{
                  width: 448 * size / 24,
                  height: 336 * size / 24,
                  left: -frame.rect[0] * size / 24,
                  top: -frame.rect[1] * size / 24,
                  opacity: isFading ? alpha : 1,
                  imageRendering: 'pixelated',
                }} />
              </span>
            )}
          </span>
        )
      }))}
    </div>
  )
}
