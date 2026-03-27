# Voedingslog — Home Assistant Custom Component

Houd calorieeen, macronutrienten, vezels, zout en vitamines bij per persoon.
Data komt van **Open Food Facts** — gratis, open database met miljoenen producten inclusief Nederlandse supermarktproducten.

---

## Features

### Dagelijks loggen
- **Sidebar panel** — eigen pagina met dagoverzicht per maaltijd (ontbijt, lunch, avondeten, tussendoor)
- **Product zoeken** — zoek lokaal in je opgeslagen producten of online in Open Food Facts, met favorieten en type filters
- **Barcode scanner** — scan producten met je camera of voer de barcode handmatig in. Barcodes worden lokaal opgeslagen zodat je ze maar een keer hoeft te scannen
- **Foto-analyse** — maak een foto van het voedingsetiket, AI leest de waarden uit en je kunt ze controleren
- **Bulk toevoegen** — beschrijf wat je gegeten hebt in tekst, of maak een foto van een handgeschreven lijst. AI herkent de producten, zoekt voedingswaarden op in Open Food Facts, en je valideert ze een voor een
- **Handmatig invoeren** — voer zelf een product in met alle voedingswaarden

### Producten en recepten
- **Unified product database** — alle producten en recepten in een beheerbaar overzicht met zoeken, favorieten en type filters (producten / recepten)
- **Twee soorten recepten**:
  - **Vast recept** (bijv. pasta bolognese) — ingredienten worden gemengd, je logt een portie van het geheel
  - **Samengesteld recept** (bijv. ontbijt) — losse onderdelen met standaard hoeveelheden, per keer aanpasbaar
- **Ingredienten refereren naar producten** — als je de voedingswaarden van een basisproduct wijzigt, worden alle recepten die het gebruiken automatisch bijgewerkt
- **Aliassen** — voeg alternatieve namen toe aan producten voor beter zoeken. AI-herkenning slaat automatisch aliassen op zodat herhaalde invoer sneller matcht
- **Lokale barcode cache** — eerder gescande barcodes worden herkend zonder internet
- **Opruimen** — verwijder producten die niet in logs of recepten voorkomen

### Personen en doelen
- **Meerdere personen** — elke persoon is een aparte integratie-instantie met eigen doelen en data
- **Persoon wisselen** — schakel tussen personen via tabs, standaard geselecteerd op basis van je HA-account
- **Calorie- en macrodoelen** — stel per persoon doelen in voor calorieen, eiwit, koolhydraten, vet en vezels

### Overig
- **Datum navigatie** — blader door dagen met pijltjes of kies een datum
- **Bewerken** — tik op een item om naam, gewicht, maaltijd, datum en alle voedingswaarden aan te passen
- **Dagdetails** — taartdiagram met macro-verdeling, voortgangsbalken per doel, alle voedingswaarden
- **Exporteren** — exporteer je dag als PNG afbeelding, download of deel via je telefoon
- **HA Sensoren** — alle voedingswaarden beschikbaar als sensoren voor automations en dashboards
- **Persistentie** — alle data wordt meegenomen in HA backups

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

## Sidebar Panel

Na installatie verschijnt **Voedingslog** automatisch in de sidebar.

### Actieknoppen

| Knop | Functie |
|------|---------|
| **Producten** | Beheer je producten en recepten — bewerken, verwijderen, aanmaken, opruimen |
| **Bulk toevoegen** | AI-gestuurde batch invoer via tekst of foto (vereist AI Task entity) |
| **Toevoegen** | Zoek en log een product — toont je opgeslagen producten met zoeken, favorieten, barcode, handmatig invoeren en online OFF zoeken |

### Producten beheren

- Tik op **Producten** voor het beheeroverzicht
- Filter op type (Alle / Producten / Recepten) en zoek op naam of alias
- Tik op een product om het te bewerken — pas naam, portie, voedingswaarden en aliassen aan
- Maak nieuwe producten of recepten aan
- **Opruimen** verwijdert producten die niet in logs of recepten voorkomen (favorieten en recepten blijven bewaard)

### Recepten

1. Tik op **Producten** → **Nieuw recept**
2. Kies het type:
   - **Vast recept** — ingredienten gemengd, log een portie van het geheel
   - **Samengesteld** — losse onderdelen met standaard hoeveelheden, per keer aanpasbaar
3. Voeg ingredienten toe via **Ingrediënt zoeken** (opent het zoekscherm met barcode en handmatig invoeren) of **AI ingrediënten invoer**
4. Stel een standaard portie in en sla op
5. Log het recept vanuit **Toevoegen** — bij samengestelde recepten kun je per onderdeel het gewicht aanpassen

### AI instellen

1. Zorg dat je een AI integratie hebt met AI Task support (bijv. OpenAI, Google AI, Claude)
2. Ga naar **Instellingen → Apparaten & Diensten → Voedingslog → Opties**
3. Kies je AI Task entity in de dropdown
4. De AI-functies worden nu actief:
   - **Foto etiket** — AI leest voedingswaarden van een etiketfoto (gestructureerde output)
   - **Bulk toevoegen (tekst)** — typ "2 boterhammen met kaas, een appel" → AI herkent producten → voedingswaarden uit Open Food Facts
   - **Bulk toevoegen (foto)** — maak een foto van een handgeschreven lijst → OCR + productherkenning
   - **AI ingrediënten** — in de recepteditor, typ ingredienten en AI zoekt ze op
   - **Automatische aliassen** — AI-herkende namen worden opgeslagen als alias voor snellere herkenning

---

## Dag-, week- en maandoverzicht

Tik op de dagtotalen om het overzicht te openen. Schakel tussen **Dag**, **Week** en **Maand**:

- **Dag** — taartdiagram met macro-verdeling, alle voedingswaarden, gelogde items, exporteren als afbeelding
- **Week** — staafdiagrammen per doelnutrient (calorieen, eiwit, etc.) met doellijn. Week begint op maandag.
- **Maand** — zelfde staafdiagrammen over de hele maand (1e tot laatste dag)

Elke modus heeft navigatiepijltjes om door periodes te bladeren. Dagnavigatie synchroniseert met het hoofdscherm.

Staven zijn groen als je onder je doel zit, rood als je erover gaat. Gemiddeld per dag wordt onder de grafieken getoond. Exporteer elke weergave als PNG afbeelding.

---

## Sensoren

Per persoon worden automatisch deze sensoren aangemaakt:

### Dagsensoren

| Sensor | Eenheid |
|--------|---------|
| `sensor.voedingslog_jan_calorieen` | kcal |
| `sensor.voedingslog_jan_vetten` | g |
| `sensor.voedingslog_jan_koolhydraten` | g |
| `sensor.voedingslog_jan_eiwitten` | g |
| `sensor.voedingslog_jan_suikers` | g |
| `sensor.voedingslog_jan_vezels` | g |
| `sensor.voedingslog_jan_natrium_zout` | mg |
| `sensor.voedingslog_jan_vitamine_c` | mg |
| `sensor.voedingslog_jan_calcium` | mg |
| `sensor.voedingslog_jan_ijzer` | mg |
| `sensor.voedingslog_jan_vitamine_d` | ug |
| `sensor.voedingslog_jan_log_vandaag` | items |

Sensoren voor `doel`, `resterend` en `percentage` zitten als attribuut op calorieen en natrium.

### Weeksensoren

Per nutrient ook een 7-daags gemiddelde en totaal:

| Sensor | Eenheid | Beschrijving |
|--------|---------|--------------|
| `sensor.voedingslog_jan_week_avg_calorieen` | kcal | Gemiddeld per dag (laatste 7 dagen) |
| `sensor.voedingslog_jan_week_total_calorieen` | kcal | Totaal (laatste 7 dagen) |

Dit geldt voor alle 12 nutrienten (calorieen, vetten, koolhydraten, eiwitten, etc.).

---

## Services

### `voedingslog.log_barcode`
Scan een barcode en log automatisch.

```yaml
service: voedingslog.log_barcode
data:
  persoon: "Jan"
  barcode: "8710400301929"
  gram: 30                   # optioneel
  category: "breakfast"      # optioneel (breakfast/lunch/dinner/snack)
```

### `voedingslog.log_product`
Zoek op naam en log het eerste resultaat.

```yaml
service: voedingslog.log_product
data:
  persoon: "Lisa"
  naam: "hagelslag melk"
  gram: 20
  category: "breakfast"      # optioneel
```

### `voedingslog.delete_last`
Verwijder het laatst gelogde item.

```yaml
service: voedingslog.delete_last
data:
  persoon: "Jan"
```

---

## Dashboard voorbeeld (Lovelace)

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
  - entity: sensor.voedingslog_jan_natrium_zout
  - entity: sensor.voedingslog_jan_log_vandaag
    name: Gelogde items
```

---

## Data opslag

Alle data wordt bewaard in de HA `.storage/` map en is onderdeel van HA backups:

| Bestand | Inhoud |
|---------|--------|
| `.storage/voedingslog.logs.<entry_id>` | Dagelijkse voedingslogs per persoon |
| `.storage/voedingslog.products_v2` | Unified product store — producten, recepten, aliassen, barcodes |

---

## Vereisten

- Home Assistant 2024.5.0 of hoger
- **HTTPS vereist** voor barcode scanner en camera (anders werkt getUserMedia niet)
- Optioneel: AI Task integratie voor foto-analyse, bulk toevoegen en AI ingredienten (OpenAI, Google AI, Claude)
