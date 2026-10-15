// Physical main-chain provenance checks, independent of scoring and rendering.
import type { PuyoColor, Position, PuyoPair } from '../core/types'
import { inspectHeadExtension } from '../gtr/HeadExtension'
import { resolveChains, type ChainResolution, type ClearedPuyo, type TurnOutcome } from '../core/ChainSimulator'

export interface MainFireBaseline {
  trigger: Position
  triggerColor: PuyoColor
  resolution: ChainResolution
}

export interface CandidateFireAnalysis {
  isIntendedMainFire: boolean
  hasCollateralClear: boolean
  baseline: MainFireBaseline | null
}

export function createMainFireBaseline(
  gridBefore: (PuyoColor | null)[][],
): MainFireBaseline | null {
  const head = inspectHeadExtension(gridBefore)
  if (head) return { trigger: head.trigger, triggerColor: head.color, resolution: head.resolution }
  const trigger = { x: 0, y: gridBefore.length - 4 }
  const triggerColor = gridBefore[trigger.y + 1]?.[trigger.x]
  if (
    triggerColor === null ||
    triggerColor === undefined ||
    gridBefore[trigger.y]?.[trigger.x] !== null
  ) return null

  const baselineGrid = gridBefore.map(row => [...row])
  baselineGrid[trigger.y][trigger.x] = triggerColor
  return {
    trigger,
    triggerColor,
    resolution: resolveChains(baselineGrid),
  }
}

export function analyzeCandidateFire(
  pair: PuyoPair,
  outcome: TurnOutcome,
  baseline: MainFireBaseline | null,
): CandidateFireAnalysis {
  const noMainFire: CandidateFireAnalysis = {
    isIntendedMainFire: false,
    hasCollateralClear: false,
    baseline,
  }
  if (!outcome.valid || !outcome.landing || !baseline) return noMainFire

  const { trigger, triggerColor, resolution } = baseline

  const placedAtTrigger = (
    outcome.landing.mainPos.x === trigger.x &&
    outcome.landing.mainPos.y === trigger.y &&
    pair.main.color === triggerColor
  ) || (
    outcome.landing.subPos.x === trigger.x &&
    outcome.landing.subPos.y === trigger.y &&
    pair.sub.color === triggerColor
  )
  if (!placedAtTrigger || outcome.chainCount < resolution.chainCount) return noMainFire

  const signature = (puyo: { origin: Position | null; color: PuyoColor }) =>
    puyo.origin ? `${puyo.origin.x},${puyo.origin.y},${puyo.color}` : null
  let hasCollateralClear = false

  for (let index = 0; index < resolution.clearSteps.length; index++) {
    const expected = new Set(
      resolution.clearSteps[index].clearedPuyos
        .map(signature)
        .filter((value): value is string => value !== null),
    )
    const actual = new Set(
      (outcome.clearSteps[index]?.clearedPuyos ?? [])
        .map(signature)
        .filter((value): value is string => value !== null),
    )
    if ([...expected].some(value => !actual.has(value))) return noMainFire
    if (hasIndependentExtraClear(
      outcome.clearSteps[index]?.clearedPuyos ?? [], expected, signature,
    )) hasCollateralClear = true
  }
  if (outcome.clearSteps.length > resolution.clearSteps.length) hasCollateralClear = true

  return { isIntendedMainFire: true, hasCollateralClear, baseline }
}

/**
 * An extra puyo is a harmless extension when it clears in the same connected
 * component as a baseline puyo of that step. Only a separate component is a
 * collateral clear.
 */
function hasIndependentExtraClear(
  puyos: ClearedPuyo[],
  expected: Set<string>,
  signature: (puyo: ClearedPuyo) => string | null,
): boolean {
  const positionKey = (puyo: ClearedPuyo) => `${puyo.position.x},${puyo.position.y}`
  const byPosition = new Map(puyos.map(puyo => [positionKey(puyo), puyo]))
  const visited = new Set<string>()

  for (const start of puyos) {
    const startKey = positionKey(start)
    if (visited.has(startKey)) continue

    const stack = [start]
    let containsBaselinePuyo = false
    let containsExtraPuyo = false

    while (stack.length > 0) {
      const current = stack.pop()!
      const currentKey = positionKey(current)
      if (visited.has(currentKey)) continue
      visited.add(currentKey)

      const currentSignature = signature(current)
      if (currentSignature !== null && expected.has(currentSignature)) {
        containsBaselinePuyo = true
      } else {
        containsExtraPuyo = true
      }

      const { x, y } = current.position
      for (const neighborKey of [
        `${x - 1},${y}`,
        `${x + 1},${y}`,
        `${x},${y - 1}`,
        `${x},${y + 1}`,
      ]) {
        const neighbor = byPosition.get(neighborKey)
        if (neighbor?.color === current.color && !visited.has(neighborKey)) {
          stack.push(neighbor)
        }
      }
    }

    if (containsExtraPuyo && !containsBaselinePuyo) return true
  }

  return false
}
