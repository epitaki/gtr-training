import { describe, expect, it, vi } from 'vitest'
import { PlacementAdvisor } from '../game/advisor/PlacementAdvisor'
import {
  aggregateBenchmarkGames,
  runAdvisorBenchmark,
} from './AdvisorBenchmark'
import { parseBenchmarkReportJson } from './BenchmarkReportValidation'

const createReport = () => runAdvisorBenchmark({
  seed: 123,
  gamesPerMode: 1,
  maxTurns: 1,
  modes: ['random'],
  openingKinds: ['AAAB'],
})

const refreshAggregates = (report: Record<string, any>): void => {
  for (const mode of report.modes) {
    const aggregate = aggregateBenchmarkGames(mode.games)
    mode.metrics = aggregate.metrics
    mode.failureReasons = aggregate.failureReasons
    for (const opening of Object.keys(mode.byOpening)) {
      const openingAggregate = aggregateBenchmarkGames(
        mode.games.filter((game: Record<string, any>) => game.openingKind === opening),
      )
      mode.byOpening[opening] = openingAggregate
    }
  }
  report.overall = aggregateBenchmarkGames(
    report.modes.flatMap((mode: Record<string, any>) => mode.games),
  )
}

describe('parseBenchmarkReportJson', () => {
  it('accepts a current report', () => {
    const report = createReport()
    expect(parseBenchmarkReportJson(JSON.stringify(report))).toEqual(report)
  })

  it('rejects reports from an incompatible version', () => {
    const report = createReport()
    const oldReport = { ...report, version: 1 }
    expect(() => parseBenchmarkReportJson(
      JSON.stringify(oldReport),
      'old.json',
    )).toThrow('unsupported benchmark report version in old.json: expected 3, got 1')
  })

  it('rejects the removed assisted mode even when the version says current', () => {
    const report = createReport() as unknown as Record<string, any>
    report.config.modes = ['assisted']
    report.modes[0].mode = 'assisted'
    report.modes[0].games[0].mode = 'assisted'
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      'unsupported value: assisted',
    )
  })

  it('rejects an incompatible game trace schema', () => {
    const report = createReport() as unknown as Record<string, any>
    report.modes[0].games[0].finalGrid = Array.from(
      { length: 13 },
      () => Array(6).fill(null),
    )
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      'expected a string',
    )
  })

  it.each([
    ['zero games per mode', (report: Record<string, any>) => {
      report.config.gamesPerMode = 0
    }, 'gamesPerMode must be a positive integer'],
    ['negative max turns', (report: Record<string, any>) => {
      report.config.maxTurns = -1
    }, 'maxTurns must be a positive integer'],
    ['empty modes', (report: Record<string, any>) => {
      report.config.modes = []
    }, 'modes must contain unique benchmark modes'],
    ['duplicate modes', (report: Record<string, any>) => {
      report.config.modes = ['random', 'random']
    }, 'modes must contain unique benchmark modes'],
    ['empty openings', (report: Record<string, any>) => {
      report.config.openingKinds = []
    }, 'openingKinds must contain unique known opening classifications'],
    ['duplicate openings', (report: Record<string, any>) => {
      report.config.openingKinds = ['AAAB', 'AAAB']
    }, 'openingKinds must contain unique known opening classifications'],
  ])('rejects invalid config: %s', (_, mutate, expected) => {
    const report = createReport() as unknown as Record<string, any>
    mutate(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(expected)
  })

  it.each([
    ['missing games', (report: Record<string, any>) => {
      report.modes[0].games = []
    }, 'expected 1 games, got 0'],
    ['negative game count', (report: Record<string, any>) => {
      report.modes[0].metrics.games = -1
    }, 'expected a non-negative integer'],
    ['negative failure count', (report: Record<string, any>) => {
      report.modes[0].failureReasons.game_over = -1
    }, 'expected a non-negative integer'],
    ['out-of-range rate', (report: Record<string, any>) => {
      report.overall.metrics.coreCompletionRate = 1.1
    }, 'expected 0..1'],
    ['wrong overall game count', (report: Record<string, any>) => {
      report.overall.metrics.games = 0
    }, 'expected 1, got 0'],
    ['extra opening aggregate', (report: Record<string, any>) => {
      report.modes[0].byOpening.AABB = structuredClone(
        report.modes[0].byOpening.AAAB,
      )
    }, 'keys must match the represented opening classifications'],
  ])('rejects inconsistent aggregates: %s', (_, mutate, expected) => {
    const report = createReport() as unknown as Record<string, any>
    mutate(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(expected)
  })

  it.each([
    ['game index', (report: Record<string, any>) => {
      report.modes[0].games[0].gameIndex = 1
    }, 'expected 0'],
    ['game max turns', (report: Record<string, any>) => {
      report.modes[0].games[0].maxTurns = 2
    }, 'expected 1'],
    ['scheduled opening', (report: Record<string, any>) => {
      report.config.openingKinds = ['AABB']
    }, 'expected AABB'],
  ])('rejects inconsistent game identity: %s', (_, mutate, expected) => {
    const report = createReport() as unknown as Record<string, any>
    mutate(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(expected)
  })

  it('rejects plausible but incorrectly derived aggregate metrics', () => {
    const report = createReport() as unknown as Record<string, any>
    report.overall.metrics.coreCompletionRate = 0.5
    report.modes[0].metrics.coreCompletionRate = 0.5
    report.modes[0].byOpening.AAAB.metrics.coreCompletionRate = 0.5
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      'metrics.coreCompletionRate: expected',
    )
  })

  it.each([
    ['wrong derived seed', (report: Record<string, any>) => {
      report.modes[0].games[0].gameSeed++
    }, '.gameSeed: expected'],
    ['opening pair classification', (report: Record<string, any>) => {
      const pairs = report.modes[0].games[0].openingPairs
      const colors = [pairs[0].main, pairs[0].sub, pairs[1].main, pairs[1].sub]
      const rotated = [colors[1], colors[2], colors[3], colors[0]]
      report.modes[0].games[0].openingPairs = [
        { main: rotated[0], sub: rotated[1] },
        { main: rotated[2], sub: rotated[3] },
      ]
    }, '.openingPairs'],
    ['negative turn chain', (report: Record<string, any>) => {
      report.modes[0].games[0].turns[0].chainCount = -1
    }, 'expected a non-negative integer'],
    ['too few clears for the chain count', (report: Record<string, any>) => {
      const turn = report.modes[0].games[0].turns[0]
      turn.chainCount = 3
      turn.clearedPuyos = 1
    }, 'at least four puyos per chain step'],
    ['negative maximum chain', (report: Record<string, any>) => {
      report.modes[0].games[0].maxIntendedChain = -1
    }, 'expected a non-negative integer'],
    ['out-of-range participation', (report: Record<string, any>) => {
      report.modes[0].games[0].participationRate = 2
    }, 'expected 0..1'],
    ['avoidance decisions above opportunities', (report: Record<string, any>) => {
      const game = report.modes[0].games[0]
      game.avoidanceDecisions = game.avoidanceOpportunities + 1
    }, 'cannot exceed avoidanceOpportunities'],
    ['intended result on a non-fire turn', (report: Record<string, any>) => {
      report.modes[0].games[0].turns[0].intendedMainChainCount = 3
    }, 'non-fire turns cannot contain intended-fire results'],
    ['zero-sized intended fire', (report: Record<string, any>) => {
      report.modes[0].games[0].turns[0].intendedMainFire = true
    }, 'intended-fire results must be positive'],
    ['seeded next-next pair', (report: Record<string, any>) => {
      const pair = report.modes[0].games[0].turns[0].nextNextPair
      pair.main = pair.main === 'red' ? 'green' : 'red'
    }, '.nextNextPair'],
  ])('rejects invalid game data: %s', (_, mutate, expected) => {
    const report = createReport() as unknown as Record<string, any>
    mutate(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(expected)
  })

  it('rejects a failure reason inconsistent with the terminal state', () => {
    const report = createReport() as unknown as Record<string, any>
    report.modes[0].games[0].failureReason = 'tail_not_completed'
    refreshAggregates(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      '.failureReason: expected core_not_completed',
    )
  })

  it('rejects a trace that ends before maxTurns without a terminal state', () => {
    const report = createReport() as unknown as Record<string, any>
    const game = report.modes[0].games[0]
    Object.assign(game, {
      turns: [],
      finalGrid: '.'.repeat(78),
      coreCompleted: false,
      guidedTargetCompleted: false,
      actualFireAvailable: false,
      actualFire: false,
      maxIntendedChain: 0,
      maxPhysicalChain: 0,
      unintendedClearCount: 0,
      allClear: false,
      coreTurn: null,
      completionTurn: null,
      fireTurn: null,
      participationRate: null,
      leftoverPuyos: null,
      maxColumnHeight: 0,
      gameOver: false,
      avoidanceOpportunities: 0,
      avoidanceDecisions: 0,
      terminalInput: null,
      failureReason: 'core_not_completed',
    })
    refreshAggregates(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      'trace ended before maxTurns',
    )
  })

  it('rejects disconnected turn grids', () => {
    const report = createReport() as unknown as Record<string, any>
    report.modes[0].games[0].turns[0].gridBefore = 'R' + '.'.repeat(77)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      'does not match the previous grid',
    )
  })

  it('rejects a board transition that disagrees with the placement', () => {
    const report = createReport() as unknown as Record<string, any>
    const game = report.modes[0].games[0]
    game.turns[0].gridAfter = '.'.repeat(78)
    game.finalGrid = '.'.repeat(78)
    game.maxColumnHeight = 0
    refreshAggregates(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      'does not match the simulated placement',
    )
  })

  it('rejects a maximum height not derived from the physical trace', () => {
    const report = createReport() as unknown as Record<string, any>
    const game = report.modes[0].games[0]
    game.maxColumnHeight = game.maxColumnHeight === 13 ? 12 : 13
    refreshAggregates(report)
    expect(() => parseBenchmarkReportJson(JSON.stringify(report))).toThrow(
      '.maxColumnHeight: expected',
    )
  })

  it('does not re-evaluate a saved baseline with the current advisor logic', () => {
    const report = createReport()
    const foldSpy = vi.spyOn(PlacementAdvisor, 'getFoldPlan').mockReturnValue(null)
    try {
      expect(parseBenchmarkReportJson(JSON.stringify(report))).toEqual(report)
    } finally {
      foldSpy.mockRestore()
    }
  })
})
