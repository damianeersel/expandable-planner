// Modal om een nieuwe fase aan een project toe te voegen.

import { useEffect, useState } from 'react'
import type { Afdeling, Fase, FaseKey } from '../../../lib/types'
import { AFDELING_LABELS, FASE_LABELS, FASE_VOLGORDE } from '../../../lib/types'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { Invoer, Keuze, Knop, Modal, Veld, useToast } from '../../ui'

/** Passende fase-key bij een afdeling (als standaardwaarde in het formulier). */
const KEY_BIJ_AFDELING: Record<Afdeling, FaseKey> = {
  engineering: 'engineering',
  chassis: 'chassis',
  panelen: 'panelen',
  afbouw: 'afbouw',
  kwaliteit: 'kwaliteit',
  extern: 'spuiter',
}

const KEY_OPTIES: FaseKey[] = FASE_VOLGORDE.filter((k) => k !== 'salesoverdracht')
const ALLE_AFDELINGEN = Object.keys(AFDELING_LABELS) as Afdeling[]

interface Props {
  open: boolean
  projectId: string
  onSluiten: () => void
}

export default function FaseModal({ open, projectId, onSluiten }: Props) {
  const { data, dispatch, persona } = useApp()
  const { toon } = useToast()
  const [naam, setNaam] = useState('')
  const [afdeling, setAfdeling] = useState<Afdeling>('afbouw')
  const [key, setKey] = useState<FaseKey>('afbouw')
  const [start, setStart] = useState('')
  const [eind, setEind] = useState('')
  const [teamId, setTeamId] = useState('')
  const [fout, setFout] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setNaam('')
    setAfdeling('afbouw')
    setKey('afbouw')
    setStart('')
    setEind('')
    setTeamId('')
    setFout({})
  }, [open])

  const teams = data.teams.filter((t) => t.afdeling === afdeling)

  const kiesAfdeling = (a: Afdeling) => {
    setAfdeling(a)
    setKey(KEY_BIJ_AFDELING[a])
    setTeamId('')
  }

  const opslaan = () => {
    const f: Record<string, string> = {}
    if (naam.trim() === '') f.naam = 'Een fasenaam is verplicht.'
    if (!start) f.start = 'Een startdatum is verplicht.'
    if (!eind) f.eind = 'Een einddatum is verplicht.'
    if (start && eind && eind < start) f.eind = 'De einddatum kan niet vóór de startdatum liggen.'
    if (Object.keys(f).length > 0) {
      setFout(f)
      return
    }
    const fase: Fase = {
      id: uid('fase'),
      projectId,
      key,
      naam: naam.trim(),
      afdeling,
      start,
      eind,
      uren: 0,
      teamId: teamId || undefined,
      afhankelijkVan: [],
      status: 'gepland',
      voortgang: 0,
      werkpakketten: [],
    }
    dispatch({ type: 'FASE_TOEVOEGEN', fase, gebruiker: persona.naam })
    toon('succes', `Fase "${fase.naam}" toegevoegd.`, { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' }) })
    onSluiten()
  }

  return (
    <Modal
      open={open}
      titel="Fase toevoegen"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            Fase toevoegen
          </Knop>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Fasenaam" verplicht fout={fout.naam} className="col-span-2">
          <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Extra afbouwronde" />
        </Veld>
        <Veld label="Afdeling">
          <Keuze value={afdeling} onChange={(e) => kiesAfdeling(e.target.value as Afdeling)}>
            {ALLE_AFDELINGEN.map((a) => (
              <option key={a} value={a}>
                {AFDELING_LABELS[a]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld label="Fasetype">
          <Keuze value={key} onChange={(e) => setKey(e.target.value as FaseKey)}>
            {KEY_OPTIES.map((k) => (
              <option key={k} value={k}>
                {FASE_LABELS[k]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld label="Startdatum" verplicht fout={fout.start}>
          <Invoer type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Veld>
        <Veld label="Einddatum" verplicht fout={fout.eind}>
          <Invoer type="date" value={eind} onChange={(e) => setEind(e.target.value)} />
        </Veld>
        <Veld label="Team (optioneel)" className="col-span-2">
          <Keuze value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Geen team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </Keuze>
        </Veld>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        De volgorde van fases in het overzicht wordt automatisch bepaald door de startdatum.
      </p>
    </Modal>
  )
}
