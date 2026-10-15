import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { loadUIFont } from '../../src/ui/loadFont'
import ScoreAttackResults from '../../src/components/game/ScoreAttackResults'
import { PuyoColor } from '../../src/game/core/types'
import { evaluateScoreAttack } from '../../src/game/scoreAttack/evaluate'
import type { ScoreAttackSnapshot, ScoreAttackState } from '../../src/game/scoreAttack/types'
import { encodePlacedPair, replayPlacements } from '../../src/game/scoreAttack/placementHistory'

if (!import.meta.env.DEV) throw new Error('開発用検証ページです')
const colors: Record<string, PuyoColor> = { R: PuyoColor.RED, G: PuyoColor.GREEN, B: PuyoColor.BLUE, Y: PuyoColor.YELLOW }
const examples = [['.....R', 'RGYBBR', 'RRGYYB', 'GGYRRB'], ['.....R', 'RGYRRB', 'RRGYYY', 'GGRBBB'], ['.....R', 'RGYBRR', 'RRGYBB', 'GGYYBR']]
const showSteps = new URLSearchParams(location.search).get('steps') === '1'
const rounds = Array.from({ length: 10 }, (_, index) => {
  const grid = [...Array.from({ length: 9 }, () => Array<PuyoColor | null>(6).fill(null)),
    ...examples[index % 3].map(row => [...row].map(cell => colors[cell] ?? null))]
  let snapshot: ScoreAttackSnapshot = { grid, currentPair: null }
  if (showSteps && index === 9) {
    const moves = encodePlacedPair({ main: { color: PuyoColor.RED, x: 2, y: 12 }, sub: { color: PuyoColor.GREEN, x: 2, y: 11 }, rotation: 0, falling: true })
    snapshot = { grid: replayPlacements(moves), currentPair: null, moves }
  }
  return { snapshot, evaluation: evaluateScoreAttack(snapshot), error: null }
})
const state: ScoreAttackState = { rounds, finished: true, totalScore: rounds.reduce((sum, round) => sum + round.evaluation.analysis.score.totalScore, 0) }
const root = createRoot(document.getElementById('root')!)
const show = () => root.render(<ScoreAttackResults state={state} onRestart={show} onRetry={() => {}} onExit={() => root.render(<p>表示検証を終了しました。</p>)} />)
void loadUIFont().then(show)
