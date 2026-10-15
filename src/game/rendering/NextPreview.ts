import type * as Phaser from 'phaser'
import type { PuyoPair } from '../core/types'
import { NEXT_AREA_CONFIG } from './VisualConfig'
import { PuyoRenderer } from './PuyoRenderer'
import { addUIText } from './UIText'

export function getNextPreviewLayout(baseX: number, baseY: number) {
  const { CELL_SIZE: cellSize, AREA_WIDTH: width, AREA_PADDING: padding, LABEL_HEIGHT, STEP_OFFSET: step } = NEXT_AREA_CONFIG
  const rowHeight = padding * 2 + LABEL_HEIGHT + cellSize * 2
  const height = rowHeight * 2
  const nextX = baseX + (width - step) / 2
  const nextNextX = nextX + step
  const subY = baseY + padding + LABEL_HEIGHT + cellSize / 2
  return {
    baseX, baseY, width, height, rowHeight,
    next: { x: nextX, subY, mainY: subY + cellSize, labelY: baseY + padding },
    nextNext: { x: nextNextX, subY: subY + rowHeight, mainY: subY + rowHeight + cellSize, labelY: baseY + rowHeight + padding },
    statusY: baseY + height + NEXT_AREA_CONFIG.STATUS_GAP,
    outline: [[0, 0], [width - step, 0], [width - step, rowHeight], [width, rowHeight],
      [width, height], [step, height], [step, rowHeight], [0, rowHeight]] as readonly (readonly [number, number])[],
  }
}

type NextPreviewLayout = ReturnType<typeof getNextPreviewLayout>

/** One continuous frame follows the queue from the upper left to the lower right. */
export function drawNextPreview(scene: Phaser.Scene, layout: NextPreviewLayout): void {
  const frame = scene.add.graphics()
  frame.fillStyle(NEXT_AREA_CONFIG.BG_COLOR, 1)
  frame.lineStyle(1, NEXT_AREA_CONFIG.BORDER_COLOR, 1)
  frame.beginPath()
  layout.outline.forEach(([x, y], index) => {
    if (index === 0) frame.moveTo(layout.baseX + x, layout.baseY + y)
    else frame.lineTo(layout.baseX + x, layout.baseY + y)
  })
  frame.closePath()
  frame.fillPath()
  frame.strokePath()
  for (const [text, position] of [['NEXT', layout.next], ['NEXT2', layout.nextNext]] as const) {
    addUIText(scene, position.x, position.labelY, text, {
      fontSize: '14px', color: '#f8f7ff',
    }).setOrigin(0.5, 0)
  }
}

export function createNextPairSprites(scene: Phaser.Scene, pair: PuyoPair, position: NextPreviewLayout['next']) {
  const size = NEXT_AREA_CONFIG.CELL_SIZE
  const sub = scene.add.sprite(position.x, position.subY, PuyoRenderer.textureKey, PuyoRenderer.frame(pair.sub.color, 'idle'))
  sub.setDisplaySize(size, size)
  const main = scene.add.sprite(position.x, position.mainY, PuyoRenderer.textureKey, PuyoRenderer.frame(pair.main.color, 'idle'))
  main.setDisplaySize(size, size)
  return { main, sub }
}
