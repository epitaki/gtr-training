import { PuyoColor } from '../core/types'
import type { PuyoGrid } from '../core/ChainSimulator'
import type { TailShape } from '../advisor/TailPlanner'
import { GTRDetector } from '../gtr/GTRPatterns'

export interface GalleryExample {
  id: string
  shape: TailShape
  title: string
  /** The current GTR foundation score for this exact board. */
  score: number
  /** Four rows from top to bottom; dots are empty cells. */
  rows: readonly string[]
}

export const GALLERY_SHAPES: readonly TailShape[] = ['Y', 'zabuton', 'L']
export const GALLERY_SHAPE_LABELS: Readonly<Record<TailShape, string>> = {
  Y: 'Y字', zabuton: '座布団', L: 'L字',
}

type GalleryPattern = readonly string[]
const patterns: Readonly<Record<TailShape, readonly GalleryPattern[]>> = {
  Y: [
    ['.....A', 'ABCDDA', 'AABCCD', 'BBCAAD'],
    ['.....A', 'ABCDDA', 'AABCCD', 'BBCDAA'],
    ['....AD', 'ABC.DA', 'AABCCA', 'BBCDDA'],
    ['....DD', 'ABC.AD', 'AABCCA', 'BBCDAA'],
    ['....AD', 'ABC.AD', 'AABCCA', 'BBCDDA'],
    ['....AA', 'ABC.DA', 'AABCCD', 'BBCDDA'],
    ['....AA', 'ABC.DD', 'AABCCD', 'BBCADA'],
    ['....D.', 'ABCDAD', 'AABCCA', 'BBCDAA'],
    ['....A.', 'ABCDAD', 'AABCCA', 'BBCDDA'],
    ['....D.', 'ABCAAD', 'AABCCA', 'BBCDDA'],
  ],
  zabuton: [
    ['.....A', 'ABCAAD', 'AABCCC', 'BBADDD'],
    ['.....D', 'ABCAAA', 'AABCCC', 'BBDDDA'],
    ['....DA', 'ABC.DA', 'AABCCC', 'BBDDAA'],
    ['....DA', 'ABC.AA', 'AABCCC', 'BBDDDA'],
    ['....DD', 'ABC.AA', 'AABCCC', 'BBDDAA'],
    ['....AD', 'ABC.AA', 'AABCCC', 'BBDDDA'],
    ['....AD', 'ABC.DD', 'AABCCC', 'BBAADA'],
    ['....D.', 'ABCDAA', 'AABCCC', 'BBDDAA'],
    ['....A.', 'ABCDDA', 'AABCCC', 'BBDDAA'],
    ['....D.', 'ABCDDA', 'AABCCC', 'BBDAAA'],
  ],
  L: [
    ['.....A', 'ABCDAA', 'AABCDD', 'BBCCDA'],
    ['....A.', 'ABCDAA', 'AABCDD', 'BBCCDA'],
    ['...D.D', 'ABCA.D', 'AABCDA', 'BBCCAA'],
    ['...A.D', 'ABCD.D', 'AABCAA', 'BBCCDA'],
    ['...D.A', 'ABCD.A', 'AABCDD', 'BBCCAA'],
    ['...D.A', 'ABCA.D', 'AABCDD', 'BBCCAA'],
    ['...AD.', 'ABCDD.', 'AABCAA', 'BBCCDA'],
    ['...DA.', 'ABCDA.', 'AABCDA', 'BBCCDA'],
    ['...DA.', 'ABCAD.', 'AABCDA', 'BBCCDA'],
    ['...DD.', 'ABCAD.', 'AABCAD', 'BBCCAA'],
  ],
}

const colors: Record<'A' | 'B' | 'C' | 'D', PuyoColor> = {
  A: PuyoColor.RED,
  B: PuyoColor.GREEN,
  C: PuyoColor.BLUE,
  D: PuyoColor.YELLOW,
}

export const GTR_COMPLETION_GALLERY: readonly GalleryExample[] = GALLERY_SHAPES.flatMap(shape =>
  patterns[shape].map((rows, index) => ({
    id: `${shape}-${String(index + 1).padStart(2, '0')}`,
    shape,
    title: `${GALLERY_SHAPE_LABELS[shape]} ${index + 1}`,
    score: GTRDetector.detectGTR(gridFromRows(rows)).totalScore,
    rows,
  })),
)

/** Expand a teaching diagram into the game's 13 × 6 field. */
export function getGalleryGrid(example: GalleryExample): PuyoGrid {
  return gridFromRows(example.rows)
}

function gridFromRows(rows: readonly string[]): PuyoGrid {
  const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  for (let row = 0; row < 4; row++) {
    for (let x = 0; x < 6; x++) {
      const symbol = rows[row][x]
      if (symbol !== '.') grid[9 + row][x] = colors[symbol as keyof typeof colors]
    }
  }
  return grid
}
