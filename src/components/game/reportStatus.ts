export type ReportStatusEvent = 'request' | 'ready' | 'chain-resolving' | 'chain-ended'

export const reportStatusForEvent = (event: ReportStatusEvent): string =>
  event === 'chain-resolving' ? '連鎖アニメーション中です。終了後に共有できます。' : ''
