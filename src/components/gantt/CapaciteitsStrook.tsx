// Capaciteitsstrook onder de Gantt: bezettingspercentage per week volgens het
// actieve scenario, per productieafdeling (of per team bij teamgroepering).

import { useMemo } from 'react'
import type { ISODate, Team } from '../../lib/types'
import { AFDELING_LABELS, PRODUCTIE_AFDELINGEN, SCENARIO_LABELS } from '../../lib/types'
import { useApp } from '../../store/AppState'
import { weekNummer } from '../../lib/dates'
import {
  afdelingBeschikbaarInWeek,
  afdelingGeplandInWeek,
  bezettingsPct,
  capaciteitsNiveau,
  scenarioBelasting,
  teamBeschikbaarInWeek,
  teamGeplandInWeek,
  type GeplandeUren,
} from '../../lib/capacity'
import { InfoTip } from '../ui'
import { LINKS_BREEDTE } from './ganttUtils'

interface Props {
  weken: ISODate[]
  dagBreedte: number
  /** Bij groeperen op team: alleen deze teams tonen (gefilterde selectie). */
  perTeam: boolean
  teamIds: string[]
}

interface StrookRij {
  id: string
  naam: string
  cellen: { beschikbaar: number; gepland: GeplandeUren }[]
}

const CEL_KLEUREN = {
  ok: 'bg-emerald-50 text-emerald-700',
  druk: 'bg-amber-100 text-amber-800',
  overboekt: 'bg-red-100 text-red-700 font-semibold',
} as const

export default function CapaciteitsStrook({ weken, dagBreedte, perTeam, teamIds }: Props) {
  const { data, ui } = useApp()
  const weekBreedte = dagBreedte * 7
  const toonTekst = weekBreedte >= 34

  const rijen = useMemo<StrookRij[]>(() => {
    const basis: StrookRij[] = []
    if (perTeam) {
      const teams = teamIds
        .map((id) => data.teams.find((t) => t.id === id))
        .filter((t): t is Team => !!t)
      for (const team of teams) {
        basis.push({
          id: team.id,
          naam: team.naam,
          cellen: weken.map((wk) => ({
            beschikbaar: teamBeschikbaarInWeek(data, team.id, wk),
            gepland: teamGeplandInWeek(data, team.id, wk),
          })),
        })
      }
    } else {
      for (const afd of PRODUCTIE_AFDELINGEN) {
        basis.push({
          id: afd,
          naam: AFDELING_LABELS[afd],
          cellen: weken.map((wk) => ({
            beschikbaar: afdelingBeschikbaarInWeek(data, afd, wk),
            gepland: afdelingGeplandInWeek(data, afd, wk),
          })),
        })
      }
    }
    // Totaalrij over de getoonde rijen
    if (basis.length > 0) {
      basis.push({
        id: 'totaal',
        naam: 'Totaal',
        cellen: weken.map((_, i) =>
          basis.reduce(
            (som, rij) => ({
              beschikbaar: som.beschikbaar + rij.cellen[i].beschikbaar,
              gepland: {
                definitief: som.gepland.definitief + rij.cellen[i].gepland.definitief,
                schaduw: som.gepland.schaduw + rij.cellen[i].gepland.schaduw,
                gewogen: som.gepland.gewogen + rij.cellen[i].gepland.gewogen,
              },
            }),
            { beschikbaar: 0, gepland: { definitief: 0, schaduw: 0, gewogen: 0 } },
          ),
        ),
      })
    }
    return basis
  }, [data, weken, perTeam, teamIds])

  const totaalBreedte = weken.length * weekBreedte

  return (
    <div className="sticky bottom-0 z-30 border-t border-slate-300 bg-white" style={{ width: LINKS_BREEDTE + totaalBreedte }}>
      {/* Kopregel van de strook */}
      <div className="flex border-b border-slate-100">
        <div className="sticky left-0 z-10 flex w-72 shrink-0 items-center gap-1.5 border-r border-slate-200 bg-white px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Capaciteit per week</span>
          <InfoTip tekst={`Totale scenariobelasting: geplande uren die volgens het gekozen scenario meetellen. Actief scenario: "${SCENARIO_LABELS[ui.scenario]}". Bij kansgewogen tellen schaduwuren mee naar rato van de verkoopkans.`} />
        </div>
        <div className="flex" style={{ width: totaalBreedte }}>
          {weken.map((wk) => (
            <div key={wk} className="shrink-0 border-r border-slate-100 py-1 text-center text-[10px] tabular-nums text-slate-400" style={{ width: weekBreedte }}>
              {toonTekst ? weekNummer(wk) : ''}
            </div>
          ))}
        </div>
      </div>

      {rijen.map((rij) => (
        <div key={rij.id} className={`flex ${rij.id === 'totaal' ? 'border-t border-slate-200' : ''}`}>
          <div className={`sticky left-0 z-10 w-72 shrink-0 truncate border-r border-slate-200 bg-white px-3 py-0.5 text-[11px] ${rij.id === 'totaal' ? 'font-semibold text-slate-700' : 'text-slate-600'}`}>
            {rij.naam}
          </div>
          <div className="flex" style={{ width: totaalBreedte }}>
            {rij.cellen.map((cel, i) => {
              const belasting = scenarioBelasting(cel.gepland, ui.scenario)
              const leeg = cel.beschikbaar <= 0 && belasting <= 0
              const pct = bezettingsPct(cel.beschikbaar, belasting)
              const niveau = capaciteitsNiveau(pct)
              const titel = `Wk ${weekNummer(weken[i])} · ${rij.naam}\nBeschikbaar: ${Math.round(cel.beschikbaar)} u\nDefinitief: ${Math.round(cel.gepland.definitief)} u\nSchaduw: ${Math.round(cel.gepland.schaduw)} u\nKansgewogen: ${Math.round(cel.gepland.gewogen)} u\nScenariobelasting: ${Math.round(belasting)} u (${pct}%)`
              return (
                <div
                  key={i}
                  title={titel}
                  className={`shrink-0 border-r border-white/60 py-0.5 text-center text-[10px] tabular-nums ${leeg ? 'bg-slate-50 text-slate-300' : CEL_KLEUREN[niveau]}`}
                  style={{ width: weekBreedte }}
                >
                  {toonTekst ? (leeg ? '–' : `${pct}%`) : ' '}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
