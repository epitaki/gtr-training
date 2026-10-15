import { describe, expect, it, vi } from 'vitest'
import { resolveChainsWithTrace, type PuyoGrid } from '../core/ChainSimulator'
import { PuyoColor } from '../core/types'
import { createGTRChainPreview } from '../gtr/GTRChainPreview'
import { ResultChainPlayback, type ResultChainFrame } from './ResultChainPlayback'

const board = (): PuyoGrid => {
  const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
  for (let x = 0; x < 4; x++) grid[12][x] = PuyoColor.RED
  grid[11][0] = PuyoColor.BLUE
  return grid
}
const advance = (playback: ResultChainPlayback, milliseconds: number): void => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) playback.update(Math.min(50, milliseconds - elapsed))
}
const last = (frames: ResultChainFrame[]): ResultChainFrame => frames[frames.length - 1]

describe('result chain playback', () => {
  it('holds, fades one clear, switches gravity immediately, and retains the final board', () => {
    const frames: ResultChainFrame[] = []
    const playback = new ResultChainPlayback(resolveChainsWithTrace(board()), { frame: frame => frames.push(frame) })
    expect(last(frames).phase).toBe('initial')
    advance(playback, 550)
    expect(last(frames).phase).toBe('initial')
    advance(playback, 50)
    expect(last(frames)).toMatchObject({ phase: 'fade', alpha: 1, chainIndex: 1 })
    advance(playback, 150)
    expect(last(frames)).toMatchObject({ phase: 'fade', alpha: 0.5 })
    expect(last(frames).fading).toHaveLength(4)
    advance(playback, 150)
    expect(last(frames).phase).toBe('gap')
    expect(last(frames).grid[12][0]).toBe(PuyoColor.BLUE)
    expect(last(frames).grid[11][0]).toBeNull()
    advance(playback, 200)
    expect(playback.isFinished).toBe(true)
    expect(last(frames).phase).toBe('complete')
    expect(last(frames).grid[12][0]).toBe(PuyoColor.BLUE)
  })

  it('replays the same trace and ignores invalid or oversized frame deltas', () => {
    const frames: ResultChainFrame[] = []
    const playback = new ResultChainPlayback(resolveChainsWithTrace(board()), { frame: frame => frames.push(frame) })
    playback.update(Number.NaN)
    playback.update(Infinity)
    playback.update(-1)
    expect(frames).toHaveLength(1)
    playback.update(1000)
    expect(frames).toHaveLength(1)
    advance(playback, 1050)
    expect(playback.isFinished).toBe(true)
    playback.replay()
    expect(playback.isFinished).toBe(false)
    expect(last(frames).phase).toBe('initial')
    expect(last(frames).grid).toEqual(board())
  })

  it('cancels without further callbacks or accepting replay', () => {
    const frame = vi.fn()
    const playback = new ResultChainPlayback(resolveChainsWithTrace(board()), { frame })
    playback.cancel()
    playback.cancel()
    playback.update(50)
    playback.replay()
    expect(frame).toHaveBeenCalledOnce()
  })

  it('emits five clear stages in order and replays without changing the saved trace', () => {
    const colors: Record<string, PuyoColor> = {
      R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW,
    }
    const rows = ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB']
    const grid: PuyoGrid = [
      ...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
      ...rows.map(row => [...row].map(value => colors[value] ?? null)),
    ]
    const trace = createGTRChainPreview(grid).trace!
    const savedTrace = structuredClone(trace)
    const frames: ResultChainFrame[] = []
    const playback = new ResultChainPlayback(trace, { frame: frame => frames.push(frame) })
    advance(playback, 3100)
    expect(frames.filter(frame => frame.phase === 'fade' && frame.alpha === 1)
      .map(frame => frame.chainIndex)).toEqual([1, 2, 3, 4, 5])
    expect(last(frames).phase).toBe('complete')
    expect(last(frames).grid.flat().every(value => value === null)).toBe(true)
    playback.replay()
    advance(playback, 3100)
    expect(frames.filter(frame => frame.phase === 'fade' && frame.alpha === 1)
      .map(frame => frame.chainIndex)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
    expect(trace).toEqual(savedTrace)
    expect(grid[9][0]).toBeNull()
  })

  it('tracks the virtual starter through initial gravity without marking another red', () => {
    const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    grid[9][0] = PuyoColor.RED // hypothetical starter
    grid[10][0] = PuyoColor.RED
    grid[12][0] = PuyoColor.RED
    grid[12][1] = PuyoColor.RED
    const trace = resolveChainsWithTrace(grid)
    const starterId = trace.initial.ids[9][0]!
    const frames: ResultChainFrame[] = []
    const playback = new ResultChainPlayback(trace, { frame: frame => frames.push(frame) }, starterId)
    expect(last(frames).starterPosition).toEqual({ x: 0, y: 9 })
    advance(playback, 600)
    expect(last(frames)).toMatchObject({ phase: 'fade', starterPosition: { x: 0, y: 10 } })
    expect(last(frames).grid[11][0]).toBe(PuyoColor.RED)
    advance(playback, 300)
    expect(last(frames)).toMatchObject({ phase: 'gap', starterPosition: null })
    playback.replay()
    expect(last(frames)).toMatchObject({ phase: 'initial', starterPosition: { x: 0, y: 9 } })
  })
})
