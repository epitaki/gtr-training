import { describe, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({ Textures: { FilterMode: { NEAREST: 0 } } }))
import { PuyoColor } from '../core/types'
import { resolveChainsWithTrace } from '../core/ChainSimulator'
import type { ChainSnapshot, ChainTrace, GravityStage, ClearStage } from '../core/ChainTrace'
import { PuyoBoardRenderer } from './PuyoBoardRenderer'
import { ChainPlayback } from './ChainPlayback'

const empty = (): ChainSnapshot => ({
  grid: Array.from({ length: 13 }, () => Array(6).fill(null)),
  ids: Array.from({ length: 13 }, () => Array(6).fill(null)),
})
const put = (board: ChainSnapshot, id: string, x: number, y: number, color = PuyoColor.RED) => {
  board.grid[y][x] = color; board.ids[y][x] = id
}
const copy = (board: ChainSnapshot): ChainSnapshot => ({
  grid: board.grid.map(row => [...row]), ids: board.ids.map(row => [...row]),
})
class Sprite {
  frame = ''
  width = 0
  height = 0
  alpha = 1
  visible = true
  destroyed = false
  updates = 0
  destroyCalls = 0
  constructor(public x: number, public y: number, public key: string, frame: string) { this.frame = frame }
  setFrame(value: string) { this.frame = value; this.updates++; return this }
  setDisplaySize(width: number, height: number) { this.width = width; this.height = height; this.updates++; return this }
  setDepth(_depth: number) { this.updates++; return this }
  setAlpha(value: number) { this.alpha = value; this.updates++; return this }
  setVisible(value: boolean) { this.visible = value; this.updates++; return this }
  setPosition(x: number, y: number) { this.x = x; this.y = y; this.updates++; return this }
  destroy() { this.destroyed = true; this.destroyCalls++; this.updates++ }
}
class Label {
  destroyed = false
  updates = 0
  destroyCalls = 0
  constructor(public value: string) {}
  setOrigin() { this.updates++; return this }
  setDepth() { this.updates++; return this }
  setText(value: string) { this.value = value; this.updates++; return this }
  destroy() { this.destroyed = true; this.destroyCalls++; this.updates++ }
}
const harness = () => {
  const sprites: Sprite[] = []
  const labels: Label[] = []
  const scene = { add: {
    sprite: vi.fn((x: number, y: number, key: string, frame: string) => {
      const sprite = new Sprite(x, y, key, frame); sprites.push(sprite); return sprite
    }),
    text: vi.fn((_x: number, _y: number, value: string) => {
      const label = new Label(value); labels.push(label); return label
    }),
  } }
  const state = () => ({
    sprites: sprites.map(sprite => [sprite.key, sprite.frame, sprite.x, sprite.y, sprite.width,
      sprite.height, sprite.alpha, sprite.visible, sprite.destroyed, sprite.updates, sprite.destroyCalls]),
    labels: labels.map(label => [label.value, label.destroyed, label.updates, label.destroyCalls]),
  })
  const liveCount = () => sprites.filter(sprite => !sprite.destroyed).length + labels.filter(label => !label.destroyed).length
  return { scene: scene as never, sprites, labels, state, liveCount }
}
const trace = (initial: ChainSnapshot, stages: ChainTrace['stages']): ChainTrace => ({
  initial, stages, result: resolveChainsWithTrace(empty().grid).result,
})

const realisticChain = () => {
  const board = empty().grid
  board[12][1] = PuyoColor.RED
  board[12][2] = PuyoColor.RED
  board[12][3] = PuyoColor.RED
  board[10][0] = PuyoColor.RED
  const before = board.map(row => [...row])
  before[10][0] = null
  const chain = resolveChainsWithTrace(board)
  expect(chain.stages.map(stage => stage.kind)).toEqual(['gravity', 'clear'])
  expect(chain.stages[1].after.grid).toEqual(empty().grid)
  return { chain, before, gravity: chain.stages[0] as GravityStage, clear: chain.stages[1] as ClearStage }
}

const advanceTo = (playback: ChainPlayback, elapsed: number) => {
  while (elapsed > 0) {
    const step = Math.min(50, elapsed)
    playback.update(step)
    elapsed -= step
  }
}

describe('individual pixel playback', () => {
  it('uses individual fall durations, fixed arrival, and one global landing phase', () => {
    const initial = empty(); put(initial, 'short', 1, 11); put(initial, 'long', 4, 9, PuyoColor.BLUE)
    const after = empty(); put(after, 'short', 1, 12); put(after, 'long', 4, 12, PuyoColor.BLUE)
    const stage: GravityStage = { kind: 'gravity', moves: [
      { id: 'short', from: { x: 1, y: 11 }, to: { x: 1, y: 12 } },
      { id: 'long', from: { x: 4, y: 9 }, to: { x: 4, y: 12 } },
    ], after }
    const { scene, sprites } = harness()
    const renderer = new PuyoBoardRenderer(scene, 0, 0, trace(initial, [stage]), empty().grid)
    const short = sprites.find(sprite => sprite.x === 1 * 48 + 24)!
    const long = sprites.find(sprite => sprite.x === 4 * 48 + 24)!
    renderer.frame({ stage, phase: 'gravity', progress: 0.7 })
    expect(short.y).toBe(12 * 48 + 24)
    expect(short.frame).toBe('red/connect/0')
    expect(long.y).toBe(Math.round((9 + 3 * 0.7) * 48 + 24))
    expect(long.frame).toBe('blue/fall/1')
    renderer.frame({ stage, phase: 'land', progress: 0 })
    expect([short.frame, long.frame]).toEqual(['red/land/0', 'blue/land/0'])
    renderer.frame({ stage, phase: 'land', progress: 0.5 })
    expect([short.frame, long.frame]).toEqual(['red/land/1', 'blue/land/1'])
    renderer.frame({ stage, phase: 'land', progress: 1 })
    expect([short.frame, long.frame]).toEqual(['red/connect/0', 'blue/connect/0'])
    renderer.dispose(); renderer.dispose()
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true)
  })

  it('preserves a new placement shoulder through first gravity and safely reuses sparse right overlays', () => {
    const initial = empty(); put(initial, 'left', 1, 12); put(initial, 'right', 2, 12)
    put(initial, 'falling', 5, 10, PuyoColor.BLUE)
    const before = empty().grid; before[12][1] = PuyoColor.RED
    const after = copy(initial)
    after.ids[10][5] = null; after.grid[10][5] = null
    put(after, 'falling', 5, 12, PuyoColor.BLUE)
    const stage: GravityStage = { kind: 'gravity', moves: [
      { id: 'falling', from: { x: 5, y: 10 }, to: { x: 5, y: 12 } },
    ], after }
    const { scene, sprites } = harness()
    const renderer = new PuyoBoardRenderer(scene, 0, 0, trace(initial, [stage]), before)
    renderer.frame({ stage, phase: 'land', progress: 0.8 })
    expect(sprites.find(sprite => sprite.x === 1 * 48 + 24 && sprite.y === 12 * 48 + 24)?.frame).toBe('red/connect/2')
    const overlay = sprites.find(sprite => sprite.frame === 'red/connect-enter/2/shoulder/2')
    expect(overlay?.visible).toBe(true)
    expect(overlay?.width).toBe(2)
    renderer.frame({ stage, phase: 'land', progress: 0.9 })
    expect(overlay?.visible).toBe(true)
    renderer.frame({ stage, phase: 'land', progress: 1 })
    expect(overlay?.visible).toBe(false)
    const count = sprites.length
    renderer.frame({ stage, phase: 'land', progress: 1 })
    expect(sprites).toHaveLength(count)
    renderer.dispose()
  })

  it('composes only a newly gained shoulder over a stable old connection during initial emphasis', () => {
    const initial = empty()
    put(initial, 'center', 2, 12); put(initial, 'right', 3, 12); put(initial, 'up', 2, 11)
    put(initial, 'clear', 5, 12, PuyoColor.BLUE)
    const before = empty().grid
    before[12][2] = PuyoColor.RED; before[12][3] = PuyoColor.RED
    const stage: ClearStage = { kind: 'clear', chainIndex: 1, cleared: [
      { id: 'clear', color: PuyoColor.BLUE, position: { x: 5, y: 12 } },
    ], after: copy(initial) }
    const { scene, sprites } = harness()
    const renderer = new PuyoBoardRenderer(scene, 0, 0, trace(initial, [stage]), before)
    renderer.frame({ stage, phase: 'emphasis', progress: 0 })
    expect(sprites.find(sprite => sprite.x === 2 * 48 + 24 && sprite.y === 12 * 48 + 24)?.frame).toBe('red/connect/3')
    expect(sprites.some(sprite => sprite.frame === 'red/connect-enter/3/shoulder/1')).toBe(true)
    expect(sprites.some(sprite => sprite.frame === 'red/connect-enter/3/shoulder/2')).toBe(false)
    expect(sprites.find(sprite => sprite.key === 'puyo-pixel-atlas' && sprite.frame === 'blue/clear/0')).toBeDefined()
    renderer.frame({ stage, phase: 'emphasis', progress: 1 / 3 })
    expect(sprites.find(sprite => sprite.frame === 'red/connect-enter/3/shoulder/1')?.visible).toBe(false)
    renderer.dispose()
  })

  it('prioritizes clear frames, synchronizes particle frames, and freezes all display state while paused', () => {
    const initial = empty()
    put(initial, 'a', 1, 12); put(initial, 'b', 2, 12)
    put(initial, 'c', 4, 12, PuyoColor.BLUE)
    const stage: ClearStage = { kind: 'clear', chainIndex: 1, cleared: [
      { id: 'a', color: PuyoColor.RED, position: { x: 1, y: 12 } },
      { id: 'c', color: PuyoColor.BLUE, position: { x: 4, y: 12 } },
    ], after: empty() }
    const { scene, sprites } = harness()
    const renderer = new PuyoBoardRenderer(scene, 0, 0, trace(initial, [stage]), empty().grid)
    const playback = new ChainPlayback(trace(initial, [stage]), {
      frame: frame => renderer.frame(frame), complete: () => {},
    })
    playback.update(40)
    expect(sprites[0].frame).toBe('red/clear/0')
    expect(sprites[1].frame).toBe('red/connect/8')
    playback.pause('user'); playback.pause('hidden')
    const state = sprites.map(sprite => [sprite.frame, sprite.x, sprite.y, sprite.alpha, sprite.visible])
    playback.update(50)
    expect(sprites.map(sprite => [sprite.frame, sprite.x, sprite.y, sprite.alpha, sprite.visible])).toEqual(state)
    playback.resume('hidden'); playback.update(50)
    expect(sprites.map(sprite => [sprite.frame, sprite.x, sprite.y, sprite.alpha, sprite.visible])).toEqual(state)
    playback.resume('user')
    for (let i = 0; i < 6; i++) playback.update(50)
    expect(sprites.filter(sprite => sprite.frame.includes('/particle/')).length).toBe(6)
    expect(sprites[0].visible).toBe(false)
    expect(sprites[2].visible).toBe(false)
    expect(new Set(sprites.filter(sprite => sprite.frame.includes('/particle/')).map(sprite => sprite.alpha)).size).toBe(1)
    playback.cancel(); renderer.dispose(); renderer.dispose()
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true)
  })

  it('changes clear frames at 60 and 120ms and destroys only at the 180ms boundary', () => {
    const initial = empty(); put(initial, 'target', 0, 12)
    const stage: ClearStage = { kind: 'clear', chainIndex: 1, cleared: [
      { id: 'target', color: PuyoColor.RED, position: { x: 0, y: 12 } },
    ], after: empty() }
    const { scene, sprites } = harness()
    const renderer = new PuyoBoardRenderer(scene, 0, 0, trace(initial, [stage]), empty().grid)
    const body = sprites[0]
    renderer.frame({ stage, phase: 'fade', progress: 0 })
    expect(body.frame).toBe('red/clear/1')
    renderer.frame({ stage, phase: 'fade', progress: 1 / 3 })
    expect(body.frame).toBe('red/clear/2')
    renderer.frame({ stage, phase: 'fade', progress: 2 / 3 })
    expect(body.visible).toBe(false)
    expect(sprites.filter(sprite => sprite.frame.includes('/particle/'))).toHaveLength(3)
    renderer.frame({ stage, phase: 'fade', progress: 1 })
    expect(body.destroyed).toBe(true)
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true)
    renderer.frame({ stage, phase: 'fade', progress: 1 })
    renderer.dispose()
  })

  it('releases every body, shoulder, particle and label across repeated completion and mid-play cancellation', () => {
    const { chain, before } = realisticChain()
    let sawShoulder = false
    let sawParticle = false
    for (let run = 0; run < 24; run++) {
      const { scene, sprites, labels, liveCount } = harness()
      const renderer = new PuyoBoardRenderer(scene, 0, 0, chain, before)
      const playback = new ChainPlayback(chain, {
        frame: frame => renderer.frame(frame), complete: () => renderer.dispose(), cancel: () => renderer.dispose(),
      })
      if (run % 3 === 0) {
        advanceTo(playback, 530)
        expect(playback.isFinished).toBe(true)
      } else if (run % 3 === 1) {
        advanceTo(playback, 215)
        expect(sprites.some(sprite => sprite.frame.includes('/shoulder/') && sprite.visible)).toBe(true)
        playback.cancel()
      } else {
        advanceTo(playback, 485)
        expect(sprites.some(sprite => sprite.frame.includes('/particle/') && sprite.visible)).toBe(true)
        playback.cancel()
      }
      sawShoulder ||= sprites.some(sprite => sprite.frame.includes('/shoulder/'))
      sawParticle ||= sprites.some(sprite => sprite.frame.includes('/particle/'))
      renderer.dispose()
      playback.update(50)
      expect(liveCount()).toBe(0)
      expect(sprites.every(sprite => sprite.destroyCalls === 1)).toBe(true)
      expect(labels.every(label => label.destroyCalls === 1)).toBe(true)
    }
    expect(sawShoulder).toBe(true)
    expect(sawParticle).toBe(true)
  })

  it('ignores every phase after disposal without allocating or updating owned objects', () => {
    const { chain, before, gravity, clear } = realisticChain()
    const { scene, sprites, labels, state, liveCount } = harness()
    const renderer = new PuyoBoardRenderer(scene, 0, 0, chain, before)
    renderer.frame({ stage: gravity, phase: 'land', progress: 0.82 })
    renderer.frame({ stage: clear, phase: 'emphasis', progress: 0.1 })
    renderer.frame({ stage: clear, phase: 'fade', progress: 0.8 })
    expect(sprites.some(sprite => sprite.frame.includes('/shoulder/'))).toBe(true)
    expect(sprites.some(sprite => sprite.frame.includes('/particle/'))).toBe(true)
    expect(labels).toHaveLength(1)
    renderer.dispose()
    expect(liveCount()).toBe(0)
    const disposedState = state()
    for (const frame of [
      { stage: gravity, phase: 'gravity' as const, progress: 0.2 },
      { stage: gravity, phase: 'land' as const, progress: 0.9 },
      { stage: clear, phase: 'emphasis' as const, progress: 0.2 },
      { stage: clear, phase: 'fade' as const, progress: 0.8 },
    ]) renderer.frame(frame)
    renderer.dispose()
    expect(state()).toEqual(disposedState)
  })

  it.each([
    { phase: 'gravity', elapsed: 40, expectOverlay: false, expectParticles: false },
    { phase: 'land', elapsed: 215, expectOverlay: true, expectParticles: false },
    { phase: 'emphasis', elapsed: 240, expectOverlay: false, expectParticles: false },
    { phase: 'fade', elapsed: 485, expectOverlay: false, expectParticles: true },
  ])('freezes body, overlay, particle and label state in $phase until both pause reasons resume',
    ({ phase, elapsed, expectOverlay, expectParticles }) => {
      const { chain, before } = realisticChain()
      const { scene, sprites, state, liveCount } = harness()
      const renderer = new PuyoBoardRenderer(scene, 0, 0, chain, before)
      let currentPhase = ''
      const playback = new ChainPlayback(chain, {
        frame: frame => { currentPhase = frame.phase; renderer.frame(frame) },
        complete: () => renderer.dispose(), cancel: () => renderer.dispose(),
      })
      advanceTo(playback, elapsed)
      expect(currentPhase).toBe(phase)
      expect(sprites.some(sprite => sprite.frame.includes('/shoulder/') && sprite.visible)).toBe(expectOverlay)
      expect(sprites.some(sprite => sprite.frame.includes('/particle/') && sprite.visible)).toBe(expectParticles)
      const frozen = state()
      playback.pause('user'); playback.pause('hidden')
      for (let i = 0; i < 5; i++) playback.update(50)
      expect(state()).toEqual(frozen)
      playback.resume('hidden')
      expect(playback.isPaused).toBe(true)
      playback.update(50)
      expect(state()).toEqual(frozen)
      playback.resume('user')
      expect(playback.isPaused).toBe(false)
      playback.update(16)
      expect(state()).not.toEqual(frozen)
      playback.cancel()
      renderer.dispose()
      expect(liveCount()).toBe(0)
    })
})
