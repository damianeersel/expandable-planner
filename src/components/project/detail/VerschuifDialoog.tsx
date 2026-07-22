// Dialoog bij het verschuiven van een taak-einddatum met afhankelijke taken:
// meeschuiven, alleen deze taak wijzigen of annuleren.

import { Modal, Knop } from '../../ui'

interface Props {
  open: boolean
  /** Verschuiving in kalenderdagen (positief = later, negatief = eerder). */
  deltaDagen: number
  aantalAfhankelijk: number
  faseNaam: string
  /** True wanneer de nieuwe taak-einddatum na de fase-einddatum valt. */
  faseWordtVerlengd: boolean
  onMeeschuiven: () => void
  onAlleenTaak: () => void
  onAnnuleer: () => void
}

export default function VerschuifDialoog({
  open,
  deltaDagen,
  aantalAfhankelijk,
  faseNaam,
  faseWordtVerlengd,
  onMeeschuiven,
  onAlleenTaak,
  onAnnuleer,
}: Props) {
  const dagen = Math.abs(deltaDagen)
  const richting = deltaDagen > 0 ? 'later' : 'eerder'
  return (
    <Modal
      open={open}
      titel="Afhankelijke taken verschuiven?"
      onSluiten={onAnnuleer}
      voettekst={
        <>
          <Knop onClick={onAnnuleer}>Annuleren</Knop>
          <Knop onClick={onAlleenTaak}>Alleen deze taak wijzigen</Knop>
          <Knop variant="primary" onClick={onMeeschuiven}>
            Afhankelijke taken meeschuiven
          </Knop>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Door deze taak {dagen} dag{dagen === 1 ? '' : '(en)'} {richting} te verschuiven, verschuiven ook{' '}
        {aantalAfhankelijk} afhankelijke {aantalAfhankelijk === 1 ? 'taak' : 'taken'}.
      </p>
      {faseWordtVerlengd && (
        <p className="mt-2 text-sm text-amber-700">
          De nieuwe einddatum valt na het einde van de fase: hierdoor eindigt «{faseNaam}» later en wordt de verwachte
          opleverdatum van het project opnieuw berekend.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Alleen afhankelijke taken met eigen datums schuiven mee; taken zonder eigen datums blijven de fase volgen.
      </p>
    </Modal>
  )
}
