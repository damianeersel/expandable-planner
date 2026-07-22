// Uitklapbare kaart voor één templatefase: bewerkbare kop, samenvatting, fase-acties en takentabel.

import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Team, TemplateFase, TemplateTaak } from '../../lib/types'
import { AFDELING_LABELS } from '../../lib/types'
import { Badge, BevestigDialog, Knop } from '../ui'
import TaakRij from './TaakRij'
import TaakModal from './TaakModal'
import type { EditorActies } from './gedeeld'
import { AFDELING_KLEUR } from './gedeeld'

/** Bewerkbaar tekstveld dat op blur/Enter doorvoert. */
function FaseNaamVeld({ waarde, onCommit }: { waarde: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(waarde)
  useEffect(() => setV(waarde), [waarde])
  const commit = () => {
    const t = v.trim()
    if (t && t !== waarde) onCommit(t)
    else setV(waarde)
  }
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-56 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none"
    />
  )
}

interface Props {
  fase: TemplateFase
  index: number
  aantalFases: number
  teams: Team[]
  alleFases: TemplateFase[]
  bewerkbaar: boolean
  acties: EditorActies
}

export default function TemplateFaseKaart({ fase, index, aantalFases, teams, alleFases, bewerkbaar, acties }: Props) {
  const [open, setOpen] = useState(false)
  const [doorlooptijd, setDoorlooptijd] = useState(String(fase.doorlooptijdWerkdagen))
  const [modalOpen, setModalOpen] = useState(false)
  const [teBewerken, setTeBewerken] = useState<TemplateTaak | null>(null)
  const [verwijderOpen, setVerwijderOpen] = useState(false)

  useEffect(() => setDoorlooptijd(String(fase.doorlooptijdWerkdagen)), [fase.doorlooptijdWerkdagen])

  const totaleUren = fase.taken.reduce((s, t) => s + t.uren, 0)
  const teamTellingen = new Map<string, number>()
  for (const t of fase.taken) if (t.standaardTeamId) teamTellingen.set(t.standaardTeamId, (teamTellingen.get(t.standaardTeamId) ?? 0) + 1)
  let dominantTeam: string | undefined
  let max = 0
  for (const [id, n] of teamTellingen) if (n > max) { max = n; dominantTeam = id }
  const teamNaam = dominantTeam ? teams.find((t) => t.id === dominantTeam)?.naam : undefined

  const commitDoorlooptijd = () => {
    const n = Number(doorlooptijd)
    if (!Number.isFinite(n) || n < 1) {
      setDoorlooptijd(String(fase.doorlooptijdWerkdagen))
      return
    }
    const afgerond = Math.round(n)
    if (afgerond !== fase.doorlooptijdWerkdagen) acties.zetDoorlooptijd(fase.id, afgerond)
    else setDoorlooptijd(String(fase.doorlooptijdWerkdagen))
  }

  const opslaanTaak = (taak: TemplateTaak) => {
    acties.taakOpslaan(fase.id, taak)
    setModalOpen(false)
    setTeBewerken(null)
  }

  const taken = [...fase.taken].sort((a, b) => a.volgorde - b.volgorde)

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
      onDragOver={(e) => bewerkbaar && e.preventDefault()}
      onDrop={(e) => {
        if (!bewerkbaar) return
        e.preventDefault()
        acties.dndDropOpFase(fase.id)
      }}
    >
      {/* Kopregel */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-slate-400">{index + 1}.</span>
          {bewerkbaar ? (
            <FaseNaamVeld waarde={fase.naam} onCommit={(v) => acties.hernoemFase(fase.id, v)} />
          ) : (
            <span className="text-sm font-semibold text-slate-800">{fase.naam}</span>
          )}
          <Badge kleur={AFDELING_KLEUR[fase.afdeling]}>{AFDELING_LABELS[fase.afdeling]}</Badge>
        </div>

        {/* Doorlooptijd */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Doorlooptijd:</span>
          {bewerkbaar ? (
            <input
              type="number"
              min={1}
              value={doorlooptijd}
              onChange={(e) => setDoorlooptijd(e.target.value)}
              onBlur={commitDoorlooptijd}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-brand-500 focus:outline-none"
            />
          ) : (
            <span className="tabular-nums text-slate-600">{fase.doorlooptijdWerkdagen}</span>
          )}
          <span>werkdagen</span>
        </div>

        {/* Samenvatting */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{fase.taken.length} taken</span>
          <span className="tabular-nums">{totaleUren} u</span>
          {teamNaam && <span className="text-slate-400">{teamNaam}</span>}
        </div>

        {/* Fase-acties */}
        {bewerkbaar && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              title="Fase omhoog"
              disabled={index === 0}
              onClick={() => acties.verplaatsFase(fase.id, -1)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronsUp size={15} />
            </button>
            <button
              type="button"
              title="Fase omlaag"
              disabled={index === aantalFases - 1}
              onClick={() => acties.verplaatsFase(fase.id, 1)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronsDown size={15} />
            </button>
            <button
              type="button"
              title="Fase dupliceren"
              onClick={() => acties.dupliceerFase(fase.id)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Copy size={15} />
            </button>
            <button
              type="button"
              title="Fase verwijderen"
              onClick={() => setVerwijderOpen(true)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Uitgeklapt: takentabel */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {taken.length === 0 ? (
            <p className="text-xs text-slate-400">Nog geen taken in deze fase.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Taak</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Uren</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Duur</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Start</th>
                    <th className="py-1.5 pr-3 font-medium">Afhankelijk van</th>
                    <th className="py-1.5 pr-3 font-medium">Afdeling</th>
                    <th className="py-1.5 pr-3 font-medium">Standaardteam</th>
                    <th className="py-1.5 pr-3 font-medium">Vaardigheden</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Mdw.</th>
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {taken.map((taak, i) => (
                    <TaakRij
                      key={taak.id}
                      fase={fase}
                      taak={taak}
                      index={i}
                      aantal={taken.length}
                      teams={teams}
                      alleFases={alleFases}
                      bewerkbaar={bewerkbaar}
                      acties={acties}
                      onBewerken={() => {
                        setTeBewerken(taak)
                        setModalOpen(true)
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bewerkbaar && (
            <div className="mt-3">
              <Knop
                klein
                onClick={() => {
                  setTeBewerken(null)
                  setModalOpen(true)
                }}
              >
                <Plus size={14} /> Taak toevoegen
              </Knop>
            </div>
          )}
        </div>
      )}

      <TaakModal open={modalOpen} taak={teBewerken} fase={fase} teams={teams} onOpslaan={opslaanTaak} onSluiten={() => { setModalOpen(false); setTeBewerken(null) }} />

      <BevestigDialog
        open={verwijderOpen}
        titel="Fase verwijderen"
        tekst={`Weet je zeker dat je de fase "${fase.naam}" en al haar taken wilt verwijderen?`}
        bevestigLabel="Verwijderen"
        gevaarlijk
        onBevestig={() => {
          acties.verwijderFase(fase.id)
          setVerwijderOpen(false)
        }}
        onAnnuleer={() => setVerwijderOpen(false)}
      />
    </div>
  )
}
