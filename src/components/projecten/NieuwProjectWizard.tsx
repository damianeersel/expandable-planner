// Wizard "Nieuw project vanuit Sales": van basisgegevens tot een schaduwproject dat
// wordt opgebouwd vanuit een gepubliceerd PRODUCTTEMPLATE (trailertype + complexiteit).
// Bestaat er geen template voor de combinatie, dan valt de wizard terug op de
// standaard faseplanning (maakStandaardFases).

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  Layers,
  ListChecks,
  Package,
  Save,
  Users,
  Wrench,
} from 'lucide-react'
import { useApp } from '../../store/AppState'
import { Badge, CapaciteitsBalk, InfoTip, Invoer, Keuze, Knop, Modal, Tekstvak, Veld, useToast } from '../ui'
import type { AppData, Complexiteit, Fase, ISODate, Prioriteit, Project } from '../../lib/types'
import { AFDELING_LABELS, PRIORITEIT_LABELS, TEMPLATE_STATUS_LABELS, TRAILERTYPES } from '../../lib/types'
import { addDagen, addWerkdagen, formatDatum, formatDatumMetDag, maxISO, startVanWeek, vandaagISO, weekNummer, werkdagenTussen } from '../../lib/dates'
import { genereerProjectVanTemplate, laatstGepubliceerd, naarProjectComplexiteit, templateTotalen } from '../../lib/templates'
import { maakStandaardFases } from '../../lib/planning'
import {
  afdelingBeschikbaarInWeek,
  afdelingGeplandInWeek,
  bezettingsPct,
  faseUrenInWeek,
  teamBeschikbaarInWeek,
  teamGeplandInWeek,
} from '../../lib/capacity'
import { uid } from '../../lib/uid'

const STAP_LABELS = ['Projectgegevens', 'Producttype', 'Complexiteit', 'Template', 'Verkoopkans', 'Controleren & opslaan']
const STAP_KORT = ['Project', 'Product', 'Niveau', 'Template', 'Kans', 'Controle']

const ANDERS = '__anders'

function volgendProjectnummer(bestaand: string[]): string {
  // Projectnummers hebben de vorm PR + viercijferig volgnummer (bijv. PR3348).
  let hoogste = 3300
  for (const nr of bestaand) {
    const m = nr.match(/^PR(\d{4})$/)
    if (m) hoogste = Math.max(hoogste, Number(m[1]))
  }
  return `PR${hoogste + 1}`
}

function kansLabel(kans: number): string {
  if (kans >= 90) return 'Vrijwel zekere order'
  if (kans >= 70) return 'Waarschijnlijke order'
  if (kans >= 40) return 'Reële kans'
  return 'Vroege verkenning'
}

/**
 * Vult voor de fallback-planning (zonder template) een standaardteam per fase in,
 * zodat het schaduwproject niet team-loos is. Spuiterfase krijgt een beschikbare spuiter.
 */
function metStandaardTeams(fases: Fase[], data: AppData): Fase[] {
  const spuiter =
    data.externePartijen.find((e) => e.type === 'spuiter' && e.status === 'beschikbaar') ??
    data.externePartijen.find((e) => e.type === 'spuiter')
  return fases.map((f) => {
    if (f.key === 'spuiter') return { ...f, externePartijId: spuiter?.id, teamId: undefined }
    const team =
      data.teams.find((t) => t.afdeling === f.afdeling) ??
      (f.afdeling === 'kwaliteit' ? data.teams.find((t) => t.afdeling === 'afbouw') : undefined)
    return { ...f, teamId: team?.id, externePartijId: undefined }
  })
}

/** Compacte statistiek-tegel voor de templatekaart. */
function StatTegel({ icon, label, waarde, sub }: { icon: ReactNode; label: string; waarde: ReactNode; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800">{waarde}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

export default function NieuwProjectWizard({ open, onSluiten }: { open: boolean; onSluiten: () => void }) {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const navigate = useNavigate()

  const [stap, setStap] = useState(0)
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [projectId, setProjectId] = useState(() => uid('proj'))

  // Stap 1 — projectgegevens
  const [projectnummer, setProjectnummer] = useState('')
  const [naam, setNaam] = useState('')
  const [klant, setKlant] = useState('')
  const [sales, setSales] = useState('')
  const [pmKeuze, setPmKeuze] = useState('')
  const [pmVrij, setPmVrij] = useState('')
  const [prioriteit, setPrioriteit] = useState<Prioriteit>('normaal')
  const [gewensteOplever, setGewensteOplever] = useState<ISODate>('')

  // Stap 2 — producttype
  const [trailertype, setTrailertype] = useState(TRAILERTYPES[0])
  const [bijzonderheden, setBijzonderheden] = useState('')

  // Stap 3 — complexiteit
  const [complexiteitId, setComplexiteitId] = useState('')

  // Stap 4 — template: uitgeschakelde optionele template-taak-ids
  const [optioneelUit, setOptioneelUit] = useState<Set<string>>(new Set())

  // Stap 5 — verkoopkans
  const [verkoopkans, setVerkoopkans] = useState(60)
  const [verwachteOrderdatum, setVerwachteOrderdatum] = useState<ISODate>('')

  // Stap 6 — controleren & opslaan
  const [startdatum, setStartdatum] = useState<ISODate>('')
  const [startHandmatig, setStartHandmatig] = useState(false)

  const niveaus = useMemo(() => [...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde), [data.complexiteitNiveaus])

  // Reset bij openen van de wizard.
  useEffect(() => {
    if (!open) return
    setStap(0)
    setFouten({})
    setProjectId(uid('proj'))
    setProjectnummer(volgendProjectnummer(data.projecten.map((p) => p.projectnummer)))
    setNaam('')
    setKlant('')
    setSales(persona.rol === 'sales' ? persona.naam : '')
    setPmKeuze('')
    setPmVrij('')
    setPrioriteit('normaal')
    setGewensteOplever('')
    setTrailertype(TRAILERTYPES[0])
    setBijzonderheden('')
    setComplexiteitId([...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde)[0]?.id ?? '')
    setOptioneelUit(new Set())
    setVerkoopkans(60)
    setVerwachteOrderdatum('')
    setStartdatum('')
    setStartHandmatig(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pmOpties = useMemo(() => [...new Set(data.projecten.map((p) => p.projectmanager))].sort((a, b) => a.localeCompare(b, 'nl')), [data.projecten])
  const salesOpties = useMemo(
    () => [...new Set(data.projecten.map((p) => p.salesverantwoordelijke))].sort((a, b) => a.localeCompare(b, 'nl')),
    [data.projecten],
  )
  const typesMetTemplate = useMemo(
    () => [...new Set(data.templates.filter((t) => t.status === 'gepubliceerd').map((t) => t.trailertype))].sort((a, b) => a.localeCompare(b, 'nl')),
    [data.templates],
  )

  const effectievePm = () => (pmKeuze === ANDERS ? pmVrij.trim() : pmKeuze)

  const huidigNiveau = niveaus.find((n) => n.id === complexiteitId)
  const afgeleideComplexiteit: Complexiteit = huidigNiveau ? naarProjectComplexiteit(huidigNiveau.volgorde) : 'gemiddeld'

  // Gekozen template = de meest recente gepubliceerde versie voor deze combinatie (of geen).
  const template = useMemo(
    () => laatstGepubliceerd(data.templates, trailertype, complexiteitId),
    [data.templates, trailertype, complexiteitId],
  )
  const totalen = useMemo(() => (template ? templateTotalen(template) : undefined), [template])

  // Voorlopige faseplanning: volledige kopie vanuit het template, of standaard-fallback.
  const previewFases = useMemo<Fase[]>(() => {
    if (!startdatum) return []
    if (template) return genereerProjectVanTemplate(template, projectId, startdatum, data, optioneelUit)
    return metStandaardTeams(maakStandaardFases(projectId, startdatum, afgeleideComplexiteit, data.instellingen), data)
  }, [template, startdatum, projectId, optioneelUit, afgeleideComplexiteit, data])

  const previewOplevering = previewFases.length > 0 ? previewFases.reduce((max, f) => maxISO(max, f.eind), previewFases[0].eind) : undefined
  const teLaat = !!(previewOplevering && gewensteOplever && previewOplevering > gewensteOplever)
  const teLaatDagen = teLaat && previewOplevering ? Math.max(1, werkdagenTussen(gewensteOplever, previewOplevering) - 1) : 0
  const totaalUren = previewFases.reduce((som, f) => som + f.uren, 0)

  // Capaciteitsindicatie voor de templatekaart: engineering-bezetting deze week.
  const dezeWeek = startVanWeek(vandaagISO())
  const engBeschikbaar = afdelingBeschikbaarInWeek(data, 'engineering', dezeWeek)
  const engPct = bezettingsPct(engBeschikbaar, afdelingGeplandInWeek(data, 'engineering', dezeWeek).definitief)
  const engineersBeschikbaar = data.medewerkers.filter((m) => m.actief && m.afdeling === 'engineering' && m.teamId).length

  // Lichte capaciteitscontrole van de voorlopige planning (project nog niet opgeslagen):
  // per team/week de definitieve belasting + de uren van dít project.
  const conflicten = useMemo(() => {
    if (previewFases.length === 0) return [] as { team: string; weekNr: number; pct: number; week: ISODate }[]
    const out: { team: string; weekNr: number; pct: number; week: ISODate }[] = []
    const gezien = new Set<string>()
    for (const fase of previewFases) {
      if (!fase.teamId || fase.uren <= 0) continue
      let week = startVanWeek(fase.start)
      while (week <= fase.eind) {
        const sleutel = `${fase.teamId}|${week}`
        if (!gezien.has(sleutel)) {
          gezien.add(sleutel)
          const beschikbaar = teamBeschikbaarInWeek(data, fase.teamId, week)
          let belasting = teamGeplandInWeek(data, fase.teamId, week).definitief
          for (const f2 of previewFases) if (f2.teamId === fase.teamId) belasting += faseUrenInWeek(f2, week)
          const pct = bezettingsPct(beschikbaar, belasting)
          if (pct > 100) out.push({ team: data.teams.find((t) => t.id === fase.teamId)?.naam ?? fase.teamId, weekNr: weekNummer(week), pct, week })
        }
        week = addDagen(week, 7)
      }
    }
    return out.sort((a, b) => (a.week < b.week ? -1 : 1))
  }, [previewFases, data])

  const toggleOptioneel = (taakId: string) =>
    setOptioneelUit((prev) => {
      const next = new Set(prev)
      if (next.has(taakId)) next.delete(taakId)
      else next.add(taakId)
      return next
    })

  const valideerStap = (i: number): Record<string, string> => {
    const f: Record<string, string> = {}
    if (i === 0) {
      const nr = projectnummer.trim()
      if (!nr) f.projectnummer = 'Vul een projectnummer in.'
      else if (data.projecten.some((p) => p.projectnummer.toLowerCase() === nr.toLowerCase()))
        f.projectnummer = 'Dit projectnummer bestaat al. Kies een uniek nummer.'
      if (!naam.trim()) f.naam = 'Vul een projectnaam in.'
      if (!klant.trim()) f.klant = 'Vul een klantnaam in.'
      if (!sales.trim()) f.sales = 'Vul de salesverantwoordelijke in.'
      if (!effectievePm()) f.pm = pmKeuze === ANDERS ? 'Vul de naam van de projectmanager in.' : 'Kies een projectmanager.'
      if (!gewensteOplever) f.oplever = 'Vul de gewenste opleverdatum in.'
      else if (gewensteOplever <= vandaagISO()) f.oplever = 'De gewenste opleverdatum moet in de toekomst liggen.'
    } else if (i === 1) {
      if (!trailertype.trim()) f.trailertype = 'Kies een trailertype.'
    } else if (i === 2) {
      if (!complexiteitId) f.niveau = 'Kies een complexiteitsniveau.'
    } else if (i === 4) {
      if (verkoopkans < 5 || verkoopkans > 95) f.kans = 'De verkoopkans moet tussen 5% en 95% liggen.'
      if (verwachteOrderdatum && gewensteOplever && gewensteOplever <= verwachteOrderdatum)
        f.orderdatum = 'De gewenste opleverdatum moet ná de verwachte orderdatum liggen.'
    } else if (i === 5) {
      if (!startdatum) f.start = 'Vul de startdatum van de eerste fase in.'
    }
    return f
  }

  const volgende = () => {
    const f = valideerStap(stap)
    if (Object.keys(f).length > 0) {
      setFouten(f)
      return
    }
    setFouten({})
    // Standaard startdatum eerste fase: 5 werkdagen na de verwachte orderdatum (of na vandaag).
    if (stap === 4 && !startHandmatig) {
      const basis = verwachteOrderdatum || vandaagISO()
      setStartdatum(addWerkdagen(addDagen(basis, 1), 5))
    }
    setStap((s) => Math.min(STAP_LABELS.length - 1, s + 1))
  }

  const vorige = () => {
    setFouten({})
    setStap((s) => Math.max(0, s - 1))
  }

  const opslaan = () => {
    for (let i = 0; i < STAP_LABELS.length; i++) {
      const f = valideerStap(i)
      if (Object.keys(f).length > 0) {
        setStap(i)
        setFouten(f)
        toon('fout', `Controleer de invoer bij stap ${i + 1} (${STAP_LABELS[i]}).`)
        return
      }
    }
    // Fases altijd vers genereren (volledige kopie, geen referentie naar het mastertemplate).
    const fases: Fase[] = template
      ? genereerProjectVanTemplate(template, projectId, startdatum, data, optioneelUit)
      : metStandaardTeams(maakStandaardFases(projectId, startdatum, afgeleideComplexiteit, data.instellingen), data)

    const project: Project = {
      id: projectId,
      projectnummer: projectnummer.trim(),
      naam: naam.trim(),
      klant: klant.trim(),
      productModel: trailertype,
      salesverantwoordelijke: sales.trim(),
      projectmanager: effectievePm(),
      status: 'schaduw',
      verkoopkans,
      prioriteit,
      complexiteit: afgeleideComplexiteit,
      verwachteOrderdatum: verwachteOrderdatum || undefined,
      gewensteOpleverdatum: gewensteOplever,
      bijzonderheden: bijzonderheden.trim() || undefined,
      notities: '',
      aangemaaktOp: vandaagISO(),
      ...(template
        ? {
            templateId: template.id,
            templateTrailertype: template.trailertype,
            templateComplexiteitId: template.complexiteitId,
            templateVersie: template.versie,
            projectspecifiekAangepast: false,
          }
        : {}),
    }
    dispatch({ type: 'PROJECT_TOEVOEGEN', project, fases })
    toon(
      'succes',
      template
        ? `Project ${project.projectnummer} aangemaakt vanuit template ${template.naam}.`
        : `Project ${project.projectnummer} aangemaakt als schaduwproject.`,
    )
    onSluiten()
    navigate(`/projecten/${projectId}`)
  }

  const teamNaam = (id?: string) => data.teams.find((t) => t.id === id)?.naam ?? '—'
  const spuiterNaam = (id?: string) => data.externePartijen.find((e) => e.id === id)?.naam ?? '—'

  if (!permissies.projectAanmaken) return null

  const sortedTf = template ? [...template.fases].sort((a, b) => a.volgorde - b.volgorde) : []

  return (
    <Modal
      open={open}
      titel="Nieuw project vanuit Sales"
      onSluiten={onSluiten}
      breed
      voettekst={
        <>
          {stap > 0 && (
            <Knop onClick={vorige}>
              <ChevronLeft size={16} />
              Vorige
            </Knop>
          )}
          {stap < STAP_LABELS.length - 1 ? (
            <Knop variant="primary" onClick={volgende}>
              Volgende
              <ChevronRight size={16} />
            </Knop>
          ) : (
            <Knop variant="primary" onClick={opslaan}>
              <Save size={16} />
              {template ? 'Template in schaduwplanning laden' : 'Opslaan als schaduwproject'}
            </Knop>
          )}
        </>
      }
    >
      {/* Stappenindicator */}
      <ol className="mb-5 flex items-center">
        {STAP_KORT.map((label, i) => (
          <Fragment key={label}>
            {i > 0 && <span className={`mx-1.5 h-0.5 flex-1 rounded ${i <= stap ? 'bg-brand-500' : 'bg-slate-200'}`} />}
            <li className="flex shrink-0 items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < stap ? 'bg-brand-600 text-white' : i === stap ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i < stap ? <Check size={13} /> : i + 1}
              </span>
              <span className={`text-xs font-medium ${i === stap ? 'text-brand-700' : 'text-slate-400'}`}>{label}</span>
            </li>
          </Fragment>
        ))}
      </ol>

      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        Stap {stap + 1} · {STAP_LABELS[stap]}
      </h3>

      {/* Stap 1 — Projectgegevens */}
      {stap === 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Veld label="Projectnummer" verplicht fout={fouten.projectnummer}>
            <Invoer value={projectnummer} onChange={(e) => setProjectnummer(e.target.value)} placeholder="PR3349" />
          </Veld>
          <Veld label="Projectnaam" verplicht fout={fouten.naam}>
            <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Roadshow trailer…" />
          </Veld>
          <Veld label="Klantnaam" verplicht fout={fouten.klant}>
            <Invoer value={klant} onChange={(e) => setKlant(e.target.value)} placeholder="Naam van de klant" />
          </Veld>
          <Veld label="Salesverantwoordelijke" verplicht fout={fouten.sales}>
            <>
              <Invoer value={sales} onChange={(e) => setSales(e.target.value)} list="wizard-sales-namen" placeholder="Naam salesverantwoordelijke" />
              <datalist id="wizard-sales-namen">
                {salesOpties.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          </Veld>
          <Veld label="Projectmanager" verplicht fout={fouten.pm}>
            <Keuze value={pmKeuze} onChange={(e) => setPmKeuze(e.target.value)}>
              <option value="">Kies een projectmanager…</option>
              {pmOpties.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
              <option value={ANDERS}>Anders, namelijk…</option>
            </Keuze>
          </Veld>
          {pmKeuze === ANDERS ? (
            <Veld label="Naam projectmanager" verplicht>
              <Invoer value={pmVrij} onChange={(e) => setPmVrij(e.target.value)} placeholder="Naam nieuwe projectmanager" />
            </Veld>
          ) : (
            <Veld label="Prioriteit">
              <Keuze value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as Prioriteit)}>
                {(Object.keys(PRIORITEIT_LABELS) as Prioriteit[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITEIT_LABELS[p]}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}
          {pmKeuze === ANDERS && (
            <Veld label="Prioriteit">
              <Keuze value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as Prioriteit)}>
                {(Object.keys(PRIORITEIT_LABELS) as Prioriteit[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITEIT_LABELS[p]}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}
          <Veld label="Gewenste opleverdatum" verplicht fout={fouten.oplever}>
            <Invoer type="date" value={gewensteOplever} onChange={(e) => setGewensteOplever(e.target.value)} />
          </Veld>
          <p className="col-span-2 text-xs leading-relaxed text-slate-500">
            De gewenste opleverdatum moet in de toekomst liggen. De verwachte orderdatum en startdatum stel je later in de wizard in.
          </p>
        </div>
      )}

      {/* Stap 2 — Producttype */}
      {stap === 1 && (
        <div className="space-y-4">
          <Veld label="Trailertype" verplicht fout={fouten.trailertype} className="max-w-64">
            <Keuze value={trailertype} onChange={(e) => setTrailertype(e.target.value)}>
              {TRAILERTYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Keuze>
          </Veld>
          {typesMetTemplate.length > 0 && (
            <p className="text-xs text-slate-500">
              Gepubliceerde templates beschikbaar voor: <span className="font-medium text-slate-600">{typesMetTemplate.join(', ')}</span>. Voor overige
              types wordt teruggevallen op de standaard faseplanning.
            </p>
          )}
          <Veld label="Bijzonderheden">
            <Tekstvak
              rows={3}
              value={bijzonderheden}
              onChange={(e) => setBijzonderheden(e.target.value)}
              placeholder="Bijv. dubbele uitschuif, extra AV-pakket, medische inrichting…"
            />
          </Veld>
        </div>
      )}

      {/* Stap 3 — Complexiteit */}
      {stap === 2 && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-500">
            Het complexiteitsniveau bepaalt welk template als basis voor de planning wordt gebruikt. Complexere niveaus bevatten meer engineering-uren,
            extra taken en langere doorlooptijden.
          </p>
          <div className="space-y-2">
            {niveaus.map((n) => {
              const beschikbaar = !!laatstGepubliceerd(data.templates, trailertype, n.id)
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setComplexiteitId(n.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors ${
                    complexiteitId === n.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{n.naam}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{n.aanduiding}</span>
                  </span>
                  {beschikbaar ? (
                    <Badge kleur="groen">Template beschikbaar</Badge>
                  ) : (
                    <Badge kleur="grijs">Geen template</Badge>
                  )}
                </button>
              )
            })}
          </div>
          {fouten.niveau && <p className="text-xs text-red-600">{fouten.niveau}</p>}
        </div>
      )}

      {/* Stap 4 — Template */}
      {stap === 3 && (
        <div className="space-y-4">
          {template && totalen ? (
            <div className="rounded-lg border border-slate-200">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-brand-700" />
                    <span className="text-sm font-semibold text-slate-800">{template.naam}</span>
                    <Badge kleur="brand">Versie {template.versie}</Badge>
                    <Badge kleur="groen">{TEMPLATE_STATUS_LABELS[template.status]}</Badge>
                  </div>
                  {template.omschrijving && <p className="mt-1 text-xs text-slate-500">{template.omschrijving}</p>}
                </div>
                {template.geldigVanaf && <span className="shrink-0 text-xs tabular-nums text-slate-400">Sinds {formatDatum(template.geldigVanaf)}</span>}
              </div>

              <div className="grid grid-cols-3 gap-2 p-4">
                <StatTegel icon={<Layers size={13} />} label="Fases" waarde={totalen.aantalFases} />
                <StatTegel
                  icon={<ListChecks size={13} />}
                  label="Taken"
                  waarde={totalen.aantalTaken}
                  sub={totalen.aantalOptioneel > 0 ? `${totalen.aantalOptioneel} optioneel` : undefined}
                />
                <StatTegel icon={<Clock size={13} />} label="Doorlooptijd" waarde={`${totalen.doorlooptijdWerkdagen} wd`} />
                <StatTegel icon={<Wrench size={13} />} label="Totale uren" waarde={totalen.totaleUren} sub={`${totalen.productieUren} u productie`} />
                <StatTegel icon={<Wrench size={13} />} label="Engineering-uren" waarde={totalen.engineeringUren} />
                <StatTegel
                  icon={<Users size={13} />}
                  label="Benodigde engineers"
                  waarde={totalen.benodigdeEngineers}
                  sub={`piek ${totalen.piekBezetting} medew.`}
                />
              </div>

              <div className="border-t border-slate-100 px-4 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Gauge size={13} />
                  Verwachte capaciteit
                  <InfoTip tekst="Indicatie op basis van de huidige definitieve belasting. De exacte belasting hangt af van de startdatum die je in de laatste stap kiest." />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <div>
                    <span className="mb-1 block text-xs text-slate-500">Engineering-bezetting (deze week)</span>
                    <CapaciteitsBalk pct={engPct} />
                  </div>
                  <div className="text-xs text-slate-600">
                    Dit template vraagt tegelijk <span className="font-medium">{totalen.benodigdeEngineers}</span> engineer(s).{' '}
                    {engineersBeschikbaar >= totalen.benodigdeEngineers ? (
                      <Badge kleur="groen">{engineersBeschikbaar} engineers beschikbaar</Badge>
                    ) : (
                      <Badge kleur="amber">Krap: {engineersBeschikbaar} engineers beschikbaar</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Geen gepubliceerd template voor {trailertype} · {huidigNiveau?.naam ?? 'onbekend niveau'}.</p>
                <p className="mt-1 text-amber-700">
                  Je kunt teruggaan en een ander complexiteitsniveau kiezen, of doorgaan met de standaard faseplanning (afgeleid van de complexiteit).
                  Het project wordt dan zonder templatekoppeling aangemaakt.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stap 5 — Verkoopkans */}
      {stap === 4 && (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600">Verkoopkans</span>
              <InfoTip tekst="In het scenario 'Definitief + kansgewogen' telt een schaduwproject voor dit percentage mee in de capaciteitsbelasting. Een project met 70% verkoopkans belast teams dan voor 70% van de geplande uren." />
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={5}
                max={95}
                step={5}
                value={verkoopkans}
                onChange={(e) => setVerkoopkans(Number(e.target.value))}
                className="w-full accent-brand-700"
              />
              <span className="w-16 shrink-0 text-right text-2xl font-semibold tabular-nums text-brand-700">{verkoopkans}%</span>
            </div>
            <div className="rounded-md bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">
              <span className="font-medium">{kansLabel(verkoopkans)}.</span> In het kansgewogen capaciteitsscenario telt dit project voor {verkoopkans}%
              van de geplande uren mee.
            </div>
            {fouten.kans && <p className="text-xs text-red-600">{fouten.kans}</p>}
          </div>

          <Veld label="Verwachte orderdatum" fout={fouten.orderdatum} className="max-w-56">
            <Invoer type="date" value={verwachteOrderdatum} onChange={(e) => setVerwachteOrderdatum(e.target.value)} />
          </Veld>
          <p className="text-xs leading-relaxed text-slate-500">
            Het moment waarop de klant naar verwachting tekent (optioneel). Dit bepaalt de standaard startdatum van de planning: 5 werkdagen na de
            orderdatum, of anders 5 werkdagen na vandaag.
          </p>
        </div>
      )}

      {/* Stap 6 — Controleren & opslaan */}
      {stap === 5 && (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <Veld label="Startdatum eerste fase" verplicht fout={fouten.start} className="max-w-56">
              <Invoer
                type="date"
                value={startdatum}
                onChange={(e) => {
                  setStartdatum(e.target.value)
                  setStartHandmatig(true)
                }}
              />
            </Veld>
            <p className="pb-1 text-xs text-slate-500">
              {template ? 'Template' : 'Standaard planning'} · {previewFases.length} fases · {totaalUren} uur intern werk
            </p>
          </div>

          {/* Melding welke basis wordt geladen */}
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
            <Package size={16} className="shrink-0 text-brand-700" />
            {template ? (
              <span>
                Planning wordt geladen vanuit template <span className="font-medium text-slate-800">{template.naam}</span> (versie {template.versie}).
                Optionele taken kun je hieronder aan- of uitzetten.
              </span>
            ) : (
              <span>
                Geen template gevonden — er wordt een <span className="font-medium text-slate-800">standaard faseplanning</span> geladen op basis van de
                gekozen complexiteit.
              </span>
            )}
          </div>

          {/* Fases & taken vanuit het template met optionele-taak-checkboxes */}
          {template && (
            <div className="space-y-2">
              {sortedTf.map((tf, i) => {
                const gf = previewFases[i]
                const takenSorted = [...tf.taken].sort((a, b) => a.volgorde - b.volgorde)
                const partner = gf ? (tf.key === 'spuiter' ? spuiterNaam(gf.externePartijId) : teamNaam(gf.teamId)) : '—'
                return (
                  <div key={tf.id} className="overflow-hidden rounded-md border border-slate-200">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800">{tf.naam}</span>
                        <span className="ml-2 text-xs text-slate-500">{AFDELING_LABELS[tf.afdeling]}</span>
                      </div>
                      <div className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {gf && <span>{formatDatumMetDag(gf.start)} – {formatDatumMetDag(gf.eind)}</span>}
                        <div className="text-slate-400">
                          {partner}
                          {gf && gf.uren > 0 ? ` · ${gf.uren} u` : ''}
                        </div>
                      </div>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {takenSorted.map((taak) => {
                        const actief = !optioneelUit.has(taak.id)
                        return (
                          <li key={taak.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              {taak.optioneel ? (
                                <input
                                  type="checkbox"
                                  checked={actief}
                                  onChange={() => toggleOptioneel(taak.id)}
                                  className="h-3.5 w-3.5 accent-brand-700"
                                />
                              ) : (
                                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                              )}
                              <span className={`truncate ${actief ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{taak.naam}</span>
                              {taak.optioneel && <Badge kleur="grijs">optioneel</Badge>}
                            </span>
                            <span className={`shrink-0 text-xs tabular-nums ${actief ? 'text-slate-500' : 'text-slate-300'}`}>
                              {taak.uren > 0 ? `${taak.uren} u` : '—'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {/* Fallback: eenvoudige preview van de standaard fases */}
          {!template && previewFases.length > 0 && (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Standaard planning ({previewFases.length} fases · {totaalUren} uur)
              </p>
              <ul className="divide-y divide-slate-100 text-sm">
                {previewFases.map((fase) => (
                  <li key={fase.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-slate-700">{fase.naam}</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {formatDatumMetDag(fase.start)} – {formatDatumMetDag(fase.eind)} ·{' '}
                      {fase.key === 'spuiter' ? spuiterNaam(fase.externePartijId) : teamNaam(fase.teamId)}
                      {fase.uren > 0 ? ` · ${fase.uren} u` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Verwachte start & oplevering */}
          {previewFases.length > 0 && previewOplevering && (
            <p className="text-sm text-slate-600">
              Verwachte start: <span className="font-medium tabular-nums text-slate-800">{formatDatum(previewFases[0].start)}</span> · verwachte
              oplevering: <span className={`font-medium tabular-nums ${teLaat ? 'text-red-600' : 'text-slate-800'}`}>{formatDatum(previewOplevering)}</span>
            </p>
          )}

          {teLaat && previewOplevering && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                De verwachte oplevering ({formatDatum(previewOplevering)}) ligt {teLaatDagen} werkdag(en) ná de gewenste opleverdatum (
                {formatDatum(gewensteOplever)}). Overweeg een eerdere start of pas de planning na het aanmaken aan.
              </span>
            </div>
          )}

          {conflicten.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              <Gauge size={16} className="mt-0.5 shrink-0" />
              <span>
                Mogelijke capaciteitskrapte in {conflicten.length} team-week(en):{' '}
                {conflicten.slice(0, 3).map((c, i) => (
                  <span key={`${c.team}-${c.week}`}>
                    {i > 0 ? ', ' : ''}
                    {c.team} (wk {c.weekNr}, {c.pct}%)
                  </span>
                ))}
                {conflicten.length > 3 ? ', …' : ''}. Deze indicatie telt alle definitieve belasting mee.
              </span>
            </div>
          )}

          {/* Beknopte samenvatting */}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 rounded-md border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
            <dt className="text-slate-500">Projectnummer</dt>
            <dd className="font-medium text-slate-800">{projectnummer}</dd>
            <dt className="text-slate-500">Projectnaam</dt>
            <dd className="text-slate-800">{naam}</dd>
            <dt className="text-slate-500">Klant</dt>
            <dd className="text-slate-800">{klant}</dd>
            <dt className="text-slate-500">Trailertype</dt>
            <dd className="text-slate-800">{trailertype}</dd>
            <dt className="text-slate-500">Complexiteit</dt>
            <dd className="text-slate-800">
              {huidigNiveau ? `${huidigNiveau.naam} · ${huidigNiveau.aanduiding}` : '—'}
            </dd>
            <dt className="text-slate-500">Template</dt>
            <dd className="text-slate-800">{template ? `${template.naam} (versie ${template.versie})` : 'Standaard planning (geen template)'}</dd>
            <dt className="text-slate-500">Sales / PM</dt>
            <dd className="text-slate-800">
              {sales} · {effectievePm()}
            </dd>
            <dt className="text-slate-500">Prioriteit / verkoopkans</dt>
            <dd className="text-slate-800">
              {PRIORITEIT_LABELS[prioriteit]} · {verkoopkans}%
            </dd>
            {verwachteOrderdatum && (
              <>
                <dt className="text-slate-500">Verwachte orderdatum</dt>
                <dd className="tabular-nums text-slate-800">{formatDatum(verwachteOrderdatum)}</dd>
              </>
            )}
            <dt className="text-slate-500">Gewenste opleverdatum</dt>
            <dd className="tabular-nums text-slate-800">{gewensteOplever ? formatDatum(gewensteOplever) : '—'}</dd>
          </dl>

          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            Het project wordt opgeslagen als schaduwproject
            <InfoTip tekst="Een schaduwproject is een voorlopige reservering vóór orderbevestiging. Het telt in capaciteitsweergaven mee volgens het gekozen scenario en kan bij orderbevestiging definitief worden gemaakt." />
          </p>
        </div>
      )}
    </Modal>
  )
}
