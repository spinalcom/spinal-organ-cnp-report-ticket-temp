/*
 * Persistent report state + missed-run detection.
 *
 * The organ runs long-lived cron jobs. If the process crashes during (or
 * before) a scheduled report, the report is lost. To recover, we persist the
 * timestamp of the last successfully completed occurrence of each report type
 * to a small JSON file. On startup we compare that timestamp against the cron
 * schedule and, if the most recent scheduled occurrence was missed, regenerate
 * it using the ORIGINAL scheduled date (see index.ts catchUpMissedReports).
 */

import { CronTime } from 'cron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';

export type ReportKey = 'tempMorning' | 'tempEvening' | 'ticket';

type ReportState = Partial<Record<ReportKey, number>>;

// Location of the state file. Configurable via STATE_FILE (relative paths are
// resolved from the working directory); defaults to ./report-state.json.
const STATE_FILE = path.resolve(process.cwd(), process.env.STATE_FILE || 'report-state.json');

export function getStateFilePath(): string {
  return STATE_FILE;
}

function loadState(): ReportState {
  try {
    if (!existsSync(STATE_FILE)) return {};
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`[state] Could not read state file "${STATE_FILE}": ${(err as Error).message}. Treating as empty.`);
    return {};
  }
}

function saveState(state: ReportState): void {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[state] Failed to write state file "${STATE_FILE}": ${(err as Error).message}`);
  }
}

/** Timestamp (ms) of the last successful run for a report type, or undefined if never recorded. */
export function getLastRun(key: ReportKey): number | undefined {
  return loadState()[key];
}

/** Record the timestamp (ms) of a successful run. Read-modify-write so keys stay independent. */
export function setLastRun(key: ReportKey, timestamp: number): void {
  const state = loadState();
  state[key] = timestamp;
  saveState(state);
}

/**
 * Return the most recent scheduled occurrence of `cronExpr` in the window
 * (lastRunTs, now], or null if nothing was missed. Steps forward from the last
 * successful run using the cron schedule and keeps the last occurrence that is
 * still in the past — i.e. the latest report that should have run but didn't.
 */
export function getMostRecentMissed(cronExpr: string, lastRunTs: number, now: Date = new Date()): Date | null {
  const cronTime = new CronTime(cronExpr);
  const nowTs = now.getTime();
  let cursor = new Date(lastRunTs);
  let last: Date | null = null;
  // Guard against a pathologically old state file / misbehaving cron parser.
  for (let guard = 0; guard < 100000; guard++) {
    const next = cronTime.getNextDateFrom(cursor).toJSDate();
    if (next.getTime() <= cursor.getTime()) break; // not advancing — bail out
    if (next.getTime() > nowTs) break;             // reached the future — done
    last = next;
    cursor = next;
  }
  return last;
}
