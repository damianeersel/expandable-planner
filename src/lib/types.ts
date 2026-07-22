// Centrale domeinmodellen voor de Expandable Production Planner.

export type ISODate = string // 'YYYY-MM-DD'

// ---------- Rollen ----------

export type Rol =
  | 'planner'
  | 'sales'
  | 'engineering_lead'
  | 'productieleider'
  | 'projectmanager'
  | 'management'

export interface Persona {
  id: string
  naam: string
  label: string
  rol: Rol
  afdeling?: Afdeling // voor productieleider / engineering lead
}

export const PERSONAS: Persona[] = [
  { id: 'p-planner', naam: 'Petra Simons', label: 'Planner · Expandable Projects', rol: 'planner' },
  { id: 'p-sales', naam: 'Rick van Leeuwen', label: 'Sales', rol: 'sales' },
  { id: 'p-eng', naam: 'Erik Lindhout', label: 'Engineering lead', rol: 'engineering_lead', afdeling: 'engineering' },
  { id: 'p-pl-chassis', naam: 'Ruud Bakker', label: 'Productieleider · Chassisbouw', rol: 'productieleider', afdeling: 'chassis' },
  { id: 'p-pl-panelen', naam: 'Sandra Vos', label: 'Productieleider · Panelenbouw', rol: 'productieleider', afdeling: 'panelen' },
  { id: 'p-pl-afbouw', naam: 'Marco de Wit', label: 'Productieleider · Afbouw', rol: 'productieleider', afdeling: 'afbouw' },
  { id: 'p-pm', naam: 'Hugo Brands', label: 'Projectmanager', rol: 'projectmanager' },
  { id: 'p-mgmt', naam: 'Directie', label: 'Management · alleen lezen', rol: 'management' },
]

export interface Permissies {
  planningBewerken: boolean
  voortgangBijwerken: boolean
  projectAanmaken: boolean
  orderBevestigen: boolean
  verkoopkansWijzigen: boolean
  teamsBeheren: boolean
  verlofBeheren: boolean
  externBeheren: boolean
  risicoBeheren: boolean
  unitsVerplaatsen: boolean
  templatesBeheren: boolean
}

export function getPermissies(rol: Rol): Permissies {
  return {
    planningBewerken: rol === 'planner',
    voortgangBijwerken: ['planner', 'productieleider', 'engineering_lead'].includes(rol),
    projectAanmaken: ['planner', 'sales'].includes(rol),
    orderBevestigen: rol === 'planner',
    verkoopkansWijzigen: ['planner', 'sales'].includes(rol),
    teamsBeheren: ['planner', 'productieleider'].includes(rol),
    verlofBeheren: ['planner', 'productieleider'].includes(rol),
    externBeheren: ['planner', 'projectmanager'].includes(rol),
    risicoBeheren: ['planner', 'projectmanager'].includes(rol),
    unitsVerplaatsen: ['planner', 'productieleider'].includes(rol),
    templatesBeheren: ['planner', 'engineering_lead'].includes(rol),
  }
}

// ---------- Afdelingen & fases ----------

export type Afdeling = 'engineering' | 'chassis' | 'panelen' | 'afbouw' | 'kwaliteit' | 'extern'

export const AFDELING_LABELS: Record<Afdeling, string> = {
  engineering: 'Engineering',
  chassis: 'Chassisbouw',
  panelen: 'Panelenbouw',
  afbouw: 'Afbouw',
  kwaliteit: 'Kwaliteitscontrole',
  extern: 'Extern',
}

/** Afdelingen met eigen interne teams (voor capaciteitsoverzichten) */
export const PRODUCTIE_AFDELINGEN: Afdeling[] = ['engineering', 'chassis', 'panelen', 'afbouw']

export type FaseKey =
  | 'salesoverdracht'
  | 'engineering'
  | 'chassis'
  | 'panelen'
  | 'spuiter'
  | 'afbouw'
  | 'kwaliteit'

export const FASE_VOLGORDE: FaseKey[] = [
  'salesoverdracht',
  'engineering',
  'chassis',
  'panelen',
  'spuiter',
  'afbouw',
  'kwaliteit',
]

export const FASE_LABELS: Record<FaseKey, string> = {
  salesoverdracht: 'Salesoverdracht',
  engineering: 'Engineering',
  chassis: 'Chassisbouw',
  panelen: 'Panelenbouw',
  spuiter: 'Externe spuiter',
  afbouw: 'Afbouw',
  kwaliteit: 'Kwaliteitscontrole & oplevering',
}

// ---------- Project ----------

export type ProjectStatus = 'schaduw' | 'definitief' | 'opgeleverd' | 'geannuleerd'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  schaduw: 'Schaduwplanning',
  definitief: 'Definitief',
  opgeleverd: 'Opgeleverd',
  geannuleerd: 'Geannuleerd',
}

export type Prioriteit = 'laag' | 'normaal' | 'hoog'
export type Complexiteit = 'eenvoudig' | 'gemiddeld' | 'complex'

export const PRIORITEIT_LABELS: Record<Prioriteit, string> = { laag: 'Laag', normaal: 'Normaal', hoog: 'Hoog' }
export const COMPLEXITEIT_LABELS: Record<Complexiteit, string> = {
  eenvoudig: 'Eenvoudig',
  gemiddeld: 'Gemiddeld',
  complex: 'Complex',
}

export interface Project {
  id: string
  projectnummer: string // bijv. 'PR3305'
  naam: string
  klant: string
  productModel: string // bijv. 'E13T'
  salesverantwoordelijke: string
  projectmanager: string
  status: ProjectStatus
  verkoopkans: number // 0-100; 100 zodra definitief
  prioriteit: Prioriteit
  complexiteit: Complexiteit
  verwachteOrderdatum?: ISODate // alleen relevant voor schaduwprojecten
  gewensteOpleverdatum: ISODate
  bijzonderheden?: string
  notities: string
  aangemaaktOp: ISODate
  bevestigdOp?: ISODate
  // ---------- Templatekoppeling ----------
  /** Versie-specifieke template-id die als basis is gebruikt voor de planning. */
  templateId?: string
  templateTrailertype?: string // bijv. 'E13H'
  templateComplexiteitId?: string // bijv. 'maatwerk'
  templateVersie?: number
  /** True zodra de planning projectspecifiek is aangepast t.o.v. het template. */
  projectspecifiekAangepast?: boolean
}

// ---------- Fase & werkpakket ----------

export type FaseStatus = 'gepland' | 'bezig' | 'gereed' | 'geblokkeerd'

export const FASE_STATUS_LABELS: Record<FaseStatus, string> = {
  gepland: 'Gepland',
  bezig: 'In uitvoering',
  gereed: 'Gereed',
  geblokkeerd: 'Geblokkeerd',
}

// ---------- Taken (detailplanning binnen een proces/werkpakket) ----------

export type TaakStatus = 'te_doen' | 'in_uitvoering' | 'on_hold' | 'gereed'

export const TAAK_STATUS_LABELS: Record<TaakStatus, string> = {
  te_doen: 'Te doen',
  in_uitvoering: 'In uitvoering',
  on_hold: 'On hold',
  gereed: 'Gereed',
}

export type ExterneActieStatus =
  | 'niet_aangevraagd'
  | 'aangevraagd'
  | 'wacht_bevestiging'
  | 'bevestigd'
  | 'in_uitvoering'
  | 'on_hold'
  | 'gereed'
  | 'vertraagd'

export const EXTERNE_ACTIE_LABELS: Record<ExterneActieStatus, string> = {
  niet_aangevraagd: 'Nog niet aangevraagd',
  aangevraagd: 'Aangevraagd',
  wacht_bevestiging: 'In afwachting van bevestiging',
  bevestigd: 'Bevestigd',
  in_uitvoering: 'In uitvoering',
  on_hold: 'On hold',
  gereed: 'Gereed',
  vertraagd: 'Vertraagd',
}

/** Externe uitbesteding van een taak; bestaat naast de gewone taakstatus. */
export interface ExterneActie {
  partijId?: string
  status: ExterneActieStatus
  contactpersoon?: string
  aangevraagdOp?: ISODate
  bevestigdOp?: ISODate
  slot?: string
  verwachteRetour?: ISODate
  notitie?: string
}

/** Kleinste planbare eenheid: een taak binnen een proces (werkpakket). */
export interface Taak {
  id: string
  naam: string
  omschrijving?: string
  uitvoering: 'intern' | 'extern'
  teamId?: string
  taakEigenaarId?: string
  uitvoerendeIds: string[]
  /** Handmatige urenverdeling per uitvoerende (leeg = gelijkmatig verdeeld). */
  urenPerMedewerker?: Record<string, number>
  externeActie?: ExterneActie
  uren: number
  werkelijkeUren?: number
  start?: ISODate
  eind?: ISODate
  prioriteit: Prioriteit
  status: TaakStatus
  /** Einde-naar-start: deze taak start pas als de genoemde taken gereed zijn (taak-ids binnen het project). */
  afhankelijkVan: string[]
  vaardigheden: string[]
  /** Blokkade is een eigenschap naast de status, geen extra status. */
  blokkade?: string
  onHoldReden?: string
  hervattenOp?: ISODate
  werkelijkeStart?: ISODate
  werkelijkGereedOp?: ISODate
  /** Handmatig toegevoegd binnen dit project (niet uit het template). */
  projectspecifiek?: boolean
  aangemaaktOp: ISODate
  aangemaaktDoor: string
  gewijzigdOp: ISODate
  gewijzigdDoor: string
}

export interface Werkpakket {
  id: string
  naam: string
  uren: number
  voortgang: number // 0-100
  status: FaseStatus
  /** Detailtaken; leeg = het proces wordt op procesniveau gepland (voortgang handmatig). */
  taken: Taak[]
  // ---------- Optionele template-/procesvelden ----------
  omschrijving?: string
  /** Herkomst-taak in het template (leeg = projectspecifiek toegevoegd). */
  templateTaakId?: string
  /** Optionele werkzaamheid die bij het inladen aan/uit kan. */
  optioneel?: boolean
  vaardigheden?: string[]
  aantalMedewerkers?: number
  /** Uitsluitend voor dit project toegevoegd (niet uit het template). */
  extraTaak?: boolean
  verantwoordelijkeId?: string
  start?: ISODate
  eind?: ISODate
  uitvoering?: 'intern' | 'extern'
  externePartijId?: string
}

export interface Fase {
  id: string
  projectId: string
  key: FaseKey
  naam: string
  afdeling: Afdeling
  start: ISODate
  eind: ISODate // inclusief
  uren: number // geplande inspanning (0 voor externe fases)
  teamId?: string // interne fases
  externePartijId?: string // spuiter- of onderaannemersfases
  afhankelijkVan: string[] // fase-ids binnen hetzelfde project
  status: FaseStatus
  voortgang: number // 0-100
  blokkadeNotitie?: string
  notities?: string
  werkpakketten: Werkpakket[]
  transportHeen?: ISODate // alleen spuiterfase
  transportTerug?: ISODate
}

// ---------- Medewerkers & teams ----------

export interface TijdelijkeToewijzing {
  teamId: string
  van: ISODate
  tot: ISODate
  reden?: string
}

export interface Medewerker {
  id: string
  naam: string
  functie: string
  afdeling: Afdeling
  vaardigheden: string[]
  contracturen: number // per week
  beschikbaarheidPct: number // structureel, 0-100
  teamId?: string // primair team; leeg = geen team (bijv. productieleider)
  tijdelijkTeam?: TijdelijkeToewijzing
  actief: boolean
}

export interface Team {
  id: string
  naam: string
  afdeling: Afdeling
  productieleiderId?: string // medewerker-id
  vaardigheden: string[] // benodigde vaardigheden
}

// ---------- Afwezigheid & beschikbaarheid ----------

export type AfwezigheidType = 'vakantie' | 'ziekte' | 'kort_verzuim' | 'bijzonder_verlof' | 'training' | 'overig'

export const AFWEZIGHEID_LABELS: Record<AfwezigheidType, string> = {
  vakantie: 'Vakantie',
  ziekte: 'Ziekte',
  kort_verzuim: 'Kort verzuim',
  bijzonder_verlof: 'Bijzonder verlof',
  training: 'Training',
  overig: 'Overig',
}

export type AfwezigheidStatus = 'concept' | 'goedgekeurd' | 'geregistreerd'

export const AFWEZIGHEID_STATUS_LABELS: Record<AfwezigheidStatus, string> = {
  concept: 'Concept',
  goedgekeurd: 'Goedgekeurd',
  geregistreerd: 'Geregistreerd',
}

export interface Afwezigheid {
  id: string
  medewerkerId: string
  type: AfwezigheidType
  van: ISODate
  tot: ISODate
  dagdeel: 'heel' | 'ochtend' | 'middag'
  status: AfwezigheidStatus
  notitie?: string
}

/** Tijdelijke aanpassing van het beschikbaarheidspercentage (bijv. tijdelijk 80%). */
export interface BeschikbaarheidAanpassing {
  id: string
  medewerkerId: string
  van: ISODate
  tot: ISODate
  pct: number // tijdelijk beschikbaarheidspercentage 0-100
  reden: string
}

// ---------- Externe partijen ----------

export type ExternType =
  | 'spuiter'
  | 'airco'
  | 'interieur'
  | 'elektro'
  | 'audiovideo'
  | 'sanitair'
  | 'wrapping'
  | 'transport'
  | 'overig'

export const EXTERN_TYPE_LABELS: Record<ExternType, string> = {
  spuiter: 'Externe spuiter',
  airco: 'Aircopartner',
  interieur: 'Interieurbouwer',
  elektro: 'Elektrotechnische partner',
  audiovideo: 'Audio- en videopartner',
  sanitair: 'Sanitaire installatie',
  wrapping: 'Wrapping- en signingpartner',
  transport: 'Transporteur',
  overig: 'Overige onderaannemer',
}

/** Label voor een partnertype: bekende types via EXTERN_TYPE_LABELS, eigen types letterlijk. */
export function externTypeLabel(type: string): string {
  return (EXTERN_TYPE_LABELS as Record<string, string>)[type] ?? type
}

export interface ExternePartij {
  id: string
  naam: string
  /** Bekend ExternType of een zelf toegevoegd partnertype. */
  type: string
  specialisme: string
  contactpersoon: string
  email?: string
  telefoon?: string
  adres?: string
  /** Vrije beschrijving van de beschikbaarheid (bijv. "vanaf week 34"). */
  beschikbaarheid?: string
  slotsPerWeek: number // gelijktijdige projecten / capaciteit
  standaardDoorlooptijdDagen?: number
  vertragingDagen: number // actuele gemelde vertraging in werkdagen
  status: 'beschikbaar' | 'vol' | 'vertraagd'
  gearchiveerd?: boolean
  notities?: string
}

// ---------- Producttemplates ----------

/** Bekende trailertypes (herbruikbaar in wizard en templates; vrij uitbreidbaar). */
export const TRAILERTYPES: string[] = ['E7P', 'E9P', 'E11H', 'E13T', 'E13H', 'E16H', 'E16TU', 'E16HU']

/** Configureerbaar complexiteitsniveau (naam en aanduiding aanpasbaar in instellingen). */
export interface ComplexiteitNiveau {
  id: string
  naam: string // 'Standaard'
  aanduiding: string // 'lage complexiteit'
  volgorde: number
}

export const STANDAARD_COMPLEXITEITSNIVEAUS: ComplexiteitNiveau[] = [
  { id: 'standaard', naam: 'Standaard', aanduiding: 'lage complexiteit', volgorde: 1 },
  { id: 'uitgebreid', naam: 'Uitgebreid', aanduiding: 'gemiddelde complexiteit', volgorde: 2 },
  { id: 'maatwerk', naam: 'Maatwerk', aanduiding: 'hoge complexiteit', volgorde: 3 },
]

export type TemplateStatus = 'concept' | 'gepubliceerd' | 'gearchiveerd'

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  concept: 'Concept',
  gepubliceerd: 'Gepubliceerd',
  gearchiveerd: 'Gearchiveerd',
}

/** Blauwdruk van één taak binnen een templatefase. */
export interface TemplateTaak {
  id: string
  naam: string
  omschrijving?: string
  uren: number
  duurWerkdagen: number
  /** Standaard startmoment (werkdagen) t.o.v. de start van de fase. */
  startOffsetWerkdagen: number
  /** Ids van template-taken (binnen ditzelfde template) waarvan deze taak afhankelijk is. */
  afhankelijkVan: string[]
  afdeling: Afdeling
  standaardTeamId?: string
  vaardigheden: string[]
  aantalMedewerkers: number
  optioneel: boolean
  volgorde: number
}

/** Blauwdruk van één fase binnen een template. */
export interface TemplateFase {
  id: string
  key: FaseKey
  naam: string
  afdeling: Afdeling
  doorlooptijdWerkdagen: number
  volgorde: number
  taken: TemplateTaak[]
}

export interface ProductTemplate {
  id: string // interne technische id (versie-specifiek)
  trailertype: string // 'E13H'
  complexiteitId: string // verwijst naar ComplexiteitNiveau.id
  naam: string // bijv. 'E13H · Maatwerk'
  omschrijving?: string
  versie: number
  status: TemplateStatus
  geldigVanaf?: ISODate
  fases: TemplateFase[]
  opmerkingen?: string
  gewijzigdOp: ISODate
  gewijzigdDoor: string
  /** Notitie bij de laatste wijziging/versie. */
  wijzigingsnotitie?: string
}

// ---------- Instellingen & scenario's ----------

export type ScenarioMode = 'definitief' | 'definitief_schaduw' | 'kansgewogen'

export const SCENARIO_LABELS: Record<ScenarioMode, string> = {
  definitief: 'Alleen definitief',
  definitief_schaduw: 'Definitief + schaduw',
  kansgewogen: 'Definitief + kansgewogen',
}

export interface Instellingen {
  /** Aantal werkdagen dat panelenbouw eerder mag starten dan het einde van chassisbouw. */
  chassisPanelenOverlapDagen: number
  standaardScenario: ScenarioMode
  /** Standaard doorlooptijd per fase in werkdagen (voor nieuwe projecten). */
  doorlooptijden: Record<Exclude<FaseKey, 'salesoverdracht'>, number>
}

// ---------- Locaties, zones & fysieke plaatsen ----------

export interface Locatie {
  id: string // 'loc-mh25'
  naam: string // 'MH25 – Expandable Projects'
  adres?: string
  functie: string
  volgorde: number
}

export interface Zone {
  id: string // 'z-afbouw'
  locatieId: string
  naam: string // 'Afbouw'
  volgorde: number
}

export interface Plaats {
  id: string // 'pl-afbouw-01'
  zoneId: string
  naam: string // 'Afbouw 01'
  volgorde: number
}

// ---------- Units (fysieke trailers) ----------

export type UnitStatus =
  | 'niet_gestart'
  | 'in_chassisbouw'
  | 'wacht_panelenbouw'
  | 'in_panelenbouw'
  | 'wacht_spuiter'
  | 'bij_spuiter'
  | 'wacht_afbouw'
  | 'in_afbouw'
  | 'in_kwaliteitscontrole'
  | 'productie_voltooid'
  | 'in_opslag'
  | 'wacht_afhaling'
  | 'opgeleverd'
  | 'geblokkeerd'

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  niet_gestart: 'Nog niet gestart',
  in_chassisbouw: 'In chassisbouw',
  wacht_panelenbouw: 'Wacht op panelenbouw',
  in_panelenbouw: 'In panelenbouw',
  wacht_spuiter: 'Wacht op externe spuiter',
  bij_spuiter: 'Bij externe spuiter',
  wacht_afbouw: 'Wacht op afbouw',
  in_afbouw: 'In afbouw',
  in_kwaliteitscontrole: 'In kwaliteitscontrole',
  productie_voltooid: 'Productie voltooid',
  in_opslag: 'In opslag',
  wacht_afhaling: 'Wacht op afhaling',
  opgeleverd: 'Opgeleverd',
  geblokkeerd: 'Geblokkeerd',
}

export interface Unit {
  /** Interne database-id (nooit zichtbaar voor de gebruiker). */
  id: string
  /**
   * Binnen Expandable is het PR-nummer van het gekoppelde project de enige
   * identificatie van de trailer. Er is geen apart unit-/serienummer.
   * (`legacyUnitnummer` bestaat alleen om oudere localStorage-data niet te laten crashen.)
   */
  legacyUnitnummer?: string
  projectId?: string // max één project per trailer, max één trailer per project
  status: UnitStatus
  /** Huidige fysieke plaats; leeg = geen plaats (bijv. bij externe spuiter, wachtrij of opgeleverd). */
  plaatsId?: string
  /** Externe partij waar de unit fysiek staat (alleen bij status bij_spuiter). */
  bijExternePartijId?: string
  opPlaatsSinds?: ISODate
  geplandeVertrekdatum?: ISODate
  vorigePlaatsId?: string
  /** Bewuste afwijking: fysieke locatie komt niet overeen met de projectplanning. */
  afwijkingVanPlanning?: boolean
  notities?: string
  opgehaaldOp?: ISODate
  transporteur?: string
}

/** Registratie van één fysieke verplaatsing (locatiehistorie). */
export interface LocatieMutatie {
  id: string
  unitId: string // interne trailer-id
  /** PR-nummer van de betrokken trailer/project (primaire identificatie in de historie). */
  projectnummer?: string
  vanLabel: string // bijv. 'MH207 · Chassisbouw · Chassis 02' of 'Externe spuiter' of '—'
  naarLabel: string
  tijdstip: string // ISO-datetime
  gebruiker: string
  reden?: string
  opmerking?: string
  faseAangepast: boolean
}

/** Standaardredenen voor een verplaatsing. */
export const VERPLAATS_REDENEN: string[] = [
  'Chassisbouw afgerond',
  'Verplaatst naar panelenbouw',
  'Panelenbouw afgerond',
  'Terug van externe spuiter',
  'Afbouw kan starten',
  'Tijdelijk naar opslag',
  'Wacht op vrije productieplaats',
  'Productie voltooid',
  'Wacht op afhaling',
  'Capaciteitswijziging',
  'Handmatige correctie',
]

// ---------- Notities, historie & bestanden ----------

export type NotitieNiveau = 'project' | 'fase' | 'proces' | 'taak'

export interface ProjectNotitie {
  id: string
  projectId: string
  niveau: NotitieNiveau
  /** Fase-, proces- of taak-id (leeg bij projectniveau). */
  doelId?: string
  /** Denormalized label van het doel, zodat de notitie leesbaar blijft na verwijderen. */
  doelNaam?: string
  tekst: string
  tijdstip: string // ISO-datetime
  auteur: string
  medewerkerId?: string
  partijId?: string
  belangrijk?: boolean
}

/** Traceerbaar historie-item van een belangrijke projectwijziging. */
export interface ProjectHistorieItem {
  id: string
  projectId: string
  tijdstip: string // ISO-datetime
  gebruiker: string
  wijziging: string
  oudeWaarde?: string
  nieuweWaarde?: string
}

/** Metadata van een bijlage; de bestandsinhoud zelf staat in IndexedDB (zie lib/bestanden.ts). */
export interface BestandMeta {
  id: string
  naam: string
  type: string // MIME-type
  grootte: number // bytes
  uploadOp: string // ISO-datetime
  door: string
  projectId: string
  faseId?: string
  procesId?: string
  taakId?: string
  partijId?: string
  omschrijving?: string
  /** False wanneer alleen metadata kon worden bewaard (bestand niet in IndexedDB). */
  opgeslagen: boolean
}

// ---------- Applicatiestate ----------

export interface AppData {
  projecten: Project[]
  fases: Fase[]
  medewerkers: Medewerker[]
  teams: Team[]
  afwezigheid: Afwezigheid[]
  aanpassingen: BeschikbaarheidAanpassing[]
  externePartijen: ExternePartij[]
  instellingen: Instellingen
  locaties: Locatie[]
  zones: Zone[]
  plaatsen: Plaats[]
  units: Unit[]
  locatieHistorie: LocatieMutatie[]
  templates: ProductTemplate[]
  complexiteitNiveaus: ComplexiteitNiveau[]
  projectNotities: ProjectNotitie[]
  projectHistorie: ProjectHistorieItem[]
  bestanden: BestandMeta[]
  /** Zelf toegevoegde partnertypes (naast de standaard EXTERN_TYPE_LABELS). */
  partnerTypes: string[]
}

export interface UIState {
  personaId: string
  scenario: ScenarioMode
}
