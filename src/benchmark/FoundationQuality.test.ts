import { describe, expect, it } from 'vitest'
import { inspectFoundationGame, summarizeFoundationGames, type FoundationGameInput } from './FoundationQuality'

const empty = '.'.repeat(78)
const ideal = '.'.repeat(54) + '.....RRGYBBRRRGYYBGGYRRB'
const game = (grid: string, fired = false): FoundationGameInput => ({ gameIndex: 0,
  actualFire: fired, maxIntendedChain: fired ? 5 : 0, finalGrid: fired ? empty : grid,
  turns: [{ gridBefore: grid, gridAfter: fired ? empty : grid }] })

describe('foundation quality on visited boards', () => {
  it('counts a perfect board only once per game and keeps the pre-fire board', () => {
    const input = game(ideal, true)
    input.turns = [...input.turns, ...input.turns]
    const original = structuredClone(input)
    expect(inspectFoundationGame(input)).toMatchObject({ peakChain: 5, peakScore: 100,
      foundationFive: true, raisedEdge: true, raisedEdgeFive: true, perfect: true, firedFive: true })
    expect(summarizeFoundationGames([input, game(empty)])).toMatchObject({ games: 2,
      foundationFive: { count: 1, rate: 0.5 }, perfect: { count: 1, rate: 0.5 },
      perfectAmongFiredFive: { count: 1, denominator: 1, rate: 1 } })
    expect(input).toEqual(original)
  })

  it('does not promote an actual full-board five-chain to a foundation five', () => {
    const reported = '.'.repeat(30) + '...B.....Y.....B...GRB...GYBR.RGBRYGRRGBBRGGBYYY'
    expect(inspectFoundationGame(game(reported, true))).toMatchObject({
      peakChain: 4, peakScore: 74, foundationFive: false, raisedEdge: false, perfect: false, firedFive: true,
    })
  })

  it('reports a zero denominator as undefined, not as a zero percent success rate', () => {
    expect(summarizeFoundationGames([])).toMatchObject({ games: 0, perfect: { count: 0, rate: null }, averageMaxHeight: null })
    expect(summarizeFoundationGames([game(ideal)])).toMatchObject({
      perfect: { count: 1, rate: 1 }, perfectAmongFiredFive: { count: 0, denominator: 0, rate: null },
    })
  })

  it('grades the foundation independently from an outside companion', () => {
    const extra = [...ideal]; extra[9 * 6 + 1] = 'Y'
    expect(inspectFoundationGame(game(extra.join('')))).toMatchObject({ foundationFive: true, perfect: true, peakScore: 100 })
  })
})
