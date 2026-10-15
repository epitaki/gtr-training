import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import catalog from '../../benchmarks/human/catalog.json'
import template from '../../benchmarks/human/case-template.json'

const root = resolve('benchmarks/human')
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))

describe('reusable human replay library', () => {
  it('preserves the exact original datasets and counts the pilot as a subset', () => {
    const canonical = catalog.datasets.find(row => row.id === catalog.canonicalDataset)!
    const canonicalRecords = new Map<string, string>(readJson(canonical.path).records
      .map((row: { id: string; record: string }) => [row.id, row.record]))
    for (const dataset of catalog.datasets) {
      const bytes = readFileSync(resolve(root, dataset.path))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(dataset.sha256)
      const rows = JSON.parse(bytes.toString('utf8')).records as { id: string; record: string }[]
      expect(rows).toHaveLength(dataset.recordCount)
      expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
      expect(dataset.unusedHoldout).toBe(false)
      if (dataset.subsetOf) {
        expect(dataset.subsetOf).toBe(canonical.id)
        for (const row of rows) expect(canonicalRecords.get(row.id)).toBe(row.record)
      }
    }
  })

  it('links observations to stored traces without converting observations into correct-move labels', () => {
    const ids = new Set<string>()
    for (const file of catalog.observationFiles) {
      const observation = readJson(file)
      expect(observation.isTemplate).not.toBe(true)
      expect(ids.has(observation.id)).toBe(false)
      ids.add(observation.id)
      const dataset = catalog.datasets.find(row => row.id === observation.datasetId)!
      expect(dataset).toBeDefined()
      expect(readJson(dataset.path).records.some((row: { id: string }) => row.id === observation.recordId)).toBe(true)
      const judgment = observation.judgment ?? observation.validation
      expect(judgment.isCorrectMoveLabel).toBe(false)
      expect(['unassessed', 'investigating', 'accepted', 'rejected', 'inconclusive']).toContain(judgment.status)
    }
    expect(template.isTemplate).toBe(true)
    expect(template.validation.status).toBe('unassessed')
    expect(template.observation.transcriptionConfidence).toBe('unverified')
    expect(template.validation.isCorrectMoveLabel).toBe(false)
    expect(catalog.observationFiles).not.toContain(catalog.caseTemplate)
  })
})
