import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const gameRoot = fileURLToPath(new URL('./game/', import.meta.url))
const walk = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const file = join(folder, entry.name)
  return entry.isDirectory() ? walk(file) : [file]
})
const modules = walk(gameRoot).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
const allowed: Record<string, string[]> = {
  core: ['core'],
  gtr: ['core', 'gtr'],
  advisor: ['core', 'gtr', 'advisor'],
  guide: ['core', 'gtr', 'advisor', 'guide'],
  feedback: ['core', 'gtr', 'advisor', 'feedback'],
  input: ['input'],
  scoreAttack: ['core', 'gtr', 'advisor', 'scoreAttack'],
}

describe('feature modules and dependency direction', () => {
  it('keeps calculation modules independent of UI, scenes and benchmark tools', () => {
    const violations: string[] = []
    for (const file of modules) {
      const localPath = relative(gameRoot, file).replace(/\\/g, '/')
      const group = localPath.split('/')[0]
      if (!allowed[group]) continue
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      const check = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === 'Phaser') violations.push(`${localPath}: Phaser type leakage`)
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text
          // App version is data, not a dependency on an application layer.
          if (group === 'feedback' && specifier === '../../../package.json') return
          const target = relative(gameRoot, resolve(dirname(file), specifier)).replace(/\\/g, '/')
          if (!specifier.startsWith('.') || !allowed[group].includes(target.split('/')[0])) {
            violations.push(`${localPath} -> ${specifier}`)
          }
        }
        ts.forEachChild(node, check)
      }
      check(source)
    }
    expect(violations).toEqual([])
  })
})
