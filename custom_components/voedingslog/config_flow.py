"""Config flow voor Voedingslog integratie."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN, DEFAULT_CALORIEEN, DEFAULT_NATRIUM_MG


class VoedingslogConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow voor Voedingslog."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            personen_raw = user_input.get("personen", "Persoon 1")
            personen = [p.strip() for p in personen_raw.split(",") if p.strip()]
            if not personen:
                errors["personen"] = "Vul minimaal één persoon in"
            else:
                return self.async_create_entry(
                    title="Voedingslog",
                    data={
                        "personen": personen,
                        "doel_calorieen": user_input["doel_calorieen"],
                        "doel_natrium_mg": user_input["doel_natrium_mg"],
                    },
                )

        schema = vol.Schema(
            {
                vol.Required("personen", default="Persoon 1"): str,
                vol.Required("doel_calorieen", default=DEFAULT_CALORIEEN): int,
                vol.Required("doel_natrium_mg", default=DEFAULT_NATRIUM_MG): int,
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "voorbeeld": "Jan,Lisa,Thomas"
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return VoedingslogOptionsFlow(config_entry)


class VoedingslogOptionsFlow(config_entries.OptionsFlow):
    """Opties aanpassen na installatie."""

    def __init__(self, config_entry):
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            personen = [p.strip() for p in user_input["personen"].split(",") if p.strip()]
            return self.async_create_entry(
                title="",
                data={
                    "personen": personen,
                    "doel_calorieen": user_input["doel_calorieen"],
                    "doel_natrium_mg": user_input["doel_natrium_mg"],
                },
            )

        huidig = self._config_entry.data
        schema = vol.Schema(
            {
                vol.Required(
                    "personen",
                    default=",".join(huidig.get("personen", ["Persoon 1"])),
                ): str,
                vol.Required(
                    "doel_calorieen",
                    default=huidig.get("doel_calorieen", DEFAULT_CALORIEEN),
                ): int,
                vol.Required(
                    "doel_natrium_mg",
                    default=huidig.get("doel_natrium_mg", DEFAULT_NATRIUM_MG),
                ): int,
            }
        )

        return self.async_show_form(step_id="init", data_schema=schema)
