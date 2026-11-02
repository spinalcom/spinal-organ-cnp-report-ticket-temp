import { SpinalExcelFiller, CellValueOrEntry } from "spinal-service-excel-filler";
import { serviceDocumentation } from 'spinal-env-viewer-plugin-documentation-service';
import ExcelJS from "exceljs";
import * as path from "path";
import { existsSync } from "fs";
import type { SpinalNode } from 'spinal-env-viewer-graph-service';
import type { SpinalMain } from './index';
import {
    PROCESS_NAME_TO_TOKEN,
    MLT_PROCESSES,
    MLS_PROCESSES,
    STATUS_ORDER,
    TICKET_ATTR,
    TICKET_STATUS_DATE_CATEGORY,
    TICKET_STATUS_DATE_ATTRS,
    TicketRef,
} from './utils';

const SUMMARY_SHEET = 'Production';
const LIST_SHEET = 'Liste des tickets';


/** Read a single documentation attribute as a trimmed string, or null when missing/empty. */
async function readAttr(node: SpinalNode, category: string, name: string): Promise<string | null> {
    try {
        const attr: any = await serviceDocumentation.findOneAttributeInCategory(node, category, name);
        if (!attr || attr === -1) return null;
        const raw = attr.value?.get?.();
        if (raw === undefined || raw === null) return null;
        const s = String(raw).trim();
        return s === '' ? null : s;
    } catch {
        return null;
    }
}

/** Parse an epoch-ms number, an epoch-ms string, or an ISO string into a Date (null if unparseable). */
function parseDate(raw: string | number | null | undefined): Date | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }
    const s = String(raw).trim();
    if (s === '') return null;
    if (/^\d+$/.test(s)) {                 // epoch ms as string
        const d = new Date(Number(s));
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);                 // ISO, e.g. 2026-07-08T14:00:00.000Z
    return isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(d: Date | null): string {
    if (!d) return '';
    return d.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

/** A note is the ticket's compte rendu (CR) when info.ticketCR is true; otherwise it's a comment. */
function isCRNote(note: SpinalNode): boolean {
    return (note as any).info?.ticketCR?.get?.() == true;
}

function noteMessage(element: any): string {
    const msg = element?.message?.get?.();
    return msg == null ? '' : String(msg);
}

/**
 * Provider notes: 'hasNotes' holds exactly one CR and one or many comments.
 * - commentaire: the last synced comment. Newest comments land at the end of the
 *   array; a comment whose element has no numeric sentDone isn't synced yet.
 * - compteRendu: the CR message.
 * Each is '' when missing.
 */
async function readNotes(ticket: SpinalNode): Promise<{ commentaire: string; compteRendu: string }> {
    const result = { commentaire: '', compteRendu: '' };
    try {
        const notes = await ticket.getChildren('hasNotes');
        if (!notes || notes.length === 0) return result;

        const cr: any = notes.find(isCRNote);
        if (cr) result.compteRendu = noteMessage(await cr.element.load());

        const comments = notes.filter((n) => !isCRNote(n));
        for (let i = comments.length - 1; i >= 0; i--) {
            const element: any = await (comments[i] as any).element.load();
            if (Number.isFinite(element?.sentDone?.get?.())) {
                result.commentaire = noteMessage(element);
                break;
            }
        }
    } catch (err) {
        console.warn(`Failed to read notes for a ticket: ${(err as Error).message}`);
    }
    return result;
}

/** Resolve one ticket into the 8 columns of the "Liste des tickets" sheet. */
async function buildTicketRow(ref: TicketRef): Promise<CellValueOrEntry[]> {
    const { node, domaine, etape } = ref;

    const [missionId, appelant, localisation, demande, creationRaw, ...statusRaws] = await Promise.all([
        readAttr(node, TICKET_ATTR.missionId.category, TICKET_ATTR.missionId.name),
        readAttr(node, TICKET_ATTR.appelant.category, TICKET_ATTR.appelant.name),
        readAttr(node, TICKET_ATTR.localisation.category, TICKET_ATTR.localisation.name),
        readAttr(node, TICKET_ATTR.demande.category, TICKET_ATTR.demande.name),
        readAttr(node, TICKET_ATTR.creationDate.category, TICKET_ATTR.creationDate.name),
        ...TICKET_STATUS_DATE_ATTRS.map((a) => readAttr(node, TICKET_STATUS_DATE_CATEGORY, a)),
    ]);

    // Description: appelant + localisation + demande, one labelled line each.
    const description = [
        `Appelant : ${appelant ?? ''}`,
        `Localisation : ${localisation ?? ''}`,
        `Demande : ${demande ?? ''}`,
    ].join('\n');

    // Date de création: prefer the attribute; fall back to the node's own creationDate.
    let creationDate = parseDate(creationRaw);
    if (!creationDate) creationDate = parseDate((node as any).info?.creationDate?.get?.());

    // Date du passage au dernier statut: the most recent of the GMAO status dates.
    let lastStatus: Date | null = null;
    for (const raw of statusRaws) {
        const d = parseDate(raw);
        if (d && (!lastStatus || d.getTime() > lastStatus.getTime())) lastStatus = d;
    }

    const { commentaire, compteRendu } = await readNotes(node);

    return [
        missionId ?? '',
        domaine,
        etape,
        description,
        fmtDateTime(creationDate),
        fmtDateTime(lastStatus),
        commentaire,
        compteRendu,
    ];
}

/**
 * The filler only writes cell values, so multi-line columns won't wrap. Re-open
 * the saved file and enable wrap-text + top alignment on the Description (D),
 * Commentaire (G) and Compte rendu (H) columns for the data rows. Safe here — the ticket template has
 * no charts/images for ExcelJS to drop on re-save.
 */
async function enableListWrap(filePath: string, dataRowCount: number): Promise<void> {
    if (dataRowCount <= 0) return;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet(LIST_SHEET);
    if (!ws) return;
    const WRAP_COLS = [4, 7, 8]; // D = Description, G = Commentaire, H = Compte rendu
    for (let r = 2; r < 2 + dataRowCount; r++) {
        for (const c of WRAP_COLS) {
            const cell = ws.getCell(r, c);
            cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: 'top' };
        }
    }
    await wb.xlsx.writeFile(filePath);
}


export async function generateWeeklyTicketReport(spinalMain: SpinalMain, referenceDate?: Date): Promise<string> {
    const end = referenceDate || new Date();
    const weekEnd = new Date(end);
    weekEnd.setSeconds(0, 0);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    console.log(`Ticket range: ${weekStart.toISOString()} → ${weekEnd.toISOString()}`);

    const { countMap: ticketCountMap, tickets } = await spinalMain.initTicketMap(weekStart, weekEnd);

    const templatePath = path.resolve(process.cwd(), 'templates', process.env.TICKET_EXCEL_FILE_NAME!);
    if (!existsSync(templatePath)) {
        throw new Error(`Ticket template file not found: ${templatePath}`);
    }

    const filler = new SpinalExcelFiller();
    await filler.loadTemplate(templatePath);

    // Tokens are filled in place on the template sheets, which are renamed at the end.
    const varLocations = filler.getVariableLocations();

    // --- Sheet "Template" → summary counts ---
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeFmt = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // A1 and B1 both hold "Du {{Date1}} au {{Date2}}" — overwrite the whole cell.
    const dateStr = `Du ${fmt(weekStart)} ${timeFmt(weekStart)} au ${fmt(weekEnd)} ${timeFmt(weekEnd)}`;
    for (const loc of varLocations['Date1'] || []) {
        filler.setCells({ [loc]: dateStr });
    }

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

        // Token at column C; fill C-H (5 statuses + total) rightward.
        filler.setRange(locs[0], [...counts, total], { direction: 'row' });

        if (MLT_PROCESSES.includes(processName)) mltTotal += total;
        else if (MLS_PROCESSES.includes(processName)) mlsTotal += total;
    }

    filler.setCells({
        [varLocations['MLT_TOTAL'][0]]: mltTotal,
        [varLocations['MLS_TOTAL'][0]]: mlsTotal,
        [varLocations['TOTAL'][0]]: mltTotal + mlsTotal,
    });

    // --- Sheet "Template liste des tickets" → one row per kept ticket ---
    let listRowCount = 0;
    const listAnchor = varLocations['Ticket_List_Range']?.[0];
    if (!listAnchor) {
        console.warn('Token "Ticket_List_Range" not found in ticket template; skipping ticket list.');
    } else {
        console.log(`Building ${tickets.length} ticket detail row(s)...`);
        const rows: CellValueOrEntry[][] = [];
        for (const t of tickets) rows.push(await buildTicketRow(t));
        if (rows.length > 0) {
            filler.setRange(listAnchor, rows); // 2D block anchored at A2
            listRowCount = rows.length;
        } else {
            filler.setCells({ [listAnchor]: '' }); // clear the token when there are no tickets
        }
    }

    // --- Rename the template sheets to their final names, then save ---
    filler.renameSheet('Template', SUMMARY_SHEET);
    filler.renameSheet('Template liste des tickets', LIST_SHEET);

    const fmtFile = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const outputPath = path.resolve(process.cwd(), 'prod', `Tickets CNP ${fmtFile(weekStart)}_${fmtFile(weekEnd)}.xlsx`);
    await filler.save(outputPath);

    // Enable wrap-text on the multi-line columns now that the file is written.
    await enableListWrap(outputPath, listRowCount);

    console.log(`Ticket report saved: ${outputPath}`);
    return outputPath;
}
