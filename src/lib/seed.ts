// Realistische voorbeelddata. Alle datums worden relatief aan de huidige week
// opgebouwd zodat het prototype altijd een actuele planning toont.
// Alle namen en klanten zijn fictief.

import type {
  Afdeling,
  AppData,
  ComplexiteitNiveau,
  Fase,
  FaseKey,
  Locatie,
  LocatieMutatie,
  Medewerker,
  Plaats,
  ProductTemplate,
  Project,
  TemplateFase,
  TemplateStatus,
  TemplateTaak,
  Unit,
  Werkpakket,
  Zone,
} from './types'
import { FASE_LABELS, STANDAARD_COMPLEXITEITSNIVEAUS } from './types'
import { addDagen, startVanWeek, vandaagISO, volgendeWerkdag } from './dates'
import { STANDAARD_INSTELLINGEN, WERKPAKKET_TEMPLATES } from './planning'

const T0 = startVanWeek(vandaagISO()) // maandag van deze week

/** n kalenderdagen t.o.v. maandag van deze week (weekend wordt niet automatisch overgeslagen). */
const d = (n: number) => addDagen(T0, n)
/** Als d(), maar schuift een weekenddag door naar maandag. */
const wd = (n: number) => volgendeWerkdag(addDagen(T0, n))

let wpTeller = 0
function wps(
  key: Exclude<FaseKey, 'salesoverdracht'>,
  totaalUren: number,
  voortgang: number[] = [],
): Werkpakket[] {
  const namen = WERKPAKKET_TEMPLATES[key]
  const per = Math.round(totaalUren / namen.length)
  return namen.map((naam, i) => {
    const v = voortgang[i] ?? 0
    return {
      id: `wp-${++wpTeller}`,
      naam,
      uren: per,
      voortgang: v,
      status: v >= 100 ? 'gereed' : v > 0 ? 'bezig' : 'gepland',
    }
  })
}

interface FaseOpties {
  teamId?: string
  externePartijId?: string
  status?: Fase['status']
  voortgang?: number
  blokkadeNotitie?: string
  notities?: string
  werkpakketVoortgang?: number[]
  transportHeen?: string
  transportTerug?: string
}

function fase(
  id: string,
  projectId: string,
  key: Exclude<FaseKey, 'salesoverdracht'>,
  start: string,
  eind: string,
  uren: number,
  afhankelijkVan: string[],
  opties: FaseOpties = {},
): Fase {
  const status = opties.status ?? 'gepland'
  const voortgang = opties.voortgang ?? (status === 'gereed' ? 100 : 0)
  return {
    id,
    projectId,
    key,
    naam: FASE_LABELS[key],
    afdeling: key === 'spuiter' ? 'extern' : key,
    start,
    eind,
    uren,
    teamId: opties.teamId,
    externePartijId: opties.externePartijId,
    afhankelijkVan,
    status,
    voortgang,
    blokkadeNotitie: opties.blokkadeNotitie,
    notities: opties.notities,
    werkpakketten: wps(
      key,
      uren > 0 ? uren : 24,
      opties.werkpakketVoortgang ?? (status === 'gereed' ? WERKPAKKET_TEMPLATES[key].map(() => 100) : []),
    ),
    transportHeen: opties.transportHeen,
    transportTerug: opties.transportTerug,
  }
}

function m(
  id: string,
  naam: string,
  functie: string,
  afdeling: Medewerker['afdeling'],
  teamId: string | undefined,
  contracturen: number,
  vaardigheden: string[],
  extra: Partial<Medewerker> = {},
): Medewerker {
  return {
    id,
    naam,
    functie,
    afdeling,
    vaardigheden,
    contracturen,
    beschikbaarheidPct: 100,
    teamId,
    actief: true,
    ...extra,
  }
}

export function maakSeedData(): AppData {
  // ---------- Teams ----------
  const teams: AppData['teams'] = [
    { id: 'team-eng-a', naam: 'Engineering Team A', afdeling: 'engineering', productieleiderId: 'mw-erik', vaardigheden: ['CAD', 'Constructieberekening', 'BOM'] },
    { id: 'team-cha-a', naam: 'Chassis Team A', afdeling: 'chassis', productieleiderId: 'mw-ruud', vaardigheden: ['Lassen', 'Hydrauliek', 'Montage'] },
    { id: 'team-cha-b', naam: 'Chassis Team B', afdeling: 'chassis', productieleiderId: 'mw-ruud', vaardigheden: ['Lassen', 'Metaalbewerking', 'Montage'] },
    { id: 'team-pan-a', naam: 'Panelen Team A', afdeling: 'panelen', productieleiderId: 'mw-sandra', vaardigheden: ['Paneelbouw', 'Isolatie', 'Montage'] },
    { id: 'team-pan-b', naam: 'Panelen Team B', afdeling: 'panelen', productieleiderId: 'mw-sandra', vaardigheden: ['Paneelbouw', 'Dakconstructie', 'Afdichting'] },
    { id: 'team-afb-a', naam: 'Afbouw Team A', afdeling: 'afbouw', productieleiderId: 'mw-marco', vaardigheden: ['Elektra', 'Interieurbouw', 'Afwerking'] },
    { id: 'team-afb-b', naam: 'Afbouw Team B', afdeling: 'afbouw', productieleiderId: 'mw-marco', vaardigheden: ['Elektra', 'Klimaat', 'Afwerking'] },
  ]

  // ---------- Medewerkers ----------
  const medewerkers: AppData['medewerkers'] = [
    // Leidinggevenden (tellen niet mee in teamcapaciteit)
    m('mw-erik', 'Erik Lindhout', 'Engineering lead', 'engineering', undefined, 40, ['CAD', 'Projectleiding']),
    m('mw-ruud', 'Ruud Bakker', 'Productieleider chassisbouw', 'chassis', undefined, 40, ['Lassen', 'Planning']),
    m('mw-sandra', 'Sandra Vos', 'Productieleider panelenbouw', 'panelen', undefined, 40, ['Paneelbouw', 'Kwaliteit']),
    m('mw-marco', 'Marco de Wit', 'Productieleider afbouw', 'afbouw', undefined, 40, ['Interieurbouw', 'Planning']),

    // Engineering Team A
    m('mw-jasper', 'Jasper Kuipers', 'Engineer', 'engineering', 'team-eng-a', 40, ['CAD', 'Constructieberekening']),
    m('mw-lotte', 'Lotte van Dam', 'Engineer', 'engineering', 'team-eng-a', 36, ['CAD', 'BOM']),
    m('mw-niels', 'Niels Verhoef', 'Senior engineer', 'engineering', 'team-eng-a', 40, ['CAD', 'Hydrauliek', 'Maatwerk']),
    m('mw-femke', 'Femke Jansen', 'Engineer', 'engineering', 'team-eng-a', 32, ['CAD', 'Elektrotechniek']),

    // Chassis Team A
    m('mw-tim', 'Tim Roelofs', 'Constructiebankwerker', 'chassis', 'team-cha-a', 40, ['Lassen', 'Metaalbewerking']),
    m('mw-bas', 'Bas Meijer', 'Monteur hydrauliek', 'chassis', 'team-cha-a', 40, ['Hydrauliek', 'Montage']),
    m('mw-sven', 'Sven Dekker', 'Lasser', 'chassis', 'team-cha-a', 36, ['Lassen']),
    m('mw-iris', 'Iris Kok', 'Monteur', 'chassis', 'team-cha-a', 40, ['Montage', 'Assen & wielen']),

    // Chassis Team B
    m('mw-daan', 'Daan Prins', 'Lasser', 'chassis', 'team-cha-b', 40, ['Lassen', 'Metaalbewerking']),
    m('mw-wouter', 'Wouter Smit', 'Monteur', 'chassis', 'team-cha-b', 36, ['Montage', 'Leveling']),
    m('mw-anouk', 'Anouk Visser', 'Constructiebankwerker', 'chassis', 'team-cha-b', 40, ['Lassen', 'Montage']),
    m('mw-joris', 'Joris Blom', 'Monteur', 'chassis', 'team-cha-b', 32, ['Hydrauliek', 'Montage']),

    // Panelen Team A
    m('mw-kevin', 'Kevin Mulder', 'Paneelbouwer', 'panelen', 'team-pan-a', 40, ['Paneelbouw', 'Isolatie']),
    m('mw-sanne', 'Sanne de Boer', 'Paneelbouwer', 'panelen', 'team-pan-a', 36, ['Paneelbouw', 'Afdichting']),
    m('mw-thijs', 'Thijs Hendriks', 'Monteur ramen & deuren', 'panelen', 'team-pan-a', 40, ['Ramen & deuren', 'Montage']),
    m('mw-nadia', 'Nadia Yilmaz', 'Paneelbouwer', 'panelen', 'team-pan-a', 40, ['Paneelbouw', 'Uitschuifsystemen']),
    m('mw-ruben', 'Ruben Post', 'Paneelbouwer (parttime)', 'panelen', 'team-pan-a', 24, ['Paneelbouw']),

    // Panelen Team B — Jelle helpt deze week tijdelijk bij Team A
    m('mw-milan', 'Milan Bos', 'Paneelbouwer', 'panelen', 'team-pan-b', 40, ['Paneelbouw', 'Dakconstructie']),
    m('mw-esra', 'Esra Demir', 'Paneelbouwer', 'panelen', 'team-pan-b', 36, ['Paneelbouw', 'Afdichting']),
    m('mw-jelle', 'Jelle Vink', 'Monteur', 'panelen', 'team-pan-b', 40, ['Montage', 'Uitschuifsystemen'], {
      tijdelijkTeam: { teamId: 'team-pan-a', van: d(0), tot: d(4), reden: 'Extra capaciteit uitschuifsystemen' },
    }),
    m('mw-carmen', 'Carmen Lopez', 'Paneelbouwer', 'panelen', 'team-pan-b', 36, ['Paneelbouw']),

    // Afbouw Team A
    m('mw-pieter', 'Pieter Hoekstra', 'Elektromonteur', 'afbouw', 'team-afb-a', 40, ['Elektra', 'Verlichting']),
    m('mw-lisa', 'Lisa Maas', 'Interieurbouwer', 'afbouw', 'team-afb-a', 36, ['Interieurbouw', 'Meubilair']),
    m('mw-tom', 'Tom Egberts', 'Allround afbouwer', 'afbouw', 'team-afb-a', 40, ['Interieurbouw', 'Afwerking']),
    m('mw-yara', 'Yara Sahin', 'Afwerker', 'afbouw', 'team-afb-a', 32, ['Afwerking', 'Wrapping']),
    m('mw-frank', 'Frank Willems', 'Installatiemonteur', 'afbouw', 'team-afb-a', 40, ['Klimaat', 'Sanitair']),

    // Afbouw Team B
    m('mw-dennis', 'Dennis Kramer', 'Elektromonteur', 'afbouw', 'team-afb-b', 40, ['Elektra', 'Audio/video']),
    m('mw-marit', 'Marit Jonker', 'Interieurbouwer', 'afbouw', 'team-afb-b', 36, ['Interieurbouw']),
    m('mw-omar', 'Omar El Idrissi', 'Allround afbouwer', 'afbouw', 'team-afb-b', 40, ['Afwerking', 'Montage']),
  ]

  // ---------- Afwezigheid ----------
  const afwezigheid: AppData['afwezigheid'] = [
    // Ziekmelding deze week → capaciteitsdip Chassis Team A
    { id: 'afw-1', medewerkerId: 'mw-bas', type: 'ziekte', van: d(0), tot: d(4), dagdeel: 'heel', status: 'geregistreerd', notitie: 'Griep, naar verwachting één week' },
    // Vakanties
    { id: 'afw-2', medewerkerId: 'mw-kevin', type: 'vakantie', van: d(14), tot: d(25), dagdeel: 'heel', status: 'goedgekeurd', notitie: 'Zomervakantie' },
    { id: 'afw-3', medewerkerId: 'mw-lisa', type: 'vakantie', van: d(7), tot: d(11), dagdeel: 'heel', status: 'goedgekeurd' },
    { id: 'afw-4', medewerkerId: 'mw-anouk', type: 'kort_verzuim', van: d(4), tot: d(4), dagdeel: 'ochtend', status: 'geregistreerd', notitie: 'Tandartsafspraak' },
    // Training
    { id: 'afw-5', medewerkerId: 'mw-lotte', type: 'training', van: d(8), tot: d(9), dagdeel: 'heel', status: 'goedgekeurd', notitie: 'Training nieuwe CAD-omgeving' },
    // Bijzonder verlof
    { id: 'afw-6', medewerkerId: 'mw-tom', type: 'bijzonder_verlof', van: d(3), tot: d(3), dagdeel: 'heel', status: 'goedgekeurd', notitie: 'Verhuizing' },
    // Vakantie verder vooruit
    { id: 'afw-7', medewerkerId: 'mw-daan', type: 'vakantie', van: d(21), tot: d(32), dagdeel: 'heel', status: 'goedgekeurd' },
  ]

  const aanpassingen: AppData['aanpassingen'] = [
    { id: 'aan-1', medewerkerId: 'mw-femke', van: d(0), tot: d(56), pct: 80, reden: 'Tijdelijk 80% i.v.m. studie' },
    { id: 'aan-2', medewerkerId: 'mw-yara', van: d(7), tot: d(18), pct: 50, reden: 'Alleen ochtenden beschikbaar' },
  ]

  // ---------- Externe partijen ----------
  const externePartijen: AppData['externePartijen'] = [
    { id: 'ext-spuit-dalen', naam: 'Spuiterij Van Dalen', type: 'spuiter', specialisme: 'Trailercoating & industriële laklagen', contactpersoon: 'Peter van Dalen', slotsPerWeek: 2, vertragingDagen: 5, status: 'vertraagd', notities: 'Meldt 5 werkdagen vertraging door personeelstekort in de spuiterij.' },
    { id: 'ext-spuit-coatworks', naam: 'CoatWorks Venlo', type: 'spuiter', specialisme: 'Coating van XL-voertuigen', contactpersoon: 'Miriam Janssen', slotsPerWeek: 1, vertragingDagen: 0, status: 'beschikbaar' },
    { id: 'ext-airco', naam: 'AirTech Klimaatsystemen', type: 'airco', specialisme: 'Airconditioning & verwarming voor mobiele units', contactpersoon: 'Jeroen Kuypers', slotsPerWeek: 2, vertragingDagen: 0, status: 'beschikbaar' },
    { id: 'ext-interieur', naam: 'Studio Interieurbouw Brabant', type: 'interieur', specialisme: 'Maatwerkinterieurs & meubilair', contactpersoon: 'Floor Aarts', slotsPerWeek: 1, vertragingDagen: 0, status: 'vol', notities: 'Vol tot over 3 weken.' },
    { id: 'ext-elektro', naam: 'Voltec Installaties', type: 'elektro', specialisme: 'Elektrotechniek & verlichting', contactpersoon: 'Bram Scholten', slotsPerWeek: 2, vertragingDagen: 0, status: 'beschikbaar' },
  ]

  // ---------- Projecten & fases ----------
  const projecten: AppData['projecten'] = []
  const fases: Fase[] = []

  // P1 — definitief, in afbouw
  projecten.push({
    id: 'p1', projectnummer: 'PR3305', naam: 'Roadshow trailer Karavaan Events', klant: 'Karavaan Events',
    productModel: 'E13T', salesverantwoordelijke: 'Rick van Leeuwen', projectmanager: 'Hugo Brands',
    status: 'definitief', verkoopkans: 100, prioriteit: 'hoog', complexiteit: 'complex',
    gewensteOpleverdatum: wd(32), notities: 'Klant wil oplevering vóór start festivalseizoen.',
    bijzonderheden: 'Dubbele uitschuif, podiumluifel, extra AV-pakket', aangemaaktOp: d(-120), bevestigdOp: d(-85),
  })
  fases.push(
    fase('f-p1-eng', 'p1', 'engineering', wd(-70), wd(-56), 160, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p1-cha', 'p1', 'chassis', wd(-55), wd(-36), 320, ['f-p1-eng'], { teamId: 'team-cha-b', status: 'gereed' }),
    fase('f-p1-pan', 'p1', 'panelen', wd(-41), wd(-22), 340, ['f-p1-cha'], { teamId: 'team-pan-a', status: 'gereed' }),
    fase('f-p1-spuit', 'p1', 'spuiter', wd(-18), wd(-8), 0, ['f-p1-pan'], { externePartijId: 'ext-spuit-coatworks', status: 'gereed', transportHeen: wd(-18), transportTerug: wd(-8) }),
    fase('f-p1-afb', 'p1', 'afbouw', wd(-6), wd(15), 420, ['f-p1-spuit'], {
      teamId: 'team-afb-a', status: 'bezig', voortgang: 55,
      werkpakketVoortgang: [100, 70, 60, 30, 0, 0],
      notities: 'Airco-installatie samen met AirTech Klimaatsystemen.',
    }),
    fase('f-p1-kwal', 'p1', 'kwaliteit', wd(16), wd(22), 40, ['f-p1-afb'], { teamId: 'team-afb-a' }),
  )

  // P2 — definitief, nu bij externe spuiter, vertraagd → opleverrisico
  projecten.push({
    id: 'p2', projectnummer: 'PR3308', naam: 'Fieldlab demo-unit TechnoFair', klant: 'TechnoFair GmbH',
    productModel: 'E9P', salesverantwoordelijke: 'Charlotte Mol', projectmanager: 'Hugo Brands',
    status: 'definitief', verkoopkans: 100, prioriteit: 'normaal', complexiteit: 'gemiddeld',
    gewensteOpleverdatum: wd(35), notities: 'Beursdatum is hard: unit moet uiterlijk in week van oplevering op transport.',
    aangemaaktOp: d(-110), bevestigdOp: d(-80),
  })
  fases.push(
    fase('f-p2-eng', 'p2', 'engineering', wd(-63), wd(-49), 130, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p2-cha', 'p2', 'chassis', wd(-48), wd(-29), 290, ['f-p2-eng'], { teamId: 'team-cha-b', status: 'gereed' }),
    fase('f-p2-pan', 'p2', 'panelen', wd(-34), wd(-14), 310, ['f-p2-cha'], { teamId: 'team-pan-b', status: 'gereed' }),
    fase('f-p2-spuit', 'p2', 'spuiter', wd(-5), wd(9), 0, ['f-p2-pan'], {
      externePartijId: 'ext-spuit-dalen', status: 'bezig', voortgang: 40,
      transportHeen: wd(-5), transportTerug: wd(10),
      notities: 'Oorspronkelijke retour was deze week; spuiter meldt +5 werkdagen vertraging.',
    }),
    fase('f-p2-afb', 'p2', 'afbouw', wd(10), wd(36), 380, ['f-p2-spuit'], { teamId: 'team-afb-b' }),
    fase('f-p2-kwal', 'p2', 'kwaliteit', wd(37), wd(43), 40, ['f-p2-afb'], { teamId: 'team-afb-b' }),
  )

  // P3 — definitief, in chassisbouw bij Chassis Team A
  projecten.push({
    id: 'p3', projectnummer: 'PR3312', naam: 'Mobiele kliniek MedCare', klant: 'MedCare Mobile Solutions',
    productModel: 'E13H', salesverantwoordelijke: 'Rick van Leeuwen', projectmanager: 'Petra Simons',
    status: 'definitief', verkoopkans: 100, prioriteit: 'hoog', complexiteit: 'complex',
    gewensteOpleverdatum: wd(80), notities: 'Medische inrichting door gespecialiseerde onderaannemer in afbouwfase.',
    bijzonderheden: 'Hygiënische wandafwerking, extra elektragroepen', aangemaaktOp: d(-70), bevestigdOp: d(-40),
    templateId: 'tmpl-e13h-maatwerk-v3', templateTrailertype: 'E13H', templateComplexiteitId: 'maatwerk',
    templateVersie: 3, projectspecifiekAangepast: true,
  })
  fases.push(
    fase('f-p3-eng', 'p3', 'engineering', wd(-20), wd(-6), 150, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p3-cha', 'p3', 'chassis', wd(-4), wd(19), 320, ['f-p3-eng'], {
      teamId: 'team-cha-a', status: 'bezig', voortgang: 30,
      werkpakketVoortgang: [70, 40, 20, 0, 0],
    }),
    fase('f-p3-pan', 'p3', 'panelen', wd(12), wd(33), 330, ['f-p3-cha'], { teamId: 'team-pan-a' }),
    fase('f-p3-spuit', 'p3', 'spuiter', wd(36), wd(45), 0, ['f-p3-pan'], { externePartijId: 'ext-spuit-dalen', transportHeen: wd(36), transportTerug: wd(46) }),
    fase('f-p3-afb', 'p3', 'afbouw', wd(46), wd(70), 400, ['f-p3-spuit'], { teamId: 'team-afb-a' }),
    fase('f-p3-kwal', 'p3', 'kwaliteit', wd(71), wd(77), 40, ['f-p3-afb'], { teamId: 'team-afb-a' }),
  )
  // Projectspecifieke extra taak (niet uit het mastertemplate).
  const p3Afbouw = fases.find((f) => f.id === 'f-p3-afb')
  if (p3Afbouw) {
    p3Afbouw.werkpakketten.push({
      id: 'wp-p3-extra', naam: 'Medische inrichting (onderaannemer)', uren: 60, voortgang: 0,
      status: 'gepland', extraTaak: true, aantalMedewerkers: 1, omschrijving: 'Projectspecifiek toegevoegd voor MedCare.',
    })
  }

  // P4 — definitief, in engineering; chassisfase overlapt met P3 op Chassis Team A → capaciteitsconflict
  projecten.push({
    id: 'p4', projectnummer: 'PR3318', naam: 'Hospitality lounge GrandTour', klant: 'GrandTour Hospitality',
    productModel: 'E16TU', salesverantwoordelijke: 'Charlotte Mol', projectmanager: 'Hugo Brands',
    status: 'definitief', verkoopkans: 100, prioriteit: 'normaal', complexiteit: 'complex',
    gewensteOpleverdatum: wd(90), notities: 'Chassisfase gepland op Chassis Team A; let op samenloop met PR3312.',
    bijzonderheden: 'Luxe interieur, bar en lounge-verlichting', aangemaaktOp: d(-45), bevestigdOp: d(-15),
  })
  fases.push(
    fase('f-p4-eng', 'p4', 'engineering', wd(-6), wd(14), 170, [], {
      teamId: 'team-eng-a', status: 'bezig', voortgang: 45,
      werkpakketVoortgang: [100, 60, 40, 0, 0],
    }),
    fase('f-p4-cha', 'p4', 'chassis', wd(10), wd(33), 300, ['f-p4-eng'], { teamId: 'team-cha-a' }),
    fase('f-p4-pan', 'p4', 'panelen', wd(29), wd(50), 340, ['f-p4-cha'], { teamId: 'team-pan-b' }),
    fase('f-p4-spuit', 'p4', 'spuiter', wd(53), wd(62), 0, ['f-p4-pan'], { externePartijId: 'ext-spuit-coatworks', transportHeen: wd(53), transportTerug: wd(63) }),
    fase('f-p4-afb', 'p4', 'afbouw', wd(64), wd(87), 420, ['f-p4-spuit'], { teamId: 'team-afb-b' }),
    fase('f-p4-kwal', 'p4', 'kwaliteit', wd(88), wd(94), 40, ['f-p4-afb'], { teamId: 'team-afb-b' }),
  )

  // P5 — schaduw, 70% verkoopkans
  projecten.push({
    id: 'p5', projectnummer: 'PR3324', naam: 'Espresso experience bar BeanBrothers', klant: 'BeanBrothers Coffee',
    productModel: 'E9P', salesverantwoordelijke: 'Rick van Leeuwen', projectmanager: 'Petra Simons',
    status: 'schaduw', verkoopkans: 70, prioriteit: 'normaal', complexiteit: 'gemiddeld',
    verwachteOrderdatum: wd(15), gewensteOpleverdatum: wd(115),
    notities: 'Offerte in eindfase; klant beslist naar verwachting binnen 3 weken.',
    bijzonderheden: 'Inbouw espressobar met watertank en extra stroomvoorziening', aangemaaktOp: d(-20),
  })
  fases.push(
    fase('f-p5-eng', 'p5', 'engineering', wd(21), wd(35), 130, [], { teamId: 'team-eng-a' }),
    fase('f-p5-cha', 'p5', 'chassis', wd(36), wd(55), 290, ['f-p5-eng'], { teamId: 'team-cha-b' }),
    fase('f-p5-pan', 'p5', 'panelen', wd(50), wd(70), 310, ['f-p5-cha'], { teamId: 'team-pan-a' }),
    fase('f-p5-spuit', 'p5', 'spuiter', wd(73), wd(82), 0, ['f-p5-pan'], { externePartijId: 'ext-spuit-dalen', transportHeen: wd(73), transportTerug: wd(83) }),
    fase('f-p5-afb', 'p5', 'afbouw', wd(85), wd(106), 380, ['f-p5-spuit'], { teamId: 'team-afb-a' }),
    fase('f-p5-kwal', 'p5', 'kwaliteit', wd(107), wd(113), 40, ['f-p5-afb'], { teamId: 'team-afb-a' }),
  )

  // P6 — schaduw, 40% verkoopkans, verder weg
  projecten.push({
    id: 'p6', projectnummer: 'PR3327', naam: 'Mobiele trainingsunit SafetyFirst', klant: 'SafetyFirst Trainingen BV',
    productModel: 'E13T', salesverantwoordelijke: 'Charlotte Mol', projectmanager: 'Petra Simons',
    status: 'schaduw', verkoopkans: 40, prioriteit: 'laag', complexiteit: 'gemiddeld',
    verwachteOrderdatum: wd(40), gewensteOpleverdatum: wd(150),
    notities: 'Vroege verkenning; budgetgoedkeuring bij klant loopt nog.', aangemaaktOp: d(-10),
  })
  fases.push(
    fase('f-p6-eng', 'p6', 'engineering', wd(45), wd(59), 140, [], { teamId: 'team-eng-a' }),
    fase('f-p6-cha', 'p6', 'chassis', wd(60), wd(79), 300, ['f-p6-eng'], { teamId: 'team-cha-b' }),
    fase('f-p6-pan', 'p6', 'panelen', wd(74), wd(94), 320, ['f-p6-cha'], { teamId: 'team-pan-b' }),
    fase('f-p6-spuit', 'p6', 'spuiter', wd(97), wd(106), 0, ['f-p6-pan'], { externePartijId: 'ext-spuit-coatworks', transportHeen: wd(97), transportTerug: wd(107) }),
    fase('f-p6-afb', 'p6', 'afbouw', wd(108), wd(130), 400, ['f-p6-spuit'], { teamId: 'team-afb-b' }),
    fase('f-p6-kwal', 'p6', 'kwaliteit', wd(131), wd(137), 40, ['f-p6-afb'], { teamId: 'team-afb-b' }),
  )

  // P7 — schaduw, 85% verkoopkans, chassis op Team A → kansgewogen knelpunt bovenop P3/P4
  projecten.push({
    id: 'p7', projectnummer: 'PR3330', naam: 'Festival hospitality deck NoordFest', klant: 'NoordFest Producties',
    productModel: 'E16TU', salesverantwoordelijke: 'Rick van Leeuwen', projectmanager: 'Hugo Brands',
    status: 'schaduw', verkoopkans: 85, prioriteit: 'hoog', complexiteit: 'complex',
    verwachteOrderdatum: wd(8), gewensteOpleverdatum: wd(105),
    notities: 'Mondeling akkoord; wacht op handtekening. Planning alvast gereserveerd op Chassis Team A.',
    bijzonderheden: 'Dakterras met balustrade, dubbele bar', aangemaaktOp: d(-15),
  })
  fases.push(
    fase('f-p7-eng', 'p7', 'engineering', wd(10), wd(24), 160, [], { teamId: 'team-eng-a' }),
    fase('f-p7-cha', 'p7', 'chassis', wd(15), wd(35), 310, ['f-p7-eng'], {
      teamId: 'team-cha-a',
      notities: 'Bewust vroeg gereserveerd; overlapt met engineering en met PR3312/PR3318.',
    }),
    fase('f-p7-pan', 'p7', 'panelen', wd(36), wd(56), 330, ['f-p7-cha'], { teamId: 'team-pan-b' }),
    fase('f-p7-spuit', 'p7', 'spuiter', wd(59), wd(68), 0, ['f-p7-pan'], { externePartijId: 'ext-spuit-dalen', transportHeen: wd(59), transportTerug: wd(69) }),
    fase('f-p7-afb', 'p7', 'afbouw', wd(71), wd(92), 410, ['f-p7-spuit'], { teamId: 'team-afb-a' }),
    fase('f-p7-kwal', 'p7', 'kwaliteit', wd(93), wd(99), 40, ['f-p7-afb'], { teamId: 'team-afb-a' }),
  )

  const uitbreiding = maakLocatieUitbreiding()

  return {
    projecten: [...projecten, ...uitbreiding.projecten],
    fases: [...fases, ...uitbreiding.fases],
    medewerkers,
    teams,
    afwezigheid,
    aanpassingen,
    externePartijen,
    instellingen: { ...STANDAARD_INSTELLINGEN },
    locaties: uitbreiding.locaties,
    zones: uitbreiding.zones,
    plaatsen: uitbreiding.plaatsen,
    units: uitbreiding.units,
    locatieHistorie: uitbreiding.locatieHistorie,
    templates: maakSeedTemplates(),
    complexiteitNiveaus: STANDAARD_COMPLEXITEITSNIVEAUS.map((n) => ({ ...n })),
  }
}

// ==================================================
// Locatieplanning: locaties, plaatsen, extra projecten en units
// ==================================================

export interface LocatieUitbreiding {
  projecten: Project[]
  fases: Fase[]
  locaties: Locatie[]
  zones: Zone[]
  plaatsen: Plaats[]
  units: Unit[]
  locatieHistorie: LocatieMutatie[]
}

function maakPlaatsen(zoneId: string, prefix: string, naamPrefix: string, aantal: number): Plaats[] {
  return Array.from({ length: aantal }, (_, i) => ({
    id: `pl-${prefix}-${String(i + 1).padStart(2, '0')}`,
    zoneId,
    naam: `${naamPrefix} ${String(i + 1).padStart(2, '0')}`,
    volgorde: i + 1,
  }))
}

/**
 * Losse locatie-uitbreiding zodat bestaande (opgeslagen) data zonder units
 * naar de nieuwe structuur gemigreerd kan worden. Verwijst naar bestaande
 * projecten p1 t/m p4 en voegt extra (deels afgeronde) projecten toe.
 */
export function maakLocatieUitbreiding(): LocatieUitbreiding {
  const locaties: Locatie[] = [
    { id: 'loc-mh25', naam: 'MH25 – Expandable Projects', adres: 'Meerheide 25', functie: 'Afbouw, eindmontage, kwaliteitscontrole en oplevervoorbereiding', volgorde: 1 },
    { id: 'loc-mh207', naam: 'MH207 – Expandable Factory', adres: 'Meerheide 207', functie: 'Chassisbouw en panelenbouw', volgorde: 2 },
    { id: 'loc-opslag', naam: 'Opslag', functie: 'Opslag van trailers die tijdelijk niet in productie staan of gereed zijn en wachten op transport of oplevering', volgorde: 3 },
  ]

  const zones: Zone[] = [
    { id: 'z-afbouw', locatieId: 'loc-mh25', naam: 'Afbouw', volgorde: 1 },
    { id: 'z-chassis', locatieId: 'loc-mh207', naam: 'Chassisbouw', volgorde: 1 },
    { id: 'z-panelen', locatieId: 'loc-mh207', naam: 'Panelenbouw', volgorde: 2 },
    { id: 'z-opslag', locatieId: 'loc-opslag', naam: 'Opslag', volgorde: 1 },
  ]

  const plaatsen: Plaats[] = [
    ...maakPlaatsen('z-afbouw', 'afbouw', 'Afbouw', 10),
    ...maakPlaatsen('z-chassis', 'chassis', 'Chassis', 6),
    ...maakPlaatsen('z-panelen', 'panelen', 'Panelen', 6),
    ...maakPlaatsen('z-opslag', 'opslag', 'Opslag', 25),
  ]

  // ---------- Extra projecten (volume voor een geloofwaardige fabrieksvloer) ----------

  const proj = (
    id: string,
    projectnummer: string,
    naam: string,
    klant: string,
    productModel: string,
    gewensteOpleverdatum: string,
    extra: Partial<Project> = {},
  ): Project => ({
    id,
    projectnummer,
    naam,
    klant,
    productModel,
    salesverantwoordelijke: 'Rick van Leeuwen',
    projectmanager: 'Petra Simons',
    status: 'definitief',
    verkoopkans: 100,
    prioriteit: 'normaal',
    complexiteit: 'gemiddeld',
    gewensteOpleverdatum,
    notities: '',
    aangemaaktOp: d(-150),
    bevestigdOp: d(-120),
    ...extra,
  })

  const projecten: Project[] = [
    proj('p8', 'PR3310', 'Popup studio MediaMakers', 'MediaMakers Collective', 'E13T', wd(75), { projectmanager: 'Hugo Brands' }),
    proj('p9', 'PR3315', 'Demo-unit TrailTech Solutions', 'TrailTech Solutions', 'E7P', wd(50), {
      templateId: 'tmpl-e7p-standaard-v1', templateTrailertype: 'E7P', templateComplexiteitId: 'standaard', templateVersie: 1,
    }),
    proj('p10', 'PR3320', 'Eventtrailer NightOwl Events', 'NightOwl Events', 'E16TU', wd(16), { prioriteit: 'hoog', projectmanager: 'Hugo Brands' }),
    proj('p11', 'PR3333', 'Mobiel kantoor BuroFlex', 'BuroFlex BV', 'E9P', wd(20)),
    proj('p12', 'PR3336', 'Verkoopdemo E16TU', 'Expandable Sales (intern)', 'E16TU', wd(110), { prioriteit: 'laag', salesverantwoordelijke: 'Charlotte Mol' }),
    proj('p13', 'PR3340', 'Voorserie uitschuifsysteem 2027', 'Expandable R&D (intern)', 'E13T', wd(40), { prioriteit: 'laag', notities: 'Interne voorserie: alleen engineering en chassisbouw.' }),
    proj('p14', 'PR3304', 'Beursstand unit ExpoLine', 'ExpoLine Events', 'E9P', wd(-5), { notities: 'Gereed; klant heeft afhaling bevestigd.' }),
    proj('p15', 'PR3302', 'Roadshow unit SoundGarden', 'SoundGarden Agency', 'E13T', wd(15), { notities: 'Gereed; transport gepland over drie weken.' }),
    proj('p16', 'PR3345', 'Hospitality unit RaceDays', 'RaceDays Promotions', 'E16TU', wd(120), { projectmanager: 'Hugo Brands' }),
    proj('p17', 'PR3348', 'Promotietrailer FreshJuice', 'FreshJuice Brands', 'E9P', wd(125)),
    proj('p18', 'PR3301', 'Fanzone unit FC Zuidwest', 'FC Zuidwest', 'E13T', wd(5), { prioriteit: 'hoog' }),
  ]

  const fases: Fase[] = [
    // p8 — panelenbouw bezig
    fase('f-p8-eng', 'p8', 'engineering', wd(-40), wd(-26), 130, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p8-cha', 'p8', 'chassis', wd(-25), wd(-6), 290, ['f-p8-eng'], { teamId: 'team-cha-b', status: 'gereed' }),
    fase('f-p8-pan', 'p8', 'panelen', wd(-5), wd(16), 320, ['f-p8-cha'], { teamId: 'team-pan-a', status: 'bezig', voortgang: 45, werkpakketVoortgang: [100, 60, 40, 0, 0] }),
    fase('f-p8-spuit', 'p8', 'spuiter', wd(19), wd(28), 0, ['f-p8-pan'], { externePartijId: 'ext-spuit-coatworks', transportHeen: wd(19), transportTerug: wd(29) }),
    fase('f-p8-afb', 'p8', 'afbouw', wd(40), wd(62), 380, ['f-p8-spuit'], { teamId: 'team-afb-b', notities: 'Start later: wacht op vrije afbouwcapaciteit.' }),
    fase('f-p8-kwal', 'p8', 'kwaliteit', wd(63), wd(67), 40, ['f-p8-afb'], { teamId: 'team-afb-b' }),

    // p9 — panelenbouw bijna klaar, vertrekt deze week
    fase('f-p9-eng', 'p9', 'engineering', wd(-45), wd(-33), 120, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p9-cha', 'p9', 'chassis', wd(-32), wd(-13), 280, ['f-p9-eng'], { teamId: 'team-cha-b', status: 'gereed' }),
    fase('f-p9-pan', 'p9', 'panelen', wd(-12), wd(4), 300, ['f-p9-cha'], { teamId: 'team-pan-b', status: 'bezig', voortgang: 80, werkpakketVoortgang: [100, 100, 80, 60, 40] }),
    fase('f-p9-spuit', 'p9', 'spuiter', wd(7), wd(16), 0, ['f-p9-pan'], { externePartijId: 'ext-spuit-dalen', transportHeen: wd(7), transportTerug: wd(17) }),
    fase('f-p9-afb', 'p9', 'afbouw', wd(17), wd(43), 340, ['f-p9-spuit'], { teamId: 'team-afb-a' }),
    fase('f-p9-kwal', 'p9', 'kwaliteit', wd(44), wd(48), 40, ['f-p9-afb'], { teamId: 'team-afb-a' }),

    // p10 — afbouw bezig, oplevering nadert
    fase('f-p10-eng', 'p10', 'engineering', wd(-75), wd(-61), 150, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p10-cha', 'p10', 'chassis', wd(-60), wd(-41), 310, ['f-p10-eng'], { teamId: 'team-cha-a', status: 'gereed' }),
    fase('f-p10-pan', 'p10', 'panelen', wd(-40), wd(-20), 330, ['f-p10-cha'], { teamId: 'team-pan-b', status: 'gereed' }),
    fase('f-p10-spuit', 'p10', 'spuiter', wd(-17), wd(-8), 0, ['f-p10-pan'], { externePartijId: 'ext-spuit-coatworks', status: 'gereed', transportHeen: wd(-17), transportTerug: wd(-8) }),
    fase('f-p10-afb', 'p10', 'afbouw', wd(-15), wd(8), 260, ['f-p10-spuit'], { teamId: 'team-afb-b', status: 'bezig', voortgang: 70, werkpakketVoortgang: [100, 100, 80, 60, 20, 0] }),
    fase('f-p10-kwal', 'p10', 'kwaliteit', wd(9), wd(13), 40, ['f-p10-afb'], { teamId: 'team-afb-b' }),

    // p11 — afbouw bezig
    fase('f-p11-eng', 'p11', 'engineering', wd(-70), wd(-58), 120, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p11-cha', 'p11', 'chassis', wd(-55), wd(-36), 280, ['f-p11-eng'], { teamId: 'team-cha-a', status: 'gereed' }),
    fase('f-p11-pan', 'p11', 'panelen', wd(-35), wd(-15), 300, ['f-p11-cha'], { teamId: 'team-pan-a', status: 'gereed' }),
    fase('f-p11-spuit', 'p11', 'spuiter', wd(-12), wd(-3), 0, ['f-p11-pan'], { externePartijId: 'ext-spuit-dalen', status: 'gereed', transportHeen: wd(-12), transportTerug: wd(-3) }),
    fase('f-p11-afb', 'p11', 'afbouw', wd(-8), wd(18), 240, ['f-p11-spuit'], { teamId: 'team-afb-a', status: 'bezig', voortgang: 35, werkpakketVoortgang: [80, 60, 20, 0, 0, 0] }),
    fase('f-p11-kwal', 'p11', 'kwaliteit', wd(19), wd(23), 40, ['f-p11-afb'], { teamId: 'team-afb-a' }),

    // p12 — chassis gereed, wacht op panelenbouw (unit bezet nog een chassisplaats)
    fase('f-p12-eng', 'p12', 'engineering', wd(-50), wd(-38), 110, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p12-cha', 'p12', 'chassis', wd(-30), wd(-7), 290, ['f-p12-eng'], { teamId: 'team-cha-a', status: 'gereed' }),
    fase('f-p12-pan', 'p12', 'panelen', wd(6), wd(26), 320, ['f-p12-cha'], { teamId: 'team-pan-b', notities: 'Start zodra Panelen Team B vrij is.' }),
    fase('f-p12-spuit', 'p12', 'spuiter', wd(29), wd(38), 0, ['f-p12-pan'], { externePartijId: 'ext-spuit-coatworks', transportHeen: wd(29), transportTerug: wd(39) }),
    fase('f-p12-afb', 'p12', 'afbouw', wd(77), wd(99), 350, ['f-p12-spuit'], { teamId: 'team-afb-a', notities: 'Lage prioriteit: afbouw ingepland na klantprojecten.' }),
    fase('f-p12-kwal', 'p12', 'kwaliteit', wd(100), wd(104), 40, ['f-p12-afb'], { teamId: 'team-afb-a' }),

    // p13 — interne voorserie: alleen engineering + chassis
    fase('f-p13-eng', 'p13', 'engineering', wd(-20), wd(-8), 80, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p13-cha', 'p13', 'chassis', wd(-3), wd(24), 180, ['f-p13-eng'], { teamId: 'team-cha-b', status: 'bezig', voortgang: 20, werkpakketVoortgang: [50, 30, 0, 0, 0] }),

    // p14 — volledig gereed, wacht op afhaling
    fase('f-p14-eng', 'p14', 'engineering', wd(-120), wd(-106), 120, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p14-cha', 'p14', 'chassis', wd(-105), wd(-86), 280, ['f-p14-eng'], { teamId: 'team-cha-a', status: 'gereed' }),
    fase('f-p14-pan', 'p14', 'panelen', wd(-85), wd(-65), 300, ['f-p14-cha'], { teamId: 'team-pan-a', status: 'gereed' }),
    fase('f-p14-spuit', 'p14', 'spuiter', wd(-62), wd(-53), 0, ['f-p14-pan'], { externePartijId: 'ext-spuit-dalen', status: 'gereed', transportHeen: wd(-62), transportTerug: wd(-53) }),
    fase('f-p14-afb', 'p14', 'afbouw', wd(-50), wd(-25), 380, ['f-p14-spuit'], { teamId: 'team-afb-b', status: 'gereed' }),
    fase('f-p14-kwal', 'p14', 'kwaliteit', wd(-24), wd(-15), 40, ['f-p14-afb'], { teamId: 'team-afb-b', status: 'gereed' }),

    // p15 — volledig gereed, in opslag tot transport
    fase('f-p15-eng', 'p15', 'engineering', wd(-130), wd(-116), 130, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p15-cha', 'p15', 'chassis', wd(-115), wd(-96), 300, ['f-p15-eng'], { teamId: 'team-cha-b', status: 'gereed' }),
    fase('f-p15-pan', 'p15', 'panelen', wd(-95), wd(-75), 320, ['f-p15-cha'], { teamId: 'team-pan-b', status: 'gereed' }),
    fase('f-p15-spuit', 'p15', 'spuiter', wd(-72), wd(-63), 0, ['f-p15-pan'], { externePartijId: 'ext-spuit-coatworks', status: 'gereed', transportHeen: wd(-72), transportTerug: wd(-63) }),
    fase('f-p15-afb', 'p15', 'afbouw', wd(-60), wd(-35), 400, ['f-p15-spuit'], { teamId: 'team-afb-a', status: 'gereed' }),
    fase('f-p15-kwal', 'p15', 'kwaliteit', wd(-34), wd(-25), 40, ['f-p15-afb'], { teamId: 'team-afb-a', status: 'gereed' }),

    // p16 — engineering bezig; chassis start binnenkort maar Chassisbouw is vol
    fase('f-p16-eng', 'p16', 'engineering', wd(0), wd(18), 140, [], { teamId: 'team-eng-a', status: 'bezig', voortgang: 15, werkpakketVoortgang: [60, 20, 0, 0, 0] }),
    fase('f-p16-cha', 'p16', 'chassis', wd(11), wd(30), 300, ['f-p16-eng'], { teamId: 'team-cha-b' }),
    fase('f-p16-pan', 'p16', 'panelen', wd(33), wd(53), 340, ['f-p16-cha'], { teamId: 'team-pan-a' }),
    fase('f-p16-spuit', 'p16', 'spuiter', wd(56), wd(65), 0, ['f-p16-pan'], { externePartijId: 'ext-spuit-dalen', transportHeen: wd(56), transportTerug: wd(66) }),
    fase('f-p16-afb', 'p16', 'afbouw', wd(88), wd(110), 400, ['f-p16-spuit'], { teamId: 'team-afb-b' }),
    fase('f-p16-kwal', 'p16', 'kwaliteit', wd(111), wd(115), 40, ['f-p16-afb'], { teamId: 'team-afb-b' }),

    // p17 — engineering bezig; casco staat alvast (tijdelijk) in opslag
    fase('f-p17-eng', 'p17', 'engineering', wd(-4), wd(12), 120, [], { teamId: 'team-eng-a', status: 'bezig', voortgang: 40, werkpakketVoortgang: [100, 60, 20, 0, 0] }),
    fase('f-p17-cha', 'p17', 'chassis', wd(43), wd(62), 280, ['f-p17-eng'], { teamId: 'team-cha-b' }),
    fase('f-p17-pan', 'p17', 'panelen', wd(65), wd(84), 300, ['f-p17-cha'], { teamId: 'team-pan-b' }),
    fase('f-p17-spuit', 'p17', 'spuiter', wd(87), wd(96), 0, ['f-p17-pan'], { externePartijId: 'ext-spuit-coatworks', transportHeen: wd(87), transportTerug: wd(97) }),
    fase('f-p17-afb', 'p17', 'afbouw', wd(101), wd(123), 380, ['f-p17-spuit'], { teamId: 'team-afb-a' }),
    fase('f-p17-kwal', 'p17', 'kwaliteit', wd(124), wd(128), 40, ['f-p17-afb'], { teamId: 'team-afb-a' }),

    // p18 — in kwaliteitscontrole, oplevering deze week
    fase('f-p18-eng', 'p18', 'engineering', wd(-90), wd(-76), 130, [], { teamId: 'team-eng-a', status: 'gereed' }),
    fase('f-p18-cha', 'p18', 'chassis', wd(-75), wd(-56), 290, ['f-p18-eng'], { teamId: 'team-cha-a', status: 'gereed' }),
    fase('f-p18-pan', 'p18', 'panelen', wd(-55), wd(-35), 310, ['f-p18-cha'], { teamId: 'team-pan-a', status: 'gereed' }),
    fase('f-p18-spuit', 'p18', 'spuiter', wd(-32), wd(-23), 0, ['f-p18-pan'], { externePartijId: 'ext-spuit-dalen', status: 'gereed', transportHeen: wd(-32), transportTerug: wd(-23) }),
    fase('f-p18-afb', 'p18', 'afbouw', wd(-20), wd(-3), 360, ['f-p18-spuit'], { teamId: 'team-afb-b', status: 'gereed' }),
    fase('f-p18-kwal', 'p18', 'kwaliteit', wd(-2), wd(3), 40, ['f-p18-afb'], { teamId: 'team-afb-b', status: 'bezig', voortgang: 60, werkpakketVoortgang: [100, 60, 0] }),
  ]

  // ---------- Units ----------

  // Trailers hebben géén eigen unit-/serienummer: het PR-nummer van het gekoppelde
  // project is de enige identificatie. `id` is puur een interne sleutel.
  const unit = (id: string, extra: Partial<Unit>): Unit => ({
    id,
    status: 'niet_gestart',
    ...extra,
  })

  const units: Unit[] = [
    // Opslag
    unit('u-01', { projectId: 'p14', status: 'wacht_afhaling', plaatsId: 'pl-opslag-01', opPlaatsSinds: d(-6), geplandeVertrekdatum: wd(9), notities: 'Afhaling bevestigd door klant.' }),
    unit('u-02', { projectId: 'p15', status: 'in_opslag', plaatsId: 'pl-opslag-03', opPlaatsSinds: d(-25), geplandeVertrekdatum: wd(23), notities: 'Transport gepland; wacht op vrachtdocumenten.' }),
    unit('u-18', { status: 'in_opslag', plaatsId: 'pl-opslag-05', opPlaatsSinds: d(-40), notities: 'Leen-/ruilunit zonder projectkoppeling.' }),
    unit('u-17', { projectId: 'p17', status: 'niet_gestart', plaatsId: 'pl-opslag-07', opPlaatsSinds: d(-10), geplandeVertrekdatum: wd(43), notities: 'Casco alvast aangeleverd; tijdelijk in opslag tot chassisbouw start.' }),
    unit('u-19', { status: 'in_opslag', plaatsId: 'pl-opslag-10', opPlaatsSinds: d(-60), notities: 'Demovoorraad.' }),

    // MH25 · Afbouw
    unit('u-04', { projectId: 'p1', status: 'in_afbouw', plaatsId: 'pl-afbouw-01', opPlaatsSinds: d(-6), geplandeVertrekdatum: wd(22) }),
    unit('u-06', { projectId: 'p10', status: 'in_afbouw', plaatsId: 'pl-afbouw-02', opPlaatsSinds: d(-15), geplandeVertrekdatum: wd(13) }),
    unit('u-07', { projectId: 'p11', status: 'in_afbouw', plaatsId: 'pl-afbouw-03', opPlaatsSinds: d(-8), geplandeVertrekdatum: wd(23) }),
    unit('u-03', { projectId: 'p18', status: 'in_kwaliteitscontrole', plaatsId: 'pl-afbouw-04', opPlaatsSinds: d(-20), geplandeVertrekdatum: wd(4) }),

    // MH207 · Chassisbouw (vol: 6/6)
    unit('u-10', { projectId: 'p3', status: 'in_chassisbouw', plaatsId: 'pl-chassis-01', opPlaatsSinds: d(-4), geplandeVertrekdatum: wd(19) }),
    unit('u-11', { projectId: 'p4', status: 'in_chassisbouw', plaatsId: 'pl-chassis-02', opPlaatsSinds: d(-2), geplandeVertrekdatum: wd(33), afwijkingVanPlanning: true, notities: 'Chassis alvast opgebouwd terwijl engineering nog loopt (bewuste afwijking).' }),
    unit('u-12', { projectId: 'p12', status: 'wacht_panelenbouw', plaatsId: 'pl-chassis-03', opPlaatsSinds: d(-7), geplandeVertrekdatum: wd(6) }),
    unit('u-14', { status: 'niet_gestart', plaatsId: 'pl-chassis-04', opPlaatsSinds: d(-30), notities: 'Voorraadchassis voor snelle levering.' }),
    unit('u-13', { projectId: 'p13', status: 'in_chassisbouw', plaatsId: 'pl-chassis-05', opPlaatsSinds: d(-3), geplandeVertrekdatum: wd(24) }),
    unit('u-15', { status: 'niet_gestart', plaatsId: 'pl-chassis-06', opPlaatsSinds: d(-45), notities: 'Voorraadchassis voor snelle levering.' }),

    // MH207 · Panelenbouw
    unit('u-08', { projectId: 'p8', status: 'in_panelenbouw', plaatsId: 'pl-panelen-01', opPlaatsSinds: d(-5), geplandeVertrekdatum: wd(19) }),
    unit('u-09', { projectId: 'p9', status: 'in_panelenbouw', plaatsId: 'pl-panelen-02', opPlaatsSinds: d(-12), geplandeVertrekdatum: wd(4), notities: 'Moet deze week naar de spuiter.' }),

    // Zonder fysieke plaats
    unit('u-05', { projectId: 'p2', status: 'bij_spuiter', bijExternePartijId: 'ext-spuit-dalen', opPlaatsSinds: d(-5), geplandeVertrekdatum: wd(10), vorigePlaatsId: 'pl-panelen-03', notities: 'Retour verwacht na gemelde vertraging bij Spuiterij Van Dalen.' }),
    unit('u-16', { projectId: 'p16', status: 'niet_gestart', geplandeVertrekdatum: wd(11), notities: 'Wacht op vrije chassisplaats; Chassisbouw is momenteel vol.' }),
  ]

  // ---------- Locatiehistorie ----------

  let mutatieTeller = 0
  const mutatie = (
    unitId: string,
    projectnummer: string | undefined,
    vanLabel: string,
    naarLabel: string,
    dagenGeleden: number,
    reden: string,
    faseAangepast = false,
  ): LocatieMutatie => ({
    id: `mut-seed-${++mutatieTeller}`,
    unitId,
    projectnummer,
    vanLabel,
    naarLabel,
    tijdstip: `${d(-dagenGeleden)}T${dagenGeleden % 2 === 0 ? '09:15' : '14:40'}:00`,
    gebruiker: 'Petra Simons',
    reden,
    faseAangepast,
  })

  const locatieHistorie: LocatieMutatie[] = [
    mutatie('u-09', 'PR3315', 'MH207 – Expandable Factory · Chassisbouw · Chassis 03', 'MH207 – Expandable Factory · Panelenbouw · Panelen 02', 12, 'Chassisbouw afgerond', true),
    mutatie('u-05', 'PR3308', 'MH207 – Expandable Factory · Panelenbouw · Panelen 03', 'Externe spuiter (Spuiterij Van Dalen)', 5, 'Panelenbouw afgerond', true),
    mutatie('u-08', 'PR3310', 'MH207 – Expandable Factory · Chassisbouw · Chassis 05', 'MH207 – Expandable Factory · Panelenbouw · Panelen 01', 5, 'Verplaatst naar panelenbouw', true),
    mutatie('u-04', 'PR3305', 'Externe spuiter (CoatWorks Venlo)', 'MH25 – Expandable Projects · Afbouw · Afbouw 01', 6, 'Terug van externe spuiter', true),
    mutatie('u-01', 'PR3304', 'MH25 – Expandable Projects · Afbouw · Afbouw 05', 'Opslag · Opslag · Opslag 01', 6, 'Productie voltooid — wacht op afhaling', false),
    mutatie('u-12', 'PR3336', 'MH207 – Expandable Factory · Chassisbouw · Chassis 03', 'MH207 – Expandable Factory · Chassisbouw · Chassis 03', 7, 'Chassisbouw afgerond — wacht op panelenbouw', false),
    mutatie('u-10', 'PR3312', '—', 'MH207 – Expandable Factory · Chassisbouw · Chassis 01', 4, 'Chassisbouw gestart', false),
    mutatie('u-11', 'PR3318', '—', 'MH207 – Expandable Factory · Chassisbouw · Chassis 02', 2, 'Handmatige correctie', false),
    mutatie('u-17', 'PR3348', '—', 'Opslag · Opslag · Opslag 07', 10, 'Tijdelijk naar opslag', false),
    mutatie('u-02', 'PR3302', 'MH25 – Expandable Projects · Afbouw · Afbouw 06', 'Opslag · Opslag · Opslag 03', 25, 'Productie voltooid', false),
  ]

  return { projecten, fases, locaties, zones, plaatsen, units, locatieHistorie }
}

// ==================================================
// Producttemplates (mockdata)
// ==================================================

const TEMPLATE_TEAM: Record<string, string | undefined> = {
  engineering: 'team-eng-a',
  chassis: 'team-cha-a',
  panelen: 'team-pan-a',
  afbouw: 'team-afb-a',
  kwaliteit: 'team-afb-a',
  extern: undefined,
}

interface TaakSpec {
  naam: string
  uren: number
  mw?: number
  vrd?: string[]
  optioneel?: boolean
  omschrijving?: string
}

interface FaseSpec {
  key: Exclude<FaseKey, 'salesoverdracht'>
  afdeling: Afdeling
  doorlooptijd: number
  taken: TaakSpec[]
}

function bouwTemplateFases(prefix: string, specs: FaseSpec[]): TemplateFase[] {
  return specs.map((fs, fi) => ({
    id: `tf-${prefix}-${fs.key}`,
    key: fs.key,
    naam: FASE_LABELS[fs.key],
    afdeling: fs.afdeling,
    doorlooptijdWerkdagen: fs.doorlooptijd,
    volgorde: fi + 1,
    taken: fs.taken.map((t, ti) => ({
      id: `tt-${prefix}-${fs.key}-${ti + 1}`,
      naam: t.naam,
      omschrijving: t.omschrijving,
      uren: t.uren,
      duurWerkdagen: Math.max(1, Math.round(fs.doorlooptijd / fs.taken.length)),
      startOffsetWerkdagen: 0,
      afhankelijkVan: [],
      afdeling: fs.afdeling,
      standaardTeamId: TEMPLATE_TEAM[fs.afdeling],
      vaardigheden: t.vrd ?? [],
      aantalMedewerkers: t.mw ?? 1,
      optioneel: t.optioneel ?? false,
      volgorde: ti + 1,
    })) as TemplateTaak[],
  }))
}

// ---- Basisvarianten (Standaard) per trailertype ----

function e13hStandaard(): FaseSpec[] {
  return [
    { key: 'engineering', afdeling: 'engineering', doorlooptijd: 15, taken: [
      { naam: 'Technische intake & requirements', uren: 16, vrd: ['CAD'] },
      { naam: 'Technische tekeningen', uren: 40, vrd: ['CAD'] },
      { naam: 'Engineering maatwerk', uren: 30, vrd: ['CAD', 'Maatwerk'] },
      { naam: 'Bill of Materials', uren: 24, vrd: ['BOM'] },
      { naam: 'Interne goedkeuring & vrijgave', uren: 10 },
    ] },
    { key: 'chassis', afdeling: 'chassis', doorlooptijd: 18, taken: [
      { naam: 'Chassisconstructie & lassen', uren: 100, mw: 3, vrd: ['Lassen'] },
      { naam: 'Assen en wielconstructie', uren: 50, mw: 2 },
      { naam: 'Hydrauliek', uren: 60, mw: 2, vrd: ['Hydrauliek'] },
      { naam: 'Stabilisatie & leveling', uren: 40, mw: 2 },
      { naam: 'Technische controle & vrijgave', uren: 20 },
    ] },
    { key: 'panelen', afdeling: 'panelen', doorlooptijd: 18, taken: [
      { naam: 'Vloerpanelen', uren: 60, mw: 2, vrd: ['Paneelbouw'] },
      { naam: 'Wandpanelen & dak', uren: 100, mw: 3 },
      { naam: 'Ramen en deuren', uren: 50, mw: 2 },
      { naam: 'Uitschuifbare elementen', uren: 70, mw: 2, vrd: ['Uitschuifsystemen'] },
      { naam: 'Afdichting & kwaliteitscontrole', uren: 30 },
    ] },
    { key: 'spuiter', afdeling: 'extern', doorlooptijd: 8, taken: [
      { naam: 'Transport heen', uren: 0 },
      { naam: 'Voorbehandeling & spuitwerk', uren: 0 },
      { naam: 'Transport terug', uren: 0 },
    ] },
    { key: 'afbouw', afdeling: 'afbouw', doorlooptijd: 22, taken: [
      { naam: 'Elektra & verlichting', uren: 90, mw: 2, vrd: ['Elektra'] },
      { naam: 'Klimaat (airco/verwarming)', uren: 60, vrd: ['Klimaat'] },
      { naam: 'Interieurbouw & meubilair', uren: 110, mw: 2, vrd: ['Interieurbouw'] },
      { naam: 'Audio/video & keuken', uren: 70, optioneel: true },
      { naam: 'Branding & wrapping', uren: 40, vrd: ['Wrapping'], optioneel: true },
      { naam: 'Testen installaties', uren: 30 },
    ] },
    { key: 'kwaliteit', afdeling: 'kwaliteit', doorlooptijd: 5, taken: [
      { naam: 'Eindcontrole & functionele test', uren: 20 },
      { naam: 'Opleverpuntenlijst & herstel', uren: 16 },
      { naam: 'Klantoplevering', uren: 8 },
    ] },
  ]
}

function e7pStandaard(): FaseSpec[] {
  return [
    { key: 'engineering', afdeling: 'engineering', doorlooptijd: 12, taken: [
      { naam: 'Technische intake & requirements', uren: 12, vrd: ['CAD'] },
      { naam: 'Technische tekeningen', uren: 28, vrd: ['CAD'] },
      { naam: 'Engineering maatwerk', uren: 18, vrd: ['CAD'] },
      { naam: 'Bill of Materials', uren: 16, vrd: ['BOM'] },
      { naam: 'Interne goedkeuring & vrijgave', uren: 8 },
    ] },
    { key: 'chassis', afdeling: 'chassis', doorlooptijd: 14, taken: [
      { naam: 'Chassisconstructie & lassen', uren: 70, mw: 2, vrd: ['Lassen'] },
      { naam: 'Assen en wielconstructie', uren: 36, mw: 2 },
      { naam: 'Pneumatiek & leveling', uren: 30, vrd: ['Montage'] },
      { naam: 'Technische controle & vrijgave', uren: 14 },
    ] },
    { key: 'panelen', afdeling: 'panelen', doorlooptijd: 14, taken: [
      { naam: 'Vloerpanelen', uren: 40, mw: 2, vrd: ['Paneelbouw'] },
      { naam: 'Wandpanelen & dak', uren: 70, mw: 2 },
      { naam: 'Ramen en deuren', uren: 36, vrd: ['Ramen & deuren'] },
      { naam: 'Uitschuifbaar element', uren: 40, vrd: ['Uitschuifsystemen'] },
      { naam: 'Afdichting & kwaliteitscontrole', uren: 20 },
    ] },
    { key: 'spuiter', afdeling: 'extern', doorlooptijd: 6, taken: [
      { naam: 'Transport heen', uren: 0 },
      { naam: 'Voorbehandeling & spuitwerk', uren: 0 },
      { naam: 'Transport terug', uren: 0 },
    ] },
    { key: 'afbouw', afdeling: 'afbouw', doorlooptijd: 16, taken: [
      { naam: 'Elektra & verlichting', uren: 60, mw: 2, vrd: ['Elektra'] },
      { naam: 'Klimaat (airco/verwarming)', uren: 30, vrd: ['Klimaat'] },
      { naam: 'Interieurbouw & meubilair', uren: 70, mw: 2, vrd: ['Interieurbouw'] },
      { naam: 'Branding & wrapping', uren: 28, vrd: ['Wrapping'], optioneel: true },
      { naam: 'Testen installaties', uren: 20 },
    ] },
    { key: 'kwaliteit', afdeling: 'kwaliteit', doorlooptijd: 4, taken: [
      { naam: 'Eindcontrole & functionele test', uren: 14 },
      { naam: 'Opleverpuntenlijst & herstel', uren: 10 },
      { naam: 'Klantoplevering', uren: 6 },
    ] },
  ]
}

/** Verhoogt complexiteit: schaalt uren/doorlooptijd en voegt extra engineering-, afbouw- en QC-taken toe. */
function verhoogComplexiteit(basis: FaseSpec[], niveau: 'uitgebreid' | 'maatwerk'): FaseSpec[] {
  const urenFactor = niveau === 'maatwerk' ? 1.35 : 1.15
  const duurFactor = niveau === 'maatwerk' ? 1.25 : 1.1
  const schaal = (specs: FaseSpec[]) =>
    specs.map((fs) => ({
      ...fs,
      doorlooptijd: Math.round(fs.doorlooptijd * duurFactor),
      taken: fs.taken.map((t) => ({ ...t, uren: Math.round(t.uren * urenFactor) })),
    }))
  const uit = schaal(basis).map((fs) => ({ ...fs, taken: [...fs.taken] }))

  const engineering = uit.find((f) => f.key === 'engineering')
  const afbouw = uit.find((f) => f.key === 'afbouw')
  const kwaliteit = uit.find((f) => f.key === 'kwaliteit')

  if (engineering) {
    engineering.taken.push({ naam: 'Extra detailtekeningen', uren: 24, vrd: ['CAD'] })
    engineering.taken.push({ naam: 'Klantreview ontwerp', uren: 8 })
    // Meer engineers tegelijkertijd op het tekenwerk.
    const tek = engineering.taken.find((t) => t.naam === 'Technische tekeningen')
    if (tek) tek.mw = 2
    if (niveau === 'maatwerk') {
      engineering.taken.push({ naam: 'Maatwerk engineering componenten', uren: 40, mw: 2, vrd: ['Maatwerk'] })
      engineering.taken.push({ naam: 'Tweede klantreview', uren: 8 })
      engineering.taken.push({ naam: 'Extra technische review', uren: 12 })
      engineering.taken.push({ naam: 'Extra interne vrijgave', uren: 6 })
      engineering.doorlooptijd += 4
    } else {
      engineering.doorlooptijd += 2
    }
  }
  if (afbouw && niveau === 'maatwerk') {
    afbouw.taken.push({ naam: 'Maatwerk afwerking & details', uren: 40, vrd: ['Afwerking'] })
    afbouw.doorlooptijd += 3
  }
  if (kwaliteit && niveau === 'maatwerk') {
    kwaliteit.taken.push({ naam: 'Extra functionele keuring', uren: 12 })
  }
  return uit
}

function bouwTemplate(
  trailertype: string,
  complexiteitId: string,
  versie: number,
  status: TemplateStatus,
  specs: FaseSpec[],
  gewijzigdDagenGeleden: number,
  gewijzigdDoor = 'Petra Simons',
  wijzigingsnotitie?: string,
): ProductTemplate {
  const naamMap: Record<string, string> = { standaard: 'Standaard', uitgebreid: 'Uitgebreid', maatwerk: 'Maatwerk' }
  return {
    id: `tmpl-${trailertype.toLowerCase()}-${complexiteitId}-v${versie}`,
    trailertype,
    complexiteitId,
    naam: `${trailertype} · ${naamMap[complexiteitId] ?? complexiteitId}`,
    omschrijving: `Standaard productieplanning voor een ${trailertype} (${naamMap[complexiteitId] ?? complexiteitId}).`,
    versie,
    status,
    geldigVanaf: d(-gewijzigdDagenGeleden),
    fases: bouwTemplateFases(`${trailertype.toLowerCase()}-${complexiteitId}-v${versie}`, specs),
    gewijzigdOp: d(-gewijzigdDagenGeleden),
    gewijzigdDoor,
    wijzigingsnotitie,
  }
}

export function maakSeedTemplates(): ProductTemplate[] {
  const e13hUit = verhoogComplexiteit(e13hStandaard(), 'uitgebreid')
  const e13hMaat = verhoogComplexiteit(e13hStandaard(), 'maatwerk')
  const e7pUit = verhoogComplexiteit(e7pStandaard(), 'uitgebreid')
  const e7pMaat = verhoogComplexiteit(e7pStandaard(), 'maatwerk')

  return [
    bouwTemplate('E13H', 'standaard', 1, 'gepubliceerd', e13hStandaard(), 120, 'Erik Lindhout', 'Eerste publicatie'),
    bouwTemplate('E13H', 'uitgebreid', 1, 'gepubliceerd', e13hUit, 90, 'Erik Lindhout', 'Eerste publicatie'),
    bouwTemplate('E13H', 'maatwerk', 2, 'gearchiveerd', e13hMaat, 60, 'Erik Lindhout', 'Vervangen door versie 3'),
    bouwTemplate('E13H', 'maatwerk', 3, 'gepubliceerd', e13hMaat, 20, 'Erik Lindhout', 'Extra klantreview en maatwerkcomponenten toegevoegd'),
    bouwTemplate('E7P', 'standaard', 1, 'gepubliceerd', e7pStandaard(), 110, 'Petra Simons', 'Eerste publicatie'),
    bouwTemplate('E7P', 'standaard', 2, 'concept', e7pStandaard(), 5, 'Petra Simons', 'Doorlooptijden herzien (concept)'),
    bouwTemplate('E7P', 'uitgebreid', 1, 'gepubliceerd', e7pUit, 80, 'Petra Simons', 'Eerste publicatie'),
    bouwTemplate('E7P', 'maatwerk', 1, 'gepubliceerd', e7pMaat, 45, 'Petra Simons', 'Eerste publicatie'),
  ]
}
