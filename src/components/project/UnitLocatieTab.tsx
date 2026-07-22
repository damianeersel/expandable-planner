// Tab "Trailer en locatie" op de projectdetailpagina. Binnen Expandable is de
// fysieke trailer identiek aan het project: het PR-nummer is de enige identificatie.
// Er is dus geen apart unit-/serienummer. Zonder trailerlocatie: lege staat met de
// actie "Trailerlocatie instellen" (nieuwe trailer of een bestaande vrije trailer).

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  History,
  MapPin,
  OctagonAlert,
  Package,
  Plus,
  Truck,
  Unlink,
} from 'lucide-react'
import { useApp } from '../../store/AppState'
import { FASE_LABELS, UNIT_STATUS_LABELS, type Project, type Unit, type UnitStatus } from '../../lib/types'
import {
  dagenOpPlaats,
  getPlaatsInfo,
  getUnitWaarschuwingen,
  unitVanProject,
  volgendeGeplandeLocatie,
} from '../../lib/locaties'
import { getHuidigeFase } from '../../lib/capacity'
import { formatDatum } from '../../lib/dates'
import { uid } from '../../lib/uid'
import {
  Badge,
  BevestigDialog,
  InfoTip,
  Kaart,
  KaartKop,
  Knop,
  LegeStaat,
  Modal,
  Tekstvak,
  useToast,
  type BadgeKleur,
} from '../ui'

// ---------- Statuskleuren ----------

const UNIT_STATUS_KLEUR: Record<UnitStatus, BadgeKleur> = {
  niet_gestart: 'grijs',
  in_chassisbouw: 'blauw',
  wacht_panelenbouw: 'amber',
  in_panelenbouw: 'blauw',
  wacht_spuiter: 'amber',
  bij_spuiter: 'paars',
  wacht_afbouw: 'amber',
  in_afbouw: 'blauw',
  in_kwaliteitscontrole: 'blauw',
  productie_voltooid: 'groen',
  in_opslag: 'blauw',
  wacht_afhaling: 'groen',
  opgeleverd: 'grijs',
  geblokkeerd: 'rood',
}

function Rij({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  )
}

function formatTijdstip(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Label voor de huidige verblijfplaats van een trailer, ook zonder fysieke plaats. */
function huidigeLocatieNode(data: ReturnType<typeof useApp>['data'], unit: Unit): ReactNode {
  const info = getPlaatsInfo(data, unit.plaatsId)
  if (unit.status === 'bij_spuiter') {
    const spuiter = unit.bijExternePartijId
      ? data.externePartijen.find((e) => e.id === unit.bijExternePartijId)
      : undefined
    return (
      <span className="inline-flex items-center gap-1.5 text-purple-700">
        <Truck size={15} className="shrink-0" />
        Externe spuiter{spuiter ? ` — ${spuiter.naam}` : ''}
      </span>
    )
  }
  if (info) return info.label
  return <span className="font-normal text-slate-500">Geen fysieke plaats</span>
}

// ---------- Notities van de trailer ----------

function TrailerNotitiesKaart({ unit }: { unit: Unit }) {
  const { dispatch, permissies } = useApp()
  const { toon } = useToast()
  const [tekst, setTekst] = useState(unit.notities ?? '')
  useEffect(() => setTekst(unit.notities ?? ''), [unit.id, unit.notities])

  const opslaan = () => {
    dispatch({ type: 'UNIT_BIJWERKEN', id: unit.id, patch: { notities: tekst.trim() === '' ? undefined : tekst } })
    toon('succes', 'Notitie opgeslagen.')
  }

  return (
    <Kaart>
      <KaartKop titel="Notities bij deze trailer" />
      <div className="p-4">
        {permissies.unitsVerplaatsen ? (
          <>
            <Tekstvak
              rows={3}
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              placeholder="Bijzonderheden over deze fysieke trailer…"
            />
            <div className="mt-2 flex justify-end">
              <Knop klein variant="primary" disabled={tekst === (unit.notities ?? '')} onClick={opslaan}>
                Notitie opslaan
              </Knop>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-600">{unit.notities || 'Geen notities.'}</p>
        )}
      </div>
    </Kaart>
  )
}

// ---------- Detailweergave met gekoppelde trailer ----------

function TrailerDetails({ project, unit }: { project: Project; unit: Unit }) {
  const { data, dispatch, permissies } = useApp()
  const { toon } = useToast()
  const navigate = useNavigate()
  const [ontkoppelOpen, setOntkoppelOpen] = useState(false)

  const waarschuwingen = getUnitWaarschuwingen(data, unit)
  const volgende = volgendeGeplandeLocatie(data, unit)
  const fase = getHuidigeFase(data, project.id)
  const historie = data.locatieHistorie
    .filter((m) => m.unitId === unit.id)
    .sort((a, b) => b.tijdstip.localeCompare(a.tijdstip))
  const dagen = dagenOpPlaats(unit)

  const ontkoppel = () => {
    dispatch({ type: 'UNIT_KOPPELEN', unitId: unit.id, projectId: undefined })
    setOntkoppelOpen(false)
    toon('succes', `De trailerkoppeling van project ${project.projectnummer} is opgeheven.`, {
      label: 'Ongedaan maken',
      onClick: () => dispatch({ type: 'UNDO' }),
    })
  }

  return (
    <div className="space-y-4">
      {/* Actiebalk */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck size={18} className="text-brand-700" />
          <span className="text-sm font-bold text-slate-900">{project.projectnummer}</span>
          <Badge kleur={UNIT_STATUS_KLEUR[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Knop klein onClick={() => navigate(`/planning?view=locatie&unit=${unit.id}`)}>
            <MapPin size={14} /> Bekijk in locatieplanning
          </Knop>
          {permissies.unitsVerplaatsen && (
            <Knop klein variant="ghost" onClick={() => setOntkoppelOpen(true)}>
              <Unlink size={14} /> Trailer loskoppelen
            </Knop>
          )}
        </div>
      </div>

      {/* Waarschuwingen */}
      {waarschuwingen.length > 0 && (
        <div className="space-y-2">
          {waarschuwingen.map((w, i) => {
            const rood = w.soort === 'geblokkeerd'
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  rood ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {rood ? (
                  <OctagonAlert size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                )}
                <span>{w.tekst}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Kaart>
            <KaartKop titel="Trailer" uitleg="Binnen Expandable is de trailer identiek aan het project: het PR-nummer is de enige identificatie." />
            <div className="px-4 py-1">
              <Rij label="PR-nummer">
                <span className="font-semibold">{project.projectnummer}</span>
              </Rij>
              <Rij label="Klant">{project.klant}</Rij>
              <Rij label="Productmodel">{project.productModel}</Rij>
              <Rij label="Huidige fase">{fase ? FASE_LABELS[fase.key] : '—'}</Rij>
              <Rij label="Trailerstatus">
                <Badge kleur={UNIT_STATUS_KLEUR[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>
              </Rij>
            </div>
          </Kaart>
          <TrailerNotitiesKaart unit={unit} />
        </div>

        <Kaart className="self-start">
          <KaartKop
            titel="Huidige locatie & planning"
            uitleg="De fysieke plaats van de trailer in de hallen. De geplande verplaatsing wordt afgeleid uit de faseplanning van het project."
          />
          <div className="px-4 py-1">
            <Rij label="Huidige locatie">{huidigeLocatieNode(data, unit)}</Rij>
            <Rij label="Op deze plaats sinds">
              {unit.opPlaatsSinds ? (
                <>
                  {formatDatum(unit.opPlaatsSinds)}{' '}
                  <span className="font-normal text-slate-400">
                    · {dagen} {dagen === 1 ? 'dag' : 'dagen'}
                  </span>
                </>
              ) : (
                <span className="font-normal text-slate-400">—</span>
              )}
            </Rij>
            <Rij
              label={
                <>
                  Geplande vertrekdatum
                  <InfoTip tekst="Datum waarop de trailer deze plaats naar verwachting verlaat." />
                </>
              }
            >
              {unit.geplandeVertrekdatum ? (
                formatDatum(unit.geplandeVertrekdatum)
              ) : (
                <span className="font-normal text-slate-400">—</span>
              )}
            </Rij>
            <Rij
              label={
                <>
                  Volgende geplande verplaatsing
                  <InfoTip tekst="Afgeleid uit de eerstvolgende projectfase die in een andere zone plaatsvindt." />
                </>
              }
            >
              {volgende ? (
                <>
                  {volgende.zoneNaam}{' '}
                  <span className="font-normal text-slate-400">· vanaf {formatDatum(volgende.vanaf)}</span>
                </>
              ) : (
                <span className="font-normal text-slate-400">Geen verplaatsing gepland</span>
              )}
            </Rij>
            {unit.status === 'opgeleverd' && unit.opgehaaldOp && (
              <Rij label="Opgehaald op">
                {formatDatum(unit.opgehaaldOp)}
                {unit.transporteur ? ` · ${unit.transporteur}` : ''}
              </Rij>
            )}
          </div>
        </Kaart>
      </div>

      {/* Locatiehistorie */}
      <Kaart>
        <KaartKop
          titel={
            <>
              <History size={15} className="text-slate-400" />
              Locatiehistorie
            </>
          }
          uitleg="Alle geregistreerde fysieke verplaatsingen van deze trailer, nieuwste eerst."
        />
        {historie.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Er zijn nog geen verplaatsingen van deze trailer geregistreerd.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Datum & tijd</th>
                  <th className="px-4 py-2.5">Verplaatsing</th>
                  <th className="px-4 py-2.5">Reden</th>
                  <th className="px-4 py-2.5">Gebruiker</th>
                  <th className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1">
                      Fase aangepast
                      <InfoTip tekst="Bij deze verplaatsing zijn eerdere projectfases gereedgemeld en is de doelfase op 'In uitvoering' gezet." />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {historie.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
                      {formatTijdstip(m.tijdstip)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-500">{m.vanLabel}</span>
                        <ArrowRight size={13} className="shrink-0 text-slate-400" />
                        <span className="font-medium">{m.naarLabel}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {m.reden ?? '—'}
                      {m.opmerking && <div className="mt-0.5 text-xs italic text-slate-400">{m.opmerking}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{m.gebruiker}</td>
                    <td className="px-4 py-2.5 text-center">
                      {m.faseAangepast ? (
                        <Check size={15} className="inline text-emerald-600" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      <BevestigDialog
        open={ontkoppelOpen}
        titel="Trailer loskoppelen"
        tekst={`Weet je zeker dat je de fysieke trailer wilt loskoppelen van project ${project.projectnummer}? De trailer behoudt zijn fysieke plaats en historie, maar staat daarna zonder PR-nummer op de plattegrond.`}
        bevestigLabel="Loskoppelen"
        gevaarlijk
        onBevestig={ontkoppel}
        onAnnuleer={() => setOntkoppelOpen(false)}
      />
    </div>
  )
}

// ---------- Trailerlocatie instellen (zonder trailer) ----------

function InstelModal({ project, open, onSluiten }: { project: Project; open: boolean; onSluiten: () => void }) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()
  const [modus, setModus] = useState<'nieuw' | 'bestaand'>('nieuw')
  const [gekozenId, setGekozenId] = useState<string | undefined>()
  const [fout, setFout] = useState<string | undefined>()

  // Vrije trailers = trailers zonder project (bijv. voorraadchassis) die dit PR-nummer kunnen overnemen.
  const vrijeUnits = data.units.filter((u) => !u.projectId && u.status !== 'opgeleverd')

  useEffect(() => {
    if (open) {
      setModus('nieuw')
      setGekozenId(undefined)
      setFout(undefined)
    }
  }, [open])

  const meldMetUndo = (tekst: string) =>
    toon('succes', tekst, { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' }) })

  const opslaan = () => {
    if (modus === 'bestaand') {
      if (!gekozenId) {
        setFout('Kies eerst een bestaande trailer.')
        return
      }
      dispatch({ type: 'UNIT_KOPPELEN', unitId: gekozenId, projectId: project.id })
      meldMetUndo(`Trailer gekoppeld aan project ${project.projectnummer}.`)
    } else {
      const nieuweUnit: Unit = { id: uid('unit'), projectId: project.id, status: 'niet_gestart' }
      dispatch({ type: 'UNIT_TOEVOEGEN', unit: nieuweUnit })
      meldMetUndo(`Trailer ${project.projectnummer} aangemaakt — plaats hem via de locatieplanning.`)
    }
    onSluiten()
  }

  const keuzeKnopStijl = (actief: boolean) =>
    `flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
      actief
        ? 'border-brand-600 bg-brand-50 text-brand-800'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
    }`

  return (
    <Modal
      open={open}
      titel="Trailerlocatie instellen"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            {modus === 'nieuw' ? 'Trailer aanmaken' : 'Trailer koppelen'}
          </Knop>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          De trailer krijgt automatisch het PR-nummer <span className="font-semibold">{project.projectnummer}</span> van
          dit project.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={keuzeKnopStijl(modus === 'nieuw')} onClick={() => setModus('nieuw')}>
            <Plus size={15} /> Nieuwe trailer
          </button>
          <button
            type="button"
            className={keuzeKnopStijl(modus === 'bestaand')}
            onClick={() => setModus('bestaand')}
            disabled={vrijeUnits.length === 0}
          >
            <Package size={15} /> Bestaande vrije trailer
          </button>
        </div>

        {modus === 'nieuw' ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-3 py-4 text-sm text-slate-600">
            Er wordt een nieuwe fysieke trailer voor dit project aangemaakt met status “
            {UNIT_STATUS_LABELS.niet_gestart}”. De trailer verschijnt daarna in “Te plaatsen trailers” op de
            locatieplanning, waar je hem op een vrije plaats zet.
          </p>
        ) : vrijeUnits.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-3 py-4 text-center text-sm text-slate-500">
            Er zijn geen vrije trailers beschikbaar. Maak een nieuwe trailer aan.
          </p>
        ) : (
          <div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {vrijeUnits.map((u) => {
                const info = getPlaatsInfo(data, u.plaatsId)
                const gekozen = gekozenId === u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setGekozenId(u.id)
                      setFout(undefined)
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      gekozen
                        ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-200'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {info ? info.kortLabel : u.status === 'bij_spuiter' ? 'Externe spuiter' : 'Geen fysieke plaats'}
                      </span>
                      <Badge kleur={UNIT_STATUS_KLEUR[u.status]}>{UNIT_STATUS_LABELS[u.status]}</Badge>
                    </div>
                    {u.notities && <div className="mt-0.5 truncate text-xs text-slate-500">{u.notities}</div>}
                  </button>
                )
              })}
            </div>
            {fout && <p className="mt-2 text-xs text-red-600">{fout}</p>}
          </div>
        )}

        <p className="text-xs text-slate-500">Eén project heeft maximaal één fysieke trailer.</p>
      </div>
    </Modal>
  )
}

// ---------- Lege staat zonder trailer ----------

function GeenTrailer({ project }: { project: Project }) {
  const { permissies } = useApp()
  const [open, setOpen] = useState(false)

  return (
    <>
      <LegeStaat
        titel="Er is nog geen fysieke trailer aan dit project gekoppeld."
        tekst="Zodra een trailerlocatie is ingesteld, zie je hier de fysieke locatie, geplande verplaatsingen en de locatiehistorie."
        actie={
          permissies.unitsVerplaatsen ? (
            <Knop variant="primary" onClick={() => setOpen(true)}>
              <MapPin size={15} /> Trailerlocatie instellen
            </Knop>
          ) : undefined
        }
      />
      <InstelModal project={project} open={open} onSluiten={() => setOpen(false)} />
    </>
  )
}

// ---------- Hoofdcomponent ----------

export default function UnitLocatieTab({ project }: { project: Project }) {
  const { data } = useApp()
  const unit = unitVanProject(data, project.id)
  if (!unit) return <GeenTrailer project={project} />
  return <TrailerDetails project={project} unit={unit} />
}
