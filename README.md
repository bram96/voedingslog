# Voedingslog — Home Assistant Custom Component

Houd calorieën, macronutriënten, zout en vitamines bij per persoon.
Data komt van **Open Food Facts** — gratis, open database met miljoenen producten inclusief Nederlandse supermarktproducten.

### Features
- **Eigen pagina in de sidebar** met dagoverzicht per maaltijd (ontbijt, lunch, avondeten, tussendoor)
- **Barcode scanner** — scan producten direct met je camera
- **Foto-analyse** — maak een foto van het voedingsetiket en laat AI de waarden uitlezen (via HA AI Task)
- **Meerdere personen** — schakel eenvoudig tussen personen via tabs
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
- **Barcode scanner** — tik op "Scan barcode" om een product te scannen met je camera
- **Product zoeken** — zoek op naam in de Open Food Facts database
- **Foto van etiket** — maak een foto van het voedingsetiket, AI leest de waarden uit
- **Gewicht invoeren** — na scannen/zoeken voer je het gewicht in gram in
- **Maaltijd kiezen** — wordt automatisch ingesteld op basis van het tijdstip

### AI Foto-analyse instellen

1. Zorg dat je een AI integratie hebt met AI Task support (bijv. OpenAI, Google AI, Claude)
2. Ga naar **Instellingen → Apparaten & Diensten → Voedingslog → Opties**
3. Vul het `ai_task_entity` veld in met je AI Task entity ID (bijv. `ai_task.openai`)
4. De "Foto etiket" knop wordt nu actief in het panel

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
  barcode: "8710400301929"   # bijv. AH crackers
  gram: 30                   # optioneel, anders portiegrootte uit database
```

### `voedingslog.log_product`
Zoek op naam en log het eerste resultaat.

```yaml
service: voedingslog.log_product
data:
  persoon: "Lisa"
  naam: "hagelslag melk"
  gram: 20
```

### `voedingslog.reset_dag`
Wis de log voor vandaag (of een specifieke dag).

```yaml
service: voedingslog.reset_dag
data:
  persoon: "Jan"
```

### `voedingslog.verwijder_laatste`
Verwijder het laatst gelogde item.

```yaml
service: voedingslog.verwijder_laatste
data:
  persoon: "Jan"
```

---

## Companion App — Barcode scannen

Maak een automation die de barcode scanner van de companion app gebruikt:

```yaml
alias: "Voeding scannen – Jan"
trigger:
  - platform: event
    event_type: mobile_app_notification_action
    event_data:
      action: SCAN_BARCODE_JAN
action:
  - service: voedingslog.log_barcode
    data:
      persoon: "Jan"
      barcode: "{{ trigger.event.data.reply_text }}"
```

Of via een knop in het dashboard die de barcode scanner opent via de companion app URI:
```
homeassistant://navigate/lovelace/voeding
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

Of met een gauge card voor calorieën:

```yaml
type: gauge
entity: sensor.voedingslog_jan_calorieen
name: Calorieën Jan
min: 0
max: 2000
needle: true
severity:
  green: 0
  yellow: 1600
  red: 1900
```

---

## Notificaties

De component stuurt automatisch een notificatie na het loggen via de companion app.
Pas in `__init__.py` de service naam aan naar jouw apparaat:

```python
"mobile_app_iphone_jan"   # of mobile_app_pixel_lisa etc.
```

Vind jouw apparaatnaam via **Instellingen → Companion App → Apparaatnaam**.
