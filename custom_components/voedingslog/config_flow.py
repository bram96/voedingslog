"""Config flow for the Voedingslog integration."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN, DEFAULT_CALORIES_GOAL, DEFAULT_SODIUM_GOAL_MG


class VoedingslogConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for Voedingslog."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            persons_raw = user_input.get("personen", "Persoon 1")
            persons = [p.strip() for p in persons_raw.split(",") if p.strip()]
            if not persons:
                errors["personen"] = "Vul minimaal één persoon in"
            else:
                return self.async_create_entry(
                    title="Voedingslog",
                    data={
                        "personen": persons,
                        "doel_calorieen": user_input["doel_calorieen"],
                        "doel_natrium_mg": user_input["doel_natrium_mg"],
                    },
                )

        schema = vol.Schema(
            {
                vol.Required("personen", default="Persoon 1"): str,
                vol.Required("doel_calorieen", default=DEFAULT_CALORIES_GOAL): int,
                vol.Required("doel_natrium_mg", default=DEFAULT_SODIUM_GOAL_MG): int,
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
    """Options flow for adjusting settings after installation."""

    def __init__(self, config_entry):
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            persons = [p.strip() for p in user_input["personen"].split(",") if p.strip()]
            return self.async_create_entry(
                title="",
                data={
                    "personen": persons,
                    "doel_calorieen": user_input["doel_calorieen"],
                    "doel_natrium_mg": user_input["doel_natrium_mg"],
                    "ai_task_entity": user_input.get("ai_task_entity", ""),
                },
            )

        current = self._config_entry.data
        options = self._config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    "personen",
                    default=",".join(current.get("personen", ["Persoon 1"])),
                ): str,
                vol.Required(
                    "doel_calorieen",
                    default=current.get("doel_calorieen", DEFAULT_CALORIES_GOAL),
                ): int,
                vol.Required(
                    "doel_natrium_mg",
                    default=current.get("doel_natrium_mg", DEFAULT_SODIUM_GOAL_MG),
                ): int,
                vol.Optional(
                    "ai_task_entity",
                    default=options.get("ai_task_entity", ""),
                ): str,
            }
        )

        return self.async_show_form(step_id="init", data_schema=schema)
