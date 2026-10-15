import type Phaser from 'phaser'
import { isInGTREvaluationRange } from '../gtr/EvaluationRange'
import { FIELD_CONFIG } from './VisualConfig'

/** Display-only boundary: the shared scoring predicate still owns the scope. */
export function drawEvaluationRange(scene: Phaser.Scene, fieldX: number, fieldY: number, cellSize: number): void {
  const graphics = scene.add.graphics().setDepth(1)
  graphics.lineStyle(1, 0x8d82ac, 0.7)
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const length = Math.hypot(x2 - x1, y2 - y1)
    const dx = (x2 - x1) / length, dy = (y2 - y1) / length
    for (let offset = 0; offset < length; offset += 8) {
      const end = Math.min(offset + 4, length)
      graphics.lineBetween(x1 + dx * offset, y1 + dy * offset, x1 + dx * end, y1 + dy * end)
    }
  }
  for (let y = 0; y < FIELD_CONFIG.ROWS; y++) for (let x = 0; x < FIELD_CONFIG.COLS; x++) {
    if (!isInGTREvaluationRange(x, y)) continue
    const left = fieldX + x * cellSize, top = fieldY + y * cellSize
    if (y > 0 && !isInGTREvaluationRange(x, y - 1)) edge(left, top, left + cellSize, top)
    if (x > 0 && !isInGTREvaluationRange(x - 1, y)) edge(left, top, left, top + cellSize)
    if (x + 1 < FIELD_CONFIG.COLS && !isInGTREvaluationRange(x + 1, y)) edge(left + cellSize, top, left + cellSize, top + cellSize)
    if (y + 1 < FIELD_CONFIG.ROWS && !isInGTREvaluationRange(x, y + 1)) edge(left, top + cellSize, left + cellSize, top + cellSize)
  }
}
