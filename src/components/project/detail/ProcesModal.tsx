// Modal om een proces (werkpakket) toe te voegen of te bewerken:
// naam, omschrijving, verantwoordelijke, intern/extern met partner en eigen periode.

import { useEffect, useState } from 'react'
import type { ExternePartij, Fase, Werkpakket } from '../../../lib/types'
import { formatDatum } from '../../../lib/dates'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { Invoer, Keuze, Knop, Modal, Tekstvak, Veld, useToast } from '../../ui'
import { SegmentKeuze } from './gedeeld'
import NieuwePartnerModal from './NieuwePartnerModal'

const NIEUWE_PARTNER = '__nieuwe_partner'

interface Props {
  open: boolean
  fase: Fase
  /** Bestaand proces om te bewerken; leeg = nieuw proces toevoegen. */
  proces?: Werkpakket
  onSluiten: () => void
}

export default function ProcesModal({ open, fase, proces, onSluiten }: Props) {
  const { data, dispatch, persona } = useApp()
  const { toon } = useToast()
  const [naam, setNaam] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [verantwoordelijkeId, setVerantwoordelijkeId] = useState('')
  const [uitvoering, setUitvoering] = useState<'intern' | 'extern'>('intern')
  const [partijId, setPartijId] = useState('')
  const [start, setStart] = useState('')
  const [eind, setEind] = useState('')
  const [uren, setUren] = useState('0')
  const [fout, setFout] = useState<Record<string, string>>({})
  const [partnerModalOpen, setPartnerModalOpen] = useState(false)

  const zonderTaken = (proces?.taken.length ?? 0) === 0

  useEffect(() => {
    if (!open) return
    setFout({})
    setPartnerModalOpen(false)
    if (proces) {
      setNaam(proces.naam)
      setOmschrijving(proces.omschrijving ?? '')
      setVerantwoordelijkeId(proces.verantwoordelijkeId ?? '')
      setUitvoering(proces.uitvoering ?? 'intern')
      setPartijId(proces.externePartijId ?? '')
      setStart(proces.start ?? '')
      setEind(proces.eind ?? '')
      setUren(String(proces.uren))
    } else {
      setNaam('')
      setOmschrijving('')
      setVerantwoordelijkeId('')
      setUitvoering('intern')
      setPartijId('')
      setStart('')
      setEind('')
      setUren('0')
    }
  }, [open, proces])

  const partners = data.externePartijen.filter((p) => !p.gearchiveerd).sort((a, b) => a.naam.localeCompare(b.naam))
  const medewerkers = data.medewerkers.filter((m) => m.actief).sort((a, b) => a.naam.localeCompare(b.naam))

  const kiesPartner = (v: string) => {
    if (v === NIEUWE_PARTNER) {
      setPartnerModalOpen(true)
      return
    }
    setPartijId(v)
  }

  const partnerToegevoegd = (partij: ExternePartij) => {
    setPartijId(partij.id)
  }

  const opslaan = () => {
    const f: Record<string, string> = {}
    if (naam.trim() === '') f.naam = 'Een procesnaam is verplicht.'
    if (start && eind && eind < start) f.eind = 'De einddatum kan niet vóór de startdatum liggen.'
    const urenN = Number(uren)
    if (zonderTaken && (!Number.isFinite(urenN) || urenN < 0)) f.uren = 'Uren moet 0 of hoger zijn.'
    if (Object.keys(f).length > 0) {
      setFout(f)
      return
    }
    const undoActie = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' as const }) }
    if (!proces) {
      const werkpakket: Werkpakket = {
        id: uid('wp'),
        naam: naam.trim(),
        uren: Math.max(0, Math.round(urenN)),
        voortgang: 0,
        status: 'gepland',
        taken: [],
        omschrijving: omschrijving.trim() || undefined,
        extraTaak: true,
        verantwoordelijkeId: verantwoordelijkeId || undefined,
        start: start || undefined,
        eind: eind || undefined,
        uitvoering,
        externePartijId: uitvoering === 'extern' ? partijId || undefined : undefined,
      }
      dispatch({ type: 'WERKPAKKET_TOEVOEGEN', faseId: fase.id, werkpakket, gebruiker: persona.naam })
      toon('succes', `Proces "${werkpakket.naam}" toegevoegd aan "${fase.naam}".`, undoActie)
    } else {
      const patch: Partial<Werkpakket> = {
        naam: naam.trim(),
        omschrijving: omschrijving.trim() || undefined,
        verantwoordelijkeId: verantwoordelijkeId || undefined,
        uitvoering,
        externePartijId: uitvoering === 'extern' ? partijId || undefined : undefined,
        start: start || undefined,
        eind: eind || undefined,
      }
      if (zonderTaken) patch.uren = Math.max(0, Math.round(urenN))
      dispatch({ type: 'WERKPAKKET_BIJWERKEN', faseId: fase.id, wpId: proces.id, patch })
      toon('succes', `Proces "${naam.trim()}" bijgewerkt.`, undoActie)
    }
    onSluiten()
  }

  return (
    <>
      <Modal
        open={open}
        titel={proces ? `Proces bewerken — ${proces.naam}` : 'Proces toevoegen'}
        onSluiten={onSluiten}
        voettekst={
          <>
            <Knop onClick={onSluiten}>Annuleren</Knop>
            <Knop variant="primary" onClick={opslaan}>
              {proces ? 'Wijzigingen opslaan' : 'Proces toevoegen'}
            </Knop>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Procesnaam" verplicht fout={fout.naam} className="col-span-2">
            <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Audio- en videopakket" />
          </Veld>
          <Veld label="Omschrijving" className="col-span-2">
            <Tekstvak rows={2} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
          </Veld>
          <Veld label="Verantwoordelijke medewerker">
            <Keuze value={verantwoordelijkeId} onChange={(e) => setVerantwoordelijkeId(e.target.value)}>
              <option value="">Geen verantwoordelijke</option>
              {medewerkers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.naam}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Uitvoering">
            <SegmentKeuze
              waarde={uitvoering}
              opties={[
                { id: 'intern', label: 'Intern' },
                { id: 'extern', label: 'Extern' },
              ]}
              onKies={setUitvoering}
            />
          </Veld>
          {uitvoering === 'extern' && (
            <Veld label="Externe partner" className="col-span-2">
              <Keuze value={partijId} onChange={(e) => kiesPartner(e.target.value)}>
                <option value={NIEUWE_PARTNER}>+ Nieuwe externe partner toevoegen…</option>
                <option value="">Nog geen partner gekozen</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
          )}
          <Veld label="Eigen startdatum (optioneel)">
            <Invoer type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Veld>
          <Veld label="Eigen einddatum (optioneel)" fout={fout.eind}>
            <Invoer type="date" value={eind} onChange={(e) => setEind(e.target.value)} />
          </Veld>
          {zonderTaken && (
            <Veld label="Geplande uren" fout={fout.uren}>
              <Invoer type="number" min={0} value={uren} onChange={(e) => setUren(e.target.value)} />
            </Veld>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Faseperiode: {formatDatum(fase.start)} t/m {formatDatum(fase.eind)} — zonder eigen datums volgt het proces de fase.
          {zonderTaken && ' Zodra het proces taken heeft, worden de uren automatisch uit de taken berekend.'}
        </p>
      </Modal>

      <NieuwePartnerModal open={partnerModalOpen} onSluiten={() => setPartnerModalOpen(false)} onToegevoegd={partnerToegevoegd} />
    </>
  )
}
