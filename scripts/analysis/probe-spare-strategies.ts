// Isolated experiments against a frozen engine. Never imported by the game.
// The frozen input is not modified; every report records its hash and strategy.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolveChains, type PuyoGrid } from '../../src/game/core/ChainSimulator'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PuyoColor } from '../../src/game/core/types'
import { FIVE_CHAIN_SKELETONS } from '../../src/game/advisor/FiveChainSkeletons'
import type { BenchmarkGameResult } from '../../src/benchmark/AdvisorBenchmark'

export function lowSkeletonAlternatives(allProfiles = false): string[][] {
  // Abstract symbols identify successive links, not five playable colors.
  // The engine must still verify each real four-color assignment separately.
  const tails = [
    [[2, 0], [3, 1], [4, 1], [2, 2]],
    [[2, 2], [3, 1], [4, 1], [5, 1]],
    [[2, 0], [3, 0], [3, 1], [2, 2]],
  ]
  const alternatives: string[][] = []
  const profiles: number[][] = []
  for (let h2 = 3; h2 <= 4; h2++) for (let h3 = 2; h3 <= 4; h3++)
    for (let h4 = 1; h4 <= 4; h4++) for (let h5 = 1; h5 <= 4; h5++) {
      const heights = [3, 3, h2, h3, h4, h5]
      if (heights.reduce((a, b) => a + b) === 19 && (allProfiles || heights.every(h => h >= 3))) profiles.push(heights)
    }
  if (!allProfiles) profiles.reverse() // Preserve the original high-column 2..5 enumeration order.
  for (const cells of tails) for (const heights of profiles) {
    if (cells.some(([x, row]) => row >= heights[x])) continue
    const grid: PuyoGrid = Array.from({ length: 13 }, () => Array(6).fill(null))
    const put = (x: number, row: number, symbol: string) => { grid[12 - row][x] = symbol as PuyoColor }
    const fold: [number, number, string][] = [[0, 0, 'B'], [0, 1, 'A'], [0, 2, 'A'],
      [1, 0, 'B'], [1, 1, 'A'], [1, 2, 'B'], [2, 1, 'B']]
    fold.forEach(([x, row, color]) => put(x, row, color))
    cells.forEach(([x, row]) => put(x, row, 'C'))
    const free: [number, number][] = []
    heights.forEach((height, x) => {
      for (let row = 0; row < height; row++) if (!grid[12 - row][x]) free.push([x, row])
    })
    if (free.length !== 8) throw new Error('Invalid skeleton enumeration')
    for (let mask = 0; mask < 256; mask++) {
      if ([...mask.toString(2)].filter(c => c === '1').length !== 4) continue
      free.forEach(([x, row], index) => put(x, row, mask & (1 << index) ? 'D' : 'E'))
      if (resolveChains(grid).chainCount) continue
      const fired = grid.map(row => [...row]); fired[9][0] = 'A' as PuyoColor
      const result = resolveChains(fired)
      if (!result.allClear || result.chainCount !== 5) continue
      if (result.clearSteps.map(step => [...new Set(step.clearedPuyos.map(p => p.color))].join('')).join('') !== 'ABCDE') continue
      alternatives.push(grid.slice(9).map(row => row.map(c => c ?? '.').join('')))
    }
  }
  return alternatives.filter(rows => !FIVE_CHAIN_SKELETONS.some(existing => existing.join('/') === rows.join('/')))
}

if (import.meta.main) {
  const [strategy, frozen, baselinePath, output, first = '0', last = '100'] = process.argv.slice(2)
  if (!strategy || !frozen || !baselinePath || !output) throw new Error('strategy frozen-engine baseline-report output [start end]')
  const source = readFileSync(frozen, 'utf8')
  const experimentSourceHash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex')
  const visibleSourceHash = createHash('sha256').update(readFileSync(new URL('../../src/game/advisor/VisibleMainFireSearch.ts', import.meta.url))).digest('hex')
  let code = source
  const replace = (from: string, to: string) => {
    if (code.split(from).length !== 2) throw new Error(`Expected unique experiment anchor: ${from}`)
    code = code.replace(from, to)
  }
  if (strategy === 'low-openings') {
    replace('plan.openingSafe || !opening', 'true')
  } else if (strategy === 'fourth-row-insertion') {
    replace('x >= 2 && row < 3 && row >= plan.tailHeights[x]', 'x >= 2 && row < 4 && row >= plan.tailHeights[x]')
    replace('at.y < h - 3 ||', 'at.y < h - 4 ||')
  } else if (strategy === 'future-recovery') {
    replace('return a.depth - b.depth || Number(a.collateral)', 'return Number(a.depth > 0) - Number(b.depth > 0) || Number(a.collateral)')
    replace('aRisk ? a.surfaceCost - b.surfaceCost || a.leftovers - b.leftovers : a.leftovers - b.leftovers || a.surfaceCost - b.surfaceCost',
      'aRisk ? a.surfaceCost - b.surfaceCost || (a.leftovers + 2 * a.depth) - (b.leftovers + 2 * b.depth) || a.depth - b.depth : (a.leftovers + 2 * a.depth) - (b.leftovers + 2 * b.depth) || a.depth - b.depth || a.surfaceCost - b.surfaceCost')
    replace('const construction = continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)',
      'const immediate = continuations.filter(c => c.fired);\n        const construction = immediate.length ? immediate : continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)')
    replace('const bound = Math.min(2, ...[...planned?.values() ?? []].flatMap((p) => p.firePreference ? [p.firePreference.depth] : []));',
      'const bound = [...planned?.values() ?? []].some(p => p.firePreference?.depth === 0) ? 0 : 2;')
    replace('const head = inspectHeadExtension(state.grid);', `const head = inspectHeadExtension(state.grid);
      const canFireNow = ready && baseline && [pair.main.color, pair.sub.color].includes(baseline.triggerColor) &&
        Array.from({length:24}, (_,i) => simulateTurn(state.grid,pair,{column:i%6,rotation:Math.floor(i/6)}))
        .some(o => o.valid && o.chainCount && !isSpawnBlocked(o.stableGrid) && classify(state.grid,pair,o));`)
    replace('if (depth === visible.length - 1)\n            continue;', 'if (canFireNow || depth === visible.length - 1)\n            continue;')
    replace('if (found.size)\n      break;', 'if (found.size && depth === 0)\n      break;')
  } else if (strategy === 'horizon-ready') {
    replace('if (depth === visible.length - 1 && (!onReady || readySeen))', 'if (depth === visible.length - 1 && !onReady)')
    replace('if (onReady && !readySeen)', 'if (onReady)')
    replace('onReady?.(state.grid, state.root, state.surface, depth - 1);', '')
  } else if (strategy === 'all-visible-ready') {
    replace('if (depth === visible.length - 1 && (!onReady || readySeen))', 'if (depth === visible.length - 1 && !onReady)')
    replace('if (onReady && !readySeen)', 'if (onReady)')
  } else if (strategy === 'third-ready-open') {
    replace('if (depth === visible.length - 1 && (!onReady || readySeen))', 'if (depth === visible.length - 1 && !onReady)')
    replace('if (onReady && !readySeen)', 'if (onReady)')
    replace('5000 - depth * 250 - surface * 2 - leftovers * 16', '5000 - depth * 250 - surface * 2 - leftovers * 100')
  } else if (strategy === 'third-ready') {
    replace('allowTransientHead = false', 'allowTransientHead = true')
    replace('const visible = pairs.slice(0, Math.min(3, maxDepth + 1));', 'const visible = pairs.slice(0, Math.min(3, maxDepth + 1)); let readySeen = false;')
    replace('onReady?.(state.grid, state.root, state.surface, depth - 1);', '{ readySeen = true; onReady?.(state.grid, state.root, state.surface, depth - 1); }')
    replace('if (depth === visible.length - 1) {', 'if (depth === visible.length - 1 && (!onReady || readySeen)) {')
    replace('if (depth === visible.length - 1)\n            continue;', `if (depth === visible.length - 1) {
      if (onReady && !readySeen) {
        const b = createMainFireBaseline(outcome.stableGrid); const h = inspectHeadExtension(outcome.stableGrid);
        if ((b?.resolution.chainCount ?? 0) >= 5 && (!h || h.missing === 1)) onReady(outcome.stableGrid, root, state.root ? state.surface : futureFireSurfaceCost(outcome.stableGrid), depth);
      }
      continue;
    }`)
  } else if (strategy === 'wide-beam') {
    replace('var BEAM_WIDTH = 32;', 'var BEAM_WIDTH = 64;')
  } else if (strategy === 'pending-visible-head') {
    replace('grid[9][1] !== c ||', '(grid[9][1] !== null && grid[9][1] !== c) ||')
    replace('const additions = grid[8][1] === null ? [{ x: 1, y: 8 }, trigger] : [trigger];',
      'const additions = [{ x: 1, y: 9 }, { x: 1, y: 8 }, trigger].filter(p => grid[p.y][p.x] === null);')
    replace('const construction = continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)',
      'const construction = !initial.tailComplete && continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)')
  } else if (strategy === 'visible-transient-head') {
    replace('allowTransientHead = false', 'allowTransientHead = true')
  } else if (strategy === 'current-recovery') {
    replace('matched * 100 - spare * 8', 'matched * 100 - spare * 8 + (preferTailRecovery && !head ? countRecoveredSkeletonExtras(getCurrentBaseline()?.resolution.clearSteps ?? [], plan.columns.map(c => c.length)) * 32 : 0)')
  } else if (strategy === 'balanced-supply') {
    replace('value * value * 2', 'value * value * 12')
  } else if (strategy === 'conditional-recovery-visible') {
    replace('matched * 100 - spare * 8', 'matched * 100 - spare * 8 + (preferTailRecovery && !head ? Math.min(4, Math.max(0, spare - extraEvaluation.unrecovered)) * 32 : 0)')
  } else if (strategy === 'visible-after-fold') {
    replace('bound > 0 && this.isAdaptiveTailComplete(grid, trainingPlan)', 'bound > 0 && this.getFoldPlan(grid, trainingPlan)?.missingColors.length === 0 && grid.flat().filter(Boolean).length >= 16')
  } else if (strategy === 'broad-visible') {
    const old = code.match(/var LOW_FIVE_CHAIN_SKELETONS = \[[\s\S]*?\n\];/)?.[0]
    if (!old) throw new Error('Missing low skeleton catalogue')
    replace(old, `var LOW_FIVE_CHAIN_SKELETONS = ${JSON.stringify(lowSkeletonAlternatives(true))};`)
  } else if (strategy === 'ready-recovery') {
    replace('5000 - depth * 250 - surface * 2 - leftovers * 16', '5000 - depth * 250 - surface * 2 - leftovers * 100')
  } else if (strategy === 'spare-cost') {
    replace('matched * 100 - spare * 8', 'matched * 100 - spare * 32')
  } else if (strategy === 'fire-without-wells') {
    replace('a.surfaceCost - b.surfaceCost || a.leftovers - b.leftovers;',
      '(Number(a.surfaceCost >= 45) - Number(b.surfaceCost >= 45)) || (a.surfaceCost >= 45 ? (a.surfaceCost - b.surfaceCost || a.leftovers - b.leftovers) : (a.leftovers - b.leftovers || a.surfaceCost - b.surfaceCost));')
  } else if (['fold-use', 'low-fold-use', 'broad-fold-use', 'low-fold-safe', 'broad-fold-safe', 'low-fold-safe-recovery', 'broad-fold-safe-recovery'].includes(strategy)) {
    if (strategy.includes('fold-safe')) {
      replace('// src/game/advisor/LowerChainInsertion.ts',
        `const ORIGINAL_SKELETONS = new Set(FIVE_CHAIN_SKELETONS); FIVE_CHAIN_SKELETONS.push(...${JSON.stringify(lowSkeletonAlternatives(strategy.startsWith('broad')))});\n// src/game/advisor/LowerChainInsertion.ts`)
      replace('templates.push({', 'templates.push({ original: ORIGINAL_SKELETONS.has(rows),')
      replace('const initial = fit(grid, getTemplates(fold.colorA, fold.colorB));',
        'const initial = fit(grid, getTemplates(fold.colorA, fold.colorB).filter(plan => plan.original || grid.flat().filter(Boolean).length > 2));')
      replace('const candidates = [];\n    const fires = new Map;', 'const candidates = [];\n    const badClears = new Set; let safeConstruction = false;\n    const fires = new Map;')
      replace('candidates.push({\n          placement: { column: col, rotation },', `if (!outcome.chainCount && !isSpawnBlocked(outcome.stableGrid) && (!trainingPlan || this.getFoldPlan(outcome.stableGrid, trainingPlan))) safeConstruction = true;
        if (outcome.chainCount && (!fireAnalysis.isIntendedMainFire || (fireAnalysis.baseline?.resolution.chainCount ?? 0) < 5)) badClears.add(col + ':' + rotation);
        candidates.push({
          placement: { column: col, rotation },`)
      replace('candidates.sort((a, b) => {', `candidates.sort((a, b) => {
      if (safeConstruction) { const d = Number(badClears.has(a.placement.column + ':' + a.placement.rotation)) - Number(badClears.has(b.placement.column + ':' + b.placement.rotation)); if (d) return d; }`)
    } else if (strategy !== 'fold-use') replace('var FIVE_CHAIN_SKELETONS = [', `var FIVE_CHAIN_SKELETONS = [${lowSkeletonAlternatives(strategy === 'broad-fold-use').map(rows => JSON.stringify(rows)).join(',')},`)
    replace('preferConstruction?.(node.grid, outcome)', 'preferConstruction?.(node.grid, outcome, matched.plans.some(plan => inspectPairPlacementUse(outcome.stableGrid, outcome.landing, plan, matched.hasHead).unassigned === 0))')
    replace('}, (before, outcome) => {', '}, (before, outcome, bothUseful) => {')
    replace('progress > 0 && (occupied <= 2 || progress === 2)', `progress > 0 && (occupied <= 2 || progress === 2 || bothUseful${strategy.includes('fold-safe') ? ' || nextFold.missingColors.length === 0' : ''})`)
    if (strategy.endsWith('-recovery')) replace('matched * 100 - spare * 8 - missing.reduce',
      'matched * 100 - spare * 8 + (preferTailRecovery && !head ? Math.min(2, Math.max(0, spare - extraEvaluation.unrecovered)) * 40 : 0) - missing.reduce')
  } else if (strategy === 'visible-fire' || strategy === 'visible-ready' || strategy === 'visible-head') {
    code = `import {findVisibleMainFires} from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../../src/game/advisor/VisibleMainFireSearch.ts', import.meta.url))).href)};\n` + code
    replace('const fires = new Map;', `const fires = new Map;
    const bound = Math.min(2, ...[...(planned?.values() ?? [])].flatMap(p => p.firePreference ? [p.firePreference.depth] : []));
    const readyMoves = new Map;
    const visibleFires = trainingPlan && bound > 0 && this.isAdaptiveTailComplete(grid, trainingPlan) ? findVisibleMainFires(grid,
      [currentPair, ...(nextPair ? [nextPair] : []), ...(nextPair && nextNextPair ? [nextNextPair] : [])],
      (before, pair, outcome) => {
        const baseline = this.analyzePhase(before).mainFireBaseline;
        if (!baseline || baseline.resolution.chainCount < 5 || !this.isAdaptiveTailComplete(before, trainingPlan)) return null;
        const f = analyzeCandidateFire(pair, outcome, baseline);
        return f.isIntendedMainFire ? (f.hasCollateralClear ? 'collateral' : 'clean') : null;
      }, bound, ${strategy !== 'visible-fire' ? `(board, root, surface, depth) => {
        if (!this.isAdaptiveTailComplete(board, trainingPlan)) return;
        const baseline = this.analyzePhase(board).mainFireBaseline;
        const leftovers = baseline.resolution.stableGrid.flat().filter(Boolean).length;
        const score = 5000 - depth * 250 - surface * 2 - leftovers * 16;
        const key = root.column + ':' + root.rotation;
        if (score > (readyMoves.get(key) ?? -Infinity)) readyMoves.set(key, score);
      }` : 'undefined'}, ${strategy === 'visible-head'}) : new Map;`)
    replace('if (isSpawnBlocked(outcome.stableGrid))\n          totalScore +=', `const visibleFire = visibleFires.get(col + ':' + rotation);
        if (visibleFire && compareFirePreference(visibleFire, fires.get(col + ':' + rotation)) < 0) {
          fires.set(col + ':' + rotation, visibleFire);
          totalScore = FIVE_CHAIN_REWARDS.BASE + FIVE_CHAIN_REWARDS.FIRE - visibleFire.depth * FIVE_CHAIN_REWARDS.LATER_PAIR_PENALTY - (visibleFire.collateral ? FIVE_CHAIN_REWARDS.COLLATERAL_PENALTY : 0);
        }
        if (!fires.has(col + ':' + rotation) && readyMoves.has(col + ':' + rotation)) totalScore = FIVE_CHAIN_REWARDS.BASE + readyMoves.get(col + ':' + rotation);
        if (isSpawnBlocked(outcome.stableGrid))
          totalScore +=`)
  } else if (strategy === 'low-after-fold') {
    replace('// src/game/advisor/LowerChainInsertion.ts',
      `const ORIGINAL_SKELETONS = new Set(FIVE_CHAIN_SKELETONS); FIVE_CHAIN_SKELETONS.push(...${JSON.stringify(lowSkeletonAlternatives())});\n// src/game/advisor/LowerChainInsertion.ts`)
    replace('templates.push({', 'templates.push({ original: ORIGINAL_SKELETONS.has(rows),')
    replace('const initial = fit(grid, getTemplates(fold.colorA, fold.colorB));',
      'const initial = fit(grid, getTemplates(fold.colorA, fold.colorB).filter(plan => plan.original || (grid[10][0] !== null && grid[10][1] !== null && grid[11][2] !== null)));')
  } else if (strategy === 'low-skeletons' || strategy === 'low-recovery') {
    replace('var FIVE_CHAIN_SKELETONS = [', `var FIVE_CHAIN_SKELETONS = [${lowSkeletonAlternatives().map(rows => JSON.stringify(rows)).join(',')},`)
    if (strategy === 'low-recovery') replace('matched * 100 - spare * 8 - missing.reduce',
      'matched * 100 - spare * 8 + (preferTailRecovery && !head ? Math.min(2, Math.max(0, spare - extraEvaluation.unrecovered)) * 40 : 0) - missing.reduce')
  } else if (strategy === 'conditional-insertion') {
    replace('if (lowerParticipants.has(`${x},${12 - row}`))',
      'if (lowerParticipants.has(`${x},${12 - row}`) || (getCurrentBaseline()?.resolution.chainCount ?? 0) >= 3)')
  } else if (strategy === 'supply-wait') {
    // Compare the target's missing bottom-up queues in expected random draws,
    // not just their cell count. This is not a prediction of the real queue.
    replace('score -= completionWaitCost(plan.columns.map((column, x) => column.slice(columns[x].length)));',
      'score -= Math.max(0, inspectCompletionWait(plan.columns.map((column, x) => column.slice(columns[x].length))).orderedDraws - missing.reduce((a,b)=>a+b,0)) * 40;')
  } else if (strategy === 'conditional-recovery') {
    replace('matched * 100 - spare * 8 - missing.reduce',
      'matched * 100 - (preferTailRecovery && !head ? extraEvaluation.unrecovered : spare) * 8 - missing.reduce')
  } else if (strategy === 'pending-head') {
    replace('grid[9][1] !== c ||', '(grid[9][1] !== null && grid[9][1] !== c) ||')
    replace('const additions = grid[8][1] === null ? [{ x: 1, y: 8 }, trigger] : [trigger];',
      'const additions = [{ x: 1, y: 9 }, { x: 1, y: 8 }, trigger].filter(p => grid[p.y][p.x] === null);')
    replace('const construction = continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)',
      'const construction = !initial.tailComplete && continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)')
  } else if (strategy === 'head-after-tail') {
    replace('const construction = continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)',
      'const construction = !initial.tailComplete && continuations.some((candidate) => !candidate.startsHead && candidate.advancesSkeleton)')
  } else throw new Error('Unknown strategy')
  const start = Number(first), end = Number(last)
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).modes[0].games as BenchmarkGameResult[]
  if (![start, end].every(Number.isInteger) || start < 0 || end > baseline.length || end <= start) throw new Error('Invalid range')
  writeFileSync(output + '.engine.js', code, { flag: 'wx' })
  const engine = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as typeof import('../../src/benchmark/AdvisorBenchmark')
  const games: BenchmarkGameResult[] = []
  for (let i = start; i < end; i++) {
    const b = baseline[i]
    games.push(engine.runBenchmarkGame(b.mode, b.gameIndex, b.gameSeed, b.openingKind, b.maxTurns))
    if ((i - start + 1) % 25 === 0) console.log(`${strategy}: ${i - start + 1}/${end - start}`)
  }
  const succeeded = (g: BenchmarkGameResult) => g.actualFire && g.maxIntendedChain >= 5
  const summary = {
    strategy, start, end, experimentSourceHash, visibleSourceHash, codeHash: createHash('sha256').update(code).digest('hex'),
    baselineCodeHash: createHash('sha256').update(source).digest('hex'),
    baseline: engine.aggregateBenchmarkGames(baseline.slice(start, end)).metrics,
    current: engine.aggregateBenchmarkGames(games).metrics,
    losses: games.filter((g, i) => succeeded(baseline[start + i]) && !succeeded(g)).map(g => g.gameIndex),
    gains: games.filter((g, i) => !succeeded(baseline[start + i]) && succeeded(g)).map(g => g.gameIndex),
    delayed: games.filter((g, i) => g.fireTurn !== null && baseline[start + i].fireTurn !== null && g.fireTurn > baseline[start + i].fireTurn!)
      .map(g => ({ index: g.gameIndex, before: baseline.find(b => b.gameIndex === g.gameIndex)!.fireTurn, after: g.fireTurn })),
  }
  writeFileSync(output, JSON.stringify({ ...summary, games }, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(summary, null, 2))
}
