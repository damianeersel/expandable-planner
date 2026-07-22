# Voortgang — stand 22-07-2026

## Afgerond en werkend (in werkmap, deels nog niet gecommit)

1. **Basis-MVP**: dashboard, Gantt (tijdlijnplanning), projecten + wizard, projectdetail, teams, beschikbaarheid, verlof, externe partijen, instellingen, rollen.
2. **Locatieplanning**: plattegronden MH25 (vierkant, 6+4) / MH207 (langwerpig, 2×6) / Opslag (5×5), drag-and-drop, wachtrij, detailpaneel, historie, "Markeer als opgehaald".
3. **PR-nummers & modellen**: PR + 4 cijfers als enige identificatie; modellen E7P/E9P/E13T/E13H/E16TU/E16HU.
4. **Fase 1 templates**: Planningstemplates-scherm, template-editor, versies, wizard-integratie ("Template in schaduwplanning laden"), "Opslaan als nieuw template", complexiteitsniveaus in Instellingen.
5. **Fase 2 fundering** (deze sessie, gecompileerd groen vóór de agents startten): taakmodel (`Taak`, statussen, `externeActie`), `lib/taken.ts`, `lib/bestanden.ts` (IndexedDB), notities/historie/bestanden/partnerTypes in store + migratie, seed met 5 demotaken op PR3305, transporteur-partner, Gantt toont externe processen ("Extern · partner", paarse arcering).
6. **Fase 2 schermen** (drie parallelle agents):
   - ✅ ExternePartijen.tsx: volledig partnerbeheer (CRUD, dupliceren, archiveren, verwijderen-indien-ongebruikt, eigen partnertypes) + kaart "Externe acties". tsc groen.
   - ✅ ProjectDetail: "Gebaseerd op … · Losgekoppeld van template"-badge, nieuwe tab **Bestanden** (BestandenTab.tsx, upload → IndexedDB), verrijkte **Notities & historie** (NotitiesHistorieTab.tsx). tsc groen.
   - ✅ Detailplanning (FaseKaart herbouwd, FasesTab met fasebeheer, src/components/project/detail/*: TaakModal, ProcesModal, TaakRij, statusacties met reden-dialogen, toewijzing + capaciteitswaarschuwingen, VerschuifDialoog, NieuwePartnerModal, NotitiePopover). tsc + build groen.

## Verificatie (22-07, browser)

- Statuswissel taak → voortgang herberekend (47%→70%), historie-item gelogd, heropenen vereist reden (bevestigd).
- Bestandsupload → koppelmodal → metadata + "Bestand toegevoegd"-historie. LET OP: IndexedDB is in het ingebedde Claude-browserpaneel geblokkeerd → fallback (`opgeslagen: false`, amber "alleen metadata"-badge) werkt zoals bedoeld; in een normale browser slaat de inhoud wél echt op.
- Notities & historie-tab, Externe acties-kaart (PR3305 · Functionele test · Voltec · Bevestigd) en partnerbeheer-knop gecontroleerd.

## Openstaande stappen

1. PR `fase-2-detailplanning` → review/merge door Damian (merge = automatische Vercel-deploy).
2. Daarna eventueel: kanban-statusbord binnen Fases & werkzaamheden (bewust uitgesteld), fijnere medewerker-capaciteitsintegratie in Beschikbaarheid.

## Weetjes

- Laatst gecommitte stand op origin/main = t/m Fase 1 templates + vercel.json (b58af27). Alles van Fase 2 is nog niet gecommit.
- Stale HMR-consolefouten na grote refactors zijn normaal; harde herlaad lost het op.
- localStorage bevat mogelijk oude seed; migratie vangt dit op, maar "Demodata herstellen" geeft de nieuwste demoset.
