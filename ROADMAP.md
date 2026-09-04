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
- Prochain gate : confirmer physiquement `CHATTERBOX V3 · STREAM`, puis barge-in
- Vision : caméra/MediaPipe/gestes Jarvis toujours présents upstream, à réexposer dans le cockpit SHINO
- Dernier bug prompt voix : regex `[voix]` trop fragile ; patch rendu résilient + smoke Windows ajouté
- Interruption immédiate en cours : nettoyage ciblé du disque C: avant poursuite des tests voix

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

Chatterbox worker:
http://127.0.0.1:8765
```

### Ce qui doit tourner

- `shino.bat run` : oui
- Ollama : oui actuellement
- Handy GUI : **non**
- Handy headless : lancé à la demande par SHINO
- Chatterbox worker : lancé automatiquement par SHINO après `tts-setup`
- Piper : aucun process manuel

## Reprise

```powershell
git pull
.\shino.bat run
```

Avant de demander un test physique, vérifier la CI du **commit exact**.

## Ne pas refaire

- ne pas revenir à faster-whisper Python : il avait pris ~147 s sur CPU ;
- ne pas demander d'ouvrir Handy GUI ;
- ne pas traiter le warning `ANTHROPIC_API_KEY` comme un bug du mode Ollama local ;
- ne pas confondre l'erreur LiveKit upstream avec le chemin voix SHINO actuel ;
- ne pas supprimer le runtime SHINO/Ollama/Handy/Chatterbox pendant le nettoyage disque ;
- ne pas reconstruire le cockpit depuis zéro : il existe déjà dans cette branche.

**Pour tout le reste — historique complet, décisions, architecture, paths, bugs résolus, roadmap priorisée, nettoyage disque en cours — lire la roadmap canonique sur `main`.**
