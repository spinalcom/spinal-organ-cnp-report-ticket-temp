export declare function parseAttrValue(attrValue: string): {
    floor: string;
    zoneLetter: string;
} | null;
export declare function getWeekDays(fridayDate: Date): Date[];
export declare function getColorFromValue(value: number): string;
export declare const PROCESS_NAME_TO_CELL_KEY: Record<string, string>;
export declare const STEP_NAME_TO_STATUS: Record<string, string>;
export type TicketCountMap = Record<string, Record<string, number>>;
