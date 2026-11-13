# Hub OS → boekhoudapplicatie: roadmap

Doel: Hub OS wordt de plek waar elke euro van Solyn Global binnenkomt en buitengaat, zodat de boekhouder (of filingsoftware) alles in één export krijgt. Hub OS **dient zelf geen aangiftes in**; dat blijft via de boekhouder of erkende software.

> Geen fiscaal of juridisch advies. Alles hieronder over btw, Peppol en vennootschapsbelasting eerst afstemmen met een boekhouder (zie "Beslissingen").

## Wat er al is (fundament)

| Onderdeel | Status | Gebruik in boekhouding |
|---|---|---|
| Verkoopfacturen (`invoices`) | ✅ nummering, PDF, e-mail, herinneringen, inplannen, maandelijks herhalen | verkoopdagboek |
| Kosten (`expenses`) | ✅ vaste maandkosten, per klant | basis voor aankoopdagboek |
| Klanten (`clients`) | ✅ btw-nummer, factuuradres | debiteuren |
| Documenten (`client_documents`, Storage) | ✅ | bijlagen / bonnetjes |
| Klantmap per website (Status) | ✅ facturen + kosten per klant | winstgevendheid per klant |
| Rollen (admin/sales/ops) + RLS | ✅ | alleen admin mag boeken |

## Fases

### Fase A — Grootboek ✅ gebouwd (13/11/2026, pagina Boekhouding)

Gebouwd: rekeningschema (aanpasbaar), dagboek met dubbele boekingen (database weigert boekingen die niet in evenwicht zijn), automatische boekingen uit facturen (verstuurd → omzet/debiteur, betaald → bank) en maandelijkse kosten (elke nacht 02:15 + knop), manuele boekingen, periodes afsluiten (database blokkeert wijzigingen), audit log, resultatenrekening met vergelijking vorige periode en vorig jaar, proefbalans, CSV-exports (dagboek, saldibalans). Nog open: munt/koersen en het definitieve rekeningschema van de boekhouder.

Oorspronkelijk plan:
- Tabellen: `ledger_accounts` (rekeningschema: omzet, kosten per categorie, bank, debiteuren, crediteuren, btw), `journal_entries` + `journal_lines` (dubbel boekhouden: elke boeking debet = credit).
- Automatisch boeken: factuur **verstuurd** → omzet + debiteur; factuur **betaald** → bank + debiteur af; kost → kostenrekening + crediteur/bank.
- Btw-codes per regel: 0 % verlegd (art. 44, nu standaard op facturen), plus de codes die de boekhouder bevestigt.
- Boekjaren + **afsluiten/vergrendelen**: een afgesloten periode kan niet meer gewijzigd worden (correcties via nieuwe boeking).
- Audit log: wie wijzigde wat en wanneer.
- Munt: boekhoudmunt vastleggen (GBP of EUR, zie Beslissingen), koersen per boekingsdatum bewaren.

### Fase B — Aankopen
- Aankoopfacturen/bonnetjes uploaden (foto vanaf gsm), uitlezen met AI (leverancier, datum, bedrag, btw), controleren, boeken.
- `expenses` worden terugkerende aankoopboekingen (LeadSnap, Lovable, Vercel, …) — sluit aan op Fase 5 "Cost control" van de Hub-upgrade.
- Optioneel: aankoopfacturen via Peppol ontvangen (Riory's werkbonnen-app heeft hier al een plan voor).

### Fase C — Bank (Revolut Business) · deels ✅ (13/11/2026: afschrift Dec 2025–Nov 2026 geïmporteerd, regels, factuurkoppeling, CSV-import in de app; API-koppeling nog open)
- **Revolut Business API**, alleen-lezen (scope READ: geen betalingen mogelijk). Vereist het **Grow-plan of hoger** en instellen via de Revolut Business **web**app (Settings → APIs → Business API).
- Koppelen vanuit Hub OS: een adminpagina "Koppel Revolut" maakt zelf een sleutelpaar aan (private key blijft server-side in Vault), toont het publieke certificaat om in Revolut te plakken, en vangt de toestemming op via een redirect-URL. Access tokens (40 min) worden automatisch vernieuwd met de refresh token.
- Dagelijkse sync van alle rekeningen/valuta naar `bank_transactions` (max. 1000 per call → per periode pagineren).
- Webhook van Revolut voor nieuwe transacties (bijna realtime) als tweede stap.
- Andere banken: CSV/CODA-import.
- Automatisch koppelen aan facturen (bedrag + factuurnummer in mededeling) → factuur op **Paid**, herinneringen stoppen.
- Cashflow-overzicht en "wat staat er open".

### Fase D — Rapporten & export ("één knop")
- Knop **Rapport** → kies periode (maand/kwartaal/jaar) → PDF + Excel met: inkomsten, uitgaven (per categorie), winst, openstaande facturen, top-klanten, kosten per klant, websitestatistieken (uptime), en **vergelijking met de vorige periode en dezelfde periode vorig jaar**.
- Bijlagen (facturen, bonnetjes) als zip erbij, klaar om door te sturen.
- Resultatenrekening, balans, proef- en saldibalans, btw-overzicht per periode.
- Winst per klant (omzet − toegewezen kosten).
- Export voor de boekhouder: Excel/CSV per boekjaar + alle PDF's en bonnetjes als zip; importformaat van de gekozen software (bv. Xero/FreeAgent/QuickBooks).

### Fase E — Naleving
- Factuurnummering zonder gaten, chronologisch (repeats krijgen al hun nummer op de verzenddag).
- Bewaartermijnen: facturen en stukken minstens zo lang als de strengste van toepassing zijnde regel (VK/België), niet wissen maar archiveren.
- Peppol-verzending (UBL/Peppol BIS 3.0) als de boekhouder bevestigt dat het nodig of nuttig is.
- GDPR: klantgegevens alleen voor team, exports versleuteld.

## Beslissingen die eerst nodig zijn (met boekhouder)

1. **Waar wordt Solyn Global Ltd belast?** De Ltd is in het VK opgericht, maar wordt geleid vanuit Tongeren. Of er een Belgische vaste inrichting is, bepaalt welke btw-, Peppol- en vennootschapsregels gelden.
   - Peppol B2B-e-facturatie is sinds 1 januari 2026 verplicht voor in België gevestigde btw-plichtigen; buitenlandse bedrijven zonder vaste vestiging in België zijn vrijgesteld.
2. **Btw-registratie**: is de Ltd btw-geregistreerd (VK en/of België)? In het VK vraagt MTD for VAT digitale registers en aangifte via compatibele software.
3. **Filingsoftware/boekhouder**: sinds 1 april 2026 moeten jaarrekening en Company Tax Return via commerciële software ingediend worden; MTD voor vennootschapsbelasting komt er niet. → Hub OS levert de cijfers, de boekhouder/software dient in.
4. **Boekhoudmunt** (GBP of EUR) en **boekjaar** (einddatum van de Ltd).
5. **Rekeningschema**: standaard van de boekhouder overnemen, zodat de export 1-op-1 past.

## Volgorde

1. Beslissingen 1–5 met de boekhouder (blokkeert de rest).
2. Fase A (grootboek + automatische boekingen uit facturen en kosten).
3. Fase C (bank, automatisch "betaald") — grootste tijdwinst.
4. Fase B (aankopen + bonnetjes).
5. Fase D (rapporten + export) en Fase E (naleving) doorlopend.

Bronnen: Unizo, "E-facturatie: correct werken met Peppol" · Banqup, "Peppol gids 2026" · Spendesk, "Making Tax Digital for corporation tax" · Sleek, "MTD for Corporation Tax".
