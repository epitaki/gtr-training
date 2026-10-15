import { describe, expect, it } from 'vitest'
import { GuideManager } from './GuideManager'
import { PuyoColor, type Field } from '../core/types'

const foldField = (): Field => {
  const grid = Array.from(
    { length: 13 },
    () => Array<PuyoColor | null>(6).fill(null),
  )
  const A = PuyoColor.BLUE
  const B = PuyoColor.GREEN
  grid[12][0] = B
  grid[12][1] = B
  grid[11][0] = A
  grid[11][1] = A
  grid[11][2] = B
  grid[10][0] = A
  grid[10][1] = B
  return { grid, width: 6, height: 13 }
}

const guidedField = (): Field => {
  const field = foldField()
  const C = PuyoColor.RED
  const D = PuyoColor.YELLOW
  field.grid[12][2] = C
  field.grid[12][3] = D
  field.grid[12][4] = D
  field.grid[11][3] = C
  field.grid[11][4] = C
  field.grid[10][2] = C
  return field
}

describe('GuideManager', () => {
  it('shows actual individual support colors, and neutral placeholders for missing supports', () => {
    const manager = new GuideManager()
    const field = foldField()
    field.grid[12][3] = PuyoColor.GREEN
    field.grid[12][4] = PuyoColor.RED
    manager.updateState(field, false)
    manager.setSuggestedTailPlan('Y', PuyoColor.BLUE, field)
    const guide = manager.getGuideContent()
    expect(guide.pattern![2].slice(3)).toEqual(['S3', 'S4'])
    expect(guide.colorMap).toEqual({ C: PuyoColor.BLUE, S3: PuyoColor.GREEN, S4: PuyoColor.RED })
    field.grid[12][4] = null
    expect(manager.getGuideContent()).toEqual(guide)
    manager.setSuggestedTailPlan('zabuton', PuyoColor.BLUE, field)
    expect(manager.getGuideContent().pattern![2]).toEqual(['B', 'B', '?', 'S3', '?', '?'])
    expect(manager.getGuideContent().description).toContain('今回の案内の支持色は未確定')
    expect(manager.getGuideContent().description).toContain('完成見本の配色は教材例')
    manager.setSuggestedTailPlan('Y', PuyoColor.BLUE)
    expect(manager.getGuideContent().pattern![2].slice(3)).toEqual(['?', '?'])
  })

  it.each(['Y', 'zabuton'] as const)('describes missing %s supports without referring to an absent grey marker', shape => {
    const manager = new GuideManager()
    const field = foldField()
    manager.updateState(field, false)
    manager.setSuggestedTailPlan(shape, PuyoColor.RED, field)
    const missing = manager.getGuideContent().description!
    expect(missing).toContain('今回の案内の支持色は未確定')
    expect(missing).toContain('完成見本の配色は教材例')
    expect(missing).not.toContain('灰色')
    expect(missing).not.toContain('?')

    const columns = shape === 'Y' ? [3, 4] : [2, 3, 4, 5]
    for (const column of columns) field.grid[12][column] = PuyoColor.YELLOW
    manager.setSuggestedTailPlan(shape, PuyoColor.RED, field)
    const placed = manager.getGuideContent().description!
    expect(placed).not.toContain('支持色は未確定')
    expect(placed).not.toContain('灰色')
  })

  it('does not describe support colors for an L guide with no support cells', () => {
    const manager = new GuideManager()
    const field = foldField()
    manager.updateState(field, false)
    manager.setSuggestedTailPlan('L', PuyoColor.RED, field)
    expect(manager.getGuideContent().description).not.toContain('支持色は未確定')
    expect(manager.getGuideContent().description).not.toContain('教材例')
  })

  it('尾候補がなくなったときに以前の形を表示し続けない', () => {
    const manager = new GuideManager()
    manager.updateState(foldField(), false)
    manager.setSuggestedTailPlan('L', PuyoColor.RED)
    manager.setSuggestedTailPlan(undefined, undefined)
    expect(manager.getGuideContent()).toEqual({
      comment: '連鎖尾を伸ばそう!',
      description: '折り返しからの消去順を確認して、つながる配置を探します。',
    })
  })

  it('Y字と3連鎖の共通目標が未完成なら連鎖尾ガイドを続ける', () => {
    const manager = new GuideManager()
    manager.updateState(foldField(), false)

    expect(manager.getGuideContent().comment).toBe('Y字形の連鎖尾を作ろう!')
  })

  it('共通目標が完成したときだけ完成ガイドへ進む', () => {
    const manager = new GuideManager()
    manager.updateState(guidedField(), true)

    expect(manager.getGuideContent().comment).toBe('GTRの基本形と連鎖尾ができました!')
    expect(manager.getGuideContent().description).toContain('下3段')
    expect(manager.getGuideContent().description).toContain('4段目の使用は必要最小限')
    expect(manager.getGuideContent().description).toContain('5連鎖')
    expect(manager.getGuideContent().description).not.toContain('7連鎖')
  })

  it('巻き戻した盤面では完成状態から前のガイドへ戻る', () => {
    const manager = new GuideManager()
    manager.updateState(guidedField(), true)
    manager.updateState(foldField(), false)

    expect(manager.getGuideContent().comment).toBe('Y字形の連鎖尾を作ろう!')
  })

  it('推薦された座布団・L字へ連鎖尾ガイドを切り替える', () => {
    const manager = new GuideManager()
    manager.updateState(foldField(), false)

    manager.setSuggestedTailPlan('zabuton', PuyoColor.RED)
    expect(manager.getGuideContent().comment).toBe('座布団形の連鎖尾を作ろう!')
    expect(manager.getGuideContent().colorMap).toEqual({ C: PuyoColor.RED })

    manager.setSuggestedTailPlan('L', PuyoColor.BLUE)
    expect(manager.getGuideContent().comment).toBe('L字形の連鎖尾を作ろう!')
    expect(manager.getGuideContent().colorMap).toEqual({ C: PuyoColor.BLUE })
  })
})
