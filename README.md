# Voedingslog — Home Assistant Custom Component

Houd calorieën, macronutriënten, vezels, zout en vitamines bij per persoon.
Data komt van **Open Food Facts** — gratis, open database met miljoenen producten inclusief Nederlandse supermarktproducten.

### Features

- **Sidebar panel** — eigen pagina met dagoverzicht per maaltijd (ontbijt, lunch, avondeten, tussendoor)
- **Product zoeken** — zoek lokaal in je cache of online in Open Food Facts, met favorieten
- **Barcode scanner** — scan producten met je camera of voer de barcode handmatig in
- **Foto-analyse** — maak een foto van het voedingsetiket, AI leest de waarden uit en je kunt ze controleren
- **Batch toevoegen** — beschrijf wat je gegeten hebt in tekst, of maak een foto van een handgeschreven lijst. AI herkent de producten, zoekt voedingswaarden op in Open Food Facts, en je valideert ze één voor één
- **Handmatig invoeren** — voer zelf een product in met alle voedingswaarden
- **Custom maaltijden** — sla recepten op met ingrediënten, portiegrootte, en AI-ondersteunde ingrediëntinvoer
- **Ingrediënten bewerken** — pas naam, gewicht en alle voedingswaarden per ingrediënt aan
- **Meerdere personen** — elke persoon is een aparte integratie-instantie met eigen doelen en data
- **Persoon wisselen** — schakel tussen personen via tabs, standaard geselecteerd op basis van je HA-account
- **Datum navigatie** — blader door dagen met pijltjes of kies een datum
- **Bewerken** — tik op een item om naam, gewicht, maaltijd, datum en alle voedingswaarden aan te passen
- **Dagdetails** — taartdiagram met macro-verdeling, voortgangsbalken per doel, alle voedingswaarden
- **Exporteren** — exporteer je dag als PNG afbeelding, download of deel via je telefoon
- **Lokale cache** — eerder gebruikte producten worden lokaal opgeslagen voor sneller zoeken
- **Favorieten** — markeer producten als favoriet voor snelle toegang
- **Persistentie** — alle data wordt meegenomen in HA backups
- **HA Sensoren** — alle voedingswaarden beschikbaar als sensoren voor automations en dashboards

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

Na installatie verschijnt **Voedingslog** automatisch in de sidebar. Het panel biedt:

- **Dagoverzicht** gegroepeerd per maaltijd (ontbijt, lunch, avondeten, tussendoor)
- **Dagtotalen** met voortgangsbalk voor calorieën en macro-overzicht (eiwit, koolhydraten, vet, vezels)
- **Datum navigatie** — pijltjes om door dagen te bladeren, tik op de datum om te kiezen
- **2 acties** om voeding toe te voegen:
  - **Zoek product** — zoek in cache/OFF, scan barcode, of voer handmatig in (inclusief foto etiket via AI)
  - **Batch toevoegen** — typ wat je gegeten hebt of maak een foto van een handgeschreven lijst. AI herkent producten, zoekt echte voedingswaarden op, en je valideert ze één voor één
- **Maaltijden** — beheer en log opgeslagen recepten vanuit het dagoverzicht
- **Dagdetails** — tik op de dagtotalen voor een taartdiagram, alle voedingswaarden, en exporteer als afbeelding
- **Bewerken** — tik op een item om naam, gewicht, maaltijdcategorie, datum en alle voedingswaarden aan te passen
- **Verwijderen** — tik op het kruisje (met bevestiging)
- **Portie presets** — kies uit portiegroottes van Open Food Facts of je eigen recepten

### AI instellen

1. Zorg dat je een AI integratie hebt met AI Task support (bijv. OpenAI, Google AI, Claude)
2. Ga naar **Instellingen → Apparaten & Diensten → Voedingslog → Opties**
3. Kies je AI Task entity in de dropdown
4. De AI-functies worden nu actief:
   - **Foto etiket** — AI leest voedingswaarden van een etiketfoto (gestructureerde output)
   - **Batch toevoegen (tekst)** — typ "2 boterhammen met kaas, een appel" → AI herkent producten → voedingswaarden uit Open Food Facts
   - **Batch toevoegen (foto)** — maak een foto van een handgeschreven lijst → OCR + productherkenning
   - **AI ingrediënten** — in de maaltijdeditor, typ ingrediënten en AI zoekt ze op

### Custom Maaltijden

Sla recepten op die je vaak eet:

1. Tik op **Maaltijden** in het dagoverzicht → **Nieuwe maaltijd**
2. Geef een naam (bijv. "Macaroni")
3. Voeg ingrediënten toe via **Ingrediënt zoeken** (opent het productzoekscherm) of **AI ingrediënten invoer**
4. Pas per ingrediënt het gewicht en de voedingswaarden aan (tik op het potlood)
5. Stel een standaard portie in (bijv. 400g)
6. Tik op **Opslaan**

Volgende keer: tik op het recept in de maaltijdenlijst → gewicht is al ingevuld → **Toevoegen**

---

## Sensoren

Per persoon worden automatisch deze sensoren aangemaakt:

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
| `sensor.voedingslog_jan_vitamine_d` | µg |
| `sensor.voedingslog_jan_log_vandaag` | items |

Sensoren voor `doel`, `resterend` en `percentage` zitten als attribuut op calorieën en natrium.

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

### `voedingslog.reset_dag`
Wis de log voor vandaag (of een specifieke dag).

```yaml
service: voedingslog.reset_dag
data:
  persoon: "Jan"
  dag: "2026-03-25"          # optioneel
```

### `voedingslog.verwijder_laatste`
Verwijder het laatst gelogde item.

```yaml
service: voedingslog.verwijder_laatste
data:
  persoon: "Jan"
```

---

## Automatisch resetten om middernacht

```yaml
automation:
  alias: "Voedingslog reset om middernacht"
  trigger:
    - platform: time
      at: "00:00:00"
  action:
    - service: voedingslog.reset_dag
      data:
        persoon: "Jan"
    - service: voedingslog.reset_dag
      data:
        persoon: "Lisa"
```

---

## Dashboard voorbeeld (Lovelace)

```yaml
type: entities
title: Voeding vandaag – Jan
entities:
  - entity: sensor.voedingslog_jan_calorieen
    name: Calorieën
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
| `.storage/voedingslog.logs` | Dagelijkse voedingslogs per persoon |
| `.storage/voedingslog.meals` | Custom maaltijden (recepten) |
| `.storage/voedingslog.products` | Lokale product cache |

---

## Vereisten

- Home Assistant 2024.5.0 of hoger
- **HTTPS vereist** voor barcode scanner en camera (anders werkt getUserMedia niet)
- Optioneel: AI Task integratie voor foto-analyse, batch toevoegen en AI ingrediënten (OpenAI, Google AI, Claude)
