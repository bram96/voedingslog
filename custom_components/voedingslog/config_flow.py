"""Config flow for the Voedingslog integration."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DOMAIN, DEFAULT_CALORIES_GOAL


class VoedingslogConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for Voedingslog."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            persons_raw = user_input.get("persons", "Persoon 1")
            persons = [p.strip() for p in persons_raw.split(",") if p.strip()]
            if not persons:
                errors["persons"] = "Vul minimaal één persoon in"
            else:
                return self.async_create_entry(
                    title="Voedingslog",
                    data={
                        "personen": persons,
                        "doel_calorieen": user_input["calories_goal"],
                    },
                )

        schema = vol.Schema(
            {
                vol.Required("persons", default="Persoon 1"): str,
                vol.Required("calories_goal", default=DEFAULT_CALORIES_GOAL): int,
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
            persons = [p.strip() for p in user_input["persons"].split(",") if p.strip()]
            return self.async_create_entry(
                title="",
                data={
                    "personen": persons,
                    "doel_calorieen": user_input["calories_goal"],
                    "ai_task_entity": user_input.get("ai_task_entity", ""),
                    "carbs_goal": user_input.get("carbs_goal", 0),
                    "protein_goal": user_input.get("protein_goal", 0),
                    "fat_goal": user_input.get("fat_goal", 0),
                    "fiber_goal": user_input.get("fiber_goal", 0),
                },
            )

        current = self._config_entry.data
        options = self._config_entry.options
        opts = {**current, **options}
        schema = vol.Schema(
            {
                vol.Required(
                    "persons",
                    default=",".join(current.get("personen", ["Persoon 1"])),
                ): str,
                vol.Required(
                    "calories_goal",
                    default=opts.get("doel_calorieen", DEFAULT_CALORIES_GOAL),
                ): int,
                vol.Optional(
                    "carbs_goal",
                    default=opts.get("carbs_goal", 0),
                ): int,
                vol.Optional(
                    "protein_goal",
                    default=opts.get("protein_goal", 0),
                ): int,
                vol.Optional(
                    "fat_goal",
                    default=opts.get("fat_goal", 0),
                ): int,
                vol.Optional(
                    "fiber_goal",
                    default=opts.get("fiber_goal", 0),
                ): int,
                vol.Optional(
                    "ai_task_entity",
                    default=opts.get("ai_task_entity", ""),
                ): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        domain="ai_task",
                        multiple=False,
                    )
                ),
            }
        )

        return self.async_show_form(step_id="init", data_schema=schema)
