import { describe, expect, it } from 'vitest'
import { FIELD_CONFIG, LAYOUT_GUIDED, NEXT_AREA_CONFIG } from './VisualConfig'

describe('guided layout', () => {
  it('field, NEXT sidebar, and coach panel do not overlap', () => {
    const fieldRight = LAYOUT_GUIDED.FIELD_X + FIELD_CONFIG.COLS * FIELD_CONFIG.CELL_SIZE
    const nextLeft = fieldRight + 20
    const nextRight = nextLeft + NEXT_AREA_CONFIG.AREA_WIDTH
    const guideLeft = LAYOUT_GUIDED.GUIDE_X - LAYOUT_GUIDED.GUIDE_WIDTH / 2
    const guideRight = LAYOUT_GUIDED.GUIDE_X + LAYOUT_GUIDED.GUIDE_WIDTH / 2

    expect(nextLeft).toBeGreaterThan(fieldRight)
    expect(guideLeft).toBeGreaterThan(nextRight)
    expect(guideRight).toBeLessThanOrEqual(LAYOUT_GUIDED.CANVAS_WIDTH - 20)
  })
})
