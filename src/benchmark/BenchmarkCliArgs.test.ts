import { describe, expect, it } from 'vitest'
import { parseBenchmarkCliArguments } from './BenchmarkCliArgs'

describe('parseBenchmarkCliArguments', () => {
  it('runの値オプションとフラグを消費する', () => {
    expect(parseBenchmarkCliArguments([
      'run',
      '--games', '6',
      '--openings', 'AAAB,ABCD',
      '--no-output',
    ])).toEqual({
      command: 'run',
      options: {
        games: '6',
        openings: 'AAAB,ABCD',
        'no-output': true,
      },
    })
  })

  it('compareの出力とreplayのgame seedを受け付ける', () => {
    expect(parseBenchmarkCliArguments([
      'compare', '--baseline', 'old.json', '--current', 'new.json', '--output', 'diff.json',
    ]).options.output).toBe('diff.json')
    expect(parseBenchmarkCliArguments([
      'replay', '--report', 'report.json', '--game-seed', '123',
    ]).options['game-seed']).toBe('123')
  })

  it.each([
    [['run', '--gaems', '1'], 'unknown option'],
    [['run', '--games'], 'missing value'],
    [['run', '--games', '1', '--games', '2'], 'duplicate option'],
    [['run', 'extra'], 'unexpected argument'],
    [['compare', '--games', '1'], 'unknown option'],
    [['run', '--output', 'report.json', '--no-output'], 'cannot be used together'],
    [['replay', '--game', '0', '--game-seed', '123'], 'cannot be used together'],
  ])('不正な引数%jを拒否する', (args, message) => {
    expect(() => parseBenchmarkCliArguments(args)).toThrow(message)
  })

  it('helpを独立コマンドとして扱う', () => {
    expect(parseBenchmarkCliArguments(['--help'])).toEqual({
      command: 'help',
      options: {},
    })
  })
})
