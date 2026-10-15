import type { TailShape } from '../../game/advisor/TailPlanner'
import type { PuyoGrid } from '../../game/core/ChainSimulator'
import { PuyoColor } from '../../game/core/types'
import { GALLERY_SHAPES, GTR_COMPLETION_GALLERY, type GalleryExample } from '../../game/guide/GTRCompletionGallery'

export const GALLERY_DISPLAY_LABELS: Readonly<Record<TailShape, string>> = {
  Y: '形1', zabuton: '形2', L: '形3',
}

const skeletonRows: Readonly<Record<TailShape, readonly string[]>> = {
  Y: ['......', 'ABC...', 'AABCC.', 'BBC...'],
  zabuton: ['......', 'ABC...', 'AABCCC', 'BB....'],
  L: ['......', 'ABC...', 'AABC..', 'BBCC..'],
}
const colors: Record<string, PuyoColor> = { A: PuyoColor.RED, B: PuyoColor.GREEN, C: PuyoColor.BLUE }

/** Display-only excerpts: missing supports and continuations make these unsuitable for simulation. */
export const GALLERY_SHAPE_GRIDS: Readonly<Record<TailShape, PuyoGrid>> = Object.fromEntries(
  GALLERY_SHAPES.map(shape => {
    const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    skeletonRows[shape].forEach((row, index) => {
      Array.from(row).forEach((symbol, x) => { grid[9 + index][x] = colors[symbol] ?? null })
    })
    return [shape, grid]
  }),
) as Record<TailShape, PuyoGrid>

export function galleryExampleLabel(example: GalleryExample): string {
  const index = GTR_COMPLETION_GALLERY.filter(item => item.shape === example.shape).findIndex(item => item.id === example.id)
  return `${GALLERY_SHAPES.indexOf(example.shape) + 1}-${index + 1}`
}
