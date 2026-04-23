import { SpinalNode } from 'spinal-env-viewer-graph-service';
import { SpinalExcelFiller } from "spinal-service-excel-filler";
import templateCellMap from "../templateCellMap.json";
import * as path from "path";
import { existsSync } from "fs";
import { getColorFromValue, parseAttrValue, getWeekDays } from './utils';
import { serviceDocumentation } from 'spinal-env-viewer-plugin-documentation-service';
import type { SpinalMain } from './index';

export interface MulticapteurEntry {
    multicapteurNode: SpinalNode;
    bmsEndpointNode: SpinalNode;
}

// floor -> zone letter (A|B|C|D) -> list of multicapteur entries
export type FloorZoneMap = Record<string, Record<string, MulticapteurEntry[]>>;


async function processMulticapteur(multicapteur: SpinalNode): Promise<{ floor: string; zoneLetter: string; entry: MulticapteurEntry } | null> {
    const attribut = await serviceDocumentation.findOneAttributeInCategory(multicapteur, process.env.CAT_ATTR_NAME!, process.env.ATTR_NAME!);
    if (attribut == -1) {
        console.warn(`Attribute "${process.env.ATTR_NAME}" not found in category "${process.env.CAT_ATTR_NAME}" for multicapteur "${multicapteur.getName().get()}". Skipping.`);
        return null;
    }
    const attrValue = attribut.value.get();

    const parsed = parseAttrValue(attrValue);
    if (!parsed) {
        console.warn(`Could not parse attribute value "${attrValue}" for multicapteur "${multicapteur.getName().get()}". Skipping.`);
        return null;
    }
    const { floor, zoneLetter } = parsed;

    const cp = await multicapteur.getChildren('hasControlPoints');
    const CPProfile = cp.find((cp) => cp.getName().get() === process.env.CP_PROFILE_NAME!);
    if (!CPProfile) {
        console.warn(`CP Profile "${process.env.CP_PROFILE_NAME}" not found in control points of multicapteur "${multicapteur.getName().get()}". Skipping.`);
        return null;
    }

    const bmsEndpoints = await CPProfile.getChildren('hasBmsEndpoint');
    const bmsEndpoint = bmsEndpoints.find((ep) => ep.getName().get() === process.env.BMS_ENDPOINT_NAME);
    if (!bmsEndpoint) {
        console.warn(`BMS Endpoint "${process.env.BMS_ENDPOINT_NAME}" not found in CP "${process.env.CP_PROFILE_NAME}" of multicapteur "${multicapteur.getName().get()}". Skipping.`);
        return null;
    }

    return { floor, zoneLetter, entry: { multicapteurNode: multicapteur, bmsEndpointNode: bmsEndpoint } };
}


export async function buildFloorZoneMap(spinalMain: SpinalMain): Promise<FloorZoneMap> {
    const group = await spinalMain.getEquipmentGroup();

    const multicapteurs = await group.getChildren('groupHasBIMObject');
    const results = await Promise.all(multicapteurs.map((mc) => processMulticapteur(mc)));

    const floorZoneMap: FloorZoneMap = {};
    for (const result of results) {
        if (!result) continue;
        const { floor, zoneLetter, entry } = result;
        if (!floorZoneMap[floor]) floorZoneMap[floor] = {};
        if (!floorZoneMap[floor][zoneLetter]) floorZoneMap[floor][zoneLetter] = [];
        floorZoneMap[floor][zoneLetter].push(entry);
    }

    console.log('FloorZoneMap built:');
    for (const [floor, zones] of Object.entries(floorZoneMap)) {
        for (const [zone, entries] of Object.entries(zones)) {
            console.log(`  Floor ${floor} - Zone ${zone}: ${entries.length} multicapteur(s)`);
        }
    }

    return floorZoneMap;
}


export async function generateDayTempReport(
    spinalMain: SpinalMain,
    floorZoneMap: FloorZoneMap,
    day: Date
): Promise<Record<string, { value: number | string; color?: string }>> {
    const cellMap = templateCellMap as Record<string, string>;
    const sheetName = process.env.EXCEL_FILE_SHEET_NAME || "Sheet1";
    const cellData: Record<string, { value: number | string; color?: string }> = {};

    const setCell = (key: string, value: number | string, color?: string) => {
        const cellRef = cellMap[key];
        if (!cellRef) return;
        const cellCode = `${sheetName}!${cellRef}`;
        cellData[cellCode] = color ? { value, color } : { value };
    };

    // Fill date/hour metadata
    const dateStr = day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    setCell('morningDate', dateStr);
    setCell('eveningDate', dateStr);
    setCell('morningHour', '08:00');
    setCell('eveningHour', '13:30');

    // Morning = 8:00 AM, Evening = 1:30 PM
    const morningTime = new Date(day);
    morningTime.setHours(8, 0, 0, 0);
    const eveningTime = new Date(day);
    eveningTime.setHours(13, 30, 0, 0);

    const periods: { name: string; timestamp: number }[] = [
        { name: 'morning', timestamp: morningTime.getTime() },
        { name: 'evening', timestamp: eveningTime.getTime() },
    ];

    for (const { name: period, timestamp } of periods) {
        // Fill outside temperature and hygrometry
        const outsideTemp = await spinalMain.getEndpointValueAtTime(spinalMain.outsideTempEndpoint!, timestamp);
        if (outsideTemp !== null) {
            setCell(`${period}OutsideTemp`, Math.round(outsideTemp * 10) / 10);
        }
        const hygrometry = await spinalMain.getEndpointValueAtTime(spinalMain.hygrometryEndpoint!, timestamp);
        if (hygrometry !== null) {
            setCell(`${period}Hygrometry`, Math.round(hygrometry * 10) / 10);
        }

        for (const [floor, zones] of Object.entries(floorZoneMap)) {
            const floorNum = parseInt(floor, 10);
            for (const [zone, entries] of Object.entries(zones)) {
                const values: number[] = [];
                for (const entry of entries) {
                    const val = await spinalMain.getEndpointValueAtTime(entry.bmsEndpointNode, timestamp);
                    if (val !== null) values.push(val);
                }
                console.log(`  ${period} Floor ${floor} Zone ${zone}: ${values.length}/${entries.length} endpoints returned data`);
                if (values.length === 0) continue;

                const max = Math.max(...values);
                const min = Math.min(...values);
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                const roundedMax = Math.round(max * 10) / 10;
                const roundedMin = Math.round(min * 10) / 10;
                const roundedAvg = Math.round(avg * 10) / 10;

                setCell(`${period}MaxTempR${floorNum}_${zone}`, roundedMax, getColorFromValue(roundedMax));
                setCell(`${period}AverageTempR${floorNum}_${zone}`, roundedAvg, getColorFromValue(roundedAvg));
                setCell(`${period}MinTempR${floorNum}_${zone}`, roundedMin, getColorFromValue(roundedMin));
            }
        }
    }

    return cellData;
}


export async function generateWeeklyTempReports(spinalMain: SpinalMain): Promise<string[]> {
    const floorZoneMap = await buildFloorZoneMap(spinalMain);
    const now = new Date();
    const weekDays = getWeekDays(now);

    const templatePath = path.resolve(process.cwd(), process.env.EXCEL_FILE_NAME!);
    if (!existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
    }

    const outputPaths: string[] = [];

    for (const day of weekDays) {
        const dayLabel = day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
        console.log(`Generating temp report for ${dayLabel}...`);

        const cellData = await generateDayTempReport(spinalMain, floorZoneMap, day);

        const filler = new SpinalExcelFiller();
        await filler.loadTemplate(templatePath);
        filler.setCells(cellData);

        const outputPath = path.resolve(process.cwd(), `Relevé T° ${dayLabel}.xlsx`);
        await filler.save(outputPath);
        outputPaths.push(outputPath);

        console.log(`Report saved: ${outputPath}`);
    }

    return outputPaths;
}
