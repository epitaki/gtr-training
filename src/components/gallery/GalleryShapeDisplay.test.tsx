// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TailPlanner } from '../../game/advisor/TailPlanner'
import { PuyoColor } from '../../game/core/types'
import { GALLERY_SHAPES, GTR_COMPLETION_GALLERY, getGalleryGrid } from '../../game/guide/GTRCompletionGallery'
import { GALLERY_DISPLAY_LABELS, GALLERY_SHAPE_GRIDS, galleryExampleLabel } from './GalleryShapeDisplay'
import CompletionGallery from './CompletionGallery'

afterEach(cleanup)
const blueCells = (grid: (PuyoColor | null)[][]) => grid.flatMap((row, y) => row.flatMap((color, x) => color === PuyoColor.BLUE ? [`${x},${y}`] : [])).sort()

describe('gallery skeleton display', () => {
  it.each(GALLERY_SHAPES)('%s matches the planner and all ten teaching examples', shape => {
    const grid = GALLERY_SHAPE_GRIDS[shape]
    const empty = Array.from({ length: 13 }, () => Array(6).fill(null))
    const plan = TailPlanner.getPlans(empty).find(item => item.shape === shape && item.color === PuyoColor.BLUE)!
    expect(blueCells(grid)).toEqual(plan.chainCells.map(({ x, y }) => `${x},${y}`).sort())
    expect(grid.flat().filter(Boolean)).toHaveLength(11)
    const examples = GTR_COMPLETION_GALLERY.filter(item => item.shape === shape)
    expect(examples).toHaveLength(10)
    examples.forEach((example, index) => {
      expect(blueCells(grid)).toEqual(blueCells(getGalleryGrid(example)))
      expect(galleryExampleLabel(example)).toBe(`${GALLERY_SHAPES.indexOf(shape) + 1}-${index + 1}`)
    })
  })

  it('keeps exactly one selected skeleton and shows its ten examples after every selection', () => {
    render(<CompletionGallery onReturn={() => {}} returnLabel="戻る" />)
    const group = screen.getByRole('group', { name: '完成形の骨格を選ぶ' })
    for (const shape of GALLERY_SHAPES) {
      const button = within(group).getByRole('button', { name: GALLERY_DISPLAY_LABELS[shape] })
      fireEvent.click(button)
      expect(within(group).getAllByRole('button').filter(item => item.getAttribute('aria-pressed') === 'true')).toEqual([button])
      const cards = within(screen.getByRole('region', { name: `${GALLERY_DISPLAY_LABELS[shape]}の完成形` })).getAllByRole('button')
      expect(cards).toHaveLength(10)
      cards.forEach((card, index) => expect(card.textContent).toBe(`${GALLERY_SHAPES.indexOf(shape) + 1}-${index + 1}`))
    }
  })
})
