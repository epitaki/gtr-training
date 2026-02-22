// ぷよテクスチャ生成ユーティリティ（目付き・立体感あり）
import * as Phaser from 'phaser'
import { PUYO_COLORS } from './VisualConfig'

export class PuyoRenderer {
  /**
   * 全4色のぷよテクスチャを生成
   * 64x64ピクセルでオーバーサンプリングし、表示時にセルサイズに縮小
   * - ソフトシャドウリング
   * - 3段階グラデーションボディ（ダーク→メイン→ライト）
   * - 白目＋黒瞳＋瞳ハイライト
   * - スペキュラーハイライト
   */
  static createTextures(scene: Phaser.Scene): void {
    const size = 64
    const cx = size / 2
    const cy = size / 2
    const radius = 28

    Object.entries(PUYO_COLORS).forEach(([name, colors]) => {
      const graphics = scene.add.graphics()

      // 1. 外側シャドウ（奥行き感のための暗いリング）
      graphics.fillStyle(0x000000, 0.25)
      graphics.fillCircle(cx + 1, cy + 2, radius + 1)

      // 2. ボディ - ダークベース
      graphics.fillStyle(colors.dark)
      graphics.fillCircle(cx, cy, radius)

      // 3. ボディ - メインカラー（明るい中心部）
      graphics.fillStyle(colors.main)
      graphics.fillCircle(cx - 1, cy - 2, radius - 3)

      // 4. ライトキャップ（ドーム形状を表現）
      graphics.fillStyle(colors.light, 0.55)
      graphics.fillCircle(cx - 2, cy - 6, radius - 8)

      // 5. スペキュラーハイライト（左上の小さな明るい点）
      graphics.fillStyle(0xffffff, 0.65)
      graphics.fillCircle(cx - 8, cy - 10, 5)
      graphics.fillStyle(0xffffff, 0.25)
      graphics.fillCircle(cx - 5, cy - 7, 8)

      // 6. 目 - 白目
      const eyeOffsetX = 7
      const eyeY = cy - 2
      const eyeRX = 6
      const eyeRY = 7

      // 左目の白目
      graphics.fillStyle(colors.eye)
      graphics.fillEllipse(cx - eyeOffsetX, eyeY, eyeRX * 2, eyeRY * 2)
      // 右目の白目
      graphics.fillStyle(colors.eye)
      graphics.fillEllipse(cx + eyeOffsetX, eyeY, eyeRX * 2, eyeRY * 2)

      // 7. 瞳（目の中心より少し下に配置して可愛く）
      const pupilRadius = 3
      const pupilY = eyeY + 1
      graphics.fillStyle(colors.pupil)
      graphics.fillCircle(cx - eyeOffsetX, pupilY, pupilRadius)
      graphics.fillCircle(cx + eyeOffsetX, pupilY, pupilRadius)

      // 8. 瞳のハイライト（小さな白い点）
      graphics.fillStyle(0xffffff, 0.9)
      graphics.fillCircle(cx - eyeOffsetX - 1, pupilY - 1, 1.5)
      graphics.fillCircle(cx + eyeOffsetX - 1, pupilY - 1, 1.5)

      graphics.generateTexture(`puyo-${name}`, size, size)
      graphics.destroy()
    })
  }

  /**
   * ゴースト（半透明）テクスチャ生成
   * ガイドパターン表示やドロップシャドウプレビュー用
   */
  static createGhostTextures(scene: Phaser.Scene): void {
    const size = 64
    const cx = size / 2
    const cy = size / 2
    const radius = 28

    Object.entries(PUYO_COLORS).forEach(([name, colors]) => {
      const graphics = scene.add.graphics()
      graphics.fillStyle(colors.main, 0.3)
      graphics.fillCircle(cx, cy, radius)
      graphics.fillStyle(colors.light, 0.15)
      graphics.fillCircle(cx - 2, cy - 4, radius - 6)
      graphics.generateTexture(`puyo-ghost-${name}`, size, size)
      graphics.destroy()
    })
  }
}
