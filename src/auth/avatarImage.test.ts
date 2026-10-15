// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { resizeAvatar } from './avatarImage'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function setup(width = 2000, height = 1000, blob: Blob | null = new Blob(['webp'], { type: 'image/webp' })) {
  const bitmap = { width, height, close: vi.fn() }
  const drawImage = vi.fn()
  const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as any)
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect(this.width).toBe(Math.min(256, width, height))
    expect(this.height).toBe(this.width)
    callback(blob)
  })
  return { bitmap, drawImage, encode }
}
const image = () => new File(['image'], 'picture.jpg', { type: 'image/jpeg' })

it('center crops and resizes a landscape image, honors orientation and releases the decoded bitmap', async () => {
  const { bitmap, drawImage, encode } = setup()
  const file = image()
  expect((await resizeAvatar(file)).type).toBe('image/webp')
  expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' })
  expect(drawImage).toHaveBeenCalledWith(bitmap, 500, 0, 1000, 1000, 0, 0, 256, 256)
  expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.85)
  expect(bitmap.close).toHaveBeenCalledOnce()
})
it('crops portrait images without enlarging a small image', async () => {
  const { bitmap, drawImage } = setup(80, 160)
  await resizeAvatar(image())
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 40, 80, 80, 0, 0, 80, 80)
})
it('rejects unsupported or oversized input before decoding', async () => {
  setup()
  await expect(resizeAvatar(new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPEG')
  const file = image()
  Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 })
  await expect(resizeAvatar(file)).rejects.toThrow('20MB')
  expect(createImageBitmap).not.toHaveBeenCalled()
})
it('reports corrupted images', async () => {
  setup()
  vi.mocked(createImageBitmap).mockRejectedValue(Error('decode'))
  await expect(resizeAvatar(image())).rejects.toThrow('読み込めません')
})
it('rejects excessive decoded dimensions and closes the bitmap', async () => {
  const { bitmap } = setup(9000, 9000)
  await expect(resizeAvatar(image())).rejects.toThrow('寸法')
  expect(bitmap.close).toHaveBeenCalledOnce()
})
it.each([null, new Blob(['png'], { type: 'image/png' }), new Blob([new Uint8Array(262145)], { type: 'image/webp' })])('rejects encoder failure or fallback without leaking the bitmap', async blob => {
  const { bitmap } = setup(1000, 1000, blob)
  await expect(resizeAvatar(image())).rejects.toThrow('縮小できません')
  expect(bitmap.close).toHaveBeenCalledOnce()
})
