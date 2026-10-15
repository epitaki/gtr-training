import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PairOrientationPicker from './PairOrientationPicker'
import {
  clearStoredGTRIssueReports,
  createGTRReplayUrl,
  createStoredGTRIssueReport,
  formatGTRIssueMarkdown,
  getBrowserGTRReportStorage,
  getRotationLabel,
  loadStoredGTRIssueReports,
  saveStoredGTRIssueReport,
  tryCreateGTRReplayUrl,
  type GTRIssueFeedback,
  type GTRIssueSnapshot,
  type StoredGTRIssueReport,
} from '../../game/feedback/GTRIssueReport'

interface GTRIssueReportPanelProps {
  snapshot: GTRIssueSnapshot
  onClose: () => void
  onRefresh: () => void
  captureScreenshot: () => Promise<Blob>
}

type StatusTone = 'success' | 'error' | 'neutral'

interface PanelStatus {
  text: string
  tone: StatusTone
}

const downloadBlob = (blob: Blob, filename: string): void => {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back for browsers that expose the API but deny it in this context.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  let copied = false
  try {
    textarea.select()
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
  }
  if (!copied) throw new Error('クリップボードを利用できません')
}

const formatSavedAt = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP')
}

export default function GTRIssueReportPanel({
  snapshot,
  onClose,
  onRefresh,
  captureScreenshot,
}: GTRIssueReportPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [feedback, setFeedback] = useState<GTRIssueFeedback>({
    comment: '',
    expectedColumn: null,
    expectedRotation: null,
  })
  const [status, setStatus] = useState<PanelStatus>({
    text: '盤面とツモ、推薦結果を取得しました。',
    tone: 'neutral',
  })
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const storage = useMemo(() => getBrowserGTRReportStorage(), [])
  const [history, setHistory] = useState<StoredGTRIssueReport[]>(() => (
    loadStoredGTRIssueReports(storage)
  ))
  const historyWithReplayUrls = useMemo(() => history.map(report => ({
    report,
    replayUrl: tryCreateGTRReplayUrl(report.snapshot),
  })), [history])

  const replayResult = useMemo(() => {
    try {
      return { url: createGTRReplayUrl(snapshot), error: null }
    } catch (error) {
      return {
        url: null,
        error: error instanceof Error ? error.message : '再現URLを生成できません',
      }
    }
  }, [snapshot])
  const replayUrl = replayResult.url
  const showCodexReport = import.meta.env.DEV
  const markdown = useMemo(
    () => showCodexReport ? formatGTRIssueMarkdown(snapshot, feedback, replayUrl ?? '（再現URLを生成できません）') : '',
    [feedback, replayUrl, snapshot, showCodexReport],
  )
  const diagnosticPackage = useMemo(() => ({
    snapshot,
    feedback,
    replayUrl,
  }), [feedback, replayUrl, snapshot])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const appRoot = document.getElementById('root')
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null
    const previousInert = appRoot?.inert ?? false
    if (appRoot) {
      appRoot.inert = true
      appRoot.setAttribute('aria-hidden', 'true')
    }
    commentRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )]
        if (focusable.length === 0) {
          event.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      if (appRoot) {
        appRoot.inert = previousInert
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)
      }
      previouslyFocused?.focus()
    }
  }, [onClose])

  const runAction = async (action: () => Promise<void>, success: string) => {
    try {
      await action()
      setStatus({ text: success, tone: 'success' })
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : '操作に失敗しました',
        tone: 'error',
      })
    }
  }

  const copyScreenshot = async (): Promise<'copied' | 'downloaded'> => {
    const blob = await captureScreenshot()

    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        return 'copied'
      } catch {
        // Permission and image MIME support vary by browser; keep the report recoverable.
      }
    }

    downloadBlob(blob, `gtr-report-${Date.now()}.png`)
    return 'downloaded'
  }

  const handleScreenshot = async () => {
    if (isCapturingScreenshot) return
    setIsCapturingScreenshot(true)
    try {
      const result = await copyScreenshot()
      setStatus({
        text: result === 'copied'
          ? 'ゲーム画面を画像としてコピーしました。'
          : '画像コピーに未対応のためPNGで保存しました。',
        tone: 'success',
      })
    } catch (error) {
      setStatus({
        text: error instanceof Error ? error.message : 'スクリーンショットを取得できませんでした',
        tone: 'error',
      })
    } finally {
      setIsCapturingScreenshot(false)
    }
  }

  const saveReport = () => {
    try {
      if (!storage) throw new Error('storage unavailable')
      const report = createStoredGTRIssueReport(snapshot, feedback)
      saveStoredGTRIssueReport(storage, report)
      setHistory(loadStoredGTRIssueReports(storage))
      setStatus({ text: 'この報告をブラウザ内の履歴に保存しました。', tone: 'success' })
    } catch {
      setStatus({ text: 'ブラウザ内の履歴へ保存できませんでした。', tone: 'error' })
    }
  }

  const clearHistory = () => {
    try {
      if (!storage) throw new Error('storage unavailable')
      clearStoredGTRIssueReports(storage)
      setHistory([])
      setStatus({ text: '報告履歴を削除しました。', tone: 'neutral' })
    } catch {
      setStatus({ text: 'ブラウザ内の報告履歴を削除できませんでした。', tone: 'error' })
    }
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(diagnosticPackage, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    downloadBlob(blob, `gtr-report-${Date.now()}.json`)
    setStatus({ text: '診断JSONを保存しました。', tone: 'success' })
  }

  const downloadHistoryJson = (report: StoredGTRIssueReport, historyReplayUrl: string | null) => {
    const blob = new Blob([JSON.stringify({
      snapshot: report.snapshot,
      feedback: report.feedback,
      replayUrl: historyReplayUrl,
    }, null, 2)], { type: 'application/json;charset=utf-8' })
    const safeId = report.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
    downloadBlob(blob, `gtr-report-${safeId || Date.now()}.json`)
    setStatus({ text: '履歴の診断JSONを保存しました。', tone: 'success' })
  }

  return createPortal(
    <div
      ref={panelRef}
      className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-[#080711]/90 p-3  sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gtr-report-title"
    >
      <div className="w-full max-w-5xl rounded-none border border-[#6f648d] bg-[#19162a] text-[#f6f2ff] shadow-pixel">
        <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 rounded-none-2xl border-b border-[#6f648d] bg-[#19162a]/95 px-5 py-4 ">
          <div>
            <p className="text-xs font-normal tracking-[0.22em] text-[#b5a8ff]">GTR ISSUE REPORT</p>
            <h2 id="gtr-report-title" className="mt-1 text-xl font-normal">この手順のおかしい点を共有</h2>
            <p className="mt-1 text-sm text-[#c4bfd3]">{snapshot.turnNumber}手目の盤面・ツモ・推薦・乱数状態を固定して取得済みです。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-none border border-[#6f648d] px-3 py-2 text-sm text-[#c4bfd3] hover:bg-[#211d33]"
            aria-label="報告画面を閉じる"
          >
            閉じる Esc
          </button>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 space-y-5">
            <section className="space-y-3">
              <label htmlFor="gtr-report-comment" className="block text-sm font-normal text-[#b5a8ff]">
                どこがおかしいですか？
              </label>
              <textarea
                id="gtr-report-comment"
                ref={commentRef}
                autoFocus
                value={feedback.comment}
                onChange={event => setFeedback(current => ({ ...current, comment: event.target.value }))}
                rows={5}
                placeholder="例: Y字にするなら青が下ではなく、緑が下になる配置を優先してほしい"
                className="w-full resize-y rounded-none border border-[#6f648d] bg-[#0f0d1b] px-4 py-3 text-sm leading-6 text-white placeholder:text-[#c4bfd3]"
              />
            </section>

            <section className="grid gap-3">
              <label className="text-sm font-normal text-[#b5a8ff]">
                期待する列・軸ぷよの列（任意）
                <select
                  value={feedback.expectedColumn ?? ''}
                  onChange={event => setFeedback(current => ({
                    ...current,
                    expectedColumn: event.target.value === '' ? null : Number(event.target.value),
                  }))}
                  className="mt-2 w-full rounded-none border border-[#6f648d] bg-[#0f0d1b] px-3 py-3 text-white"
                >
                  <option value="">指定しない</option>
                  {Array.from({ length: 6 }, (_, column) => (
                    <option key={column} value={column}>{column + 1}列</option>
                  ))}
                </select>
              </label>
              <PairOrientationPicker pair={snapshot.currentPair} value={feedback.expectedRotation}
                onChange={rotation => setFeedback(current => ({ ...current, expectedRotation: rotation }))} />
            </section>

            <section>
              <h3 className="mb-3 text-sm font-normal text-[#b5a8ff]">共有する</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {showCodexReport && (
                  <button
                    type="button"
                    onClick={() => runAction(() => copyText(markdown), 'Codex向けレポートをコピーしました。')}
                    className="rounded-none bg-[#b5a8ff] px-4 py-3 text-sm font-normal text-[#0c0a14] hover:bg-[#b5a8ff]"
                  >
                    Codex向けレポートをコピー
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => replayUrl && runAction(() => copyText(replayUrl), '同じ盤面を開ける再現URLをコピーしました。')}
                  disabled={!replayUrl}
                  className="rounded-none border border-[#6f648d] bg-[#b5a8ff] px-4 py-3 text-sm font-normal hover:bg-[#b5a8ff] disabled:cursor-not-allowed disabled:opacity-40 text-[#0c0a14]"
                >
                  再現URLをコピー
                </button>
                <button
                  type="button"
                  onClick={handleScreenshot}
                  disabled={isCapturingScreenshot}
                  className="rounded-none border border-[#6f648d] px-4 py-3 text-sm font-normal hover:bg-[#211d33] disabled:cursor-wait disabled:opacity-40"
                >
                  {isCapturingScreenshot ? '画像を取得中…' : 'スクリーンショットをコピー'}
                </button>
                <button
                  type="button"
                  onClick={downloadJson}
                  className="rounded-none border border-[#6f648d] px-4 py-3 text-sm font-normal hover:bg-[#211d33]"
                >
                  診断JSONを保存
                </button>
              </div>
              {replayResult.error && (
                <p className="mt-3 rounded-none bg-rose-400/10 px-3 py-2 text-sm text-[#ff9aa5]" role="alert">
                  {replayResult.error}。{showCodexReport ? 'Codex向けレポートまたは診断JSONを共有してください。' : '診断JSONを共有してください。'}
                </p>
              )}
              <div
                className={`mt-3 rounded-none px-3 py-2 text-sm ${
                  status.tone === 'success'
                    ? 'bg-emerald-400/10 text-[#91ecc2]'
                    : status.tone === 'error'
                      ? 'bg-rose-400/10 text-[#ff9aa5]'
                      : 'bg-[#211d33] text-[#c4bfd3]'
                }`}
                role="status"
              >
                {status.text}
              </div>
            </section>

            <details className="rounded-none border border-[#6f648d] bg-[#0f0d1b]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-normal text-[#c4bfd3]">取得した診断データを確認</summary>
              <pre
                data-gtr-diagnostics
                className="max-h-80 overflow-auto border-t border-[#6f648d] p-4 text-xs leading-5 text-[#91ecc2]"
              >
                {JSON.stringify(diagnosticPackage, null, 2)}
              </pre>
            </details>
          </main>

          <aside className="space-y-5">
            <section className="rounded-none border border-[#6f648d] bg-[#0f0d1b] p-4">
              <h3 className="text-sm font-normal text-[#b5a8ff]">取得内容</h3>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-[#c4bfd3]">手数</dt><dd>{snapshot.turnNumber}手目</dd>
                <dt className="text-[#c4bfd3]">推薦</dt>
                <dd>
                  {snapshot.advice?.bestPlacement
                    ? `${snapshot.advice.bestPlacement.placement.column + 1}列・${getRotationLabel(snapshot.advice.bestPlacement.placement.rotation)}`
                    : 'なし'}
                </dd>
                <dt className="text-[#c4bfd3]">フェーズ</dt><dd>{snapshot.advice?.phase ?? '不明'}</dd>
                <dt className="text-[#c4bfd3]">履歴</dt><dd>直前{snapshot.recentTurns.length}手</dd>
                <dt className="text-[#c4bfd3]">将来ツモ</dt><dd>乱数状態を保存済み</dd>
              </dl>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-4 w-full rounded-none border border-[#6f648d] px-3 py-2 text-xs font-normal hover:bg-[#211d33]"
              >
                現在の状態を再取得
              </button>
            </section>

            <section className="rounded-none border border-[#6f648d] bg-[#0f0d1b] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-normal text-[#b5a8ff]">報告履歴</h3>
                {history.length > 0 && (
                  <button type="button" onClick={clearHistory} className="text-xs text-[#ff9aa5] hover:underline">
                    全削除
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={saveReport}
                disabled={!storage}
                className="mt-3 w-full rounded-none bg-emerald-400/15 px-3 py-2 text-sm font-normal text-[#91ecc2] hover:bg-emerald-400/25"
              >
                {storage ? 'この報告を履歴に保存' : '履歴保存は利用できません'}
              </button>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="py-3 text-center text-xs text-[#c4bfd3]">保存した報告はありません</p>
                ) : historyWithReplayUrls.map(({ report, replayUrl: historyReplayUrl }) => {
                  return (
                    <article key={report.id} className="rounded-none border border-[#6f648d] p-3 text-xs">
                      <p className="break-words text-[#c4bfd3]">{report.feedback.comment || 'コメントなし'}</p>
                      <p className="mt-1 text-[#c4bfd3]">{formatSavedAt(report.savedAt)}・{report.snapshot.turnNumber}手目</p>
                      {historyReplayUrl ? (
                        <a
                          href={historyReplayUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block font-normal text-[#b5a8ff] hover:underline"
                        >
                          この盤面を別タブで開く
                        </a>
                      ) : (
                        <p className="mt-2 text-[#ff9aa5]">再現URLが長すぎるため、診断JSONを利用してください</p>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadHistoryJson(report, historyReplayUrl)}
                        className="mt-2 block font-normal text-[#91ecc2] hover:underline"
                      >
                        この履歴の診断JSONを保存
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  )
}
