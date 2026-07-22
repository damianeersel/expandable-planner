// Compacte modal om vanuit een partnerblok direct een nieuwe externe partner toe te voegen.
// De partner wordt centraal opgeslagen en is daarna in alle projecten beschikbaar.

import { useEffect, useState } from 'react'
import type { ExternePartij } from '../../../lib/types'
import { EXTERN_TYPE_LABELS } from '../../../lib/types'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { Invoer, Keuze, Knop, Modal, Veld, useToast } from '../../ui'

const NIEUW_TYPE = '__nieuw_type'

interface Props {
  open: boolean
  onSluiten: () => void
  /** Wordt aangeroepen met de nieuwe partner zodat het aanroepende blok die direct kan selecteren. */
  onToegevoegd: (partij: ExternePartij) => void
}

export default function NieuwePartnerModal({ open, onSluiten, onToegevoegd }: Props) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()
  const [naam, setNaam] = useState('')
  const [type, setType] = useState('overig')
  const [nieuwType, setNieuwType] = useState('')
  const [specialisme, setSpecialisme] = useState('')
  const [contactpersoon, setContactpersoon] = useState('')
  const [email, setEmail] = useState('')
  const [telefoon, setTelefoon] = useState('')
  const [doorlooptijd, setDoorlooptijd] = useState('')
  const [fout, setFout] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setNaam('')
    setType('overig')
    setNieuwType('')
    setSpecialisme('')
    setContactpersoon('')
    setEmail('')
    setTelefoon('')
    setDoorlooptijd('')
    setFout({})
  }, [open])

  // Standaardtypes + zelf toegevoegde types (zonder dubbelingen).
  const eigenTypes = data.partnerTypes.filter((t) => !(t in EXTERN_TYPE_LABELS))

  const opslaan = () => {
    const f: Record<string, string> = {}
    if (naam.trim() === '') f.naam = 'Een bedrijfsnaam is verplicht.'
    if (type === NIEUW_TYPE && nieuwType.trim() === '') f.type = 'Geef een naam op voor het nieuwe partnertype.'
    const dagen = doorlooptijd.trim() === '' ? undefined : Number(doorlooptijd)
    if (dagen !== undefined && (!Number.isFinite(dagen) || dagen < 0)) f.doorlooptijd = 'Doorlooptijd moet 0 of hoger zijn.'
    if (Object.keys(f).length > 0) {
      setFout(f)
      return
    }
    let gekozenType = type
    if (type === NIEUW_TYPE) {
      gekozenType = nieuwType.trim()
      dispatch({ type: 'PARTNERTYPE_TOEVOEGEN', naam: gekozenType })
    }
    const partij: ExternePartij = {
      id: uid('ext'),
      naam: naam.trim(),
      type: gekozenType,
      specialisme: specialisme.trim(),
      contactpersoon: contactpersoon.trim(),
      email: email.trim() || undefined,
      telefoon: telefoon.trim() || undefined,
      standaardDoorlooptijdDagen: dagen !== undefined ? Math.round(dagen) : undefined,
      slotsPerWeek: 1,
      vertragingDagen: 0,
      status: 'beschikbaar',
      gearchiveerd: false,
    }
    dispatch({ type: 'PARTNER_TOEVOEGEN', partij })
    toon('succes', 'Partner toegevoegd en gekoppeld — ook beschikbaar voor andere projecten.')
    onToegevoegd(partij)
    onSluiten()
  }

  return (
    <Modal
      open={open}
      titel="Nieuwe externe partner"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            Partner toevoegen
          </Knop>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Bedrijfsnaam" verplicht fout={fout.naam} className="col-span-2">
          <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Voltec Installaties" />
        </Veld>
        <Veld label="Partnertype" fout={fout.type}>
          <Keuze value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(EXTERN_TYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            {eigenTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={NIEUW_TYPE}>Nieuw type…</option>
          </Keuze>
        </Veld>
        {type === NIEUW_TYPE ? (
          <Veld label="Naam nieuw type" verplicht>
            <Invoer value={nieuwType} onChange={(e) => setNieuwType(e.target.value)} placeholder="Bijv. Zonwering" />
          </Veld>
        ) : (
          <Veld label="Specialisme">
            <Invoer value={specialisme} onChange={(e) => setSpecialisme(e.target.value)} placeholder="Bijv. Elektrotechniek" />
          </Veld>
        )}
        {type === NIEUW_TYPE && (
          <Veld label="Specialisme">
            <Invoer value={specialisme} onChange={(e) => setSpecialisme(e.target.value)} placeholder="Bijv. Elektrotechniek" />
          </Veld>
        )}
        <Veld label="Contactpersoon">
          <Invoer value={contactpersoon} onChange={(e) => setContactpersoon(e.target.value)} />
        </Veld>
        <Veld label="E-mailadres">
          <Invoer type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
        </Veld>
        <Veld label="Telefoonnummer">
          <Invoer value={telefoon} onChange={(e) => setTelefoon(e.target.value)} placeholder="040-1234567" />
        </Veld>
        <Veld label="Standaard doorlooptijd (werkdagen)" fout={fout.doorlooptijd}>
          <Invoer type="number" min={0} value={doorlooptijd} onChange={(e) => setDoorlooptijd(e.target.value)} placeholder="Bijv. 3" />
        </Veld>
      </div>
    </Modal>
  )
}
