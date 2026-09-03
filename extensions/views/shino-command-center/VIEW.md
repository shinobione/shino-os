---
id: shino-command-center
name: SHINO Command Center
version: 0.2.0
author: shinobione
description: Interface SHINO-OS ultrawide 3440x1440, living core et cockpit Jarvis temps réel.
tags: [shino, command-center, ultrawide, system, ai]
glyph: SHO
commands:
  - action: set_state
    description: Change l'état visuel du Living Core
    params: { state: string }
  - action: set_mode
    description: Change le mode affiché
    params: { mode: string }
  - action: refresh
    description: Force un rafraîchissement des métriques
  - action: hide
    description: Ferme la vue
---

# SHINO Command Center

Vue plein écran SHINO-OS conçue pour un écran 3440×1440. Elle utilise le contrat natif `Jarvis.views` et lit les métriques système depuis l'API Jarvis quand elles sont disponibles.
