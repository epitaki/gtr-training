import { PuyoColor, type Position, type PuyoPair } from './types'
import type { ChainTrace, PuyoIdGrid, ChainSnapshot, GravityMove, ChainStage } from './ChainTrace'

export type PuyoGrid = (PuyoColor | null)[][]
export type OriginGrid = (Position | null)[][]

export interface Placement {
  column: number
  rotation: number
}

export interface LandingResult {
  mainPos: Position
  subPos: Position
  valid: boolean
}

export interface ClearedPuyo {
  position: Position
  origin: Position | null
  color: PuyoColor
}

export interface ClearStep {
  chainIndex: number
  clearedPositions: Position[]
  clearedPuyos: ClearedPuyo[]
}

export interface GravityResult {
  grid: PuyoGrid
  moved: boolean
}

export interface ClearResult {
  grid: PuyoGrid
  cleared: boolean
  count: number
  clearedPositions: Position[]
}

export interface ChainResolution {
  stableGrid: PuyoGrid
  chainCount: number
  clearedPuyos: number
  allClear: boolean
  clearSteps: ClearStep[]
}

export interface ResolveChainsOptions {
  origins?: OriginGrid
}

export interface TurnOutcome extends ChainResolution {
  valid: boolean
  landing: LandingResult | null
  placedGrid: PuyoGrid
}

export const cloneGrid = (grid: PuyoGrid): PuyoGrid => grid.map(row => [...row])

// Both cells of the vertical spawning pair must be free before the next turn.
export const isSpawnBlocked = (grid: PuyoGrid): boolean =>
  grid[0]?.[2] != null || grid[1]?.[2] != null

export const findLowestEmpty = (grid: PuyoGrid, column: number): number => {
  if (column < 0 || column >= (grid[0]?.length ?? 0)) return -1
  for (let y = grid.length - 1; y >= 0; y--) {
    if (grid[y]?.[column] === null) return y
  }
  return -1
}

// 盤面上端から落下して到達できる行。穴のある列でも既存ぷよを飛び越えない。
const findDropRow = (grid: PuyoGrid, column: number): number => {
  if (column < 0 || column >= (grid[0]?.length ?? 0)) return -1
  for (let y = 0; y < grid.length; y++) {
    if (grid[y]?.[column] !== null && grid[y]?.[column] !== undefined) return y - 1
  }
  return grid.length - 1
}

export const findConnectedGroup = (
  grid: PuyoGrid,
  startX: number,
  startY: number,
  expectedColor?: PuyoColor,
  excluded: ReadonlySet<string> = new Set(),
): Position[] => {
  const color = expectedColor ?? grid[startY]?.[startX]
  if (color === null || color === undefined) return []

  const width = grid[0]?.length ?? 0
  const visited = new Set<string>()
  const group: Position[] = []
  const stack: Position[] = [{ x: startX, y: startY }]

  while (stack.length > 0) {
    const { x, y } = stack.pop()!
    const key = `${x},${y}`
    if (visited.has(key) || excluded.has(key)) continue
    visited.add(key)
    if (x < 0 || x >= width || y < 0 || y >= grid.length) continue
    if (grid[y]?.[x] !== color) continue

    group.push({ x, y })
    stack.push(
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    )
  }

  return group
}

export const findClearPositions = (grid: PuyoGrid): Position[] => {
  const width = grid[0]?.length ?? 0
  // The search evaluates many rectangular boards. Share one numeric visited
  // array across their components instead of allocating string Sets per group.
  // Preserve the original DFS neighbour order, including the clear trace order.
  if (grid.every(row => row.length === width)) {
    const visited = new Uint8Array(width * grid.length)
    const positions: Position[] = []
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < width; x++) {
      const color = grid[y][x]
      const start = y * width + x
      if (color == null || visited[start]) continue
      const stack = [start]
      const group: Position[] = []
      while (stack.length) {
        const index = stack.pop()!
        if (visited[index]) continue
        const px = index % width, py = Math.floor(index / width)
        if (grid[py][px] !== color) continue
        visited[index] = 1
        group.push({ x: px, y: py })
        if (px > 0) stack.push(index - 1)
        if (px + 1 < width) stack.push(index + 1)
        if (py > 0) stack.push(index - width)
        if (py + 1 < grid.length) stack.push(index + width)
      }
      if (group.length >= 4) positions.push(...group)
    }
    return positions
  }
  // Keep the established behavior for nonrectangular diagnostic inputs.
  const visited = new Set<string>()
  const positions: Position[] = []

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      const color = grid[y][x]
      const key = `${x},${y}`
      if (color === null || visited.has(key)) continue

      const group = findConnectedGroup(grid, x, y, color)
      for (const position of group) visited.add(`${position.x},${position.y}`)
      if (group.length >= 4) positions.push(...group)
    }
  }

  return positions
}

const createOriginGrid = (grid: PuyoGrid): OriginGrid => grid.map((row, y) =>
  row.map((color, x) => color === null ? null : { x, y }),
)

const cloneOriginGrid = (origins: OriginGrid): OriginGrid => origins.map(row =>
  row.map(origin => origin ? { ...origin } : null),
)

const applyGravityInPlace = (grid: PuyoGrid, origins?: OriginGrid, ids?: PuyoIdGrid, moves?: GravityMove[]): boolean => {
  const width = grid[0]?.length ?? 0
  let moved = false

  for (let x = 0; x < width; x++) {
    let destinationY = grid.length - 1
    for (let y = grid.length - 1; y >= 0; y--) {
      const color = grid[y]?.[x]
      if (color === null || color === undefined) continue

      if (destinationY !== y) moved = true
      if (ids) {
        const id = ids[y]?.[x] ?? null
        if (destinationY !== y && id !== null) moves?.push({ id, from: { x, y }, to: { x, y: destinationY } })
        ids[destinationY][x] = id
      }
      grid[destinationY][x] = color
      if (origins) origins[destinationY][x] = origins[y]?.[x] ?? null
      destinationY--
    }

    for (let y = destinationY; y >= 0; y--) {
      grid[y][x] = null
      if (origins) origins[y][x] = null
      if (ids) ids[y][x] = null
    }
  }

  return moved
}

export const applyGravity = (grid: PuyoGrid): GravityResult => {
  const settled = cloneGrid(grid)
  return { grid: settled, moved: applyGravityInPlace(settled) }
}

export const clearConnectedPuyos = (grid: PuyoGrid): ClearResult => {
  const clearedPositions = findClearPositions(grid)
  const result = cloneGrid(grid)
  for (const { x, y } of clearedPositions) result[y][x] = null
  return {
    grid: result,
    cleared: clearedPositions.length > 0,
    count: clearedPositions.length,
    clearedPositions,
  }
}

const resolveChainsInternal = (
  grid: PuyoGrid, options: ResolveChainsOptions, traceId?: string,
): { result: ChainResolution; trace?: ChainTrace } => {
  const simulation = cloneGrid(grid)
  const origins = options.origins
    ? cloneOriginGrid(options.origins)
    : createOriginGrid(simulation)
  const clearSteps: ClearStep[] = []
  let clearedPuyos = 0
  const ids: PuyoIdGrid | undefined = traceId === undefined ? undefined : simulation.map((row, y) =>
    row.map((color, x) => color === null ? null : `${traceId}:${y}:${x}`),
  )
  const snapshot: (() => ChainSnapshot) | undefined = ids
    ? () => ({ grid: cloneGrid(simulation), ids: ids.map(row => [...row]) })
    : undefined
  const initial = snapshot?.()
  const stages: ChainStage[] | undefined = ids ? [] : undefined
  const gravity = () => {
    const moves: GravityMove[] | undefined = ids ? [] : undefined
    applyGravityInPlace(simulation, origins, ids, moves)
    if (moves?.length) stages!.push({ kind: 'gravity', moves, after: snapshot!() })
  }

  gravity()

  while (true) {
    const clearedPositions = findClearPositions(simulation)
    if (clearedPositions.length === 0) break

    const cleared: ClearedPuyo[] = clearedPositions.map(position => ({
      position: { ...position },
      origin: origins[position.y]?.[position.x]
        ? { ...origins[position.y][position.x]! }
        : null,
      color: simulation[position.y][position.x]!,
    }))
    clearSteps.push({
      chainIndex: clearSteps.length + 1,
      clearedPositions: clearedPositions.map(position => ({ ...position })),
      clearedPuyos: cleared,
    })
    clearedPuyos += clearedPositions.length

    const traceCleared = ids ? clearedPositions.map(({ x, y }) => ({
      id: ids[y][x]!, position: { x, y }, color: simulation[y][x]!,
    })) : undefined
    for (const { x, y } of clearedPositions) {
      simulation[y][x] = null
      origins[y][x] = null
      if (ids) ids[y][x] = null
    }
    if (traceCleared) stages!.push({ kind: 'clear', chainIndex: clearSteps.length, cleared: traceCleared, after: snapshot!() })
    gravity()
  }

  const result: ChainResolution = {
    stableGrid: simulation,
    chainCount: clearSteps.length,
    clearedPuyos,
    allClear: simulation.every(row => row.every(color => color === null)),
    clearSteps,
  }
  return { result, trace: initial && stages ? { initial, stages, result } : undefined }
}

export const resolveChains = (grid: PuyoGrid, options: ResolveChainsOptions = {}): ChainResolution =>
  resolveChainsInternal(grid, options).result

export const resolveChainsWithTrace = (
  grid: PuyoGrid, options: ResolveChainsOptions = {}, traceId = 'chain',
): ChainTrace => resolveChainsInternal(grid, options, traceId).trace!

export const simulateLanding = (
  grid: PuyoGrid,
  _pair: PuyoPair,
  placement: Placement,
): LandingResult => {
  if (
    !Number.isInteger(placement.column) ||
    !Number.isInteger(placement.rotation) ||
    placement.rotation < 0 ||
    placement.rotation > 3
  ) {
    return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
  }

  const width = grid[0]?.length ?? 0
  const mainX = placement.column
  let subX = mainX

  switch (placement.rotation) {
    case 1: subX = mainX + 1; break
    case 3: subX = mainX - 1; break
  }

  if (mainX < 0 || mainX >= width || subX < 0 || subX >= width) {
    return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
  }

  if (placement.rotation === 0 || placement.rotation === 2) {
    const dropRow = findDropRow(grid, mainX)
    if (dropRow < 1) {
      return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
    }
    return placement.rotation === 0
      ? {
          mainPos: { x: mainX, y: dropRow },
          subPos: { x: subX, y: dropRow - 1 },
          valid: true,
        }
      : {
          mainPos: { x: mainX, y: dropRow - 1 },
          subPos: { x: subX, y: dropRow },
          valid: true,
        }
  }

  const mainY = findDropRow(grid, mainX)
  const subY = findDropRow(grid, subX)
  if (mainY < 0 || subY < 0) {
    return { mainPos: { x: 0, y: 0 }, subPos: { x: 0, y: 0 }, valid: false }
  }
  return {
    mainPos: { x: mainX, y: mainY },
    subPos: { x: subX, y: subY },
    valid: true,
  }
}

export const canApplyPairPlacement = (grid: PuyoGrid, landing: LandingResult): boolean => {
  if (!landing.valid) return false
  const { mainPos, subPos } = landing
  return Number.isInteger(mainPos.x) && Number.isInteger(mainPos.y) &&
    Number.isInteger(subPos.x) && Number.isInteger(subPos.y) &&
    mainPos.x >= 0 && mainPos.x < (grid[0]?.length ?? 0) &&
    subPos.x >= 0 && subPos.x < (grid[0]?.length ?? 0) &&
    mainPos.y >= 0 && mainPos.y < grid.length &&
    subPos.y >= 0 && subPos.y < grid.length &&
    (mainPos.x !== subPos.x || mainPos.y !== subPos.y) &&
    grid[mainPos.y]?.[mainPos.x] === null &&
    grid[subPos.y]?.[subPos.x] === null
}

export const applyPairPlacement = (
  grid: PuyoGrid,
  pair: PuyoPair,
  landing: LandingResult,
): PuyoGrid => {
  const placed = cloneGrid(grid)
  if (!canApplyPairPlacement(grid, landing)) return placed
  placed[landing.mainPos.y][landing.mainPos.x] = pair.main.color
  placed[landing.subPos.y][landing.subPos.x] = pair.sub.color
  return placed
}

export const simulateTurn = (
  grid: PuyoGrid,
  pair: PuyoPair,
  placement: Placement,
): TurnOutcome => {
  const landing = simulateLanding(grid, pair, placement)
  if (!landing.valid) {
    const stableGrid = cloneGrid(grid)
    return {
      valid: false,
      landing: null,
      placedGrid: stableGrid,
      stableGrid,
      chainCount: 0,
      clearedPuyos: 0,
      allClear: stableGrid.every(row => row.every(color => color === null)),
      clearSteps: [],
    }
  }

  if (!canApplyPairPlacement(grid, landing)) {
    const stableGrid = cloneGrid(grid)
    return {
      valid: false,
      landing: null,
      placedGrid: stableGrid,
      stableGrid,
      chainCount: 0,
      clearedPuyos: 0,
      allClear: stableGrid.every(row => row.every(color => color === null)),
      clearSteps: [],
    }
  }

  const placedGrid = applyPairPlacement(grid, pair, landing)
  const resolution = resolveChains(placedGrid)
  return {
    valid: true,
    landing,
    placedGrid,
    ...resolution,
  }
}
