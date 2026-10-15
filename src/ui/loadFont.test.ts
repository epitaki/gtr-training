import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUIFont } from './loadFont'

describe('bounded local font startup', () => {
  let resolve: (face: unknown) => void
  let reject: (error: Error) => void
  let face: { load: ReturnType<typeof vi.fn> }
  const add = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    add.mockClear()
    const pending = new Promise((yes, no) => { resolve = yes; reject = no })
    face = { load: vi.fn(() => pending) }
    vi.stubGlobal('FontFace', vi.fn(function () { return face }))
    vi.stubGlobal('document', { fonts: { add } })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('registers the unmodified local regular face before continuing startup', async () => {
    const start = vi.fn()
    const gate = loadUIFont().then(result => { start(); return result })
    expect(start).not.toHaveBeenCalled()
    expect(FontFace).toHaveBeenCalledWith('DotGothic16', 'url("/fonts/DotGothic16-Regular.ttf")', { weight: '400', style: 'normal' })
    resolve(face)
    expect(await gate).toBe('loaded')
    expect(add).toHaveBeenCalledExactlyOnceWith(face)
    expect(start).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('continues startup without registering after load rejection', async () => {
    const start = vi.fn()
    const gate = loadUIFont().then(result => { start(); return result })
    reject(new Error('offline'))
    expect(await gate).toBe('failed')
    expect(start).toHaveBeenCalledOnce()
    expect(add).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('continues at two seconds and never registers a late successful face', async () => {
    const start = vi.fn()
    const gate = loadUIFont().then(result => { start(); return result })
    await vi.advanceTimersByTimeAsync(1999)
    expect(start).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await gate).toBe('timeout')
    expect(start).toHaveBeenCalledOnce()
    resolve(face)
    await Promise.resolve()
    await Promise.resolve()
    expect(add).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalledOnce()
  })
  it('handles a late rejection after timeout without an unhandled rejection', async () => {
    const gate = loadUIFont()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await gate).toBe('timeout')
    reject(new Error('late network failure'))
    await Promise.resolve()
    expect(add).not.toHaveBeenCalled()
  })
  it.each(['FontFace', 'document'])('continues when %s is unavailable', async name => {
    vi.stubGlobal(name, undefined)
    const start = vi.fn()
    expect(await loadUIFont().then(result => { start(); return result })).toBe('unsupported')
    expect(start).toHaveBeenCalledOnce()
    expect(add).not.toHaveBeenCalled()
  })
  it('continues when font registration is unsupported', async () => {
    vi.stubGlobal('document', { fonts: {} })
    expect(await loadUIFont()).toBe('unsupported')
    expect(face.load).not.toHaveBeenCalled()
  })
  it('continues on synchronous construction or registration failure', async () => {
    vi.stubGlobal('FontFace', vi.fn(() => { throw new Error('unsupported face') }))
    expect(await loadUIFont()).toBe('failed')
    expect(add).not.toHaveBeenCalled()
  })
})
