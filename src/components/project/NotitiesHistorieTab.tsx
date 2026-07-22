// Tab "Notities & historie" op de projectdetailpagina: vrije projectnotities (het
// vrije tekstveld op het project zelf), gestructureerde notities op project-, fase-,
// proces- en taakniveau en de automatisch bijgehouden wijzigingshistorie.

import { useEffect, useState } from 'react'
import { Plus, Star, Trash2, Truck, User } from 'lucide-react'
import { useApp } from '../../store/AppState'
import type { NotitieNiveau, Project } from '../../lib/types'
import { projectFases } from '../../lib/capacity'
import { uid } from '../../lib/uid'
import {
  Badge,
  BevestigDialog,
  Kaart,
  KaartKop,
  Keuze,
  Knop,
  LegeStaat,
  Tekstvak,
  Veld,
  useToast,
  type BadgeKleur,
} from '../ui'

const NIVEAU_META: Record<NotitieNiveau, { label: string; kleur: BadgeKleur }> = {
  project: { label: 'Project', kleur: 'grijs' },
  fase: { label: 'Fase', kleur: 'blauw' },
  proces: { label: 'Proces', kleur: 'brand' },
  taak: { label: 'Taak', kleur: 'paars' },
}

/** 'dd-mm-jjjj uu:mm' van een ISO-datetime. */
function formatTijdstip(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- Vrije projectnotities (vrij tekstveld op het Project-object) ----------

function VrijeNotitiesKaart({ project }: { project: Project }) {
  const { dispatch, permissies } = useApp()
  const { toon } = useToast()
  const magBewerken = permissies.risicoBeheren || permissies.planningBewerken
  const [tekst, setTekst] = useState(project.notities)
  useEffect(() => setTekst(project.notities), [project.id, project.notities])

  const opslaan = () => {
    dispatch({ type: 'PROJECT_BIJWERKEN', id: project.id, patch: { notities: tekst } })
    toon('succes', 'Projectnotities opgeslagen.')
  }

  return (
    <Kaart>
      <KaartKop
        titel="Vrije projectnotities"
        uitleg="Algemeen notitieveld van dit project. Voor notities bij een specifieke fase, een proces of een taak gebruik je de kaart Notities hieronder."
      />
      <div className="p-4">
        {magBewerken ? (
          <>
            <Tekstvak rows={4} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Projectnotities…" />
            <div className="mt-2 flex justify-end">
              <Knop klein variant="primary" disabled={tekst === project.notities} onClick={opslaan}>
                Notities opslaan
              </Knop>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-600">{project.notities || 'Geen notities.'}</p>
        )}
      </div>
    </Kaart>
  )
}

// ---------- Gestructureerde notities (project / fase / proces / taak) ----------

type NotitieFilter = 'alles' | 'belangrijk' | NotitieNiveau

function NotitiesKaart({ project }: { project: Project }) {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const magBewerken = permissies.risicoBeheren || permissies.planningBewerken

  const fases = projectFases(data, project.id)
  const partijOpties = data.externePartijen.filter((p) => !p.gearchiveerd)
  const medewerkerOpties = data.medewerkers.filter((m) => m.actief)

  // ---------- Formulier ----------

  const [niveau, setNiveau] = useState<NotitieNiveau>('project')
  const [faseId, setFaseId] = useState('')
  const [procesId, setProcesId] = useState('')
  const [taakId, setTaakId] = useState('')
  const [tekst, setTekst] = useState('')
  const [belangrijk, setBelangrijk] = useState(false)
  const [medewerkerId, setMedewerkerId] = useState('')
  const [partijId, setPartijId] = useState('')
  const [fout, setFout] = useState<string | undefined>()

  const gekozenFase = fases.find((f) => f.id === faseId)
  const processen = gekozenFase?.werkpakketten ?? []
  const taken = processen.find((wp) => wp.id === procesId)?.taken ?? []

  const kiesFase = (id: string) => {
    setFaseId(id)
    const f = fases.find((x) => x.id === id)
    setProcesId(f?.werkpakketten[0]?.id ?? '')
    setTaakId(f?.werkpakketten[0]?.taken[0]?.id ?? '')
  }

  const kiesProces = (id: string) => {
    setProcesId(id)
    setTaakId(processen.find((wp) => wp.id === id)?.taken[0]?.id ?? '')
  }

  const kiesNiveau = (n: NotitieNiveau) => {
    setNiveau(n)
    if (n !== 'project' && !fases.some((f) => f.id === faseId)) kiesFase(fases[0]?.id ?? '')
  }

  const bepaalDoel = (): { id?: string; naam?: string } => {
    if (niveau === 'fase') return { id: faseId || undefined, naam: gekozenFase?.naam }
    if (niveau === 'proces') {
      const wp = processen.find((x) => x.id === procesId)
      return { id: wp?.id, naam: wp?.naam }
    }
    if (niveau === 'taak') {
      const t = taken.find((x) => x.id === taakId)
      return { id: t?.id, naam: t?.naam }
    }
    return {}
  }

  const toevoegen = () => {
    if (tekst.trim() === '') {
      setFout('Vul een notitietekst in.')
      return
    }
    const doel = bepaalDoel()
    dispatch({
      type: 'NOTITIE_TOEVOEGEN',
      notitie: {
        id: uid('not'),
        projectId: project.id,
        niveau,
        doelId: doel.id,
        doelNaam: doel.naam,
        tekst: tekst.trim(),
        tijdstip: new Date().toISOString(),
        auteur: persona.naam,
        medewerkerId: medewerkerId || undefined,
        partijId: partijId || undefined,
        belangrijk: belangrijk || undefined,
      },
    })
    toon('succes', 'Notitie toegevoegd.')
    setTekst('')
    setBelangrijk(false)
    setMedewerkerId('')
    setPartijId('')
    setFout(undefined)
  }

  // ---------- Lijst + filter ----------

  const [filter, setFilter] = useState<NotitieFilter>('alles')
  const [verwijderId, setVerwijderId] = useState<string | null>(null)

  const alle = data.projectNotities
    .filter((n) => n.projectId === project.id)
    .sort((a, b) => (a.tijdstip < b.tijdstip ? 1 : -1))
  const zichtbaar = alle.filter((n) =>
    filter === 'alles' ? true : filter === 'belangrijk' ? n.belangrijk === true : n.niveau === filter,
  )

  const medewerkerNaam = (id?: string) => (id ? data.medewerkers.find((m) => m.id === id)?.naam : undefined)
  const partijNaam = (id?: string) => (id ? data.externePartijen.find((p) => p.id === id)?.naam : undefined)

  const verwijder = () => {
    if (!verwijderId) return
    dispatch({ type: 'NOTITIE_VERWIJDEREN', id: verwijderId })
    setVerwijderId(null)
    toon('succes', 'Notitie verwijderd.', { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' }) })
  }

  return (
    <Kaart>
      <KaartKop
        titel="Notities"
        uitleg="Gestructureerde notities op project-, fase-, proces- of taakniveau, eventueel gekoppeld aan een medewerker of externe partner."
        rechts={
          <Keuze value={filter} onChange={(e) => setFilter(e.target.value as NotitieFilter)} className="!w-auto !py-1 text-xs">
            <option value="alles">Alles</option>
            <option value="belangrijk">Alleen belangrijk</option>
            <option value="project">Projectniveau</option>
            <option value="fase">Faseniveau</option>
            <option value="proces">Procesniveau</option>
            <option value="taak">Taakniveau</option>
          </Keuze>
        }
      />

      {magBewerken && (
        <div className="border-b border-slate-100 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Veld label="Niveau">
              <Keuze value={niveau} onChange={(e) => kiesNiveau(e.target.value as NotitieNiveau)}>
                <option value="project">Project (algemeen)</option>
                <option value="fase">Fase</option>
                <option value="proces">Proces</option>
                <option value="taak">Taak</option>
              </Keuze>
            </Veld>
            {niveau !== 'project' && (
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
                  {processen.length === 0 && <option value="">Geen processen in deze fase</option>}
                  {processen.map((wp) => (
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
                  {taken.length === 0 && <option value="">Geen taken in dit proces</option>}
                  {taken.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.naam}
                    </option>
                  ))}
                </Keuze>
              </Veld>
            )}
          </div>

          <Veld label="Notitie" verplicht fout={fout} className="mt-3">
            <Tekstvak
              rows={3}
              value={tekst}
              onChange={(e) => {
                setTekst(e.target.value)
                if (fout && e.target.value.trim() !== '') setFout(undefined)
              }}
              placeholder="Wat wil je vastleggen?"
            />
          </Veld>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Veld label="Gekoppelde medewerker (optioneel)">
              <Keuze value={medewerkerId} onChange={(e) => setMedewerkerId(e.target.value)}>
                <option value="">Geen</option>
                {medewerkerOpties.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Externe partner (optioneel)">
              <Keuze value={partijId} onChange={(e) => setPartijId(e.target.value)}>
                <option value="">Geen</option>
                {partijOpties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={belangrijk}
                onChange={(e) => setBelangrijk(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-700"
              />
              <Star size={14} className={belangrijk ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
              Markeer als belangrijk
            </label>
            <Knop klein variant="primary" onClick={toevoegen}>
              <Plus size={14} /> Notitie toevoegen
            </Knop>
          </div>
        </div>
      )}

      <div className="p-4">
        {zichtbaar.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400">
            {alle.length === 0 ? 'Nog geen notities bij dit project.' : 'Geen notities binnen dit filter.'}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {zichtbaar.map((n) => {
              const meta = NIVEAU_META[n.niveau]
              const medewerker = medewerkerNaam(n.medewerkerId)
              const partij = partijNaam(n.partijId)
              return (
                <li key={n.id} className="rounded-md border border-slate-200 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge kleur={meta.kleur}>{meta.label}</Badge>
                    {n.doelNaam && <span className="text-xs font-medium text-slate-600">{n.doelNaam}</span>}
                    {n.belangrijk && (
                      <span title="Belangrijk">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                      </span>
                    )}
                    {magBewerken && (
                      <button
                        onClick={() => setVerwijderId(n.id)}
                        title="Notitie verwijderen"
                        className="ml-auto rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{n.tekst}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>
                      {n.auteur} · <span className="tabular-nums">{formatTijdstip(n.tijdstip)}</span>
                    </span>
                    {medewerker && (
                      <span className="inline-flex items-center gap-1">
                        <User size={12} className="text-slate-400" /> {medewerker}
                      </span>
                    )}
                    {partij && (
                      <span className="inline-flex items-center gap-1">
                        <Truck size={12} className="text-slate-400" /> {partij}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <BevestigDialog
        open={verwijderId !== null}
        titel="Notitie verwijderen"
        tekst="Weet je zeker dat je deze notitie wilt verwijderen?"
        bevestigLabel="Verwijderen"
        gevaarlijk
        onBevestig={verwijder}
        onAnnuleer={() => setVerwijderId(null)}
      />
    </Kaart>
  )
}

// ---------- Historie ----------

function HistorieKaart({ project }: { project: Project }) {
  const { data } = useApp()
  const alle = data.projectHistorie
    .filter((h) => h.projectId === project.id)
    .sort((a, b) => (a.tijdstip < b.tijdstip ? 1 : -1))
  const items = alle.slice(0, 50)

  return (
    <Kaart>
      <KaartKop
        titel="Historie"
        uitleg="Belangrijke planwijzigingen — taken, uren, datums, statussen, bestanden, notities en externe partners — verschijnen hier automatisch."
        rechts={
          <span className="text-xs tabular-nums text-slate-400">
            {alle.length} {alle.length === 1 ? 'wijziging' : 'wijzigingen'}
          </span>
        }
      />
      {alle.length === 0 ? (
        <div className="p-4">
          <LegeStaat
            titel="Nog geen wijzigingen geregistreerd."
            tekst="Zodra de planning van dit project wordt aangepast, verschijnt de wijziging hier automatisch."
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Tijdstip</th>
                  <th className="px-3 py-2.5">Gebruiker</th>
                  <th className="px-3 py-2.5">Wijziging</th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-slate-500">
                      {formatTijdstip(h.tijdstip)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{h.gebruiker}</td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {h.wijziging}
                      {(h.oudeWaarde || h.nieuweWaarde) && (
                        <span className="mt-0.5 block text-xs">
                          {h.oudeWaarde && <span className="text-slate-400 line-through">{h.oudeWaarde}</span>}
                          {h.oudeWaarde && h.nieuweWaarde && <span className="mx-1 text-slate-400">→</span>}
                          {h.nieuweWaarde && <span className="font-medium text-slate-700">{h.nieuweWaarde}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alle.length > 50 && (
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
              De laatste 50 van {alle.length} wijzigingen worden getoond.
            </p>
          )}
        </>
      )}
    </Kaart>
  )
}

// ---------- Tab ----------

export default function NotitiesHistorieTab({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      <VrijeNotitiesKaart project={project} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <NotitiesKaart project={project} />
        <HistorieKaart project={project} />
      </div>
    </div>
  )
}
