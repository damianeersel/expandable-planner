// Kanban-statusbord over alle taken van het project: vier statuskolommen met
// taakkaartjes, drag-and-drop statuswissel (met dezelfde regels en reden-dialogen
// als de taakrij) en een fasefilter. Alleen-lezen voor rollen zonder voortgangsrecht.

import { useMemo, useState } from 'react'
import { OctagonAlert } from 'lucide-react'
import type { Project, TaakStatus } from '../../../lib/types'
import { EXTERNE_ACTIE_LABELS, TAAK_STATUS_LABELS } from '../../../lib/types'
import { formatDatumKort } from '../../../lib/dates'
import { TAAK_STATUS_VOLGORDE, telTaken, urenPerUitvoerende, type TaakPlek } from '../../../lib/taken'
import { projectFases } from '../../../lib/capacity'
import { useApp } from '../../../store/AppState'
import { Badge, Keuze, LegeStaat, Tooltip } from '../../ui'
import { AvatarRij, magVoortgangBijwerken } from './gedeeld'
import { useTaakStatusWissel } from './useTaakStatusWissel'

const KOLOM_STIJL: Record<TaakStatus, { stip: string; kop: string; drop: string }> = {
  te_doen: { stip: 'bg-slate-400', kop: 'text-slate-600', drop: 'ring-slate-300 bg-slate-50' },
  in_uitvoering: { stip: 'bg-sky-500', kop: 'text-sky-700', drop: 'ring-sky-300 bg-sky-50/60' },
  on_hold: { stip: 'bg-amber-400', kop: 'text-amber-700', drop: 'ring-amber-300 bg-amber-50/60' },
  gereed: { stip: 'bg-emerald-500', kop: 'text-emerald-700', drop: 'ring-emerald-300 bg-emerald-50/60' },
}

interface Props {
  project: Project
  /** Taakkaartje aangeklikt om te bewerken (alleen aangeroepen met planningsrecht). */
  onTaakBewerken: (plek: TaakPlek) => void
}

export default function TaakStatusBord({ project, onTaakBewerken }: Props) {
  const { data, persona, permissies } = useApp()
  const { vraagStatusWissel, statusDialoog } = useTaakStatusWissel(project.id)

  const [faseFilter, setFaseFilter] = useState('alle')
  const [sleepTaakId, setSleepTaakId] = useState<string | null>(null)
  const [dropKolom, setDropKolom] = useState<TaakStatus | null>(null)

  const fases = projectFases(data, project.id)

  // Alle taakplekken in fasevolgorde (fases zijn al op startdatum gesorteerd).
  const plekken = useMemo<TaakPlek[]>(
    () =>
      fases.flatMap((fase) =>
        fase.werkpakketten.flatMap((proces) => proces.taken.map((taak) => ({ fase, proces, taak }))),
      ),
    [fases],
  )

  const gefilterd = faseFilter === 'alle' ? plekken : plekken.filter((p) => p.fase.id === faseFilter)

  /** Mag de huidige persona de status van deze taak wijzigen (zelfde regels als de taakrij)? */
  const magStatusVoor = (plek: TaakPlek): boolean => {
    const taakTeam = plek.taak.teamId ? data.teams.find((t) => t.id === plek.taak.teamId) : undefined
    const faseTeam = plek.fase.teamId ? data.teams.find((t) => t.id === plek.fase.teamId) : undefined
    return magVoortgangBijwerken(
      persona.rol,
      persona.afdeling,
      plek.fase,
      permissies.voortgangBijwerken,
      taakTeam?.afdeling ?? faseTeam?.afdeling,
    )
  }

  const magIetsSlepen = gefilterd.some(magStatusVoor)
  const sleepPlek = sleepTaakId ? plekken.find((p) => p.taak.id === sleepTaakId) : undefined

  const drop = (status: TaakStatus) => {
    if (sleepPlek && sleepPlek.taak.status !== status) vraagStatusWissel(sleepPlek, status)
    setSleepTaakId(null)
    setDropKolom(null)
  }

  if (plekken.length === 0) {
    return (
      <LegeStaat
        titel="Geen taken"
        tekst="Dit project heeft nog geen taken in de detailplanning. Voeg taken toe via de fasekaarten-weergave."
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Filterbalk */}
      <div className="flex flex-wrap items-center gap-2">
        <Keuze
          value={faseFilter}
          onChange={(e) => setFaseFilter(e.target.value)}
          className="!w-auto"
          title="Filter op fase"
        >
          <option value="alle">Alle fases</option>
          {fases.map((f) => (
            <option key={f.id} value={f.id}>
              {f.naam}
            </option>
          ))}
        </Keuze>
        <span className="text-xs text-slate-500">
          {gefilterd.length} {gefilterd.length === 1 ? 'taak' : 'taken'}
        </span>
        {magIetsSlepen && (
          <span className="ml-auto text-xs text-slate-400">
            Sleep een taak naar een andere kolom om de status te wijzigen — bij on hold of heropenen wordt om een
            reden gevraagd.
          </span>
        )}
      </div>

      {/* Kolommen */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {TAAK_STATUS_VOLGORDE.map((status) => {
          const items = gefilterd.filter((p) => p.taak.status === status)
          const telling = telTaken(items.map((p) => p.taak))
          const stijl = KOLOM_STIJL[status]
          const actiefDrop = dropKolom === status && sleepPlek && sleepPlek.taak.status !== status
          return (
            <div
              key={status}
              className={`flex min-h-48 flex-col rounded-lg border border-slate-200 bg-slate-50/60 transition-shadow ${
                actiefDrop ? `ring-2 ${stijl.drop}` : ''
              }`}
              onDragOver={(e) => {
                if (!sleepPlek) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropKolom !== status) setDropKolom(status)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDropKolom((k) => (k === status ? null : k))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                drop(status)
              }}
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${stijl.stip}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${stijl.kop}`}>
                  {TAAK_STATUS_LABELS[status]}
                </span>
                <span className="ml-auto text-xs tabular-nums text-slate-400">
                  {items.length} · {telling.urenTotaal} u
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-200 px-2 py-3 text-center text-xs text-slate-400">
                    Geen taken
                  </p>
                ) : (
                  items.map((plek) => (
                    <TaakKaartje
                      key={plek.taak.id}
                      plek={plek}
                      sleepbaar={magStatusVoor(plek)}
                      wordtGesleept={sleepTaakId === plek.taak.id}
                      onSleepStart={(e) => {
                        e.dataTransfer.setData('text/plain', plek.taak.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setSleepTaakId(plek.taak.id)
                      }}
                      onSleepEinde={() => {
                        setSleepTaakId(null)
                        setDropKolom(null)
                      }}
                      onBewerken={permissies.planningBewerken ? () => onTaakBewerken(plek) : undefined}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {statusDialoog}
    </div>
  )
}

// ---------- Taakkaartje ----------

interface KaartjeProps {
  plek: TaakPlek
  sleepbaar: boolean
  wordtGesleept: boolean
  onSleepStart: (e: React.DragEvent) => void
  onSleepEinde: () => void
  onBewerken?: () => void
}

function TaakKaartje({ plek, sleepbaar, wordtGesleept, onSleepStart, onSleepEinde, onBewerken }: KaartjeProps) {
  const { data } = useApp()
  const { fase, proces, taak } = plek

  const uitvoerenden = taak.uitvoerendeIds
    .map((id) => data.medewerkers.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m)
  const eigenaar = taak.taakEigenaarId ? data.medewerkers.find((m) => m.id === taak.taakEigenaarId) : undefined
  const partner = taak.externeActie?.partijId
    ? data.externePartijen.find((p) => p.id === taak.externeActie?.partijId)
    : undefined
  const externTooltip = partner
    ? `Extern · ${partner.naam}${taak.externeActie ? ` · ${EXTERNE_ACTIE_LABELS[taak.externeActie.status]}` : ''}`
    : `Externe uitvoering${taak.externeActie ? ` · ${EXTERNE_ACTIE_LABELS[taak.externeActie.status]}` : ''}`

  return (
    <div
      draggable={sleepbaar}
      onDragStart={onSleepStart}
      onDragEnd={onSleepEinde}
      title={sleepbaar ? undefined : 'Je kunt de status van deze taak niet wijzigen'}
      className={`rounded-md border border-slate-200 bg-white p-2.5 shadow-sm transition-opacity ${
        sleepbaar ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : ''
      } ${wordtGesleept ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        {taak.prioriteit === 'hoog' && (
          <Tooltip tekst="Prioriteit: Hoog">
            <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
          </Tooltip>
        )}
        {onBewerken ? (
          <button
            type="button"
            onClick={onBewerken}
            className="min-w-0 text-left text-sm font-medium text-slate-700 hover:text-brand-700 hover:underline"
          >
            {taak.naam}
          </button>
        ) : (
          <span className="min-w-0 text-sm font-medium text-slate-700">{taak.naam}</span>
        )}
        {taak.blokkade && (
          <Tooltip tekst={`Blokkade: ${taak.blokkade}`}>
            <OctagonAlert size={14} className="mt-0.5 shrink-0 text-red-500" />
          </Tooltip>
        )}
      </div>

      <div className="mt-0.5 truncate text-xs text-slate-500" title={`${fase.naam} · ${proces.naam}`}>
        {fase.naam} · {proces.naam}
      </div>

      {(taak.uitvoering === 'extern' || taak.projectspecifiek) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {taak.uitvoering === 'extern' && (
            <Tooltip tekst={externTooltip}>
              <span>
                <Badge kleur="paars">{partner ? `Extern · ${partner.naam}` : 'Extern'}</Badge>
              </span>
            </Tooltip>
          )}
          {taak.projectspecifiek && <Badge kleur="amber">Projectspecifiek</Badge>}
        </div>
      )}

      {taak.status === 'on_hold' && taak.onHoldReden && (
        <div className="mt-1.5 rounded bg-amber-50 px-1.5 py-1 text-[11px] text-amber-700">
          {taak.onHoldReden}
          {taak.hervattenOp && <> · hervatten {formatDatumKort(taak.hervattenOp)}</>}
        </div>
      )}
      {taak.status === 'gereed' && taak.werkelijkGereedOp && (
        <div className="mt-1 text-[11px] text-emerald-700">Gereed op {formatDatumKort(taak.werkelijkGereedOp)}</div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs tabular-nums text-slate-500">{taak.uren} u</span>
        <span className="text-xs tabular-nums text-slate-400">
          {!taak.start && !taak.eind
            ? 'Volgt fase'
            : `${formatDatumKort(taak.start ?? fase.start)} – ${formatDatumKort(taak.eind ?? fase.eind)}`}
        </span>
        <span className="ml-auto">
          {uitvoerenden.length > 0 ? (
            <AvatarRij medewerkers={uitvoerenden} uren={urenPerUitvoerende(taak)} max={3} />
          ) : eigenaar ? (
            <Tooltip tekst={`Taakeigenaar: ${eigenaar.naam}`}>
              <span className="text-xs font-semibold text-slate-600">{eigenaar.naam}</span>
            </Tooltip>
          ) : (
            <span className="text-[11px] text-slate-400">Niet toegewezen</span>
          )}
        </span>
      </div>
    </div>
  )
}
