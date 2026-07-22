// Dialogen voor de locatieplanning: verplaatsen (met fase-controle), wisselen,
// markeren als opgehaald en de volledige locatiehistorie.

import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Check, Info } from 'lucide-react'
import { useApp } from '../../store/AppState'
import { UNIT_STATUS_LABELS, VERPLAATS_REDENEN, type UnitStatus } from '../../lib/types'
import { formatDatum, vandaagISO } from '../../lib/dates'
import {
  getPlaatsInfo,
  productieVoltooid,
  trailerLabel,
  verwachteZoneVoorProject,
  zoneNaarActieveStatus,
  ZONE_OPSLAG,
} from '../../lib/locaties'
import { Invoer, Keuze, Knop, Modal, Tekstvak, Veld, useToast } from '../ui'
import { formatTijdstip, huidigeLocatieLabel, projectVanUnit } from './helpers'

/** Toast met een korte undo-actie. */
function useUndoToast() {
  const { dispatch } = useApp()
  const { toon } = useToast()
  return (tekst: string) =>
    toon('succes', tekst, { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' }) })
}

// ---------- Verplaatsen ----------

export function VerplaatsDialoog({
  unitId,
  plaatsId,
  onSluiten,
  onVerplaatst,
}: {
  unitId: string
  plaatsId: string
  onSluiten: () => void
  onVerplaatst?: () => void
}) {
  const { data, dispatch, persona } = useApp()
  const meldMetUndo = useUndoToast()

  const unit = data.units.find((u) => u.id === unitId)
  const doel = getPlaatsInfo(data, plaatsId)
  const project = unit ? projectVanUnit(data, unit) : undefined

  const huidigeZoneId = unit ? getPlaatsInfo(data, unit.plaatsId)?.zone.id : undefined
  const doelZoneId = doel?.zone.id
  const zelfdeZone = !!huidigeZoneId && huidigeZoneId === doelZoneId

  const verwachteZoneId = project ? verwachteZoneVoorProject(data, project.id) : undefined
  const verwachteZoneNaam = verwachteZoneId ? data.zones.find((z) => z.id === verwachteZoneId)?.naam : undefined
  const wijktAf = !!project && !!doelZoneId && !!verwachteZoneId && verwachteZoneId !== doelZoneId
  const toonFaseKeuze = !!project && !zelfdeZone

  const statusVoorstel: UnitStatus = useMemo(() => {
    if (!doelZoneId || !unit) return unit?.status ?? 'niet_gestart'
    if (doelZoneId === ZONE_OPSLAG) {
      return project && productieVoltooid(data, project.id) ? 'wacht_afhaling' : 'in_opslag'
    }
    return zoneNaarActieveStatus(doelZoneId)
  }, [data, unit, project, doelZoneId])

  const [status, setStatus] = useState<UnitStatus>(statusVoorstel)
  const [faseKeuze, setFaseKeuze] = useState<'aanpassen' | 'alleen_fysiek'>('aanpassen')
  const [reden, setReden] = useState('')
  const [opmerking, setOpmerking] = useState('')

  if (!unit || !doel) return null

  const bevestig = () => {
    const faseAanpassen = toonFaseKeuze ? faseKeuze === 'aanpassen' : false
    const afwijking = toonFaseKeuze ? faseKeuze === 'alleen_fysiek' : !!unit.afwijkingVanPlanning
    dispatch({
      type: 'UNIT_VERPLAATSEN',
      unitId: unit.id,
      naarPlaatsId: plaatsId,
      nieuweStatus: status,
      faseAanpassen,
      afwijking,
      reden: reden || undefined,
      opmerking: opmerking.trim() || undefined,
      gebruiker: persona.naam,
      tijdstip: new Date().toISOString(),
    })
    meldMetUndo(
      `${trailerLabel(data, unit)} verplaatst naar ${doel.kortLabel}${faseAanpassen ? ' — projectfase bijgewerkt' : ''}.`,
    )
    onVerplaatst?.()
    onSluiten()
  }

  return (
    <Modal
      open
      titel="Trailer verplaatsen"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={bevestig}>
            Verplaatsen
          </Knop>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium text-slate-800">{trailerLabel(data, unit)}</div>
          {project && (
            <div className="text-xs text-slate-500">
              {project.projectnummer} · {project.klant}
            </div>
          )}
          <div className="mt-1.5 text-xs text-slate-600">
            <span className="text-slate-400">Van:</span> {huidigeLocatieLabel(data, unit)}
            <br />
            <span className="text-slate-400">Naar:</span> {doel.label}
          </div>
        </div>

        {toonFaseKeuze && (
          <div
            className={`rounded-md border px-3 py-2.5 text-sm ${wijktAf ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
          >
            <div className="mb-2 flex items-start gap-2">
              {wijktAf ? (
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
              ) : (
                <Info size={15} className="mt-0.5 shrink-0 text-sky-500" />
              )}
              <p className="text-xs leading-relaxed text-slate-700">
                {wijktAf
                  ? `Deze trailer staat volgens de projectplanning nog in ${verwachteZoneNaam}, maar wordt fysiek verplaatst naar ${doel.zone.naam}.`
                  : 'De projectfase kan bij deze verplaatsing automatisch worden bijgewerkt.'}
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
              <input
                type="radio"
                name="fasekeuze"
                checked={faseKeuze === 'aanpassen'}
                onChange={() => setFaseKeuze('aanpassen')}
                className="accent-brand-600"
              />
              Verplaatsen en projectfase aanpassen
            </label>
            <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
              <input
                type="radio"
                name="fasekeuze"
                checked={faseKeuze === 'alleen_fysiek'}
                onChange={() => setFaseKeuze('alleen_fysiek')}
                className="accent-brand-600"
              />
              <span>
                Alleen fysieke locatie aanpassen
                <span className="block text-[11px] text-slate-400">
                  De trailer krijgt de waarschuwing “Fysieke locatie wijkt af van de projectplanning.”
                </span>
              </span>
            </label>
          </div>
        )}

        <Veld label="Nieuwe trailerstatus">
          <Keuze value={status} onChange={(e) => setStatus(e.target.value as UnitStatus)}>
            {Object.entries(UNIT_STATUS_LABELS)
              .filter(([w]) => w !== 'opgeleverd')
              .map(([waarde, label]) => (
                <option key={waarde} value={waarde}>
                  {label}
                </option>
              ))}
          </Keuze>
        </Veld>

        <div className="grid grid-cols-2 gap-3">
          <Veld label="Reden (optioneel)">
            <Keuze value={reden} onChange={(e) => setReden(e.target.value)}>
              <option value="">— Geen reden —</option>
              {VERPLAATS_REDENEN.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Opmerking (optioneel)">
            <Invoer value={opmerking} onChange={(e) => setOpmerking(e.target.value)} placeholder="Korte toelichting…" />
          </Veld>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Wisselen ----------

export function WisselDialoog({
  unitId,
  doelUnitId,
  onSluiten,
  onAnderePlaats,
}: {
  unitId: string
  doelUnitId: string
  onSluiten: () => void
  onAnderePlaats: (unitId: string) => void
}) {
  const { data, dispatch, persona } = useApp()
  const meldMetUndo = useUndoToast()

  const unitA = data.units.find((u) => u.id === unitId)
  const unitB = data.units.find((u) => u.id === doelUnitId)
  if (!unitA || !unitB) return null

  const kanWisselen = !!unitA.plaatsId

  const wissel = () => {
    dispatch({
      type: 'UNITS_WISSELEN',
      unitIdA: unitA.id,
      unitIdB: unitB.id,
      gebruiker: persona.naam,
      tijdstip: new Date().toISOString(),
    })
    meldMetUndo(`${trailerLabel(data, unitA)} en ${trailerLabel(data, unitB)} zijn van plaats gewisseld.`)
    onSluiten()
  }

  return (
    <Modal
      open
      titel="Plaats is bezet"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop
            onClick={() => {
              onSluiten()
              onAnderePlaats(unitA.id)
            }}
          >
            Andere plaats kiezen
          </Knop>
          {kanWisselen && (
            <Knop variant="primary" onClick={wissel}>
              <ArrowLeftRight size={14} /> Units wisselen
            </Knop>
          )}
        </>
      }
    >
      <p className="text-sm text-slate-700">
        Deze plaats is al bezet door <strong>{trailerLabel(data, unitB)}</strong>. Wil je de twee trailers van plaats
        laten wisselen?
      </p>
      {!kanWisselen && (
        <p className="mt-2 text-xs text-amber-600">
          {trailerLabel(data, unitA)} heeft nog geen fysieke plaats en kan daarom niet wisselen. Kies een vrije plaats.
        </p>
      )}
    </Modal>
  )
}

// ---------- Markeer als opgehaald ----------

export function OpgehaaldDialoog({ unitId, onSluiten }: { unitId: string; onSluiten: () => void }) {
  const { data, dispatch, persona } = useApp()
  const meldMetUndo = useUndoToast()
  const [datum, setDatum] = useState(vandaagISO())
  const [transporteur, setTransporteur] = useState('')
  const [notitie, setNotitie] = useState('')
  const [fout, setFout] = useState('')

  const unit = data.units.find((u) => u.id === unitId)
  if (!unit) return null
  const plaats = getPlaatsInfo(data, unit.plaatsId)

  const bevestig = () => {
    if (!datum) {
      setFout('Vul de werkelijke ophaaldatum in.')
      return
    }
    dispatch({
      type: 'UNIT_OPGEHAALD',
      unitId: unit.id,
      datum,
      transporteur: transporteur.trim() || undefined,
      opmerking: notitie.trim() || undefined,
      gebruiker: persona.naam,
      tijdstip: new Date().toISOString(),
    })
    meldMetUndo(
      `${trailerLabel(data, unit)} gemarkeerd als opgehaald${plaats ? ` — ${plaats.plaats.naam} is vrijgegeven` : ''}.`,
    )
    onSluiten()
  }

  return (
    <Modal
      open
      titel="Markeer als opgehaald"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={bevestig}>
            <Check size={14} /> Markeer als opgehaald
          </Knop>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          <strong>{trailerLabel(data, unit)}</strong> wordt gemarkeerd als opgeleverd.
          {plaats && ` De plaats ${plaats.kortLabel} komt direct vrij.`} De trailer blijft terug te vinden via het filter
          “Opgeleverde trailers”.
        </p>
        <Veld label="Werkelijke ophaaldatum" verplicht fout={fout}>
          <Invoer type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </Veld>
        <Veld label="Transporteur (optioneel)">
          <Invoer
            value={transporteur}
            onChange={(e) => setTransporteur(e.target.value)}
            placeholder="Bijv. Van Straalen Transport"
          />
        </Veld>
        <Veld label="Korte notitie (optioneel)">
          <Tekstvak rows={2} value={notitie} onChange={(e) => setNotitie(e.target.value)} />
        </Veld>
      </div>
    </Modal>
  )
}

// ---------- Locatiehistorie ----------

export function HistorieModal({ unitId, onSluiten }: { unitId?: string; onSluiten: () => void }) {
  const { data } = useApp()
  const items = data.locatieHistorie.filter((m) => !unitId || m.unitId === unitId)
  const unit = unitId ? data.units.find((u) => u.id === unitId) : undefined

  return (
    <Modal open breed titel={unit ? `Locatiehistorie · ${trailerLabel(data, unit)}` : 'Locatiehistorie'} onSluiten={onSluiten}>
      {items.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">Nog geen verplaatsingen geregistreerd.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
              <th className="py-2 pr-3 font-medium">Tijdstip</th>
              <th className="py-2 pr-3 font-medium">PR-nummer</th>
              <th className="py-2 pr-3 font-medium">Van → naar</th>
              <th className="py-2 pr-3 font-medium">Reden</th>
              <th className="py-2 pr-3 font-medium">Gebruiker</th>
              <th className="py-2 font-medium">Fase</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 text-xs whitespace-nowrap text-slate-500">{formatTijdstip(m.tijdstip)}</td>
                <td className="py-2 pr-3">
                  <div className="text-xs font-medium text-slate-800">{m.projectnummer ?? 'Trailer zonder project'}</div>
                </td>
                <td className="py-2 pr-3 text-xs text-slate-600">
                  <span className="text-slate-400">{m.vanLabel}</span>
                  <span className="mx-1">→</span>
                  {m.naarLabel}
                  {m.opmerking && <div className="text-[11px] text-slate-400 italic">“{m.opmerking}”</div>}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-600">{m.reden ?? '—'}</td>
                <td className="py-2 pr-3 text-xs text-slate-500">{m.gebruiker}</td>
                <td className="py-2 text-xs" title={m.faseAangepast ? 'Projectfase automatisch aangepast' : 'Projectfase niet aangepast'}>
                  {m.faseAangepast ? <Check size={14} className="text-emerald-500" /> : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
