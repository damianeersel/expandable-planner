// Eén taakrij binnen de takentabel van een fase: inline bewerkbare velden, chips, drag-and-drop en acties.

import { useEffect, useState } from 'react'
import { ArrowRightLeft, ChevronDown, ChevronUp, Copy, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Team, TemplateFase, TemplateTaak } from '../../lib/types'
import { AFDELING_LABELS } from '../../lib/types'
import { Badge } from '../ui'
import type { EditorActies } from './gedeeld'
import { AFDELING_KLEUR } from './gedeeld'

/** Klein numeriek celveld dat pas bij verlaten (of Enter) doorvoert. */
function NummerCel({
  waarde,
  min = 0,
  suffix,
  onCommit,
}: {
  waarde: number
  min?: number
  suffix?: string
  onCommit: (n: number) => void
}) {
  const [v, setV] = useState(String(waarde))
  useEffect(() => setV(String(waarde)), [waarde])
  const commit = () => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < min) {
      setV(String(waarde))
      return
    }
    const afgerond = Math.round(n)
    if (afgerond !== waarde) onCommit(afgerond)
    else setV(String(waarde))
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        type="number"
        min={min}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-brand-500 focus:outline-none"
      />
      {suffix && <span className="text-[11px] text-slate-400">{suffix}</span>}
    </span>
  )
}

interface Props {
  fase: TemplateFase
  taak: TemplateTaak
  index: number
  aantal: number
  teams: Team[]
  alleFases: TemplateFase[]
  bewerkbaar: boolean
  acties: EditorActies
  onBewerken: () => void
}

export default function TaakRij({ fase, taak, index, aantal, teams, alleFases, bewerkbaar, acties, onBewerken }: Props) {
  const [vaardigheidToevoegen, setVaardigheidToevoegen] = useState(false)
  const [nieuweVaardigheid, setNieuweVaardigheid] = useState('')

  const teamOpties = teams.filter((t) => t.afdeling === taak.afdeling)
  const andereTaken = fase.taken.filter((t) => t.id !== taak.id)
  const andereFases = alleFases.filter((f) => f.id !== fase.id)

  const patch = (p: Partial<TemplateTaak>) => acties.taakPatch(fase.id, taak.id, p)

  const voegVaardigheidToe = () => {
    const v = nieuweVaardigheid.trim()
    if (v && !taak.vaardigheden.includes(v)) patch({ vaardigheden: [...taak.vaardigheden, v] })
    setNieuweVaardigheid('')
    setVaardigheidToevoegen(false)
  }

  return (
    <tr
      draggable={bewerkbaar}
      onDragStart={() => bewerkbaar && acties.dndStart(fase.id, taak.id)}
      onDragOver={(e) => bewerkbaar && e.preventDefault()}
      onDrop={(e) => {
        if (!bewerkbaar) return
        e.preventDefault()
        e.stopPropagation()
        acties.dndDropOpTaak(fase.id, taak.id)
      }}
      className={`border-b border-slate-100 align-top last:border-0 hover:bg-slate-50 ${taak.optioneel ? 'bg-amber-50/30' : ''}`}
    >
      {/* Naam + drag-handle + omschrijving + badges */}
      <td className="py-2 pr-3">
        <div className="flex items-start gap-1.5">
          {bewerkbaar && <GripVertical size={14} className="mt-0.5 shrink-0 cursor-grab text-slate-300" />}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-slate-800">{taak.naam}</span>
              {taak.optioneel && <Badge kleur="amber">Optionele taak</Badge>}
            </div>
            {taak.omschrijving && (
              <div className="mt-0.5 max-w-72 truncate text-xs text-slate-400" title={taak.omschrijving}>
                {taak.omschrijving}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Uren */}
      <td className="py-2 pr-3 text-right">
        {bewerkbaar ? (
          <NummerCel waarde={taak.uren} suffix="u" onCommit={(n) => patch({ uren: n })} />
        ) : (
          <span className="text-xs tabular-nums text-slate-600">{taak.uren} u</span>
        )}
      </td>

      {/* Duur */}
      <td className="py-2 pr-3 text-right">
        {bewerkbaar ? (
          <NummerCel waarde={taak.duurWerkdagen} min={1} suffix="d" onCommit={(n) => patch({ duurWerkdagen: n })} />
        ) : (
          <span className="text-xs tabular-nums text-slate-600">{taak.duurWerkdagen} d</span>
        )}
      </td>

      {/* Startmoment */}
      <td className="py-2 pr-3 text-right">
        {bewerkbaar ? (
          <NummerCel waarde={taak.startOffsetWerkdagen} suffix="d" onCommit={(n) => patch({ startOffsetWerkdagen: n })} />
        ) : (
          <span className="text-xs tabular-nums text-slate-600">+{taak.startOffsetWerkdagen} d</span>
        )}
      </td>

      {/* Afhankelijkheid */}
      <td className="py-2 pr-3">
        {bewerkbaar ? (
          <select
            value={taak.afhankelijkVan[0] ?? ''}
            onChange={(e) => patch({ afhankelijkVan: e.target.value ? [e.target.value] : [] })}
            className="w-32 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs focus:border-brand-500 focus:outline-none"
          >
            <option value="">—</option>
            {andereTaken.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-500">
            {fase.taken.find((t) => t.id === taak.afhankelijkVan[0])?.naam ?? '—'}
          </span>
        )}
      </td>

      {/* Afdeling */}
      <td className="py-2 pr-3">
        <Badge kleur={AFDELING_KLEUR[taak.afdeling]}>{AFDELING_LABELS[taak.afdeling]}</Badge>
      </td>

      {/* Standaardteam */}
      <td className="py-2 pr-3">
        {bewerkbaar ? (
          <select
            value={taak.standaardTeamId ?? ''}
            onChange={(e) => patch({ standaardTeamId: e.target.value || undefined })}
            className="w-32 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs focus:border-brand-500 focus:outline-none"
          >
            <option value="">Automatisch</option>
            {teamOpties.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-500">{teams.find((t) => t.id === taak.standaardTeamId)?.naam ?? '—'}</span>
        )}
      </td>

      {/* Vaardigheden */}
      <td className="py-2 pr-3">
        <div className="flex max-w-44 flex-wrap items-center gap-1">
          {taak.vaardigheden.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
            >
              {v}
              {bewerkbaar && (
                <button
                  type="button"
                  onClick={() => patch({ vaardigheden: taak.vaardigheden.filter((x) => x !== v) })}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {taak.vaardigheden.length === 0 && !vaardigheidToevoegen && (
            <span className="text-[11px] text-slate-400">—</span>
          )}
          {bewerkbaar &&
            (vaardigheidToevoegen ? (
              <input
                autoFocus
                value={nieuweVaardigheid}
                onChange={(e) => setNieuweVaardigheid(e.target.value)}
                onBlur={voegVaardigheidToe}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setNieuweVaardigheid('')
                    setVaardigheidToevoegen(false)
                  }
                }}
                placeholder="vaardigheid"
                className="w-24 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] focus:border-brand-500 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setVaardigheidToevoegen(true)}
                className="inline-flex items-center rounded-full border border-dashed border-slate-300 px-1 py-0.5 text-slate-400 hover:border-brand-400 hover:text-brand-600"
              >
                <Plus size={11} />
              </button>
            ))}
        </div>
      </td>

      {/* Medewerkers */}
      <td className="py-2 pr-3 text-right">
        {bewerkbaar ? (
          <NummerCel waarde={taak.aantalMedewerkers} min={1} onCommit={(n) => patch({ aantalMedewerkers: n })} />
        ) : (
          <span className="text-xs tabular-nums text-slate-600">{taak.aantalMedewerkers}</span>
        )}
      </td>

      {/* Verplicht / optioneel */}
      <td className="py-2 pr-3">
        {bewerkbaar ? (
          <button
            type="button"
            onClick={() => patch({ optioneel: !taak.optioneel })}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              taak.optioneel
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
            title="Klik om te wisselen tussen verplicht en optioneel"
          >
            {taak.optioneel ? 'Optioneel' : 'Verplicht'}
          </button>
        ) : (
          <span className="text-xs text-slate-500">{taak.optioneel ? 'Optioneel' : 'Verplicht'}</span>
        )}
      </td>

      {/* Acties */}
      <td className="py-2">
        {bewerkbaar && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Taak omhoog"
              disabled={index === 0}
              onClick={() => acties.taakVerplaatsRichting(fase.id, taak.id, -1)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              title="Taak omlaag"
              disabled={index === aantal - 1}
              onClick={() => acties.taakVerplaatsRichting(fase.id, taak.id, 1)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
            <button type="button" title="Bewerken" onClick={onBewerken} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-700">
              <Pencil size={14} />
            </button>
            <button
              type="button"
              title="Dupliceren"
              onClick={() => acties.taakDupliceer(fase.id, taak.id)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Copy size={14} />
            </button>
            {andereFases.length > 0 && (
              <span className="relative inline-flex">
                <select
                  value=""
                  onChange={(e) => e.target.value && acties.taakVerplaatsNaarFase(fase.id, taak.id, e.target.value)}
                  title="Verplaats naar andere fase"
                  className="w-7 cursor-pointer appearance-none rounded p-1 text-transparent hover:bg-slate-100"
                >
                  <option value="">Verplaats naar…</option>
                  {andereFases.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.naam}
                    </option>
                  ))}
                </select>
                <ArrowRightLeft size={14} className="pointer-events-none absolute left-1 top-1.5 text-slate-400" />
              </span>
            )}
            <button
              type="button"
              title="Verwijderen"
              onClick={() => acties.taakVerwijder(fase.id, taak.id)}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

export { NummerCel }
