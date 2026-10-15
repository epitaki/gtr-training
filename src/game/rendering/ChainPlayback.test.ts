import { describe, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({ Textures: { FilterMode: { NEAREST: 0 } } }))
import { resolveChainsWithTrace, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'
import { ChainPlayback } from './ChainPlayback'
import { PuyoBoardRenderer } from './PuyoBoardRenderer'
import type * as Phaser from 'phaser'

const empty = (): PuyoGrid => Array.from({ length: 13 }, () => Array(6).fill(null))

describe('ChainPlayback', () => {
  it('completes an empty trace only on update and exactly once', () => {
    let completed = 0
    const playback = new ChainPlayback(resolveChainsWithTrace(empty()), { frame: () => {}, complete: () => completed++ })
    expect(completed).toBe(0)
    playback.update(0)
    playback.update(1000)
    expect(completed).toBe(1)
  })

  it('preserves phase progress across nested pauses and clamps large deltas', () => {
    const source = empty()
    source[12].fill(PuyoColor.RED, 0, 4)
    const frames: string[] = []
    let completed = 0
    const playback = new ChainPlayback(resolveChainsWithTrace(source), {
      frame: ({ phase, progress }) => frames.push(`${phase}:${progress}`), complete: () => completed++,
    })
    playback.update(10000)
    expect(frames[0]).toBe(`emphasis:${50 / 120}`)
    playback.pause('user')
    playback.pause('hidden')
    playback.update(50)
    expect(frames).toHaveLength(1)
    playback.resume('user')
    playback.update(50)
    expect(frames).toHaveLength(1)
    playback.resume('hidden')
    for (let i = 0; i < 20; i++) playback.update(50)
    expect(completed).toBe(1)
    playback.update(50)
    expect(completed).toBe(1)
  })

  it('cancel prevents completion and rejects invalid deltas', () => {
    const source = empty()
    source[12].fill(PuyoColor.RED, 0, 4)
    let completed = 0
    let canceled = 0
    const frames: number[] = []
    const playback = new ChainPlayback(resolveChainsWithTrace(source), {
      frame: frame => frames.push(frame.progress), complete: () => completed++, cancel: () => canceled++,
    })
    playback.update(Number.POSITIVE_INFINITY)
    playback.update(-1)
    expect(frames).toEqual([0, 0])
    playback.cancel()
    playback.cancel()
    playback.update(1000)
    expect(canceled).toBe(1)
    expect(completed).toBe(0)
  })

  it('lets shorter falls land before longer falls in the same gravity stage', () => {
    const source = empty()
    source[10][0] = PuyoColor.RED
    source[11][1] = PuyoColor.BLUE
    const trace = resolveChainsWithTrace(source)
    const stage = trace.stages[0]
    expect(stage.kind).toBe('gravity')
    if (stage.kind !== 'gravity') return
    const sprites: Array<{ x: number; y: number; setPosition: (x: number, y: number) => void; destroy: () => void }> = []
    const scene = { add: { sprite: (x: number, y: number) => {
      const item = { x, y, alpha: 1, setPosition(px: number, py: number) { this.x = px; this.y = py; return this },
        setFrame() { return this }, setAlpha(value: number) { this.alpha = value; return this },
        setVisible() { return this }, setDisplaySize() { return this }, setDepth() { return this }, destroy() {} }
      sprites.push(item)
      return item
    } } } as unknown as Phaser.Scene
    const renderer = new PuyoBoardRenderer(scene, 0, 0, trace, source)
    renderer.frame({ stage, phase: 'gravity', progress: 0.8 })
    expect(sprites[1].y).toBe(12 * 48 + 24)
    expect(sprites[0].y).toBe(Math.round(11.6 * 48 + 24))
    renderer.dispose()
  })

  it.each(['gravity', 'land', 'emphasis', 'fade'] as const)(
    'freezes the %s phase for independent pause reasons and never completes after cancel', phase => {
      const source = empty()
      source[11].fill(PuyoColor.RED, 0, 4)
      const frames: Array<{ phase: string; progress: number }> = []
      let completed = 0
      let canceled = 0
      const playback = new ChainPlayback(resolveChainsWithTrace(source), {
        frame: frame => frames.push({ phase: frame.phase, progress: frame.progress }),
        complete: () => completed++, cancel: () => canceled++,
      })
      for (let i = 0; i < 30 && !frames.some(frame => frame.phase === phase && frame.progress > 0); i++) playback.update(50)
      expect(frames[frames.length - 1]?.phase).toBe(phase)
      const count = frames.length
      playback.pause('user')
      playback.pause('hidden')
      playback.update(50)
      playback.resume('user')
      playback.update(50)
      expect(frames).toHaveLength(count)
      playback.resume('hidden')
      playback.update(50)
      expect(frames.length).toBeGreaterThan(count)
      playback.cancel()
      playback.cancel()
      for (let i = 0; i < 20; i++) playback.update(50)
      expect(canceled).toBe(1)
      expect(completed).toBe(0)
    },
  )
})
