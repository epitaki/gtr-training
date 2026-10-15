import { isSpawnBlocked, simulateTurn, type Placement, type PuyoGrid } from '../game/core/ChainSimulator'
import { PuyoColor, type PuyoPair } from '../game/core/types'
import {
  aggregateBenchmarkGames,
  BENCHMARK_VERSION,
  classifyOpening,
  createOpeningPairs,
  createRandomBenchmarkPair,
  decodeBenchmarkGrid,
  deriveBenchmarkGameSeed,
  determineBenchmarkFailureReason,
  encodeBenchmarkGrid,
  SeededRandom,
  validateBenchmarkConfig,
  type BenchmarkAggregate,
  type BenchmarkConfig,
  type BenchmarkFailureReason,
  type BenchmarkGameResult,
  type BenchmarkMode,
  type BenchmarkOpeningKind,
  type BenchmarkPair,
  type BenchmarkReport,
} from './AdvisorBenchmark'

type JsonRecord = Record<string, unknown>

const MODES = new Set<BenchmarkMode>(['random', 'adversarial'])
const OPENINGS = new Set<BenchmarkOpeningKind>([
  'AAAA', 'AAAB', 'AABB', 'ABAB', 'AABC', 'ABAC', 'ABCD',
])
const COLORS = new Set<PuyoColor>(Object.values(PuyoColor))
const PHASES = new Set(['fold_building', 'chain_tail', 'completion'])
const FAILURE_REASONS = new Set<BenchmarkFailureReason>([
  'game_over',
  'no_legal_placement',
  'invalid_recommended_placement',
  'core_not_completed',
  'tail_not_completed',
  'actual_fire_not_reached',
])
const RATE_METRICS = [
  'coreCompletionRate',
  'guidedTargetCompletionRate',
  'actualFireAvailableRate',
  'actualFireRate',
  'chain3Rate',
  'chain5Rate',
  'chain7Rate',
  'unintendedClearRate',
  'averageParticipationRate',
  'gameOverRate',
  'allClearRate',
  'gtrAvoidanceRate',
] as const
const AVERAGE_METRICS = [
  'averageCompletionTurns',
  'averageFireTurns',
  'averageLeftoverPuyos',
  'averageMaxColumnHeight',
] as const

const fail = (path: string, message: string): never => {
  throw new Error(`invalid benchmark report at ${path}: ${message}`)
}

const recordAt = (value: unknown, path: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected an object')
  }
  return value as JsonRecord
}

const arrayAt = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) fail(path, 'expected an array')
  return value as unknown[]
}

const stringAt = (value: unknown, path: string): string => {
  if (typeof value !== 'string') fail(path, 'expected a string')
  return value as string
}

const numberAt = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'expected a finite number')
  }
  return value as number
}

const integerAt = (value: unknown, path: string): number => {
  const number = numberAt(value, path)
  if (!Number.isInteger(number)) fail(path, 'expected an integer')
  return number
}

const booleanAt = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean')
  return value as boolean
}

const nonNegativeIntegerAt = (
  value: unknown,
  path: string,
  maximum?: number,
): number => {
  const number = integerAt(value, path)
  if (number < 0) fail(path, 'expected a non-negative integer')
  if (maximum !== undefined && number > maximum) {
    fail(path, `expected at most ${maximum}`)
  }
  return number
}

const nullableTurnAt = (
  value: unknown,
  maximum: number,
  path: string,
): number | null => {
  if (value === null) return null
  const turn = integerAt(value, path)
  if (turn < 1 || turn > maximum) fail(path, `expected 1..${maximum}`)
  return turn
}

const ratioAt = (value: unknown, path: string): number => {
  const ratio = numberAt(value, path)
  if (ratio < 0 || ratio > 1) fail(path, 'expected 0..1')
  return ratio
}

const enumAt = <T extends string>(
  value: unknown,
  values: ReadonlySet<T>,
  path: string,
): T => {
  const item = stringAt(value, path)
  if (!values.has(item as T)) fail(path, `unsupported value: ${item}`)
  return item as T
}

const gridAt = (value: unknown, path: string): string => {
  const grid = stringAt(value, path)
  if (!/^[.RGBY]{78}$/.test(grid)) {
    fail(path, 'expected a 78-character encoded grid')
  }
  return grid
}

const pairAt = (value: unknown, path: string): BenchmarkPair => {
  const pair = recordAt(value, path)
  return {
    main: enumAt(pair.main, COLORS, `${path}.main`),
    sub: enumAt(pair.sub, COLORS, `${path}.sub`),
  }
}

const toPuyoPair = (pair: BenchmarkPair): PuyoPair => ({
  main: { color: pair.main, x: 2, y: 1 },
  sub: { color: pair.sub, x: 2, y: 0 },
  rotation: 0,
  falling: true,
})

const toBenchmarkPair = (pair: PuyoPair): BenchmarkPair => ({
  main: pair.main.color,
  sub: pair.sub.color,
})

const pairsEqual = (left: BenchmarkPair, right: BenchmarkPair): boolean =>
  left.main === right.main && left.sub === right.sub

const expectPair = (
  actual: BenchmarkPair,
  expected: BenchmarkPair,
  path: string,
): void => {
  if (!pairsEqual(actual, expected)) {
    fail(
      path,
      `expected ${expected.main}/${expected.sub}, got ${actual.main}/${actual.sub}`,
    )
  }
}

const placementAt = (value: unknown, path: string): void => {
  const placement = recordAt(value, path)
  const column = integerAt(placement.column, `${path}.column`)
  const rotation = integerAt(placement.rotation, `${path}.rotation`)
  if (column < 0 || column > 5) fail(`${path}.column`, 'expected 0..5')
  if (rotation < 0 || rotation > 3) fail(`${path}.rotation`, 'expected 0..3')
}

const aggregateAt = (
  value: unknown,
  expectedGames: number,
  path: string,
): void => {
  const aggregate = recordAt(value, path)
  const metrics = recordAt(aggregate.metrics, `${path}.metrics`)
  const games = integerAt(metrics.games, `${path}.metrics.games`)
  if (games < 0) fail(`${path}.metrics.games`, 'expected a non-negative integer')
  if (games !== expectedGames) {
    fail(`${path}.metrics.games`, `expected ${expectedGames}, got ${games}`)
  }
  for (const metric of RATE_METRICS) {
    const rate = numberAt(metrics[metric], `${path}.metrics.${metric}`)
    if (rate < 0 || rate > 1) fail(`${path}.metrics.${metric}`, 'expected 0..1')
  }
  for (const metric of AVERAGE_METRICS) {
    const average = numberAt(metrics[metric], `${path}.metrics.${metric}`)
    if (average < 0) fail(`${path}.metrics.${metric}`, 'expected a non-negative number')
  }
  const reasons = recordAt(aggregate.failureReasons, `${path}.failureReasons`)
  let failures = 0
  for (const reason of FAILURE_REASONS) {
    const count = integerAt(reasons[reason], `${path}.failureReasons.${reason}`)
    if (count < 0) {
      fail(`${path}.failureReasons.${reason}`, 'expected a non-negative integer')
    }
    failures += count
  }
  if (failures > games) {
    fail(`${path}.failureReasons`, 'total cannot exceed metrics.games')
  }
}

const validateAggregateMatches = (
  value: unknown,
  games: BenchmarkGameResult[],
  path: string,
): void => {
  aggregateAt(value, games.length, path)
  const aggregate = recordAt(value, path)
  const metrics = recordAt(aggregate.metrics, `${path}.metrics`)
  const reasons = recordAt(aggregate.failureReasons, `${path}.failureReasons`)
  const expected: BenchmarkAggregate = aggregateBenchmarkGames(games)
  for (const [metric, expectedValue] of Object.entries(expected.metrics)) {
    if (metrics[metric] !== expectedValue) {
      fail(
        `${path}.metrics.${metric}`,
        `expected ${expectedValue}, got ${String(metrics[metric])}`,
      )
    }
  }
  for (const [reason, expectedValue] of Object.entries(expected.failureReasons)) {
    if (reasons[reason] !== expectedValue) {
      fail(
        `${path}.failureReasons.${reason}`,
        `expected ${expectedValue}, got ${String(reasons[reason])}`,
      )
    }
  }
}

const turnAt = (
  value: unknown,
  expectedTurn: number,
  maxTurns: number,
  path: string,
): void => {
  const turn = recordAt(value, path)
  const turnNumber = integerAt(turn.turn, `${path}.turn`)
  if (turnNumber !== expectedTurn) fail(`${path}.turn`, `expected ${expectedTurn}`)
  if (turnNumber > maxTurns) fail(`${path}.turn`, `expected at most ${maxTurns}`)
  pairAt(turn.currentPair, `${path}.currentPair`)
  pairAt(turn.nextPair, `${path}.nextPair`)
  pairAt(turn.nextNextPair, `${path}.nextNextPair`)
  placementAt(turn.placement, `${path}.placement`)
  numberAt(turn.totalScore, `${path}.totalScore`)
  enumAt(turn.phase, PHASES, `${path}.phase`)
  const chainCount = nonNegativeIntegerAt(
    turn.chainCount,
    `${path}.chainCount`,
    78,
  )
  const clearedPuyos = nonNegativeIntegerAt(
    turn.clearedPuyos,
    `${path}.clearedPuyos`,
    78,
  )
  const intendedMainFire = booleanAt(
    turn.intendedMainFire,
    `${path}.intendedMainFire`,
  )
  const collateralClear = booleanAt(turn.collateralClear, `${path}.collateralClear`)
  const intendedMainChainCount = nonNegativeIntegerAt(
    turn.intendedMainChainCount,
    `${path}.intendedMainChainCount`,
    78,
  )
  const intendedMainClearedPuyos = nonNegativeIntegerAt(
    turn.intendedMainClearedPuyos,
    `${path}.intendedMainClearedPuyos`,
    78,
  )
  const allClear = booleanAt(turn.allClear, `${path}.allClear`)
  if ((chainCount === 0) !== (clearedPuyos === 0)) {
    fail(`${path}.clearedPuyos`, 'must be zero exactly when chainCount is zero')
  }
  if (clearedPuyos < chainCount * 4) {
    fail(`${path}.clearedPuyos`, 'must clear at least four puyos per chain step')
  }
  if (!intendedMainFire && (
    intendedMainChainCount !== 0 ||
    intendedMainClearedPuyos !== 0 ||
    collateralClear
  )) {
    fail(path, 'non-fire turns cannot contain intended-fire results')
  }
  if (intendedMainFire && (
    intendedMainChainCount === 0 ||
    intendedMainClearedPuyos === 0 ||
    intendedMainClearedPuyos < intendedMainChainCount * 4 ||
    chainCount < intendedMainChainCount ||
    clearedPuyos < intendedMainClearedPuyos
  )) {
    fail(path, 'intended-fire results must be positive and fit the physical clear')
  }
  if (allClear && clearedPuyos === 0) {
    fail(`${path}.allClear`, 'requires a clear')
  }
  gridAt(turn.gridBefore, `${path}.gridBefore`)
  gridAt(turn.gridAfter, `${path}.gridAfter`)
}

const terminalInputAt = (
  value: unknown,
  expectedTurn: number,
  maxTurns: number,
  path: string,
): void => {
  const input = recordAt(value, path)
  const turn = integerAt(input.turn, `${path}.turn`)
  if (turn !== expectedTurn) fail(`${path}.turn`, `expected ${expectedTurn}`)
  if (turn > maxTurns) fail(`${path}.turn`, `expected at most ${maxTurns}`)
  pairAt(input.currentPair, `${path}.currentPair`)
  pairAt(input.nextPair, `${path}.nextPair`)
  pairAt(input.nextNextPair, `${path}.nextNextPair`)
  gridAt(input.gridBefore, `${path}.gridBefore`)
  if (input.recommendedPlacement !== null) {
    placementAt(input.recommendedPlacement, `${path}.recommendedPlacement`)
  }
}

const countPuyos = (grid: PuyoGrid): number => grid.reduce(
  (total, row) => total + row.filter(color => color !== null).length,
  0,
)

const maximumColumnHeight = (grid: PuyoGrid): number => {
  let maximum = 0
  for (let x = 0; x < 6; x++) {
    const top = grid.findIndex(row => row[x] !== null)
    if (top >= 0) maximum = Math.max(maximum, grid.length - top)
  }
  return maximum
}

const placementFrom = (value: unknown, path: string): Placement => {
  const placement = recordAt(value, path)
  return {
    column: placement.column as number,
    rotation: placement.rotation as number,
  }
}

const validatePhysicalTrace = (
  game: JsonRecord,
  turns: unknown[],
  terminalInput: JsonRecord | null,
  path: string,
): void => {
  let grid = decodeBenchmarkGrid('.'.repeat(78))
  let actualFire = false
  let maxIntendedChain = 0
  let maxPhysicalChain = 0
  let unintendedClearCount = 0
  let allClear = false
  let fireTurn: number | null = null
  let participationRate: number | null = null
  let leftoverPuyos: number | null = null
  let maxColumnHeight = 0
  let gameOver = false

  for (const [index, rawTurn] of turns.entries()) {
    const turnNumber = index + 1
    const turnPath = `${path}.turns[${index}]`
    const turn = recordAt(rawTurn, turnPath)
    const gridBefore = grid
    const pair = toPuyoPair(pairAt(turn.currentPair, `${turnPath}.currentPair`))
    const placement = placementFrom(turn.placement, `${turnPath}.placement`)
    const outcome = simulateTurn(gridBefore, pair, placement)
    const landing = outcome.landing
    if (!outcome.valid || !landing) {
      fail(`${turnPath}.placement`, 'must produce a valid physical turn')
    }
    if (turn.chainCount !== outcome.chainCount) {
      fail(`${turnPath}.chainCount`, `expected ${outcome.chainCount}`)
    }
    if (turn.clearedPuyos !== outcome.clearedPuyos) {
      fail(`${turnPath}.clearedPuyos`, `expected ${outcome.clearedPuyos}`)
    }
    if (turn.allClear !== outcome.allClear) {
      fail(`${turnPath}.allClear`, `expected ${outcome.allClear}`)
    }
    const encodedAfter = encodeBenchmarkGrid(outcome.stableGrid)
    if (turn.gridAfter !== encodedAfter) {
      fail(`${turnPath}.gridAfter`, 'does not match the simulated placement')
    }

    const intendedMainFire = turn.intendedMainFire as boolean
    const collateralClear = turn.collateralClear as boolean
    const intendedMainChainCount = turn.intendedMainChainCount as number
    const intendedMainClearedPuyos = turn.intendedMainClearedPuyos as number
    maxPhysicalChain = Math.max(maxPhysicalChain, outcome.chainCount)
    if (outcome.chainCount > 0 && (!intendedMainFire || collateralClear)) {
      unintendedClearCount++
    }
    if (intendedMainFire) {
      actualFire = true
      maxIntendedChain = Math.max(maxIntendedChain, intendedMainChainCount)
      fireTurn ??= turnNumber
      const puyosBeforeClear = countPuyos(outcome.placedGrid)
      participationRate = puyosBeforeClear === 0
        ? 0
        : intendedMainClearedPuyos / puyosBeforeClear
      leftoverPuyos = countPuyos(outcome.stableGrid)
    }

    allClear ||= outcome.clearedPuyos > 0 && outcome.allClear
    grid = outcome.stableGrid
    maxColumnHeight = Math.max(maxColumnHeight, maximumColumnHeight(grid))
    gameOver = isSpawnBlocked(grid)
  }

  const derived = {
    actualFire,
    maxIntendedChain,
    maxPhysicalChain,
    unintendedClearCount,
    allClear,
    fireTurn,
    participationRate,
    leftoverPuyos,
    maxColumnHeight,
    gameOver,
    finalGrid: encodeBenchmarkGrid(grid),
  }
  for (const [field, expected] of Object.entries(derived)) {
    if (game[field] !== expected) {
      fail(`${path}.${field}`, `expected ${String(expected)}, got ${String(game[field])}`)
    }
  }

  if (terminalInput !== null) {
    const terminalPath = `${path}.terminalInput`
    const pair = toPuyoPair(pairAt(
      terminalInput.currentPair,
      `${terminalPath}.currentPair`,
    ))
    const recommended = terminalInput.recommendedPlacement
    if (recommended === null) {
      const hasLegalPlacement = Array.from({ length: 6 }, (_, column) =>
        Array.from({ length: 4 }, (_, rotation) =>
          simulateTurn(grid, pair, { column, rotation }).valid,
        ),
      ).flat().some(Boolean)
      if (hasLegalPlacement) {
        fail(`${terminalPath}.recommendedPlacement`, 'legal placements still exist')
      }
    } else {
      const outcome = simulateTurn(
        grid,
        pair,
        placementFrom(recommended, `${terminalPath}.recommendedPlacement`),
      )
      if (outcome.valid && outcome.landing) {
        fail(`${terminalPath}.recommendedPlacement`, 'expected an invalid placement')
      }
    }
  }
}

const gameAt = (
  value: unknown,
  expectedMode: BenchmarkMode,
  expectedGameIndex: number,
  expectedGameSeed: number,
  expectedMaxTurns: number,
  expectedOpeningKind: BenchmarkOpeningKind,
  path: string,
): BenchmarkGameResult => {
  const game = recordAt(value, path)
  const mode = enumAt(game.mode, MODES, `${path}.mode`)
  if (mode !== expectedMode) fail(`${path}.mode`, `expected ${expectedMode}`)
  const gameIndex = integerAt(game.gameIndex, `${path}.gameIndex`)
  if (gameIndex < 0) fail(`${path}.gameIndex`, 'expected a non-negative integer')
  if (gameIndex !== expectedGameIndex) {
    fail(`${path}.gameIndex`, `expected ${expectedGameIndex}`)
  }
  const gameSeed = nonNegativeIntegerAt(game.gameSeed, `${path}.gameSeed`, 0xffffffff)
  if (gameSeed !== expectedGameSeed) {
    fail(`${path}.gameSeed`, `expected ${expectedGameSeed}`)
  }
  const maxTurns = integerAt(game.maxTurns, `${path}.maxTurns`)
  if (maxTurns <= 0) fail(`${path}.maxTurns`, 'expected a positive integer')
  if (maxTurns !== expectedMaxTurns) {
    fail(`${path}.maxTurns`, `expected ${expectedMaxTurns}`)
  }
  const openingKind = enumAt(game.openingKind, OPENINGS, `${path}.openingKind`)
  if (openingKind !== expectedOpeningKind) {
    fail(`${path}.openingKind`, `expected ${expectedOpeningKind}`)
  }
  const openingPairs = arrayAt(game.openingPairs, `${path}.openingPairs`)
  if (openingPairs.length !== 2) fail(`${path}.openingPairs`, 'expected two pairs')
  const firstPair = pairAt(openingPairs[0], `${path}.openingPairs[0]`)
  const secondPair = pairAt(openingPairs[1], `${path}.openingPairs[1]`)
  const pairRandom = new SeededRandom(gameSeed)
  const [generatedFirst, generatedSecond] = createOpeningPairs(
    openingKind,
    pairRandom,
  )
  expectPair(firstPair, toBenchmarkPair(generatedFirst), `${path}.openingPairs[0]`)
  expectPair(secondPair, toBenchmarkPair(generatedSecond), `${path}.openingPairs[1]`)
  const classifiedOpening = classifyOpening(firstPair, secondPair)
  if (classifiedOpening !== openingKind) {
    fail(`${path}.openingPairs`, `expected classification ${openingKind}`)
  }
  const trainingPlan = recordAt(game.trainingPlan, `${path}.trainingPlan`)
  for (const color of ['colorA', 'colorB', 'colorC', 'colorD']) {
    enumAt(
      trainingPlan[color],
      COLORS,
      `${path}.trainingPlan.${color}`,
    )
  }
  const turns = arrayAt(game.turns, `${path}.turns`)
  if (turns.length > maxTurns) fail(`${path}.turns`, `expected at most ${maxTurns}`)
  turns.forEach((turn, index) => turnAt(
    turn,
    index + 1,
    maxTurns,
    `${path}.turns[${index}]`,
  ))
  const finalGrid = gridAt(game.finalGrid, `${path}.finalGrid`)
  const booleans = new Map<string, boolean>()
  for (const field of [
    'coreCompleted',
    'guidedTargetCompleted',
    'actualFireAvailable',
    'actualFire',
    'allClear',
    'gameOver',
  ]) booleans.set(field, booleanAt(game[field], `${path}.${field}`))

  const maxIntendedChain = nonNegativeIntegerAt(
    game.maxIntendedChain,
    `${path}.maxIntendedChain`,
    78,
  )
  const maxPhysicalChain = nonNegativeIntegerAt(
    game.maxPhysicalChain,
    `${path}.maxPhysicalChain`,
    78,
  )
  const unintendedClearCount = nonNegativeIntegerAt(
    game.unintendedClearCount,
    `${path}.unintendedClearCount`,
    turns.length,
  )
  nonNegativeIntegerAt(game.maxColumnHeight, `${path}.maxColumnHeight`, 13)
  const avoidanceOpportunities = nonNegativeIntegerAt(
    game.avoidanceOpportunities,
    `${path}.avoidanceOpportunities`,
    turns.length,
  )
  const avoidanceDecisions = nonNegativeIntegerAt(
    game.avoidanceDecisions,
    `${path}.avoidanceDecisions`,
    turns.length,
  )
  if (avoidanceDecisions > avoidanceOpportunities) {
    fail(`${path}.avoidanceDecisions`, 'cannot exceed avoidanceOpportunities')
  }

  const coreTurn = nullableTurnAt(game.coreTurn, turns.length, `${path}.coreTurn`)
  const completionTurn = nullableTurnAt(
    game.completionTurn,
    turns.length,
    `${path}.completionTurn`,
  )
  const fireTurn = nullableTurnAt(game.fireTurn, turns.length, `${path}.fireTurn`)
  const participationRate = game.participationRate === null
    ? null
    : ratioAt(game.participationRate, `${path}.participationRate`)
  const leftoverPuyos = game.leftoverPuyos === null
    ? null
    : nonNegativeIntegerAt(game.leftoverPuyos, `${path}.leftoverPuyos`, 78)

  const turnRecords = turns as JsonRecord[]
  const derivedActualFire = turnRecords.some(turn => turn.intendedMainFire === true)
  const derivedFireTurn = turnRecords.findIndex(turn => turn.intendedMainFire === true) + 1
  const derivedMaxIntendedChain = Math.max(
    0,
    ...turnRecords.map(turn => turn.intendedMainChainCount as number),
  )
  const derivedMaxPhysicalChain = Math.max(
    0,
    ...turnRecords.map(turn => turn.chainCount as number),
  )
  const derivedUnintendedClears = turnRecords.filter(turn =>
    (turn.chainCount as number) > 0 &&
    (turn.intendedMainFire !== true || turn.collateralClear === true),
  ).length
  const derivedAllClear = turnRecords.some(turn =>
    (turn.clearedPuyos as number) > 0 && turn.allClear === true,
  )
  const actualFire = booleans.get('actualFire')!
  const coreCompleted = booleans.get('coreCompleted')!
  const guidedTargetCompleted = booleans.get('guidedTargetCompleted')!
  const gameOver = booleans.get('gameOver')!
  if (actualFire !== derivedActualFire) fail(`${path}.actualFire`, 'does not match turns')
  if (fireTurn !== (derivedFireTurn === 0 ? null : derivedFireTurn)) {
    fail(`${path}.fireTurn`, 'does not match turns')
  }
  if (maxIntendedChain !== derivedMaxIntendedChain) {
    fail(`${path}.maxIntendedChain`, 'does not match turns')
  }
  if (maxPhysicalChain !== derivedMaxPhysicalChain) {
    fail(`${path}.maxPhysicalChain`, 'does not match turns')
  }
  if (unintendedClearCount !== derivedUnintendedClears) {
    fail(`${path}.unintendedClearCount`, 'does not match turns')
  }
  if (booleans.get('allClear') !== derivedAllClear) {
    fail(`${path}.allClear`, 'does not match turns')
  }
  if (actualFire && booleans.get('actualFireAvailable') !== true) {
    fail(`${path}.actualFireAvailable`, 'must be true when actualFire is true')
  }
  if ((coreTurn !== null) !== booleans.get('coreCompleted')) {
    fail(`${path}.coreTurn`, 'must match coreCompleted')
  }
  if ((completionTurn !== null) !== booleans.get('guidedTargetCompleted')) {
    fail(`${path}.completionTurn`, 'must match guidedTargetCompleted')
  }
  for (const [field, value] of [
    ['participationRate', participationRate],
    ['leftoverPuyos', leftoverPuyos],
  ] as const) {
    if ((value !== null) !== actualFire) {
      fail(`${path}.${field}`, 'must be present exactly when actualFire is true')
    }
  }

  const terminalInput = game.terminalInput === null
    ? null
    : recordAt(game.terminalInput, `${path}.terminalInput`)
  if (terminalInput !== null) {
    terminalInputAt(
      terminalInput,
      turns.length + 1,
      maxTurns,
      `${path}.terminalInput`,
    )
    if (actualFire || gameOver) {
      fail(`${path}.terminalInput`, 'cannot be present after fire or game over')
    }
  }

  let expectedGrid = '.'.repeat(78)
  for (const [index, rawTurn] of turns.entries()) {
    const turn = recordAt(rawTurn, `${path}.turns[${index}]`)
    if (turn.gridBefore !== expectedGrid) {
      fail(`${path}.turns[${index}].gridBefore`, 'does not match the previous grid')
    }
    expectedGrid = turn.gridAfter as string
    if (index + 1 < turns.length && isSpawnBlocked(decodeBenchmarkGrid(expectedGrid))) {
      fail(`${path}.turns[${index}].gridAfter`, 'game-over grid cannot have a later turn')
    }
  }
  if (terminalInput !== null && terminalInput.gridBefore !== expectedGrid) {
    fail(`${path}.terminalInput.gridBefore`, 'does not match the previous grid')
  }
  if (finalGrid !== expectedGrid) {
    fail(`${path}.finalGrid`, 'does not match the final turn')
  }
  const derivedGameOver = isSpawnBlocked(decodeBenchmarkGrid(finalGrid))
  if (gameOver !== derivedGameOver) {
    fail(`${path}.gameOver`, 'does not match finalGrid')
  }
  if (terminalInput === null && !actualFire && !gameOver && turns.length < maxTurns) {
    fail(`${path}.turns`, 'trace ended before maxTurns')
  }
  if (actualFire && fireTurn !== turns.length) {
    fail(`${path}.fireTurn`, 'fire must occur on the final turn')
  }

  const inputs = turns.map((turn, index) => ({
    value: recordAt(turn, `${path}.turns[${index}]`),
    path: `${path}.turns[${index}]`,
  }))
  if (terminalInput !== null) {
    inputs.push({ value: terminalInput, path: `${path}.terminalInput` })
  }
  const initialPairs = [
    toBenchmarkPair(generatedFirst),
    toBenchmarkPair(generatedSecond),
    toBenchmarkPair(createRandomBenchmarkPair(pairRandom)),
  ]
  for (const [index, input] of inputs.entries()) {
    const current = pairAt(input.value.currentPair, `${input.path}.currentPair`)
    const next = pairAt(input.value.nextPair, `${input.path}.nextPair`)
    const nextNext = pairAt(input.value.nextNextPair, `${input.path}.nextNextPair`)
    if (index === 0) {
      expectPair(current, initialPairs[0], `${input.path}.currentPair`)
      expectPair(next, initialPairs[1], `${input.path}.nextPair`)
      expectPair(nextNext, initialPairs[2], `${input.path}.nextNextPair`)
      continue
    }
    const previous = inputs[index - 1]
    expectPair(
      current,
      pairAt(previous.value.nextPair, `${previous.path}.nextPair`),
      `${input.path}.currentPair`,
    )
    expectPair(
      next,
      pairAt(previous.value.nextNextPair, `${previous.path}.nextNextPair`),
      `${input.path}.nextPair`,
    )
    if (mode === 'random') {
      expectPair(
        nextNext,
        toBenchmarkPair(createRandomBenchmarkPair(pairRandom)),
        `${input.path}.nextNextPair`,
      )
    }
  }

  const actualFailureReason = game.failureReason === null
    ? null
    : enumAt(game.failureReason, FAILURE_REASONS, `${path}.failureReason`)
  const expectedFailureReason = determineBenchmarkFailureReason(
    actualFire,
    gameOver,
    terminalInput?.recommendedPlacement === null,
    terminalInput !== null && terminalInput.recommendedPlacement !== null,
    coreCompleted,
    guidedTargetCompleted,
  )
  if (actualFailureReason !== expectedFailureReason) {
    fail(
      `${path}.failureReason`,
      `expected ${String(expectedFailureReason)}, got ${String(actualFailureReason)}`,
    )
  }
  validatePhysicalTrace(game, turns, terminalInput, path)
  return game as unknown as BenchmarkGameResult
}

export const validateBenchmarkReport = (
  value: unknown,
  source = 'report',
): BenchmarkReport => {
  const report = recordAt(value, source)
  if (report.version !== BENCHMARK_VERSION) {
    throw new Error(
      `unsupported benchmark report version in ${source}: ` +
      `expected ${BENCHMARK_VERSION}, got ${String(report.version)}`,
    )
  }

  const config = recordAt(report.config, `${source}.config`)
  const seed = integerAt(config.seed, `${source}.config.seed`)
  const gamesPerMode = integerAt(config.gamesPerMode, `${source}.config.gamesPerMode`)
  const maxTurns = integerAt(config.maxTurns, `${source}.config.maxTurns`)
  const configModes = arrayAt(config.modes, `${source}.config.modes`).map(
    (mode, index) => enumAt(mode, MODES, `${source}.config.modes[${index}]`),
  )
  const configOpenings = arrayAt(
    config.openingKinds,
    `${source}.config.openingKinds`,
  ).map((opening, index) => enumAt(
      opening,
      OPENINGS,
      `${source}.config.openingKinds[${index}]`,
    ))
  const validatedConfig: BenchmarkConfig = {
    seed,
    gamesPerMode,
    maxTurns,
    modes: configModes,
    openingKinds: configOpenings,
  }
  try {
    validateBenchmarkConfig(validatedConfig)
  } catch (error) {
    fail(
      `${source}.config`,
      error instanceof Error ? error.message : String(error),
    )
  }

  const modeReports = arrayAt(report.modes, `${source}.modes`)
  const allGames: BenchmarkGameResult[] = []
  const reportModes = modeReports.map((value, index) => {
    const path = `${source}.modes[${index}]`
    const modeReport = recordAt(value, path)
    const mode = enumAt(modeReport.mode, MODES, `${path}.mode`)
    const games = arrayAt(modeReport.games, `${path}.games`)
    if (games.length !== gamesPerMode) {
      fail(`${path}.games`, `expected ${gamesPerMode} games, got ${games.length}`)
    }
    const validatedGames = games.map((game, gameIndex) => {
      const expectedSeed = deriveBenchmarkGameSeed(seed, gameIndex)
      const expectedOpening = configOpenings[gameIndex % configOpenings.length]
      const identity = gameAt(
        game,
        mode,
        gameIndex,
        expectedSeed,
        maxTurns,
        expectedOpening,
        `${path}.games[${gameIndex}]`,
      )
      return identity
    })
    allGames.push(...validatedGames)
    validateAggregateMatches(modeReport, validatedGames, path)
    const byOpening = recordAt(modeReport.byOpening, `${path}.byOpening`)
    const representedOpenings = [...new Set(
      validatedGames.map(game => game.openingKind),
    )]
    if (Object.keys(byOpening).length !== representedOpenings.length) {
      fail(`${path}.byOpening`, 'keys must match the represented opening classifications')
    }
    for (const opening of representedOpenings) {
      const openingPath = `${path}.byOpening.${opening}`
      const aggregate = byOpening[opening]
      if (aggregate === undefined) fail(openingPath, 'missing aggregate')
      const openingGames = validatedGames.filter(game => game.openingKind === opening)
      validateAggregateMatches(aggregate, openingGames, openingPath)
    }
    return mode
  })
  if (JSON.stringify(reportModes) !== JSON.stringify(configModes)) {
    fail(`${source}.modes`, 'must match config.modes in the same order')
  }
  validateAggregateMatches(report.overall, allGames, `${source}.overall`)

  return report as unknown as BenchmarkReport
}

export const parseBenchmarkReportJson = (
  json: string,
  source = 'report',
): BenchmarkReport => {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new Error(
      `invalid benchmark report JSON in ${source}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return validateBenchmarkReport(value, source)
}
