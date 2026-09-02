import { GTRDetector } from '../src/game/GTRPatterns'
import { PlacementAdvisor, type GTRTrainingPlan } from '../src/game/PlacementAdvisor'
import { PuyoPairManager } from '../src/game/PuyoPair'
import { PuyoColor, type GameField, type PuyoPair } from '../src/game/types'

const games = Number(process.env.SIM_GAMES ?? 200)
const maxTurns = Number(process.env.SIM_TURNS ?? 15)

const createGrid = () => Array.from(
  { length: 13 },
  () => Array<PuyoColor | null>(6).fill(null),
)

const findGroup = (
  grid: (PuyoColor | null)[][],
  startX: number,
  startY: number,
  color: PuyoColor,
): Set<string> => {
  const group = new Set<string>()
  const stack = [{ x: startX, y: startY }]
  while (stack.length > 0) {
    const { x, y } = stack.pop()!
    const key = `${x},${y}`
    if (group.has(key) || x < 0 || x >= 6 || y < 0 || y >= 13) continue
    if (grid[y][x] !== color) continue
    group.add(key)
    stack.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 })
  }
  return group
}

const resolveBoard = (grid: (PuyoColor | null)[][]): void => {
  while (true) {
    const visited = new Set<string>()
    const clear = new Set<string>()
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 6; x++) {
        const color = grid[y][x]
        const key = `${x},${y}`
        if (color === null || visited.has(key)) continue
        const group = findGroup(grid, x, y, color)
        for (const cell of group) visited.add(cell)
        if (group.size >= 4) for (const cell of group) clear.add(cell)
      }
    }
    if (clear.size === 0) return

    for (const key of clear) {
      const [x, y] = key.split(',').map(Number)
      grid[y][x] = null
    }
    for (let x = 0; x < 6; x++) {
      const colors: PuyoColor[] = []
      for (let y = 12; y >= 0; y--) if (grid[y][x] !== null) colors.push(grid[y][x]!)
      for (let y = 12; y >= 0; y--) grid[y][x] = colors[12 - y] ?? null
    }
  }
}

const createGuidedPair = (
  grid: (PuyoColor | null)[][],
  trainingPlan: GTRTrainingPlan,
): PuyoPair => {
  const pair = PuyoPairManager.createRandomPair()
  const colors = PlacementAdvisor.getGuidedPairColors(
    grid,
    pair.main.color,
    pair.sub.color,
    trainingPlan,
  )
  pair.main.color = colors.mainColor
  pair.sub.color = colors.subColor
  return pair
}

let foldCompleted = 0
let yJointCompleted = 0
let threeChainCompleted = 0
let guidedTargetCompleted = 0
let totalCompletionTurns = 0
let firstFailure: { trace: string[]; grid: (PuyoColor | null)[][] } | null = null

for (let game = 0; game < games; game++) {
  const grid = createGrid()
  const field: GameField = { grid, width: 6, height: 13 }
  const opening = PuyoPairManager.createValidTwoHandCombination()
  const trainingPlan = PlacementAdvisor.createTrainingPlan(opening.pair1, opening.pair2)
  const queue: PuyoPair[] = [opening.pair1, opening.pair2, PuyoPairManager.createRandomPair()]
  let sawFold = false
  let sawYJoint = false
  let sawThreeChain = false
  let completed = false
  const trace: string[] = []

  for (let turn = 1; turn <= maxTurns; turn++) {
    const current = queue.shift()!
    const advice = PlacementAdvisor.getAdvice(
      field, current, queue[0], queue[1], trainingPlan,
    )
    if (!advice.bestPlacement) break

    const { landing } = advice.bestPlacement
    grid[landing.mainPos.y][landing.mainPos.x] = current.main.color
    grid[landing.subPos.y][landing.subPos.x] = current.sub.color
    resolveBoard(grid)
    const generated = createGuidedPair(grid, trainingPlan)
    queue.push(generated)

    const result = GTRDetector.detectGTR(grid)
    const yPlan = PlacementAdvisor.getYJointPlan(grid, trainingPlan)
    trace.push(
      `${turn}: ${current.main.color[0]}${current.sub.color[0]} -> ` +
      `c${advice.bestPlacement.placement.column + 1}/r${advice.bestPlacement.placement.rotation} ` +
      `fold=${result.hasBasicPattern ? 'yes' : 'no'} chain=${result.chainCount} ` +
      `Y=${yPlan ? `${yPlan.colorC[0]}/${yPlan.colorD[0]} missing=${yPlan.missingColors.length}` : 'blocked'}`,
    )
    sawFold ||= result.hasBasicPattern
    sawYJoint ||= yPlan?.missingColors.length === 0
    sawThreeChain ||= result.isGTR
    if (PlacementAdvisor.isGuidedTargetComplete(grid, trainingPlan)) {
      guidedTargetCompleted++
      totalCompletionTurns += turn
      completed = true
      break
    }
  }

  if (sawFold) foldCompleted++
  if (sawYJoint) yJointCompleted++
  if (sawThreeChain) threeChainCompleted++
  if (!completed && firstFailure === null) {
    firstFailure = { trace, grid: grid.map(row => [...row]) }
  }
}

const percent = (value: number) => `${(value / games * 100).toFixed(1)}%`
console.log(`Guided GTR benchmark: ${games} games, ${maxTurns} turns`)
console.log(`fold completed:    ${foldCompleted}/${games} (${percent(foldCompleted)})`)
console.log(`Y joint completed: ${yJointCompleted}/${games} (${percent(yJointCompleted)})`)
console.log(`3-chain completed: ${threeChainCompleted}/${games} (${percent(threeChainCompleted)})`)
console.log(`guided target:     ${guidedTargetCompleted}/${games} (${percent(guidedTargetCompleted)})`)
if (guidedTargetCompleted > 0) {
  console.log(`average turns:     ${(totalCompletionTurns / guidedTargetCompleted).toFixed(1)}`)
}
if (process.env.SIM_DEBUG === '1' && firstFailure) {
  console.log('\nFirst failure trace:')
  console.log(firstFailure.trace.join('\n'))
  console.log('Final lower field:')
  for (let y = 8; y < 13; y++) {
    console.log(firstFailure.grid[y].map(color => color?.[0] ?? '.').join(' '))
  }
}
