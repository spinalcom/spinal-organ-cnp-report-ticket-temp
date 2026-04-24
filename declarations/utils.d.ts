export declare function parseAttrValue(attrValue: string): {
    floor: string;
    zoneLetter: string;
} | null;
export declare function getColorFromValue(value: number): string;
export declare const PROCESS_NAME_TO_TOKEN: Record<string, string>;
export declare const MLT_PROCESSES: string[];
export declare const MLS_PROCESSES: string[];
export declare const STEP_NAME_TO_STATUS: Record<string, string>;
export declare const STATUS_ORDER: readonly ["attenteLect", "attenteReal", "realisationPartielle", "refusee", "cloturee"];
export type TicketCountMap = Record<string, Record<string, number>>;
export declare const ROOM_NAME_TO_TOKEN: Record<string, string>;
