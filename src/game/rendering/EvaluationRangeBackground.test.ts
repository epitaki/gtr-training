import { expect, it, vi } from 'vitest'
import type Phaser from 'phaser'
import { drawEvaluationRange } from './EvaluationRangeBackground'

it('draws only dashed segments along the grading staircase, without filling cells or adding internal borders', () => {
  const graphics = { setDepth: vi.fn().mockReturnThis(), lineStyle: vi.fn(), lineBetween: vi.fn() }
  const rectangle = vi.fn()
  drawEvaluationRange({ add: { graphics: () => graphics, rectangle } } as unknown as Phaser.Scene, 64, 80, 48)
  expect(rectangle).not.toHaveBeenCalled()
  const lines = graphics.lineBetween.mock.calls as number[][]
  expect(lines.length).toBeGreaterThan(0)
  const leftTop = ([x1, y1, x2, y2]: number[]) => y1 === 560 && y2 === 560 && x1 >= 64 && x2 <= 160
  const step = ([x1, y1, x2, y2]: number[]) => x1 === 160 && x2 === 160 && y1 >= 512 && y2 <= 560
  const rightTop = ([x1, y1, x2, y2]: number[]) => y1 === 512 && y2 === 512 && x1 >= 160 && x2 <= 352
  expect(lines.every(line => leftTop(line) || step(line) || rightTop(line))).toBe(true)
  for (const test of [leftTop, step, rightTop]) expect(lines.some(test)).toBe(true)
  expect(lines.every(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) <= 4)).toBe(true)
  const horizontal = lines.filter(leftTop).sort((a, b) => a[0] - b[0])
  expect(horizontal.slice(1).every((line, index) => line[0] > horizontal[index][2])).toBe(true)
})
