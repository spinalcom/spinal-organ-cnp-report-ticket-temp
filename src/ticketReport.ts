import { SpinalExcelFiller } from "spinal-service-excel-filler";
import templateTicketCellMap from "../templateTicketCellMap.json";
import * as path from "path";
import { existsSync } from "fs";
import type { SpinalMain } from './index';
import type { TicketCountMap } from './utils';


/**
 * Computes last Friday 19:00 → current Friday 19:00 range.
 * If referenceDate is not a Friday, goes back to the most recent Friday.
 */
function getTicketDateRange(referenceDate: Date): { start: Date; end: Date } {
    const end = new Date(referenceDate);
    const dayOfWeek = end.getDay(); // 0=Sun, 5=Fri
    const daysToFriday = (dayOfWeek + 2) % 7; // days since last Friday
    end.setDate(end.getDate() - daysToFriday);
    end.setHours(19, 0, 0, 0);

    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    return { start, end };
}


export async function generateWeeklyTicketReport(spinalMain: SpinalMain, referenceDate?: Date): Promise<string> {
    const ref = referenceDate || new Date();
    const { start: weekStart, end: weekEnd } = getTicketDateRange(ref);

    console.log(`Ticket range: ${weekStart.toISOString()} → ${weekEnd.toISOString()}`);

    const ticketCountMap = await spinalMain.initTicketMap(weekStart, weekEnd);

    const cellMap = templateTicketCellMap as Record<string, string>;
    const sheetName = process.env.TICKET_EXCEL_SHEET_NAME || "Feuille 1";
    const cellData: Record<string, { value: number | string }> = {};

    const setCell = (key: string, value: number | string) => {
        const cellRef = cellMap[key];
        if (!cellRef) return;
        cellData[`${sheetName}!${cellRef}`] = { value };
    };

    // Date range header
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    setCell('dateRange', `${fmt(weekStart)} 19:00:00 --> ${fmt(weekEnd)} 19:00:00`);

    let mltTotal = 0;
    let mlsTotal = 0;

    for (const [processKey, statuses] of Object.entries(ticketCountMap)) {
        const attente = statuses.attente || 0;
        const cloturee = statuses.cloturee || 0;
        const realisationPartielle = statuses.realisationPartielle || 0;
        const refusee = statuses.refusee || 0;
        const total = attente + cloturee + realisationPartielle + refusee;

        setCell(`${processKey}_attente`, attente);
        setCell(`${processKey}_cloturee`, cloturee);
        setCell(`${processKey}_realisationPartielle`, realisationPartielle);
        setCell(`${processKey}_refusee`, refusee);
        setCell(`${processKey}_total`, total);

        if (processKey.startsWith('mlt_')) {
            mltTotal += total;
        } else if (processKey.startsWith('mls_')) {
            mlsTotal += total;
        }
    }

    setCell('mlt_total', mltTotal);
    setCell('mls_total', mlsTotal);
    setCell('totalGeneral', mltTotal + mlsTotal);

    // Save
    const templatePath = path.resolve(process.cwd(), process.env.TICKET_EXCEL_FILE_NAME!);
    if (!existsSync(templatePath)) {
        throw new Error(`Ticket template file not found: ${templatePath}`);
    }

    const filler = new SpinalExcelFiller();
    await filler.loadTemplate(templatePath);
    filler.setCells(cellData);

    const fmtFile = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const outputPath = path.resolve(process.cwd(), `Tickets CNP ${fmtFile(weekStart)}_${fmtFile(weekEnd)}.xlsx`);
    await filler.save(outputPath);
    console.log(`Ticket report saved: ${outputPath}`);

    return outputPath;
}
