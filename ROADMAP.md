# SHINO-OS — ROADMAP / HANDOFF

> **La roadmap canonique complète est maintenue sur `main` :**  
> https://github.com/shinobione/shino-os/blob/main/ROADMAP.md

Cette branche contient le code réel de V0.2. Pour éviter que deux énormes roadmaps divergent, **ne considère pas une ancienne copie de roadmap dans cette branche comme source de vérité** : commence toujours par le document canonique ci-dessus, puis inspecte le head courant et la PR #2.

## État instantané de cette branche au 04/09/2026

- Branche : `integration/jarvis-upstream`
- PR : #2 — `V0.2 — Jarvis-powered SHINO-OS integration`
- Architecture : Jarvis OS upstream séparé + overlay SHINO
- Cockpit SHINO 3440×1440 : fonctionnel physiquement
- LLM : Ollama + `qwen3:8b-q4_K_M`
- STT : **VALIDÉ** — Handy headless + Whisper Large V3 Turbo Q8_0 + RTX 3060/Vulkan device 0
- TTS : Chatterbox Multilingual V3 installé avec `torch 2.6.0+cu124`, CUDA 12.4, RTX 3060 détectée, modèle préchargé
- Streaming TTS par phrases : implémenté
- Piper : fallback uniquement
- **Root cause Piper trouvé le 04/09/2026 :** le launcher Jarvis upstream tue explicitement tout listener sur le port `8765` dans `Stop-JarvisRuntime`. SHINO lançait Chatterbox sur ce même port avant de lancer Jarvis ; Jarvis le tuait donc après un warmup réussi. Chatterbox SHINO a été déplacé sur le port dédié **`18765`** sans modifier l'upstream.
- Test direct Chatterbox validé : CUDA + `reference.wav` + synthèse OK ; cold path ~49 s, synthèse chaude à mesurer après stabilisation.
- Prochain gate : confirmer physiquement `CHATTERBOX V3 · STREAM` sur `18765`, puis barge-in
- **Vision / CAM — P1 après voice gate :** réexposer la caméra Jarvis native dans le cockpit SHINO, réutiliser MediaPipe mains/visage/landmarks + Gesture Router + gestes existants (pointing, open palm, victory, thumbs, pinch volume, fists zoom/pan), puis YOLO objets. Ne pas réécrire MediaPipe depuis zéro.
- Dernier bug prompt voix : regex `[voix]` trop fragile ; patch rendu résilient + smoke Windows ajouté
- Nettoyage disque C: mis en pause ; ne pas mélanger ce chantier avec le gate voix.

## Runtime essentiel

```text
Repo:
C:\Users\jerry\OneDrive\Documenten\GitHub\shino-os

Jarvis runtime:
C:\Users\jerry\AppData\Local\SHINO-OS\runtime\jarvis-OS

Handy:
C:\Users\jerry\AppData\Local\Handy\handy.exe

Ollama:
http://localhost:11434

Chatterbox worker SHINO:
http://127.0.0.1:18765

IMPORTANT:
8765 = port nettoyé/réservé par le launcher Jarvis upstream ; ne plus l'utiliser pour un worker SHINO persistant.
```

### Ce qui doit tourner

- `shino.bat run` : oui
- Ollama : oui actuellement
- Handy GUI : **non**
- Handy headless : lancé à la demande par SHINO
- Chatterbox worker : lancé automatiquement par SHINO, résident sur `127.0.0.1:18765`
- Piper : aucun process manuel ; fallback seulement
- LiveKit : lancé par Jarvis upstream mais non requis pour le chemin voix SHINO actuel

## Reprise

```powershell
git pull
.\shino.bat run
```

Après `Jarvis pret`, le contrôle de survie Chatterbox est :

```powershell
Invoke-RestMethod "http://127.0.0.1:18765/health" | ConvertTo-Json -Depth 5
```

Le worker doit **toujours répondre après le démarrage complet de Jarvis**. Ensuite seulement faire le test micro et exiger `CHATTERBOX V3 · STREAM`.

Avant de demander un test physique, vérifier la CI du **commit exact**.

## Ne pas refaire

- ne pas revenir à faster-whisper Python : il avait pris ~147 s sur CPU ;
- ne pas demander d'ouvrir Handy GUI ;
- ne pas traiter le warning `ANTHROPIC_API_KEY` comme un bug du mode Ollama local ;
- ne pas confondre l'erreur LiveKit upstream avec le chemin voix SHINO actuel ;
- **ne jamais remettre Chatterbox sur `8765` tant que le pin Jarvis courant contient `Stop-JarvisRuntime` avec `8765` dans sa liste de ports à tuer ;**
- ne pas supprimer le runtime SHINO/Ollama/Handy/Chatterbox pendant un nettoyage disque ;
- ne pas reconstruire le cockpit depuis zéro : il existe déjà dans cette branche ;
- ne pas reconstruire la caméra/gestes depuis zéro : réutiliser le MediaPipe/Gesture Router upstream déjà présent.

**Pour tout le reste — historique complet, décisions, architecture, paths, bugs résolus, roadmap priorisée — lire la roadmap canonique sur `main`.**
