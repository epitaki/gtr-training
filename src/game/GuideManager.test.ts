import { describe, expect, it } from 'vitest'
import { GuideManager } from './GuideManager'
import { PuyoColor, type Field } from './types'

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
  it('Y字と3連鎖の共通目標が未完成なら連鎖尾ガイドを続ける', () => {
    const manager = new GuideManager()
    manager.updateState(foldField(), false)

    expect(manager.getGuideContent().comment).toBe('まずはY字形の連鎖尾を作ろう!')
  })

  it('共通目標が完成したときだけ完成ガイドへ進む', () => {
    const manager = new GuideManager()
    manager.updateState(guidedField(), true)

    expect(manager.getGuideContent().comment).toBe('3連鎖のGTRが完成!')
  })

  it('巻き戻した盤面では完成状態から前のガイドへ戻る', () => {
    const manager = new GuideManager()
    manager.updateState(guidedField(), true)
    manager.updateState(foldField(), false)

    expect(manager.getGuideContent().comment).toBe('まずはY字形の連鎖尾を作ろう!')
  })
})
