import { describe, expect, it } from 'vitest'
import { PuyoColor, type PuyoPair } from '../core/types'
import { isSpawnBlocked, simulateTurn, type PuyoGrid } from '../core/ChainSimulator'
import { GTRDetector } from '../gtr/GTRPatterns'
import { ContinuousAdvisor } from './ContinuousAdvisor'
import { PlacementAdvisor } from './PlacementAdvisor'
import { comparePerfectFoundationRoutes, findPerfectFoundationRoutes } from './PerfectFoundationPlanner'
import { inspectConnectedExtension, traceFoundation } from './ConnectedExtension'

const palette = [PuyoColor.RED, PuyoColor.GREEN, PuyoColor.BLUE, PuyoColor.YELLOW]
function fixtures(shift = 0) {
  const color = (c: string) => palette[('RGBY'.indexOf(c) + shift) % 4]
  const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
    ...rows.map(row => [...row].map(c => c === '.' ? null : color(c)))]
  const pair = (p: string): PuyoPair => ({ main: { color: color(p[0]), x: 2, y: 1 },
    sub: { color: color(p[1]), x: 2, y: 0 }, rotation: 0, falling: true })
  const plan = (p: string) => ({ colorA: color(p[0]), colorB: color(p[1]), colorC: color(p[0]), colorD: color(p[1]) })
  return { board, pair, plan }
}

describe('visible-pair perfect foundation construction', () => {
  it.each([0, 1, 2, 3])('finishes the right-edge step with a real pair, colors +%i', shift => {
    const { board, pair, plan } = fixtures(shift)
    const grid = board(['RGYBBR', 'RRGYYB', 'GGYRRB']), original = structuredClone(grid)
    const pairs = ['RR', 'BG', 'YB'].map(pair)
    const routes = findPerfectFoundationRoutes(grid, pairs)
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route).toMatchObject({ tailShape: 'Y', tailColor: pair('YB').main.color })
      let state = grid
      route.path.forEach((p, i) => {
        const outcome = simulateTurn(state, pairs[i], p)
        expect(outcome.valid).toBe(true)
        expect(outcome.chainCount).toBe(0)
        expect(isSpawnBlocked(outcome.stableGrid)).toBe(false)
        state = outcome.stableGrid
      })
      expect(GTRDetector.detectGTR(state)).toMatchObject({ totalScore: 100, chainCount: 5, leftoverPuyos: 0 })
      expect(PlacementAdvisor.isAdaptiveTailComplete(state)).toBe(true)
      expect(inspectConnectedExtension(state, traceFoundation(state)!)).not.toBeNull()
    }
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, ...pairs as [PuyoPair, PuyoPair, PuyoPair], plan('RG'))
    expect(GTRDetector.detectGTR(simulateTurn(grid, pairs[0], advice.bestPlacement!.placement).stableGrid).totalScore).toBe(100)
    expect(advice.phaseMessage).toContain('土台5連鎖を完成させよう')
    expect(advice.bestPlacement).toMatchObject({ tailShape: 'Y', tailColor: pair('YB').main.color })
    expect(grid).toEqual(original)
  })

  const colorOrders = palette.flatMap(a => palette.filter(b => b !== a).flatMap(b =>
    palette.filter(c => c !== a && c !== b).map(c =>
      [a, b, c, palette.find(d => d !== a && d !== b && d !== c)!])))
  for (const sample of [
    { name: 'Y8 raised fifth column', rows: ['......', 'RGBYRY', 'RRGBBR', 'GGBYRR'], current: 'YY', column: 4 },
    { name: 'Y3 sixth-column finish', rows: ['.....Y', 'RGB.YR', 'RRGBBR', 'GGBYYR'], current: 'RR', column: 4 },
    { name: 'Y3 outside companion', rows: ['....R.', 'RGB.YR', 'RRGBBR', 'GGBYYR'], current: 'YY', column: 5 },
  ]) it.each(colorOrders.map((colors, index) => ({ colors, index })))(
    `proves ${sample.name} with a legal visible placement, color permutation $index`, ({ colors }) => {
    const color = (letter: string) => colors['RGBY'.indexOf(letter)]
    const board = (rows: string[]): PuyoGrid => [...Array.from({ length: 13 - rows.length }, () => Array(6).fill(null)),
      ...rows.map(row => [...row].map(letter => letter === '.' ? null : color(letter)))]
    const pair = (letters: string): PuyoPair => ({ main: { color: color(letters[0]), x: 2, y: 1 },
      sub: { color: color(letters[1]), x: 2, y: 0 }, rotation: 0, falling: true })
    const plan = (letters: string) => ({ colorA: color(letters[0]), colorB: color(letters[1]),
      colorC: color(letters[0]), colorD: color(letters[1]) })
    const grid = board(sample.rows), current = pair(sample.current)
    const original = structuredClone({ grid, current })
    const placement = { column: sample.column, rotation: 0 }
    const outcome = simulateTurn(grid, current, placement)
    expect(outcome.valid).toBe(true)
    expect(outcome.chainCount).toBe(0)
    expect(isSpawnBlocked(outcome.stableGrid)).toBe(false)
    expect(GTRDetector.detectGTR(outcome.stableGrid)).toMatchObject({ totalScore: 100, chainCount: 5, leftoverPuyos: 0 })
    expect(PlacementAdvisor.isAdaptiveTailComplete(outcome.stableGrid)).toBe(true)
    expect(inspectConnectedExtension(outcome.stableGrid, traceFoundation(outcome.stableGrid)!))
      .toMatchObject({ realLeftovers: 0 })
    const routes = findPerfectFoundationRoutes(grid, [current], new Set([`${placement.column}:${placement.rotation}`]))
    expect(routes).toHaveLength(1)
    expect(routes[0].path).toEqual([placement])
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, current, undefined, undefined, plan('RG'))
    expect(advice.bestPlacement).not.toBeNull()
    const recommended = simulateTurn(grid, current, advice.bestPlacement!.placement)
    expect(recommended.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(recommended.stableGrid).totalScore).toBe(100)
    expect({ grid, current }).toEqual(original)
  })

  it('keeps an earlier Y3 finish ahead of a cleaner later one and chooses less split effort', () => {
    const { board, pair } = fixtures()
    const grid = board(['.....Y', 'RGB.YR', 'RRGBBR', 'GGBYYR'])
    const routes = findPerfectFoundationRoutes(grid, [pair('RB'), pair('RR')])
    const immediate = routes.filter(route => route.path.length === 1)
    const delayed = routes.find(route => route.path.length === 2 && route.connection.realLeftovers === 0)
    expect(delayed).toBeDefined()
    expect(immediate).toContainEqual(expect.objectContaining({ placement: { column: 4, rotation: 0 },
      splitCost: 0, connection: expect.objectContaining({ realLeftovers: 1 }) }))
    expect(immediate).toContainEqual(expect.objectContaining({ placement: { column: 4, rotation: 1 },
      splitCost: 8, connection: expect.objectContaining({ realLeftovers: 1 }) }))
    expect(routes[0].placement).toEqual({ column: 4, rotation: 0 })
  })

  it('compares every same-depth success for one root and chooses the smaller right-side step sum', () => {
    const { board, pair } = fixtures()
    const grid = board(['RGYBBR', 'RRGYYB', 'GGYRRB'])
    const first = { column: 1, rotation: 0 }
    const afterFirst = simulateTurn(grid, pair('RB'), first)
    expect(afterFirst.valid && afterFirst.chainCount === 0).toBe(true)
    for (const column of [3, 4, 5]) {
      const terminal = simulateTurn(afterFirst.stableGrid, pair('RR'), { column, rotation: 0 })
      expect(GTRDetector.detectGTR(terminal.stableGrid).totalScore).toBe(100)
      expect(inspectConnectedExtension(terminal.stableGrid, traceFoundation(terminal.stableGrid)!))
        .toMatchObject({ realLeftovers: 1 })
    }
    const routes = findPerfectFoundationRoutes(grid, [pair('RB'), pair('RR')], new Set(['1:0']))
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ path: [first, { column: 5, rotation: 0 }],
      splitCost: 0, surfaceCost: 0, maxHeight: 5, maxRightStep: 2, rightStepSum: 2 })
  })

  it('reports truly equal routes as equal so the guide retains its prior candidate order', () => {
    const { board, pair, plan } = fixtures()
    const grid = board(['RGYBBR', 'RRGYYB', 'GGYRRB'])
    const current = pair('YY'), next = pair('RR')
    const routes = findPerfectFoundationRoutes(grid, [current, next])
    const twins = routes.filter(route => route.placement.column === 1 &&
      [0, 2].includes(route.placement.rotation))
    expect(twins).toHaveLength(2)
    expect(comparePerfectFoundationRoutes(twins[0], twins[1])).toBe(0)
    const field = { grid, width: 6, height: 13 }
    const relativeOrder = (placements: { placement: { column: number; rotation: number } }[]) =>
      placements.map(item => item.placement).filter(placement => placement.column === 1 &&
        [0, 2].includes(placement.rotation))
    const ordinary = PlacementAdvisor.getAdvice(field, current, next, undefined, plan('RG'))
    const guided = ContinuousAdvisor.getAdvice(field, current, next, undefined, plan('RG'))
    expect(relativeOrder(guided.allPlacements)).toEqual(relativeOrder(ordinary.allPlacements))
  })

  it.each([0, 1, 2, 3])('proves the three-pair route without inventing a missing color, colors +%i', shift => {
    const { board, pair } = fixtures(shift)
    const grid = board(['.G...G', '.G...G', 'YB..BG', 'YYBRRB', 'BBRGGB'])
    const pairs = ['GY', 'RG', 'RB'].map(pair)
    expect(findPerfectFoundationRoutes(grid, pairs.slice(0, 2))).toEqual([])
    const routes = findPerfectFoundationRoutes(grid, pairs)
    expect(routes.length).toBeGreaterThan(0)
    expect(routes[0].path).toHaveLength(3)
    let state = grid
    for (const [i, placement] of routes[0].path.entries()) {
      const outcome = simulateTurn(state, pairs[i], placement)
      expect(outcome.chainCount).toBe(0)
      state = outcome.stableGrid
    }
    expect(GTRDetector.detectGTR(state).totalScore).toBe(100)
    expect(PlacementAdvisor.isAdaptiveTailComplete(state)).toBe(true)
    // The outside head may be useful; do not ban a column or a shape by name.
    // Every returned route must preserve a connected teaching tail as well.
    for (const route of routes) {
      const final = route.path.reduce((state, placement, i) => simulateTurn(state, pairs[i], placement).stableGrid, grid)
      expect(PlacementAdvisor.isAdaptiveTailComplete(final)).toBe(true)
    }
    const unseen: PuyoPair = { ...pair('RY'), get main(): PuyoPair['main'] { throw new Error('hidden pair was read') } }
    expect(findPerfectFoundationRoutes(grid, [...pairs, unseen])).toEqual(routes)
    expect(findPerfectFoundationRoutes(grid, pairs, new Set())).toEqual([])
  })

  it('does not optimize an unfinished fold or erase an incompatible central upper puyo', () => {
    const { board, pair } = fixtures()
    const grid = board(['RGYBBR', 'RRGYYB', 'GGYRRB'])
    grid[10][0] = null
    expect(findPerfectFoundationRoutes(grid, ['RR', 'BG', 'YB'].map(pair))).toEqual([])
    const central = board(['..B...', 'RGYBBR', 'RRGYYB', 'GGYRRB'])
    expect(findPerfectFoundationRoutes(central, ['RR', 'BG', 'YB'].map(pair))).toEqual([])
    expect(findPerfectFoundationRoutes([], [pair('RR')])).toEqual([])
  })

  it('does not trade a physically blocked entrance for a masked perfect score', () => {
    const { board, pair } = fixtures()
    const grid = board(['B.....', 'RGYBBR', 'RRGYYB', 'GGYRRB'])
    const physical = simulateTurn(grid, pair('RR'), { column: 5, rotation: 0 })
    expect(GTRDetector.detectGTR(physical.stableGrid).totalScore).toBe(100)
    expect(inspectConnectedExtension(physical.stableGrid, traceFoundation(physical.stableGrid)!)).toBeNull()
    expect(findPerfectFoundationRoutes(grid, [pair('RR')])).toEqual([])
  })

  it('does not prefer perfect scoring when even the hypothetical fire leaves too many spares', () => {
    const { board, pair } = fixtures()
    const grid = board(['.....B', '.G...B', '.G...B', '.B...G', 'GB.YYG', 'GGBRRY', 'BBRGGY'])
    expect(findPerfectFoundationRoutes(grid, ['GG', 'GR', 'BB'].map(pair))).toEqual([])
  })

  it('continues a perfect foundation through physical connections without requiring it to stay at 100', () => {
    const { board, pair, plan } = fixtures()
    const grid = board(['.Y...R', 'RGYBBR', 'RRGYYB', 'GGYRRB'])
    const pairs = ['BG', 'YR', 'GB'].map(pair)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, ...pairs as [PuyoPair, PuyoPair, PuyoPair], plan('RG'))
    const outcome = simulateTurn(grid, pairs[0], advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(outcome.stableGrid).chainCount).toBeGreaterThanOrEqual(5)
    expect(inspectConnectedExtension(outcome.stableGrid, traceFoundation(grid)!)).not.toBeNull()
  })

  it.each([0, 1, 2, 3])('does not lock spare pairs onto an outside tower just to keep 100, colors +%i', shift => {
    const { board, pair, plan } = fixtures(shift)
    const grid = board(['R.....', 'G.....', 'YG...G', 'GG...G', 'YBRBBG', 'YYBRRB', 'BBRGGB'])
    const pairs = ['YY', 'BG', 'BY'].map(pair)
    expect(GTRDetector.detectGTR(grid).totalScore).toBe(100)
    const oldLock = simulateTurn(grid, pairs[0], { column: 1, rotation: 0 })
    expect(GTRDetector.detectGTR(oldLock.stableGrid).totalScore).toBe(100)
    const advice = ContinuousAdvisor.getAdvice({ grid, width: 6, height: 13 }, ...pairs as [PuyoPair, PuyoPair, PuyoPair], plan('YB'))
    const outcome = simulateTurn(grid, pairs[0], advice.bestPlacement!.placement)
    expect(outcome.chainCount).toBe(0)
    expect(GTRDetector.detectGTR(outcome.stableGrid).chainCount).toBe(5)
    expect(GTRDetector.detectGTR(outcome.stableGrid).totalScore).toBeLessThan(100)
    expect(inspectConnectedExtension(outcome.stableGrid, traceFoundation(grid)!)).not.toBeNull()
  })
})
