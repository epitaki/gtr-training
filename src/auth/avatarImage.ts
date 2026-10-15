export const AVATAR_SIZE = 256
export const AVATAR_MAX_BYTES = 256 * 1024
const INPUT_MAX_BYTES = 20 * 1024 * 1024
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Decode locally and upload only a small, re-encoded image without source metadata. */
export async function resizeAvatar(file: File): Promise<Blob> {
  if (!TYPES.has(file.type)) throw new Error('JPEG・PNG・WebPの画像を選んでください')
  if (!file.size || file.size > INPUT_MAX_BYTES) throw new Error('画像は20MB以下で選んでください')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('画像を読み込めませんでした。別の画像を選んでください') }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64_000_000) {
      throw new Error('画像の寸法が大きすぎます。小さい画像を選んでください')
    }
    const side = Math.min(bitmap.width, bitmap.height)
    const size = Math.min(AVATAR_SIZE, side)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('このブラウザでは画像を加工できません')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!blob || blob.type !== 'image/webp' || !blob.size || blob.size > AVATAR_MAX_BYTES) {
      throw new Error('画像を縮小できませんでした。別の画像を選んでください')
    }
    return blob
  } finally { bitmap.close() }
}
