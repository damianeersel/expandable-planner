// Standaard faseplanning voor nieuwe projecten (gebruikt door de wizard en de seed).

import type { Complexiteit, Fase, FaseKey, Instellingen, ISODate, Werkpakket } from './types'
import { FASE_LABELS } from './types'
import { addDagen, addWerkdagen, isWeekend, volgendeWerkdag } from './dates'
import { uid } from './uid'

export const COMPLEXITEIT_FACTOR: Record<Complexiteit, number> = {
  eenvoudig: 0.8,
  gemiddeld: 1,
  complex: 1.3,
}

export const STANDAARD_UREN: Record<Exclude<FaseKey, 'salesoverdracht' | 'spuiter'>, number> = {
  engineering: 140,
  chassis: 300,
  panelen: 320,
  afbouw: 400,
  kwaliteit: 40,
}

export const WERKPAKKET_TEMPLATES: Record<Exclude<FaseKey, 'salesoverdracht'>, string[]> = {
  engineering: ['Technische intake & requirements', 'Technische tekeningen', 'Engineering maatwerk', 'Bill of Materials', 'Interne goedkeuring & vrijgave'],
  chassis: ['Chassisconstructie & lassen', 'Assen en wielconstructie', 'Hydrauliek', 'Stabilisatie & leveling', 'Technische controle & vrijgave'],
  panelen: ['Vloerpanelen', 'Wandpanelen & dak', 'Ramen en deuren', 'Uitschuifbare elementen', 'Afdichting & kwaliteitscontrole'],
  spuiter: ['Transport heen', 'Voorbehandeling & spuitwerk', 'Transport terug'],
  afbouw: ['Elektrische installatie & verlichting', 'Klimaat (airco/verwarming)', 'Interieurbouw & meubilair', 'Audio/video & keuken', 'Branding & wrapping', 'Testen installaties'],
  kwaliteit: ['Eindcontrole & functionele test', 'Opleverpuntenlijst & herstel', 'Klantoplevering'],
}

export function maakWerkpakketten(key: Exclude<FaseKey, 'salesoverdracht'>, totaalUren: number): Werkpakket[] {
  const namen = WERKPAKKET_TEMPLATES[key]
  const per = namen.length > 0 ? Math.round(totaalUren / namen.length) : 0
  return namen.map((naam) => ({ id: uid('wp'), naam, uren: per, voortgang: 0, status: 'gepland' }))
}

/**
 * Genereert de standaard fasereeks voor een nieuw project vanaf een startdatum.
 * Panelenbouw mag (instelbaar) overlappen met het einde van chassisbouw.
 */
export function maakStandaardFases(
  projectId: string,
  startDatum: ISODate,
  complexiteit: Complexiteit,
  instellingen: Instellingen,
): Fase[] {
  const factor = COMPLEXITEIT_FACTOR[complexiteit]
  const d = instellingen.doorlooptijden
  const fases: Fase[] = []

  const dagen = (basis: number) => Math.max(3, Math.round(basis * factor))
  const uren = (basis: number) => Math.round(basis * factor)

  const maak = (
    key: Exclude<FaseKey, 'salesoverdracht'>,
    start: ISODate,
    doorlooptijd: number,
    faseUren: number,
    afhankelijkVan: string[],
  ): Fase => {
    const s = volgendeWerkdag(start)
    const fase: Fase = {
      id: uid('fase'),
      projectId,
      key,
      naam: FASE_LABELS[key],
      afdeling: key === 'spuiter' ? 'extern' : key,
      start: s,
      eind: addWerkdagen(s, doorlooptijd),
      uren: faseUren,
      afhankelijkVan,
      status: 'gepland',
      voortgang: 0,
      werkpakketten: maakWerkpakketten(key, faseUren),
    }
    return fase
  }

  const eng = maak('engineering', startDatum, dagen(d.engineering), uren(STANDAARD_UREN.engineering), [])
  fases.push(eng)

  const chassis = maak('chassis', addDagen(eng.eind, 1), dagen(d.chassis), uren(STANDAARD_UREN.chassis), [eng.id])
  fases.push(chassis)

  // Panelenbouw start (instelbaar) een aantal werkdagen vóór het einde van chassisbouw.
  // De start wordt zo gekozen dat de overlap in wérkdagen (incl. beide eindpunten) exact
  // gelijk is aan de instelling, zodat de afhankelijkheidscontrole geen vals alarm geeft.
  const overlap = Math.max(0, instellingen.chassisPanelenOverlapDagen)
  let panelenStart = addDagen(chassis.eind, 1)
  if (overlap > 0) {
    let d = chassis.eind
    let geteld = 1
    while (geteld < overlap) {
      d = addDagen(d, -1)
      if (!isWeekend(d)) geteld += 1
    }
    panelenStart = d
  }
  const panelen = maak('panelen', panelenStart, dagen(d.panelen), uren(STANDAARD_UREN.panelen), [chassis.id])
  fases.push(panelen)

  const spuiter = maak('spuiter', addDagen(panelen.eind, 3), dagen(d.spuiter), 0, [panelen.id])
  spuiter.transportHeen = spuiter.start
  spuiter.transportTerug = spuiter.eind
  fases.push(spuiter)

  const afbouw = maak('afbouw', addDagen(spuiter.eind, 1), dagen(d.afbouw), uren(STANDAARD_UREN.afbouw), [spuiter.id])
  fases.push(afbouw)

  const kwaliteit = maak('kwaliteit', addDagen(afbouw.eind, 1), dagen(d.kwaliteit), uren(STANDAARD_UREN.kwaliteit), [afbouw.id])
  kwaliteit.afdeling = 'kwaliteit'
  fases.push(kwaliteit)

  return fases
}

export const STANDAARD_INSTELLINGEN: Instellingen = {
  chassisPanelenOverlapDagen: 5,
  standaardScenario: 'kansgewogen',
  doorlooptijden: {
    engineering: 15,
    chassis: 18,
    panelen: 18,
    spuiter: 8,
    afbouw: 22,
    kwaliteit: 5,
  },
}
