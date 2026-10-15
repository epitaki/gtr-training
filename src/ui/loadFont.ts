export type FontLoadResult = 'loaded' | 'failed' | 'timeout' | 'unsupported'

/** A bounded startup gate: a face that misses the deadline must never be registered later. */
export async function loadUIFont(timeoutMs = 2000): Promise<FontLoadResult> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts?.add) return 'unsupported'
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const face = new FontFace('DotGothic16', 'url("/fonts/DotGothic16-Regular.ttf")', { weight: '400', style: 'normal' })
    const result = await Promise.race([
      face.load().then(() => 'loaded' as const, () => 'failed' as const),
      new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs) }),
    ])
    if (result === 'loaded') document.fonts.add(face)
    return result
  } catch {
    return 'failed'
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
