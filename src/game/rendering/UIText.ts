import type * as Phaser from 'phaser'
import { UI_FONT_FAMILY, UI_COLORS } from '../../ui/theme'

/** All scene text, including recovery notices, uses the same regular face; callers can select the texture density. */
export function addUIText(scene: Phaser.Scene, x: number, y: number, text: string | string[], style: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return scene.add.text(Math.round(x), Math.round(y), text, {
    fontSize: '16px', color: UI_COLORS.text, lineSpacing: 4,
    ...style, fontFamily: UI_FONT_FAMILY, fontStyle: 'normal', resolution: style.resolution ?? 2,
    strokeThickness: 0,
  })
}
