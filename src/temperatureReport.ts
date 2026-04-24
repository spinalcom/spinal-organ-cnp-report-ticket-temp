import { SpinalNode } from 'spinal-env-viewer-graph-service';
import { SpinalExcelFiller, CellValueOrEntry } from "spinal-service-excel-filler";
import * as path from "path";
import { existsSync } from "fs";
import { getColorFromValue, parseAttrValue, ROOM_NAME_TO_TOKEN } from './utils';
import { serviceDocumentation } from 'spinal-env-viewer-plugin-documentation-service';
import type { SpinalMain } from './index';

export interface MulticapteurEntry {
    multicapteurNode: SpinalNode;
    bmsEndpointNode: SpinalNode;
}

// floor -> zone letter (A|B|C|D) -> list of multicapteur entries
export type FloorZoneMap = Record<string, Record<string, MulticapteurEntry[]>>;

const FLOORS = ['01', '02', '03', '04', '05', '06', '07'];
const ZONES = ['A', 'B', 'C', 'D'];
const PROD_SHEET = 'Production';


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


/**
 * Build a lookup from multicapteur node name to its BmsEndpoint node,
 * using all entries in the FloorZoneMap.
 */
function buildMulticapteurLookup(floorZoneMap: FloorZoneMap): Map<string, SpinalNode> {
    const lookup = new Map<string, SpinalNode>();
    for (const zones of Object.values(floorZoneMap)) {
        for (const entries of Object.values(zones)) {
            for (const entry of entries) {
                lookup.set(entry.multicapteurNode.getName().get(), entry.bmsEndpointNode);
            }
        }
    }
    return lookup;
}


/**
 * Generate a single temperature report file for the given period (morning or evening).
 * Uses the Template sheet tokens to discover cell positions, then fills the Production sheet.
 */
export async function generateTempReport(
    spinalMain: SpinalMain,
    floorZoneMap: FloorZoneMap,
    period: 'morning' | 'evening',
    day?: Date
): Promise<string> {
    const reportDay = day || new Date();
    const templatePath = path.resolve(process.cwd(), 'templates', process.env.EXCEL_FILE_NAME!);
    if (!existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
    }

    const filler = new SpinalExcelFiller();
    await filler.loadTemplate(templatePath);

    // Discover token positions from Template sheet, map to Production sheet
    const varLocations = filler.getVariableLocations();
    const toProd = (ref: string) => ref.replace('Template!', `${PROD_SHEET}!`);

    // --- Metadata via token locations ---
    const ampm = period === 'morning' ? 'AM' : 'PM';
    const ampmCells: Record<string, CellValueOrEntry> = {};
    for (const loc of varLocations['AM_PM']) {
        ampmCells[toProd(loc)] = ampm;
    }
    filler.setCells(ampmCells);

    const dateStr = reportDay.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = period === 'morning' ? '08:30' : '13:30';
    filler.setCells({
        [toProd(varLocations['date_day'][0])]: dateStr,
        [toProd(varLocations['date_hour'][0])]: timeStr,
    });

    // --- Determine query timestamp ---
    const ts = new Date(reportDay);
    if (period === 'morning') {
        ts.setHours(8, 0, 0, 0);
    } else {
        ts.setHours(13, 30, 0, 0);
    }

    // --- Outside temperature & hygrometry (embedded tokens → formatted string) ---
    const outsideTemp = await spinalMain.getEndpointValueAtTime(spinalMain.outsideTempEndpoint!, ts.getTime());
    const hygrometry = await spinalMain.getEndpointValueAtTime(spinalMain.hygrometryEndpoint!, ts.getTime());

    const extTempCell = toProd(varLocations['EXT_TEMP'][0]);
    const extHygrCell = toProd(varLocations['EXT_HYGR'][0]);

    filler.setCells({
        [extTempCell]: outsideTemp !== null ? `T°: ${Math.round(outsideTemp * 10) / 10}°c` : 'T°: N/A',
        [extHygrCell]: hygrometry !== null ? `HYGR: ${Math.round(hygrometry * 10) / 10}` : 'HYGR: N/A',
    });

    // --- Zone temperature data (fill 7 floors downward from row 11) ---
    for (const zone of ZONES) {
        const maxValues: CellValueOrEntry[] = [];
        const avgValues: CellValueOrEntry[] = [];
        const minValues: CellValueOrEntry[] = [];

        for (const floor of FLOORS) {
            const entries = floorZoneMap[floor]?.[zone] || [];
            const values: number[] = [];
            for (const entry of entries) {
                const val = await spinalMain.getEndpointValueAtTime(entry.bmsEndpointNode, ts.getTime());
                if (val !== null) values.push(val);
            }
            console.log(`  ${period} Floor ${floor} Zone ${zone}: ${values.length}/${entries.length} values`);

            if (values.length === 0) {
                maxValues.push('');
                avgValues.push('');
                minValues.push('');
            } else {
                const max = Math.round(Math.max(...values) * 10) / 10;
                const min = Math.round(Math.min(...values) * 10) / 10;
                const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

                maxValues.push({ value: max, color: getColorFromValue(max) });
                avgValues.push({ value: avg, color: getColorFromValue(avg) });
                minValues.push({ value: min, color: getColorFromValue(min) });
            }
        }

        filler.setRange(toProd(varLocations[`MAX_${zone}`][0]), maxValues);
        filler.setRange(toProd(varLocations[`AVG_${zone}`][0]), avgValues);
        filler.setRange(toProd(varLocations[`MIN_${zone}`][0]), minValues);
    }

    // --- Special rooms (ICV) ---
    const mcLookup = buildMulticapteurLookup(floorZoneMap);
    const specialGroup = await spinalMain.getSpecialRoomsGroup();
    const rooms = await specialGroup.getChildren('groupHasgeographicRoom');

    for (const room of rooms) {
        const roomName = room.getName().get();
        const token = ROOM_NAME_TO_TOKEN[roomName];
        if (!token) {
            console.warn(`Special room "${roomName}" has no token mapping. Skipping.`);
            continue;
        }
        if (!varLocations[token]) {
            console.warn(`Token "${token}" not found in template. Skipping room "${roomName}".`);
            continue;
        }

        const bimObjects = await room.getChildren('hasBimObject');
        const values: number[] = [];
        for (const bimObj of bimObjects) {
            const bmsEndpoint = mcLookup.get(bimObj.getName().get());
            if (!bmsEndpoint) continue;
            const val = await spinalMain.getEndpointValueAtTime(bmsEndpoint, ts.getTime());
            if (val !== null) values.push(val);
        }

        if (values.length > 0) {
            const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
            filler.setCells({ [toProd(varLocations[token][0])]: avg });
            console.log(`  Special room "${roomName}" (${token}): avg=${avg} from ${values.length} multicapteur(s)`);
        } else {
            filler.setCells({ [toProd(varLocations[token][0])]: 'NAN' });
            console.warn(`  Special room "${roomName}" (${token}): no data, set NAN`);
        }
    }

    // --- Save ---
    filler.deleteSheet('Template');
    const dayLabel = reportDay.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const periodLabel = period === 'morning' ? 'Matin' : 'Soir';
    const outputPath = path.resolve(process.cwd(), 'prod', `Relevé T° ${dayLabel} ${periodLabel}.xlsx`);
    await filler.save(outputPath);
    console.log(`Temp report saved: ${outputPath}`);

    return outputPath;
}
