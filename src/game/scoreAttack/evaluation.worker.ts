import { evaluateScoreAttack } from './evaluate'
import type { EvaluationRequest, EvaluationResponse } from './types'

self.addEventListener('message', (event: MessageEvent<EvaluationRequest>) => {
  const { id, snapshot } = event.data
  let response: EvaluationResponse
  try { response = { id, evaluation: evaluateScoreAttack(snapshot) } }
  catch { response = { id, error: '採点できませんでした。もう一度お試しください。' } }
  self.postMessage(response)
})
