// Uitklapbare procesrij (werkpakket) binnen een fasekaart: badges, gesegmenteerde
// voortgang op urenbasis (of handmatige voortgang zonder taken), procesacties en taakrijen.

import { useState } from 'react'
import { ArrowRightLeft, ChevronDown, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Fase, Taak, Werkpakket } from '../../../lib/types'
import { FASE_STATUS_LABELS } from '../../../lib/types'
import { formatDatumKort } from '../../../lib/dates'
import { telTaken, type TaakTelling } from '../../../lib/taken'
import { projectFases } from '../../../lib/capacity'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { Badge, BevestigDialog, Keuze, Knop, Modal, Veld, VoortgangsBalk, useToast } from '../../ui'
import { FASE_STATUS_KLEUR, magVoortgangBijwerken, RijMenu, VoortgangInvoer, type MenuItem } from './gedeeld'
import NotitiePopover from './NotitiePopover'
import ProcesModal from './ProcesModal'
import TaakRij from './TaakRij'

interface Props {
  fase: Fase
  proces: Werkpakket
  /** Nieuwe taak toevoegen binnen dit proces (opent de TaakModal op fasekaartniveau). */
  onTaakNieuw: () => void
  /** Bestaande taak bewerken; toewijzen=true opent de modal op de toewijzingssectie. */
  onTaakBewerken: (taak: Taak, toewijzen?: boolean) => void
}

function tellingTekst(t: TaakTelling): string {
  const delen = [`${t.gereed} van ${t.totaal} ${t.totaal === 1 ? 'taak' : 'taken'} gereed`]
  if (t.inUitvoering > 0) delen.push(`${t.inUitvoering} in uitvoering`)
  if (t.onHold > 0) delen.push(`${t.onHold} on hold`)
  return delen.join(' · ')
}

/** Gesegmenteerde voortgangsbalk op urenbasis: gereed / in uitvoering / on hold / te doen. */
function SegmentBalk({ taken, telling }: { taken: Taak[]; telling: TaakTelling }) {
  const urenInUitvoering = taken.filter((t) => t.status === 'in_uitvoering').reduce((s, t) => s + t.uren, 0)
  const urenOnHold = taken.filter((t) => t.status === 'on_hold').reduce((s, t) => s + t.uren, 0)
  const totaal = telling.urenTotaal || 1
  const segmenten = [
    { kleur: 'bg-emerald-500', pct: (telling.urenGereed / totaal) * 100, label: 'gereed' },
    { kleur: 'bg-sky-500', pct: (urenInUitvoering / totaal) * 100, label: 'in uitvoering' },
    { kleur: 'bg-amber-400', pct: (urenOnHold / totaal) * 100, label: 'on hold' },
  ].filter((s) => s.pct > 0)
  return (
    <div
      className="flex w-full items-center gap-2"
      title={`${telling.urenGereed} van ${telling.urenTotaal} uur gereed · rest te doen`}
    >
      <div className="flex h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-slate-200">
        {segmenten.map((s, i) => (
          <div key={i} className={`h-full ${s.kleur}`} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">{telling.pct}%</span>
    </div>
  )
}

export default function ProcesRij({ fase, proces, onTaakNieuw, onTaakBewerken }: Props) {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const [open, setOpen] = useState(false)
  const [bewerkOpen, setBewerkOpen] = useState(false)
  const [verplaatsOpen, setVerplaatsOpen] = useState(false)
  const [doelFaseId, setDoelFaseId] = useState('')
  const [verwijderOpen, setVerwijderOpen] = useState(false)

  const telling = telTaken(proces.taken)
  const heeftTaken = proces.taken.length > 0
  const faseTeam = fase.teamId ? data.teams.find((t) => t.id === fase.teamId) : undefined
  const magPlanning = permissies.planningBewerken
  const magVoortgang = magVoortgangBijwerken(
    persona.rol,
    persona.afdeling,
    fase,
    permissies.voortgangBijwerken,
    faseTeam?.afdeling,
  )
  const verantwoordelijke = proces.verantwoordelijkeId
    ? data.medewerkers.find((m) => m.id === proces.verantwoordelijkeId)
    : undefined
  const undoActie = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' as const }) }

  // Externe uitvoering: op procesniveau óf via één van de taken.
  const taakExtern = proces.taken.find((t) => t.uitvoering === 'extern')
  const isExtern = proces.uitvoering === 'extern' || !!taakExtern
  const externPartijId = proces.externePartijId ?? taakExtern?.externeActie?.partijId
  const externPartner = externPartijId ? data.externePartijen.find((p) => p.id === externPartijId) : undefined

  const zetVoortgang = (v: number) => {
    dispatch({
      type: 'WERKPAKKET_BIJWERKEN',
      faseId: fase.id,
      wpId: proces.id,
      patch: { voortgang: v, status: v >= 100 ? 'gereed' : v > 0 ? 'bezig' : 'gepland' },
    })
    toon('succes', `Voortgang van "${proces.naam}" bijgewerkt naar ${v}%.`)
  }

  const dupliceer = () => {
    const idMap = new Map<string, string>()
    const taken = proces.taken
      .map((t) => {
        const nieuwId = uid('taak')
        idMap.set(t.id, nieuwId)
        return { ...t, id: nieuwId }
      })
      .map((t) => ({ ...t, afhankelijkVan: t.afhankelijkVan.map((d) => idMap.get(d) ?? d) }))
    const kopie: Werkpakket = { ...proces, id: uid('wp'), naam: `${proces.naam} (kopie)`, taken, extraTaak: true }
    dispatch({ type: 'WERKPAKKET_TOEVOEGEN', faseId: fase.id, werkpakket: kopie, gebruiker: persona.naam })
    toon('succes', `Proces gedupliceerd als "${kopie.naam}".`, undoActie)
  }

  const fasesVanProject = projectFases(data, fase.projectId)
  const verplaatsOpties = fasesVanProject.filter((f) => f.id !== fase.id)

  const verplaats = () => {
    if (!doelFaseId) return
    const naarFase = fasesVanProject.find((f) => f.id === doelFaseId)
    dispatch({
      type: 'WERKPAKKET_VERPLAATSEN',
      vanFaseId: fase.id,
      wpId: proces.id,
      naarFaseId: doelFaseId,
      gebruiker: persona.naam,
    })
    toon('succes', `Proces "${proces.naam}" verplaatst naar "${naarFase?.naam ?? '—'}".`, undoActie)
    setVerplaatsOpen(false)
  }

  const verwijder = () => {
    dispatch({ type: 'WERKPAKKET_VERWIJDEREN', faseId: fase.id, wpId: proces.id, gebruiker: persona.naam })
    toon('succes', `Proces "${proces.naam}" verwijderd.`, undoActie)
    setVerwijderOpen(false)
  }

  const menuItems: MenuItem[] = magPlanning
    ? [
        { label: 'Taak toevoegen', icon: <Plus size={14} />, onClick: onTaakNieuw },
        { label: 'Proces bewerken', icon: <Pencil size={14} />, onClick: () => setBewerkOpen(true) },
        { label: 'Proces dupliceren', icon: <Copy size={14} />, onClick: dupliceer },
        {
          label: 'Proces verplaatsen…',
          icon: <ArrowRightLeft size={14} />,
          onClick: () => {
            setDoelFaseId(verplaatsOpties[0]?.id ?? '')
            setVerplaatsOpen(true)
          },
          disabled: verplaatsOpties.length === 0,
          title: verplaatsOpties.length === 0 ? 'Dit project heeft geen andere fases' : undefined,
        },
        { label: 'Proces verwijderen', icon: <Trash2 size={14} />, gevaarlijk: true, onClick: () => setVerwijderOpen(true) },
      ]
    : []

  return (
    <div className="rounded-md border border-slate-200">
      {/* Kopregel */}
      <div
        className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-slate-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-700">{proces.naam}</span>
            {proces.extraTaak && <Badge kleur="amber">Projectspecifiek</Badge>}
            {proces.optioneel && <Badge kleur="grijs">Optionele taak</Badge>}
            {isExtern && (
              <Badge kleur="paars">{externPartner ? `Extern · ${externPartner.naam}` : 'Extern'}</Badge>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {heeftTaken ? tellingTekst(telling) : 'Geen taken — voortgang op procesniveau'}
            {(proces.start || proces.eind) && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {formatDatumKort(proces.start ?? fase.start)} – {formatDatumKort(proces.eind ?? fase.eind)}
                </span>
              </>
            )}
            {verantwoordelijke && <> · {verantwoordelijke.naam}</>}
          </div>
        </div>
        <span className="text-xs tabular-nums text-slate-500">{proces.uren} u</span>
        <Badge kleur={FASE_STATUS_KLEUR[proces.status]}>{FASE_STATUS_LABELS[proces.status]}</Badge>
        <div className="w-48 min-w-36" onClick={(e) => e.stopPropagation()}>
          {heeftTaken ? (
            <SegmentBalk taken={proces.taken} telling={telling} />
          ) : magVoortgang ? (
            <VoortgangInvoer waarde={proces.voortgang} onCommit={zetVoortgang} />
          ) : (
            <VoortgangsBalk pct={proces.voortgang} />
          )}
        </div>
        <span className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <NotitiePopover projectId={fase.projectId} niveau="proces" doelId={proces.id} doelNaam={proces.naam} />
          <RijMenu items={menuItems} title="Procesacties" />
        </span>
      </div>

      {/* Uitgeklapt: taakrijen */}
      {open && (
        <div className="border-t border-slate-100 px-3 py-2">
          {proces.omschrijving && <p className="mb-2 text-xs italic text-slate-500">{proces.omschrijving}</p>}
          {heeftTaken ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-3 font-medium">Taak</th>
                      <th className="py-1.5 pr-3 font-medium">Team & mensen</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Uren</th>
                      <th className="py-1.5 pr-3 font-medium">Status</th>
                      <th className="py-1.5 pr-3 font-medium">Planning</th>
                      <th className="py-1.5 text-right font-medium">Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proces.taken.map((t) => (
                      <TaakRij
                        key={t.id}
                        fase={fase}
                        proces={proces}
                        taak={t}
                        onBewerken={() => onTaakBewerken(t)}
                        onToewijzen={() => onTaakBewerken(t, true)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {magPlanning && (
                <div className="mt-2">
                  <Knop klein onClick={onTaakNieuw}>
                    <Plus size={13} /> Taak toevoegen
                  </Knop>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                Dit proces heeft nog geen taken; de voortgang wordt handmatig op procesniveau bijgehouden.
              </p>
              {magPlanning && (
                <Knop klein onClick={onTaakNieuw}>
                  <Plus size={13} /> Taak toevoegen
                </Knop>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dialogen */}
      <ProcesModal open={bewerkOpen} fase={fase} proces={proces} onSluiten={() => setBewerkOpen(false)} />

      <Modal
        open={verplaatsOpen}
        titel={`Proces verplaatsen — ${proces.naam}`}
        onSluiten={() => setVerplaatsOpen(false)}
        voettekst={
          <>
            <Knop onClick={() => setVerplaatsOpen(false)}>Annuleren</Knop>
            <Knop variant="primary" disabled={!doelFaseId} onClick={verplaats}>
              Verplaatsen
            </Knop>
          </>
        }
      >
        <Veld label="Naar fase">
          <Keuze value={doelFaseId} onChange={(e) => setDoelFaseId(e.target.value)}>
            {verplaatsOpties.map((f) => (
              <option key={f.id} value={f.id}>
                {f.naam}
              </option>
            ))}
          </Keuze>
        </Veld>
        <p className="mt-2 text-xs text-slate-400">
          Het proces verhuist met alle {proces.taken.length} taak/taken; de uren tellen daarna mee in de doelfase.
        </p>
      </Modal>

      <BevestigDialog
        open={verwijderOpen}
        titel="Proces verwijderen"
        tekst={`Weet je zeker dat je het proces "${proces.naam}" wilt verwijderen?${
          proces.taken.length > 0 ? ` Hiermee verwijder je ook ${proces.taken.length} ${proces.taken.length === 1 ? 'taak' : 'taken'}.` : ''
        }`}
        bevestigLabel="Proces verwijderen"
        gevaarlijk
        onBevestig={verwijder}
        onAnnuleer={() => setVerwijderOpen(false)}
      />
    </div>
  )
}
