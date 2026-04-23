import { FileSystem, Model } from 'spinal-core-connectorjs';
import { SpinalNode } from 'spinal-env-viewer-graph-service';
import { SpinalDateValue, SpinalServiceTimeseries, TimeSeriesIntervalDate } from 'spinal-model-timeseries';
import { TicketCountMap } from './utils';
export declare class SpinalMain {
    hubConnection: FileSystem;
    serviceTimeseries: SpinalServiceTimeseries;
    buildingEndpoints: SpinalNode[];
    outsideTempEndpoint: SpinalNode;
    hygrometryEndpoint: SpinalNode;
    ticketMap: any;
    constructor();
    init(): Promise<unknown>;
    load<T extends Model>(server_id: number): Promise<T>;
    getEndpointCurrentValue(endpoint: SpinalNode<any>): Promise<any>;
    getEndpointTimeseries(endpoint: SpinalNode<any>, intervalDate: TimeSeriesIntervalDate): Promise<SpinalDateValue[]>;
    getEndpointValueAtTime(endpoint: SpinalNode<any>, timestamp: number): Promise<number | null>;
    initBuildingEndpoints(): Promise<void>;
    getEquipmentGroup(): Promise<SpinalNode>;
    sendEmail(attachmentPaths: string[]): Promise<void>;
    initTicketMap(weekStart: Date, weekEnd: Date): Promise<TicketCountMap>;
}
