// Tab "Bestanden" op de projectdetailpagina: bijlagen met echte lokale opslag in de
// browser (IndexedDB via lib/bestanden). Bestanden zijn koppelbaar aan het project,
// een fase, proces, taak of externe partner en zijn te bekijken, te downloaden, te
// bewerken en te verwijderen. Uploaden/bewerken alleen met permissie; management leest mee.

import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Download, Eye, FileText, Paperclip, Pencil, Trash2, Upload } from 'lucide-react'
import { useApp } from '../../store/AppState'
import type { BestandMeta, Fase, Project } from '../../lib/types'
import { projectFases } from '../../lib/capacity'
import { formatDatum } from '../../lib/dates'
import { uid } from '../../lib/uid'
import {
  bekijkBestand,
  bestandsTypeLabel,
  downloadBestand,
  formatGrootte,
  slaBestandOp,
  verwijderBestand,
} from '../../lib/bestanden'
import {
  Badge,
  BevestigDialog,
  Invoer,
  Kaart,
  KaartKop,
  Keuze,
  Knop,
  LegeStaat,
  Modal,
  Tooltip,
  Veld,
  useToast,
} from '../ui'

type KoppelNiveau = 'project' | 'fase' | 'proces' | 'taak' | 'partij'

const GEEN_INHOUD_UITLEG = 'Alleen de metadata van dit bestand is bewaard; er is geen bestandsinhoud beschikbaar.'

/** Leesbaar label van de koppeling van een bestand (meest specifieke niveau wint). */
function koppelLabel(
  fases: Fase[],
  partijNaam: (id: string) => string | undefined,
  b: BestandMeta,
): { prefix?: string; naam: string } {
  if (b.taakId) {
    for (const f of fases)
      for (const wp of f.werkpakketten) {
        const t = wp.taken.find((x) => x.id === b.taakId)
        if (t) return { prefix: 'Taak', naam: t.naam }
      }
    return { prefix: 'Taak', naam: 'Niet meer aanwezig' }
  }
  if (b.procesId) {
    for (const f of fases) {
      const wp = f.werkpakketten.find((x) => x.id === b.procesId)
      if (wp) return { prefix: 'Proces', naam: wp.naam }
    }
    return { prefix: 'Proces', naam: 'Niet meer aanwezig' }
  }
  if (b.faseId) {
    return { prefix: 'Fase', naam: fases.find((x) => x.id === b.faseId)?.naam ?? 'Niet meer aanwezig' }
  }
  if (b.partijId) return { prefix: 'Partner', naam: partijNaam(b.partijId) ?? 'Niet meer aanwezig' }
  return { naam: 'Project' }
}

/** Icoonknop voor tabelacties; toont een uitleg-tooltip wanneer de actie niet beschikbaar is. */
function ActieKnop({
  titel,
  uitgeschakeld,
  uitlegUitgeschakeld,
  gevaarlijk,
  onClick,
  children,
}: {
  titel: string
  uitgeschakeld?: boolean
  uitlegUitgeschakeld?: string
  gevaarlijk?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const knop = (
    <button
      onClick={onClick}
      disabled={uitgeschakeld}
      title={uitgeschakeld ? undefined : titel}
      className={`rounded p-1 transition-colors ${
        uitgeschakeld
          ? 'cursor-not-allowed text-slate-300'
          : gevaarlijk
            ? 'text-slate-400 hover:bg-red-50 hover:text-red-600'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
      }`}
    >
      {children}
    </button>
  )
  return uitgeschakeld && uitlegUitgeschakeld ? <Tooltip tekst={uitlegUitgeschakeld}>{knop}</Tooltip> : knop
}

export default function BestandenTab({ project }: { project: Project }) {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const magBewerken = permissies.risicoBeheren || permissies.planningBewerken

  const fases = projectFases(data, project.id)
  const partijOpties = data.externePartijen.filter((p) => !p.gearchiveerd)
  const partijNaam = (id: string) => data.externePartijen.find((p) => p.id === id)?.naam

  // ---------- Upload (verborgen input + drag-and-drop + koppelmodal) ----------

  const inputRef = useRef<HTMLInputElement>(null)
  const [wachtrij, setWachtrij] = useState<File[]>([])
  const [sleepActief, setSleepActief] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [niveau, setNiveau] = useState<KoppelNiveau>('project')
  const [faseId, setFaseId] = useState('')
  const [procesId, setProcesId] = useState('')
  const [taakId, setTaakId] = useState('')
  const [partijId, setPartijId] = useState('')
  const [omschrijving, setOmschrijving] = useState('')

  const koppelFase = fases.find((f) => f.id === faseId)
  const koppelProcessen = koppelFase?.werkpakketten ?? []
  const koppelTaken = koppelProcessen.find((wp) => wp.id === procesId)?.taken ?? []

  const kiesFase = (id: string) => {
    setFaseId(id)
    const f = fases.find((x) => x.id === id)
    setProcesId(f?.werkpakketten[0]?.id ?? '')
    setTaakId(f?.werkpakketten[0]?.taken[0]?.id ?? '')
  }

  const kiesProces = (id: string) => {
    setProcesId(id)
    setTaakId(koppelProcessen.find((wp) => wp.id === id)?.taken[0]?.id ?? '')
  }

  const ontvang = (files: File[]) => {
    if (files.length === 0) return
    if (!fases.some((f) => f.id === faseId)) kiesFase(fases[0]?.id ?? '')
    if (!partijOpties.some((p) => p.id === partijId)) setPartijId(partijOpties[0]?.id ?? '')
    setOmschrijving('')
    setWachtrij(files)
  }

  const opDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setSleepActief(false)
    ontvang(Array.from(e.dataTransfer.files))
  }

  const koppeling = (): Partial<Pick<BestandMeta, 'faseId' | 'procesId' | 'taakId' | 'partijId'>> => {
    if (niveau === 'partij') return { partijId: partijId || undefined }
    if (niveau === 'fase') return { faseId: faseId || undefined }
    if (niveau === 'proces') return { faseId: faseId || undefined, procesId: procesId || undefined }
    if (niveau === 'taak')
      return { faseId: faseId || undefined, procesId: procesId || undefined, taakId: taakId || undefined }
    return {}
  }

  const uploaden = async () => {
    if (wachtrij.length === 0 || bezig) return
    setBezig(true)
    const koppel = koppeling()
    let mislukt = 0
    for (const file of wachtrij) {
      const id = uid('bst')
      const opgeslagen = await slaBestandOp(id, file)
      if (!opgeslagen) mislukt += 1
      dispatch({
        type: 'BESTAND_TOEVOEGEN',
        bestand: {
          id,
          naam: file.name,
          type: file.type || 'application/octet-stream',
          grootte: file.size,
          uploadOp: new Date().toISOString(),
          door: persona.naam,
          projectId: project.id,
          ...koppel,
          omschrijving: omschrijving.trim() || undefined,
          opgeslagen,
        },
        gebruiker: persona.naam,
      })
    }
    setBezig(false)
    if (mislukt > 0)
      toon('waarschuwing', 'Bestandsinhoud kon niet lokaal worden opgeslagen; alleen de metadata is bewaard.')
    toon(
      'succes',
      wachtrij.length === 1 ? `"${wachtrij[0].name}" toegevoegd.` : `${wachtrij.length} bestanden toegevoegd.`,
    )
    setWachtrij([])
    setOmschrijving('')
  }

  const annuleerUpload = () => {
    if (bezig) return
    setWachtrij([])
    setOmschrijving('')
  }

  // ---------- Filters ----------

  const [zoek, setZoek] = useState('')
  const [filterFase, setFilterFase] = useState('alle')
  const [filterProces, setFilterProces] = useState('alle')
  const [filterTaak, setFilterTaak] = useState('alle')
  const [filterPartij, setFilterPartij] = useState('alle')
  const [filterType, setFilterType] = useState('alle')

  const filterFaseBron = filterFase === 'alle' ? fases : fases.filter((f) => f.id === filterFase)
  const procesFilterOpties = filterFaseBron.flatMap((f) =>
    f.werkpakketten.map((wp) => ({ id: wp.id, label: filterFase === 'alle' ? `${f.naam} · ${wp.naam}` : wp.naam })),
  )
  const taakFilterOpties = filterFaseBron.flatMap((f) =>
    f.werkpakketten
      .filter((wp) => filterProces === 'alle' || wp.id === filterProces)
      .flatMap((wp) => wp.taken.map((t) => ({ id: t.id, label: t.naam }))),
  )

  const projectBestanden = data.bestanden.filter((b) => b.projectId === project.id)
  const typeOpties = [...new Set(projectBestanden.map((b) => bestandsTypeLabel(b.type, b.naam)))].sort()

  const gefilterd = projectBestanden
    .filter((b) => {
      if (zoek.trim() && !b.naam.toLowerCase().includes(zoek.trim().toLowerCase())) return false
      if (filterFase !== 'alle' && b.faseId !== filterFase) return false
      if (filterProces !== 'alle' && b.procesId !== filterProces) return false
      if (filterTaak !== 'alle' && b.taakId !== filterTaak) return false
      if (filterPartij !== 'alle' && b.partijId !== filterPartij) return false
      if (filterType !== 'alle' && bestandsTypeLabel(b.type, b.naam) !== filterType) return false
      return true
    })
    .sort((a, b) => (a.uploadOp < b.uploadOp ? 1 : -1))

  const totaalBytes = gefilterd.reduce((s, b) => s + b.grootte, 0)
  const filtersActief =
    zoek.trim() !== '' ||
    filterFase !== 'alle' ||
    filterProces !== 'alle' ||
    filterTaak !== 'alle' ||
    filterPartij !== 'alle' ||
    filterType !== 'alle'

  const wisFilters = () => {
    setZoek('')
    setFilterFase('alle')
    setFilterProces('alle')
    setFilterTaak('alle')
    setFilterPartij('alle')
    setFilterType('alle')
  }

  // ---------- Acties per bestand ----------

  const [bewerkDoel, setBewerkDoel] = useState<BestandMeta | null>(null)
  const [bewerkNaam, setBewerkNaam] = useState('')
  const [bewerkOmschrijving, setBewerkOmschrijving] = useState('')
  const [verwijderDoel, setVerwijderDoel] = useState<BestandMeta | null>(null)

  const bekijk = async (b: BestandMeta) => {
    const ok = await bekijkBestand(b.id, b.naam)
    if (!ok) toon('fout', 'Bestandsinhoud niet gevonden in de lokale opslag.')
  }

  const download = async (b: BestandMeta) => {
    const ok = await downloadBestand(b.id, b.naam)
    if (!ok) toon('fout', 'Bestandsinhoud niet gevonden in de lokale opslag.')
  }

  const openBewerken = (b: BestandMeta) => {
    setBewerkDoel(b)
    setBewerkNaam(b.naam)
    setBewerkOmschrijving(b.omschrijving ?? '')
  }

  const bewaarBewerking = () => {
    if (!bewerkDoel) return
    dispatch({
      type: 'BESTAND_BIJWERKEN',
      id: bewerkDoel.id,
      patch: { naam: bewerkNaam.trim() || bewerkDoel.naam, omschrijving: bewerkOmschrijving.trim() || undefined },
    })
    toon('succes', 'Bestandsgegevens bijgewerkt.')
    setBewerkDoel(null)
  }

  const bevestigVerwijderen = async () => {
    if (!verwijderDoel) return
    const doel = verwijderDoel
    setVerwijderDoel(null)
    await verwijderBestand(doel.id)
    dispatch({ type: 'BESTAND_VERWIJDEREN', id: doel.id, gebruiker: persona.naam })
    toon('succes', `"${doel.naam}" verwijderd; de bestandsinhoud is definitief verwijderd.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
  }

  return (
    <div className="space-y-4">
      {magBewerken && (
        <Kaart>
          <KaartKop
            titel="Bestanden toevoegen"
            uitleg="Bestanden worden lokaal in je browser opgeslagen (IndexedDB) en gekoppeld aan dit project. Alle bestandstypen zijn toegestaan: PDF, Word, Excel, afbeeldingen, technische tekeningen en overige bestanden."
          />
          <div className="p-4">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setSleepActief(true)
              }}
              onDragLeave={() => setSleepActief(false)}
              onDrop={opDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors ${
                sleepActief ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50/50'
              }`}
            >
              <Upload size={20} className="text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Sleep bestanden hierheen</p>
              <p className="text-xs text-slate-400">of kies ze via de knop; meerdere bestanden tegelijk kan ook</p>
              <Knop klein variant="primary" onClick={() => inputRef.current?.click()}>
                <Paperclip size={14} /> Bestand toevoegen
              </Knop>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  ontvang(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </Kaart>
      )}

      <Kaart>
        <KaartKop
          titel="Bestanden"
          rechts={
            <span className="text-xs tabular-nums text-slate-400">
              {gefilterd.length === 1 ? '1 bestand' : `${gefilterd.length} bestanden`} · {formatGrootte(totaalBytes)}
            </span>
          }
        />
        {projectBestanden.length === 0 ? (
          <div className="p-4">
            <LegeStaat
              titel="Nog geen bestanden bij dit project."
              tekst={
                magBewerken
                  ? 'Voeg productietekeningen, orderbevestigingen of andere documenten toe via de uploadkaart hierboven.'
                  : 'Zodra de planner of projectmanager bestanden toevoegt, verschijnen ze hier.'
              }
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Zoeken</span>
                <Invoer
                  value={zoek}
                  onChange={(e) => setZoek(e.target.value)}
                  placeholder="Zoeken op naam…"
                  className="!w-44"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Fase</span>
                <Keuze
                  value={filterFase}
                  onChange={(e) => {
                    setFilterFase(e.target.value)
                    setFilterProces('alle')
                    setFilterTaak('alle')
                  }}
                  className="!w-auto"
                >
                  <option value="alle">Alle fases</option>
                  {fases.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.naam}
                    </option>
                  ))}
                </Keuze>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Proces</span>
                <Keuze
                  value={filterProces}
                  onChange={(e) => {
                    setFilterProces(e.target.value)
                    setFilterTaak('alle')
                  }}
                  className="!w-auto max-w-56"
                >
                  <option value="alle">Alle processen</option>
                  {procesFilterOpties.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Keuze>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Taak</span>
                <Keuze
                  value={filterTaak}
                  onChange={(e) => setFilterTaak(e.target.value)}
                  className="!w-auto max-w-56"
                >
                  <option value="alle">Alle taken</option>
                  {taakFilterOpties.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Keuze>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Externe partner</span>
                <Keuze value={filterPartij} onChange={(e) => setFilterPartij(e.target.value)} className="!w-auto">
                  <option value="alle">Alle partners</option>
                  {partijOpties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.naam}
                    </option>
                  ))}
                </Keuze>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Bestandstype</span>
                <Keuze value={filterType} onChange={(e) => setFilterType(e.target.value)} className="!w-auto">
                  <option value="alle">Alle types</option>
                  {typeOpties.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Keuze>
              </label>
              {filtersActief && (
                <Knop klein variant="ghost" onClick={wisFilters} className="mb-0.5">
                  Filters wissen
                </Knop>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">Bestand</th>
                    <th className="px-3 py-2.5">Grootte</th>
                    <th className="px-3 py-2.5">Geüpload</th>
                    <th className="px-3 py-2.5">Gekoppeld aan</th>
                    <th className="px-3 py-2.5">Omschrijving</th>
                    <th className="px-3 py-2.5 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                        Geen bestanden gevonden met de huidige filters.
                      </td>
                    </tr>
                  )}
                  {gefilterd.map((b) => {
                    const k = koppelLabel(fases, partijNaam, b)
                    return (
                      <tr key={b.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="flex items-start gap-2">
                            <FileText size={15} className="mt-0.5 shrink-0 text-slate-400" />
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="max-w-56 truncate font-medium text-slate-800" title={b.naam}>
                                {b.naam}
                              </span>
                              <Badge kleur="grijs">{bestandsTypeLabel(b.type, b.naam)}</Badge>
                              {!b.opgeslagen && (
                                <Badge
                                  kleur="amber"
                                  title="De bestandsinhoud kon niet lokaal worden opgeslagen; alleen de metadata is bewaard."
                                >
                                  alleen metadata
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">
                          {formatGrootte(b.grootte)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                          <span className="tabular-nums">{formatDatum(b.uploadOp.slice(0, 10))}</span>
                          <span className="block text-xs text-slate-500">door {b.door}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {k.prefix && (
                            <span className="block text-[11px] uppercase tracking-wide text-slate-400">{k.prefix}</span>
                          )}
                          <span className="text-slate-700">{k.naam}</span>
                        </td>
                        <td className="max-w-52 px-3 py-2.5 text-xs text-slate-600">{b.omschrijving || '—'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <ActieKnop
                              titel="Bekijken"
                              uitgeschakeld={!b.opgeslagen}
                              uitlegUitgeschakeld={GEEN_INHOUD_UITLEG}
                              onClick={() => void bekijk(b)}
                            >
                              <Eye size={15} />
                            </ActieKnop>
                            <ActieKnop
                              titel="Downloaden"
                              uitgeschakeld={!b.opgeslagen}
                              uitlegUitgeschakeld={GEEN_INHOUD_UITLEG}
                              onClick={() => void download(b)}
                            >
                              <Download size={15} />
                            </ActieKnop>
                            {magBewerken && (
                              <>
                                <ActieKnop titel="Bewerken" onClick={() => openBewerken(b)}>
                                  <Pencil size={15} />
                                </ActieKnop>
                                <ActieKnop titel="Verwijderen" gevaarlijk onClick={() => setVerwijderDoel(b)}>
                                  <Trash2 size={15} />
                                </ActieKnop>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Kaart>

      {/* Koppelformulier per upload */}
      <Modal
        open={wachtrij.length > 0}
        titel={wachtrij.length === 1 ? 'Bestand toevoegen' : `${wachtrij.length} bestanden toevoegen`}
        onSluiten={annuleerUpload}
        voettekst={
          <>
            <Knop onClick={annuleerUpload} disabled={bezig}>
              Annuleren
            </Knop>
            <Knop variant="primary" onClick={() => void uploaden()} disabled={bezig}>
              {bezig ? 'Bezig met opslaan…' : 'Toevoegen'}
            </Knop>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <ul className="space-y-1">
              {wachtrij.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span className="min-w-0 truncate" title={f.name}>
                    {f.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    <Badge kleur="grijs">{bestandsTypeLabel(f.type, f.name)}</Badge>
                    <span className="tabular-nums">{formatGrootte(f.size)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Veld label="Koppelen aan">
            <Keuze
              value={niveau}
              onChange={(e) => {
                const n = e.target.value as KoppelNiveau
                setNiveau(n)
                if ((n === 'fase' || n === 'proces' || n === 'taak') && !fases.some((f) => f.id === faseId))
                  kiesFase(fases[0]?.id ?? '')
                if (n === 'partij' && !partijOpties.some((p) => p.id === partijId))
                  setPartijId(partijOpties[0]?.id ?? '')
              }}
            >
              <option value="project">Project (algemeen)</option>
              <option value="fase">Fase</option>
              <option value="proces">Proces</option>
              <option value="taak">Taak</option>
              <option value="partij">Externe partner</option>
            </Keuze>
          </Veld>

          {(niveau === 'fase' || niveau === 'proces' || niveau === 'taak') && (
            <Veld label="Fase">
              <Keuze value={faseId} onChange={(e) => kiesFase(e.target.value)}>
                {fases.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}

          {(niveau === 'proces' || niveau === 'taak') && (
            <Veld label="Proces">
              <Keuze value={procesId} onChange={(e) => kiesProces(e.target.value)}>
                {koppelProcessen.length === 0 && <option value="">Geen processen in deze fase</option>}
                {koppelProcessen.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}

          {niveau === 'taak' && (
            <Veld label="Taak">
              <Keuze value={taakId} onChange={(e) => setTaakId(e.target.value)}>
                {koppelTaken.length === 0 && <option value="">Geen taken in dit proces</option>}
                {koppelTaken.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}

          {niveau === 'partij' && (
            <Veld label="Externe partner">
              <Keuze value={partijId} onChange={(e) => setPartijId(e.target.value)}>
                {partijOpties.length === 0 && <option value="">Geen externe partners beschikbaar</option>}
                {partijOpties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}

          <Veld label="Korte omschrijving (optioneel)">
            <Invoer
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              placeholder="Bijv. definitieve productietekening"
            />
          </Veld>

          <p className="text-xs text-slate-500">
            Bestanden worden lokaal in je browser opgeslagen en zijn alleen op dit apparaat beschikbaar.
          </p>
        </div>
      </Modal>

      {/* Naam en omschrijving bewerken */}
      <Modal
        open={bewerkDoel !== null}
        titel="Bestand bewerken"
        onSluiten={() => setBewerkDoel(null)}
        voettekst={
          <>
            <Knop onClick={() => setBewerkDoel(null)}>Annuleren</Knop>
            <Knop variant="primary" onClick={bewaarBewerking}>
              Opslaan
            </Knop>
          </>
        }
      >
        <div className="space-y-3">
          <Veld label="Bestandsnaam" verplicht>
            <Invoer value={bewerkNaam} onChange={(e) => setBewerkNaam(e.target.value)} />
          </Veld>
          <Veld label="Omschrijving">
            <Invoer
              value={bewerkOmschrijving}
              onChange={(e) => setBewerkOmschrijving(e.target.value)}
              placeholder="Korte omschrijving…"
            />
          </Veld>
        </div>
      </Modal>

      {/* Verwijderen bevestigen */}
      <BevestigDialog
        open={verwijderDoel !== null}
        titel="Bestand verwijderen"
        tekst={
          verwijderDoel
            ? `Weet je zeker dat je "${verwijderDoel.naam}" wilt verwijderen? De bestandsinhoud wordt definitief uit de lokale opslag verwijderd; alleen de registratie kan via ongedaan maken worden teruggezet.`
            : undefined
        }
        bevestigLabel="Verwijderen"
        gevaarlijk
        onBevestig={() => void bevestigVerwijderen()}
        onAnnuleer={() => setVerwijderDoel(null)}
      />
    </div>
  )
}
