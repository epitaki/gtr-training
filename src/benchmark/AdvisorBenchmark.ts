import { GTRDetector } from '../game/gtr/GTRPatterns'
import {
  PlacementAdvisor,
  type GTRTrainingPlan,
} from '../game/advisor/PlacementAdvisor'
import {
  cloneGrid,
  isSpawnBlocked,
  simulateTurn,
  type Placement,
  type PuyoGrid,
} from '../game/core/ChainSimulator'
import {
  PuyoColor,
  type GameField,
  type PuyoPair,
} from '../game/core/types'

export const BENCHMARK_VERSION = 3

export type BenchmarkMode = 'random' | 'adversarial'

export type BenchmarkOpeningKind =
  | 'AAAA'
  | 'AAAB'
  | 'AABB'
  | 'ABAB'
  | 'AABC'
  | 'ABAC'
  | 'ABCD'

export type BenchmarkFailureReason =
  | 'game_over'
  | 'no_legal_placement'
  | 'invalid_recommended_placement'
  | 'core_not_completed'
  | 'tail_not_completed'
  | 'actual_fire_not_reached'

export interface BenchmarkConfig {
  seed: number
  gamesPerMode: number
  maxTurns: number
  modes: BenchmarkMode[]
  openingKinds: BenchmarkOpeningKind[]
}

export interface BenchmarkPair {
  main: PuyoColor
  sub: PuyoColor
}

export type EncodedGrid = string

export interface BenchmarkTurn {
  turn: number
  currentPair: BenchmarkPair
  nextPair: BenchmarkPair
  nextNextPair: BenchmarkPair
  placement: Placement
  totalScore: number
  phase: string
  chainCount: number
  clearedPuyos: number
  intendedMainFire: boolean
  collateralClear: boolean
  intendedMainChainCount: number
  intendedMainClearedPuyos: number
  allClear: boolean
  gridBefore: EncodedGrid
  gridAfter: EncodedGrid
}

export interface BenchmarkTerminalInput {
  turn: number
  currentPair: BenchmarkPair
  nextPair: BenchmarkPair
  nextNextPair: BenchmarkPair
  gridBefore: EncodedGrid
  recommendedPlacement: Placement | null
}

export interface BenchmarkGameResult {
  mode: BenchmarkMode
  gameIndex: number
  gameSeed: number
  maxTurns: number
  openingKind: BenchmarkOpeningKind
  openingPairs: [BenchmarkPair, BenchmarkPair]
  trainingPlan: GTRTrainingPlan
  turns: BenchmarkTurn[]
  finalGrid: EncodedGrid
  coreCompleted: boolean
  guidedTargetCompleted: boolean
  actualFireAvailable: boolean
  actualFire: boolean
  maxIntendedChain: number
  maxPhysicalChain: number
  unintendedClearCount: number
  allClear: boolean
  coreTurn: number | null
  completionTurn: number | null
  fireTurn: number | null
  participationRate: number | null
  leftoverPuyos: number | null
  maxColumnHeight: number
  gameOver: boolean
  avoidanceOpportunities: number
  avoidanceDecisions: number
  terminalInput: BenchmarkTerminalInput | null
  failureReason: BenchmarkFailureReason | null
}

export interface BenchmarkMetrics {
  games: number
  coreCompletionRate: number
  guidedTargetCompletionRate: number
  actualFireAvailableRate: number
  actualFireRate: number
  chain3Rate: number
  chain5Rate: number
  // Legacy v3 observation only; not a training target or comparison metric.
  // Keep stored-report compatibility and actual chain records intact.
  chain7Rate: number
  unintendedClearRate: number
  averageCompletionTurns: number
  averageFireTurns: number
  averageParticipationRate: number
  averageLeftoverPuyos: number
  averageMaxColumnHeight: number
  gameOverRate: number
  allClearRate: number
  gtrAvoidanceRate: number
}

export interface BenchmarkAggregate {
  metrics: BenchmarkMetrics
  failureReasons: Record<BenchmarkFailureReason, number>
}

export interface BenchmarkModeReport extends BenchmarkAggregate {
  mode: BenchmarkMode
  byOpening: Partial<Record<BenchmarkOpeningKind, BenchmarkAggregate>>
  games: BenchmarkGameResult[]
}

export interface BenchmarkReport {
  version: number
  config: BenchmarkConfig
  overall: BenchmarkAggregate
  modes: BenchmarkModeReport[]
}

export interface BenchmarkMetricDiff {
  metric: Exclude<keyof BenchmarkMetrics, 'games' | 'chain7Rate'>
  baseline: number
  current: number
  delta: number
}

export interface BenchmarkFailureReasonDiff {
  reason: BenchmarkFailureReason
  baseline: number
  current: number
  delta: number
}

export interface BenchmarkAggregateDiff {
  metrics: BenchmarkMetricDiff[]
  failureReasons: BenchmarkFailureReasonDiff[]
}

export interface BenchmarkOpeningComparison extends BenchmarkAggregateDiff {
  openingKind: BenchmarkOpeningKind
  status: 'compared' | 'missing_baseline' | 'missing_current'
}

export interface BenchmarkComparison {
  configDifferences: string[]
  overall: BenchmarkAggregateDiff
  modes: Array<BenchmarkAggregateDiff & {
    mode: BenchmarkMode
    status: 'compared' | 'missing_baseline' | 'missing_current'
    byOpening: BenchmarkOpeningComparison[]
  }>
}

export interface BenchmarkReplayResult {
  matched: boolean
  mismatches: Array<{ turn: number | null; message: string }>
  finalGrid: PuyoGrid
}

const ALL_COLORS = Object.values(PuyoColor)

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  seed: 20260904,
  gamesPerMode: 24,
  maxTurns: 20,
  modes: ['random', 'adversarial'],
  openingKinds: ['AAAB', 'AABB', 'ABAB', 'ABAC', 'AABC', 'AAAA'],
}

const FAILURE_REASONS: BenchmarkFailureReason[] = [
  'game_over',
  'no_legal_placement',
  'invalid_recommended_placement',
  'core_not_completed',
  'tail_not_completed',
  'actual_fire_not_reached',
]

const METRIC_KEYS: Array<BenchmarkMetricDiff['metric']> = [
  'coreCompletionRate',
  'guidedTargetCompletionRate',
  'actualFireAvailableRate',
  'actualFireRate',
  'chain3Rate',
  'chain5Rate',
  'unintendedClearRate',
  'averageCompletionTurns',
  'averageFireTurns',
  'averageParticipationRate',
  'averageLeftoverPuyos',
  'averageMaxColumnHeight',
  'gameOverRate',
  'allClearRate',
  'gtrAvoidanceRate',
]

export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }

  integer(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`maxExclusive must be a positive integer: ${maxExclusive}`)
    }
    return Math.floor(this.next() * maxExclusive)
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('Cannot pick from an empty list')
    return values[this.integer(values.length)]
  }
}

const createGrid = (): PuyoGrid => Array.from(
  { length: 13 },
  () => Array<PuyoColor | null>(6).fill(null),
)

const COLOR_SYMBOLS: Record<PuyoColor, string> = {
  [PuyoColor.RED]: 'R',
  [PuyoColor.GREEN]: 'G',
  [PuyoColor.BLUE]: 'B',
  [PuyoColor.YELLOW]: 'Y',
}

const SYMBOL_COLORS: Record<string, PuyoColor> = Object.fromEntries(
  Object.entries(COLOR_SYMBOLS).map(([color, symbol]) => [symbol, color]),
) as Record<string, PuyoColor>

export const encodeBenchmarkGrid = (grid: PuyoGrid): EncodedGrid => grid
  .flatMap(row => row.map(color => color === null ? '.' : COLOR_SYMBOLS[color]))
  .join('')

export const decodeBenchmarkGrid = (
  encoded: EncodedGrid,
  width = 6,
  height = 13,
): PuyoGrid => {
  if (encoded.length !== width * height) {
    throw new Error(`Invalid encoded grid length: ${encoded.length}`)
  }
  return Array.from({ length: height }, (_, y) => Array.from(
    { length: width },
    (_, x) => {
      const symbol = encoded[y * width + x]
      if (symbol === '.') return null
      const color = SYMBOL_COLORS[symbol]
      if (!color) throw new Error(`Invalid grid symbol: ${symbol}`)
      return color
    },
  ))
}

const toBenchmarkPair = (pair: PuyoPair): BenchmarkPair => ({
  main: pair.main.color,
  sub: pair.sub.color,
})

const toPuyoPair = (pair: BenchmarkPair): PuyoPair => ({
  main: { color: pair.main, x: 2, y: 1 },
  sub: { color: pair.sub, x: 2, y: 0 },
  rotation: 0,
  falling: true,
})

const createPair = (main: PuyoColor, sub: PuyoColor): PuyoPair =>
  toPuyoPair({ main, sub })

export const createRandomBenchmarkPair = (random: SeededRandom): PuyoPair => createPair(
  random.pick(ALL_COLORS),
  random.pick(ALL_COLORS),
)

const shuffledColors = (random: SeededRandom): PuyoColor[] => {
  const result = [...ALL_COLORS]
  for (let index = result.length - 1; index > 0; index--) {
    const target = random.integer(index + 1)
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export const classifyOpening = (
  pair1: BenchmarkPair,
  pair2: BenchmarkPair,
): BenchmarkOpeningKind => {
  const sequence = [pair1.main, pair1.sub, pair2.main, pair2.sub]
  const counts = new Map<PuyoColor, number>()
  for (const color of sequence) counts.set(color, (counts.get(color) ?? 0) + 1)
  const sizes = [...counts.values()].sort((left, right) => right - left)

  if (sizes[0] === 4) return 'AAAA'
  if (sizes[0] === 3) return 'AAAB'
  if (sizes.length === 2) {
    return pair1.main === pair1.sub && pair2.main === pair2.sub
      ? 'AABB'
      : 'ABAB'
  }
  if (sizes.length === 3) {
    const repeatedColor = [...counts.entries()].find(([, count]) => count === 2)?.[0]
    const repeatedInOnePair = repeatedColor !== undefined && (
      (pair1.main === repeatedColor && pair1.sub === repeatedColor) ||
      (pair2.main === repeatedColor && pair2.sub === repeatedColor)
    )
    return repeatedInOnePair ? 'AABC' : 'ABAC'
  }
  return 'ABCD'
}

export const createOpeningPairs = (
  kind: BenchmarkOpeningKind,
  random: SeededRandom,
): [PuyoPair, PuyoPair] => {
  const [a, b, c, d] = shuffledColors(random)
  let colors: [PuyoColor, PuyoColor, PuyoColor, PuyoColor]

  switch (kind) {
    case 'AAAA':
      colors = [a, a, a, a]
      break
    case 'AAAB': {
      colors = [a, a, a, b]
      const bPosition = random.integer(4)
      ;[colors[bPosition], colors[3]] = [colors[3], colors[bPosition]]
      break
    }
    case 'AABB':
      colors = random.integer(2) === 0 ? [a, a, b, b] : [b, b, a, a]
      break
    case 'ABAB':
      colors = random.integer(2) === 0 ? [a, b, a, b] : [a, b, b, a]
      break
    case 'AABC':
      colors = random.integer(2) === 0 ? [a, a, b, c] : [b, c, a, a]
      break
    case 'ABAC':
      colors = random.integer(2) === 0 ? [a, b, a, c] : [b, a, c, a]
      break
    case 'ABCD':
      colors = [a, b, c, d]
      break
  }

  return [createPair(colors[0], colors[1]), createPair(colors[2], colors[3])]
}

const getNeededColors = (
  grid: PuyoGrid,
  trainingPlan: GTRTrainingPlan,
): PuyoColor[] => {
  const fold = PlacementAdvisor.getFoldPlan(grid, trainingPlan)
  if (fold && fold.missingColors.length > 0) return fold.missingColors
  const tail = PlacementAdvisor.getYJointPlan(grid, trainingPlan)
  return tail?.missingColors ?? []
}

export const createBenchmarkPair = (
  mode: BenchmarkMode,
  grid: PuyoGrid,
  trainingPlan: GTRTrainingPlan,
  random: SeededRandom,
): PuyoPair => {
  const fallback = createRandomBenchmarkPair(random)
  if (mode === 'random') return fallback

  const needed = new Set(getNeededColors(grid, trainingPlan))
  const alternatives = ALL_COLORS.filter(color => !needed.has(color))
  if (alternatives.length === 0 || needed.size === 0) return fallback
  return createPair(random.pick(alternatives), random.pick(alternatives))
}

export const deriveBenchmarkGameSeed = (seed: number, gameIndex: number): number => {
  let value = (seed ^ Math.imul(gameIndex + 1, 0x9e3779b1)) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0
  return (value ^ (value >>> 15)) >>> 0
}

const countPuyos = (grid: PuyoGrid): number => grid.reduce(
  (total, row) => total + row.filter(color => color !== null).length,
  0,
)

const getMaximumColumnHeight = (grid: PuyoGrid): number => {
  const width = grid[0]?.length ?? 0
  let maximum = 0
  for (let x = 0; x < width; x++) {
    const top = grid.findIndex(row => row[x] !== null && row[x] !== undefined)
    if (top >= 0) maximum = Math.max(maximum, grid.length - top)
  }
  return maximum
}

const isGameOver = isSpawnBlocked

const getCorePositions = (height: number): Set<string> => new Set([
  `0,${height - 1}`,
  `1,${height - 1}`,
  `0,${height - 2}`,
  `1,${height - 2}`,
  `2,${height - 2}`,
  `0,${height - 3}`,
  `1,${height - 3}`,
])

export const determineBenchmarkFailureReason = (
  actualFire: boolean,
  gameOver: boolean,
  noLegalPlacement: boolean,
  invalidRecommendedPlacement: boolean,
  coreCompleted: boolean,
  guidedTargetCompleted: boolean,
): BenchmarkFailureReason | null => {
  if (actualFire) return null
  if (gameOver) return 'game_over'
  if (noLegalPlacement) return 'no_legal_placement'
  if (invalidRecommendedPlacement) return 'invalid_recommended_placement'
  if (!coreCompleted) return 'core_not_completed'
  if (!guidedTargetCompleted) return 'tail_not_completed'
  return 'actual_fire_not_reached'
}

const runGame = (
  mode: BenchmarkMode,
  gameIndex: number,
  gameSeed: number,
  openingKind: BenchmarkOpeningKind,
  maxTurns: number,
): BenchmarkGameResult => {
  const random = new SeededRandom(gameSeed)
  const [opening1, opening2] = createOpeningPairs(openingKind, random)
  const trainingPlan = PlacementAdvisor.createTrainingPlan(opening1, opening2)
  let grid = createGrid()
  const field: GameField = { grid, width: 6, height: 13 }
  const queue: PuyoPair[] = [
    opening1,
    opening2,
    createRandomBenchmarkPair(random),
  ]
  const turns: BenchmarkTurn[] = []

  let coreCompleted = false
  let guidedTargetCompleted = false
  let actualFireAvailable = false
  let actualFire = false
  let maxIntendedChain = 0
  let maxPhysicalChain = 0
  let unintendedClearCount = 0
  let allClear = false
  let coreTurn: number | null = null
  let completionTurn: number | null = null
  let fireTurn: number | null = null
  let participationRate: number | null = null
  let leftoverPuyos: number | null = null
  let maxColumnHeight = 0
  let gameOver = false
  let noLegalPlacement = false
  let invalidRecommendedPlacement = false
  let avoidanceOpportunities = 0
  let avoidanceDecisions = 0
  let terminalInput: BenchmarkTerminalInput | null = null

  for (let turn = 1; turn <= maxTurns; turn++) {
    const current = queue.shift()!
    const next = queue[0]
    const nextNext = queue[1]
    const gridBefore = cloneGrid(grid)
    const continuationUnfavorable = PlacementAdvisor.getFoldPlan(
      grid,
      trainingPlan,
    ) === null
    const advice = PlacementAdvisor.getAdvice(
      field,
      current,
      next,
      nextNext,
      trainingPlan,
    )
    const best = advice.bestPlacement
    if (!best) {
      noLegalPlacement = true
      terminalInput = {
        turn,
        currentPair: toBenchmarkPair(current),
        nextPair: toBenchmarkPair(next),
        nextNextPair: toBenchmarkPair(nextNext),
        gridBefore: encodeBenchmarkGrid(gridBefore),
        recommendedPlacement: null,
      }
      break
    }

    actualFireAvailable ||= advice.allPlacements.some(
      candidate => candidate.isIntendedMainFire,
    )
    const outcome = simulateTurn(grid, current, best.placement)
    if (!outcome.valid || !outcome.landing) {
      invalidRecommendedPlacement = true
      terminalInput = {
        turn,
        currentPair: toBenchmarkPair(current),
        nextPair: toBenchmarkPair(next),
        nextNextPair: toBenchmarkPair(nextNext),
        gridBefore: encodeBenchmarkGrid(gridBefore),
        recommendedPlacement: { ...best.placement },
      }
      break
    }

    if (continuationUnfavorable) {
      avoidanceOpportunities++
      const corePositions = getCorePositions(grid.length)
      const landsOutsideCore = [outcome.landing.mainPos, outcome.landing.subPos]
        .every(position => !corePositions.has(`${position.x},${position.y}`))
      const restoresPlan = PlacementAdvisor.getFoldPlan(
        outcome.stableGrid,
        trainingPlan,
      ) !== null
      if (landsOutsideCore || restoresPlan) avoidanceDecisions++
    }

    const firedMain = best.isIntendedMainFire
    maxPhysicalChain = Math.max(maxPhysicalChain, outcome.chainCount)
    if (outcome.chainCount > 0 && (!firedMain || best.hasCollateralClear)) {
      unintendedClearCount++
    }
    if (firedMain) {
      actualFire = true
      maxIntendedChain = Math.max(maxIntendedChain, best.intendedMainChainCount)
      fireTurn ??= turn
      const puyosBeforeClear = countPuyos(outcome.placedGrid)
      participationRate = puyosBeforeClear === 0
        ? 0
        : best.intendedMainClearedPuyos / puyosBeforeClear
      leftoverPuyos = countPuyos(outcome.stableGrid)
    }

    allClear ||= outcome.clearedPuyos > 0 && outcome.allClear
    grid = outcome.stableGrid
    field.grid = grid
    maxColumnHeight = Math.max(maxColumnHeight, getMaximumColumnHeight(grid))

    const gtr = GTRDetector.detectGTR(grid)
    if (gtr.hasBasicPattern && !coreCompleted) {
      coreCompleted = true
      coreTurn = turn
    }
    if (PlacementAdvisor.isAdaptiveTailComplete(grid, trainingPlan) &&
      !guidedTargetCompleted) {
      guidedTargetCompleted = true
      completionTurn = turn
    }

    gameOver = isGameOver(grid)
    turns.push({
      turn,
      currentPair: toBenchmarkPair(current),
      nextPair: toBenchmarkPair(next),
      nextNextPair: toBenchmarkPair(nextNext),
      placement: { ...best.placement },
      totalScore: best.totalScore,
      phase: best.phase,
      chainCount: outcome.chainCount,
      clearedPuyos: outcome.clearedPuyos,
      intendedMainFire: firedMain,
      collateralClear: best.hasCollateralClear,
      intendedMainChainCount: best.intendedMainChainCount,
      intendedMainClearedPuyos: best.intendedMainClearedPuyos,
      allClear: outcome.allClear,
      gridBefore: encodeBenchmarkGrid(gridBefore),
      gridAfter: encodeBenchmarkGrid(grid),
    })

    if (actualFire || gameOver) break

    queue.push(createBenchmarkPair(mode, grid, trainingPlan, random))
  }

  return {
    mode,
    gameIndex,
    gameSeed,
    maxTurns,
    openingKind: classifyOpening(toBenchmarkPair(opening1), toBenchmarkPair(opening2)),
    openingPairs: [toBenchmarkPair(opening1), toBenchmarkPair(opening2)],
    trainingPlan,
    turns,
    finalGrid: encodeBenchmarkGrid(grid),
    coreCompleted,
    guidedTargetCompleted,
    actualFireAvailable,
    actualFire,
    maxIntendedChain,
    maxPhysicalChain,
    unintendedClearCount,
    allClear,
    coreTurn,
    completionTurn,
    fireTurn,
    participationRate,
    leftoverPuyos,
    maxColumnHeight,
    gameOver,
    avoidanceOpportunities,
    avoidanceDecisions,
    terminalInput,
    failureReason: determineBenchmarkFailureReason(
      actualFire,
      gameOver,
      noLegalPlacement,
      invalidRecommendedPlacement,
      coreCompleted,
      guidedTargetCompleted,
    ),
  }
}

// Expose the same game runner for independent, fixed-index benchmark shards.
// The caller must derive the seed/opening from the full benchmark config.
export { runGame as runBenchmarkGame }

const roundMetric = (value: number): number => Number(value.toFixed(6))

const average = (values: number[]): number => values.length === 0
  ? 0
  : roundMetric(values.reduce((total, value) => total + value, 0) / values.length)

const rate = (count: number, total: number): number => total === 0
  ? 0
  : roundMetric(count / total)

export const aggregateBenchmarkGames = (
  games: BenchmarkGameResult[],
): BenchmarkAggregate => {
  const failureReasons = Object.fromEntries(
    FAILURE_REASONS.map(reason => [reason, 0]),
  ) as Record<BenchmarkFailureReason, number>
  for (const game of games) {
    if (game.failureReason) failureReasons[game.failureReason]++
  }

  const avoidanceOpportunities = games.reduce(
    (total, game) => total + game.avoidanceOpportunities,
    0,
  )
  const avoidanceDecisions = games.reduce(
    (total, game) => total + game.avoidanceDecisions,
    0,
  )

  return {
    metrics: {
      games: games.length,
      coreCompletionRate: rate(games.filter(game => game.coreCompleted).length, games.length),
      guidedTargetCompletionRate: rate(
        games.filter(game => game.guidedTargetCompleted).length,
        games.length,
      ),
      actualFireAvailableRate: rate(
        games.filter(game => game.actualFireAvailable).length,
        games.length,
      ),
      actualFireRate: rate(games.filter(game => game.actualFire).length, games.length),
      chain3Rate: rate(games.filter(game => game.maxIntendedChain >= 3).length, games.length),
      chain5Rate: rate(games.filter(game => game.maxIntendedChain >= 5).length, games.length),
      chain7Rate: rate(games.filter(game => game.maxIntendedChain >= 7).length, games.length),
      unintendedClearRate: rate(
        games.filter(game => game.unintendedClearCount > 0).length,
        games.length,
      ),
      averageCompletionTurns: average(
        games.flatMap(game => game.completionTurn === null ? [] : [game.completionTurn]),
      ),
      averageFireTurns: average(
        games.flatMap(game => game.fireTurn === null ? [] : [game.fireTurn]),
      ),
      averageParticipationRate: average(
        games.flatMap(game => game.participationRate === null ? [] : [game.participationRate]),
      ),
      averageLeftoverPuyos: average(
        games.flatMap(game => game.leftoverPuyos === null ? [] : [game.leftoverPuyos]),
      ),
      averageMaxColumnHeight: average(games.map(game => game.maxColumnHeight)),
      gameOverRate: rate(games.filter(game => game.gameOver).length, games.length),
      allClearRate: rate(games.filter(game => game.allClear).length, games.length),
      gtrAvoidanceRate: rate(avoidanceDecisions, avoidanceOpportunities),
    },
    failureReasons,
  }
}

const aggregateByOpening = (
  games: BenchmarkGameResult[],
): Partial<Record<BenchmarkOpeningKind, BenchmarkAggregate>> => {
  const result: Partial<Record<BenchmarkOpeningKind, BenchmarkAggregate>> = {}
  for (const kind of [...new Set(games.map(game => game.openingKind))]) {
    result[kind] = aggregateBenchmarkGames(
      games.filter(game => game.openingKind === kind),
    )
  }
  return result
}

export const validateBenchmarkConfig = (config: BenchmarkConfig): void => {
  if (!Number.isInteger(config.seed)) throw new Error('seed must be an integer')
  if (!Number.isInteger(config.gamesPerMode) || config.gamesPerMode <= 0) {
    throw new Error('gamesPerMode must be a positive integer')
  }
  if (!Number.isInteger(config.maxTurns) || config.maxTurns <= 0) {
    throw new Error('maxTurns must be a positive integer')
  }
  const allowedModes = new Set<BenchmarkMode>(['random', 'adversarial'])
  if (
    config.modes.length === 0 ||
    new Set(config.modes).size !== config.modes.length ||
    config.modes.some(mode => !allowedModes.has(mode))
  ) {
    throw new Error('modes must contain unique benchmark modes')
  }
  const allowedOpenings = new Set<BenchmarkOpeningKind>([
    'AAAA', 'AAAB', 'AABB', 'ABAB', 'AABC', 'ABAC', 'ABCD',
  ])
  if (
    config.openingKinds.length === 0 ||
    new Set(config.openingKinds).size !== config.openingKinds.length ||
    config.openingKinds.some(kind => !allowedOpenings.has(kind))
  ) {
    throw new Error('openingKinds must contain unique known opening classifications')
  }
}

const normalizeConfig = (input: Partial<BenchmarkConfig>): BenchmarkConfig => {
  const config: BenchmarkConfig = {
    ...DEFAULT_BENCHMARK_CONFIG,
    ...input,
    modes: [...(input.modes ?? DEFAULT_BENCHMARK_CONFIG.modes)],
    openingKinds: [...(input.openingKinds ?? DEFAULT_BENCHMARK_CONFIG.openingKinds)],
  }
  validateBenchmarkConfig(config)
  return config
}

export const runAdvisorBenchmark = (
  input: Partial<BenchmarkConfig> = {},
  onProgress?: (progress: {
    mode: BenchmarkMode
    completedGames: number
    totalGames: number
    tailCompletions: number
    chain5Fires: number
  }) => void,
): BenchmarkReport => {
  const config = normalizeConfig(input)
  const modeReports = config.modes.map(mode => {
    let tailCompletions = 0
    let chain5Fires = 0
    const games = Array.from({ length: config.gamesPerMode }, (_, gameIndex) => {
      const openingKind = config.openingKinds[gameIndex % config.openingKinds.length]
      const game = runGame(
        mode,
        gameIndex,
        deriveBenchmarkGameSeed(config.seed, gameIndex),
        openingKind,
        config.maxTurns,
      )
      tailCompletions += Number(game.guidedTargetCompleted)
      chain5Fires += Number(game.actualFire && game.maxIntendedChain >= 5)
      onProgress?.({
        mode, completedGames: gameIndex + 1, totalGames: config.gamesPerMode,
        tailCompletions, chain5Fires,
      })
      return game
    })
    return {
      mode,
      ...aggregateBenchmarkGames(games),
      byOpening: aggregateByOpening(games),
      games,
    }
  })
  const allGames = modeReports.flatMap(report => report.games)

  return {
    version: BENCHMARK_VERSION,
    config,
    overall: aggregateBenchmarkGames(allGames),
    modes: modeReports,
  }
}

const compareMetrics = (
  baseline: BenchmarkMetrics,
  current: BenchmarkMetrics,
): BenchmarkMetricDiff[] => METRIC_KEYS.map(metric => ({
  metric,
  baseline: baseline[metric],
  current: current[metric],
  delta: roundMetric(current[metric] - baseline[metric]),
}))

const compareFailureReasons = (
  baseline: Record<BenchmarkFailureReason, number>,
  current: Record<BenchmarkFailureReason, number>,
): BenchmarkFailureReasonDiff[] => FAILURE_REASONS.map(reason => ({
  reason,
  baseline: baseline[reason] ?? 0,
  current: current[reason] ?? 0,
  delta: (current[reason] ?? 0) - (baseline[reason] ?? 0),
}))

const compareAggregates = (
  baseline: BenchmarkAggregate,
  current: BenchmarkAggregate,
): BenchmarkAggregateDiff => ({
  metrics: compareMetrics(baseline.metrics, current.metrics),
  failureReasons: compareFailureReasons(
    baseline.failureReasons,
    current.failureReasons,
  ),
})

export const compareBenchmarkReports = (
  baseline: BenchmarkReport,
  current: BenchmarkReport,
): BenchmarkComparison => {
  const configDifferences: string[] = []
  if (baseline.version !== current.version) {
    configDifferences.push(`version: ${baseline.version} -> ${current.version}`)
  }
  for (const key of ['seed', 'gamesPerMode', 'maxTurns'] as const) {
    if (baseline.config[key] !== current.config[key]) {
      configDifferences.push(
        `${key}: ${baseline.config[key]} -> ${current.config[key]}`,
      )
    }
  }
  if (baseline.config.modes.join(',') !== current.config.modes.join(',')) {
    configDifferences.push(
      `modes: ${baseline.config.modes.join(',')} -> ${current.config.modes.join(',')}`,
    )
  }
  if (baseline.config.openingKinds.join(',') !== current.config.openingKinds.join(',')) {
    configDifferences.push('openingKinds differ')
  }

  const modeNames = [...new Set([
    ...baseline.modes.map(item => item.mode),
    ...current.modes.map(item => item.mode),
  ])]
  const modes = modeNames.map(mode => {
    const baselineMode = baseline.modes.find(item => item.mode === mode)
    const currentMode = current.modes.find(item => item.mode === mode)
    const status = !baselineMode
      ? 'missing_baseline' as const
      : !currentMode
        ? 'missing_current' as const
        : 'compared' as const
    const aggregateDiff = baselineMode && currentMode
      ? compareAggregates(baselineMode, currentMode)
      : { metrics: [], failureReasons: [] }
    const openingKinds = [...new Set([
      ...Object.keys(baselineMode?.byOpening ?? {}),
      ...Object.keys(currentMode?.byOpening ?? {}),
    ])] as BenchmarkOpeningKind[]
    const byOpening = openingKinds.map(openingKind => {
      const baselineOpening = baselineMode?.byOpening[openingKind]
      const currentOpening = currentMode?.byOpening[openingKind]
      const openingStatus = !baselineOpening
        ? 'missing_baseline' as const
        : !currentOpening
          ? 'missing_current' as const
          : 'compared' as const
      return {
        openingKind,
        status: openingStatus,
        ...(baselineOpening && currentOpening
          ? compareAggregates(baselineOpening, currentOpening)
          : { metrics: [], failureReasons: [] }),
      }
    })
    return { mode, status, ...aggregateDiff, byOpening }
  })

  return {
    configDifferences,
    overall: compareAggregates(baseline.overall, current.overall),
    modes,
  }
}

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const placementsEqual = (
  left: Placement | null | undefined,
  right: Placement | null | undefined,
): boolean => left?.column === right?.column && left?.rotation === right?.rotation

const replayStoredTrace = (
  game: BenchmarkGameResult,
  mismatches: BenchmarkReplayResult['mismatches'],
): BenchmarkGameResult => {
  const mismatch = (turn: number | null, message: string): void => {
    mismatches.push({ turn, message })
  }
  const compareTurnValue = (
    turn: number,
    field: keyof BenchmarkTurn,
    expected: unknown,
    actual: unknown,
  ): void => {
    if (!valuesEqual(expected, actual)) mismatch(turn, `${field} changed`)
  }

  const random = new SeededRandom(game.gameSeed)
  const [generatedOpening1, generatedOpening2] = createOpeningPairs(
    game.openingKind,
    random,
  )
  const opening1 = toPuyoPair(game.openingPairs[0])
  const opening2 = toPuyoPair(game.openingPairs[1])
  const trainingPlan = PlacementAdvisor.createTrainingPlan(opening1, opening2)
  const generatedQueue: PuyoPair[] = [
    generatedOpening1,
    generatedOpening2,
    createRandomBenchmarkPair(random),
  ]
  let grid = createGrid()
  const field: GameField = { grid, width: 6, height: 13 }
  const turns: BenchmarkTurn[] = []

  let coreCompleted = false
  let guidedTargetCompleted = false
  let actualFireAvailable = false
  let actualFire = false
  let maxIntendedChain = 0
  let maxPhysicalChain = 0
  let unintendedClearCount = 0
  let allClear = false
  let coreTurn: number | null = null
  let completionTurn: number | null = null
  let fireTurn: number | null = null
  let participationRate: number | null = null
  let leftoverPuyos: number | null = null
  let maxColumnHeight = 0
  let gameOver = false
  let noLegalPlacement = false
  let invalidRecommendedPlacement = false
  let avoidanceOpportunities = 0
  let avoidanceDecisions = 0
  let terminalInput: BenchmarkTerminalInput | null = null
  let traceCanContinue = true

  if (!Number.isInteger(game.maxTurns) || game.maxTurns <= 0) {
    mismatch(null, 'maxTurns is invalid')
  }
  if (game.turns.length > game.maxTurns) {
    mismatch(null, 'turn count exceeds maxTurns')
  }

  const takeGeneratedPairs = (turn: number): [BenchmarkPair, BenchmarkPair, BenchmarkPair] => {
    const current = generatedQueue.shift()
    const next = generatedQueue[0]
    const nextNext = generatedQueue[1]
    if (!current || !next || !nextNext) {
      mismatch(turn, 'generated pair queue ended unexpectedly')
    }
    return [
      current ? toBenchmarkPair(current) : game.openingPairs[0],
      next ? toBenchmarkPair(next) : game.openingPairs[1],
      nextNext ? toBenchmarkPair(nextNext) : game.openingPairs[0],
    ]
  }

  for (const [index, record] of game.turns.entries()) {
    const turn = index + 1
    if (actualFire || gameOver) {
      mismatch(turn, 'turn appears after the game should have ended')
    }
    const gridBefore = cloneGrid(grid)
    const generatedPairs = takeGeneratedPairs(turn)
    const current = toPuyoPair(record.currentPair)
    const next = toPuyoPair(record.nextPair)
    const nextNext = toPuyoPair(record.nextNextPair)
    const continuationUnfavorable = PlacementAdvisor.getFoldPlan(
      grid,
      trainingPlan,
    ) === null
    const advice = PlacementAdvisor.getAdvice(
      field,
      current,
      next,
      nextNext,
      trainingPlan,
    )
    const best = advice.bestPlacement
    const replayedPlacement = advice.allPlacements.find(candidate =>
      placementsEqual(candidate.placement, record.placement),
    )

    actualFireAvailable ||= advice.allPlacements.some(
      candidate => candidate.isIntendedMainFire,
    )
    if (!best) {
      noLegalPlacement = true
      terminalInput ??= {
        turn,
        currentPair: generatedPairs[0],
        nextPair: generatedPairs[1],
        nextNextPair: generatedPairs[2],
        gridBefore: encodeBenchmarkGrid(gridBefore),
        recommendedPlacement: null,
      }
      mismatch(turn, 'recommended placement is no longer available')
    }
    if (!replayedPlacement) {
      mismatch(turn, 'stored placement is no longer evaluated')
    }

    const outcome = simulateTurn(grid, current, record.placement)
    if (!outcome.valid || !outcome.landing) {
      invalidRecommendedPlacement = true
      terminalInput = {
        turn,
        currentPair: generatedPairs[0],
        nextPair: generatedPairs[1],
        nextNextPair: generatedPairs[2],
        gridBefore: encodeBenchmarkGrid(gridBefore),
        recommendedPlacement: { ...record.placement },
      }
      mismatch(turn, 'stored placement became invalid')
      traceCanContinue = false
      break
    }

    if (continuationUnfavorable) {
      avoidanceOpportunities++
      const corePositions = getCorePositions(grid.length)
      const landsOutsideCore = [outcome.landing.mainPos, outcome.landing.subPos]
        .every(position => !corePositions.has(`${position.x},${position.y}`))
      const restoresPlan = PlacementAdvisor.getFoldPlan(
        outcome.stableGrid,
        trainingPlan,
      ) !== null
      if (landsOutsideCore || restoresPlan) avoidanceDecisions++
    }

    const firedMain = replayedPlacement?.isIntendedMainFire ?? false
    const collateralClear = replayedPlacement?.hasCollateralClear ?? false
    maxPhysicalChain = Math.max(maxPhysicalChain, outcome.chainCount)
    if (outcome.chainCount > 0 && (!firedMain || collateralClear)) {
      unintendedClearCount++
    }
    if (firedMain && replayedPlacement) {
      actualFire = true
      maxIntendedChain = Math.max(
        maxIntendedChain,
        replayedPlacement.intendedMainChainCount,
      )
      fireTurn ??= turn
      const puyosBeforeClear = countPuyos(outcome.placedGrid)
      participationRate = puyosBeforeClear === 0
        ? 0
        : replayedPlacement.intendedMainClearedPuyos / puyosBeforeClear
      leftoverPuyos = countPuyos(outcome.stableGrid)
    }

    allClear ||= outcome.clearedPuyos > 0 && outcome.allClear
    grid = outcome.stableGrid
    field.grid = grid
    maxColumnHeight = Math.max(maxColumnHeight, getMaximumColumnHeight(grid))

    const gtr = GTRDetector.detectGTR(grid)
    if (gtr.hasBasicPattern && !coreCompleted) {
      coreCompleted = true
      coreTurn = turn
    }
    if (PlacementAdvisor.isAdaptiveTailComplete(grid, trainingPlan) &&
      !guidedTargetCompleted) {
      guidedTargetCompleted = true
      completionTurn = turn
    }
    gameOver = isGameOver(grid)

    const actualTurn: BenchmarkTurn = {
      turn,
      currentPair: generatedPairs[0],
      nextPair: generatedPairs[1],
      nextNextPair: generatedPairs[2],
      placement: best ? { ...best.placement } : { ...record.placement },
      totalScore: best?.totalScore ?? Number.NaN,
      phase: best?.phase ?? advice.phase,
      chainCount: outcome.chainCount,
      clearedPuyos: outcome.clearedPuyos,
      intendedMainFire: best?.isIntendedMainFire ?? false,
      collateralClear: best?.hasCollateralClear ?? false,
      intendedMainChainCount: best?.intendedMainChainCount ?? 0,
      intendedMainClearedPuyos: best?.intendedMainClearedPuyos ?? 0,
      allClear: outcome.allClear,
      gridBefore: encodeBenchmarkGrid(gridBefore),
      gridAfter: encodeBenchmarkGrid(grid),
    }
    turns.push(actualTurn)

    const fields: Array<keyof BenchmarkTurn> = [
      'turn',
      'currentPair',
      'nextPair',
      'nextNextPair',
      'placement',
      'totalScore',
      'phase',
      'chainCount',
      'clearedPuyos',
      'intendedMainFire',
      'collateralClear',
      'intendedMainChainCount',
      'intendedMainClearedPuyos',
      'allClear',
      'gridBefore',
      'gridAfter',
    ]
    for (const fieldName of fields) {
      compareTurnValue(turn, fieldName, record[fieldName], actualTurn[fieldName])
    }

    const needsAnotherInput = index + 1 < game.turns.length || game.terminalInput !== null
    if (needsAnotherInput) {
      generatedQueue.push(createBenchmarkPair(
        game.mode,
        grid,
        trainingPlan,
        random,
      ))
    }
  }

  if (traceCanContinue && game.terminalInput) {
    const expected = game.terminalInput
    const turn = game.turns.length + 1
    const gridBefore = cloneGrid(grid)
    const generatedPairs = takeGeneratedPairs(turn)
    const current = toPuyoPair(expected.currentPair)
    const advice = PlacementAdvisor.getAdvice(
      field,
      current,
      toPuyoPair(expected.nextPair),
      toPuyoPair(expected.nextNextPair),
      trainingPlan,
    )
    const best = advice.bestPlacement
    if (best) {
      actualFireAvailable ||= advice.allPlacements.some(
        candidate => candidate.isIntendedMainFire,
      )
    } else {
      noLegalPlacement = true
    }

    terminalInput = {
      turn,
      currentPair: generatedPairs[0],
      nextPair: generatedPairs[1],
      nextNextPair: generatedPairs[2],
      gridBefore: encodeBenchmarkGrid(gridBefore),
      recommendedPlacement: best ? { ...best.placement } : null,
    }
    if (expected.recommendedPlacement) {
      const outcome = simulateTurn(grid, current, expected.recommendedPlacement)
      invalidRecommendedPlacement = !outcome.valid || !outcome.landing
    }
  }

  if (game.terminalInput && game.turns.length >= game.maxTurns) {
    mismatch(null, 'terminal input exceeds maxTurns')
  }
  if (game.terminalInput && (actualFire || gameOver)) {
    mismatch(null, 'terminal input appears after the game should have ended')
  }
  if (
    !game.terminalInput &&
    traceCanContinue &&
    !actualFire &&
    !gameOver &&
    !noLegalPlacement &&
    !invalidRecommendedPlacement &&
    game.turns.length < game.maxTurns
  ) {
    mismatch(null, 'trace ended before maxTurns')
  }

  return {
    mode: game.mode,
    gameIndex: game.gameIndex,
    gameSeed: game.gameSeed,
    maxTurns: game.maxTurns,
    openingKind: classifyOpening(game.openingPairs[0], game.openingPairs[1]),
    openingPairs: [
      toBenchmarkPair(generatedOpening1),
      toBenchmarkPair(generatedOpening2),
    ],
    trainingPlan,
    turns,
    finalGrid: encodeBenchmarkGrid(grid),
    coreCompleted,
    guidedTargetCompleted,
    actualFireAvailable,
    actualFire,
    maxIntendedChain,
    maxPhysicalChain,
    unintendedClearCount,
    allClear,
    coreTurn,
    completionTurn,
    fireTurn,
    participationRate,
    leftoverPuyos,
    maxColumnHeight,
    gameOver,
    avoidanceOpportunities,
    avoidanceDecisions,
    terminalInput,
    failureReason: determineBenchmarkFailureReason(
      actualFire,
      gameOver,
      noLegalPlacement,
      invalidRecommendedPlacement,
      coreCompleted,
      guidedTargetCompleted,
    ),
  }
}

export const replayBenchmarkGame = (
  game: BenchmarkGameResult,
): BenchmarkReplayResult => {
  const mismatches: BenchmarkReplayResult['mismatches'] = []
  const replayed = replayStoredTrace(game, mismatches)

  const resultFields: Array<keyof BenchmarkGameResult> = [
    'openingKind',
    'openingPairs',
    'trainingPlan',
    'finalGrid',
    'coreCompleted',
    'guidedTargetCompleted',
    'actualFireAvailable',
    'actualFire',
    'maxIntendedChain',
    'maxPhysicalChain',
    'unintendedClearCount',
    'allClear',
    'coreTurn',
    'completionTurn',
    'fireTurn',
    'participationRate',
    'leftoverPuyos',
    'maxColumnHeight',
    'gameOver',
    'avoidanceOpportunities',
    'avoidanceDecisions',
    'terminalInput',
    'failureReason',
  ]
  for (const field of resultFields) {
    if (!valuesEqual(game[field], replayed[field])) {
      mismatches.push({ turn: null, message: `${field} changed` })
    }
  }

  return {
    matched: mismatches.length === 0,
    mismatches,
    finalGrid: decodeBenchmarkGrid(replayed.finalGrid),
  }
}
