# Voedingslog — Home Assistant Custom Component

Houd calorieën, macronutriënten, zout en vitamines bij per persoon.
Data komt van **Open Food Facts** — gratis, open database met miljoenen producten inclusief Nederlandse supermarktproducten.

### Features

- **Sidebar panel** — eigen pagina met dagoverzicht per maaltijd (ontbijt, lunch, avondeten, tussendoor)
- **Barcode scanner** — scan producten met je camera via html5-qrcode (HTTPS vereist)
- **Foto-analyse** — maak een foto van het voedingsetiket, AI leest de waarden uit en je kunt ze controleren
- **Product zoeken** — zoek lokaal in je cache of online in Open Food Facts
- **Handmatig invoeren** — voer zelf een product in met alle voedingswaarden
- **Custom maaltijden** — sla recepten op (bijv. macaroni) met ingrediënten en portiegrootte
- **Meerdere personen** — schakel tussen personen via tabs
- **Datum navigatie** — blader door dagen met pijltjes of kies een datum
- **Bewerken** — tik op een item om gewicht, maaltijd of datum aan te passen
- **Lokale cache** — eerder gebruikte producten worden lokaal opgeslagen voor sneller zoeken
- **Persistentie** — alle data blijft bewaard na herstart
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
- **Dagtotalen** met voortgangsbalk voor calorieën en macro-overzicht
- **Datum navigatie** — pijltjes om door dagen te bladeren, tik op de datum om te kiezen
- **6 acties** om voeding toe te voegen:
  - **Scan barcode** — live camera scanner (html5-qrcode, HTTPS vereist)
  - **Zoek product** — zoekt eerst lokaal, daarna online met "Zoek online" knop
  - **Foto etiket** — maak een foto van het voedingsetiket, AI analyseert het, je controleert de waarden
  - **Maaltijden** — kies een opgeslagen recept en log het met de ingestelde portie
  - **Handmatig** — voer naam en alle macro's per 100g zelf in
- **Bewerken** — tik op een item om gewicht, maaltijdcategorie of datum aan te passen
- **Verwijderen** — tik op het kruisje (met bevestiging)
- **Portie presets** — kies uit portiegroottes van Open Food Facts of je eigen recepten

### AI Foto-analyse instellen

1. Zorg dat je een AI integratie hebt met AI Task support (bijv. OpenAI, Google AI, Claude)
2. Ga naar **Instellingen → Apparaten & Diensten → Voedingslog → Opties**
3. Kies je AI Task entity in de dropdown
4. De "Foto etiket" knop wordt nu actief in het panel
5. Na analyse opent het controlescherm waar je de herkende waarden kunt aanpassen

### Custom Maaltijden

Sla recepten op die je vaak eet:

1. Tik op **Maaltijden** → **Nieuwe maaltijd**
2. Geef een naam (bijv. "Macaroni")
3. Zoek en voeg ingrediënten toe met hun gewicht
4. Stel een standaard portie in (bijv. 400g)
5. Tik op **Opslaan**

Volgende keer: tik op **Maaltijden** → tik op het recept → gewicht is al ingevuld → **Toevoegen**

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
  - entity: sensor.voedingslog_jan_natrium_zout
  - entity: sensor.voedingslog_jan_log_vandaag
    name: Gelogde items
```

---

## Data opslag

Alle data wordt bewaard in de HA `.storage/` map:

| Bestand | Inhoud |
|---------|--------|
| `.storage/voedingslog.logs` | Dagelijkse voedingslogs per persoon |
| `.storage/voedingslog.meals` | Custom maaltijden (recepten) |
| `.storage/voedingslog.products` | Lokale product cache |

---

## Vereisten

- Home Assistant 2024.5.0 of hoger
- **HTTPS vereist** voor barcode scanner en camera (anders werkt getUserMedia niet)
- Optioneel: AI Task integratie voor foto-analyse (OpenAI, Google AI, Claude)
