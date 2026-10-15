import { describe, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({}))
import { FIELD_CONFIG, LAYOUT_GUIDED, NEXT_AREA_CONFIG } from './VisualConfig'
import { getNextPreviewLayout } from './NextPreview'

describe('guided layout', () => {
  it('configured guide panel leaves room for the NEXT sidebar and fits the canvas', () => {
    const fieldRight = LAYOUT_GUIDED.FIELD_X + FIELD_CONFIG.COLS * FIELD_CONFIG.CELL_SIZE
    const nextLeft = fieldRight + 20
    const nextRight = nextLeft + NEXT_AREA_CONFIG.AREA_WIDTH
    const guideLeft = LAYOUT_GUIDED.GUIDE_X - LAYOUT_GUIDED.GUIDE_WIDTH / 2
    const guideRight = LAYOUT_GUIDED.GUIDE_X + LAYOUT_GUIDED.GUIDE_WIDTH / 2

    const layout = getNextPreviewLayout(nextLeft, LAYOUT_GUIDED.FIELD_Y)
    const halfPuyo = NEXT_AREA_CONFIG.CELL_SIZE / 2
    expect(NEXT_AREA_CONFIG.CELL_SIZE).toBe(FIELD_CONFIG.CELL_SIZE)
    for (const [index, pair] of [layout.next, layout.nextNext].entries()) {
      const rowTop = layout.baseY + index * layout.rowHeight
      const rowLeft = layout.baseX + (index ? NEXT_AREA_CONFIG.STEP_OFFSET : 0)
      const rowRight = layout.baseX + layout.width - (index ? 0 : NEXT_AREA_CONFIG.STEP_OFFSET)
      expect(pair.x - halfPuyo).toBeGreaterThan(rowLeft)
      expect(pair.x + halfPuyo).toBeLessThan(rowRight)
      expect(pair.labelY + NEXT_AREA_CONFIG.LABEL_HEIGHT).toBeLessThanOrEqual(pair.subY - halfPuyo)
      expect(pair.mainY + halfPuyo).toBeLessThan(rowTop + layout.rowHeight)
    }
    expect(layout.statusY).toBeGreaterThan(layout.baseY + layout.height)
    expect(layout.statusY + 64).toBeLessThanOrEqual(LAYOUT_GUIDED.CANVAS_HEIGHT)
    expect(guideLeft).toBeGreaterThan(nextRight)
    expect(guideRight).toBeLessThanOrEqual(LAYOUT_GUIDED.CANVAS_WIDTH - 20)
  })
})
