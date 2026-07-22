// Overzichtsscherm "Planningstemplates" (route /templates).
// Toont alle producttemplates, gegroepeerd per trailertype en per lijn
// (trailertype + complexiteit) met de versies onder elkaar (nieuwste bovenaan),
// zodat het versiebeheer in één oogopslag zichtbaar is. Beheeracties (nieuw,
// dupliceren, variant, nieuwe versie, publiceren, archiveren, verwijderen)
// zijn alleen beschikbaar voor rollen met permissies.templatesBeheren.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Copy, GitBranch, Layers, MoreVertical, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  Badge,
  BevestigDialog,
  InfoTip,
  Invoer,
  Kaart,
  Keuze,
  Knop,
  LegeStaat,
  Modal,
  PaginaKop,
  Tooltip,
  useToast,
  Veld,
  type BadgeKleur,
} from '../components/ui'
import type { Afdeling, ProductTemplate, TemplateFase, TemplateStatus } from '../lib/types'
import { FASE_LABELS, TEMPLATE_STATUS_LABELS, TRAILERTYPES } from '../lib/types'
import {
  dupliceerTemplate,
  hoogsteVersie,
  HOOFD_FASE_KEYS,
  nieuweVersieVan,
  projectenMetTemplate,
  templateTotalen,
  verschilMetStandaard,
} from '../lib/templates'
import { formatDatum, vandaagISO } from '../lib/dates'
import { uid } from '../lib/uid'

// ---------- Constanten & pure helpers ----------

const STATUS_BADGE: Record<TemplateStatus, BadgeKleur> = {
  concept: 'grijs',
  gepubliceerd: 'groen',
  gearchiveerd: 'amber',
}

/** Standaard doorlooptijd (werkdagen) per hoofdfase voor een vers leeg template. */
const STANDAARD_DOORLOOPTIJD: Record<string, number> = {
  engineering: 15,
  chassis: 18,
  panelen: 18,
  spuiter: 8,
  afbouw: 22,
  kwaliteit: 5,
}

/** Sorteersleutel voor trailertypes: bekende types op hun vaste volgorde, rest erachter. */
function typeIndex(tt: string): number {
  const i = TRAILERTYPES.indexOf(tt)
  return i === -1 ? 900 + tt.charCodeAt(0) : i
}

type StatusFilter = 'alle' | TemplateStatus

// ---------- Verschil-indicator ----------

function VerschilIndicator({ templates, template }: { templates: ProductTemplate[]; template: ProductTemplate }) {
  const v = verschilMetStandaard(templates, template)
  if (!v) return <span className="text-slate-300">—</span>
  const delen: string[] = []
  const enkelvoud = (n: number, enk: string, mv: string) => {
    if (n !== 0) delen.push(`${n > 0 ? '+' : ''}${n} ${Math.abs(n) === 1 ? enk : mv}`)
  }
  enkelvoud(v.taken, 'taak', 'taken')
  if (v.engineeringUren !== 0) delen.push(`${v.engineeringUren > 0 ? '+' : ''}${v.engineeringUren} eng-uur`)
  enkelvoud(v.productiedagen, 'dag', 'dagen')
  enkelvoud(v.reviews, 'review', 'reviews')
  if (delen.length === 0) return <Badge kleur="grijs">gelijk aan standaard</Badge>
  return (
    <Tooltip tekst={`Verschil t.o.v. ${template.trailertype} · Standaard (laatst gepubliceerd)`}>
      <Badge kleur="grijs">{delen.join(' · ')}</Badge>
    </Tooltip>
  )
}

// ---------- Rij-actiemenu (kebab) ----------

interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  gevaarlijk?: boolean
}

/** Compact acties-menu met vaste positionering (ontsnapt aan de tabel-overflow). */
function RijMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const herpositioneer = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setCoord({ top: r.bottom + 4, left: r.right })
    }
    herpositioneer()
    const opBuitenklik = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', opBuitenklik)
    window.addEventListener('resize', herpositioneer)
    window.addEventListener('scroll', herpositioneer, true)
    window.addEventListener('keydown', opToets)
    return () => {
      window.removeEventListener('mousedown', opBuitenklik)
      window.removeEventListener('resize', herpositioneer)
      window.removeEventListener('scroll', herpositioneer, true)
      window.removeEventListener('keydown', opToets)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        title="Acties"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
      {open && coord && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coord.top, left: coord.left, transform: 'translateX(-100%)' }}
          className="z-[70] w-60 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((it, i) => (
            <button
              key={i}
              disabled={it.disabled}
              title={it.title}
              onClick={(e) => {
                e.stopPropagation()
                if (it.disabled) return
                setOpen(false)
                it.onClick()
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                it.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : it.gevaarlijk
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="shrink-0">{it.icon}</span>
              <span className="flex-1">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ---------- Hoofdscherm ----------

export default function Planningstemplates() {
  const { data, dispatch, persona, permissies } = useApp()
  const navigate = useNavigate()
  const { toon } = useToast()
  const magBeheren = permissies.templatesBeheren

  const templates = data.templates
  const niveaus = useMemo(
    () => [...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde),
    [data.complexiteitNiveaus],
  )
  const niveauNaam = (id: string) => niveaus.find((n) => n.id === id)?.naam ?? id
  const niveauAanduiding = (id: string) => niveaus.find((n) => n.id === id)?.aanduiding
  const niveauVolgorde = (id: string) => niveaus.find((n) => n.id === id)?.volgorde ?? 900

  // ----- Filters -----
  const [zoek, setZoek] = useState('')
  const [typeFilter, setTypeFilter] = useState('alle')
  const [complexFilter, setComplexFilter] = useState('alle')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('alle')
  const [alleenActief, setAlleenActief] = useState(false)

  const trailertypeOpties = useMemo(
    () => [...new Set(templates.map((t) => t.trailertype))].sort((a, b) => typeIndex(a) - typeIndex(b) || a.localeCompare(b, 'nl')),
    [templates],
  )

  const filtersActief =
    zoek.trim() !== '' || typeFilter !== 'alle' || complexFilter !== 'alle' || statusFilter !== 'alle' || alleenActief

  const wisFilters = () => {
    setZoek('')
    setTypeFilter('alle')
    setComplexFilter('alle')
    setStatusFilter('alle')
    setAlleenActief(false)
  }

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    return templates.filter((t) => {
      if (typeFilter !== 'alle' && t.trailertype !== typeFilter) return false
      if (complexFilter !== 'alle' && t.complexiteitId !== complexFilter) return false
      if (statusFilter !== 'alle' && t.status !== statusFilter) return false
      if (alleenActief && t.status === 'gearchiveerd') return false
      if (q) {
        const naam = t.naam.toLowerCase()
        const tt = t.trailertype.toLowerCase()
        const cn = niveauNaam(t.complexiteitId).toLowerCase()
        if (!naam.includes(q) && !tt.includes(q) && !cn.includes(q)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, typeFilter, complexFilter, statusFilter, alleenActief, zoek, niveaus])

  // ----- Groepering: per trailertype -> per lijn -> versies (nieuwste bovenaan) -----
  const secties = useMemo(() => {
    const perType = new Map<string, ProductTemplate[]>()
    for (const t of gefilterd) {
      const arr = perType.get(t.trailertype)
      if (arr) arr.push(t)
      else perType.set(t.trailertype, [t])
    }
    const types = [...perType.keys()].sort((a, b) => typeIndex(a) - typeIndex(b) || a.localeCompare(b, 'nl'))
    return types.map((tt) => {
      const lijst = perType.get(tt)!
      const perLijn = new Map<string, ProductTemplate[]>()
      for (const t of lijst) {
        const arr = perLijn.get(t.complexiteitId)
        if (arr) arr.push(t)
        else perLijn.set(t.complexiteitId, [t])
      }
      const lijnen = [...perLijn.entries()]
        .sort((a, b) => niveauVolgorde(a[0]) - niveauVolgorde(b[0]) || a[0].localeCompare(b[0]))
        .map(([complexiteitId, versies]) => ({
          complexiteitId,
          versies: [...versies].sort((x, y) => y.versie - x.versie),
        }))
      return { trailertype: tt, aantal: lijst.length, lijnen }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gefilterd, niveaus])

  // ----- Nieuw template (modal) -----
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [typeKeuze, setTypeKeuze] = useState<string>(TRAILERTYPES[0])
  const [typeVrij, setTypeVrij] = useState('')
  const [nieuwComplex, setNieuwComplex] = useState(niveaus[0]?.id ?? 'standaard')
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [naamHandmatig, setNaamHandmatig] = useState(false)

  const effectiefType = (typeKeuze === '__anders' ? typeVrij : typeKeuze).trim()
  const nieuwNaamSuggestie = `${effectiefType || '…'} · ${niveauNaam(nieuwComplex)}`
  const nieuwNaamEffectief = naamHandmatig ? nieuwNaam : nieuwNaamSuggestie
  const nieuwLijnBestaat = effectiefType !== '' && hoogsteVersie(templates, effectiefType, nieuwComplex) > 0
  const nieuwOngeldig = effectiefType === '' || nieuwNaamEffectief.trim() === '' || nieuwLijnBestaat

  const openNieuw = () => {
    setTypeKeuze(TRAILERTYPES[0])
    setTypeVrij('')
    setNieuwComplex(niveaus[0]?.id ?? 'standaard')
    setNieuwNaam('')
    setNaamHandmatig(false)
    setNieuwOpen(true)
  }

  const maakNieuw = () => {
    if (nieuwOngeldig) return
    const id = uid('tmpl')
    const fases: TemplateFase[] = HOOFD_FASE_KEYS.map((key, i) => {
      const afdeling: Afdeling = key === 'spuiter' ? 'extern' : key
      return {
        id: uid('tfase'),
        key,
        naam: FASE_LABELS[key],
        afdeling,
        doorlooptijdWerkdagen: STANDAARD_DOORLOOPTIJD[key] ?? 10,
        volgorde: i + 1,
        taken: [],
      }
    })
    const nieuw: ProductTemplate = {
      id,
      trailertype: effectiefType,
      complexiteitId: nieuwComplex,
      naam: nieuwNaamEffectief.trim(),
      versie: 1,
      status: 'concept',
      fases,
      gewijzigdOp: vandaagISO(),
      gewijzigdDoor: persona.naam,
      wijzigingsnotitie: 'Nieuw template aangemaakt',
    }
    dispatch({ type: 'TEMPLATE_TOEVOEGEN', template: nieuw })
    setNieuwOpen(false)
    toon('succes', `Template ${nieuw.naam} aangemaakt als concept.`)
    navigate(`/templates/${id}`)
  }

  // ----- Nieuwe complexiteitsvariant (modal) -----
  const [variantBron, setVariantBron] = useState<ProductTemplate | null>(null)
  const [variantComplex, setVariantComplex] = useState('')
  const [variantNaam, setVariantNaam] = useState('')
  const [variantNaamHandmatig, setVariantNaamHandmatig] = useState(false)

  const variantNaamSuggestie = variantBron ? `${variantBron.trailertype} · ${niveauNaam(variantComplex)}` : ''
  const variantNaamEffectief = variantNaamHandmatig ? variantNaam : variantNaamSuggestie
  const variantLijnBestaat =
    variantBron !== null && hoogsteVersie(templates, variantBron.trailertype, variantComplex) > 0
  const variantOngeldig = variantComplex === '' || variantNaamEffectief.trim() === '' || variantLijnBestaat

  const openVariant = (t: ProductTemplate) => {
    const ander = niveaus.find((n) => n.id !== t.complexiteitId)?.id ?? t.complexiteitId
    setVariantBron(t)
    setVariantComplex(ander)
    setVariantNaam('')
    setVariantNaamHandmatig(false)
  }

  const maakVariant = () => {
    if (!variantBron || variantOngeldig) return
    const kopie = dupliceerTemplate(variantBron, persona.naam, {
      complexiteitId: variantComplex,
      naam: variantNaamEffectief.trim(),
    })
    dispatch({ type: 'TEMPLATE_TOEVOEGEN', template: kopie })
    setVariantBron(null)
    toon('succes', `Nieuwe variant ${kopie.naam} aangemaakt als concept.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
  }

  // ----- Overige acties -----
  const dupliceer = (t: ProductTemplate) => {
    const kopie = dupliceerTemplate(t, persona.naam, { naam: `${t.naam} (kopie)` })
    dispatch({ type: 'TEMPLATE_TOEVOEGEN', template: kopie })
    toon('succes', `${t.naam} gedupliceerd als concept.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
  }

  const nieuweVersie = (t: ProductTemplate) => {
    const nv = nieuweVersieVan(t, templates, persona.naam)
    dispatch({ type: 'TEMPLATE_TOEVOEGEN', template: nv })
    toon('succes', `Versie ${nv.versie} van ${t.naam} aangemaakt als concept.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
  }

  const archiveer = (t: ProductTemplate) => {
    dispatch({ type: 'TEMPLATE_ARCHIVEREN', id: t.id })
    toon('info', `${t.naam} (v${t.versie}) gearchiveerd.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
  }

  const [publiceerDoel, setPubliceerDoel] = useState<ProductTemplate | null>(null)
  const bevestigPubliceren = () => {
    if (!publiceerDoel) return
    dispatch({ type: 'TEMPLATE_PUBLICEREN', id: publiceerDoel.id })
    toon('succes', `${publiceerDoel.naam} (v${publiceerDoel.versie}) gepubliceerd.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
    setPubliceerDoel(null)
  }

  const [verwijderDoel, setVerwijderDoel] = useState<ProductTemplate | null>(null)
  const bevestigVerwijderen = () => {
    if (!verwijderDoel) return
    const n = projectenMetTemplate(data.projecten, verwijderDoel.id)
    if (n > 0) {
      toon('fout', `Kan template niet verwijderen: nog in gebruik door ${n} project(en).`)
      setVerwijderDoel(null)
      return
    }
    dispatch({ type: 'TEMPLATE_VERWIJDEREN', id: verwijderDoel.id })
    toon('succes', `${verwijderDoel.naam} (v${verwijderDoel.versie}) verwijderd.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
    setVerwijderDoel(null)
  }

  const bouwMenu = (t: ProductTemplate): MenuItem[] => {
    const nProj = projectenMetTemplate(data.projecten, t.id)
    const items: MenuItem[] = [
      { label: 'Openen in editor', icon: <Pencil size={15} />, onClick: () => navigate(`/templates/${t.id}`) },
      { label: 'Dupliceren', icon: <Copy size={15} />, onClick: () => dupliceer(t) },
      { label: 'Nieuwe complexiteitsvariant', icon: <Layers size={15} />, onClick: () => openVariant(t) },
    ]
    if (t.status === 'gepubliceerd' || t.status === 'gearchiveerd') {
      items.push({ label: 'Nieuwe versie', icon: <GitBranch size={15} />, onClick: () => nieuweVersie(t) })
    }
    if (t.status === 'concept') {
      items.push({ label: 'Publiceren', icon: <Upload size={15} />, onClick: () => setPubliceerDoel(t) })
    }
    if (t.status !== 'gearchiveerd') {
      items.push({ label: 'Archiveren', icon: <Archive size={15} />, onClick: () => archiveer(t) })
    }
    items.push({
      label: 'Verwijderen',
      icon: <Trash2 size={15} />,
      gevaarlijk: true,
      disabled: nProj > 0,
      title: nProj > 0 ? `In gebruik door ${nProj} project(en) — eerst ontkoppelen` : undefined,
      onClick: () => setVerwijderDoel(t),
    })
    return items
  }

  const kolommen = magBeheren ? 11 : 10

  return (
    <div className="p-6">
      <PaginaKop
        titel="Planningstemplates"
        uitleg="Herbruikbare productieblauwdrukken per trailertype en complexiteitsniveau, met versiebeheer."
        rechts={
          magBeheren ? (
            <Knop variant="primary" onClick={openNieuw}>
              <Plus size={16} />
              Nieuw template
            </Knop>
          ) : (
            <Badge kleur="grijs">Alleen-lezen</Badge>
          )
        }
      />

      {/* Filterbalk */}
      <Kaart className="mb-4 px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">Zoeken</span>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <Invoer value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam of trailertype…" className="!pl-8" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Trailertype</span>
            <Keuze value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="!w-auto">
              <option value="alle">Alle types</option>
              {trailertypeOpties.map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
            </Keuze>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Complexiteit</span>
            <Keuze value={complexFilter} onChange={(e) => setComplexFilter(e.target.value)} className="!w-auto">
              <option value="alle">Alle niveaus</option>
              {niveaus.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.naam}
                </option>
              ))}
            </Keuze>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
              Status
              <InfoTip tekst="Concept: in bewerking. Gepubliceerd: actief bruikbaar voor nieuwe projecten. Gearchiveerd: vervangen door een nieuwere versie." />
            </span>
            <Keuze value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="!w-auto">
              <option value="alle">Alle statussen</option>
              <option value="concept">Concept</option>
              <option value="gepubliceerd">Gepubliceerd</option>
              <option value="gearchiveerd">Gearchiveerd</option>
            </Keuze>
          </label>
          <div className="mb-1.5 flex items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 select-none">
              <input
                type="checkbox"
                checked={alleenActief}
                onChange={(e) => setAlleenActief(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              Alleen actieve templates
            </label>
            <InfoTip tekst="Verbergt gearchiveerde versies." />
          </div>
          {filtersActief && (
            <Knop klein variant="ghost" onClick={wisFilters} className="mb-0.5">
              Filters wissen
            </Knop>
          )}
        </div>
      </Kaart>

      <p className="mb-3 text-xs text-slate-500">
        {gefilterd.length} van {templates.length} templates
      </p>

      {gefilterd.length === 0 ? (
        <LegeStaat
          titel="Geen templates gevonden"
          tekst={
            filtersActief
              ? 'Er zijn geen templates die aan de huidige zoekopdracht en filters voldoen.'
              : 'Er zijn nog geen producttemplates. Maak een nieuw template aan om te beginnen.'
          }
          actie={
            <div className="flex gap-2">
              {filtersActief && <Knop onClick={wisFilters}>Filters wissen</Knop>}
              {magBeheren && !filtersActief && (
                <Knop variant="primary" onClick={openNieuw}>
                  <Plus size={16} />
                  Nieuw template
                </Knop>
              )}
            </div>
          }
        />
      ) : (
        secties.map((sectie) => (
          <section key={sectie.trailertype} className="mb-6">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">{sectie.trailertype}</h2>
              <span className="text-xs text-slate-400">
                {sectie.aantal} {sectie.aantal === 1 ? 'template' : 'templates'} · {sectie.lijnen.length}{' '}
                {sectie.lijnen.length === 1 ? 'lijn' : 'lijnen'}
              </span>
            </div>
            <Kaart className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <th className="px-3 py-2.5">Versie</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Fases</th>
                    <th className="px-3 py-2.5 text-right">Taken</th>
                    <th className="px-3 py-2.5 text-right">Uren</th>
                    <th className="px-3 py-2.5 text-right">Eng-uur</th>
                    <th className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1">
                        Doorloop
                        <InfoTip tekst="Geschatte doorlooptijd in werkdagen (som van de fase-doorlooptijden)." />
                      </span>
                    </th>
                    <th className="px-3 py-2.5">Verschil</th>
                    <th className="px-3 py-2.5">Gewijzigd</th>
                    <th className="px-3 py-2.5 text-center">Projecten</th>
                    {magBeheren && <th className="w-10 px-3 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {sectie.lijnen.map((lijn) => {
                    const inGebruik = lijn.versies.reduce((s, t) => s + projectenMetTemplate(data.projecten, t.id), 0)
                    const aanduiding = niveauAanduiding(lijn.complexiteitId)
                    return (
                      <Fragment key={lijn.complexiteitId}>
                        <tr className="border-y border-slate-200 bg-slate-100/70">
                          <td colSpan={kolommen} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="text-sm font-semibold text-slate-800"
                                title={lijn.versies[0]?.omschrijving}
                              >
                                {sectie.trailertype} · {niveauNaam(lijn.complexiteitId)}
                              </span>
                              {aanduiding && <Badge kleur="grijs">{aanduiding}</Badge>}
                              <span className="text-xs text-slate-400">
                                {lijn.versies.length} {lijn.versies.length === 1 ? 'versie' : 'versies'}
                              </span>
                              {inGebruik > 0 && (
                                <span className="text-xs text-slate-400">· {inGebruik} in gebruik</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {lijn.versies.map((t) => {
                          const tot = templateTotalen(t)
                          const nProj = projectenMetTemplate(data.projecten, t.id)
                          return (
                            <tr
                              key={t.id}
                              onClick={() => navigate(`/templates/${t.id}`)}
                              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                            >
                              <td className="px-3 py-2.5 font-medium tabular-nums text-brand-700">v{t.versie}</td>
                              <td className="px-3 py-2.5">
                                <Badge kleur={STATUS_BADGE[t.status]}>{TEMPLATE_STATUS_LABELS[t.status]}</Badge>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{tot.aantalFases}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {tot.aantalTaken}
                                {tot.aantalOptioneel > 0 && (
                                  <span className="text-slate-400"> ({tot.aantalOptioneel} opt.)</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-700">{tot.totaleUren}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{tot.engineeringUren}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{tot.doorlooptijdWerkdagen}</td>
                              <td className="px-3 py-2.5">
                                <VerschilIndicator templates={templates} template={t} />
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <Tooltip tekst={t.wijzigingsnotitie ? `Notitie: ${t.wijzigingsnotitie}` : 'Geen wijzigingsnotitie'}>
                                  <span className="tabular-nums text-slate-600">{formatDatum(t.gewijzigdOp)}</span>
                                </Tooltip>
                                <span className="block text-xs text-slate-400">{t.gewijzigdDoor}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {nProj > 0 ? (
                                  <Tooltip tekst={`${nProj} project(en) gebruiken deze versie`}>
                                    <Badge kleur="blauw">{nProj}</Badge>
                                  </Tooltip>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              {magBeheren && (
                                <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                  <RijMenu items={bouwMenu(t)} />
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </Kaart>
          </section>
        ))
      )}

      {/* ---------- Modal: nieuw template ---------- */}
      <Modal
        open={nieuwOpen}
        titel="Nieuw template"
        onSluiten={() => setNieuwOpen(false)}
        voettekst={
          <>
            <Knop onClick={() => setNieuwOpen(false)}>Annuleren</Knop>
            <Knop variant="primary" disabled={nieuwOngeldig} onClick={maakNieuw}>
              Aanmaken
            </Knop>
          </>
        }
      >
        <div className="space-y-3">
          <Veld label="Trailertype" verplicht>
            <Keuze value={typeKeuze} onChange={(e) => setTypeKeuze(e.target.value)}>
              {TRAILERTYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
              <option value="__anders">Ander type…</option>
            </Keuze>
          </Veld>
          {typeKeuze === '__anders' && (
            <Veld label="Nieuw trailertype" verplicht>
              <Invoer value={typeVrij} onChange={(e) => setTypeVrij(e.target.value)} placeholder="Bijv. E20H" autoFocus />
            </Veld>
          )}
          <Veld label="Complexiteitsniveau" verplicht>
            <Keuze value={nieuwComplex} onChange={(e) => setNieuwComplex(e.target.value)}>
              {niveaus.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.naam} — {n.aanduiding}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Naam" verplicht>
            <Invoer
              value={nieuwNaamEffectief}
              onChange={(e) => {
                setNieuwNaam(e.target.value)
                setNaamHandmatig(true)
              }}
              placeholder="Bijv. E13H · Standaard"
            />
          </Veld>
          {nieuwLijnBestaat ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Er bestaat al een lijn <strong>{effectiefType} · {niveauNaam(nieuwComplex)}</strong>. Kies een ander type of
              niveau, of gebruik bij een bestaande lijn de actie “Nieuwe versie”.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Er wordt een leeg concept (versie 1) aangemaakt met de zes hoofdfases. Taken voeg je toe in de editor.
            </p>
          )}
        </div>
      </Modal>

      {/* ---------- Modal: nieuwe complexiteitsvariant ---------- */}
      <Modal
        open={variantBron !== null}
        titel="Nieuwe complexiteitsvariant"
        onSluiten={() => setVariantBron(null)}
        voettekst={
          <>
            <Knop onClick={() => setVariantBron(null)}>Annuleren</Knop>
            <Knop variant="primary" disabled={variantOngeldig} onClick={maakVariant}>
              Variant aanmaken
            </Knop>
          </>
        }
      >
        {variantBron && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Kopie van <strong>{variantBron.naam}</strong> (v{variantBron.versie}) als nieuwe conceptvariant voor een ander
              complexiteitsniveau van {variantBron.trailertype}.
            </p>
            <Veld label="Complexiteitsniveau" verplicht>
              <Keuze value={variantComplex} onChange={(e) => setVariantComplex(e.target.value)}>
                {niveaus.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.naam} — {n.aanduiding}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Naam" verplicht>
              <Invoer
                value={variantNaamEffectief}
                onChange={(e) => {
                  setVariantNaam(e.target.value)
                  setVariantNaamHandmatig(true)
                }}
              />
            </Veld>
            {variantLijnBestaat && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Er bestaat al een lijn <strong>{variantBron.trailertype} · {niveauNaam(variantComplex)}</strong>. Kies een
                niveau dat nog niet bestaat voor dit trailertype.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ---------- Bevestiging: publiceren ---------- */}
      <BevestigDialog
        open={publiceerDoel !== null}
        titel="Template publiceren"
        bevestigLabel="Publiceren"
        onAnnuleer={() => setPubliceerDoel(null)}
        onBevestig={bevestigPubliceren}
      >
        {publiceerDoel && (
          <p className="text-sm text-slate-600">
            Publiceer <strong>{publiceerDoel.naam}</strong> (versie {publiceerDoel.versie}). Deze wordt actief voor nieuwe
            projecten; een eventueel eerder gepubliceerde versie van dezelfde lijn wordt automatisch gearchiveerd.
          </p>
        )}
      </BevestigDialog>

      {/* ---------- Bevestiging: verwijderen ---------- */}
      <BevestigDialog
        open={verwijderDoel !== null}
        titel="Template verwijderen"
        bevestigLabel="Verwijderen"
        gevaarlijk
        onAnnuleer={() => setVerwijderDoel(null)}
        onBevestig={bevestigVerwijderen}
      >
        {verwijderDoel && (
          <p className="text-sm text-slate-600">
            Weet je zeker dat je <strong>{verwijderDoel.naam}</strong> (versie {verwijderDoel.versie}) definitief wilt
            verwijderen? Dit kan niet ongedaan worden gemaakt na het sluiten van de sessie.
          </p>
        )}
      </BevestigDialog>
    </div>
  )
}
