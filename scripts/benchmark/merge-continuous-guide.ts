import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { deriveBenchmarkGameSeed } from '../../src/benchmark/AdvisorBenchmark'
import { summarizeContinuousGames, type measureContinuousGame } from './measure-continuous-guide'

interface Report {
  tailDefinition?: string
  version: number; mode: string; seed: number; start: number; maxTurns: number; openingKinds: string[]
  hashes: Record<string, string>; harnessSha256: string; supplierSha256: string
  games: ReturnType<typeof measureContinuousGame>[]
}

export function mergeContinuousReports(reports: Report[]) {
  if (!reports.length) throw new Error('No reports')
  const ordered = [...reports].sort((a, b) => a.start - b.start), first = ordered[0]
  const signature = (r: Report) => JSON.stringify([r.version, r.mode, r.seed, r.maxTurns, r.openingKinds, r.tailDefinition ?? 'legacy-fixed-head',
    Object.entries(r.hashes).sort(([a], [b]) => a.localeCompare(b)), r.harnessSha256, r.supplierSha256])
  let expected = 0
  for (const report of ordered) {
    if (report.version !== 1 || report.mode !== 'continuous-guide' || !report.games.length ||
        signature(report) !== signature(first) || report.start !== expected ||
        report.games.some((g, i) => g.gameIndex !== expected + i || g.maxTurns !== report.maxTurns ||
          g.gameSeed !== deriveBenchmarkGameSeed(report.seed, g.gameIndex) ||
          g.openingKind !== report.openingKinds[g.gameIndex % report.openingKinds.length])) {
      throw new Error('Mixed, duplicate, missing, or mismatched continuous-game ranges')
    }
    expected += report.games.length
  }
  const games = ordered.flatMap(r => r.games)
  return { ...first, start: 0, summary: summarizeContinuousGames(games), games }
}

if (import.meta.main) {
  const [output, ...inputs] = process.argv.slice(2)
  if (!output || existsSync(output)) throw new Error('Expected new-output.json shard.json ...')
  const raw = inputs.map(path => readFileSync(path, 'utf8'))
  const report = mergeContinuousReports(raw.map(text => JSON.parse(text)))
  const merged = { ...report, parts: inputs.map((path, i) => ({ path,
    sha256: createHash('sha256').update(raw[i]).digest('hex') })),
    mergerSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex') }
  writeFileSync(output, JSON.stringify(merged, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(merged.summary))
}
