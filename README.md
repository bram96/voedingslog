# Voedingslog — Home Assistant Custom Component

> **Let op:** Deze custom component is volledig gegenereerd door een LLM (Large Language Model). Alle code — Python backend, TypeScript frontend, tests en documentatie — is geschreven door AI.

Een uitgebreide voedingstracker die draait als sidebar panel in Home Assistant. Houd calorieen, macronutrienten, vezels, vitamines en mineralen bij voor meerdere personen. Producten komen uit **Open Food Facts** — een gratis, open database met miljoenen producten inclusief Nederlandse supermarktproducten.

De app combineert slimme zoekfuncties, barcode scanning, AI-gestuurde herkenning en persoonlijke voedingsanalyse in een mobiel-vriendelijke interface die naadloos integreert met je Home Assistant setup.

---

## Wat kan het?

### Snel en slim loggen

Log je maaltijden op meerdere manieren. Zoek producten met fuzzy search ("brood kaas" vindt producten met beide woorden), scan een barcode met je camera, of laat AI je tekst interpreteren ("2 boterhammen met kaas, een appel"). Recent gelogde producten staan bovenaan voor snel opnieuw loggen. Tik op de grammen van een gelogd item om direct het gewicht aan te passen — geen extra schermen nodig.

Op mobiel veeg je links en rechts om tussen dagen te navigeren, of trek je omlaag om te verversen. Verwijder je per ongeluk iets? Een undo-knop verschijnt onderaan het scherm.

### Producten en recepten beheren

Alle producten en recepten zitten in een overzicht met zoeken, favorieten en type filters. Er zijn twee soorten recepten: **vast** (zoals pasta bolognese — je logt een portie van het geheel) en **samengesteld** (zoals je standaard ontbijt — losse onderdelen waarvan je per keer het gewicht aanpast).

Ingredienten in recepten verwijzen naar producten. Wijzig je de voedingswaarden van een basisproduct, dan worden alle recepten die het gebruiken automatisch bijgewerkt. Producten kunnen aliassen hebben voor betere zoekresultaten, en ongebruikte producten worden gemarkeerd zodat je ze kunt opruimen.

### Inzichten en trends

Tik op de dagtotalen voor een gedetailleerd overzicht. Schakel tussen dag (taartdiagram met macroverdeling), week en maand (staafdiagrammen met doellijnen en trendlijnen). Elke modus heeft navigatiepijltjes. Een macro ratio balk toont de verhouding eiwit/koolhydraten/vet/vezels als percentages, en een streak tracker laat zien hoeveel dagen je achter elkaar hebt gelogd.

Gemiddelden worden berekend over afgeronde dagen — lege dagen en de huidige (onvolledige) dag worden uitgesloten zodat je een eerlijk beeld krijgt.

### AI-gestuurde functies

Met een AI Task integratie (OpenAI, Google AI of Claude) krijg je extra mogelijkheden:

- **Foto van etiket** — AI leest voedingswaarden van een etiketfoto
- **Bulk toevoegen** — typ wat je gegeten hebt of maak een foto van een handgeschreven lijst
- **Daganalyse** — persoonlijke review die trends over de afgelopen week analyseert en verbeteringen voorstelt voor terugkerende maaltijden ("Je eet elke ochtend alleen brood — voeg yoghurt toe voor extra eiwit")
- **Voedingsadvies** — bij tekorten suggereert AI producten uit je database die passen binnen je doelen, plus aanvullende ideeen
- **Slimme aliassen** — AI-herkende namen worden automatisch opgeslagen, en bij onbekende producten stelt AI het dichtstbijzijnde product voor

### Meerdere personen

Elke persoon is een aparte integratie-instantie met eigen doelen en data. Schakel tussen personen via tabs in de header (zoals HA dashboard tabs). Recepten worden gedeeld tussen alle personen.

### Home Assistant integratie

Alle voedingswaarden zijn beschikbaar als HA sensoren (dagwaarden en weekgemiddelden) voor gebruik in automations en dashboards. Alle data zit in `.storage/` en is onderdeel van HA backups.

---

## Installatie via HACS (aanbevolen)

1. Open **HACS** in Home Assistant
2. Klik op de drie puntjes rechtsboven → **Aangepaste opslagplaatsen**
3. Voeg toe:
   - **URL:** `https://github.com/bram96/voedingslog`
   - **Categorie:** Integratie
4. Klik **Toevoegen**, zoek op **Voedingslog** en klik **Downloaden**
5. Herstart Home Assistant
6. Ga naar **Instellingen → Apparaten & Diensten → Integratie toevoegen**
7. Zoek op **Voedingslog** en volg de stappen
8. Herhaal stap 6-7 voor elke persoon (elke persoon is een aparte integratie)

## Handmatige installatie

1. Kopieer de map `custom_components/voedingslog/` naar je HA config map:
   ```
   /config/custom_components/voedingslog/
   ```
2. Herstart Home Assistant
3. Ga naar **Instellingen → Apparaten & Diensten → Integratie toevoegen**
4. Zoek op **Voedingslog** en volg de stappen

---

## AI instellen

1. Zorg dat je een AI integratie hebt met AI Task support (bijv. OpenAI, Google AI, Claude)
2. Ga naar **Instellingen → Apparaten & Diensten → Voedingslog → Opties**
3. Kies je AI Task entity in de dropdown

Alle AI-functies werken ook zonder — je kunt altijd handmatig zoeken, scannen en invoeren.

---

## Sensoren

Per persoon worden automatisch sensoren aangemaakt voor alle 12 nutrienten (calorieen, vetten, koolhydraten, eiwitten, suikers, vezels, natrium, vitamine C, calcium, ijzer, vitamine D) plus een logoverzicht.

Daarnaast weekgemiddelden en -totalen per nutrient (bijv. `sensor.voedingslog_jan_week_avg_calorieen`).

Sensoren voor `doel`, `resterend` en `percentage` zitten als attribuut op calorieen.

---

## Services

```yaml
# Log een product via barcode
service: voedingslog.log_barcode
data:
  persoon: "Jan"
  barcode: "8710400301929"
  gram: 30                   # optioneel
  category: "breakfast"      # optioneel

# Log een product via naam (zoekt in Open Food Facts)
service: voedingslog.log_product
data:
  persoon: "Lisa"
  naam: "hagelslag melk"
  gram: 20

# Verwijder het laatst gelogde item
service: voedingslog.delete_last
data:
  persoon: "Jan"
```

---

## Dashboard voorbeeld

```yaml
type: entities
title: Voeding vandaag - Jan
entities:
  - entity: sensor.voedingslog_jan_calorieen
    name: Calorieen
  - entity: sensor.voedingslog_jan_vetten
  - entity: sensor.voedingslog_jan_koolhydraten
  - entity: sensor.voedingslog_jan_eiwitten
  - entity: sensor.voedingslog_jan_vezels
  - entity: sensor.voedingslog_jan_log_vandaag
    name: Gelogde items
```

---

## Data opslag

Alle data wordt bewaard in de HA `.storage/` map en is onderdeel van HA backups:

| Bestand | Inhoud |
|---------|--------|
| `.storage/voedingslog.logs.<entry_id>` | Dagelijkse voedingslogs per persoon |
| `.storage/voedingslog.products_v2` | Producten, recepten, aliassen, barcodes |

---

## Ontwikkeling

```bash
make setup    # venv + deps + pre-commit hook
make test     # 174 tests (Python + TypeScript + E2E)
make build    # frontend bundlen
```

De codebase heeft 174 geautomatiseerde tests: 99 Python backend tests (73 coordinator + 26 Open Food Facts), 30 TypeScript unit tests voor berekeningen, en 45 E2E component tests die het daadwerkelijke panel renderen in jsdom en gebruikersinteracties simuleren. Een pre-commit hook runt alle tests automatisch voor elke commit.

---

## Vereisten

- Home Assistant 2024.5.0 of hoger
- **HTTPS vereist** voor barcode scanner en camera
- Optioneel: AI Task integratie (OpenAI, Google AI, Claude) voor foto-analyse, bulk toevoegen, daganalyse en voedingsadvies
