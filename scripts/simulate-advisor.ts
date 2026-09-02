/**
 * PlacementAdvisor GTR構築シミュレーション
 * アドバイザーの推薦に従ってプレイし、GTRが完成するか検証する
 */

import { PuyoColor } from '../src/game/types'
import type { GameField, PuyoPair } from '../src/game/types'
import { PlacementAdvisor } from '../src/game/PlacementAdvisor'
import { GTRDetector } from '../src/game/GTRPatterns'

// === ユーティリティ ===

const COLOR_CHAR: Record<string, string> = {
  [PuyoColor.RED]: 'R',
  [PuyoColor.GREEN]: 'G',
  [PuyoColor.BLUE]: 'B',
  [PuyoColor.YELLOW]: 'Y',
}

function createEmptyGrid(): (PuyoColor | null)[][] {
  const grid: (PuyoColor | null)[][] = []
  for (let y = 0; y < 13; y++) {
    grid.push(new Array(6).fill(null))
  }
  return grid
}

function printGrid(grid: (PuyoColor | null)[][], turnLabel: string) {
  console.log(`\n=== ${turnLabel} ===`)
  // 下4行だけ表示（row 9-12）
  for (let y = 8; y < 13; y++) {
    const row = grid[y].map((cell, x) => {
      if (cell === null) return '.'
      return COLOR_CHAR[cell] || '?'
    })
    console.log(`  Row ${y}: ${row.join(' ')}`)
  }
}

function createGameField(grid: (PuyoColor | null)[][]): GameField {
  return { grid, width: 6, height: 13 }
}

function createPair(mainColor: PuyoColor, subColor: PuyoColor): PuyoPair {
  return {
    main: { color: mainColor, x: 2, y: 1 },
    sub: { color: subColor, x: 2, y: 0 },
    rotation: 0,
    falling: true,
  }
}

// === 固定ぷよ配列でのシミュレーション ===

interface SimResult {
  success: boolean
  turnsUsed: number
  gtrDetected: boolean
  chainCount: number
  finalGrid: (PuyoColor | null)[][]
}

function simulateGame(pairs: PuyoPair[], label: string): SimResult {
  const grid = createEmptyGrid()
  const field = createGameField(grid)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`シミュレーション: ${label}`)
  console.log(`${'='.repeat(60)}`)

  for (let turn = 0; turn < pairs.length; turn++) {
    const pair = pairs[turn]
    const mainChar = COLOR_CHAR[pair.main.color]
    const subChar = COLOR_CHAR[pair.sub.color]
    const nextPair = turn + 1 < pairs.length ? pairs[turn + 1] : undefined

    const advice = PlacementAdvisor.getAdvice(field, pair, nextPair)

    if (!advice.bestPlacement) {
      console.log(`\nTurn ${turn + 1} (${mainChar}-${subChar}): 配置不可能！`)
      return { success: false, turnsUsed: turn, gtrDetected: false, chainCount: 0, finalGrid: grid }
    }

    const best = advice.bestPlacement
    const landing = best.landing

    // 配置実行
    grid[landing.mainPos.y][landing.mainPos.x] = pair.main.color
    grid[landing.subPos.y][landing.subPos.x] = pair.sub.color

    // 4つ繋がりチェック＆消去（暴発検出）
    const cleared = checkAndClear(grid)

    const rotLabel = ['↑', '→', '↓', '←'][best.placement.rotation]
    console.log(
      `Turn ${turn + 1} (${mainChar}-${subChar}): col=${best.placement.column} rot=${rotLabel} ` +
      `→ main(${landing.mainPos.x},${landing.mainPos.y}) sub(${landing.subPos.x},${landing.subPos.y}) ` +
      `score=${best.totalScore.toFixed(1)} phase=${advice.phase}` +
      (cleared ? ' ⚠暴発!' : '')
    )

    // Top3を表示
    const top3 = advice.allPlacements.slice(0, 3)
    for (let i = 0; i < top3.length; i++) {
      const p = top3[i]
      const rLabel = ['↑', '→', '↓', '←'][p.placement.rotation]
      console.log(
        `  #${i + 1}: col=${p.placement.column} rot=${rLabel} ` +
        `main(${p.landing.mainPos.x},${p.landing.mainPos.y}) sub(${p.landing.subPos.x},${p.landing.subPos.y}) ` +
        `score=${p.totalScore.toFixed(1)}`
      )
    }

    printGrid(grid, `Turn ${turn + 1} 後`)

    // GTR判定
    const gtrResult = GTRDetector.detectGTR(grid)
    if (gtrResult.hasBasicPattern) {
      console.log(`\n🎉 GTR検出! Turn ${turn + 1} で折り返し完成`)
      console.log(`  chainCount=${gtrResult.chainCount} quality=${gtrResult.quality} total=${gtrResult.totalScore}`)
      return { success: true, turnsUsed: turn + 1, gtrDetected: true, chainCount: gtrResult.chainCount, finalGrid: grid }
    }
  }

  console.log(`\n❌ ${pairs.length}手で GTR 未完成`)
  const finalResult = GTRDetector.detectGTR(grid)
  return { success: false, turnsUsed: pairs.length, gtrDetected: false, chainCount: finalResult.chainCount, finalGrid: grid }
}

// 4つ繋がり消去チェック
function checkAndClear(grid: (PuyoColor | null)[][]): boolean {
  let anyCleared = false

  const findGroup = (x: number, y: number, color: PuyoColor, visited: Set<string>): string[] => {
    const key = `${x},${y}`
    if (visited.has(key)) return []
    if (x < 0 || x >= 6 || y < 0 || y >= 13) return []
    if (grid[y][x] !== color) return []
    visited.add(key)
    return [key, ...findGroup(x-1, y, color, visited), ...findGroup(x+1, y, color, visited),
            ...findGroup(x, y-1, color, visited), ...findGroup(x, y+1, color, visited)]
  }

  let cleared = true
  while (cleared) {
    cleared = false
    const visited = new Set<string>()
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 6; x++) {
        if (grid[y][x] && !visited.has(`${x},${y}`)) {
          const group = findGroup(x, y, grid[y][x]!, visited)
          if (group.length >= 4) {
            for (const key of group) {
              const [gx, gy] = key.split(',').map(Number)
              grid[gy][gx] = null
            }
            cleared = true
            anyCleared = true
          }
        }
      }
    }
    // 重力
    if (cleared) {
      for (let x = 0; x < 6; x++) {
        for (let y = 12; y >= 0; y--) {
          if (grid[y][x] === null) {
            for (let above = y - 1; above >= 0; above--) {
              if (grid[above][x] !== null) {
                grid[y][x] = grid[above][x]
                grid[above][x] = null
                break
              }
            }
          }
        }
      }
    }
  }
  return anyCleared
}

// === テストケース ===

const R = PuyoColor.RED
const G = PuyoColor.GREEN
const B = PuyoColor.BLUE
const Y = PuyoColor.YELLOW

// テスト1: 理想的な配色（ABAB型: 緑-青, 緑-青 → 2手で折り返し最下段OK）
console.log('\n' + '▣'.repeat(30))
console.log('テスト1: 理想配色 (Green-Blue系)')
console.log('▣'.repeat(30))
simulateGame([
  createPair(B, B),   // 1手目: 青-青
  createPair(G, G),   // 2手目: 緑-緑
  createPair(B, G),   // 3手目: 青-緑
  createPair(G, B),   // 4手目: 緑-青
  createPair(R, Y),   // 5手目: off-color（赤-黄）
  createPair(Y, R),   // 6手目: off-color（黄-赤）
  createPair(R, R),   // 7手目: 赤-赤
  createPair(Y, Y),   // 8手目: 黄-黄
], 'テスト1: Green-Blue GTR + off-color handling')

// テスト2: AAAB型（青-青-青-赤）
console.log('\n' + '▣'.repeat(30))
console.log('テスト2: AAAB型 (Blue多め)')
console.log('▣'.repeat(30))
simulateGame([
  createPair(B, B),   // 1手目: 青-青
  createPair(B, R),   // 2手目: 青-赤
  createPair(G, G),   // 3手目: 緑-緑
  createPair(G, B),   // 4手目: 緑-青
  createPair(R, Y),   // 5手目: off-color
  createPair(Y, R),   // 6手目: off-color
  createPair(G, R),   // 7手目: 緑-赤
  createPair(Y, Y),   // 8手目: 黄-黄
], 'テスト2: AAAB Blue + off-color')

// テスト3: 現実的な配色パターン（ABAC型: 赤-緑, 赤-青）
console.log('\n' + '▣'.repeat(30))
console.log('テスト3: ABAC型')
console.log('▣'.repeat(30))
simulateGame([
  createPair(R, G),   // 1手目: 赤-緑
  createPair(R, B),   // 2手目: 赤-青
  createPair(G, G),   // 3手目: 緑-緑
  createPair(B, R),   // 4手目: 青-赤
  createPair(G, B),   // 5手目: 緑-青
  createPair(Y, Y),   // 6手目: 黄-黄
  createPair(R, G),   // 7手目: 赤-緑
  createPair(B, Y),   // 8手目: 青-黄
], 'テスト3: ABAC型 Red-Green/Blue')

// テスト4: 全off-colorからスタート
console.log('\n' + '▣'.repeat(30))
console.log('テスト4: off-colorスタート')
console.log('▣'.repeat(30))
simulateGame([
  createPair(Y, R),   // 1手目: off-color
  createPair(R, Y),   // 2手目: off-color
  createPair(B, B),   // 3手目: 青-青
  createPair(G, G),   // 4手目: 緑-緑
  createPair(G, B),   // 5手目: 緑-青
  createPair(B, G),   // 6手目: 青-緑
  createPair(G, B),   // 7手目: 緑-青
  createPair(R, Y),   // 8手目: off-color
], 'テスト4: off-color先行 → GTR構築')

// テスト5: ユーザーのスクリーンショットに近い状況を再現
// 最下段: B B Y Y
// 2段目:  G G _ Y
// 手駒: Y-R
console.log('\n' + '▣'.repeat(30))
console.log('テスト5: ユーザー報告ケース再現')
console.log('▣'.repeat(30))
{
  // 手動でフィールドをセットアップ
  const grid = createEmptyGrid()
  grid[12][0] = B; grid[12][1] = B; grid[12][2] = Y; grid[12][3] = Y
  grid[11][0] = G; grid[11][1] = G; grid[11][3] = Y

  const field = createGameField(grid)

  console.log('\n初期状態:')
  printGrid(grid, '初期フィールド')

  // 各配色で推薦をチェック
  const testPairs = [
    createPair(Y, R),  // ユーザーの手駒
    createPair(R, Y),
    createPair(G, B),  // 折り返し色
    createPair(B, G),
  ]

  for (let i = 0; i < testPairs.length; i++) {
    const pair = testPairs[i]
    const mainChar = COLOR_CHAR[pair.main.color]
    const subChar = COLOR_CHAR[pair.sub.color]
    const nextPair = i + 1 < testPairs.length ? testPairs[i + 1] : undefined
    const advice = PlacementAdvisor.getAdvice(field, pair, nextPair)

    console.log(`\n--- 手駒: ${mainChar}-${subChar} (phase: ${advice.phase}) ---`)

    const top5 = advice.allPlacements.slice(0, 5)
    for (let i = 0; i < top5.length; i++) {
      const p = top5[i]
      const rLabel = ['↑', '→', '↓', '←'][p.placement.rotation]
      console.log(
        `  #${i + 1}: col=${p.placement.column} rot=${rLabel} ` +
        `main(${p.landing.mainPos.x},${p.landing.mainPos.y}) sub(${p.landing.subPos.x},${p.landing.subPos.y}) ` +
        `score=${p.totalScore.toFixed(1)}`
      )
    }
  }
}

// === ランダムペアシミュレーション（実ゲームに近い状況） ===

const ALL_COLORS = [R, G, B, Y]

function randomColor(): PuyoColor {
  return ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]
}

// ゲームと同じ2手制約を使ってランダムペアを生成
function generateRandomPairs(count: number): PuyoPair[] {
  const pairs: PuyoPair[] = []
  for (let i = 0; i < count; i += 2) {
    // AAAB, ABAB, ABAC, AABC の4パターンからランダム選択
    const pattern = ['AAAB', 'ABAB', 'ABAC', 'AABC'][Math.floor(Math.random() * 4)]
    const a = randomColor()
    const others = ALL_COLORS.filter(c => c !== a)
    const b = others[Math.floor(Math.random() * others.length)]
    const c = others.filter(x => x !== b)[Math.floor(Math.random() * (others.length - 1))]

    let p1m: PuyoColor, p1s: PuyoColor, p2m: PuyoColor, p2s: PuyoColor
    switch (pattern) {
      case 'AAAB':
        { const bPos = Math.floor(Math.random() * 4)
          const cols = [a, a, a, b]; if (bPos !== 3) [cols[bPos], cols[3]] = [cols[3], cols[bPos]]
          p1m = cols[0]; p1s = cols[1]; p2m = cols[2]; p2s = cols[3] }
        break
      case 'ABAB':
        if (Math.random() < 0.5) { p1m = a; p1s = b; p2m = a; p2s = b }
        else { p1m = a; p1s = a; p2m = b; p2s = b }
        break
      case 'ABAC':
        p1m = a; p1s = b; p2m = a; p2s = c; break
      case 'AABC':
      default:
        p1m = a; p1s = a; p2m = b; p2s = c; break
    }
    pairs.push(createPair(p1m, p1s))
    if (i + 1 < count) pairs.push(createPair(p2m, p2s))
  }
  return pairs
}

function simulateQuiet(pairs: PuyoPair[]): SimResult {
  const grid = createEmptyGrid()
  const field = createGameField(grid)

  for (let turn = 0; turn < pairs.length; turn++) {
    const pair = pairs[turn]
    const nextPair = turn + 1 < pairs.length ? pairs[turn + 1] : undefined
    const advice = PlacementAdvisor.getAdvice(field, pair, nextPair)
    if (!advice.bestPlacement) {
      return { success: false, turnsUsed: turn, gtrDetected: false, chainCount: 0, finalGrid: grid }
    }
    const landing = advice.bestPlacement.landing
    grid[landing.mainPos.y][landing.mainPos.x] = pair.main.color
    grid[landing.subPos.y][landing.subPos.x] = pair.sub.color
    checkAndClear(grid)

    const gtrResult = GTRDetector.detectGTR(grid)
    if (gtrResult.isGTR) {
      return { success: true, turnsUsed: turn + 1, gtrDetected: true, chainCount: gtrResult.chainCount, finalGrid: grid }
    }
  }
  return { success: false, turnsUsed: pairs.length, gtrDetected: false, chainCount: 0, finalGrid: grid }
}

// ランダムテスト実行（ターン数別成功率）
console.log('\n' + '▣'.repeat(30))
console.log('ランダムペアテスト（2000ゲーム）')
console.log('▣'.repeat(30))

const NUM_GAMES = Number(process.env.SIM_GAMES ?? 500)
const MAX_TURNS_LIST = (process.env.SIM_TURNS ?? '10,12,15,20')
  .split(',')
  .map(Number)
  .filter(Number.isFinite)

for (const MAX_TURNS of MAX_TURNS_LIST) {
  let successCount = 0
  let totalTurns = 0
  const turnDistribution: number[] = []

  for (let game = 0; game < NUM_GAMES; game++) {
    const pairs = generateRandomPairs(MAX_TURNS)
    const result = simulateQuiet(pairs)
    if (result.success) {
      successCount++
      totalTurns += result.turnsUsed
      turnDistribution.push(result.turnsUsed)
    }
  }

  console.log(`\n${MAX_TURNS}手: 成功率 ${successCount}/${NUM_GAMES} (${(successCount / NUM_GAMES * 100).toFixed(1)}%)`)
  if (successCount > 0) {
    console.log(`  平均ターン数: ${(totalTurns / successCount).toFixed(1)}`)
  }
}

if (process.env.SIM_ONLY === '1') {
  process.exit(0)
}

const MAX_TURNS = 15

// === 失敗パターン統計分析 ===
console.log('\n' + '▣'.repeat(30))
console.log(`失敗パターン統計分析（${NUM_GAMES}ゲーム）`)
console.log('▣'.repeat(30))

interface FailureInfo {
  pairs: PuyoPair[]
  finalGrid: (PuyoColor | null)[][]
  p1Filled: number
  p2Filled: number
  p3Filled: number
  p1Correct: number
  p2Correct: number
  p3Correct: number
  wrongColors: number
  hasBurst: boolean
  burstTurn: number      // 暴発が起きたターン（-1なら暴発なし）
  foldHeight: number
  tailHeight: number
  foldPuyoCount: number
  tailPuyoCount: number
  failCategory: string
  // P2の具体的な欠損位置
  p2Missing: string[]    // e.g. ['(0,11)', '(2,11)']
  // P3の具体的な欠損位置
  p3Missing: string[]
  // 折り返し構築に使ったターン数（col0-2に配置したターン数）
  foldTurns: number
  tailTurns: number
}

function analyzeFailure(pairs: PuyoPair[]): FailureInfo | null {
  const grid = createEmptyGrid()
  const field = createGameField(grid)
  let hasBurst = false
  let burstTurn = -1
  let foldTurns = 0
  let tailTurns = 0

  for (let turn = 0; turn < pairs.length; turn++) {
    const pair = pairs[turn]
    const nextPair = turn + 1 < pairs.length ? pairs[turn + 1] : undefined
    const advice = PlacementAdvisor.getAdvice(field, pair, nextPair)
    if (!advice.bestPlacement) break
    const landing = advice.bestPlacement.landing
    grid[landing.mainPos.y][landing.mainPos.x] = pair.main.color
    grid[landing.subPos.y][landing.subPos.x] = pair.sub.color

    // 折り返し/連鎖尾ターン数カウント
    if (landing.mainPos.x <= 2 || landing.subPos.x <= 2) foldTurns++
    else tailTurns++

    if (checkAndClear(grid)) {
      if (!hasBurst) burstTurn = turn + 1
      hasBurst = true
    }

    const gtrResult = GTRDetector.detectGTR(grid)
    if (gtrResult.hasBasicPattern) return null // 成功
  }

  // テンプレート充足分析 - 全12色組合せの中で最もマッチするものを探す
  let bestMatch = { p1F: 0, p2F: 0, p3F: 0, p1C: 0, p2C: 0, p3C: 0, wrong: 0, p2Missing: [] as string[], p3Missing: [] as string[] }
  let bestMatchScore = -1

  for (const colorA of ALL_COLORS) {
    for (const colorB of ALL_COLORS) {
      if (colorA === colorB) continue
      const template = [
        { x: 0, y: 12, need: colorB, pri: 1 },
        { x: 1, y: 12, need: colorB, pri: 1 },
        { x: 0, y: 11, need: colorA, pri: 2 },
        { x: 1, y: 11, need: colorA, pri: 2 },
        { x: 2, y: 11, need: colorB, pri: 2 },
        { x: 0, y: 10, need: colorA, pri: 3 },
        { x: 1, y: 10, need: colorB, pri: 3 },
      ]
      let p1F = 0, p2F = 0, p3F = 0, p1C = 0, p2C = 0, p3C = 0, wrong = 0
      const p2Miss: string[] = []
      const p3Miss: string[] = []
      for (const t of template) {
        const cell = grid[t.y]?.[t.x]
        const filled = cell !== null
        const correct = cell === t.need
        if (t.pri === 1) { if (filled) p1F++; if (correct) p1C++ }
        if (t.pri === 2) {
          if (filled) p2F++; if (correct) p2C++
          if (!correct) p2Miss.push(`(${t.x},${t.y})`)
        }
        if (t.pri === 3) {
          if (filled) p3F++; if (correct) p3C++
          if (!correct) p3Miss.push(`(${t.x},${t.y})`)
        }
        if (filled && !correct) wrong++
      }
      const matchScore = p1C * 3 + p2C * 2 + p3C * 1 - wrong * 2
      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore
        bestMatch = { p1F, p2F, p3F, p1C, p2C, p3C, wrong, p2Missing: p2Miss, p3Missing: p3Miss }
      }
    }
  }

  // 高さ・ぷよ数カウント
  let foldHeight = 0, tailHeight = 0, foldPuyoCount = 0, tailPuyoCount = 0
  for (let x = 0; x < 6; x++) {
    let colH = 0
    for (let y = 0; y < 13; y++) {
      if (grid[y][x] !== null) {
        colH = 13 - y
        break
      }
    }
    if (x <= 2) {
      foldHeight = Math.max(foldHeight, colH)
    } else {
      tailHeight = Math.max(tailHeight, colH)
    }
    for (let y = 0; y < 13; y++) {
      if (grid[y][x] !== null) {
        if (x <= 2) foldPuyoCount++
        else tailPuyoCount++
      }
    }
  }

  // 失敗カテゴリ分類
  let failCategory: string
  const { p1C, p2C, p3C, wrong } = bestMatch
  if (hasBurst) {
    failCategory = 'BURST'  // 暴発
  } else if (foldPuyoCount <= 4 && tailPuyoCount >= 10) {
    failCategory = 'FOLD_EMPTY'  // 折り返しスカスカ
  } else if (wrong >= 3) {
    failCategory = 'WRONG_COLORS'  // 間違った色が多い
  } else if (p1C < 2) {
    failCategory = 'P1_INCOMPLETE'  // P1未完成
  } else if (p2C < 3) {
    failCategory = 'P2_INCOMPLETE'  // P2未完成
  } else if (p3C < 2) {
    failCategory = 'P3_INCOMPLETE'  // P3未完成
  } else if (foldHeight >= 6) {
    failCategory = 'TOO_HIGH'  // 折り返し側が高すぎ
  } else {
    failCategory = 'OTHER'
  }

  return {
    pairs, finalGrid: grid,
    p1Filled: bestMatch.p1F, p2Filled: bestMatch.p2F, p3Filled: bestMatch.p3F,
    p1Correct: p1C, p2Correct: p2C, p3Correct: p3C,
    wrongColors: wrong, hasBurst, burstTurn, foldHeight, tailHeight,
    foldPuyoCount, tailPuyoCount, failCategory,
    p2Missing: bestMatch.p2Missing, p3Missing: bestMatch.p3Missing,
    foldTurns, tailTurns,
  }
}

// 2000ゲームの失敗分析
const failures: FailureInfo[] = []
let successCount2 = 0

for (let game = 0; game < NUM_GAMES; game++) {
  const pairs = generateRandomPairs(MAX_TURNS)
  const info = analyzeFailure(pairs)
  if (info === null) {
    successCount2++
  } else {
    failures.push(info)
  }
}

console.log(`\n全体成功率: ${successCount2}/${NUM_GAMES} (${(successCount2 / NUM_GAMES * 100).toFixed(1)}%)`)
console.log(`失敗数: ${failures.length}`)

// カテゴリ別集計
const categoryCount: Record<string, number> = {}
for (const f of failures) {
  categoryCount[f.failCategory] = (categoryCount[f.failCategory] || 0) + 1
}
console.log('\n【失敗カテゴリ別】')
const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])
for (const [cat, count] of sorted) {
  const pct = (count / failures.length * 100).toFixed(1)
  console.log(`  ${cat}: ${count} (${pct}%)`)
}

// テンプレート充足率の統計
const avgP1 = failures.reduce((s, f) => s + f.p1Correct, 0) / failures.length
const avgP2 = failures.reduce((s, f) => s + f.p2Correct, 0) / failures.length
const avgP3 = failures.reduce((s, f) => s + f.p3Correct, 0) / failures.length
const avgWrong = failures.reduce((s, f) => s + f.wrongColors, 0) / failures.length
console.log('\n【テンプレート充足率（失敗ゲーム平均）】')
console.log(`  P1正解: ${avgP1.toFixed(2)}/2`)
console.log(`  P2正解: ${avgP2.toFixed(2)}/3`)
console.log(`  P3正解: ${avgP3.toFixed(2)}/2`)
console.log(`  間違い色: ${avgWrong.toFixed(2)}/7`)

// 折り返し vs 連鎖尾バランス
const avgFoldPuyo = failures.reduce((s, f) => s + f.foldPuyoCount, 0) / failures.length
const avgTailPuyo = failures.reduce((s, f) => s + f.tailPuyoCount, 0) / failures.length
const avgFoldTurns = failures.reduce((s, f) => s + f.foldTurns, 0) / failures.length
const avgTailTurns = failures.reduce((s, f) => s + f.tailTurns, 0) / failures.length
console.log('\n【折り返し vs 連鎖尾バランス（失敗ゲーム平均）】')
console.log(`  折り返しぷよ数: ${avgFoldPuyo.toFixed(1)} (col 0-2)`)
console.log(`  連鎖尾ぷよ数: ${avgTailPuyo.toFixed(1)} (col 3-5)`)
console.log(`  折り返しターン数: ${avgFoldTurns.toFixed(1)} / 連鎖尾ターン数: ${avgTailTurns.toFixed(1)}`)

// P2欠損位置の統計
const p2Failures = failures.filter(f => f.failCategory === 'P2_INCOMPLETE')
if (p2Failures.length > 0) {
  const p2MissCount: Record<string, number> = {}
  for (const f of p2Failures) {
    for (const pos of f.p2Missing) {
      p2MissCount[pos] = (p2MissCount[pos] || 0) + 1
    }
  }
  console.log(`\n【P2欠損位置（${p2Failures.length}件）】`)
  for (const [pos, count] of Object.entries(p2MissCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pos}: ${count}件 (${(count / p2Failures.length * 100).toFixed(0)}%)`)
  }
}

// P3欠損位置の統計
const p3Failures = failures.filter(f => f.failCategory === 'P3_INCOMPLETE')
if (p3Failures.length > 0) {
  const p3MissCount: Record<string, number> = {}
  for (const f of p3Failures) {
    for (const pos of f.p3Missing) {
      p3MissCount[pos] = (p3MissCount[pos] || 0) + 1
    }
  }
  console.log(`\n【P3欠損位置（${p3Failures.length}件）】`)
  for (const [pos, count] of Object.entries(p3MissCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pos}: ${count}件 (${(count / p3Failures.length * 100).toFixed(0)}%)`)
  }
}

// BURST統計
const burstFailures = failures.filter(f => f.failCategory === 'BURST')
if (burstFailures.length > 0) {
  const avgBurstTurn = burstFailures.reduce((s, f) => s + f.burstTurn, 0) / burstFailures.length
  const burstTurnDist: Record<number, number> = {}
  for (const f of burstFailures) {
    burstTurnDist[f.burstTurn] = (burstTurnDist[f.burstTurn] || 0) + 1
  }
  console.log(`\n【BURST統計（${burstFailures.length}件）】`)
  console.log(`  平均暴発ターン: ${avgBurstTurn.toFixed(1)}`)
  console.log(`  ターン別分布:`)
  for (const [turn, count] of Object.entries(burstTurnDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`    T${turn}: ${count}件`)
  }
}

// 各カテゴリのサンプル出力（各3つ）
console.log('\n' + '▣'.repeat(30))
console.log('カテゴリ別サンプル')
console.log('▣'.repeat(30))

for (const [cat] of sorted) {
  const samples = failures.filter(f => f.failCategory === cat).slice(0, 3)
  console.log(`\n=== ${cat} (${categoryCount[cat]}件) ===`)
  for (let si = 0; si < samples.length; si++) {
    const f = samples[si]
    console.log(`\n--- サンプル ${si + 1} ---`)

    // ターンごとの詳細を再実行
    const grid2 = createEmptyGrid()
    const field2 = createGameField(grid2)
    for (let turn = 0; turn < f.pairs.length; turn++) {
      const pair = f.pairs[turn]
      const mc = COLOR_CHAR[pair.main.color], sc = COLOR_CHAR[pair.sub.color]
      const nextPair = turn + 1 < f.pairs.length ? f.pairs[turn + 1] : undefined
      const advice = PlacementAdvisor.getAdvice(field2, pair, nextPair)
      if (!advice.bestPlacement) break
      const best = advice.bestPlacement
      const landing = best.landing
      grid2[landing.mainPos.y][landing.mainPos.x] = pair.main.color
      grid2[landing.subPos.y][landing.subPos.x] = pair.sub.color
      const cleared = checkAndClear(grid2)
      const rotL = ['↑','→','↓','←'][best.placement.rotation]
      const target = landing.mainPos.x <= 2 || landing.subPos.x <= 2 ? 'FOLD' : 'TAIL'
      console.log(
        `  T${(turn+1).toString().padStart(2)}(${mc}${sc}) → col${best.placement.column}${rotL} ` +
        `main(${landing.mainPos.x},${landing.mainPos.y}) sub(${landing.subPos.x},${landing.subPos.y}) ` +
        `sc=${best.totalScore.toFixed(0).padStart(4)} [${target}]` +
        (cleared ? ' ⚠暴発' : '')
      )
    }
    printGrid(grid2, `最終状態`)
    console.log(`  P1=${f.p1Correct}/2 P2=${f.p2Correct}/3 P3=${f.p3Correct}/2 wrong=${f.wrongColors} fold=${f.foldPuyoCount} tail=${f.tailPuyoCount}`)
  }
}

console.log('\n\nシミュレーション完了')
