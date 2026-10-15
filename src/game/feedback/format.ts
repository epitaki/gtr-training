import { PuyoColor, type PuyoPair } from '../core/types'
import type { GTRIssueSnapshot, GTRIssueFeedback } from './types'
import { createGTRReplayUrl } from './replay'
import { describePairOrientation } from './placementDescription'
import { simulateTurn } from '../core/ChainSimulator'

const ROTATION_LABELS = ['上', '右', '下', '左'] as const
const COLOR_SYMBOLS: Record<PuyoColor, string> = {
  [PuyoColor.RED]: 'R',
  [PuyoColor.GREEN]: 'G',
  [PuyoColor.BLUE]: 'B',
  [PuyoColor.YELLOW]: 'Y',
}

export const getRotationLabel = (rotation: number): string => ROTATION_LABELS[rotation] ?? `不明(${rotation})`

const formatPair = (pair: PuyoPair | null): string => pair
  ? `main=${pair.main.color}, sub=${pair.sub.color}, 向き=${getRotationLabel(pair.rotation)}`
  : 'なし'

const escapeTableCell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')

export const formatGTRIssueMarkdown = (
  snapshot: GTRIssueSnapshot,
  feedback: GTRIssueFeedback,
  replayUrl = createGTRReplayUrl(snapshot),
): string => {
  const best = snapshot.advice?.bestPlacement
  const expectedColumn = feedback.expectedColumn === null
    ? '列未指定'
    : `${feedback.expectedColumn + 1}列`
  const expectedRotation = feedback.expectedRotation === null
    ? '向き未指定'
    : `${getRotationLabel(feedback.expectedRotation)}向き${snapshot.currentPair ? `（${describePairOrientation(snapshot.currentPair, feedback.expectedRotation)}）` : ''}`
  const expected = feedback.expectedColumn === null && feedback.expectedRotation === null
    ? '未指定'
    : `${expectedColumn}・${expectedRotation}`
  const board = snapshot.field.grid
    .map(row => row.map(cell => cell ? COLOR_SYMBOLS[cell] : '.').join(' '))
    .join('\n')
  const candidates = snapshot.advice?.candidates.slice(0, 5) ?? []
  const candidateRows = candidates.length > 0
    ? candidates.map((candidate, index) => {
      let remaining: number | '-' = '-'
      // Diagnose this saved candidate, not a new recommendation. Future
      // hypothetical fires must not be shown as actual zero-leftover results.
      if (snapshot.currentPair && candidate.isIntendedMainFire && candidate.immediateChainCount > 0) {
        const outcome = simulateTurn(snapshot.field.grid, snapshot.currentPair, candidate.placement)
        if (outcome.valid && outcome.chainCount === candidate.immediateChainCount && outcome.clearedPuyos === candidate.clearedPuyos) {
          remaining = outcome.stableGrid.flat().filter(color => color !== null).length
        }
      }
      return `| ${index + 1} | ${candidate.placement.column + 1} | ${getRotationLabel(candidate.placement.rotation)} | ${candidate.totalScore.toFixed(1)} | ${candidate.tailShape ?? '-'} | ${candidate.immediateChainCount} | ${remaining} |`
    }).join('\n')
    : '| - | - | - | - | - | - | - |'
  const turnRows = snapshot.recentTurns.length > 0
    ? snapshot.recentTurns.slice(-10).map(turn => (
      `- ${turn.turn}手目: ${formatPair(turn.pair)} → ${turn.placement.column + 1}列・${getRotationLabel(turn.placement.rotation)}向き、${turn.chainCount}連鎖/${turn.clearedPuyos}個消去`
    )).join('\n')
    : '- まだ着手履歴はありません'

  return `# GTR手順フィードバック

## おかしいと感じた点

${feedback.comment.trim() || '（コメント未入力）'}

- 期待する配置: ${expected}
- 発生日時: ${snapshot.capturedAt}
- アプリ版: ${snapshot.appVersion}
- 手数: ${snapshot.turnNumber}手目
- フェーズ: ${snapshot.advice?.phase ?? '不明'} / ${snapshot.advice?.phaseMessage ?? '推薦なし'}
- 現在の推薦: ${best ? `${best.placement.column + 1}列・${getRotationLabel(best.placement.rotation)}向き（score=${best.totalScore.toFixed(1)}）` : 'なし'}

## ツモ

- CURRENT: ${formatPair(snapshot.currentPair)}
- NEXT: ${formatPair(snapshot.nextPair)}
- NEXT 2: ${formatPair(snapshot.nextNextPair)}

## 盤面（上から13行、左から6列）

\`\`\`text
${board}
\`\`\`

## GTR評価

- 採点版: ${snapshot.gtrEvaluation.scoringVersion ?? '旧結果（未記録）'}
- 最小土台完成: ${snapshot.gtrEvaluation.minimalFoundationComplete ?? '旧結果（未記録）'}
- 基本形: ${snapshot.gtrEvaluation.hasBasicPattern}
- GTR判定: ${snapshot.gtrEvaluation.isGTR}
- 連鎖数: ${snapshot.gtrEvaluation.chainCount}
- 品質: ${snapshot.gtrEvaluation.quality}
- 右上の土台段差: ${snapshot.gtrEvaluation.rightEdgeRaised ?? '未記録'}
- 連鎖尾: ${snapshot.gtrEvaluation.chainTailType ?? '未確定'}
- 連鎖尾候補: ${snapshot.tailPlans.map(plan => `${plan.shape}:${plan.color} ${plan.matchedCells}/${plan.totalCells}`).join(', ') || 'なし'}

## 上位推薦候補

| 順位 | 列 | 向き | スコア | 連鎖尾 | 即時連鎖 | 本線発火後残数 |
|---:|---:|---|---:|---|---:|---:|
${candidateRows}

本線発火後残数は、この手で本線を発火する候補のみ表示します。先読みの完成待ちは「-」です。

## 直前の手順

${turnRows}

## 再現URL

${replayUrl}

## 診断ID

randomState=${snapshot.pairRandomState}, capturedAt=${snapshot.capturedAt}, page=${escapeTableCell(snapshot.page)}
`
}
