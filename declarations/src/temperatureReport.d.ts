import { SpinalNode } from 'spinal-env-viewer-graph-service';
import type { SpinalMain } from './index';
export interface MulticapteurEntry {
    multicapteurNode: SpinalNode;
    bmsEndpointNode: SpinalNode;
}
export type FloorZoneMap = Record<string, Record<string, MulticapteurEntry[]>>;
export declare function buildFloorZoneMap(spinalMain: SpinalMain): Promise<FloorZoneMap>;
export declare function generateDayTempReport(spinalMain: SpinalMain, floorZoneMap: FloorZoneMap, day: Date): Promise<Record<string, {
    value: number | string;
    color?: string;
}>>;
export declare function generateWeeklyTempReports(spinalMain: SpinalMain): Promise<string[]>;
