// Public feedback API. Implementations are split by responsibility below.
export type * from './types'
export {
  GTR_REPORT_VERSION, GTR_REPORT_REQUEST_EVENT, GTR_REPORT_READY_EVENT, GTR_REPORT_UNAVAILABLE_EVENT,
  GTR_CHAIN_RESOLUTION_ENDED_EVENT,
  GTR_REPORT_CLOSE_EVENT, GTR_REPORT_SCENE_READY_EVENT, GTR_REPLAY_RESUME_EVENT,
  GTR_REPLAY_HASH_PARAM, GTR_REPORT_STORAGE_KEY, MAX_STORED_GTR_REPORTS,
} from './constants'
export { cloneReportPair, cloneTurnRecords, createGTRIssueSnapshot, toGTRReplayState } from './snapshot'
export {
  encodeGTRReplayState, decodeGTRReplayState, tryDecodeGTRReplayState,
  readGTRReplayResultFromHash, readGTRReplayFromHash, readGTRReplayResultFromLocation,
  readGTRReplayFromLocation, createSafeGTRPageUrl, createGTRReplayUrl,
  tryCreateGTRReplayUrl, clearGTRReplayHash,
} from './replay'
export { assertValidGTRReplayState, assertValidGTRIssueSnapshot } from './validation'
export { getRotationLabel, formatGTRIssueMarkdown } from './format'
export {
  createStoredGTRIssueReport, getBrowserGTRReportStorage, loadStoredGTRIssueReports,
  saveStoredGTRIssueReport, clearStoredGTRIssueReports,
} from './storage'
