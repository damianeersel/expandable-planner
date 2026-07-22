// Locatielogica: fysieke plaatsen, zonebezetting, koppeling tussen projectfases en zones,
// unitwaarschuwingen, wachtrij en geplande (voorspelde) bezetting op een datum.

import type {
  AppData,
  Fase,
  FaseKey,
  ISODate,
  Locatie,
  Plaats,
  Project,
  Unit,
  UnitStatus,
  Zone,
} from './types'
import { FASE_VOLGORDE } from './types'
import { addDagen, diffDagen, startVanWeek, vandaagISO } from './dates'
import { projectFases } from './capacity'

// ---------- Vaste zone-ids (aangemaakt in de seed; capaciteit is data-gedreven) ----------

export const ZONE_CHASSIS = 'z-chassis'
export const ZONE_PANELEN = 'z-panelen'
export const ZONE_AFBOUW = 'z-afbouw'
export const ZONE_OPSLAG = 'z-opslag'

/** Productiezones (geen opslag). */
export const PRODUCTIE_ZONES = [ZONE_CHASSIS, ZONE_PANELEN, ZONE_AFBOUW]

// ---------- Opzoekhulpen ----------

export interface PlaatsInfo {
  plaats: Plaats
  zone: Zone
  locatie: Locatie
  /** 'MH207 – Expandable Factory · Chassisbouw · Chassis 02' */
  label: string
  /** 'Chassisbouw · Chassis 02' */
  kortLabel: string
}

export function getPlaatsInfo(data: AppData, plaatsId: string | undefined): PlaatsInfo | undefined {
  if (!plaatsId) return undefined
  const plaats = data.plaatsen.find((p) => p.id === plaatsId)
  if (!plaats) return undefined
  const zone = data.zones.find((z) => z.id === plaats.zoneId)
  if (!zone) return undefined
  const locatie = data.locaties.find((l) => l.id === zone.locatieId)
  if (!locatie) return undefined
  return {
    plaats,
    zone,
    locatie,
    label: `${locatie.naam} · ${zone.naam} · ${plaats.naam}`,
    kortLabel: `${zone.naam} · ${plaats.naam}`,
  }
}

export function unitOpPlaats(data: AppData, plaatsId: string): Unit | undefined {
  return data.units.find((u) => u.plaatsId === plaatsId && u.status !== 'opgeleverd')
}

/** PR-nummer van de trailer (via het gekoppelde project); undefined als er geen project is. */
export function trailerPrNummer(data: AppData, unit: Unit): string | undefined {
  return unit.projectId ? data.projecten.find((p) => p.id === unit.projectId)?.projectnummer : undefined
}

/** Zichtbare trailerbenaming: altijd het PR-nummer, met nette fallback zonder project. */
export function trailerLabel(data: AppData, unit: Unit): string {
  return trailerPrNummer(data, unit) ?? 'Trailer zonder project'
}

export function unitVanProject(data: AppData, projectId: string): Unit | undefined {
  return data.units.find((u) => u.projectId === projectId)
}

export function zonePlaatsen(data: AppData, zoneId: string): Plaats[] {
  return data.plaatsen.filter((p) => p.zoneId === zoneId).sort((a, b) => a.volgorde - b.volgorde)
}

export function zonesVanLocatie(data: AppData, locatieId: string): Zone[] {
  return data.zones.filter((z) => z.locatieId === locatieId).sort((a, b) => a.volgorde - b.volgorde)
}

// ---------- Bezetting ----------

export interface ZoneBezetting {
  zoneId: string
  capaciteit: number
  bezet: number
  vrij: number
  pct: number
  niveau: 'normaal' | 'bijna_vol' | 'vol'
}

export function zoneBezetting(data: AppData, zoneId: string): ZoneBezetting {
  const plaatsen = zonePlaatsen(data, zoneId)
  const bezet = plaatsen.filter((p) => unitOpPlaats(data, p.id)).length
  const capaciteit = plaatsen.length
  const pct = capaciteit > 0 ? Math.round((bezet / capaciteit) * 100) : 0
  return {
    zoneId,
    capaciteit,
    bezet,
    vrij: capaciteit - bezet,
    pct,
    niveau: pct >= 100 ? 'vol' : pct >= 80 ? 'bijna_vol' : 'normaal',
  }
}

export function vrijePlaatsen(data: AppData, zoneId: string): Plaats[] {
  return zonePlaatsen(data, zoneId).filter((p) => !unitOpPlaats(data, p.id))
}

// ---------- Fase ↔ zone ↔ status ----------

/** Standaardrelatie tussen productiefase en fysieke zone (spuiter = extern, geen zone). */
export function faseNaarZone(key: FaseKey): string | undefined {
  switch (key) {
    case 'chassis':
      return ZONE_CHASSIS
    case 'panelen':
      return ZONE_PANELEN
    case 'afbouw':
    case 'kwaliteit':
      return ZONE_AFBOUW
    default:
      return undefined
  }
}

/** Unitstatus die hoort bij "in uitvoering" binnen een zone. */
export function zoneNaarActieveStatus(zoneId: string): UnitStatus {
  if (zoneId === ZONE_CHASSIS) return 'in_chassisbouw'
  if (zoneId === ZONE_PANELEN) return 'in_panelenbouw'
  if (zoneId === ZONE_AFBOUW) return 'in_afbouw'
  return 'in_opslag'
}

/** Zone waarin een unit volgens de PROJECTplanning nu zou moeten staan (undefined = extern of geen). */
export function verwachteZoneVoorProject(data: AppData, projectId: string): string | undefined {
  const fases = projectFases(data, projectId)
  if (fases.length === 0) return undefined
  const actief = fases.find((f) => f.status !== 'gereed')
  if (!actief) return ZONE_OPSLAG // alles gereed → opslag/afhaling
  if (actief.status === 'gepland' && actief.start > vandaagISO()) {
    // De volgende fase is nog niet begonnen: de unit hoort nog bij de laatst afgeronde productiefase.
    const laatsteGereed = [...fases].reverse().find((f) => f.status === 'gereed' && faseNaarZone(f.key))
    return laatsteGereed ? faseNaarZone(laatsteGereed.key) : undefined
  }
  if (actief.key === 'spuiter') return undefined // extern
  if (actief.key === 'engineering' || actief.key === 'salesoverdracht') return undefined // nog geen fysieke bouw
  return faseNaarZone(actief.key)
}

/** Alle productiefases gereed? */
export function productieVoltooid(data: AppData, projectId: string): boolean {
  const fases = projectFases(data, projectId)
  return fases.length > 0 && fases.every((f) => f.status === 'gereed')
}

/** Zone waarin het project volgens de planning op een gegeven datum zit (undefined = extern/geen). */
export function geplandeZoneOpDatum(data: AppData, projectId: string, datum: ISODate): string | undefined {
  const fases = projectFases(data, projectId)
  if (fases.length === 0) return undefined
  const laatste = fases[fases.length - 1]
  if (datum > laatste.eind) return ZONE_OPSLAG
  // Actieve fase op de datum; bij overlap wint de laatste in de fasevolgorde.
  const actief = fases
    .filter((f) => f.start <= datum && f.eind >= datum)
    .sort((a, b) => FASE_VOLGORDE.indexOf(a.key) - FASE_VOLGORDE.indexOf(b.key))
  const fase = actief[actief.length - 1] ?? fases.find((f) => f.start > datum)
  if (!fase) return undefined
  if (fase.key === 'spuiter') return undefined
  if (fase.key === 'engineering' || fase.key === 'salesoverdracht') return undefined
  return faseNaarZone(fase.key)
}

/** Volgende geplande zone + datum voor een unit (op basis van de eerstvolgende fase met een andere zone). */
export function volgendeGeplandeLocatie(
  data: AppData,
  unit: Unit,
): { zoneId: string | undefined; zoneNaam: string; vanaf: ISODate } | undefined {
  if (!unit.projectId) return undefined
  const fases = projectFases(data, unit.projectId).filter((f) => f.status !== 'gereed')
  const huidigeZone = getPlaatsInfo(data, unit.plaatsId)?.zone.id
  for (const f of fases) {
    if (f.key === 'engineering' || f.key === 'salesoverdracht') continue
    const zone = f.key === 'spuiter' ? undefined : faseNaarZone(f.key)
    if (zone !== huidigeZone) {
      const zoneNaam = zone
        ? data.zones.find((z) => z.id === zone)?.naam ?? '—'
        : `Externe spuiter${f.externePartijId ? ` (${data.externePartijen.find((e) => e.id === f.externePartijId)?.naam ?? ''})` : ''}`
      return { zoneId: zone, zoneNaam, vanaf: f.start }
    }
  }
  if (productieVoltooid(data, unit.projectId) && huidigeZone !== ZONE_OPSLAG) {
    return { zoneId: ZONE_OPSLAG, zoneNaam: 'Opslag', vanaf: vandaagISO() }
  }
  return undefined
}

// ---------- Waarschuwingen ----------

export interface UnitWaarschuwing {
  soort: 'afwijking' | 'gereed_bezet' | 'opslagstatus' | 'geen_project' | 'geblokkeerd'
  tekst: string
}

const OPSLAG_STATUSSEN: UnitStatus[] = ['in_opslag', 'wacht_afhaling', 'productie_voltooid']

export function getUnitWaarschuwingen(data: AppData, unit: Unit): UnitWaarschuwing[] {
  const w: UnitWaarschuwing[] = []
  if (unit.status === 'opgeleverd') return w
  const info = getPlaatsInfo(data, unit.plaatsId)
  const project = unit.projectId ? data.projecten.find((p) => p.id === unit.projectId) : undefined

  if (unit.status === 'geblokkeerd') w.push({ soort: 'geblokkeerd', tekst: 'Trailer is geblokkeerd.' })

  if (unit.afwijkingVanPlanning) {
    w.push({ soort: 'afwijking', tekst: 'Fysieke locatie wijkt af van de projectplanning.' })
  } else if (info && project) {
    const verwacht = verwachteZoneVoorProject(data, project.id)
    if (verwacht && verwacht !== info.zone.id && !(verwacht === ZONE_OPSLAG && info.zone.id === ZONE_AFBOUW && !productieVoltooid(data, project.id))) {
      const zoneNaam = data.zones.find((z) => z.id === verwacht)?.naam ?? verwacht
      w.push({
        soort: 'afwijking',
        tekst: `Volgens de projectplanning hoort deze trailer in ${zoneNaam}, maar staat fysiek in ${info.zone.naam}.`,
      })
    }
  }

  if (project && productieVoltooid(data, project.id) && info && PRODUCTIE_ZONES.includes(info.zone.id)) {
    w.push({ soort: 'gereed_bezet', tekst: 'Productie is voltooid, maar de trailer bezet nog een productieplaats.' })
  }

  if (info?.zone.id === ZONE_OPSLAG && !OPSLAG_STATUSSEN.includes(unit.status)) {
    w.push({ soort: 'opslagstatus', tekst: `Trailer staat in Opslag maar heeft status “${unit.status === 'niet_gestart' ? 'Nog niet gestart' : 'geen opslagstatus'}”.` })
  }

  if (info && PRODUCTIE_ZONES.includes(info.zone.id) && (!project || ['opgeleverd', 'geannuleerd'].includes(project.status))) {
    w.push({ soort: 'geen_project', tekst: 'Trailer bezet een productieplaats zonder gekoppeld actief project.' })
  }

  return w
}

// ---------- Wachtrij ----------

export interface WachtrijItem {
  unit: Unit
  project?: Project
  gewensteZoneId?: string
  gewensteZoneNaam: string
  gewensteDatum?: ISODate
  reden: string
  prioriteit: 'laag' | 'normaal' | 'hoog'
}

/** Units die aandacht van de planner vragen: zonder plaats, of binnenkort naar een andere zone. */
export function getWachtrij(data: AppData): WachtrijItem[] {
  const items: WachtrijItem[] = []
  const overTweeWeken = addDagen(vandaagISO(), 14)
  for (const unit of data.units) {
    if (unit.status === 'opgeleverd') continue
    const project = unit.projectId ? data.projecten.find((p) => p.id === unit.projectId) : undefined

    if (!unit.plaatsId) {
      // Geen fysieke plaats: bij spuiter (retour gepland) of wachtend op een plek.
      let gewenst = project ? verwachteZoneVoorProject(data, project.id) : undefined
      let datum = unit.geplandeVertrekdatum
      let reden = 'Nog geen fysieke plaats toegewezen'
      if (unit.status === 'bij_spuiter' && project) {
        const spuiter = projectFases(data, project.id).find((f) => f.key === 'spuiter')
        datum = spuiter?.transportTerug ?? spuiter?.eind
        const volgende = projectFases(data, project.id).find((f) => f.start > (spuiter?.eind ?? '') && f.key !== 'spuiter')
        gewenst = volgende ? faseNaarZone(volgende.key) : ZONE_AFBOUW
        reden = 'Komt terug van externe spuiter'
      }
      const zoneNaam = gewenst ? data.zones.find((z) => z.id === gewenst)?.naam ?? '—' : '—'
      const vrij = gewenst ? vrijePlaatsen(data, gewenst).length : 0
      items.push({
        unit,
        project,
        gewensteZoneId: gewenst,
        gewensteZoneNaam: zoneNaam,
        gewensteDatum: datum,
        reden: gewenst && vrij === 0 ? `${reden} — ${zoneNaam} is vol` : reden,
        prioriteit: project?.prioriteit ?? 'normaal',
      })
      continue
    }

    // Wel een plaats, maar binnen 2 weken gepland naar een andere zone.
    const volgende = volgendeGeplandeLocatie(data, unit)
    if (volgende && volgende.vanaf <= overTweeWeken) {
      const vrij = volgende.zoneId ? vrijePlaatsen(data, volgende.zoneId).length : 1
      items.push({
        unit,
        project,
        gewensteZoneId: volgende.zoneId,
        gewensteZoneNaam: volgende.zoneNaam,
        gewensteDatum: volgende.vanaf,
        reden:
          volgende.zoneId && vrij === 0
            ? `Geplande verplaatsing naar ${volgende.zoneNaam}, maar er is nog geen vrije plaats`
            : `Binnenkort naar ${volgende.zoneNaam}`,
        prioriteit: project?.prioriteit ?? 'normaal',
      })
    }
  }
  const orde = { hoog: 0, normaal: 1, laag: 2 }
  return items.sort((a, b) => orde[a.prioriteit] - orde[b.prioriteit] || (a.gewensteDatum ?? '9999') .localeCompare(b.gewensteDatum ?? '9999'))
}

// ---------- Verwachte aankomsten & vertrekken ----------

/** Units die volgens de planning in [van, tot] in deze zone aankomen resp. eruit vertrekken. */
export function zoneStromen(
  data: AppData,
  zoneId: string,
  van: ISODate,
  tot: ISODate,
): { aankomsten: Unit[]; vertrekken: Unit[] } {
  const aankomsten: Unit[] = []
  const vertrekken: Unit[] = []
  for (const unit of data.units) {
    if (unit.status === 'opgeleverd' || !unit.projectId) continue
    const huidigeZone = getPlaatsInfo(data, unit.plaatsId)?.zone.id
    const volgende = volgendeGeplandeLocatie(data, unit)
    if (volgende && volgende.vanaf >= van && volgende.vanaf <= tot) {
      if (volgende.zoneId === zoneId && huidigeZone !== zoneId) aankomsten.push(unit)
      if (huidigeZone === zoneId && volgende.zoneId !== zoneId) vertrekken.push(unit)
    }
  }
  return { aankomsten, vertrekken }
}

/** Waarschuwing als er in de komende periode meer aankomsten dan vrije plaatsen zijn. */
export function zoneCapaciteitsConflict(data: AppData, zoneId: string): string | undefined {
  const vandaag = vandaagISO()
  const { aankomsten, vertrekken } = zoneStromen(data, zoneId, vandaag, addDagen(vandaag, 14))
  const bezetting = zoneBezetting(data, zoneId)
  const beschikbaar = bezetting.vrij + vertrekken.length
  if (aankomsten.length > beschikbaar) {
    const zone = data.zones.find((z) => z.id === zoneId)
    return `${zone?.naam ?? zoneId} heeft de komende 2 weken ${beschikbaar} vrije plaats(en), maar ${aankomsten.length} geplande aankomst(en).`
  }
  return undefined
}

// ---------- Geplande bezetting op een datum ----------

export interface GeplandeUnitPositie {
  unit: Unit
  project?: Project
  zoneId: string | undefined // undefined = extern (spuiter) of opgeleverd
  /** Plaats alleen ingevuld als de unit naar verwachting op zijn huidige plek blijft. */
  plaatsId?: string
  extern: boolean
}

/**
 * Voorspelde posities op een toekomstige datum, afgeleid uit de faseplanning.
 * Units behouden hun plaats zolang de zone gelijk blijft; bij een zonewissel is
 * alleen de doelzone bekend (nog geen specifieke plaats).
 */
export function geplandeBezettingOpDatum(data: AppData, datum: ISODate): GeplandeUnitPositie[] {
  const posities: GeplandeUnitPositie[] = []
  for (const unit of data.units) {
    if (unit.status === 'opgeleverd') continue
    const project = unit.projectId ? data.projecten.find((p) => p.id === unit.projectId) : undefined
    if (!project) {
      // Zonder project blijft een unit waar hij staat.
      const zone = getPlaatsInfo(data, unit.plaatsId)?.zone.id
      posities.push({ unit, zoneId: zone, plaatsId: unit.plaatsId, extern: false })
      continue
    }
    const spuiterFase = projectFases(data, project.id).find(
      (f) => f.key === 'spuiter' && f.start <= datum && f.eind >= datum,
    )
    if (spuiterFase) {
      posities.push({ unit, project, zoneId: undefined, extern: true })
      continue
    }
    const zone = geplandeZoneOpDatum(data, project.id, datum)
    const huidigeZone = getPlaatsInfo(data, unit.plaatsId)?.zone.id
    posities.push({
      unit,
      project,
      zoneId: zone ?? huidigeZone,
      plaatsId: zone === undefined || zone === huidigeZone ? unit.plaatsId : undefined,
      extern: false,
    })
  }
  return posities
}

// ---------- Overige hulpen ----------

export function dagenOpPlaats(unit: Unit): number {
  if (!unit.opPlaatsSinds) return 0
  return Math.max(0, diffDagen(unit.opPlaatsSinds, vandaagISO()))
}

/** Aankomsten/vertrekken in de huidige week (ma t/m zo) voor een zone. */
export function zoneStromenDezeWeek(data: AppData, zoneId: string) {
  const maandag = startVanWeek(vandaagISO())
  return zoneStromen(data, zoneId, maandag, addDagen(maandag, 6))
}

