const VALID_ZONES = ['A', 'B', 'C', 'D'];

export function parseAttrValue(attrValue: string): { floor: string; zoneLetter: string } | null {
    const parts = attrValue.split('-');
    if (parts.length < 3) return null;
    const floor = parts[1];          // "01"
    const zoneLetter = parts[2][1];  // "ZA" -> "A"
    if (!VALID_ZONES.includes(zoneLetter)) return null;
    return { floor, zoneLetter };
}

export function getColorFromValue(value: number): string {
    return value < 18 ? "f7caac" : "c5e0b3";
}

// Maps DB process names to their template token name
export const PROCESS_NAME_TO_TOKEN: Record<string, string> = {
    'BÂTIMENTS': 'BATIMENT',
    'ACCES ET SECURITE': 'ACCES_ET_SECURITE',
    'CLIMATISATION ET CHAUFFAGE': 'CLIMATISATION_ET_CHAUFFAGE',
    'ELECTRICITE': 'ELECTRICITE',
    'PLOMBERIE': 'PLOMBERIE',
    'ASCENSEURS': 'ASCENSEURS',
    'EQUIPEMENTS SPECIFIQUES': 'EQUIPEMENTS_SPECIFIQUES',
    'Application': 'Application',
    'DISTRIBUTEUR DE BOISSONS': 'DISTRIBUTEUR_DE_BOISSONS',
    'GESTION DES DECHETS': 'GESTION_DES_DECHETS',
    'SERVICES': 'SERVICES',
    'LOGISTIQUE': 'LOGISTIQUE',
    'MOBILIER': 'MOBILIER',
    'PHOTOCOPIEURS': 'PHOTOCOPIEURS',
    'AMENAGEMENT POSTE TRAVAIL HAND': 'AMENAGEMENT_POSTE_TRAVAIL_HAND',
    'PROPRETE': 'PROPRETE',
};

// MLT processes (rows 3-10), MLS processes (rows 12-19)
export const MLT_PROCESSES = ['BÂTIMENTS', 'ACCES ET SECURITE', 'CLIMATISATION ET CHAUFFAGE', 'ELECTRICITE', 'PLOMBERIE', 'ASCENSEURS', 'EQUIPEMENTS SPECIFIQUES', 'Application'];
export const MLS_PROCESSES = ['DISTRIBUTEUR DE BOISSONS', 'GESTION DES DECHETS', 'SERVICES', 'LOGISTIQUE', 'MOBILIER', 'PHOTOCOPIEURS', 'AMENAGEMENT POSTE TRAVAIL HAND', 'PROPRETE'];

// Maps DB step names to status keys (matching template column order C-G)
export const STEP_NAME_TO_STATUS: Record<string, string> = {
    'Attente de lect.avant Execution': 'attenteLect',
    'Attente de réalisation': 'attenteReal',
    'Réalisation partielle': 'realisationPartielle',
    'Refusée': 'refusee',
    'Clôturée': 'cloturee',
};

// Status keys in template column order (C through G)
export const STATUS_ORDER = ['attenteLect', 'attenteReal', 'realisationPartielle', 'refusee', 'cloturee'] as const;

// processName -> status -> count
export type TicketCountMap = Record<string, Record<string, number>>;

// Maps special room node names to their Excel template token
export const ROOM_NAME_TO_TOKEN: Record<string, string> = {
    'B1_04_ZB_SR_4157-SALLE DE REUNION': 'ICV_4R12._COMEX',
    'B1_04_ZB_BU_4163-BUREAUX': 'ICV_4R_Espace_COMEX',
    'B1_07_ZB_SR_7146-SALLE DE REUNION': 'ICV_7R12_Salle_du_conseil',
    'B1_01_ZB_SR_1120-SALLE DE CONFERENCE': 'ICV_1R_Jeanne_Barret',
    'B1_01_ZB_BU_1125-BUREAUX': 'ICV_1R_Studio_TV',
    'B1_01_ZA_SR_1206-SALLE DE REUNION': 'ICV_1R06_Commandant_Charcot',
};