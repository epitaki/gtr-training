import { describe, expect, it } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { resolveChains, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { analyzeGTR } from './GTRAnalysis'
import fixture from '../../../docs/research/head-construction-feedback-20260926.json'

const colors = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
const board = (rows: string[], shift = 0): PuyoGrid => [
  ...Array.from({ length: 13 - rows.length }, () => Array<PuyoColor | null>(6).fill(null)),
  ...rows.map(row => [...row].map(c => c === '.' ? null : colors[('RGBY'.indexOf(c) + shift) % 4])),
]
const pair = (value: string, shift = 0): PuyoPair => ({
  main: { color: colors[('RGBY'.indexOf(value[0]) + shift) % 4], x: 2, y: 1 },
  sub: { color: colors[('RGBY'.indexOf(value[1]) + shift) % 4], x: 2, y: 0 }, rotation: 0, falling: true,
})
const three = ['RGY...', 'RRG...', 'GGYYY.']
const five = ['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB']

describe('shared completion and physical supply analysis', () => {
  it('calls a stable core a standard core, without inventing a third link', () => {
    const result = analyzeGTR(board(['RG....', 'RRG...', 'GGY...']), pair('BB'))
    expect(result.title).toBe('標準コア完成')
    expect(result.score.chainCount).toBe(2)
    expect(result.fire.status).toBe('unconfirmed')
    expect(result.cells.filter(cell => cell.use === 'core')).toHaveLength(7)
  })

  it.each([0, 1, 2, 3])('separates a supplied three-chain from a future color, palette %i', shift => {
    const grid = board(three, shift), before = JSON.stringify(grid)
    const supplied = analyzeGTR(grid, pair('RR', shift))
    const waiting = analyzeGTR(grid, pair('BB', shift))
    expect(supplied).toMatchObject({ title: '土台を伸ばそう', score: { chainCount: 3 }, fire: { status: 'current', chainCount: 3 } })
    expect(supplied.fireText).toContain('まだ未発火')
    expect(simulateTurn(grid, pair('RR', shift), supplied.fire.placement!).chainCount).toBe(3)
    expect(waiting.fire).toMatchObject({ status: 'future', chainCount: 3, placement: null })
    expect(waiting.fireText).toContain('将来の色・配置待ち')
    expect(waiting.score).toEqual(supplied.score)
    expect(JSON.stringify(grid)).toBe(before)
  })

  it('keeps foundation scoring separate from real firing and outside blockage', () => {
    const grid = board(five)
    expect(analyzeGTR(grid, pair('RB'))).toMatchObject({ title: '土台5連鎖完成', score: { totalScore: 100 }, fire: { status: 'current', chainCount: 5 } })
    grid[9][0] = PuyoColor.BLUE
    const analysis = analyzeGTR(grid, pair('RR'))
    expect(analysis.score.totalScore).toBe(100)
    expect(analysis.fire.status).toBe('unconfirmed')
    expect(analysis.cells.filter(cell => cell.use === 'outside-unconfirmed')).toHaveLength(1)
  })

  it('classifies every real cell once and explains the current horizontal-head score', () => {
    const grid = board(fixture.horizontalRows), before = structuredClone(grid)
    const analysis = analyzeGTR(grid, pair('YY'))
    expect(analysis.score).toEqual(GTRDetector.detectGTR(grid))
    // The archived 93-point record used the older scoring definition; current config gives 90.
    expect(analysis.score).toMatchObject({ totalScore: 90, chainCount: 5, leftoverPuyos: 1 })
    expect(analysis.fire).toMatchObject({ status: 'future', chainCount: 6 })
    expect(analysis.scoreExplanation).toContain('頭や範囲外の接続見込みは土台へ加点しません')
    expect(analysis.scoreExplanation).toContain('余り1個')
    expect(analysis.cells).toHaveLength(grid.flat().filter(Boolean).length)
    expect(new Set(analysis.cells.map(cell => `${cell.x}:${cell.y}`)).size).toBe(analysis.cells.length)
    expect(analysis.cells.filter(cell => cell.use === 'outside-connected')).toHaveLength(2)
    expect(analysis.cells.filter(cell => cell.use === 'foundation-spare')).toHaveLength(1)
    expect(grid).toEqual(before)
  })

  it('recognizes an actual current pair that supplies the head key and trigger', () => {
    const grid = board(fixture.horizontalRows), current = pair('GB')
    const analysis = analyzeGTR(grid, current)
    expect(analysis.fire).toMatchObject({ status: 'current', chainCount: 6 })
    expect(simulateTurn(grid, current, analysis.fire.placement!)).toMatchObject({ chainCount: 6, allClear: true })
    expect(resolveChains(grid).chainCount).toBe(0)
  })

  it('does not call an unrelated three-chain the main chain', () => {
    const grid = board(['RG....', 'RRG...', 'GGYBBB'])
    expect(simulateTurn(grid, pair('BB'), { column: 5, rotation: 0 }).chainCount).toBeGreaterThan(0)
    expect(analyzeGTR(grid, pair('BB')).fire.status).toBe('unconfirmed')
  })

  it('cannot credit supplied firing when the spawn is blocked or the board is unstable', () => {
    const grid = board(five)
    for (let y = 1; y < 10; y++) grid[y][2] = colors[y % 4]
    expect(analyzeGTR(grid, pair('RR')).fire.status).toBe('blocked')
    const unstable = board(five); unstable[7][5] = PuyoColor.GREEN
    expect(analyzeGTR(unstable, pair('RR'))).toMatchObject({ stage: 'unstable', fire: { status: 'unstable' } })
  })
})
