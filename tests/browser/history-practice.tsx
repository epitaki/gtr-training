import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { loadUIFont } from '../../src/ui/loadFont'
import ScoreAttackResults from '../../src/components/game/ScoreAttackResults'
import GuidedGame from '../../src/components/game/GuidedGame'
import { PuyoColor as C } from '../../src/game/core/types'
import type { PairColors } from '../../src/game/core/PairSequence'
import { encodePlacedPair, replayPlacements } from '../../src/game/scoreAttack/placementHistory'
import { evaluateScoreAttack } from '../../src/game/scoreAttack/evaluate'

if (!import.meta.env.DEV) throw new Error('開発用検証ページです')
const pairs: readonly PairColors[] = [[C.RED, C.BLUE], [C.GREEN, C.YELLOW], [C.BLUE, C.YELLOW], [C.RED, C.GREEN]]
const moves = pairs.map(([main, sub], i) => encodePlacedPair({ main: { color: main, x: [0, 1, 4, 5][i], y: 12 },
  sub: { color: sub, x: [0, 1, 4, 5][i], y: 11 }, rotation: 0, falling: true })).join('')
const snapshot = { moves, grid: replayPlacements(moves), currentPair: null }
const evaluation = evaluateScoreAttack(snapshot)
const state = { rounds: Array.from({ length: 10 }, () => ({ snapshot, evaluation, error: null })),
  finished: true, totalScore: evaluation.analysis.score.totalScore * 10 }
function Fixture() {
  const [sequence, setSequence] = useState<readonly PairColors[]>()
  return sequence ? <GuidedGame practiceSequence={sequence} onExit={() => setSequence(undefined)} suspended={false} />
    : <ScoreAttackResults state={state} onExit={() => {}} onRetry={() => {}} onPractice={setSequence} />
}
void loadUIFont().then(() => createRoot(document.getElementById('root')!).render(<Fixture />))
