// Uitklapbare kaart voor één fase: datums, status, blokkades en werkpakketten met voortgang.

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, OctagonAlert, ShieldCheck } from 'lucide-react'
import type { Fase, ISODate, Werkpakket } from '../../lib/types'
import { AFDELING_LABELS, FASE_STATUS_LABELS, type FaseStatus } from '../../lib/types'
import { formatDatum, werkdagenTussen } from '../../lib/dates'
import { useApp } from '../../store/AppState'
import { Badge, Invoer, Kaart, Knop, Tekstvak, VoortgangsBalk, useToast, type BadgeKleur } from '../ui'

export const FASE_STATUS_KLEUR: Record<FaseStatus, BadgeKleur> = {
  gepland: 'grijs',
  bezig: 'brand',
  gereed: 'groen',
  geblokkeerd: 'rood',
}

/** Mag de huidige persona voortgang/blokkades van deze fase bijwerken? */
export function magVoortgangBijwerken(
  rol: string,
  afdeling: string | undefined,
  fase: Fase,
  voortgangPermissie: boolean,
  teamAfdeling?: string,
): boolean {
  if (!voortgangPermissie) return false
  // Productieleider mag ook fases bijwerken die door een team van zijn afdeling worden
  // uitgevoerd (bijv. de kwaliteitsfase, die bij een afbouwteam belegd is).
  if (rol === 'productieleider') return fase.afdeling === afdeling || teamAfdeling === afdeling
  if (rol === 'engineering_lead') return fase.afdeling === 'engineering'
  return true
}

/** Datumveld dat pas bij verlaten van het veld (of Enter) doorvoert, zodat cascades niet per toetsaanslag vuren. */
function DatumInvoer({ waarde, title, onCommit }: { waarde: ISODate; title?: string; onCommit: (d: ISODate) => boolean }) {
  const [v, setV] = useState(waarde)
  useEffect(() => setV(waarde), [waarde])
  const commit = () => {
    // Bij een afgewezen wijziging (onCommit false) springt het veld terug naar de opgeslagen datum.
    if (v && v !== waarde) {
      if (!onCommit(v)) setV(waarde)
    } else if (!v) setV(waarde)
  }
  return (
    <Invoer
      type="date"
      value={v}
      title={title}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="!w-[8.5rem] !py-1 !text-xs"
    />
  )
}

function VoortgangInvoer({ waarde, onCommit }: { waarde: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(waarde)
  useEffect(() => setV(waarde), [waarde])

  const commit = (n: number) => {
    const c = Math.max(0, Math.min(100, Math.round(n)))
    setV(c)
    if (c !== waarde) onCommit(c)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        className="h-1.5 w-24 cursor-pointer accent-brand-600"
      />
      <input
        type="number"
        min={0}
        max={100}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onBlur={(e) => commit(Number(e.currentTarget.value))}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-brand-500 focus:outline-none"
      />
      <span className="text-xs text-slate-400">%</span>
    </div>
  )
}

export default function FaseKaart({ fase, standaardOpen = false }: { fase: Fase; standaardOpen?: boolean }) {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const [open, setOpen] = useState(standaardOpen)
  const [blokkadeFormOpen, setBlokkadeFormOpen] = useState(false)
  const [blokkadeTekst, setBlokkadeTekst] = useState('')

  const team = fase.teamId ? data.teams.find((t) => t.id === fase.teamId) : undefined
  const productieleider = team?.productieleiderId
    ? data.medewerkers.find((m) => m.id === team.productieleiderId)
    : undefined
  const magVoortgang = magVoortgangBijwerken(persona.rol, persona.afdeling, fase, permissies.voortgangBijwerken, team?.afdeling)
  const magDatums = permissies.planningBewerken

  const wijzigDatums = (start: ISODate, eind: ISODate): boolean => {
    if (!start || !eind) return false
    if (eind < start) {
      toon('fout', 'De einddatum kan niet vóór de startdatum liggen.')
      return false
    }
    dispatch({ type: 'FASE_DATUMS', faseId: fase.id, start, eind, cascade: true })
    toon('succes', `Datums van "${fase.naam}" aangepast — afhankelijke fases schuiven mee.`)
    return true
  }

  const meldBlokkade = () => {
    if (blokkadeTekst.trim() === '') {
      toon('fout', 'Een blokkadenotitie is verplicht: beschrijf kort waarom deze fase geblokkeerd is.')
      return
    }
    dispatch({ type: 'FASE_BIJWERKEN', id: fase.id, patch: { status: 'geblokkeerd', blokkadeNotitie: blokkadeTekst.trim() } })
    toon('waarschuwing', `Fase "${fase.naam}" is gemarkeerd als geblokkeerd.`)
    setBlokkadeFormOpen(false)
    setBlokkadeTekst('')
  }

  const hefBlokkadeOp = () => {
    const nieuweStatus: FaseStatus = fase.voortgang >= 100 ? 'gereed' : fase.voortgang > 0 ? 'bezig' : 'gepland'
    dispatch({ type: 'FASE_BIJWERKEN', id: fase.id, patch: { status: nieuweStatus, blokkadeNotitie: undefined } })
    toon('succes', `Blokkade op "${fase.naam}" opgeheven.`)
  }

  const zetWerkpakketVoortgang = (wp: Werkpakket, v: number) => {
    dispatch({
      type: 'WERKPAKKET_BIJWERKEN',
      faseId: fase.id,
      wpId: wp.id,
      patch: { voortgang: v, status: v >= 100 ? 'gereed' : v > 0 ? 'bezig' : 'gepland' },
    })
    toon('succes', `Voortgang van "${wp.naam}" bijgewerkt naar ${v}%.`)
  }

  return (
    <Kaart className={fase.status === 'geblokkeerd' ? 'border-red-300' : ''}>
      {/* Kopregel */}
      <div
        className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-slate-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <div className="w-52">
          <div className="text-sm font-semibold text-slate-800">{fase.naam}</div>
          <div className="text-xs text-slate-500">
            {AFDELING_LABELS[fase.afdeling]}
            {team && <> · {team.naam}</>}
          </div>
          {productieleider && <div className="text-[11px] text-slate-400">Productieleider: {productieleider.naam}</div>}
        </div>

        {/* Datums */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {magDatums ? (
            <>
              <DatumInvoer
                waarde={fase.start}
                title="Startdatum van de fase"
                onCommit={(d) => wijzigDatums(d, fase.eind)}
              />
              <span className="text-xs text-slate-400">t/m</span>
              <DatumInvoer
                waarde={fase.eind}
                title="Einddatum — afhankelijke fases schuiven automatisch mee"
                onCommit={(d) => wijzigDatums(fase.start, d)}
              />
            </>
          ) : (
            <span className="text-xs tabular-nums text-slate-600">
              {formatDatum(fase.start)} t/m {formatDatum(fase.eind)}
            </span>
          )}
        </div>

        <span className="text-xs tabular-nums text-slate-500">
          {fase.uren > 0 ? `${fase.uren} u` : `${werkdagenTussen(fase.start, fase.eind)} werkdagen`}
        </span>
        <Badge kleur={FASE_STATUS_KLEUR[fase.status]}>{FASE_STATUS_LABELS[fase.status]}</Badge>
        <VoortgangsBalk pct={fase.status === 'gereed' ? 100 : fase.voortgang} className="w-44 min-w-36 flex-1" />
      </div>

      {/* Blokkade-informatie (altijd zichtbaar) */}
      {fase.status === 'geblokkeerd' && (
        <div className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <OctagonAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">Geblokkeerd:</span> {fase.blokkadeNotitie || 'geen notitie opgegeven'}
            </span>
          </div>
          {magVoortgang && (
            <Knop klein onClick={hefBlokkadeOp}>
              <ShieldCheck size={14} /> Blokkade opheffen
            </Knop>
          )}
        </div>
      )}

      {/* Uitgeklapt gedeelte */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {fase.notities && <p className="mb-3 text-xs italic text-slate-500">{fase.notities}</p>}

          {/* Blokkade melden */}
          {magVoortgang && fase.status !== 'geblokkeerd' && fase.status !== 'gereed' && (
            <div className="mb-3">
              {!blokkadeFormOpen ? (
                <Knop klein onClick={() => setBlokkadeFormOpen(true)}>
                  <OctagonAlert size={14} className="text-red-500" /> Blokkade melden
                </Knop>
              ) : (
                <div className="rounded-md border border-red-200 bg-red-50/60 p-3">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Blokkadenotitie <span className="text-red-500">*</span>
                  </label>
                  <Tekstvak
                    rows={2}
                    value={blokkadeTekst}
                    onChange={(e) => setBlokkadeTekst(e.target.value)}
                    placeholder="Bijv. wachten op onderdelen, keuring afgekeurd, capaciteitsprobleem…"
                  />
                  <div className="mt-2 flex gap-2">
                    <Knop klein variant="danger" onClick={meldBlokkade}>
                      <AlertTriangle size={13} /> Fase blokkeren
                    </Knop>
                    <Knop klein onClick={() => { setBlokkadeFormOpen(false); setBlokkadeTekst('') }}>
                      Annuleren
                    </Knop>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Werkpakketten */}
          {fase.werkpakketten.length === 0 ? (
            <p className="text-xs text-slate-400">Geen werkpakketten voor deze fase.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">Werkpakket</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Uren</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="w-56 py-1.5 font-medium">Voortgang</th>
                </tr>
              </thead>
              <tbody>
                {fase.werkpakketten.map((wp) => (
                  <tr key={wp.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3 text-slate-700">{wp.naam}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{wp.uren} u</td>
                    <td className="py-2 pr-3">
                      <Badge kleur={FASE_STATUS_KLEUR[wp.status]}>{FASE_STATUS_LABELS[wp.status]}</Badge>
                    </td>
                    <td className="py-2">
                      {magVoortgang ? (
                        <VoortgangInvoer waarde={wp.voortgang} onCommit={(v) => zetWerkpakketVoortgang(wp, v)} />
                      ) : (
                        <VoortgangsBalk pct={wp.voortgang} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!magVoortgang && permissies.voortgangBijwerken && (
            <p className="mt-2 text-[11px] text-slate-400">
              Je kunt alleen voortgang bijwerken voor fases van je eigen afdeling.
            </p>
          )}
        </div>
      )}
    </Kaart>
  )
}
