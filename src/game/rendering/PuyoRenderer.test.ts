import { describe, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({ Textures: { FilterMode: { NEAREST: 0 } } }))
import manifest from '../../assets/puyo/manifest.json'
import { PuyoRenderer } from './PuyoRenderer'

const manager = () => {
  const frames = new Map<string, number[]>()
  const texture = {
    has: (name: string) => frames.has(name),
    add: vi.fn((name: string, _source: number, ...rect: number[]) => { frames.set(name, rect); return {} }),
    setFilter: vi.fn(),
  }
  const textures = { exists: vi.fn(() => true), get: vi.fn(() => texture) }
  return { frames, texture, textures }
}

describe('pixel atlas registration', () => {
  it('registers every named frame including aliases and shoulders once per texture manager', () => {
    const first = manager(), second = manager()
    PuyoRenderer.createTextures({ textures: first.textures } as never)
    const firstCount = first.texture.add.mock.calls.length
    expect(Object.keys(manifest.frames)).toHaveLength(184)
    for (const name of Object.keys(manifest.frames)) expect(first.frames.has(name)).toBe(true)
    expect(first.frames.get('red/fall/0')).toEqual(manifest.frames['red/fall/0'].rect)
    expect(first.frames.get('red/connect-enter/3/shoulder/1')).toEqual([
      manifest.frames['red/connect-enter/3'].rect[0] + manifest.connectionComposition.shoulderRects['1'][0],
      manifest.frames['red/connect-enter/3'].rect[1] + manifest.connectionComposition.shoulderRects['1'][1],
      ...manifest.connectionComposition.shoulderRects['1'].slice(2),
    ])
    PuyoRenderer.createTextures({ textures: first.textures } as never)
    expect(first.texture.add).toHaveBeenCalledTimes(firstCount)
    PuyoRenderer.createTextures({ textures: second.textures } as never)
    expect(second.texture.add).toHaveBeenCalledTimes(firstCount)
    expect(first.texture.setFilter).toHaveBeenCalledWith(0)
    expect(second.texture.setFilter).toHaveBeenCalledWith(0)
  })

  it('refuses a missing atlas or a failed frame registration', () => {
    expect(() => PuyoRenderer.createTextures({ textures: { exists: () => false } } as never)).toThrow(/failed to load/)
    const broken = manager()
    broken.texture.add.mockImplementation(() => null as never)
    expect(() => PuyoRenderer.createTextures({ textures: broken.textures } as never)).toThrow(/frame is missing/)
  })
})
