# SHINO-OS — Roadmap exhaustive

> État de référence : **2026-09-04**  
> Branche de travail : `integration/jarvis-upstream`  
> PR active : **#2 — V0.2 — Jarvis-powered SHINO-OS integration** (DRAFT)  
> Repo : `https://github.com/shinobione/shino-os`

---

## 0. Vision du projet

SHINO-OS doit devenir un **assistant personnel local-first façon JARVIS**, visuellement pensé pour un écran ultrawide 3440×1440, mais reposant sur un vrai moteur d'agent plutôt que sur une simple démo HUD.

Architecture cible :

```text
SHINO-OS
├─ identité / cockpit 3440×1440 / UX
├─ voix locale
├─ vision + gestes
├─ mémoire / missions / proactivité
├─ skills personnels
│  ├─ RISO
│  ├─ SHINOBIWAN / musique
│  ├─ DEV / GitHub
│  ├─ fichiers / PC
│  └─ automatisations personnelles
└─ orchestration hardware local/LAN

                ↓ overlay

Jarvis OS upstream
├─ FastAPI
├─ kernel / mémoire
├─ missions
├─ permissions / gouvernance
├─ outils
├─ WebSocket
├─ vision
├─ TTS
├─ skills / views
└─ shell runtime

                ↓ IA locale

Ollama / Qwen + Handy / Whisper + Piper
```

Principe permanent : **ne pas forker inutilement Jarvis OS**. Garder Jarvis comme runtime upstream séparé et SHINO-OS comme overlay maintenable.

---

# 1. État actuel — ce qui fonctionne réellement

## 1.1 Runtime / launcher

### ✅ Fonctionnel

- `shino.bat` / `shino.ps1` lancent le runtime Jarvis.
- Jarvis est cloné hors OneDrive dans :
  - `%LOCALAPPDATA%\SHINO-OS\runtime\jarvis-OS`
- Le repo SHINO peut rester dans OneDrive.
- Runtime upstream épinglé via `UPSTREAM.lock`.
- `shino.bat setup` fonctionne avec le bundle Windows officiel Jarvis.
- `shino.bat status` fonctionne en detached HEAD.
- Si le port configuré est occupé, SHINO choisit automatiquement un autre port libre.
- Les extensions SHINO sont synchronisées dans le runtime avant lancement.
- CI Windows vérifie le parsing PowerShell et plusieurs smoke tests runtime.

### ⚠️ À améliorer

- Détection/gestion automatique d'Ollama par le launcher.
- Doctor SHINO spécifique : vérifier Handy, modèle STT, Ollama, modèle Qwen, Piper, caméra, GPU, espace disque.
- Afficher clairement l'URL finale quand le port bascule de 8000 vers 8001/8002.
- Commande `shino.bat stop` propre.
- Commande `shino.bat restart`.
- Commande `shino.bat doctor-shino` / diagnostic complet.

---

## 1.2 Cockpit SHINO 3440×1440

### ✅ Fonctionnel / validé physiquement

- Shell SHINO visible sur le vrai écran 3440×1440.
- Vraie sphère/orbe Three.js du Jarvis upstream réutilisée au centre.
- États visuels :
  - IDLE
  - LISTENING
  - THINKING
  - SPEAKING
  - ERROR/OFFLINE
- Télémétrie réelle : CPU / RAM / disque.
- État Jarvis / SHINO / orb.
- Dock contextuel :
  - RISO
  - MUSIC
  - DEV
  - FILES
  - PC
  - SETTINGS
- Chat réel connecté à Jarvis/Qwen.
- Navigation ramenée à un seul shell Jarvis + iframe interne pour éviter les doubles routeurs.
- Retour HOME globalement stabilisé.

### ⚠️ Reste à polir

- Navigation encore à surveiller sur plusieurs dizaines de cycles.
- Responsive secondaire : 2560×1440 / 1920×1080.
- Meilleur usage des zones vides du cockpit.
- Barre de navigation secondaire à finir visuellement.
- États de connexion plus explicites.
- Éviter tout texte/faux statut qui ne vient pas d'une vraie source.
- Réintroduire caméra/vision dans le cockpit SHINO.
- Notifications plus propres et journal d'événements consultable.

---

## 1.3 LLM local

### ✅ Fonctionnel

- Ollama installé sur le PC principal.
- URL actuelle : `http://localhost:11434`.
- Modèle utilisé : `qwen3:8b-q4_K_M`.
- Qwen répond déjà via le pipeline réel Jarvis.
- Le chat SHINO utilise `/api/voice/generate` avec session continue.

### ⚠️ À faire

- Mesurer latence token-to-first-token et tokens/s.
- Tester Qwen 14B comme option qualité si la VRAM/latence le permettent.
- Ajouter un vrai sélecteur de modèle local dans SETTINGS.
- Ajouter fallback cloud optionnel plus tard, jamais obligatoire.
- Ne pas afficher `CHATGPT/OPENAI` comme actif si aucun backend OpenAI n'est réellement utilisé.

---

# 2. Matrice runtime — QU'EST-CE QUI DOIT TOURNER ?

## Mode actuel recommandé

| Composant | Doit être installé ? | Doit être ouvert/tourner ? | Qui le lance ? | Rôle |
|---|---:|---:|---|---|
| **SHINO-OS repo** | Oui | Non | — | Overlay / scripts / UI |
| **Jarvis OS runtime** | Oui | **Oui** | `shino.bat run` | Backend principal |
| **Ollama** | Oui | **Oui** | Pour l'instant Ollama/Windows | LLM Qwen local |
| **Qwen3 8B** | Oui | Chargé à la demande par Ollama | Ollama | Raisonnement / réponse |
| **Handy application** | Oui | **NON** | — | Installation du moteur STT + modèles |
| **Whisper Large V3 Turbo dans Handy** | Oui | Non en permanence | Process headless Handy par tour | STT local GPU |
| **Piper** | Bundle Jarvis | Non séparément | Jarvis | TTS local |
| **LiveKit local** | Bundle Jarvis | Jarvis peut le lancer | Jarvis | Pipeline voix upstream / futur usage |
| **Chrome** | Oui | Oui pour UI | utilisateur | Cockpit + micro + MediaPipe |
| **MediaPipe** | Non installé séparément | Seulement quand CAM active | navigateur | visage + mains + gestes |
| **YOLO vision daemon** | Bundle/runtime | À activer avec vision | Jarvis | objets caméra |
| **RTX 3060** | — | Disponible | local | LLM + Handy Vulkan actuellement |
| **RTX 3070 Ti LAN** | — | NON nécessaire actuellement | futur worker | STT/vision/compute distant |

### Important — Handy

**Handy n'a pas besoin d'être ouvert.**

Il doit seulement :

1. être installé ;
2. avoir le modèle **Whisper Large V3 Turbo** téléchargé ;
3. laisser son binaire disponible, typiquement :
   `C:\Users\<user>\AppData\Local\Handy\handy.exe`.

SHINO appelle le mode headless de Handy pour chaque transcription.

### Important — Ollama

**Ollama doit tourner actuellement**, car Jarvis parle à `http://localhost:11434`.

À terme, `shino.bat run` devra :

1. tester `/api/tags` sur Ollama ;
2. démarrer Ollama s'il est installé mais arrêté ;
3. vérifier que `qwen3:8b-q4_K_M` est disponible ;
4. afficher une erreur SHINO claire sinon.

### Important — Piper

Piper n'est **pas** une application à lancer séparément. Le TTS est appelé depuis le processus Jarvis.

---

# 3. Voix locale — P0 actuel

Pipeline cible immédiat :

```text
Micro navigateur
   ↓
PCM float32 / 16 kHz
   ↓
WAV mono 16-bit 16 kHz temporaire
   ↓
Handy headless
   ↓
Whisper Large V3 Turbo
   ↓
RTX 3060 / Vulkan device index 0
   ↓
texte
   ↓
Qwen3 / Ollama
   ↓
Piper
   ↓
audio navigateur
   ↓
orb : LISTENING → THINKING → SPEAKING → IDLE
```

## ✅ Fait

- Capture micro navigateur.
- Silence auto-stop.
- Resampling à 16 kHz.
- Orb pilotée pendant un tour vocal.
- Bridge vers Qwen.
- Bridge TTS Piper.
- Handy installé et détecté.
- GPU Handy confirmé :
  - `index=0`
  - `kind=vulkan`
  - `NVIDIA GeForce RTX 3060`
  - VRAM ~12 GB.
- Whisper Large V3 Turbo installé dans Handy.
- Backend SHINO configuré avec device `0`.

## 🧪 En validation maintenant

- Premier vrai tour Handy depuis SHINO.
- Un `STT HTTP 500` a été observé au premier essai.
- Correctif en cours : capture stdout/stderr Handy via fichiers Windows plutôt que PIPE asyncio.

## ⏭️ Ensuite

- Mesurer :
  - `load_ms`
  - `transcribe_ms`
  - RTF
  - durée totale du tour.
- Vérifier précision FR.
- Tester 20 phrases variées.
- Tester bruit ambiant / distance micro.
- Tester interruption en cours de TTS.
- Ajouter push-to-talk clavier.
- Ajouter mot de réveil plus tard.

## Optimisation majeure possible

Le mode headless Handy recharge potentiellement le modèle à chaque tour.

Si `load_ms` domine la latence :

### P0.5 — Worker STT résident

- garder le modèle Whisper Turbo chargé en VRAM ;
- endpoint local `/transcribe` ;
- latence cible < 1 s pour une phrase courte ;
- Handy/transcribe-cpp ou worker dédié suivant benchmark.

---

# 4. Vision / caméra / gestes — P1 haute priorité

## Le système Jarvis original existe toujours

Fichiers upstream principaux :

```text
src/jarvis/interfaces/ui/static/home.js
src/jarvis/interfaces/ui/static/home.html
src/jarvis/interfaces/ui/static/mediapipe_vision.js
src/jarvis/interfaces/ui/static/gesture_router.js
src/jarvis/interfaces/api/vision.py
src/jarvis/providers/vision/daemon.py
```

## Fonctionnement upstream

### Caméra

`home.js` appelle :

```text
navigator.mediaDevices.getUserMedia(...)
→ #cam-video
→ #cam-overlay.is-open
→ mpInit()
→ mpStart()
```

### MediaPipe browser

MediaPipe fonctionne localement dans Chrome avec GPU/WASM.

Détection :

- visage ;
- squelette de main ;
- jusqu'à 2 mains ;
- gestes discrets ;
- pincement ;
- mouvements continus.

Fréquence actuelle upstream : ~15 FPS de détection.

### Gestes upstream actuels

- 👍 `Thumb_Up`
- 👎 `Thumb_Down`
- ✋ `Open_Palm`
- ✌️ `Victory`
- ☝️ `Pointing_Up`
- pincement pouce/index + mouvement vertical → volume
- 2 poings fermés + écartement → zoom
- 1 poing fermé + déplacement → pan

Le `gesture_router.js` décide ensuite de l'action suivant la vue active.

### Présence

- présence visage après temporisation ;
- événement `presence=true/false` via WebSocket.

### YOLO

La détection d'objets est distincte : daemon Python → résultats vers navigateur → boxes dessinées sur le canvas caméra.

## Pourquoi on ne la voit plus dans SHINO ?

Le contrôle caméra appartenait à la Home Jarvis originale.

Le cockpit SHINO conserve le runtime et les scripts, mais **masque/remplace le chrome visuel original**. La caméra n'a donc pas disparu : son bouton et son overlay ne sont simplement plus exposés proprement dans notre UI.

## P1 — Réintégration SHINO

- [ ] Bouton `CAM / VISION` permanent dans le cockpit SHINO.
- [ ] Réutiliser `startCamera()/stopCamera()` ou exposer une API propre depuis le shell upstream.
- [ ] Afficher le feed dans un panneau SHINO, pas dans un overlay Jarvis au style différent.
- [ ] Garder le canvas MediaPipe natif au-dessus de la vidéo.
- [ ] Afficher état : `CAM OFF / FACE / HAND / YOLO`.
- [ ] Afficher le dernier geste reconnu.
- [ ] Réutiliser le Gesture Router upstream.
- [ ] Ajouter toggle : gestes globaux ON/OFF.
- [ ] Ajouter permissions caméra explicites.
- [ ] Vérifier caméra + micro simultanés.
- [ ] Tester CPU/GPU impact pendant Qwen + Handy.
- [ ] Tester comportement si caméra refusée par Chrome.

### Gate vision

Validation physique :

1. ouvrir CAM depuis SHINO ;
2. voir feed ;
3. visage encadré ;
4. main squelettisée ;
5. pouce haut reconnu ;
6. pincement volume fonctionne ;
7. fermeture CAM arrête réellement le MediaStreamTrack ;
8. aucune frame stockée/envoyée sans action explicite.

---

# 5. Skills SHINO — P2

## 5.1 RISO Assistant

Objectif : transformer les manuels / parts lists / notes terrain en assistant SAV fiable.

### Fonctions

- identification modèle/gamme ;
- code erreur ;
- procédure diagnostic :
  1. simple/utilisateur ;
  2. mécanique ;
  3. capteurs/câblage ;
  4. électrique ;
  5. cartes ;
- distinguer :
  - confirmé manuel ;
  - déduction technique ;
  - hypothèse ;
  - retour terrain ;
- références pièces seulement si compatibilité documentée ;
- stock véhicule ;
- préparation tournée ASTEA ;
- photos terrain / vision ;
- notes personnelles par modèle/code.

### Priorités

- [ ] définir ingestion documentaire propre ;
- [ ] index par gamme FT/FW/GL/etc. ;
- [ ] citations page/section ;
- [ ] Field Notes séparées des manuels ;
- [ ] UI module RISO dans cockpit ;
- [ ] workflow tournée SAV ;
- [ ] extraction ASTEA mobile/web.

---

## 5.2 SHINOBIWAN / Music A&R

- [ ] module NEXT BANGER ;
- [ ] historique morceaux ;
- [ ] prompts Suno ;
- [ ] lyrics/versioning ;
- [ ] artwork prompts ;
- [ ] SoundCloud highlight ;
- [ ] release pack ;
- [ ] métadonnées / distribution ;
- [ ] analyse audio locale ;
- [ ] intégration future AudioLAB.

---

## 5.3 DEV / GitHub

- [ ] repo status ;
- [ ] PR status ;
- [ ] CI ;
- [ ] issues ;
- [ ] recent commits ;
- [ ] commandes de smoke ;
- [ ] contextes projet persistants ;
- [ ] lancement contrôlé de workflows ;
- [ ] recommandations Codex seulement quand réellement nécessaire.

---

## 5.4 FILES / PC

- [ ] recherche fichiers locale ;
- [ ] ouvrir dossier/application ;
- [ ] espace disque ;
- [ ] process ;
- [ ] GPU VRAM/temp/utilisation ;
- [ ] monitoring réseau ;
- [ ] scripts Windows approuvés ;
- [ ] contrôles audio/volume ;
- [ ] multi-écrans.

---

# 6. Mémoire / missions / proactivité — P3

Réutiliser au maximum les briques Jarvis :

- kernel mémoire ;
- missions ;
- proactive engine ;
- permissions ;
- tools.

## Roadmap

- [ ] mémoire personnelle visible/auditable ;
- [ ] scopes mémoire par module ;
- [ ] notes terrain RISO ;
- [ ] mémoire catalogue musical ;
- [ ] projets GitHub ;
- [ ] routines matin/soir ;
- [ ] rappels ;
- [ ] surveillance conditionnelle ;
- [ ] mode "ne pas déranger" ;
- [ ] journal de ce que SHINO a fait automatiquement.

Principe : **aucune action destructive ou externe silencieuse**.

---

# 7. Compute distribué / RTX 3070 Ti LAN — P4

Machine principale :

- RTX 3060 12 GB ;
- Ryzen 5 5600X ;
- Qwen/Ollama ;
- actuellement Handy STT local.

Nœud futur : RTX 3070 Ti LAN.

## Usages candidats

1. STT résident ;
2. YOLO / vision ;
3. embeddings/RAG ;
4. modèles secondaires ;
5. génération image/vidéo ponctuelle ;
6. tâches background.

## Architecture cible

```text
SHINO main PC
├─ Jarvis API
├─ Qwen/Ollama — RTX 3060
├─ Piper
└─ dispatcher
      │
      └──── LAN ────> SHINO Worker — RTX 3070 Ti
                     ├─ STT
                     ├─ vision
                     └─ batch jobs
```

## Exigences

- healthcheck ;
- découverte IP configurable ;
- timeout court ;
- fallback local ;
- auth/token LAN ;
- aucune exposition Internet par défaut ;
- télémétrie du worker dans le cockpit.

---

# 8. UI/UX finale — P5

## Cockpit principal

- [x] vraie orb Jarvis ;
- [x] conversation ;
- [x] télémétrie de base ;
- [x] modules bas ;
- [ ] caméra ;
- [ ] GPU/VRAM réel ;
- [ ] activité Ollama ;
- [ ] activité Handy ;
- [ ] worker LAN ;
- [ ] timeline d'événements ;
- [ ] missions actives ;
- [ ] notifications ;
- [ ] contrôles permissions ;
- [ ] raccourcis clavier ;
- [ ] animations moins décoratives et davantage liées à l'activité réelle.

## États de l'orbe

- IDLE : respiration lente ;
- LISTENING : réaction micro ;
- THINKING : convergence/activité ;
- SPEAKING : réaction audio ;
- WORKING : activité périphérique ;
- ERROR : alerte lisible, pas seulement couleur.

---

# 9. Fiabilité / observabilité — P0 transversal

Après les problèmes de launcher et navigation, cette partie est obligatoire.

- [x] CI JS ;
- [x] CI Python compile ;
- [x] parse PowerShell Windows ;
- [x] smoke detached HEAD ;
- [x] smoke sync overlay ;
- [ ] tests unitaires backend voix ;
- [ ] fixture Handy fake CLI pour CI ;
- [ ] tests WAV 16 kHz ;
- [ ] test timeout STT ;
- [ ] test Ollama absent ;
- [ ] test Handy absent ;
- [ ] test modèle Handy absent ;
- [ ] test caméra refusée ;
- [ ] logs SHINO séparés des logs upstream ;
- [ ] page Diagnostic dans SETTINGS ;
- [ ] bouton Copier diagnostic ;
- [ ] version SHINO + commit affichés ;
- [ ] version/pin Jarvis affichés.

---

# 10. Sécurité / confidentialité — P5 transversal

- local-first ;
- micro uniquement pendant écoute explicite / futur wake-word contrôlé ;
- caméra explicitement activée ;
- arrêter réellement les tracks caméra/micro à OFF ;
- MediaPipe browser local ;
- aucun stockage vidéo par défaut ;
- actions système sensibles soumises aux permissions Jarvis ;
- secrets hors repo ;
- LAN worker non exposé Internet ;
- audit log des actions automatiques.

---

# 11. Packaging / maintenance — P6

- [ ] bootstrap one-command Windows ;
- [ ] détecter/installer prérequis manquants ;
- [ ] migration `.env` versionnée ;
- [ ] updater SHINO séparé de l'updater Jarvis ;
- [ ] compatibilité nouvelle version upstream ;
- [ ] tests de diff avant `shino.bat update` ;
- [ ] rollback upstream ;
- [ ] release tags SHINO ;
- [ ] docs de restauration complète.

---

# 12. Ordre d'exécution recommandé à partir d'aujourd'hui

## Sprint A — Voice gate

1. Corriger STT HTTP 500 Handy.
2. Obtenir une vraie transcription Turbo sur RTX 3060/Vulkan.
3. Mesurer `load_ms` / `transcribe_ms`.
4. Faire Qwen répondre.
5. Faire Piper parler.
6. 20 tours successifs sans blocage.
7. Décider si process Handy headless suffit ou worker résident nécessaire.

**Gate : voix complète fiable < quelques secondes par tour.**

## Sprint B — Restore Vision

1. Bouton CAM dans SHINO.
2. Feed original Jarvis réutilisé.
3. MediaPipe face + hand.
4. Gesture Router.
5. YOLO.
6. Permission + fermeture propre.

**Gate : caméra/gestes fonctionnent sans revenir à l'UI Jarvis originale.**

## Sprint C — System reliability

1. `shino doctor` enrichi.
2. auto-check Ollama.
3. diagnostics Handy.
4. logs SHINO.
5. télémétrie GPU.
6. 50 cycles HOME/navigation.

## Sprint D — RISO

Premier vrai skill métier complet.

## Sprint E — Music

Deuxième skill personnel.

## Sprint F — 3070 Ti LAN

Seulement après benchmark local, afin de savoir ce qu'il est réellement utile de déporter.

---

# 13. Definition of Done — V0.2

La PR #2 ne doit quitter DRAFT que lorsque :

- [x] setup Windows réel terminé ;
- [x] Jarvis runtime local fonctionne ;
- [x] Ollama/Qwen répond ;
- [x] cockpit SHINO rendu sur 3440×1440 ;
- [x] vraie télémétrie ;
- [x] chat réel ;
- [x] orb Jarvis native ;
- [ ] voix locale complète validée physiquement ;
- [ ] navigation Home/Workspace/Settings fiable ;
- [ ] caméra/gestes restaurés ou explicitement reportés à V0.3 avec interface stable ;
- [ ] CI verte ;
- [ ] roadmap et runtime guide à jour.

---

# 14. Commandes utiles

Depuis le repo SHINO :

```powershell
# état
.\shino.bat status

# lancement
.\shino.bat run

# diagnostic upstream
.\shino.bat doctor

# mise à jour volontaire de Jarvis upstream
.\shino.bat update
```

Runtime Jarvis :

```text
%LOCALAPPDATA%\SHINO-OS\runtime\jarvis-OS
```

Ollama :

```text
http://localhost:11434
```

Jarvis/SHINO UI :

```text
http://127.0.0.1:<PORT>/
```

Port normalement 8000, avec bascule automatique si occupé.

Handy typique :

```text
%LOCALAPPDATA%\Handy\handy.exe
```

---

## Règle de maintenance de cette roadmap

Chaque changement important doit mettre à jour au minimum :

1. **État actuel** ;
2. **Matrice runtime** ;
3. **Sprint actif** ;
4. **Known issues / gates**.

Le but est qu'une nouvelle conversation ou une reprise du projet puisse répondre immédiatement à trois questions :

- **où on en est ?**
- **qu'est-ce qui doit tourner ?**
- **quelle est la prochaine étape ?**
