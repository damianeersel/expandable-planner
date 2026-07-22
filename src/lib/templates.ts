// Logica rond producttemplates: afgeleide totalen, versiebeheer, het genereren van
// een zelfstandige projectplanning vanuit een template (volledige kopie, geen referentie)
// en het opslaan van een projectplanning als nieuw concepttemplate.

import type {
  AppData,
  Complexiteit,
  Fase,
  FaseKey,
  ProductTemplate,
  Project,
  TemplateFase,
  TemplateTaak,
  Werkpakket,
} from './types'
import { addDagen, addWerkdagen, isWeekend, vandaagISO, volgendeWerkdag, werkdagenTussen } from './dates'
import { uid } from './uid'

// ---------- Afgeleide totalen ----------

export interface TemplateTotalen {
  aantalFases: number
  aantalTaken: number
  aantalOptioneel: number
  totaleUren: number
  engineeringUren: number
  productieUren: number
  doorlooptijdWerkdagen: number
  benodigdeEngineers: number
  /** Grootste gelijktijdige bezetting die één fase vraagt. */
  piekBezetting: number
}

export function templateTotalen(t: ProductTemplate): TemplateTotalen {
  let aantalTaken = 0
  let aantalOptioneel = 0
  let totaleUren = 0
  let engineeringUren = 0
  let productieUren = 0
  let benodigdeEngineers = 0
  let piekBezetting = 0
  for (const fase of t.fases) {
    let faseBezetting = 0
    for (const taak of fase.taken) {
      aantalTaken += 1
      if (taak.optioneel) aantalOptioneel += 1
      totaleUren += taak.uren
      faseBezetting += taak.aantalMedewerkers
      if (fase.afdeling === 'engineering') {
        engineeringUren += taak.uren
        benodigdeEngineers = Math.max(benodigdeEngineers, taak.aantalMedewerkers)
      } else if (fase.afdeling !== 'extern') {
        productieUren += taak.uren
      }
    }
    piekBezetting = Math.max(piekBezetting, faseBezetting)
  }
  const doorlooptijdWerkdagen = t.fases.reduce((s, f) => s + f.doorlooptijdWerkdagen, 0)
  return {
    aantalFases: t.fases.length,
    aantalTaken,
    aantalOptioneel,
    totaleUren,
    engineeringUren,
    productieUren,
    doorlooptijdWerkdagen,
    benodigdeEngineers,
    piekBezetting,
  }
}

// ---------- Versie- en variantselectie ----------

/** Sleutel die een templatelijn identificeert (los van versie). */
export function templateSleutel(t: Pick<ProductTemplate, 'trailertype' | 'complexiteitId'>): string {
  return `${t.trailertype}::${t.complexiteitId}`
}

/** Meest recent gepubliceerde template voor een trailertype + complexiteit. */
export function laatstGepubliceerd(
  templates: ProductTemplate[],
  trailertype: string,
  complexiteitId: string,
): ProductTemplate | undefined {
  return templates
    .filter((t) => t.trailertype === trailertype && t.complexiteitId === complexiteitId && t.status === 'gepubliceerd')
    .sort((a, b) => b.versie - a.versie)[0]
}

/** Hoogste conceptversie voor een templatelijn (indien aanwezig). */
export function conceptVersie(
  templates: ProductTemplate[],
  trailertype: string,
  complexiteitId: string,
): ProductTemplate | undefined {
  return templates
    .filter((t) => t.trailertype === trailertype && t.complexiteitId === complexiteitId && t.status === 'concept')
    .sort((a, b) => b.versie - a.versie)[0]
}

export function hoogsteVersie(templates: ProductTemplate[], trailertype: string, complexiteitId: string): number {
  return templates
    .filter((t) => t.trailertype === trailertype && t.complexiteitId === complexiteitId)
    .reduce((max, t) => Math.max(max, t.versie), 0)
}

/** Aantal projecten dat een specifieke templateversie gebruikt. */
export function projectenMetTemplate(projecten: Project[], templateId: string): number {
  return projecten.filter((p) => p.templateId === templateId).length
}

// ---------- Verschil met de standaardvariant ----------

export interface TemplateVerschil {
  taken: number
  engineeringUren: number
  productiedagen: number
  reviews: number
}

const REVIEW_TREFWOORDEN = ['review', 'controle', 'vrijgave', 'goedkeuring', 'inspectie', 'keuring']

function aantalReviews(t: ProductTemplate): number {
  let n = 0
  for (const f of t.fases)
    for (const taak of f.taken)
      if (REVIEW_TREFWOORDEN.some((w) => taak.naam.toLowerCase().includes(w))) n += 1
  return n
}

/** Verschil van `t` ten opzichte van de standaardvariant van hetzelfde trailertype. */
export function verschilMetStandaard(
  templates: ProductTemplate[],
  t: ProductTemplate,
  standaardComplexiteitId = 'standaard',
): TemplateVerschil | undefined {
  if (t.complexiteitId === standaardComplexiteitId) return undefined
  const basis =
    laatstGepubliceerd(templates, t.trailertype, standaardComplexiteitId) ??
    templates
      .filter((x) => x.trailertype === t.trailertype && x.complexiteitId === standaardComplexiteitId)
      .sort((a, b) => b.versie - a.versie)[0]
  if (!basis) return undefined
  const a = templateTotalen(t)
  const b = templateTotalen(basis)
  return {
    taken: a.aantalTaken - b.aantalTaken,
    engineeringUren: a.engineeringUren - b.engineeringUren,
    productiedagen: a.doorlooptijdWerkdagen - b.doorlooptijdWerkdagen,
    reviews: aantalReviews(t) - aantalReviews(basis),
  }
}

// ---------- Kloneren & versiebeheer ----------

function kloonTaken(taken: TemplateTaak[]): { taken: TemplateTaak[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>()
  const kopie = taken.map((taak) => {
    const nieuweId = uid('ttaak')
    idMap.set(taak.id, nieuweId)
    return { ...taak, id: nieuweId, vaardigheden: [...taak.vaardigheden], afhankelijkVan: [...taak.afhankelijkVan] }
  })
  // Afhankelijkheden binnen de fase omzetten naar de nieuwe ids.
  for (const taak of kopie) {
    taak.afhankelijkVan = taak.afhankelijkVan.map((oud) => idMap.get(oud) ?? oud)
  }
  return { taken: kopie, idMap }
}

export function kloonFases(fases: TemplateFase[]): TemplateFase[] {
  return fases.map((fase) => ({ ...fase, id: uid('tfase'), taken: kloonTaken(fase.taken).taken }))
}

/** Nieuwe conceptversie op basis van een bestaand template (fases diep gekopieerd). */
export function nieuweVersieVan(
  bron: ProductTemplate,
  templates: ProductTemplate[],
  gebruiker: string,
  notitie?: string,
): ProductTemplate {
  const versie = hoogsteVersie(templates, bron.trailertype, bron.complexiteitId) + 1
  return {
    ...bron,
    id: uid('tmpl'),
    versie,
    status: 'concept',
    fases: kloonFases(bron.fases),
    gewijzigdOp: vandaagISO(),
    gewijzigdDoor: gebruiker,
    wijzigingsnotitie: notitie,
  }
}

/** Volledige duplicaat als nieuw template (bijv. nieuwe complexiteitsvariant). */
export function dupliceerTemplate(
  bron: ProductTemplate,
  gebruiker: string,
  overrides: Partial<Pick<ProductTemplate, 'trailertype' | 'complexiteitId' | 'naam'>> = {},
): ProductTemplate {
  return {
    ...bron,
    ...overrides,
    id: uid('tmpl'),
    versie: 1,
    status: 'concept',
    fases: kloonFases(bron.fases),
    gewijzigdOp: vandaagISO(),
    gewijzigdDoor: gebruiker,
    wijzigingsnotitie: 'Gedupliceerd',
  }
}

// ---------- Projectplanning genereren vanuit een template ----------

/**
 * Genereert een zelfstandige set project-fases (met werkpakketten) op basis van een template.
 * De uitgeschakelde optionele taken (op template-taak-id) worden overgeslagen.
 * Panelenbouw mag (instelbaar) overlappen met het einde van chassisbouw.
 */
export function genereerProjectVanTemplate(
  template: ProductTemplate,
  projectId: string,
  startDatum: string,
  data: AppData,
  optioneelUit: Set<string> = new Set(),
): Fase[] {
  const overlap = Math.max(0, data.instellingen.chassisPanelenOverlapDagen)
  const gesorteerd = [...template.fases].sort((a, b) => a.volgorde - b.volgorde)
  const resultaat: Fase[] = []
  let vorigeEind: string | undefined

  for (const tf of gesorteerd) {
    let start: string
    if (!vorigeEind) {
      start = volgendeWerkdag(startDatum)
    } else if (tf.key === 'panelen' && overlap > 0) {
      // Tel overlap-1 werkdagen terug vanaf het einde van de vorige fase.
      let d = vorigeEind
      let geteld = 1
      while (geteld < overlap) {
        d = addDagen(d, -1)
        if (!isWeekend(d)) geteld += 1
      }
      start = volgendeWerkdag(d)
    } else {
      start = volgendeWerkdag(addDagen(vorigeEind, 1))
    }
    const eind = addWerkdagen(start, Math.max(1, tf.doorlooptijdWerkdagen))

    const takenIn = tf.taken
      .filter((taak) => !(taak.optioneel && optioneelUit.has(taak.id)))
      .sort((a, b) => a.volgorde - b.volgorde)

    const werkpakketten: Werkpakket[] = takenIn.map((taak) => ({
      id: uid('wp'),
      naam: taak.naam,
      uren: taak.uren,
      voortgang: 0,
      status: 'gepland',
      taken: [],
      omschrijving: taak.omschrijving,
      templateTaakId: taak.id,
      optioneel: taak.optioneel,
      vaardigheden: [...taak.vaardigheden],
      aantalMedewerkers: taak.aantalMedewerkers,
      extraTaak: false,
    }))

    const faseUren = tf.afdeling === 'extern' ? 0 : werkpakketten.reduce((s, wp) => s + wp.uren, 0)
    const teamId = tf.afdeling === 'extern' ? undefined : bepaalFaseTeam(data, tf, takenIn)
    const externePartijId = tf.key === 'spuiter' ? standaardSpuiter(data) : undefined

    const fase: Fase = {
      id: uid('fase'),
      projectId,
      key: tf.key,
      naam: tf.naam,
      afdeling: tf.afdeling,
      start,
      eind,
      uren: faseUren,
      teamId,
      externePartijId,
      afhankelijkVan: resultaat.length > 0 ? [resultaat[resultaat.length - 1].id] : [],
      status: 'gepland',
      voortgang: 0,
      werkpakketten,
      transportHeen: tf.key === 'spuiter' ? start : undefined,
      transportTerug: tf.key === 'spuiter' ? eind : undefined,
    }
    resultaat.push(fase)
    vorigeEind = eind
  }
  return resultaat
}

/** Meest voorkomende standaardteam onder de taken, met terugval op het eerste team van de afdeling. */
function bepaalFaseTeam(data: AppData, tf: TemplateFase, taken: TemplateTaak[]): string | undefined {
  const tellingen = new Map<string, number>()
  for (const taak of taken) if (taak.standaardTeamId) tellingen.set(taak.standaardTeamId, (tellingen.get(taak.standaardTeamId) ?? 0) + 1)
  let beste: string | undefined
  let max = 0
  for (const [id, n] of tellingen) if (n > max) {
    max = n
    beste = id
  }
  if (beste) return beste
  return data.teams.find((t) => t.afdeling === tf.afdeling)?.id
}

function standaardSpuiter(data: AppData): string | undefined {
  return (
    data.externePartijen.find((e) => e.type === 'spuiter' && e.status === 'beschikbaar')?.id ??
    data.externePartijen.find((e) => e.type === 'spuiter')?.id
  )
}

// ---------- Project opslaan als nieuw template ----------

/**
 * Bouwt een nieuw concepttemplate uit de huidige projectplanning.
 * `taakIds` bepaalt welke werkpakketten worden meegenomen (leeg = alle).
 */
export function projectAlsTemplate(
  data: AppData,
  project: Project,
  fases: Fase[],
  opties: {
    trailertype: string
    complexiteitId: string
    naam: string
    gebruiker: string
    taakIds?: Set<string>
  },
): ProductTemplate {
  const gesorteerd = [...fases].sort((a, b) => (a.start < b.start ? -1 : 1))
  const templateFases: TemplateFase[] = gesorteerd.map((f, i) => {
    const werkdagen = Math.max(1, werkdagenTussen(f.start, f.eind))
    const taken: TemplateTaak[] = f.werkpakketten
      .filter((wp) => !opties.taakIds || opties.taakIds.has(wp.id))
      .map((wp, j) => ({
        id: uid('ttaak'),
        naam: wp.naam,
        omschrijving: wp.omschrijving,
        uren: wp.uren,
        duurWerkdagen: Math.max(1, Math.round(werkdagen / Math.max(1, f.werkpakketten.length))),
        startOffsetWerkdagen: 0,
        afhankelijkVan: [],
        afdeling: f.afdeling,
        standaardTeamId: f.teamId,
        vaardigheden: wp.vaardigheden ?? [],
        aantalMedewerkers: wp.aantalMedewerkers ?? 1,
        optioneel: wp.optioneel ?? false,
        volgorde: j + 1,
      }))
    return {
      id: uid('tfase'),
      key: f.key,
      naam: f.naam,
      afdeling: f.afdeling,
      doorlooptijdWerkdagen: werkdagen,
      volgorde: i + 1,
      taken,
    }
  })
  return {
    id: uid('tmpl'),
    trailertype: opties.trailertype,
    complexiteitId: opties.complexiteitId,
    naam: opties.naam,
    omschrijving: `Afgeleid van project ${project.projectnummer}`,
    versie: 1,
    status: 'concept',
    fases: templateFases,
    gewijzigdOp: vandaagISO(),
    gewijzigdDoor: opties.gebruiker,
    wijzigingsnotitie: `Opgeslagen vanuit ${project.projectnummer}`,
  }
}

// ---------- Complexiteitskoppeling ----------

/** Map een configureerbaar complexiteitsniveau (op volgorde) naar de bestaande project-complexiteit. */
export function naarProjectComplexiteit(volgorde: number): Complexiteit {
  if (volgorde <= 1) return 'eenvoudig'
  if (volgorde === 2) return 'gemiddeld'
  return 'complex'
}

export const HOOFD_FASE_KEYS: Exclude<FaseKey, 'salesoverdracht'>[] = [
  'engineering',
  'chassis',
  'panelen',
  'spuiter',
  'afbouw',
  'kwaliteit',
]
