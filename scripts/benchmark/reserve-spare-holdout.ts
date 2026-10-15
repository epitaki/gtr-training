import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { deriveBenchmarkGameSeed } from '../../src/benchmark/AdvisorBenchmark'

const [bundle, output, seedText] = process.argv.slice(2)
const seed = Number(seedText)
if (!bundle || !output || !Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('Expected frozen.js new-manifest.json seed')
const files: string[] = []
function scan(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) scan(path)
    else if (entry.name.endsWith('.json')) files.push(path)
  }
}
scan('benchmarks')
const existing = new Set<number>()
for (const file of files) {
  const contents = readFileSync(file, 'utf8')
  for (const match of contents.matchAll(/"gameSeed"\s*:\s*(\d+)/g)) existing.add(Number(match[1]))
  for (const match of contents.matchAll(/"seed"\s*:\s*(\d+)/g)) {
    if (Number(match[1]) === seed) throw new Error(`Seed already recorded: ${file}`)
  }
}
const seeds = Array.from({ length: 500 }, (_, index) => deriveBenchmarkGameSeed(seed, index))
if (seeds.some(value => existing.has(value)) || new Set(seeds).size !== 500) throw new Error('Game seed overlap')
writeFileSync(output, JSON.stringify({ seed, games: 500, frozenBundle: bundle,
  sha256: createHash('sha256').update(readFileSync(bundle)).digest('hex'),
  scannedFiles: files.length, distinctRecordedGameSeeds: existing.size, overlap: 0,
  condition: 'random four colors, 20 moves, AAAB/AABB/ABAB/ABAC/AABC/AAAA; no sequence inspected at reservation',
}, null, 2) + '\n', { flag: 'wx' })
console.log(`Reserved ${seed}; checked ${files.length} files and ${existing.size} game seeds`)
