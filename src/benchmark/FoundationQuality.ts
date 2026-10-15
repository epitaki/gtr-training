import { GTRDetector } from '../game/gtr/GTRPatterns'
import { inspectBoardSurface } from '../game/advisor/BoardSurface'
import { decodeBenchmarkGrid, type BenchmarkGameResult } from './AdvisorBenchmark'

export type FoundationGameInput = Pick<BenchmarkGameResult, 'gameIndex' | 'actualFire' | 'maxIntendedChain' | 'finalGrid'> & {
  turns: readonly Pick<BenchmarkGameResult['turns'][number], 'gridBefore' | 'gridAfter'>[]
}

/** Settled, actually visited boards only. Never fill a target or count a search node. */
export function inspectFoundationGame(game: FoundationGameInput) {
  const boards = new Set([game.finalGrid, ...game.turns.flatMap(turn => [turn.gridBefore, turn.gridAfter])])
  let peakChain = 0, peakScore = 0, raisedEdge = false, raisedEdgeFive = false, maxHeight = 0
  for (const encoded of boards) {
    const grid = decodeBenchmarkGrid(encoded)
    const score = GTRDetector.detectGTR(grid)
    peakChain = Math.max(peakChain, score.chainCount)
    peakScore = Math.max(peakScore, score.totalScore)
    raisedEdge ||= score.rightEdgeRaised === true
    raisedEdgeFive ||= score.rightEdgeRaised === true && score.chainCount >= 5
    maxHeight = Math.max(maxHeight, ...inspectBoardSurface(grid).heights)
  }
  return { gameIndex: game.gameIndex, peakChain, peakScore, raisedEdge, raisedEdgeFive, maxHeight,
    foundationFive: peakChain >= 5, perfect: peakScore === 100,
    firedFive: game.actualFire && game.maxIntendedChain >= 5 }
}

export function summarizeFoundationGames(games: readonly FoundationGameInput[]) {
  const perGame = games.map(inspectFoundationGame)
  const ratio = (count: number, denominator: number) => denominator ? count / denominator : null
  const count = (key: 'foundationFive' | 'raisedEdge' | 'raisedEdgeFive' | 'perfect' | 'firedFive') =>
    perGame.filter(game => game[key]).length
  const foundationFive = count('foundationFive'), raisedEdge = count('raisedEdge')
  const raisedEdgeFive = count('raisedEdgeFive'), perfect = count('perfect'), firedFive = count('firedFive')
  const perfectFiredFive = perGame.filter(game => game.perfect && game.firedFive).length
  return { games: games.length,
    foundationFive: { count: foundationFive, rate: ratio(foundationFive, games.length) },
    raisedEdge: { count: raisedEdge, rate: ratio(raisedEdge, games.length) },
    raisedEdgeFive: { count: raisedEdgeFive, rate: ratio(raisedEdgeFive, games.length) },
    perfect: { count: perfect, rate: ratio(perfect, games.length) },
    perfectAmongFiredFive: { count: perfectFiredFive, denominator: firedFive, rate: ratio(perfectFiredFive, firedFive) },
    averageMaxHeight: ratio(perGame.reduce((sum, game) => sum + game.maxHeight, 0), games.length), perGame }
}
