// Herbruikbare taak-statuswissel voor de taakrij (status-dropdown) en het statusbord
// (drag-and-drop): directe overgangen met historie en undo-toast, reden-dialogen bij
// on hold en heropenen, en waarschuwingen rond afhankelijkheden.

import { useState, type ReactNode } from 'react'
import type { Taak, TaakStatus } from '../../../lib/types'
import { TAAK_STATUS_LABELS } from '../../../lib/types'
import { vandaagISO } from '../../../lib/dates'
import { afhankelijkeTaken, openVoorgangers, type TaakPlek } from '../../../lib/taken'
import { useApp } from '../../../store/AppState'
import { Invoer, Knop, Modal, Tekstvak, Veld, useToast } from '../../ui'

interface DialoogState {
  plek: TaakPlek
  doel: TaakStatus
  soort: 'on_hold' | 'heropenen'
}

export interface TaakStatusWissel {
  /** Voert de statuswissel direct uit of opent eerst het reden-dialoog (on hold/heropenen). */
  vraagStatusWissel: (plek: TaakPlek, nieuw: TaakStatus) => void
  /** Render dit element één keer in de omringende component. */
  statusDialoog: ReactNode
}

export function useTaakStatusWissel(projectId: string): TaakStatusWissel {
  const { data, dispatch, persona } = useApp()
  const { toon } = useToast()
  const [dialoog, setDialoog] = useState<DialoogState | null>(null)
  const [reden, setReden] = useState('')
  const [hervattenOp, setHervattenOp] = useState('')
  const undoActie = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' as const }) }

  const patchTaak = (
    plek: TaakPlek,
    patch: Partial<Taak>,
    historie: { wijziging: string; oud?: string; nieuw?: string } | undefined,
    tekst: string,
  ) => {
    dispatch({
      type: 'TAAK_BIJWERKEN',
      faseId: plek.fase.id,
      wpId: plek.proces.id,
      taakId: plek.taak.id,
      patch,
      gebruiker: persona.naam,
      historie,
    })
    toon('succes', tekst, undoActie)
  }

  const vraagStatusWissel = (plek: TaakPlek, nieuw: TaakStatus) => {
    const taak = plek.taak
    if (nieuw === taak.status) return
    // Heropenen van een gerede taak vraagt altijd om een korte reden.
    if (taak.status === 'gereed') {
      setReden('')
      setDialoog({ plek, doel: nieuw, soort: 'heropenen' })
      return
    }
    if (nieuw === 'on_hold') {
      setReden('')
      setHervattenOp('')
      setDialoog({ plek, doel: nieuw, soort: 'on_hold' })
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
        plek,
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
        plek,
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
      plek,
      { status: 'te_doen', onHoldReden: undefined, hervattenOp: undefined },
      historie,
      `"${taak.naam}" staat weer op te doen.`,
    )
  }

  const bevestigDialoog = () => {
    if (!dialoog) return
    const taak = dialoog.plek.taak
    if (reden.trim() === '') {
      toon('fout', dialoog.soort === 'on_hold' ? 'Een reden is verplicht om een taak on hold te zetten.' : 'Een korte reden is verplicht om een gerede taak te heropenen.')
      return
    }
    if (dialoog.soort === 'on_hold') {
      patchTaak(
        dialoog.plek,
        { status: 'on_hold', onHoldReden: reden.trim(), hervattenOp: hervattenOp || undefined },
        { wijziging: 'Status gewijzigd', oud: TAAK_STATUS_LABELS[taak.status], nieuw: TAAK_STATUS_LABELS.on_hold },
        `"${taak.naam}" staat on hold.`,
      )
    } else {
      const doel = dialoog.doel
      const patch: Partial<Taak> = { status: doel, werkelijkGereedOp: undefined }
      if (doel === 'in_uitvoering') patch.werkelijkeStart = taak.werkelijkeStart ?? vandaagISO()
      if (doel === 'on_hold') patch.onHoldReden = reden.trim()
      patchTaak(
        dialoog.plek,
        patch,
        { wijziging: `Taak heropend — ${reden.trim()}`, oud: TAAK_STATUS_LABELS.gereed, nieuw: TAAK_STATUS_LABELS[doel] },
        `"${taak.naam}" is heropend.`,
      )
    }
    setDialoog(null)
  }

  const statusDialoog = (
    <Modal
      open={dialoog !== null}
      titel={
        dialoog?.soort === 'on_hold'
          ? `Taak on hold — ${dialoog.plek.taak.naam}`
          : `Taak heropenen — ${dialoog?.plek.taak.naam ?? ''}`
      }
      onSluiten={() => setDialoog(null)}
      voettekst={
        <>
          <Knop onClick={() => setDialoog(null)}>Annuleren</Knop>
          <Knop variant="primary" onClick={bevestigDialoog}>
            {dialoog?.soort === 'on_hold' ? 'On hold zetten' : `Naar ${dialoog ? TAAK_STATUS_LABELS[dialoog.doel].toLowerCase() : ''}`}
          </Knop>
        </>
      }
    >
      <div className="space-y-3">
        <Veld label={dialoog?.soort === 'on_hold' ? 'Reden' : 'Reden van heropenen'} verplicht>
          <Tekstvak
            rows={2}
            value={reden}
            onChange={(e) => setReden(e.target.value)}
            placeholder={
              dialoog?.soort === 'on_hold'
                ? 'Bijv. wachten op materiaal, prioriteit elders…'
                : 'Bijv. keuring afgekeurd, rework nodig…'
            }
          />
        </Veld>
        {dialoog?.soort === 'on_hold' && (
          <Veld label="Verwachte hervattingsdatum (optioneel)">
            <Invoer type="date" value={hervattenOp} onChange={(e) => setHervattenOp(e.target.value)} />
          </Veld>
        )}
      </div>
    </Modal>
  )

  return { vraagStatusWissel, statusDialoog }
}
