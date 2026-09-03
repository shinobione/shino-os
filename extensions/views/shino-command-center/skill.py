from skills.base import SkillBase


class ShinoCommandCenterSkill(SkillBase):
    SYSTEM_PROMPT = (
        "Vue SHINO Command Center : cockpit principal SHINO-OS en plein écran.\n"
        "Afficher : show_view(action=\"show\", view_id=\"shino-command-center\").\n"
        "Masquer : show_view(action=\"hide\", view_id=\"shino-command-center\").\n"
        "Changer de contexte : show_view(action=\"view_command\", "
        "view_id=\"shino-command-center\", command=\"set_mode\", "
        "params={\"mode\": \"RISO|MUSIC|DEV|FILES|PC|SETTINGS\"}).\n"
        "Mettre à jour l'état visuel : show_view(action=\"view_command\", "
        "view_id=\"shino-command-center\", command=\"set_state\", "
        "params={\"state\": \"idle|listening|thinking|speaking|working|error\"})."
    )

    def get_tools(self) -> list:
        return []
