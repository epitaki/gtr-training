import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Stable report keys, with paths owned in one place. Resolve from this module,
// not the caller's working directory. Historical reports retain their hashes.
export const ADVISOR_SOURCE_PATHS = {
  ContinuousAdvisor: 'advisor/ContinuousAdvisor.ts',
  ConnectedExtension: 'advisor/ConnectedExtension.ts',
  HeadScaffold: 'advisor/HeadScaffold.ts',
  GuidedTail: 'advisor/GuidedTail.ts',
  SpareAllocation: 'advisor/SpareAllocation.ts',
  FoldConstruction: 'advisor/FoldConstruction.ts',
  FoundationContext: 'advisor/FoundationContext.ts',
  PerfectFoundationPlanner: 'advisor/PerfectFoundationPlanner.ts',
  FiveChainPlanner: 'advisor/FiveChainPlanner.ts',
  FrontierFlexibility: 'advisor/FrontierFlexibility.ts',
  FiveChainSkeletons: 'advisor/FiveChainSkeletons.ts',
  LowFiveChainSkeletons: 'advisor/LowFiveChainSkeletons.ts',
  LowerChainInsertion: 'advisor/LowerChainInsertion.ts',
  PlacementAdvisor: 'advisor/PlacementAdvisor.ts',
  MainFireAnalysis: 'advisor/MainFireAnalysis.ts',
  FirePreference: 'advisor/FirePreference.ts',
  VisibleMainFireSearch: 'advisor/VisibleMainFireSearch.ts',
  ConstructionUse: 'advisor/ConstructionUse.ts',
  HeadExtension: 'gtr/HeadExtension.ts',
  AdvisorTypes: 'advisor/types.ts',
  PlacementEffort: 'advisor/PlacementEffort.ts',
  BoardSurface: 'advisor/BoardSurface.ts',
  FoundationPreference: 'advisor/FoundationPreference.ts',
  PairPlacementUse: 'advisor/PairPlacementUse.ts',
  CompletionWait: 'advisor/CompletionWait.ts',
  SkeletonRecovery: 'advisor/SkeletonRecovery.ts',
  TailCascadeRecovery: 'advisor/TailCascadeRecovery.ts',
  ChainSimulator: 'core/ChainSimulator.ts',
  PlacementAdvisorConfig: 'advisor/PlacementAdvisorConfig.ts',
  GTRPatterns: 'gtr/GTRPatterns.ts',
  EvaluationRange: 'gtr/EvaluationRange.ts',
  GTRScoringConfig: 'gtr/GTRScoringConfig.ts',
  LeftoverEvaluation: 'gtr/LeftoverEvaluation.ts',
  TailPlanner: 'advisor/TailPlanner.ts',
  TailPreference: 'advisor/TailPreference.ts',
  types: 'core/types.ts',
} as const

export const captureAdvisorSourceHashes = (): Record<string, string> => Object.fromEntries(
  Object.entries(ADVISOR_SOURCE_PATHS).map(([name, file]) => [name,
    createHash('sha256').update(readFileSync(new URL(`../../src/game/${file}`, import.meta.url))).digest('hex'),
  ]),
)
