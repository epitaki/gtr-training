export type BenchmarkCliCommand = 'run' | 'compare' | 'replay' | 'help'

export interface ParsedBenchmarkCliArguments {
  command: BenchmarkCliCommand
  options: Record<string, string | true>
}

const VALUE_OPTIONS: Record<Exclude<BenchmarkCliCommand, 'help'>, Set<string>> = {
  run: new Set(['seed', 'games', 'turns', 'modes', 'openings', 'output', 'baseline']),
  compare: new Set(['baseline', 'current', 'output']),
  replay: new Set(['report', 'mode', 'game', 'game-seed']),
}

const FLAG_OPTIONS: Record<Exclude<BenchmarkCliCommand, 'help'>, Set<string>> = {
  run: new Set(['no-output']),
  compare: new Set(),
  replay: new Set(),
}

export const parseBenchmarkCliArguments = (
  input: string[],
): ParsedBenchmarkCliArguments => {
  const args = [...input]
  let command: BenchmarkCliCommand = 'run'
  const first = args[0]

  if (first === '--help' || first === '-h') {
    args.shift()
    command = 'help'
  } else if (first && !first.startsWith('-')) {
    args.shift()
    if (!['run', 'compare', 'replay', 'help'].includes(first)) {
      throw new Error(`unknown command: ${first}`)
    }
    command = first as BenchmarkCliCommand
  }

  if (command === 'help') {
    if (args.length > 0) throw new Error(`unexpected argument: ${args[0]}`)
    return { command, options: {} }
  }

  const options: Record<string, string | true> = {}
  const valueOptions = VALUE_OPTIONS[command]
  const flagOptions = FLAG_OPTIONS[command]

  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const name = token.slice(2)
    if (!name) throw new Error('empty option is not allowed')
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      throw new Error(`duplicate option: --${name}`)
    }

    if (flagOptions.has(name)) {
      options[name] = true
      continue
    }
    if (!valueOptions.has(name)) throw new Error(`unknown option for ${command}: --${name}`)

    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${name}`)
    }
    options[name] = value
    index++
  }

  const hasOption = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(options, name)
  if (command === 'run' && hasOption('output') && hasOption('no-output')) {
    throw new Error('--output and --no-output cannot be used together')
  }
  if (command === 'replay' && hasOption('game') && hasOption('game-seed')) {
    throw new Error('--game and --game-seed cannot be used together')
  }

  return { command, options }
}
