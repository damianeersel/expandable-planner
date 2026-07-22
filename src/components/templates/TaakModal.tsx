// Modal om een templatetaak toe te voegen of te bewerken (alle taakvelden + validatie).

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Afdeling, Team, TemplateFase, TemplateTaak } from '../../lib/types'
import { AFDELING_LABELS } from '../../lib/types'
import { uid } from '../../lib/uid'
import { Invoer, Keuze, Knop, Modal, Tekstvak, Veld } from '../ui'

const ALLE_AFDELINGEN: Afdeling[] = ['engineering', 'chassis', 'panelen', 'afbouw', 'kwaliteit', 'extern']

interface Props {
  open: boolean
  /** Bestaande taak om te bewerken, of null voor een nieuwe taak. */
  taak: TemplateTaak | null
  fase: TemplateFase
  teams: Team[]
  onOpslaan: (taak: TemplateTaak) => void
  onSluiten: () => void
}

export default function TaakModal({ open, taak, fase, teams, onOpslaan, onSluiten }: Props) {
  const [naam, setNaam] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [uren, setUren] = useState('0')
  const [duur, setDuur] = useState('1')
  const [startOffset, setStartOffset] = useState('0')
  const [afdeling, setAfdeling] = useState<Afdeling>(fase.afdeling)
  const [teamId, setTeamId] = useState('')
  const [medewerkers, setMedewerkers] = useState('1')
  const [optioneel, setOptioneel] = useState(false)
  const [afhankelijk, setAfhankelijk] = useState('')
  const [vaardigheden, setVaardigheden] = useState<string[]>([])
  const [nieuweVaardigheid, setNieuweVaardigheid] = useState('')
  const [fout, setFout] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setFout({})
    setNieuweVaardigheid('')
    if (taak) {
      setNaam(taak.naam)
      setOmschrijving(taak.omschrijving ?? '')
      setUren(String(taak.uren))
      setDuur(String(taak.duurWerkdagen))
      setStartOffset(String(taak.startOffsetWerkdagen))
      setAfdeling(taak.afdeling)
      setTeamId(taak.standaardTeamId ?? '')
      setMedewerkers(String(taak.aantalMedewerkers))
      setOptioneel(taak.optioneel)
      setAfhankelijk(taak.afhankelijkVan[0] ?? '')
      setVaardigheden([...taak.vaardigheden])
    } else {
      setNaam('')
      setOmschrijving('')
      setUren('0')
      setDuur('1')
      setStartOffset('0')
      setAfdeling(fase.afdeling)
      setTeamId('')
      setMedewerkers('1')
      setOptioneel(false)
      setAfhankelijk('')
      setVaardigheden([])
    }
  }, [open, taak, fase])

  const teamOpties = teams.filter((t) => t.afdeling === afdeling)
  const andereTaken = fase.taken.filter((t) => !taak || t.id !== taak.id)

  const voegVaardigheidToe = () => {
    const v = nieuweVaardigheid.trim()
    if (v && !vaardigheden.includes(v)) setVaardigheden((l) => [...l, v])
    setNieuweVaardigheid('')
  }

  const opslaan = () => {
    const nieuweFout: Record<string, string> = {}
    if (naam.trim() === '') nieuweFout.naam = 'Een taaknaam is verplicht.'
    const urenN = Number(uren)
    const duurN = Number(duur)
    const offsetN = Number(startOffset)
    const mwN = Number(medewerkers)
    if (!Number.isFinite(urenN) || urenN < 0) nieuweFout.uren = 'Uren moet 0 of hoger zijn.'
    if (!Number.isFinite(duurN) || duurN < 1) nieuweFout.duur = 'Duur moet minimaal 1 werkdag zijn.'
    if (!Number.isFinite(offsetN) || offsetN < 0) nieuweFout.offset = 'Startmoment kan niet negatief zijn.'
    if (!Number.isFinite(mwN) || mwN < 1) nieuweFout.mw = 'Minimaal 1 medewerker.'
    if (Object.keys(nieuweFout).length > 0) {
      setFout(nieuweFout)
      return
    }
    onOpslaan({
      id: taak?.id ?? uid('ttaak'),
      naam: naam.trim(),
      omschrijving: omschrijving.trim() || undefined,
      uren: urenN,
      duurWerkdagen: Math.round(duurN),
      startOffsetWerkdagen: Math.round(offsetN),
      afhankelijkVan: afhankelijk ? [afhankelijk] : [],
      afdeling,
      standaardTeamId: teamId || undefined,
      vaardigheden,
      aantalMedewerkers: Math.round(mwN),
      optioneel,
      volgorde: taak?.volgorde ?? fase.taken.length + 1,
    })
  }

  return (
    <Modal
      open={open}
      breed
      titel={taak ? 'Taak bewerken' : 'Taak toevoegen'}
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            {taak ? 'Wijzigingen opslaan' : 'Taak toevoegen'}
          </Knop>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Taaknaam" verplicht fout={fout.naam} className="col-span-2">
          <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Technische tekeningen" />
        </Veld>
        <Veld label="Korte omschrijving" className="col-span-2">
          <Tekstvak rows={2} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
        </Veld>

        <Veld label="Uren" fout={fout.uren}>
          <Invoer type="number" min={0} value={uren} onChange={(e) => setUren(e.target.value)} />
        </Veld>
        <Veld label="Geschatte duur (werkdagen)" fout={fout.duur}>
          <Invoer type="number" min={1} value={duur} onChange={(e) => setDuur(e.target.value)} />
        </Veld>
        <Veld label="Standaard startmoment (werkdagen na fasestart)" fout={fout.offset}>
          <Invoer type="number" min={0} value={startOffset} onChange={(e) => setStartOffset(e.target.value)} />
        </Veld>
        <Veld label="Aantal medewerkers" fout={fout.mw}>
          <Invoer type="number" min={1} value={medewerkers} onChange={(e) => setMedewerkers(e.target.value)} />
        </Veld>

        <Veld label="Afdeling">
          <Keuze
            value={afdeling}
            onChange={(e) => {
              setAfdeling(e.target.value as Afdeling)
              setTeamId('')
            }}
          >
            {ALLE_AFDELINGEN.map((a) => (
              <option key={a} value={a}>
                {AFDELING_LABELS[a]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld label="Standaardteam">
          <Keuze value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Geen / automatisch</option>
            {teamOpties.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </Keuze>
        </Veld>

        <Veld label="Afhankelijk van (taak in deze fase)" className="col-span-2">
          <Keuze value={afhankelijk} onChange={(e) => setAfhankelijk(e.target.value)}>
            <option value="">Geen afhankelijkheid</option>
            {andereTaken.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </Keuze>
        </Veld>

        <Veld label="Vereiste vaardigheden" className="col-span-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {vaardigheden.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {v}
                <button
                  type="button"
                  onClick={() => setVaardigheden((l) => l.filter((x) => x !== v))}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <Invoer
                value={nieuweVaardigheid}
                onChange={(e) => setNieuweVaardigheid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    voegVaardigheidToe()
                  }
                }}
                placeholder="Vaardigheid toevoegen…"
                className="!w-44 !py-1 !text-xs"
              />
              <Knop klein onClick={voegVaardigheidToe}>
                <Plus size={13} />
              </Knop>
            </div>
          </div>
        </Veld>

        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={optioneel} onChange={(e) => setOptioneel(e.target.checked)} className="accent-brand-600" />
          Optionele taak (kan bij het inladen van een project aan/uit worden gezet)
        </label>
      </div>
    </Modal>
  )
}
