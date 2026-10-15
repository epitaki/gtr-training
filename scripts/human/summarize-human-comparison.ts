import { readFileSync, writeFileSync } from 'node:fs'

interface Row {
  id: string; player: string; split: string; foldType: string; turn: number
  grid: string; pair: string[]; next: string[]; next2: string[]
  human: { column: number; rotation: number }
  agreement: boolean; humanRank: number; humanChigiri: number; advisorChigiri: number
}
interface Report { datasetSha256: string; rows: Row[]; exclusions: unknown[] }
const [beforePath, afterPath, outputPath] = process.argv.slice(2)
if (!beforePath || !afterPath) throw new Error('Usage: summarize-human-comparison.ts BEFORE AFTER [OUTPUT]')
const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Report
const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Report
if (before.datasetSha256 !== after.datasetSha256) throw new Error('Dataset differs')
if (JSON.stringify(before.exclusions) !== JSON.stringify(after.exclusions)) throw new Error('Exclusions differ')
const key = (row: Row) => `${row.id}:${row.turn}`
const previous = new Map(before.rows.map(row => [key(row), row]))
if (previous.size !== before.rows.length || new Set(after.rows.map(key)).size !== after.rows.length || before.rows.length !== after.rows.length) {
  throw new Error('Duplicate or missing decisions')
}
const inputs = (row: Row) => JSON.stringify([row.player, row.split, row.foldType, row.grid, row.pair, row.next, row.next2, row.human, row.humanChigiri])
for (const row of after.rows) {
  if (!previous.has(key(row)) || inputs(previous.get(key(row))!) !== inputs(row)) throw new Error(`Different inputs: ${key(row)}`)
}
const summarize = (rows: Row[]) => {
  const old = rows.map(row => previous.get(key(row))!)
  const count = (values: Row[], predicate: (row: Row) => boolean) => values.filter(predicate).length
  const metrics = (values: Row[]) => ({
    matches: count(values, row => row.agreement),
    matchPercent: values.length ? count(values, row => row.agreement) * 100 / values.length : null,
    top3: count(values, row => row.humanRank > 0 && row.humanRank <= 3),
    splitMoves: count(values, row => row.advisorChigiri > 0),
    splitHeight: values.reduce((n, row) => n + row.advisorChigiri, 0),
  })
  return { records: new Set(rows.map(row => row.id)).size, decisions: rows.length,
    humanSplitMoves: count(rows, row => row.humanChigiri > 0), before: metrics(old), after: metrics(rows),
    becameMatch: count(rows, row => row.agreement && !previous.get(key(row))!.agreement),
    lostMatch: count(rows, row => !row.agreement && previous.get(key(row))!.agreement),
  }
}
const group = (pick: (row: Row) => string) => Object.fromEntries([...new Set(after.rows.map(pick))]
  .map(value => [value, summarize(after.rows.filter(row => pick(row) === value))]))
const result = { beforePath, afterPath, datasetSha256: after.datasetSha256,
  all: summarize(after.rows), bySplit: group(row => row.split), byPlayer: group(row => row.player),
  byFold: group(row => row.foldType), bySplitAndFold: group(row => `${row.split}:${row.foldType}`) }
if (outputPath) writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
