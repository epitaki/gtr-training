import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  DEFAULT_BENCHMARK_CONFIG,
  compareBenchmarkReports,
  decodeBenchmarkGrid,
  replayBenchmarkGame,
  runAdvisorBenchmark,
  type BenchmarkAggregate,
  type BenchmarkComparison,
  type BenchmarkConfig,
  type BenchmarkFailureReasonDiff,
  type BenchmarkMetricDiff,
  type BenchmarkMode,
  type BenchmarkOpeningKind,
  type BenchmarkReport,
} from '../../src/benchmark/AdvisorBenchmark'
import { parseBenchmarkCliArguments } from '../../src/benchmark/BenchmarkCliArgs'
import { parseBenchmarkReportJson } from '../../src/benchmark/BenchmarkReportValidation'

const parseArgumentsOrExit = () => {
  try {
    return parseBenchmarkCliArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

const parsedArguments = parseArgumentsOrExit()
const command = parsedArguments.command

const getOption = (name: string): string | undefined => {
  const value = parsedArguments.options[name]
  return typeof value === 'string' ? value : undefined
}

const hasFlag = (name: string): boolean => parsedArguments.options[name] === true

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`)
  }
  return parsed
}

const parseInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`--${name} must be an integer`)
  return parsed
}

const readReport = (path: string): BenchmarkReport => {
  const absolutePath = resolve(path)
  return parseBenchmarkReportJson(readFileSync(absolutePath, 'utf8'), absolutePath)
}

const writeJson = (path: string, value: unknown): void => {
  const absolutePath = resolve(path)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`saved: ${absolutePath}`)
}

const RATE_METRICS = new Set([
  'coreCompletionRate',
  'guidedTargetCompletionRate',
  'actualFireAvailableRate',
  'actualFireRate',
  'chain3Rate',
  'chain5Rate',
  'unintendedClearRate',
  'averageParticipationRate',
  'gameOverRate',
  'allClearRate',
  'gtrAvoidanceRate',
])

const formatValue = (metric: string, value: number): string => RATE_METRICS.has(metric)
  ? `${(value * 100).toFixed(1)}%`
  : value.toFixed(2)

const printAggregate = (label: string, aggregate: BenchmarkAggregate): void => {
  const metrics = aggregate.metrics
  console.log(`\n${label}: ${metrics.games} games`)
  console.log(`  core / adaptive tail: ${formatValue('coreCompletionRate', metrics.coreCompletionRate)} / ${formatValue('guidedTargetCompletionRate', metrics.guidedTargetCompletionRate)}`)
  console.log(`  fire available/used:  ${formatValue('actualFireAvailableRate', metrics.actualFireAvailableRate)} / ${formatValue('actualFireRate', metrics.actualFireRate)}`)
  console.log(`  chain 3 / 5:          ${formatValue('chain3Rate', metrics.chain3Rate)} / ${formatValue('chain5Rate', metrics.chain5Rate)}`)
  console.log(`  unintended / gameover:${formatValue('unintendedClearRate', metrics.unintendedClearRate)} / ${formatValue('gameOverRate', metrics.gameOverRate)}`)
  console.log(`  completion/fire turns:${metrics.averageCompletionTurns.toFixed(2)} / ${metrics.averageFireTurns.toFixed(2)}`)
  console.log(`  participation/leftover:${formatValue('averageParticipationRate', metrics.averageParticipationRate)} / ${metrics.averageLeftoverPuyos.toFixed(2)}`)
  console.log(`  max height / all clear:${metrics.averageMaxColumnHeight.toFixed(2)} / ${formatValue('allClearRate', metrics.allClearRate)}`)
  console.log(`  GTR avoidance:        ${formatValue('gtrAvoidanceRate', metrics.gtrAvoidanceRate)}`)
  console.log(`  failures: ${Object.entries(aggregate.failureReasons).map(([reason, count]) => `${reason}=${count}`).join(', ')}`)
}

const printDiffRows = (differences: BenchmarkMetricDiff[]): void => {
  for (const item of differences) {
    const baseline = formatValue(item.metric, item.baseline).padStart(9)
    const current = formatValue(item.metric, item.current).padStart(9)
    const deltaValue = RATE_METRICS.has(item.metric) ? item.delta * 100 : item.delta
    const delta = `${deltaValue >= 0 ? '+' : ''}${deltaValue.toFixed(2)}${RATE_METRICS.has(item.metric) ? 'pp' : ''}`
    console.log(`  ${item.metric.padEnd(29)} ${baseline} -> ${current}  ${delta}`)
  }
}

const printFailureDiffRows = (differences: BenchmarkFailureReasonDiff[]): void => {
  for (const item of differences) {
    const delta = `${item.delta >= 0 ? '+' : ''}${item.delta}`
    console.log(
      `  failure:${item.reason.padEnd(21)} ${String(item.baseline).padStart(9)} -> ` +
      `${String(item.current).padStart(9)}  ${delta}`,
    )
  }
}

const printComparison = (comparison: BenchmarkComparison): void => {
  console.log('\nBenchmark comparison')
  if (comparison.configDifferences.length > 0) {
    console.log(`  config warnings: ${comparison.configDifferences.join('; ')}`)
  }
  console.log('\nOverall')
  printDiffRows(comparison.overall.metrics)
  printFailureDiffRows(comparison.overall.failureReasons)
  for (const mode of comparison.modes) {
    console.log(`\nMode: ${mode.mode}`)
    if (mode.status !== 'compared') {
      console.log(`  ${mode.status}`)
      continue
    }
    printDiffRows(mode.metrics)
    printFailureDiffRows(mode.failureReasons)

    const changedOpenings = mode.byOpening.filter(opening =>
      opening.status !== 'compared' ||
      opening.metrics.some(metric => metric.delta !== 0) ||
      opening.failureReasons.some(reason => reason.delta !== 0),
    )
    if (changedOpenings.length === 0) {
      console.log('  opening breakdown: no changes')
      continue
    }
    for (const opening of changedOpenings) {
      console.log(`\n  Opening: ${opening.openingKind}`)
      if (opening.status !== 'compared') {
        console.log(`    ${opening.status}`)
        continue
      }
      printDiffRows(opening.metrics.filter(metric => metric.delta !== 0))
      printFailureDiffRows(opening.failureReasons.filter(reason => reason.delta !== 0))
    }
  }
}

const parseModes = (value: string | undefined, fallback: BenchmarkMode[]): BenchmarkMode[] => {
  if (!value) return [...fallback]
  const allowed = new Set<BenchmarkMode>(['random', 'adversarial'])
  const modes = value.split(',').map(item => item.trim()) as BenchmarkMode[]
  if (modes.some(mode => !allowed.has(mode))) {
    throw new Error('--modes accepts random,adversarial')
  }
  return modes
}

const parseOpenings = (
  value: string | undefined,
  fallback: BenchmarkOpeningKind[],
): BenchmarkOpeningKind[] => value
  ? value.split(',').map(item => item.trim() as BenchmarkOpeningKind)
  : [...fallback]

const runCommand = (): void => {
  const baselinePath = getOption('baseline')
  const baseline = baselinePath ? readReport(baselinePath) : null
  const defaults = baseline?.config ?? DEFAULT_BENCHMARK_CONFIG
  const config: BenchmarkConfig = {
    seed: parseInteger(getOption('seed'), defaults.seed, 'seed'),
    gamesPerMode: parsePositiveInteger(
      getOption('games'),
      defaults.gamesPerMode,
      'games',
    ),
    maxTurns: parsePositiveInteger(getOption('turns'), defaults.maxTurns, 'turns'),
    modes: parseModes(getOption('modes'), defaults.modes),
    openingKinds: parseOpenings(getOption('openings'), defaults.openingKinds),
  }

  console.log(
    `Advisor benchmark: seed=${config.seed}, games/mode=${config.gamesPerMode}, ` +
    `turns=${config.maxTurns}, modes=${config.modes.join(',')}`,
  )
  const report = runAdvisorBenchmark(config, progress => {
    if (progress.completedGames % 25 !== 0 && progress.completedGames !== progress.totalGames) return
    console.log(
      `  ${progress.mode} ${progress.completedGames}/${progress.totalGames}: ` +
      `tail=${progress.tailCompletions}, chain5=${progress.chain5Fires}`,
    )
  })
  printAggregate('Overall', report.overall)
  for (const mode of report.modes) printAggregate(`Mode ${mode.mode}`, mode)

  if (!hasFlag('no-output')) {
    writeJson(getOption('output') ?? 'benchmarks/results/advisor-current.json', report)
  }
  if (baseline) printComparison(compareBenchmarkReports(baseline, report))
}

const compareCommand = (): void => {
  const baselinePath = getOption('baseline')
  const currentPath = getOption('current')
  if (!baselinePath || !currentPath) {
    throw new Error('compare requires --baseline <file> and --current <file>')
  }
  const comparison = compareBenchmarkReports(
    readReport(baselinePath),
    readReport(currentPath),
  )
  printComparison(comparison)
  const output = getOption('output')
  if (output) writeJson(output, comparison)
}

const shortPair = (main: string, sub: string): string =>
  `${main[0]?.toUpperCase() ?? '?'}${sub[0]?.toUpperCase() ?? '?'}`

const printGrid = (
  encoded: BenchmarkReport['modes'][number]['games'][number]['finalGrid'],
): void => {
  for (const row of decodeBenchmarkGrid(encoded)) {
    console.log(`  ${row.map(color => color?.[0].toUpperCase() ?? '.').join(' ')}`)
  }
}

const replayCommand = (): void => {
  const reportPath = getOption('report')
  if (!reportPath) throw new Error('replay requires --report <file>')
  const report = readReport(reportPath)
  const mode = (getOption('mode') ?? report.modes[0]?.mode) as BenchmarkMode
  const modeReport = report.modes.find(item => item.mode === mode)
  if (!modeReport) throw new Error(`mode not found in report: ${mode}`)
  const gameIndex = parseInteger(getOption('game'), 0, 'game')
  const gameSeed = getOption('game-seed')
  const game = gameSeed === undefined
    ? modeReport.games.find(item => item.gameIndex === gameIndex)
    : modeReport.games.find(item => item.gameSeed === Number(gameSeed))
  if (!game) throw new Error('requested game was not found')

  console.log(
    `Replay ${mode} game=${game.gameIndex} seed=${game.gameSeed} ` +
    `opening=${game.openingKind}`,
  )
  for (const turn of game.turns) {
    console.log(
      `  ${turn.turn}: ${shortPair(turn.currentPair.main, turn.currentPair.sub)} ` +
      `-> c${turn.placement.column + 1}/r${turn.placement.rotation} ` +
      `chain=${turn.chainCount} score=${turn.totalScore.toFixed(1)}`,
    )
  }
  console.log(`  result: ${game.failureReason ?? `main fire ${game.maxIntendedChain}-chain`}`)
  console.log('  final grid:')
  printGrid(game.finalGrid)

  const replay = replayBenchmarkGame(game)
  if (replay.matched) {
    console.log('replay matched the stored placements and boards')
  } else {
    console.error('replay mismatch:')
    for (const mismatch of replay.mismatches) {
      console.error(`  turn ${mismatch.turn ?? 'final'}: ${mismatch.message}`)
    }
    process.exitCode = 1
  }
}

const printHelp = (): void => {
  console.log(`Usage:
  bun scripts/benchmark/benchmark-advisor.ts run [options]
  bun scripts/benchmark/benchmark-advisor.ts compare --baseline <file> --current <file> [--output <file>]
  bun scripts/benchmark/benchmark-advisor.ts replay --report <file> [--mode random] [--game 0 | --game-seed <n>]

Run options:
  --seed <n>           Root seed (default ${DEFAULT_BENCHMARK_CONFIG.seed})
  --games <n>          Games per mode (default ${DEFAULT_BENCHMARK_CONFIG.gamesPerMode})
  --turns <n>          Maximum turns per game (default ${DEFAULT_BENCHMARK_CONFIG.maxTurns})
  --modes <list>       random,adversarial
  --openings <list>    AAAB,AABB,ABAB,ABAC,AABC,AAAA,ABCD
  --output <file>      JSON report path
  --baseline <file>    Reuse its config and print a before/after comparison
  --no-output          Do not write a report file`)
}

try {
  switch (command) {
    case 'run': runCommand(); break
    case 'compare': compareCommand(); break
    case 'replay': replayCommand(); break
    case 'help': printHelp(); break
    default: throw new Error(`unknown command: ${command}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
