// Eén taakregel in de procestabel: naam met badges, toewijzing, uren, status-dropdown
// met statusacties (mini-dialogen), planning en taakacties (kebab).

import { useState } from 'react'
import { ArrowRightLeft, Copy, OctagonAlert, Pencil, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import type { Taak, TaakStatus, Fase, Werkpakket } from '../../../lib/types'
import { EXTERNE_ACTIE_LABELS, TAAK_STATUS_LABELS } from '../../../lib/types'
import { formatDatum, formatDatumKort, vandaagISO } from '../../../lib/dates'
import { afhankelijkeTaken, openVoorgangers, TAAK_STATUS_VOLGORDE, urenPerUitvoerende } from '../../../lib/taken'
import { projectFases } from '../../../lib/capacity'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { BevestigDialog, Badge, Invoer, Keuze, Knop, Modal, Tekstvak, Tooltip, Veld, useToast } from '../../ui'
import { AvatarRij, magVoortgangBijwerken, RijMenu, TAAK_STATUS_SELECT_STIJL, type MenuItem } from './gedeeld'
import NotitiePopover from './NotitiePopover'

interface Props {
  fase: Fase
  proces: Werkpakket
  taak: Taak
  onBewerken: () => void
  onToewijzen: () => void
}

export default function TaakRij({ fase, proces, taak, onBewerken, onToewijzen }: Props) {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()

  const [statusDialoog, setStatusDialoog] = useState<{ doel: TaakStatus; soort: 'on_hold' | 'heropenen' } | null>(null)
  const [reden, setReden] = useState('')
  const [hervattenOp, setHervattenOp] = useState('')
  const [blokkadeOpen, setBlokkadeOpen] = useState(false)
  const [blokkadeTekst, setBlokkadeTekst] = useState('')
  const [verplaatsOpen, setVerplaatsOpen] = useState(false)
  const [doelFaseId, setDoelFaseId] = useState(fase.id)
  const [doelWpId, setDoelWpId] = useState(proces.id)
  const [verwijderOpen, setVerwijderOpen] = useState(false)

  const projectId = fase.projectId
  const team = taak.teamId ? data.teams.find((t) => t.id === taak.teamId) : undefined
  const faseTeam = fase.teamId ? data.teams.find((t) => t.id === fase.teamId) : undefined
  const eigenaar = taak.taakEigenaarId ? data.medewerkers.find((m) => m.id === taak.taakEigenaarId) : undefined
  const uitvoerenden = taak.uitvoerendeIds
    .map((id) => data.medewerkers.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m)
  const partner = taak.externeActie?.partijId
    ? data.externePartijen.find((p) => p.id === taak.externeActie?.partijId)
    : undefined

  const magPlanning = permissies.planningBewerken
  const magStatus = magVoortgangBijwerken(
    persona.rol,
    persona.afdeling,
    fase,
    permissies.voortgangBijwerken,
    team?.afdeling ?? faseTeam?.afdeling,
  )
  const magNotitie = persona.rol !== 'management'
  const undoActie = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' as const }) }

  const patchTaak = (
    patch: Partial<Taak>,
    historie: { wijziging: string; oud?: string; nieuw?: string } | undefined,
    tekst: string,
    soort: 'succes' | 'waarschuwing' = 'succes',
  ) => {
    dispatch({
      type: 'TAAK_BIJWERKEN',
      faseId: fase.id,
      wpId: proces.id,
      taakId: taak.id,
      patch,
      gebruiker: persona.naam,
      historie,
    })
    toon(soort, tekst, undoActie)
  }

  // ---------- Statusacties ----------

  const wijzigStatus = (nieuw: TaakStatus) => {
    if (nieuw === taak.status) return
    // Heropenen van een gerede taak vraagt altijd om een korte reden.
    if (taak.status === 'gereed') {
      setReden('')
      setStatusDialoog({ doel: nieuw, soort: 'heropenen' })
      return
    }
    if (nieuw === 'on_hold') {
      setReden('')
      setHervattenOp('')
      setStatusDialoog({ doel: nieuw, soort: 'on_hold' })
      return
    }
    const historie = {
      wijziging: 'Status gewijzigd',
      oud: TAAK_STATUS_LABELS[taak.status],
      nieuw: TAAK_STATUS_LABELS[nieuw],
    }
    if (nieuw === 'in_uitvoering') {
      const voorgangers = openVoorgangers(data, projectId, taak)
      patchTaak(
        { status: 'in_uitvoering', werkelijkeStart: taak.werkelijkeStart ?? vandaagISO(), onHoldReden: undefined, hervattenOp: undefined },
        historie,
        `"${taak.naam}" staat nu op in uitvoering.`,
      )
      if (voorgangers.length > 0) {
        toon(
          'waarschuwing',
          `Voorganger "${voorgangers[0].taak.naam}" is nog niet gereed.${voorgangers.length > 1 ? ` (+${voorgangers.length - 1} andere voorganger(s))` : ''}`,
        )
      }
      return
    }
    if (nieuw === 'gereed') {
      // Afhankelijke taken die door deze gereedmelding kunnen starten (alle overige voorgangers al gereed).
      const kanStarten = afhankelijkeTaken(data, projectId, taak.id).filter(
        (dep) =>
          dep.taak.status === 'te_doen' &&
          openVoorgangers(data, projectId, dep.taak).every((p) => p.taak.id === taak.id),
      )
      patchTaak(
        { status: 'gereed', werkelijkGereedOp: vandaagISO(), onHoldReden: undefined, hervattenOp: undefined },
        historie,
        `"${taak.naam}" is gereed gemeld.`,
      )
      if (kanStarten.length > 0) {
        toon(
          'info',
          kanStarten.length === 1
            ? `"${kanStarten[0].taak.naam}" kan nu starten — alle voorgangers zijn gereed.`
            : `${kanStarten.map((p) => `"${p.taak.naam}"`).join(' en ')} kunnen nu starten — alle voorgangers zijn gereed.`,
        )
      }
      return
    }
    // Terug naar 'te doen'.
    patchTaak(
      { status: 'te_doen', onHoldReden: undefined, hervattenOp: undefined },
      historie,
      `"${taak.naam}" staat weer op te doen.`,
    )
  }

  const bevestigStatusDialoog = () => {
    if (!statusDialoog) return
    if (reden.trim() === '') {
      toon('fout', statusDialoog.soort === 'on_hold' ? 'Een reden is verplicht om een taak on hold te zetten.' : 'Een korte reden is verplicht om een gerede taak te heropenen.')
      return
    }
    if (statusDialoog.soort === 'on_hold') {
      patchTaak(
        { status: 'on_hold', onHoldReden: reden.trim(), hervattenOp: hervattenOp || undefined },
        { wijziging: 'Status gewijzigd', oud: TAAK_STATUS_LABELS[taak.status], nieuw: TAAK_STATUS_LABELS.on_hold },
        `"${taak.naam}" staat on hold.`,
      )
    } else {
      const doel = statusDialoog.doel
      const patch: Partial<Taak> = { status: doel, werkelijkGereedOp: undefined }
      if (doel === 'in_uitvoering') patch.werkelijkeStart = taak.werkelijkeStart ?? vandaagISO()
      if (doel === 'on_hold') patch.onHoldReden = reden.trim()
      patchTaak(
        patch,
        { wijziging: `Taak heropend — ${reden.trim()}`, oud: TAAK_STATUS_LABELS.gereed, nieuw: TAAK_STATUS_LABELS[doel] },
        `"${taak.naam}" is heropend.`,
      )
    }
    setStatusDialoog(null)
  }

  // ---------- Blokkade ----------

  const meldBlokkade = () => {
    if (blokkadeTekst.trim() === '') {
      toon('fout', 'Beschrijf kort waarom deze taak geblokkeerd is.')
      return
    }
    patchTaak(
      { blokkade: blokkadeTekst.trim() },
      { wijziging: 'Blokkade gemeld', nieuw: blokkadeTekst.trim() },
      `Blokkade gemeld op "${taak.naam}".`,
      'waarschuwing',
    )
    setBlokkadeOpen(false)
    setBlokkadeTekst('')
  }

  const hefBlokkadeOp = () => {
    patchTaak(
      { blokkade: undefined },
      { wijziging: 'Blokkade opgeheven', oud: taak.blokkade },
      `Blokkade op "${taak.naam}" opgeheven.`,
    )
  }

  // ---------- Dupliceren / verplaatsen / verwijderen ----------

  const dupliceer = () => {
    const kopie: Taak = {
      ...taak,
      id: uid('taak'),
      naam: `${taak.naam} (kopie)`,
      projectspecifiek: true,
      aangemaaktOp: vandaagISO(),
      aangemaaktDoor: persona.naam,
      gewijzigdOp: vandaagISO(),
      gewijzigdDoor: persona.naam,
    }
    dispatch({ type: 'TAAK_TOEVOEGEN', faseId: fase.id, wpId: proces.id, taak: kopie, gebruiker: persona.naam })
    toon('succes', `Taak gedupliceerd als "${kopie.naam}".`, undoActie)
  }

  const fasesVanProject = projectFases(data, projectId)
  const doelFase = fasesVanProject.find((f) => f.id === doelFaseId)

  const verplaats = () => {
    if (!doelWpId || (doelFaseId === fase.id && doelWpId === proces.id)) return
    const naarFase = fasesVanProject.find((f) => f.id === doelFaseId)
    const naarWp = naarFase?.werkpakketten.find((w) => w.id === doelWpId)
    dispatch({
      type: 'TAAK_VERPLAATSEN',
      vanFaseId: fase.id,
      vanWpId: proces.id,
      taakId: taak.id,
      naarFaseId: doelFaseId,
      naarWpId: doelWpId,
      gebruiker: persona.naam,
    })
    toon('succes', `"${taak.naam}" verplaatst naar ${naarFase?.naam ?? '—'} · ${naarWp?.naam ?? '—'}.`, undoActie)
    setVerplaatsOpen(false)
  }

  const afhankelijken = afhankelijkeTaken(data, projectId, taak.id)

  const verwijder = () => {
    dispatch({ type: 'TAAK_VERWIJDEREN', faseId: fase.id, wpId: proces.id, taakId: taak.id, gebruiker: persona.naam })
    toon('succes', `Taak "${taak.naam}" verwijderd.`, undoActie)
    setVerwijderOpen(false)
  }

  // ---------- Menu ----------

  const menuItems: MenuItem[] = []
  if (magPlanning) {
    menuItems.push(
      { label: 'Bewerken', icon: <Pencil size={14} />, onClick: onBewerken },
      { label: 'Toewijzen', icon: <UserPlus size={14} />, onClick: onToewijzen },
      { label: 'Dupliceren', icon: <Copy size={14} />, onClick: dupliceer },
      {
        label: 'Verplaatsen…',
        icon: <ArrowRightLeft size={14} />,
        onClick: () => {
          setDoelFaseId(fase.id)
          setDoelWpId(proces.id)
          setVerplaatsOpen(true)
        },
      },
    )
  }
  if (magStatus) {
    menuItems.push(
      taak.blokkade
        ? { label: 'Blokkade opheffen', icon: <ShieldCheck size={14} />, onClick: hefBlokkadeOp }
        : { label: 'Blokkade melden', icon: <OctagonAlert size={14} />, onClick: () => setBlokkadeOpen(true) },
    )
  }
  if (magPlanning) {
    menuItems.push({ label: 'Verwijderen', icon: <Trash2 size={14} />, gevaarlijk: true, onClick: () => setVerwijderOpen(true) })
  }

  const externTooltip = partner
    ? `Extern · ${partner.naam}${taak.externeActie ? ` · ${EXTERNE_ACTIE_LABELS[taak.externeActie.status]}` : ''}`
    : `Externe uitvoering${taak.externeActie ? ` · ${EXTERNE_ACTIE_LABELS[taak.externeActie.status]}` : ''}`

  return (
    <>
      <tr className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70">
        {/* Taak */}
        <td className="py-2 pr-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {taak.prioriteit === 'hoog' && (
              <Tooltip tekst="Prioriteit: Hoog">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
              </Tooltip>
            )}
            {magPlanning ? (
              <button
                type="button"
                onClick={onBewerken}
                className="text-left text-sm font-medium text-slate-700 hover:text-brand-700 hover:underline"
              >
                {taak.naam}
              </button>
            ) : (
              <span className="text-sm font-medium text-slate-700">{taak.naam}</span>
            )}
            {taak.blokkade && (
              <Tooltip tekst={`Blokkade: ${taak.blokkade}`}>
                <OctagonAlert size={14} className="shrink-0 text-red-500" />
              </Tooltip>
            )}
            {taak.projectspecifiek && <Badge kleur="amber">Projectspecifiek</Badge>}
            {taak.uitvoering === 'extern' && (
              <Tooltip tekst={externTooltip}>
                <span>
                  <Badge kleur="paars">Extern</Badge>
                </span>
              </Tooltip>
            )}
          </div>
          {taak.omschrijving && <div className="mt-0.5 max-w-72 truncate text-xs text-slate-400">{taak.omschrijving}</div>}
        </td>

        {/* Team & mensen */}
        <td className="py-2 pr-3">
          {team && <div className="text-[11px] text-slate-400">{team.naam}</div>}
          <div className="flex items-center gap-1.5">
            {eigenaar && (
              <Tooltip tekst="Taakeigenaar">
                <span className="text-xs font-semibold text-slate-700">{eigenaar.naam}</span>
              </Tooltip>
            )}
            <AvatarRij medewerkers={uitvoerenden} uren={urenPerUitvoerende(taak)} />
          </div>
          {!team && !eigenaar && uitvoerenden.length === 0 && (
            <span className="text-xs text-slate-400">Niet toegewezen</span>
          )}
        </td>

        {/* Uren */}
        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{taak.uren} u</td>

        {/* Status */}
        <td className="py-2 pr-3">
          {magStatus ? (
            <select
              value={taak.status}
              onChange={(e) => wijzigStatus(e.target.value as TaakStatus)}
              onClick={(e) => e.stopPropagation()}
              title={
                taak.status === 'on_hold' && taak.onHoldReden
                  ? `On hold: ${taak.onHoldReden}${taak.hervattenOp ? ` · hervatten ${formatDatum(taak.hervattenOp)}` : ''}`
                  : 'Taakstatus wijzigen'
              }
              className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-100 ${TAAK_STATUS_SELECT_STIJL[taak.status]}`}
            >
              {TAAK_STATUS_VOLGORDE.map((s) => (
                <option key={s} value={s}>
                  {TAAK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <Badge
              kleur={taak.status === 'gereed' ? 'groen' : taak.status === 'in_uitvoering' ? 'blauw' : taak.status === 'on_hold' ? 'amber' : 'grijs'}
              title={taak.status === 'on_hold' && taak.onHoldReden ? `On hold: ${taak.onHoldReden}` : undefined}
            >
              {TAAK_STATUS_LABELS[taak.status]}
            </Badge>
          )}
        </td>

        {/* Planning */}
        <td className="py-2 pr-3">
          {!taak.start && !taak.eind ? (
            <span className="text-xs text-slate-400">Volgt fase</span>
          ) : (
            <span className="text-xs tabular-nums text-slate-600">
              {formatDatumKort(taak.start ?? fase.start)} – {formatDatumKort(taak.eind ?? fase.eind)}
            </span>
          )}
          {taak.status === 'on_hold' && taak.hervattenOp && (
            <div className="text-[11px] text-amber-600">hervatten {formatDatumKort(taak.hervattenOp)}</div>
          )}
        </td>

        {/* Acties */}
        <td className="py-1.5 text-right">
          <div className="flex items-center justify-end gap-0.5">
            {magNotitie && (
              <NotitiePopover projectId={projectId} niveau="taak" doelId={taak.id} doelNaam={taak.naam} />
            )}
            <RijMenu items={menuItems} title="Taakacties" />
          </div>
        </td>
      </tr>

      {/* On hold / heropenen mini-dialoog */}
      <Modal
        open={statusDialoog !== null}
        titel={statusDialoog?.soort === 'on_hold' ? `Taak on hold — ${taak.naam}` : `Taak heropenen — ${taak.naam}`}
        onSluiten={() => setStatusDialoog(null)}
        voettekst={
          <>
            <Knop onClick={() => setStatusDialoog(null)}>Annuleren</Knop>
            <Knop variant="primary" onClick={bevestigStatusDialoog}>
              {statusDialoog?.soort === 'on_hold' ? 'On hold zetten' : `Naar ${statusDialoog ? TAAK_STATUS_LABELS[statusDialoog.doel].toLowerCase() : ''}`}
            </Knop>
          </>
        }
      >
        <div className="space-y-3">
          <Veld label={statusDialoog?.soort === 'on_hold' ? 'Reden' : 'Reden van heropenen'} verplicht>
            <Tekstvak
              rows={2}
              value={reden}
              onChange={(e) => setReden(e.target.value)}
              placeholder={
                statusDialoog?.soort === 'on_hold'
                  ? 'Bijv. wachten op materiaal, prioriteit elders…'
                  : 'Bijv. keuring afgekeurd, rework nodig…'
              }
            />
          </Veld>
          {statusDialoog?.soort === 'on_hold' && (
            <Veld label="Verwachte hervattingsdatum (optioneel)">
              <Invoer type="date" value={hervattenOp} onChange={(e) => setHervattenOp(e.target.value)} />
            </Veld>
          )}
        </div>
      </Modal>

      {/* Blokkade melden */}
      <Modal
        open={blokkadeOpen}
        titel={`Blokkade melden — ${taak.naam}`}
        onSluiten={() => setBlokkadeOpen(false)}
        voettekst={
          <>
            <Knop onClick={() => setBlokkadeOpen(false)}>Annuleren</Knop>
            <Knop variant="danger" onClick={meldBlokkade}>
              Blokkade melden
            </Knop>
          </>
        }
      >
        <Veld label="Blokkadenotitie" verplicht>
          <Tekstvak
            rows={2}
            value={blokkadeTekst}
            onChange={(e) => setBlokkadeTekst(e.target.value)}
            placeholder="Bijv. wachten op onderdelen, keuring afgekeurd…"
          />
        </Veld>
      </Modal>

      {/* Verplaatsen */}
      <Modal
        open={verplaatsOpen}
        titel={`Taak verplaatsen — ${taak.naam}`}
        onSluiten={() => setVerplaatsOpen(false)}
        voettekst={
          <>
            <Knop onClick={() => setVerplaatsOpen(false)}>Annuleren</Knop>
            <Knop
              variant="primary"
              disabled={!doelWpId || (doelFaseId === fase.id && doelWpId === proces.id)}
              onClick={verplaats}
            >
              Verplaatsen
            </Knop>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Naar fase">
            <Keuze
              value={doelFaseId}
              onChange={(e) => {
                const id = e.target.value
                setDoelFaseId(id)
                setDoelWpId(fasesVanProject.find((f) => f.id === id)?.werkpakketten[0]?.id ?? '')
              }}
            >
              {fasesVanProject.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.naam}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Naar proces">
            <Keuze value={doelWpId} onChange={(e) => setDoelWpId(e.target.value)}>
              {(doelFase?.werkpakketten ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.naam}
                </option>
              ))}
            </Keuze>
          </Veld>
        </div>
        {doelFase && doelFase.werkpakketten.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">Deze fase heeft nog geen processen — voeg eerst een proces toe.</p>
        )}
      </Modal>

      {/* Verwijderen */}
      <BevestigDialog
        open={verwijderOpen}
        titel="Taak verwijderen"
        tekst={`Weet je zeker dat je de taak "${taak.naam}" wilt verwijderen?${
          afhankelijken.length > 0
            ? ` Let op: ${afhankelijken.length} ${afhankelijken.length === 1 ? 'taak is' : 'taken zijn'} afhankelijk van deze taak; die afhankelijkheid vervalt.`
            : ''
        }`}
        bevestigLabel="Taak verwijderen"
        gevaarlijk
        onBevestig={verwijder}
        onAnnuleer={() => setVerwijderOpen(false)}
      />
    </>
  )
}
