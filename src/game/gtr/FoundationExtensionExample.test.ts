import { describe, expect, it } from 'vitest'
import { resolveChains, simulateTurn } from '../core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../core/types'
import { GTR_COMPLETION_GALLERY, getGalleryGrid } from '../guide/GTRCompletionGallery'
import { describeFoundationSurface, findFoundationExtensionExample } from './FoundationExtensionExample'

const byId = (id: string) => getGalleryGrid(GTR_COMPLETION_GALLERY.find(example => example.id === id)!)
const pair = (color: PuyoColor): PuyoPair => ({ main: { color, x: 2, y: 1 },
  sub: { color, x: 2, y: 0 }, rotation: 0, falling: true })

describe('gallery-only foundation extension example', () => {
  it.each([
    ['Y-03', [3, 3, 3, 2, 4, 4], 2, [3, 3, 3, 3, 5, 6]],
    ['Y-08', [3, 3, 3, 3, 4, 3], 1, [3, 3, 3, 4, 5, 5]],
  ] as const)('%s has the same scored foundation but a distinct surface', (id, heights, step, finalHeights) => {
    const source = byId(id)
    const original = structuredClone(source)
    expect(describeFoundationSurface(source)).toEqual({ heights, rightMaxStep: step })
    const extension = findFoundationExtensionExample(source)
    expect(extension).toMatchObject({ color: PuyoColor.GREEN,
      first: { column: 3, rotation: 1 }, second: { column: 5, rotation: 0 } })
    expect(describeFoundationSurface(extension!.finalGrid).heights).toEqual(finalHeights)
    const first = simulateTurn(source, pair(extension!.color), extension!.first)
    const second = simulateTurn(first.stableGrid, pair(extension!.color), extension!.second)
    expect([first.valid, second.valid, first.chainCount, second.chainCount]).toEqual([true, true, 0, 0])
    const fired = second.stableGrid.map(row => [...row])
    fired[9][0] = fired[10][0]
    expect(resolveChains(fired)).toMatchObject({ chainCount: 6, allClear: true })
    expect(source).toEqual(original)
  })

  it('reports no example for a board without a legal virtual starter', () => {
    const source = byId('Y-03')
    source[9][0] = PuyoColor.RED
    expect(findFoundationExtensionExample(source)).toBeNull()
  })
})
