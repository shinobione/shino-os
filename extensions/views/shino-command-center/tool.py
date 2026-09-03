"""Backend tool for the SHINO Command Center Jarvis view."""
from __future__ import annotations

from typing import Callable

from tools.base import Tool, ToolResult


class ShinoCommandCenterViewTool(Tool):
    name = "shino_command_center"
    description = """
    Affiche et contrôle l'interface principale SHINO-OS en plein écran.

    Utiliser quand l'utilisateur demande d'afficher SHINO-OS, le command center,
    le cockpit principal, l'état du système, ou veut changer l'état visuel du core.

    Actions :
    - show : affiche SHINO Command Center
    - hide : masque la vue
    - set_state : état visuel idle/listening/thinking/speaking/working/error
    - set_mode : libellé de mode RISO/MUSIC/DEV/FILES/PC/SETTINGS
    - refresh : rafraîchit immédiatement les métriques
    """

    def __init__(self, broadcast_event: Callable[[dict], None]) -> None:
        self._broadcast = broadcast_event

    async def execute(self, action: str, **kwargs) -> ToolResult:
        if action == "show":
            self._broadcast({
                "type": "show_view",
                "view_id": "shino-command-center",
                "params": kwargs,
            })
            return ToolResult(content="SHINO Command Center affiché.")

        if action == "hide":
            self._broadcast({"type": "hide_view", "view_id": "shino-command-center"})
            return ToolResult(content="SHINO Command Center masqué.")

        if action not in {"set_state", "set_mode", "refresh"}:
            return ToolResult(content=f"Action inconnue: {action}", is_error=True)

        self._broadcast({
            "type": "view_command",
            "view_id": "shino-command-center",
            "command": action,
            "params": kwargs,
        })
        return ToolResult(content=f"Commande SHINO '{action}' envoyée.")
