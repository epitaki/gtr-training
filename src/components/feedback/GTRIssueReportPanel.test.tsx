// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PlacementAdvisor } from '../../game/advisor/PlacementAdvisor'
import { PuyoColor, type PuyoPair } from '../../game/core/types'
import { GTRDetector } from '../../game/gtr/GTRPatterns'
import { createGTRIssueSnapshot, createGTRReplayUrl, formatGTRIssueMarkdown } from '../../game/feedback/GTRIssueReport'
import GTRIssueReportPanel from './GTRIssueReportPanel'

vi.mock('../../game/feedback/GTRIssueReport', async importOriginal => {
  const actual = await importOriginal<typeof import('../../game/feedback/GTRIssueReport')>()
  return { ...actual, createGTRReplayUrl: vi.fn(actual.createGTRReplayUrl),
    formatGTRIssueMarkdown: vi.fn(actual.formatGTRIssueMarkdown) }
})

const pair: PuyoPair = { main: { color: PuyoColor.BLUE, x: 2, y: 1 },
  sub: { color: PuyoColor.YELLOW, x: 2, y: 0 }, rotation: 0, falling: true }
const grid = Array.from({ length: 13 }, () => Array<PuyoColor | null>(6).fill(null))
const snapshot = createGTRIssueSnapshot({
  page: 'http://localhost:5175/', turnNumber: 1,
  gameState: { field: { width: 6, height: 13, grid }, currentPair: pair,
    nextPair: pair, nextNextPair: pair, score: 0, gtrCount: 0, gtrScore: 0, gameOver: false },
  openingPairs: { pair1: pair, pair2: pair }, pairRandomState: 12345,
  trainingPlan: PlacementAdvisor.createTrainingPlan(pair, pair),
  settings: { gravityEnabled: false, advisorEnabled: true, paused: false, showingResult: false },
  gtrEvaluation: GTRDetector.detectGTR(grid), tailPlans: [], advice: null, recentTurns: [],
})
const showPanel = () => render(<GTRIssueReportPanel snapshot={snapshot} onClose={() => {}}
  onRefresh={() => {}} captureScreenshot={async () => new Blob()} />)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('keeps a working Codex report with current feedback in cloud-connected development', async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('MODE', 'cloud')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  showPanel()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'この配置を確認してください' } })
  fireEvent.click(screen.getByRole('button', { name: 'Codex向けレポートをコピー' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Codex向けレポートをコピーしました。'))
  expect(writeText).toHaveBeenCalledOnce()
  expect(writeText.mock.calls[0][0]).toContain('この配置を確認してください')
  expect(writeText.mock.calls[0][0]).toContain('#gtr-replay=')
})

it('hides the Codex report in production while keeping normal replay sharing usable', async () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('MODE', 'production')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  showPanel()
  expect(screen.queryByRole('button', { name: 'Codex向けレポートをコピー' })).toBeNull()
  expect(formatGTRIssueMarkdown).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '再現URLをコピー' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('同じ盤面を開ける再現URLをコピーしました。'))
  expect(writeText.mock.calls[0][0]).toContain('#gtr-replay=')
  expect(screen.getByRole('button', { name: 'スクリーンショットをコピー' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '診断JSONを保存' })).toBeTruthy()
})

it.each([true, false])('offers only available fallback options when URL creation fails (development: %s)', dev => {
  vi.stubEnv('DEV', dev)
  vi.mocked(createGTRReplayUrl).mockImplementationOnce(() => { throw new Error('再現URLが長すぎます') })
  showPanel()
  expect(screen.getByRole('alert').textContent).toBe(dev
    ? '再現URLが長すぎます。Codex向けレポートまたは診断JSONを共有してください。'
    : '再現URLが長すぎます。診断JSONを共有してください。')
  expect((screen.getByRole('button', { name: '再現URLをコピー' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('button', { name: '診断JSONを保存' })).toBeTruthy()
})
