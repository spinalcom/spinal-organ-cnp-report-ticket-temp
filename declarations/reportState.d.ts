export type ReportKey = 'tempMorning' | 'tempEvening' | 'ticket';
export declare function getStateFilePath(): string;
export declare function getLastRun(key: ReportKey): number | undefined;
export declare function setLastRun(key: ReportKey, timestamp: number): void;
export declare function getMostRecentMissed(cronExpr: string, lastRunTs: number, now?: Date): Date | null;
