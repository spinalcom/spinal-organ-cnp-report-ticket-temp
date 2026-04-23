const VALID_ZONES = ['A', 'B', 'C', 'D'];

/**
 * Parses an attribute value like "B1-01-ZA-TR04-510-PR01-MC01"
 * Returns the floor (e.g. "01") and zoneLetter (e.g. "A"), or null if unparseable.
 */
export function parseAttrValue(attrValue: string): { floor: string; zoneLetter: string } | null {
    const parts = attrValue.split('-');
    if (parts.length < 3) return null;
    const floor = parts[1];          // "01"
    const zoneLetter = parts[2][1];  // "ZA" -> "A"
    if (!VALID_ZONES.includes(zoneLetter)) return null;
    return { floor, zoneLetter };
}

/**
 * Given a reference date (typically Friday at 7pm), returns 
 * the Monday-Friday Date objects of that same week.
 */
export function getWeekDays(fridayDate: Date): Date[] {
    const monday = new Date(fridayDate);
    monday.setDate(fridayDate.getDate() - (fridayDate.getDay() + 6) % 7); // go back to Monday
    monday.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = 0; i < 5; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        days.push(day);
    }
    return days;
}

export function getColorFromValue(value: number): string {
    return value < 18 ? "f7caac" : "c5e0b3";
}

// Maps DB process names to templateTicketCellMap key prefixes
export const PROCESS_NAME_TO_CELL_KEY: Record<string, string> = {
    'BÂTIMENTS': 'mlt_batiments',
    'ACCES ET SECURITE': 'mlt_accesSecurite',
    'CLIMATISATION ET CHAUFFAGE': 'mlt_climatisationChauffage',
    'ELECTRICITE': 'mlt_electricite',
    'PLOMBERIE': 'mlt_plomberie',
    'ASCENSEURS': 'mlt_ascenseurs',
    'EQUIPEMENTS SPECIFIQUES': 'mlt_equipementsSpecifiques',
    'Application': 'mlt_application',
    'DISTRIBUTEUR DE BOISSONS': 'mls_distributeurBoissons',
    'GESTION DES DECHETS': 'mls_gestionDechets',
    'SERVICES': 'mls_services',
    'LOGISTIQUE': 'mls_logistique',
    'MOBILIER': 'mls_mobilier',
    'PHOTOCOPIEURS': 'mls_photocopieurs',
    'AMENAGEMENT POSTE TRAVAIL HAND': 'mls_amenagementPosteHand',
    'PROPRETE': 'mls_proprete',
};

// Maps DB step names to the status suffix used in cellMap keys
export const STEP_NAME_TO_STATUS: Record<string, string> = {
    'Attente de lect.avant Execution': 'attente',
    'Attente de réalisation': 'attente',
    'Clôturée': 'cloturee',
    'Réalisation partielle': 'realisationPartielle',
    'Refusée': 'refusee',
};

// processKey -> status -> count
export type TicketCountMap = Record<string, Record<string, number>>;