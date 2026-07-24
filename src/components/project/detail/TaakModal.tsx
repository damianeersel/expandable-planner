// Brede modal om een taak toe te voegen of te bewerken: plek in het project (fase/proces),
// toewijzing met urenverdeling, planning, afhankelijkheden, vaardigheden, extern partnerblok
// en informatieve capaciteitswaarschuwingen. Bij een verschoven einddatum met afhankelijke
// taken opent eerst de VerschuifDialoog.

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import type { Afdeling, ExterneActieStatus, Fase, ISODate, Medewerker, Prioriteit, Project, Taak } from '../../../lib/types'
import { afdelingLabel, AFDELING_LABELS, EXTERNE_ACTIE_LABELS, PRIORITEIT_LABELS } from '../../../lib/types'
import {
  addDagen,
  diffDagen,
  formatDatum,
  maxISO,
  overlapWerkdagen,
  startVanWeek,
  vandaagISO,
  weekNummer,
  weekReeks,
  werkdagenTussen,
} from '../../../lib/dates'
import {
  afhankelijkeTaken,
  alleProjectTaken,
  medewerkerTaakUrenInWeek,
  ontbrekendeVaardigheden,
  taakPeriode,
  urenPerUitvoerende,
  type TaakPlek,
} from '../../../lib/taken'
import {
  bezettingsPct,
  getVerwachteOplevering,
  medewerkerAfwezigInWeek,
  medewerkerBeschikbaarInWeek,
  projectFases,
} from '../../../lib/capacity'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { Invoer, Keuze, Knop, Modal, Tekstvak, Veld, useToast } from '../../ui'
import { SegmentKeuze } from './gedeeld'
import NieuwePartnerModal from './NieuwePartnerModal'
import VerschuifDialoog from './VerschuifDialoog'

const NIEUWE_PARTNER = '__nieuwe_partner'

type Historie = { wijziging: string; oud?: string; nieuw?: string }

interface Props {
  open: boolean
  project: Project
  /** Bestaande taak (met plek); leeg = nieuwe taak. */
  plek?: TaakPlek
  /** Voorselectie voor een nieuwe taak. */
  initFaseId?: string
  initWpId?: string
  /** Open de modal gescrold naar de toewijzingssectie. */
  focusToewijzing?: boolean
  onSluiten: () => void
}

// ---------- Hulpfuncties ----------

/** Maandagen van alle weken die (deels) binnen de periode vallen (max 26 weken). */
function wekenInPeriode(start: ISODate, eind: ISODate): ISODate[] {
  if (!start || !eind || eind < start) return start ? [startVanWeek(start)] : []
  const eerste = startVanWeek(start)
  const aantal = Math.max(1, Math.min(26, Math.floor(diffDagen(eerste, eind) / 7) + 1))
  return weekReeks(eerste, aantal)
}

/** Uren-aandeel van één medewerker in één week voor deze taak (uren gespreid over de werkdagen). */
function bijdrageInWeek(taak: Taak, fase: Fase, medewerkerId: string, week: ISODate): number {
  if (taak.status === 'gereed') return 0
  if (!taak.uitvoerendeIds.includes(medewerkerId)) return 0
  const { start, eind } = taakPeriode(taak, fase)
  const totaal = werkdagenTussen(start, eind)
  if (totaal <= 0) return 0
  const overlap = overlapWerkdagen(start, eind, week, addDagen(week, 4))
  if (overlap <= 0) return 0
  const eigen = urenPerUitvoerende(taak)[medewerkerId] ?? 0
  return (eigen * overlap) / totaal
}

/** De taak zelf plus alle taken die er (transitief) van afhankelijk zijn — uitgesloten als afhankelijkheid. */
function metTransitieveAfhankelijken(alle: TaakPlek[], taakId: string): Set<string> {
  const res = new Set<string>([taakId])
  let gewijzigd = true
  while (gewijzigd) {
    gewijzigd = false
    for (const p of alle) {
      if (res.has(p.taak.id)) continue
      if (p.taak.afhankelijkVan.some((d) => res.has(d))) {
        res.add(p.taak.id)
        gewijzigd = true
      }
    }
  }
  return res
}

/** Fase-ids die (transitief) afhankelijk zijn van de gegeven fase. */
function transitieveFaseAfhankelijken(fases: Fase[], faseId: string): Set<string> {
  const res = new Set<string>()
  let gewijzigd = true
  while (gewijzigd) {
    gewijzigd = false
    for (const f of fases) {
      if (res.has(f.id)) continue
      if (f.afhankelijkVan.some((d) => d === faseId || res.has(d))) {
        res.add(f.id)
        gewijzigd = true
      }
    }
  }
  return res
}

/** Verwachte opleverdatum nadat een fase-eind (met cascade) is verlengd — lokaal vooruitberekend. */
function verwachteOpleveringNa(fases: Fase[], faseId: string, nieuweEind: ISODate): ISODate {
  const bron = fases.find((f) => f.id === faseId)
  if (!bron) return nieuweEind
  const delta = diffDagen(bron.eind, nieuweEind)
  const afhankelijk = transitieveFaseAfhankelijken(fases, faseId)
  let max = nieuweEind
  for (const f of fases) {
    const eind = f.id === faseId ? nieuweEind : afhankelijk.has(f.id) ? addDagen(f.eind, delta) : f.eind
    max = maxISO(max, eind)
  }
  return max
}

const afgerond = (v: number) => Math.round(v * 10) / 10

// ---------- Component ----------

export default function TaakModal({ open, project, plek, initFaseId, initWpId, focusToewijzing, onSluiten }: Props) {
  const { data, dispatch, persona } = useApp()
  const { toon } = useToast()

  const [naam, setNaam] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [faseId, setFaseId] = useState('')
  const [wpId, setWpId] = useState('')
  const [uitvoering, setUitvoering] = useState<'intern' | 'extern'>('intern')
  const [teamId, setTeamId] = useState('')
  const [eigenaarId, setEigenaarId] = useState('')
  const [uitvoerendeIds, setUitvoerendeIds] = useState<string[]>([])
  const [verdelingHandmatig, setVerdelingHandmatig] = useState(false)
  const [verdeling, setVerdeling] = useState<Record<string, string>>({})
  const [uren, setUren] = useState('8')
  const [start, setStart] = useState('')
  const [eind, setEind] = useState('')
  const [prioriteit, setPrioriteit] = useState<Prioriteit>('normaal')
  const [afhankelijkVan, setAfhankelijkVan] = useState<string[]>([])
  const [vaardigheden, setVaardigheden] = useState<string[]>([])
  const [nieuweVaardigheid, setNieuweVaardigheid] = useState('')
  const [blokkade, setBlokkade] = useState('')
  // Extern partnerblok
  const [partijId, setPartijId] = useState('')
  const [contactpersoon, setContactpersoon] = useState('')
  const [actieStatus, setActieStatus] = useState<ExterneActieStatus>('niet_aangevraagd')
  const [aangevraagdOp, setAangevraagdOp] = useState('')
  const [bevestigdOp, setBevestigdOp] = useState('')
  const [slot, setSlot] = useState('')
  const [verwachteRetour, setVerwachteRetour] = useState('')
  const [externNotitie, setExternNotitie] = useState('')
  // Hulpstate
  const [zoek, setZoek] = useState('')
  const [filterAfdeling, setFilterAfdeling] = useState('')
  const [filterVaardigheid, setFilterVaardigheid] = useState('')
  const [fout, setFout] = useState<Record<string, string>>({})
  const [partnerModalOpen, setPartnerModalOpen] = useState(false)
  const [verschuif, setVerschuif] = useState<{
    delta: number
    patch: Partial<Taak>
    historie?: Historie
    nieuwEind: ISODate
    faseVerlengd: boolean
    aantal: number
  } | null>(null)

  const toewijzingRef = useRef<HTMLDivElement>(null)
  const fases = projectFases(data, project.id)
  const doelFase = fases.find((f) => f.id === faseId)
  const procesOpties = doelFase?.werkpakketten ?? []
  const undoActie = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' as const }) }

  useEffect(() => {
    if (!open) return
    setFout({})
    setZoek('')
    setFilterAfdeling('')
    setFilterVaardigheid('')
    setNieuweVaardigheid('')
    setVerschuif(null)
    setPartnerModalOpen(false)
    const t = plek?.taak
    if (plek && t) {
      setNaam(t.naam)
      setOmschrijving(t.omschrijving ?? '')
      setFaseId(plek.fase.id)
      setWpId(plek.proces.id)
      setUitvoering(t.uitvoering)
      setTeamId(t.teamId ?? '')
      setEigenaarId(t.taakEigenaarId ?? '')
      setUitvoerendeIds([...t.uitvoerendeIds])
      const handmatig = !!t.urenPerMedewerker && Object.keys(t.urenPerMedewerker).length > 0
      setVerdelingHandmatig(handmatig)
      setVerdeling(
        handmatig
          ? Object.fromEntries(Object.entries(urenPerUitvoerende(t)).map(([k, v]) => [k, String(afgerond(v))]))
          : {},
      )
      setUren(String(t.uren))
      setStart(t.start ?? '')
      setEind(t.eind ?? '')
      setPrioriteit(t.prioriteit)
      setAfhankelijkVan([...t.afhankelijkVan])
      setVaardigheden([...t.vaardigheden])
      setBlokkade(t.blokkade ?? '')
      setPartijId(t.externeActie?.partijId ?? '')
      setContactpersoon(t.externeActie?.contactpersoon ?? '')
      setActieStatus(t.externeActie?.status ?? 'niet_aangevraagd')
      setAangevraagdOp(t.externeActie?.aangevraagdOp ?? '')
      setBevestigdOp(t.externeActie?.bevestigdOp ?? '')
      setSlot(t.externeActie?.slot ?? '')
      setVerwachteRetour(t.externeActie?.verwachteRetour ?? '')
      setExternNotitie(t.externeActie?.notitie ?? '')
    } else {
      const beginFase = (initFaseId && fases.find((f) => f.id === initFaseId)) || fases[0]
      setNaam('')
      setOmschrijving('')
      setFaseId(beginFase?.id ?? '')
      setWpId(initWpId ?? beginFase?.werkpakketten[0]?.id ?? '')
      setUitvoering('intern')
      setTeamId(beginFase?.teamId ?? '')
      setEigenaarId('')
      setUitvoerendeIds([])
      setVerdelingHandmatig(false)
      setVerdeling({})
      setUren('8')
      setStart('')
      setEind('')
      setPrioriteit('normaal')
      setAfhankelijkVan([])
      setVaardigheden([])
      setBlokkade('')
      setPartijId('')
      setContactpersoon('')
      setActieStatus('niet_aangevraagd')
      setAangevraagdOp('')
      setBevestigdOp('')
      setSlot('')
      setVerwachteRetour('')
      setExternNotitie('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !focusToewijzing) return
    const timer = setTimeout(() => toewijzingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    return () => clearTimeout(timer)
  }, [open, focusToewijzing])

  // ---------- Afgeleiden ----------

  const urenN = Number(uren)
  const gelijkAandeel =
    uitvoerendeIds.length > 0 && Number.isFinite(urenN) && urenN >= 0 ? afgerond(urenN / uitvoerendeIds.length) : 0

  const teams = [...data.teams].sort((a, b) => {
    const pa = a.afdeling === doelFase?.afdeling ? 0 : 1
    const pb = b.afdeling === doelFase?.afdeling ? 0 : 1
    return pa - pb || a.naam.localeCompare(b.naam)
  })
  const actieveMedewerkers = data.medewerkers.filter((m) => m.actief)
  const alleVaardigheden = [...new Set(actieveMedewerkers.flatMap((m) => m.vaardigheden))].sort((a, b) =>
    a.localeCompare(b),
  )
  const medewerkerLijst = actieveMedewerkers
    .filter((m) => !filterAfdeling || m.afdeling === filterAfdeling)
    .filter((m) => !filterVaardigheid || m.vaardigheden.includes(filterVaardigheid))
    .filter((m) => !zoek || m.naam.toLowerCase().includes(zoek.toLowerCase()))
    .sort((a, b) => a.naam.localeCompare(b.naam))
  const gekozenMedewerkers = uitvoerendeIds
    .map((id) => data.medewerkers.find((m) => m.id === id))
    .filter((m): m is Medewerker => !!m)
  const partners = data.externePartijen.filter((p) => !p.gearchiveerd).sort((a, b) => a.naam.localeCompare(b.naam))

  const alleTaken = alleProjectTaken(data, project.id)
  const uitgesloten = plek ? metTransitieveAfhankelijken(alleTaken, plek.taak.id) : new Set<string>()
  const afhOpties = alleTaken.filter((p) => !uitgesloten.has(p.taak.id))

  const periodeStart = start || doelFase?.start || vandaagISO()
  const periodeEind = eind || doelFase?.eind || periodeStart
  const periodeWeken = wekenInPeriode(periodeStart, periodeEind)

  const zachteVerdeling = (): Record<string, number> | undefined => {
    if (uitvoerendeIds.length <= 1 || !verdelingHandmatig) return undefined
    const r: Record<string, number> = {}
    for (const id of uitvoerendeIds) {
      const v = Number(verdeling[id] ?? '0')
      if (Number.isFinite(v) && v >= 0) r[id] = v
    }
    return r
  }

  const stelTaakSamen = (urenPerMw: Record<string, number> | undefined, id?: string): Taak => ({
    id: id ?? plek?.taak.id ?? uid('taak'),
    naam: naam.trim(),
    omschrijving: omschrijving.trim() || undefined,
    uitvoering,
    teamId: teamId || undefined,
    taakEigenaarId: eigenaarId || undefined,
    uitvoerendeIds: [...uitvoerendeIds],
    urenPerMedewerker: urenPerMw,
    externeActie:
      uitvoering === 'extern'
        ? {
            partijId: partijId || undefined,
            status: actieStatus,
            contactpersoon: contactpersoon.trim() || undefined,
            aangevraagdOp: aangevraagdOp || undefined,
            bevestigdOp: bevestigdOp || undefined,
            slot: slot.trim() || undefined,
            verwachteRetour: verwachteRetour || undefined,
            notitie: externNotitie.trim() || undefined,
          }
        : undefined,
    uren: Number.isFinite(urenN) ? Math.max(0, urenN) : 0,
    werkelijkeUren: plek?.taak.werkelijkeUren,
    start: start || undefined,
    eind: eind || undefined,
    prioriteit,
    status: plek?.taak.status ?? 'te_doen',
    afhankelijkVan: [...afhankelijkVan],
    vaardigheden: [...vaardigheden],
    blokkade: blokkade.trim() || undefined,
    onHoldReden: plek?.taak.onHoldReden,
    hervattenOp: plek?.taak.hervattenOp,
    werkelijkeStart: plek?.taak.werkelijkeStart,
    werkelijkGereedOp: plek?.taak.werkelijkGereedOp,
    projectspecifiek: plek ? plek.taak.projectspecifiek : true,
    aangemaaktOp: plek?.taak.aangemaaktOp ?? vandaagISO(),
    aangemaaktDoor: plek?.taak.aangemaaktDoor ?? persona.naam,
    gewijzigdOp: vandaagISO(),
    gewijzigdDoor: persona.naam,
  })

  // ---------- Capaciteitswaarschuwingen (informatief, nooit blokkerend) ----------

  const waarschuwingen: string[] = []
  if (open && doelFase && uitvoerendeIds.length > 0) {
    const concept = stelTaakSamen(zachteVerdeling(), 'concept')
    const gezien = new Set<string>()
    const voeg = (w: string) => {
      if (!gezien.has(w)) {
        gezien.add(w)
        waarschuwingen.push(w)
      }
    }
    for (const id of uitvoerendeIds) {
      const m = data.medewerkers.find((x) => x.id === id)
      if (!m) continue
      for (const week of periodeWeken) {
        const beschikbaar = medewerkerBeschikbaarInWeek(data, id, week)
        const bestaand =
          medewerkerTaakUrenInWeek(data, id, week) - (plek ? bijdrageInWeek(plek.taak, plek.fase, id, week) : 0)
        const eigen = bijdrageInWeek(concept, doelFase, id, week)
        const totaal = bestaand + eigen
        if (eigen > 0 && totaal > beschikbaar) {
          voeg(`«${m.naam}» is in week ${weekNummer(week)} voor ${bezettingsPct(beschikbaar, totaal)}% belast.`)
        }
        if (medewerkerAfwezigInWeek(data, m, week) > 0) {
          voeg(`«${m.naam}» is (deels) afwezig in week ${weekNummer(week)}.`)
        }
      }
      for (const v of ontbrekendeVaardigheden(concept, m)) {
        voeg(`Voor deze taak is de vaardigheid «${v}» vereist, maar «${m.naam}» heeft die niet geregistreerd.`)
      }
    }
  }
  const MAX_WAARSCHUWINGEN = 8

  // ---------- Formulieracties ----------

  const kiesFase = (id: string) => {
    setFaseId(id)
    setWpId(fases.find((f) => f.id === id)?.werkpakketten[0]?.id ?? '')
  }

  const toggleUitvoerende = (id: string) => {
    setUitvoerendeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    if (verdelingHandmatig) {
      setVerdeling((prev) => {
        const kopie = { ...prev }
        if (uitvoerendeIds.includes(id)) delete kopie[id]
        else kopie[id] = '0'
        return kopie
      })
    }
  }

  const zetVerdeling = (id: string, v: string) => {
    setVerdeling((huidig) => {
      const basis = verdelingHandmatig
        ? { ...huidig }
        : Object.fromEntries(uitvoerendeIds.map((x) => [x, String(gelijkAandeel)]))
      basis[id] = v
      return basis
    })
    setVerdelingHandmatig(true)
  }

  const voegVaardigheidToe = () => {
    const v = nieuweVaardigheid.trim()
    if (v && !vaardigheden.includes(v)) setVaardigheden((l) => [...l, v])
    setNieuweVaardigheid('')
  }

  const kiesPartner = (v: string) => {
    if (v === NIEUWE_PARTNER) {
      setPartnerModalOpen(true)
      return
    }
    setPartijId(v)
    const p = data.externePartijen.find((x) => x.id === v)
    if (p && contactpersoon.trim() === '') setContactpersoon(p.contactpersoon)
  }

  const indicatie = (m: Medewerker): { pct: number; afwezig: boolean } => {
    let pct = 0
    let afwezig = false
    for (const week of periodeWeken) {
      const beschikbaar = medewerkerBeschikbaarInWeek(data, m.id, week)
      pct = Math.max(pct, bezettingsPct(beschikbaar, medewerkerTaakUrenInWeek(data, m.id, week)))
      if (medewerkerAfwezigInWeek(data, m, week) > 0) afwezig = true
    }
    return { pct, afwezig }
  }

  // ---------- Opslaan ----------

  const voerBijwerkenUit = (patch: Partial<Taak>, historie?: Historie): boolean => {
    if (!plek) return false
    dispatch({
      type: 'TAAK_BIJWERKEN',
      faseId: plek.fase.id,
      wpId: plek.proces.id,
      taakId: plek.taak.id,
      patch,
      gebruiker: persona.naam,
      historie,
    })
    const verplaatst = faseId !== plek.fase.id || wpId !== plek.proces.id
    if (verplaatst) {
      dispatch({
        type: 'TAAK_VERPLAATSEN',
        vanFaseId: plek.fase.id,
        vanWpId: plek.proces.id,
        taakId: plek.taak.id,
        naarFaseId: faseId,
        naarWpId: wpId,
        gebruiker: persona.naam,
      })
    }
    return verplaatst
  }

  const bepaalHistorie = (oud: Taak, nieuw: Taak): Historie | undefined => {
    const periode = (t: Taak) =>
      t.start || t.eind ? `${t.start ? formatDatum(t.start) : '—'} t/m ${t.eind ? formatDatum(t.eind) : '—'}` : 'volgt fase'
    if (nieuw.uren !== oud.uren) return { wijziging: 'Uren aangepast', oud: `${oud.uren} u`, nieuw: `${nieuw.uren} u` }
    if (nieuw.start !== oud.start || nieuw.eind !== oud.eind)
      return { wijziging: 'Datum aangepast', oud: periode(oud), nieuw: periode(nieuw) }
    const partnerNaam = (id?: string) => (id ? data.externePartijen.find((p) => p.id === id)?.naam : undefined)
    if (nieuw.externeActie?.partijId !== oud.externeActie?.partijId)
      return {
        wijziging: 'Externe partner gekoppeld',
        oud: partnerNaam(oud.externeActie?.partijId),
        nieuw: partnerNaam(nieuw.externeActie?.partijId),
      }
    const sleutel = (xs: string[]) => [...xs].sort().join(',')
    if (
      nieuw.teamId !== oud.teamId ||
      nieuw.taakEigenaarId !== oud.taakEigenaarId ||
      sleutel(nieuw.uitvoerendeIds) !== sleutel(oud.uitvoerendeIds)
    ) {
      const samenvatting = (t: Taak) => {
        const team = t.teamId ? data.teams.find((x) => x.id === t.teamId)?.naam : undefined
        return [team, `${t.uitvoerendeIds.length} uitvoerende(n)`].filter(Boolean).join(' · ')
      }
      return { wijziging: 'Team of medewerker toegewezen', oud: samenvatting(oud), nieuw: samenvatting(nieuw) }
    }
    if (sleutel(nieuw.afhankelijkVan) !== sleutel(oud.afhankelijkVan))
      return {
        wijziging: 'Afhankelijkheid gewijzigd',
        oud: `${oud.afhankelijkVan.length} afhankelijkheid/-heden`,
        nieuw: `${nieuw.afhankelijkVan.length} afhankelijkheid/-heden`,
      }
    return { wijziging: 'Taak bijgewerkt' }
  }

  const opslaan = () => {
    const f: Record<string, string> = {}
    if (naam.trim() === '') f.naam = 'Een taaknaam is verplicht.'
    if (!faseId) f.fase = 'Kies een fase.'
    if (faseId && !wpId) f.proces = 'Kies een proces — voeg zo nodig eerst een proces toe aan de fase.'
    if (!Number.isFinite(urenN) || urenN < 0) f.uren = 'Uren moet 0 of hoger zijn.'
    if (start && eind && eind < start) f.eind = 'De einddatum kan niet vóór de startdatum liggen.'

    let urenPerMedewerker: Record<string, number> | undefined
    if (uitvoerendeIds.length > 1 && verdelingHandmatig && !f.uren) {
      const waarden = uitvoerendeIds.map((id) => Number(verdeling[id] ?? '0'))
      if (waarden.some((v) => !Number.isFinite(v) || v < 0)) {
        f.verdeling = 'De urenverdeling bevat een ongeldige waarde; vul per medewerker 0 of meer uren in.'
      } else {
        const som = waarden.reduce((s, v) => s + v, 0)
        if (Math.abs(som - urenN) > 0.01) {
          f.verdeling = `De urenverdeling telt op tot ${afgerond(som)} u, maar de taak heeft ${urenN} u. Maak de som gelijk aan de taakuren.`
        } else {
          const gelijk = urenN / uitvoerendeIds.length
          const isGelijk = waarden.every((v) => Math.abs(v - gelijk) <= 0.01)
          if (!isGelijk) urenPerMedewerker = Object.fromEntries(uitvoerendeIds.map((id, i) => [id, waarden[i]]))
        }
      }
    }

    if (Object.keys(f).length > 0) {
      setFout(f)
      return
    }
    setFout({})
    if (!doelFase) return
    const nieuweTaak = stelTaakSamen(urenPerMedewerker)

    if (!plek) {
      dispatch({ type: 'TAAK_TOEVOEGEN', faseId, wpId, taak: nieuweTaak, gebruiker: persona.naam })
      toon('succes', `Taak "${nieuweTaak.naam}" toegevoegd.`, undoActie)
      if (nieuweTaak.eind && nieuweTaak.eind > doelFase.eind) {
        toon('waarschuwing', `Let op: de taak eindigt na de faseperiode van "${doelFase.naam}" (t/m ${formatDatum(doelFase.eind)}).`)
      }
      onSluiten()
      return
    }

    const patch: Partial<Taak> = {
      naam: nieuweTaak.naam,
      omschrijving: nieuweTaak.omschrijving,
      uitvoering: nieuweTaak.uitvoering,
      teamId: nieuweTaak.teamId,
      taakEigenaarId: nieuweTaak.taakEigenaarId,
      uitvoerendeIds: nieuweTaak.uitvoerendeIds,
      urenPerMedewerker: nieuweTaak.urenPerMedewerker,
      externeActie: nieuweTaak.externeActie,
      uren: nieuweTaak.uren,
      start: nieuweTaak.start,
      eind: nieuweTaak.eind,
      prioriteit: nieuweTaak.prioriteit,
      afhankelijkVan: nieuweTaak.afhankelijkVan,
      vaardigheden: nieuweTaak.vaardigheden,
      blokkade: nieuweTaak.blokkade,
    }
    const historie = bepaalHistorie(plek.taak, nieuweTaak)
    const oudEind = taakPeriode(plek.taak, plek.fase).eind
    const nieuwEind = nieuweTaak.eind ?? doelFase.eind
    const delta = diffDagen(oudEind, nieuwEind)
    const afhankelijken = afhankelijkeTaken(data, project.id, plek.taak.id)

    if (delta !== 0 && afhankelijken.length > 0) {
      setVerschuif({
        delta,
        patch,
        historie,
        nieuwEind,
        faseVerlengd: nieuwEind > doelFase.eind,
        aantal: afhankelijken.length,
      })
      return
    }

    const verplaatst = voerBijwerkenUit(patch, historie)
    if (nieuwEind > doelFase.eind) {
      toon('waarschuwing', `De taak eindigt na de faseperiode van "${doelFase.naam}" (t/m ${formatDatum(doelFase.eind)}).`)
    }
    toon(
      'succes',
      verplaatst ? `Taak "${nieuweTaak.naam}" bijgewerkt en verplaatst.` : `Taak "${nieuweTaak.naam}" bijgewerkt.`,
      verplaatst ? undefined : undoActie,
    )
    onSluiten()
  }

  // ---------- Verschuif-keuzes ----------

  const meeschuiven = () => {
    if (!verschuif || !plek || !doelFase) return
    voerBijwerkenUit(verschuif.patch, verschuif.historie)
    const afhankelijken = afhankelijkeTaken(data, project.id, plek.taak.id)
    let verschoven = 0
    for (const dep of afhankelijken) {
      if (!dep.taak.start && !dep.taak.eind) continue
      const depPatch: Partial<Taak> = {}
      if (dep.taak.start) depPatch.start = addDagen(dep.taak.start, verschuif.delta)
      if (dep.taak.eind) depPatch.eind = addDagen(dep.taak.eind, verschuif.delta)
      dispatch({
        type: 'TAAK_BIJWERKEN',
        faseId: dep.fase.id,
        wpId: dep.proces.id,
        taakId: dep.taak.id,
        patch: depPatch,
        gebruiker: persona.naam,
        historie: {
          wijziging: 'Datum aangepast (meegeschoven)',
          nieuw: `${verschuif.delta > 0 ? '+' : ''}${verschuif.delta} dag(en)`,
        },
      })
      verschoven += 1
    }
    let oplevering = getVerwachteOplevering(data, project.id)
    if (verschuif.faseVerlengd) {
      dispatch({ type: 'FASE_DATUMS', faseId: doelFase.id, start: doelFase.start, eind: verschuif.nieuwEind, cascade: true })
      oplevering = verwachteOpleveringNa(fases, doelFase.id, verschuif.nieuwEind)
    }
    const basis = `Taak opgeslagen en ${verschoven} afhankelijke ${verschoven === 1 ? 'taak' : 'taken'} meegeschoven. Verwachte oplevering: ${formatDatum(oplevering)}.`
    if (oplevering > project.gewensteOpleverdatum) {
      toon('waarschuwing', `${basis} Daarmee komt de gewenste opleverdatum (${formatDatum(project.gewensteOpleverdatum)}) in gevaar.`)
    } else {
      toon('succes', basis)
    }
    setVerschuif(null)
    onSluiten()
  }

  const alleenTaak = () => {
    if (!verschuif || !doelFase) return
    voerBijwerkenUit(verschuif.patch, verschuif.historie)
    if (verschuif.nieuwEind > doelFase.eind) {
      toon('waarschuwing', `Taak opgeslagen — de taak valt buiten de faseperiode van "${doelFase.naam}" (t/m ${formatDatum(doelFase.eind)}).`)
    } else {
      toon('succes', `Taak "${naam.trim()}" bijgewerkt.`)
    }
    setVerschuif(null)
    onSluiten()
  }

  // ---------- Render ----------

  return (
    <>
      <Modal
        open={open}
        breed
        titel={plek ? `Taak bewerken — ${plek.taak.naam}` : 'Taak toevoegen'}
        onSluiten={onSluiten}
        voettekst={
          <>
            <Knop onClick={onSluiten}>Annuleren</Knop>
            <Knop variant="primary" onClick={opslaan}>
              {plek ? 'Wijzigingen opslaan' : 'Taak toevoegen'}
            </Knop>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Taaknaam" verplicht fout={fout.naam} className="col-span-2">
            <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Verlichting aansluiten" />
          </Veld>
          <Veld label="Omschrijving" className="col-span-2">
            <Tekstvak
              rows={2}
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              placeholder="Uitgebreide omschrijving van de werkzaamheden…"
            />
          </Veld>

          <Veld label="Fase" fout={fout.fase}>
            <Keuze value={faseId} onChange={(e) => kiesFase(e.target.value)}>
              {fases.map((fs) => (
                <option key={fs.id} value={fs.id}>
                  {fs.naam}
                </option>
              ))}
            </Keuze>
            {doelFase && (
              <span className="mt-1 block text-[11px] text-slate-400">
                Afdeling: {AFDELING_LABELS[doelFase.afdeling]}
              </span>
            )}
          </Veld>
          <Veld label="Proces" fout={fout.proces}>
            <Keuze value={wpId} onChange={(e) => setWpId(e.target.value)}>
              {procesOpties.length === 0 && <option value="">Geen processen in deze fase</option>}
              {procesOpties.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.naam}
                </option>
              ))}
            </Keuze>
            {plek && (faseId !== plek.fase.id || wpId !== plek.proces.id) && (
              <span className="mt-1 block text-[11px] text-amber-600">
                De taak wordt bij het opslaan verplaatst naar deze plek.
              </span>
            )}
          </Veld>

          <Veld label="Uitvoering" className="col-span-2">
            <SegmentKeuze
              waarde={uitvoering}
              opties={[
                { id: 'intern', label: 'Intern' },
                { id: 'extern', label: 'Extern' },
              ]}
              onKies={setUitvoering}
            />
          </Veld>

          {/* ---------- Toewijzing ---------- */}
          <div ref={toewijzingRef} className="col-span-2 scroll-mt-2 rounded-md border border-slate-200 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Toewijzing</div>
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Team">
                <Keuze value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Geen team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.naam} · {AFDELING_LABELS[t.afdeling]}
                    </option>
                  ))}
                </Keuze>
              </Veld>
              <Veld label="Taakeigenaar (optioneel)">
                <Keuze value={eigenaarId} onChange={(e) => setEigenaarId(e.target.value)}>
                  <option value="">Geen taakeigenaar</option>
                  {[...actieveMedewerkers]
                    .sort((a, b) => a.naam.localeCompare(b.naam))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.naam}
                      </option>
                    ))}
                </Keuze>
              </Veld>

              <div className="col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Uitvoerende medewerkers</span>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Invoer
                    value={zoek}
                    onChange={(e) => setZoek(e.target.value)}
                    placeholder="Zoek op naam…"
                    className="!w-44 !py-1 !text-xs"
                  />
                  <Keuze
                    value={filterAfdeling}
                    onChange={(e) => setFilterAfdeling(e.target.value)}
                    className="!w-40 !py-1 !text-xs"
                  >
                    <option value="">Alle afdelingen</option>
                    {(Object.keys(AFDELING_LABELS) as Afdeling[]).map((a) => (
                      <option key={a} value={a}>
                        {AFDELING_LABELS[a]}
                      </option>
                    ))}
                  </Keuze>
                  <Keuze
                    value={filterVaardigheid}
                    onChange={(e) => setFilterVaardigheid(e.target.value)}
                    className="!w-40 !py-1 !text-xs"
                  >
                    <option value="">Alle vaardigheden</option>
                    {alleVaardigheden.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Keuze>
                </div>
                {gekozenMedewerkers.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {gekozenMedewerkers.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-800"
                      >
                        {m.naam}
                        <button type="button" onClick={() => toggleUitvoerende(m.id)} className="text-brand-400 hover:text-red-600">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200">
                  {medewerkerLijst.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">Geen medewerkers gevonden met deze filters.</p>
                  ) : (
                    medewerkerLijst.map((m) => {
                      const ind = indicatie(m)
                      const stip = ind.pct > 100 ? 'bg-red-500' : ind.pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'
                      return (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-0 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={uitvoerendeIds.includes(m.id)}
                            onChange={() => toggleUitvoerende(m.id)}
                            className="accent-brand-600"
                          />
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${stip}`}
                            title={`Taakbelasting in de taakperiode: max ${ind.pct}%${ind.afwezig ? ' · (deels) afwezig in deze periode' : ''}`}
                          />
                          <span className="text-sm text-slate-700">{m.naam}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                            {m.functie} · {afdelingLabel(m.afdeling, data.overigeAfdelingen)}
                          </span>
                          {ind.afwezig && <span className="shrink-0 text-[11px] text-amber-600">afwezig</span>}
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              {uitvoerendeIds.length > 1 && (
                <div className="col-span-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      Urenverdeling ({verdelingHandmatig ? 'handmatig' : 'gelijkmatig'})
                    </span>
                    {verdelingHandmatig && (
                      <button
                        type="button"
                        onClick={() => {
                          setVerdelingHandmatig(false)
                          setVerdeling({})
                        }}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        Terug naar gelijke verdeling
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {gekozenMedewerkers.map((m) => (
                      <label key={m.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span className="min-w-0 truncate">{m.naam}</span>
                        <span className="flex items-center gap-1">
                          <Invoer
                            type="number"
                            min={0}
                            step={0.5}
                            value={verdelingHandmatig ? verdeling[m.id] ?? '0' : String(gelijkAandeel)}
                            onChange={(e) => zetVerdeling(m.id, e.target.value)}
                            className="!w-20 !py-1 !text-right !text-xs"
                          />
                          <span className="text-xs text-slate-400">u</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {fout.verdeling && <p className="mt-1 text-xs text-red-600">{fout.verdeling}</p>}
                </div>
              )}
            </div>
          </div>

          {/* ---------- Planning ---------- */}
          <Veld label="Geplande uren" fout={fout.uren}>
            <Invoer type="number" min={0} value={uren} onChange={(e) => setUren(e.target.value)} />
          </Veld>
          <Veld label="Prioriteit">
            <Keuze value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as Prioriteit)}>
              {(Object.keys(PRIORITEIT_LABELS) as Prioriteit[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITEIT_LABELS[p]}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Startdatum (optioneel)">
            <Invoer type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Veld>
          <Veld label="Einddatum (optioneel)" fout={fout.eind}>
            <Invoer type="date" value={eind} onChange={(e) => setEind(e.target.value)} />
          </Veld>
          {doelFase && (
            <p className="col-span-2 -mt-1 text-[11px] text-slate-400">
              Zonder eigen datums volgt de taak de faseperiode: {formatDatum(doelFase.start)} t/m {formatDatum(doelFase.eind)}.
            </p>
          )}

          {/* ---------- Afhankelijkheden ---------- */}
          <Veld label="Afhankelijk van (einde-naar-start)" className="col-span-2">
            {afhOpties.length === 0 ? (
              <p className="text-xs text-slate-400">Geen andere taken in dit project om van afhankelijk te zijn.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200">
                {afhOpties.map((p) => (
                  <label
                    key={p.taak.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-0 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={afhankelijkVan.includes(p.taak.id)}
                      onChange={() =>
                        setAfhankelijkVan((prev) =>
                          prev.includes(p.taak.id) ? prev.filter((x) => x !== p.taak.id) : [...prev, p.taak.id],
                        )
                      }
                      className="accent-brand-600"
                    />
                    <span className="truncate text-xs text-slate-400">
                      {p.fase.naam} · {p.proces.naam} ·
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.taak.naam}</span>
                  </label>
                ))}
              </div>
            )}
          </Veld>

          {/* ---------- Vaardigheden ---------- */}
          <Veld label="Benodigde vaardigheden" className="col-span-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {vaardigheden.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                >
                  {v}
                  <button
                    type="button"
                    onClick={() => setVaardigheden((l) => l.filter((x) => x !== v))}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <span className="flex items-center gap-1">
                <Invoer
                  value={nieuweVaardigheid}
                  onChange={(e) => setNieuweVaardigheid(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      voegVaardigheidToe()
                    }
                  }}
                  placeholder="Vaardigheid toevoegen…"
                  className="!w-44 !py-1 !text-xs"
                />
                <Knop klein onClick={voegVaardigheidToe}>
                  <Plus size={13} />
                </Knop>
              </span>
            </div>
          </Veld>

          <Veld label="Blokkade (leeg = geen blokkade)" className="col-span-2">
            <Invoer
              value={blokkade}
              onChange={(e) => setBlokkade(e.target.value)}
              placeholder="Bijv. wachten op onderdelen…"
            />
          </Veld>

          {/* ---------- Extern partnerblok ---------- */}
          {uitvoering === 'extern' && (
            <div className="col-span-2 rounded-md border border-purple-200 bg-purple-50/40 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-purple-700">Externe uitvoering</div>
              <div className="grid grid-cols-2 gap-3">
                <Veld label="Externe partner">
                  <Keuze value={partijId} onChange={(e) => kiesPartner(e.target.value)}>
                    <option value={NIEUWE_PARTNER}>+ Nieuwe externe partner toevoegen…</option>
                    <option value="">Nog geen partner gekozen</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.naam}
                      </option>
                    ))}
                  </Keuze>
                </Veld>
                <Veld label="Contactpersoon">
                  <Invoer value={contactpersoon} onChange={(e) => setContactpersoon(e.target.value)} />
                </Veld>
                <Veld label="Externe actiestatus">
                  <Keuze value={actieStatus} onChange={(e) => setActieStatus(e.target.value as ExterneActieStatus)}>
                    {(Object.keys(EXTERNE_ACTIE_LABELS) as ExterneActieStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {EXTERNE_ACTIE_LABELS[s]}
                      </option>
                    ))}
                  </Keuze>
                </Veld>
                <Veld label="Beschikbaar slot">
                  <Invoer value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="Bijv. week 34, ochtend" />
                </Veld>
                <Veld label="Aangevraagd op">
                  <Invoer type="date" value={aangevraagdOp} onChange={(e) => setAangevraagdOp(e.target.value)} />
                </Veld>
                <Veld label="Bevestigd op">
                  <Invoer type="date" value={bevestigdOp} onChange={(e) => setBevestigdOp(e.target.value)} />
                </Veld>
                <Veld label="Verwachte retourdatum">
                  <Invoer type="date" value={verwachteRetour} onChange={(e) => setVerwachteRetour(e.target.value)} />
                </Veld>
                <Veld label="Notitie">
                  <Invoer value={externNotitie} onChange={(e) => setExternNotitie(e.target.value)} />
                </Veld>
              </div>
            </div>
          )}

          {/* ---------- Capaciteitswaarschuwingen ---------- */}
          {waarschuwingen.length > 0 && (
            <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <AlertTriangle size={14} /> Aandachtspunten (informatief, niet blokkerend)
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700">
                {waarschuwingen.slice(0, MAX_WAARSCHUWINGEN).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {waarschuwingen.length > MAX_WAARSCHUWINGEN && (
                  <li>… en nog {waarschuwingen.length - MAX_WAARSCHUWINGEN} andere aandachtspunten.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <NieuwePartnerModal
        open={partnerModalOpen}
        onSluiten={() => setPartnerModalOpen(false)}
        onToegevoegd={(partij) => {
          setPartijId(partij.id)
          if (contactpersoon.trim() === '') setContactpersoon(partij.contactpersoon)
        }}
      />

      <VerschuifDialoog
        open={verschuif !== null}
        deltaDagen={verschuif?.delta ?? 0}
        aantalAfhankelijk={verschuif?.aantal ?? 0}
        faseNaam={doelFase?.naam ?? ''}
        faseWordtVerlengd={verschuif?.faseVerlengd ?? false}
        onMeeschuiven={meeschuiven}
        onAlleenTaak={alleenTaak}
        onAnnuleer={() => setVerschuif(null)}
      />
    </>
  )
}
