import { SpinalExcelFiller } from "spinal-service-excel-filler";
import * as path from "path";
import { existsSync } from "fs";
import type { SpinalMain } from './index';
import { PROCESS_NAME_TO_TOKEN, MLT_PROCESSES, MLS_PROCESSES, STATUS_ORDER } from './utils';

const PROD_SHEET = 'Production';


export async function generateWeeklyTicketReport(spinalMain: SpinalMain, referenceDate?: Date): Promise<string> {
    const end = referenceDate || new Date();
    const weekEnd = new Date(end);
    weekEnd.setSeconds(0, 0);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    console.log(`Ticket range: ${weekStart.toISOString()} → ${weekEnd.toISOString()}`);

    const ticketCountMap = await spinalMain.initTicketMap(weekStart, weekEnd);

    const templatePath = path.resolve(process.cwd(), 'templates', process.env.TICKET_EXCEL_FILE_NAME!);
    if (!existsSync(templatePath)) {
        throw new Error(`Ticket template file not found: ${templatePath}`);
    }

    const filler = new SpinalExcelFiller();
    await filler.loadTemplate(templatePath);

    const varLocations = filler.getVariableLocations();
    const toProd = (ref: string) => ref.replace('Template!', `${PROD_SHEET}!`);

    // Date range header (embedded tokens Date1/Date2 in A1 & B1)
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dateStart = `${fmt(weekStart)} 19:00:00`;
    const dateEnd = `${fmt(weekEnd)} 19:00:00`;
    // A1 and B1 both contain "Du {{Date1}} au {{Date2}}" — set formatted string on Production
    const dateStr = `Du ${dateStart} au ${dateEnd}`;
    for (const loc of varLocations['Date1']) {
        filler.setCells({ [toProd(loc)]: dateStr });
    }

    // Fill each process row using token locations
    let mltTotal = 0;
    let mlsTotal = 0;

    for (const [processName, tokenName] of Object.entries(PROCESS_NAME_TO_TOKEN)) {
        const locs = varLocations[tokenName];
        if (!locs || locs.length === 0) {
            console.warn(`Token "${tokenName}" not found in ticket template. Skipping process "${processName}".`);
            continue;
        }

        const statuses = ticketCountMap[processName] || {};
        const counts = STATUS_ORDER.map((s) => statuses[s] || 0);
        const total = counts.reduce((a, b) => a + b, 0);

        // Token is at column C; fill C-H (5 statuses + total) rightward
        filler.setRange(toProd(locs[0]), [...counts, total], { direction: 'row' });

        if (MLT_PROCESSES.includes(processName)) {
            mltTotal += total;
        } else if (MLS_PROCESSES.includes(processName)) {
            mlsTotal += total;
        }
    }

    // Totals via token locations
    filler.setCells({
        [toProd(varLocations['MLT_TOTAL'][0])]: mltTotal,
        [toProd(varLocations['MLS_TOTAL'][0])]: mlsTotal,
        [toProd(varLocations['TOTAL'][0])]: mltTotal + mlsTotal,
    });

    // Save
    filler.deleteSheet('Template');
    const fmtFile = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const outputPath = path.resolve(process.cwd(), 'prod', `Tickets CNP ${fmtFile(weekStart)}_${fmtFile(weekEnd)}.xlsx`);
    await filler.save(outputPath);
    console.log(`Ticket report saved: ${outputPath}`);

    return outputPath;
}
