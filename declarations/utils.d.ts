import type { SpinalNode } from 'spinal-env-viewer-graph-service';
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
export interface TicketRef {
    node: SpinalNode;
    domaine: string;
    etape: string;
}
export declare const TICKET_ATTR: {
    readonly missionId: {
        readonly category: "GMAO";
        readonly name: "gmaoId";
    };
    readonly appelant: {
        readonly category: "default";
        readonly name: "declarer_id";
    };
    readonly localisation: {
        readonly category: "GMAO";
        readonly name: "Local Mission";
    };
    readonly demande: {
        readonly category: "default";
        readonly name: "description";
    };
    readonly creationDate: {
        readonly category: "default";
        readonly name: "creationDate";
    };
};
export declare const TICKET_STATUS_DATE_CATEGORY = "GMAO";
export declare const TICKET_STATUS_DATE_ATTRS: string[];
export declare const ROOM_NAME_TO_TOKEN: Record<string, string>;
