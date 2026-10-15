import * as Phaser from 'phaser'
import atlasUrl from '../../assets/puyo/atlas.png?url'
import manifest from '../../assets/puyo/manifest.json'
import type { PuyoColor } from '../core/types'

type FrameName = keyof typeof manifest.frames

export class PuyoRenderer {
  static readonly textureKey = 'puyo-pixel-atlas'

  static preload(scene: Phaser.Scene): void {
    scene.load.image(this.textureKey, atlasUrl)
  }

  static createTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(this.textureKey)) throw new Error('Pixel puyo atlas failed to load')
    const texture = scene.textures.get(this.textureKey)
    for (const [name, definition] of Object.entries(manifest.frames)) {
      if (!texture.has(name)) {
        const [x, y, width, height] = definition.rect
        texture.add(name, 0, x, y, width, height)
      }
      if (!texture.has(name)) throw new Error(`Pixel puyo frame is missing: ${name}`)
    }
    for (const [bit, rect] of Object.entries(manifest.connectionComposition.shoulderRects)) {
      for (const color of manifest.colors) for (let mask = 1; mask < 16; mask++) {
        if (!(mask & Number(bit))) continue
        const source = manifest.frames[`${color}/connect-enter/${mask}` as FrameName]
        const name = this.shoulderFrame(color as PuyoColor, mask, Number(bit))
        if (!texture.has(name)) {
          texture.add(name, 0, source.rect[0] + rect[0], source.rect[1] + rect[1], rect[2], rect[3])
        }
        if (!texture.has(name)) throw new Error(`Pixel puyo shoulder is missing: ${name}`)
      }
    }
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST)
  }

  static frame(color: string, state: string): string { return `${color}/${state}` }
  static shoulderFrame(color: PuyoColor, mask: number, bit: number): string {
    return `${color}/connect-enter/${mask}/shoulder/${bit}`
  }
  static shoulderRect(bit: number): readonly number[] {
    return manifest.connectionComposition.shoulderRects[String(bit) as keyof typeof manifest.connectionComposition.shoulderRects]
  }
}
