"""DataCoördinator voor Voedingslog — beheert dagelijkse logs per persoon."""
from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN, NUTRIENTEN
from .open_food_facts import zoek_op_barcode, zoek_op_naam

_LOGGER = logging.getLogger(__name__)

LEGE_TOTALEN = {k: 0.0 for k in NUTRIENTEN}


class VoedingslogCoordinator(DataUpdateCoordinator):
    """Houdt dagelijkse voedingslogs bij voor alle personen."""

    def __init__(self, hass: HomeAssistant, personen: list[str]):
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
        )
        self.personen = personen
        # { "Jan": { "2024-01-15": [ {naam, gram, nutrienten}, ... ] } }
        self._logs: dict[str, dict[str, list]] = {p: {} for p in personen}
        self._session: aiohttp.ClientSession | None = None

    async def _async_update_data(self) -> dict:
        """Bereken totalen voor vandaag voor alle personen."""
        vandaag = str(date.today())
        resultaat = {}
        for persoon in self.personen:
            items = self._logs[persoon].get(vandaag, [])
            totalen = {k: 0.0 for k in NUTRIENTEN}
            for item in items:
                gram_factor = item["gram"] / 100.0
                for nutrient in NUTRIENTEN:
                    waarde = item["nutrienten"].get(nutrient, 0.0)
                    totalen[nutrient] += waarde * gram_factor
            resultaat[persoon] = {
                "totalen": totalen,
                "log": items,
                "datum": vandaag,
            }
        return resultaat

    # ------------------------------------------------------------------
    # Publieke methoden (aangeroepen vanuit services)
    # ------------------------------------------------------------------

    async def log_barcode(self, persoon: str, barcode: str, gram: float | None = None):
        """Zoek product op barcode en log het."""
        session = await self._get_session()
        product = await zoek_op_barcode(session, barcode)
        if not product:
            _LOGGER.warning("Barcode %s niet gevonden", barcode)
            return False
        await self._voeg_toe(persoon, product, gram or product["portie_g"])
        return True

    async def log_product_naam(self, persoon: str, naam: str, gram: float = 100):
        """Zoek product op naam en log het eerste resultaat."""
        session = await self._get_session()
        resultaten = await zoek_op_naam(session, naam)
        if not resultaten:
            _LOGGER.warning("Product '%s' niet gevonden", naam)
            return False
        await self._voeg_toe(persoon, resultaten[0], gram)
        return True

    async def log_handmatig(
        self,
        persoon: str,
        naam: str,
        gram: float,
        nutrienten: dict[str, float],
    ):
        """Log een product met handmatig ingevoerde waarden."""
        product = {"naam": naam, "portie_g": gram, "nutrienten": nutrienten}
        await self._voeg_toe(persoon, product, gram)

    async def verwijder_laatste(self, persoon: str):
        """Verwijder het laatste item uit de log van vandaag."""
        vandaag = str(date.today())
        log = self._logs[persoon].get(vandaag, [])
        if log:
            verwijderd = log.pop()
            _LOGGER.info("Verwijderd: %s voor %s", verwijderd["naam"], persoon)
            await self.async_refresh()

    async def reset_dag(self, persoon: str, dag: str | None = None):
        """Wis de log voor een dag (standaard: vandaag)."""
        dag = dag or str(date.today())
        self._logs[persoon][dag] = []
        await self.async_refresh()

    async def zoek_producten(self, naam: str) -> list[dict]:
        """Zoek producten op naam, voor gebruik in notificaties/automations."""
        session = await self._get_session()
        return await zoek_op_naam(session, naam)

    def get_log_vandaag(self, persoon: str) -> list[dict]:
        """Geef de log van vandaag voor een persoon."""
        return self._logs[persoon].get(str(date.today()), [])

    # ------------------------------------------------------------------
    # Intern
    # ------------------------------------------------------------------

    async def _voeg_toe(self, persoon: str, product: dict, gram: float):
        if persoon not in self._logs:
            _LOGGER.error("Onbekende persoon: %s", persoon)
            return
        vandaag = str(date.today())
        if vandaag not in self._logs[persoon]:
            self._logs[persoon][vandaag] = []
        self._logs[persoon][vandaag].append(
            {
                "naam": product["naam"],
                "gram": gram,
                "nutrienten": product["nutrienten"],
                "tijdstip": datetime.now().strftime("%H:%M"),
            }
        )
        _LOGGER.info("Gelogd: %s (%.0fg) voor %s", product["naam"], gram, persoon)
        await self.async_refresh()

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"User-Agent": "HomeAssistant-Voedingslog/1.0"}
            )
        return self._session

    async def async_shutdown(self):
        if self._session and not self._session.closed:
            await self._session.close()
