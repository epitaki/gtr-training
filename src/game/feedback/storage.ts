import { GTR_REPORT_VERSION, GTR_REPORT_STORAGE_KEY, MAX_STORED_GTR_REPORTS } from './constants'
import type { GTRIssueSnapshot, GTRIssueFeedback, StoredGTRIssueReport } from './types'
import { cloneJson } from './snapshot'
import { isRecord, isIntegerBetween, assertValidGTRIssueSnapshot } from './validation'

export const createStoredGTRIssueReport = (
  snapshot: GTRIssueSnapshot,
  feedback: GTRIssueFeedback,
): StoredGTRIssueReport => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  savedAt: new Date().toISOString(),
  snapshot: cloneJson(snapshot),
  feedback: { ...feedback },
})

export const getBrowserGTRReportStorage = (
  host: { readonly localStorage: Storage } | undefined = typeof window === 'undefined' ? undefined : window,
): Storage | null => {
  try {
    return host?.localStorage ?? null
  } catch {
    return null
  }
}

export const loadStoredGTRIssueReports = (storage: Storage | null | undefined): StoredGTRIssueReport[] => {
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(GTR_REPORT_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is StoredGTRIssueReport => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.savedAt !== 'string' ||
        !isRecord(item.snapshot) || item.snapshot.kind !== 'gtr-issue-snapshot' ||
        item.snapshot.version !== GTR_REPORT_VERSION || !isRecord(item.feedback) ||
        typeof item.feedback.comment !== 'string' ||
        !(item.feedback.expectedColumn === null || isIntegerBetween(item.feedback.expectedColumn, 0, 5)) ||
        !(item.feedback.expectedRotation === null || isIntegerBetween(item.feedback.expectedRotation, 0, 3))) {
        return false
      }
      try {
        assertValidGTRIssueSnapshot(item.snapshot)
        return true
      } catch {
        return false
      }
    }).slice(0, MAX_STORED_GTR_REPORTS)
  } catch {
    return []
  }
}

export const saveStoredGTRIssueReport = (storage: Storage, report: StoredGTRIssueReport): void => {
  const reports = loadStoredGTRIssueReports(storage)
  storage.setItem(
    GTR_REPORT_STORAGE_KEY,
    JSON.stringify([report, ...reports.filter(item => item.id !== report.id)].slice(0, MAX_STORED_GTR_REPORTS)),
  )
}

export const clearStoredGTRIssueReports = (storage: Storage): void => {
  storage.removeItem(GTR_REPORT_STORAGE_KEY)
}
