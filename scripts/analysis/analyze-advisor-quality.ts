import { readFileSync, writeFileSync } from 'node:fs'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'
import { decodeBenchmarkGrid, aggregateBenchmarkGames, type BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'
import { simulateTurn } from '../../src/game/core/ChainSimulator'
import { inspectBoardSurface } from '../../src/game/advisor/BoardSurface'

const [beforePath, afterPath, output] = process.argv.slice(2)
if (!beforePath || !afterPath || !output) throw new Error('Expected before.json after.json output.json')
const before = parseBenchmarkReportJson(readFileSync(beforePath, 'utf8'), beforePath)
const after = parseBenchmarkReportJson(readFileSync(afterPath, 'utf8'), afterPath)
if (JSON.stringify(before.config) !== JSON.stringify(after.config)) throw new Error('Comparison conditions differ')
if (before.modes.length !== 1 || before.modes[0].mode !== 'random') throw new Error('This quality audit compares random mode only')
const oldGames = before.modes[0].games
const newGames = after.modes[0].games
const average = (values: number[]) => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : null
const leftovers23 = (game: BenchmarkGameResult) => {
  const fire = game.turns.find(turn => turn.intendedMainFire)
  if (!fire) return null
  return decodeBenchmarkGrid(fire.gridAfter).reduce((sum, row) => sum + Number(row[1] !== null) + Number(row[2] !== null), 0)
}
const style = (games: BenchmarkGameResult[]) => {
  let turns = 0, splits = 0, splitHeight = 0
  let buildingTurns = 0, deepWellTurns = 0, tallWellTurns = 0, roughness = 0
  const tallWellGames = new Set<number>()
  for (const game of games) for (const turn of game.turns) {
    const pair = {
      main: { color: turn.currentPair.main, x: 2, y: 1 },
      sub: { color: turn.currentPair.sub, x: 2, y: 0 }, rotation: 0, falling: true,
    }
    const result = simulateTurn(decodeBenchmarkGrid(turn.gridBefore), pair, turn.placement)
    if (!result.valid || !result.landing) throw new Error('Invalid stored landing')
    const { mainPos, subPos } = result.landing
    const height = mainPos.x === subPos.x ? 0 : Math.abs(mainPos.y - subPos.y)
    turns++
    if (height) { splits++; splitHeight += height }
    // Compare actual intermediate boards, not an idealized skeleton or the
    // emptied board after firing. No scoring weights enter these metrics.
    if (result.chainCount === 0) {
      const surface = inspectBoardSurface(result.stableGrid)
      buildingTurns++
      roughness += surface.roughness
      if (surface.deepWells > 0) deepWellTurns++
      if (surface.wellDepths.some((depth, x) => depth >= 3 &&
          Math.min(surface.heights[x - 1] ?? 0, surface.heights[x + 1] ?? 0) >= 5)) {
        tallWellTurns++
        tallWellGames.add(game.gameIndex)
      }
    }
  }
  return { games: games.length, turns, splitMoves: splits, splitHeight,
    splitsPer100Turns: turns ? splits / turns * 100 : null,
    buildingTurns, deepWellTurns, tallWellTurns, tallWellGames: tallWellGames.size,
    tallWellsPer100BuildingTurns: buildingTurns ? tallWellTurns / buildingTurns * 100 : null,
    averageSurfaceRoughness: buildingTurns ? roughness / buildingTurns : null,
    firedGames: games.filter(game => game.actualFire).length,
    completedGames: games.filter(game => game.guidedTargetCompleted).length,
    averageLeftoversInColumns23: average(games.flatMap(game => {
      const value = leftovers23(game); return value === null ? [] : [value]
    })),
  }
}
for (let index = 0; index < oldGames.length; index++) {
  if (oldGames[index].gameIndex !== newGames[index].gameIndex || oldGames[index].gameSeed !== newGames[index].gameSeed) {
    throw new Error('Game identities differ')
  }
}
const summarize = (oldSet: BenchmarkGameResult[], newSet: BenchmarkGameResult[]) => {
  const both = oldSet.map((old, index) => ({ old, current: newSet[index] })).filter(pair => pair.old.actualFire && pair.current.actualFire)
  return {
    before: { ...aggregateBenchmarkGames(oldSet), style: style(oldSet) },
    after: { ...aggregateBenchmarkGames(newSet), style: style(newSet) },
    bothFired: {
      games: both.length,
      before: { ...aggregateBenchmarkGames(both.map(pair => pair.old)), style: style(both.map(pair => pair.old)) },
      after: { ...aggregateBenchmarkGames(both.map(pair => pair.current)), style: style(both.map(pair => pair.current)) },
    },
    gainedFive: oldSet.filter((old, index) => old.maxIntendedChain < 5 && newSet[index].maxIntendedChain >= 5).map(game => game.gameIndex),
    lostFive: oldSet.filter((old, index) => old.maxIntendedChain >= 5 && newSet[index].maxIntendedChain < 5).map(game => game.gameIndex),
    leftoverChangesInBothFired: {
      improved: both.filter(pair => pair.current.leftoverPuyos! < pair.old.leftoverPuyos!).length,
      worsened: both.filter(pair => pair.current.leftoverPuyos! > pair.old.leftoverPuyos!).length,
      unchanged: both.filter(pair => pair.current.leftoverPuyos === pair.old.leftoverPuyos).length,
    },
    changedChainCounts: oldSet.flatMap((old, index) => old.maxIntendedChain === newSet[index].maxIntendedChain ? [] : [{
      gameIndex: old.gameIndex, before: old.maxIntendedChain, after: newSet[index].maxIntendedChain,
    }]),
    changedCompletionGames: oldSet.filter((old, index) => old.guidedTargetCompleted !== newSet[index].guidedTargetCompleted).map(game => game.gameIndex),
    changedFireGames: oldSet.filter((old, index) => old.actualFire !== newSet[index].actualFire).map(game => game.gameIndex),
    changedUnintendedClearGames: oldSet.filter((old, index) => old.unintendedClearCount !== newSet[index].unintendedClearCount).map(game => game.gameIndex),
    changedGames: oldSet.filter((old, index) => JSON.stringify(old.turns.map(t => t.gridAfter)) !== JSON.stringify(newSet[index].turns.map(t => t.gridAfter)))
      .map(game => game.gameIndex),
  }
}
const report = {
  beforePath, afterPath, config: before.config,
  definitions: {
    columns23: 'Remaining cells in columns 2/3 immediately after an actual main fire; not all intermediate cells are waste.',
    splits: 'Horizontal pair with unequal landing rows; not a measured time or a judgment that a split is unnecessary.',
    surface: 'Non-clearing turns only. Deep well: an interior column at least 3 rows below both neighbors; tall well also requires both neighbors at least 5 rows high. Roughness: sum of absolute adjacent height differences, including the left fire entrance. Pure geometry, not proof of useless puyos or a broken chain.',
    averages: 'Participation/leftovers/fire turns only average fired games; completion turns only average completed games. Existing aggregate metrics use 0 without samples; style averages use null. Check firedGames/completedGames denominators.',
  },
  all: summarize(oldGames, newGames),
  first500: summarize(oldGames.slice(0, 500), newGames.slice(0, 500)),
  second500: oldGames.length > 500 ? summarize(oldGames.slice(500), newGames.slice(500)) : null,
}
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
