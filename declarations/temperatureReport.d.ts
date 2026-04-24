import { SpinalNode } from 'spinal-env-viewer-graph-service';
import type { SpinalMain } from './index';
export interface MulticapteurEntry {
    multicapteurNode: SpinalNode;
    bmsEndpointNode: SpinalNode;
}
export type FloorZoneMap = Record<string, Record<string, MulticapteurEntry[]>>;
export declare function buildFloorZoneMap(spinalMain: SpinalMain): Promise<FloorZoneMap>;
export declare function generateTempReport(spinalMain: SpinalMain, floorZoneMap: FloorZoneMap, period: 'morning' | 'evening', day?: Date): Promise<string>;
