# SHINO-OS — ROADMAP CANONIQUE / PROJECT HANDOFF

> **À LIRE EN PREMIER dans toute nouvelle session.**  
> État de référence : **04/09/2026**  
> Repo : `https://github.com/shinobione/shino-os`  
> Branche de développement active : **`integration/jarvis-upstream`**  
> PR active : **#2 — `V0.2 — Jarvis-powered SHINO-OS integration`** — DRAFT, ouverte, mergeable  
> Branche `main` : volontairement minimale ; le travail réel est dans `integration/jarvis-upstream`.

---

# 0. TL;DR — POUR REPRENDRE LE PROJET DANS UNE NOUVELLE FENÊTRE

SHINO-OS est un **assistant personnel local-first type JARVIS** construit comme **overlay mince au-dessus de `Grominet95/jarvis-OS`**, et non comme fork complet.

Le PC principal est sous Windows avec :

- Ryzen 5 5600X ;
- RTX 3060 12 Go ;
- 16 Go RAM DDR4 ;
- écran principal ultrawide **3440×1440** ;
- une RTX 3070 Ti est disponible sur un autre PC / nœud LAN pour de futurs workers.

Architecture actuellement retenue :

```text
Micro Chrome
  ↓
Handy headless
  ↓
Whisper Large V3 Turbo Q8_0
  ↓
RTX 3060 / Vulkan device 0
  ↓
Qwen3 8B via Ollama
  ↓
stream de texte par phrases
  ↓
Chatterbox Multilingual V3 résident (GPU)
  ↓ fallback
Piper
  ↓
Audio navigateur + orb SHINO
```

État synthétique :

- ✅ Jarvis upstream installé et lancé par SHINO.
- ✅ Cockpit SHINO 3440×1440 fonctionnel sur le vrai écran.
- ✅ Chat Jarvis → Ollama → Qwen local fonctionnel.
- ✅ STT **Handy + Whisper Large V3 Turbo** validé physiquement : français excellent et très rapide.
- ✅ Handy voit la RTX 3060 via **Vulkan device 0**.
- ✅ Speech normalization : Markdown/emojis/tags techniques ne doivent plus être lus.
- ✅ Streaming vocal phrase par phrase implémenté.
- ✅ **Chatterbox Multilingual V3 installé, CUDA OK, modèle préchargé sur RTX 3060**.
- 🧪 Prochaine validation physique : vérifier que SHINO utilise réellement **CHATTERBOX V3 · STREAM** et non `PIPER · STREAM`.
- 🧪 Patch du style oral `[voix]` rendu plus robuste au dernier commit ; CI du head à vérifier avant reprise si nécessaire.
- ⏭️ Ensuite : barge-in, caméra/MediaPipe/gestes, skills RISO/MUSIC/DEV, orchestration 3070 Ti LAN.

## Commandes normales de reprise

Depuis :

```text
C:\Users\jerry\OneDrive\Documenten\GitHub\shino-os
```

```powershell
git switch integration/jarvis-upstream
git pull
.\shino.bat run
```

Puis ouvrir l'URL affichée par le launcher, typiquement :

```text
http://localhost:8008/admin
```

Le port n'est **pas garanti** : SHINO bascule automatiquement si le port demandé est occupé. Des runs réels ont déjà fini sur `8008`, `8013`, etc.

---

# 1. VISION DU PRODUIT

SHINO-OS doit devenir un **assistant personnel permanent, local-first, multimodal et actionnable**, inspiré par l'expérience JARVIS :

- conversation texte + voix naturelle ;
- mémoire et contexte personnels ;
- missions / tâches / proactivité ;
- vision caméra et gestes ;
- outils locaux et connecteurs ;
- skills personnels ;
- orchestration de plusieurs machines/GPU ;
- cockpit premium ultrawide ;
- priorité au local, cloud seulement en option.

## Principes d'architecture

1. **Jarvis OS reste l'engine/runtime.**
2. **SHINO-OS reste l'overlay/identité/UI/skills.**
3. Ne pas vendorer inutilement le code Jarvis dans ce repo.
4. Pin d'upstream reproductible via `UPSTREAM.lock`.
5. Les modifications Jarvis temporaires sont injectées/synchronisées au runtime par SHINO.
6. Les fonctions affichées dans le cockpit doivent être reliées à de vraies données, pas à de faux statuts décoratifs.
7. La version locale doit fonctionner sans abonnement API payant obligatoire.

---

# 2. HISTORIQUE / DÉCISIONS IMPORTANTES

## V0.1 — shell standalone — abandonné comme architecture

Premier prototype :

- branche `feat/v0.1-ultrawide-shell` ;
- PR #1 ;
- cockpit 3440×1440 ;
- Living Core Canvas pseudo-3D ;
- états IDLE/LISTENING/THINKING/SPEAKING/WORKING/ERROR ;
- chat mock et panneaux status.

Décision : **PR #1 fermée sans merge**.

La direction visuelle reste une référence, mais reconstruire toute l'infrastructure agent/voice/tools depuis zéro n'était pas rationnel.

## Pivot V0.2 — Jarvis-powered SHINO-OS

Repos étudiés :

- `https://github.com/Grominet95/jarvis-OS`
- `https://github.com/Grominet95/jarvis-skills`

Jarvis fournit déjà :

- FastAPI ;
- mémoire ;
- missions ;
- permissions/gouvernance ;
- moteur proactif ;
- Gmail / Calendar / Spotify / browser / filesystem / CLI / vision ;
- multi-LLM ;
- LiveKit / voix ;
- skills / views ;
- caméra / MediaPipe / gestes ;
- UI complète.

Décision finale :

```text
Jarvis OS = moteur
SHINO-OS = overlay identitaire et fonctionnel
```

Licences :

- Jarvis OS : AGPL-3.0-or-later ;
- jarvis-skills : MIT ;
- SHINO ne redistribue pas Jarvis dans le repo : le runtime est cloné localement.

---

# 3. BRANCHES / PR / UPSTREAM

## Repo

```text
https://github.com/shinobione/shino-os
```

## Branche active

```text
integration/jarvis-upstream
```

## PR active

```text
#2 — V0.2 — Jarvis-powered SHINO-OS integration
```

État au 04/09/2026 :

- open ;
- draft ;
- mergeable ;
- base : `main` ;
- head : `integration/jarvis-upstream` ;
- ~35 fichiers modifiés ;
- >100 commits de travail itératif.

**Ne pas merger PR #2 tant que les gates physiques voix/UI/vision ne sont pas terminés.**

## Pin Jarvis actuel

`UPSTREAM.lock` :

```text
repository: https://github.com/Grominet95/jarvis-OS.git
ref: 570200276bad54dd4dba49843deb785c000bc19f
tracked_branch: main
license: AGPL-3.0-or-later
```

---

# 4. CHEMINS LOCAUX IMPORTANTS

## Repo SHINO

```text
C:\Users\jerry\OneDrive\Documenten\GitHub\shino-os
```

Le repo peut rester dans OneDrive.

## Runtime Jarvis SHINO

```text
C:\Users\jerry\AppData\Local\SHINO-OS\runtime\jarvis-OS
```

Le runtime **doit rester hors OneDrive**.

Pourquoi : au début, Jarvis avait été cloné dans `.runtime` sous OneDrive et les migrations/déplacements échouaient avec Windows `ERROR 32` / fichiers utilisés.

Override possible :

```text
SHINO_RUNTIME_ROOT
```

## Worker Chatterbox

Runtime isolé sous :

```text
%LOCALAPPDATA%\SHINO-OS\runtime\workers\chatterbox
```

Endpoint local :

```text
http://127.0.0.1:8765
```

## Handy

Binaire détecté sur la machine cible :

```text
C:\Users\jerry\AppData\Local\Handy\handy.exe
```

## Ollama

```text
http://localhost:11434
```

---

# 5. MATRICE RUNTIME — QU'EST-CE QUI DOIT TOURNER ?

| Composant | Installé ? | Doit tourner/ouvert ? | Qui le lance ? | Notes |
|---|---:|---:|---|---|
| SHINO repo | oui | non | — | source/overlay |
| Jarvis runtime | oui | **oui** | `shino.bat run` | backend principal |
| Ollama | oui | **oui actuellement** | Ollama/Windows | Qwen local |
| Qwen3 8B | oui | à la demande | Ollama | LLM principal |
| Handy GUI | oui | **NON** | — | la fenêtre peut rester fermée |
| Handy headless | oui | ponctuel | SHINO | transcription |
| Whisper Large V3 Turbo | oui | ponctuel | Handy | STT GPU |
| Chatterbox GUI | aucune | non | — | pas de GUI |
| Chatterbox worker | oui après `tts-setup` | **oui pendant SHINO** | SHINO | TTS naturel résident |
| Piper | bundle Jarvis | non séparément | Jarvis | fallback TTS |
| LiveKit | bundle Jarvis | pas requis pour le chemin voix SHINO actuel | Jarvis upstream | certaines erreurs LiveKit sont hors chemin actuel |
| Chrome | oui | oui | utilisateur | UI + micro + future caméra |
| MediaPipe | navigateur | seulement CAM active | navigateur | mains/visage/gestes |
| YOLO daemon | runtime | futur | Jarvis | objets caméra |
| RTX 3060 | — | oui | local | Ollama + Handy + Chatterbox à valider ensemble |
| RTX 3070 Ti LAN | — | non actuellement | futur worker | offload STT/TTS/vision possible |

## Rappel essentiel

### Handy

**Handy n'a pas besoin d'être ouvert.**

SHINO utilise `handy.exe` en headless.

### Ollama

**Ollama doit encore être lancé** pour que Qwen réponde.

À faire plus tard : auto-start/doctor Ollama dans le launcher.

### Chatterbox

Après :

```powershell
.\shino.bat tts-setup
```

le launcher doit démarrer le worker automatiquement à chaque `run`.

### Piper

Aucun processus manuel. Il reste fallback.

---

# 6. LAUNCHER / RUNTIME — ÉTAT

## Fonctionnel

- `shino.bat` et `shino.ps1` ;
- `setup` Jarvis Windows ;
- `run` ;
- `status` même avec upstream en detached HEAD ;
- staging automatique du Command Center SHINO ;
- runtime hors OneDrive ;
- sélection automatique d'un port libre si le port attendu est occupé ;
- synchronisation du voice bridge ;
- lancement du worker Chatterbox lorsqu'il est installé ;
- CI PowerShell Windows ;
- smoke tests detached HEAD et runtime.

## Bugs historiques déjà rencontrés — NE PAS REFAIRE LES MÊMES ERREURS

### Port 8000 occupé

Ancien Jarvis/Python pouvait rester en écoute. Plusieurs patchs ont été nécessaires.

État actuel : SHINO doit basculer automatiquement sur un port libre au lieu de tuer arbitrairement un processus inconnu.

### Detached HEAD

`git branch --show-current` renvoyait `$null`, faisant planter `.Trim()`.

Solution retenue : `git rev-parse --abbrev-ref HEAD`, avec mapping de `HEAD` vers `(detached)`.

### Faux warning Anthropic

Jarvis setup local écrit volontairement :

```text
LLM_PROVIDER=local
API_BACKEND=anthropic
```

Le preflight upstream vérifie `API_BACKEND` sans respecter `LLM_PROVIDER` et affiche :

```text
ANTHROPIC_API_KEY manquante
```

**Ce warning est un faux positif dans notre mode Ollama local.**

Le factory LLM utilise bien Ollama quand `LLM_PROVIDER=local`.

### LiveKit `ws_url is required`

Cette erreur peut apparaître dans les logs du worker vocal upstream.

Le chemin vocal SHINO actuel ne dépend pas de ce worker pour le STT/TTS : ne pas confondre avec une panne Handy/Chatterbox.

---

# 7. COMMAND CENTER 3440×1440

## Fichiers principaux

```text
extensions/views/shino-command-center/
├─ VIEW.md
├─ skill.yaml
├─ skill.py
├─ tool.py
├─ view.js
├─ view.css
├─ vx-native-shell.js
├─ vx-native-shell.css
├─ zy-chat-bridge.js
├─ zz-autostart.js
├─ zzz-shell-stabilizer.js
├─ zzz-shell-stabilizer.css
├─ zzzz-local-voice.js
└─ zzzzz-speech-normalizer.js
```

## Pourquoi le staging est spécial

Le Jarvis upstream pin actuel expose les dev extensions mais `/api/skills/view-scripts` énumère les **installed views**, pas les dev views.

SHINO doit donc, avant chaque run :

- servir les assets SHINO ;
- staged/install metadata dans les chemins attendus par Jarvis ;
- attendre l'enregistrement de `shino-command-center` ;
- l'activer automatiquement.

Ne pas supprimer ce workaround tant que l'upstream pin n'a pas changé ou été audité.

## État UI physique

Validé sur écran réel **3440×1440** :

- logo SHINO-OS ;
- conversation réelle ;
- orbe/Three.js central ;
- CPU / RAM / stockage réels ;
- statut VOICE ;
- état orb ;
- modules RISO / MUSIC / DEV / FILES / PC / SETTINGS ;
- navigation shell stabilisée ;
- Mission Control existe encore via Jarvis.

## Points UX à finir

- meilleure exploitation des espaces vides ;
- barre top/nav plus compacte ;
- états cerveau/local/cloud réellement fidèles au backend ;
- journal événements ;
- vision/caméra réintégrée ;
- responsive 2560×1440 et 1920×1080 ;
- éviter toute donnée factice.

---

# 8. LLM LOCAL — OLLAMA / QWEN

## Config actuelle

```text
provider: local
Ollama: http://localhost:11434
model: qwen3:8b-q4_K_M
```

Qwen répond réellement via Jarvis.

Le chat utilise le pipeline `/api/voice/generate` afin de conserver :

- sessions ;
- mémoire ;
- tools ;
- comportement Jarvis ;
- streaming.

## À faire

- mesurer first-token latency ;
- mesurer tokens/s ;
- tester éventuellement Qwen 14B ;
- sélection modèle dans SETTINGS ;
- auto-start Ollama ;
- fallback cloud optionnel uniquement.

---

# 9. STT — HANDY / WHISPER — ÉTAT : VALIDÉ

## Décision

**Ne plus modifier le STT tant qu'un bug réel ou benchmark ne l'exige.**

Le premier essai faster-whisper Python avait tourné ~147 secondes à ~19 % CPU : inutilisable.

Pivot vers Handy.

## Handy détecté

`--list-devices` sur la machine cible :

```text
index=0 kind=vulkan name=NVIDIA GeForce RTX 3060 vram=12329MB
index=1 kind=cpu name=AMD Ryzen 5 5600X 6-Core Processor
```

Handy Windows est compilé en GUI subsystem ; ses `println!()` ne s'affichent pas toujours directement dans PowerShell. Pour les tests CLI, stdout/stderr doivent être redirigés vers fichiers.

## Modèle exact installé

Nom :

```text
Whisper Large v3 Turbo
```

ID Handy exact :

```text
handy-computer/whisper-large-v3-turbo-gguf/whisper-large-v3-turbo-Q8_0.gguf
```

`is_downloaded = True` a été vérifié physiquement.

## Pipeline STT actuel

```text
Browser mic
→ WAV mono PCM16 16 kHz
→ handy.exe --transcribe-file ... --json
→ --model <ID complet ci-dessus>
→ --device-index 0
→ RTX 3060 / Vulkan
→ texte
```

## Bugs résolus

- Handy non présent dans PATH : SHINO détecte son chemin local.
- sortie CLI invisible : redirection fichiers Windows.
- mauvais slug modèle : remplacé par l'ID complet jusqu'au `.gguf`.
- 500 opaques : le bridge remonte maintenant davantage de détails.

## Validation utilisateur

**Verdict physique : transcription française parfaite et ultra rapide.**

STT = **DONE**.

---

# 10. TTS / VOIX NATURELLE — ÉTAT ACTUEL

## Problème Piper

Piper fonctionnait, mais :

- timbre trop robotique ;
- réponses type GPS ;
- le pipeline lisait initialement Markdown et emojis : `astérisque astérisque`, `visage souriant`, etc.

## Speech normalization — implémenté

Avant TTS, SHINO retire/normalise :

- Markdown ;
- emojis ;
- URLs ;
- blocs code ;
- listes ;
- tags techniques `[visuel]`, `[son]`, `[tool]`, `[outil]`, `[I]`, `[CF]`, `[BG]`, `[BG:PROJECT]` ;
- certains tics `euh`, `hmm` ;
- retours lignes en pauses plus naturelles.

Le texte écran reste riche ; seul le texte TTS est nettoyé.

## Streaming par phrases — implémenté

Ancien pipeline :

```text
Qwen génère tout
→ TTS tout le bloc
→ lecture
```

Nouveau pipeline :

```text
Qwen stream tokens
→ phrase complète détectée
→ normalisation orale
→ TTS phrase 1
→ lecture phrase 1 pendant que Qwen continue
→ queue phrase 2 / 3
```

Le streaming a été observé physiquement avec `PIPER · STREAM`.

## Chatterbox Multilingual V3 — installé

Commande :

```powershell
.\shino.bat tts-setup
```

Historique :

1. PyPI avait installé Torch CPU → `torch.cuda.is_available() = false`.
2. SHINO a été patché pour remplacer par :
   - `torch 2.6.0+cu124`
   - CUDA runtime 12.4.
3. RTX 3060 détectée correctement.
4. PyPI `chatterbox-tts 0.1.7` était trop ancien pour `t3_model="v3"`.
5. SHINO a été patché pour installer le code officiel Resemble AI depuis GitHub avec API V3.
6. Setup final observé :

```text
Chatterbox V3 API OK
Torch CUDA disponible: true
torch 2.6.0+cu124 cuda_runtime 12.4 gpu NVIDIA GeForce RTX 3060
Prechargement du modele Multilingual V3...
Chatterbox Multilingual V3 pret sur GPU.
```

Donc : **Chatterbox V3 + CUDA + modèle = installé et préchargé avec succès.**

## Worker résident

Endpoint :

```text
http://127.0.0.1:8765
```

Le launcher affiche :

```text
TTS naturel: Chatterbox Multilingual V3 resident (...), Piper fallback.
```

## Prochain gate physique — PRIORITÉ ABSOLUE

Après pull du head actuel :

1. lancer `shino.bat run` ;
2. vérifier que le worker 8765 répond ;
3. parler au micro ;
4. vérifier le cockpit ;
5. le moteur doit afficher :

```text
CHATTERBOX V3 · STREAM
```

et **pas** :

```text
PIPER · STREAM
```

6. comparer subjectivement prosodie/timbre ;
7. mesurer délai avant premier son ;
8. vérifier VRAM Qwen + Chatterbox ;
9. 20 tours successifs sans OOM ni fallback.

## Style vocal Qwen

SHINO patch le prompt upstream `## Tag [voix]` pour imposer :

- français oral ;
- réponse directe ;
- 1–2 phrases par défaut ;
- pas de préambule chatbot ;
- pas de Markdown/tags ;
- blague = commencer directement par la blague ;
- pas de plomberie technique racontée à l'utilisateur.

Un warning :

```text
Section [voix] upstream introuvable; style vocal non modifie.
```

avait été observé malgré la présence de `## Tag [voix]`.

Cause : regex trop fragile, qui exigeait un header `## Règles` après la section.

Dernier correctif : remplacer depuis `## Tag [voix]` jusqu'au **prochain header `## ...` quel qu'il soit**, avec smoke test Windows.

**À la reprise : vérifier la CI du dernier head / faire `git pull`, puis confirmer que le launcher affiche :**

```text
Style vocal Jarvis renforce: oral court, naturel, sans tags techniques.
```

## Barge-in — à faire

Pendant SPEAKING :

- détecter nouvelle parole ;
- couper audio immédiatement ;
- vider queue TTS ;
- orb → LISTENING ;
- nouveau tour.

Cible : conversation vraiment naturelle.

---

# 11. ORB / ÉTATS VISUELS

États utilisés :

```text
IDLE
LISTENING
TRANSCRIBING
THINKING
SPEAKING
WORKING
ERROR
```

Le comportement visuel doit être piloté par l'état réel du pipeline.

Le STT bloqué avait montré des incohérences historiques : UI revenait IDLE alors que bouton restait Transcribing. Ces problèmes ont motivé la séparation plus claire des états.

À finir :

- interruption/transition barge-in ;
- visualiser éventuellement latence STT/LLM/TTS ;
- rendre les états ERROR explicites mais non envahissants ;
- éviter les toasts de logs gigantesques.

---

# 12. CAMÉRA / MEDIAPIPE / GESTES — P1 APRÈS VOICE GATE

La caméra Jarvis originale **existe toujours dans l'upstream**. Elle n'a pas été supprimée ; le cockpit SHINO masque simplement l'UI Home originale qui exposait le bouton.

## Fichiers Jarvis concernés

```text
src/jarvis/interfaces/ui/static/home.js
src/jarvis/interfaces/ui/static/home.html
src/jarvis/interfaces/ui/static/mediapipe_vision.js
src/jarvis/interfaces/ui/static/gesture_router.js
src/jarvis/interfaces/api/vision.py
src/jarvis/providers/vision/daemon.py
```

## Pipeline upstream

```text
getUserMedia()
→ video
→ overlay canvas
→ mpInit()
→ mpStart()
```

MediaPipe navigateur :

- visage ;
- jusqu'à 2 mains ;
- landmarks ;
- ~15 FPS ;
- WebGL/WASM local.

Gestes upstream observés/documentés :

- Thumb Up ;
- Thumb Down ;
- Open Palm ;
- Victory ;
- Pointing Up ;
- pinch vertical → volume ;
- 2 poings → zoom ;
- 1 poing → pan.

YOLO Python est séparé et sert à la détection objets.

## P1 SHINO

- [ ] bouton `CAM / VISION` dans le cockpit ;
- [ ] réutiliser le moteur MediaPipe Jarvis ;
- [ ] feed intégré au style SHINO ;
- [ ] landmarks mains/visage ;
- [ ] dernier geste visible ;
- [ ] Gesture Router upstream ;
- [ ] YOLO objects optionnel ;
- [ ] arrêt réel des MediaStreamTracks quand CAM OFF ;
- [ ] aucune image conservée sans demande ;
- [ ] test micro + caméra + Qwen + TTS simultané.

Gate : face + main + pouce haut + volume pinch + clean stop.

---

# 13. SKILLS SHINO

## RISO — haute valeur personnelle

Objectif : assistant SAV terrain basé sur manuels, parts lists et notes terrain.

Doit :

- identifier gamme/modèle ;
- décoder erreur ;
- diagnostic ordre : simple → mécanique → capteurs/câblage → électrique → cartes ;
- distinguer clairement :
  - Confirmé manuel ;
  - Déduction technique ;
  - Hypothèse ;
  - Retour terrain ;
- citer document/page/section ;
- ne proposer une référence pièce que si compatibilité documentée ;
- croiser stock véhicule ;
- préparer tournée ASTEA ;
- intégrer les notes terrain personnelles.

Exemple de note terrain à conserver séparée de la doc fabricant : GL S001-1132, belt pouvant reculer sur support et empêcher la fenêtre vide de passer devant Belt HP Sensor.

## SHINOBIWAN / MUSIC A&R

Future vue :

- NEXT BANGER ;
- historique tracks ;
- Suno prompts/lyrics ;
- release pack ;
- SoundCloud 20 s ;
- artwork direction ;
- distribution ;
- intégration AudioLAB / analyse audio locale.

## DEV / GitHub

- repo/branch/PR status ;
- CI ;
- commits ;
- issues ;
- smoke tests ;
- contexte projet persistant ;
- lancement workflows contrôlé.

## FILES / PC

- recherche fichiers ;
- taille disque ;
- nettoyage ciblé ;
- processes ;
- santé GPU/CPU/RAM ;
- actions sensibles avec confirmation.

---

# 14. HARDWARE / MULTI-NODE

## PC principal

```text
Ryzen 5 5600X
RTX 3060 12 GB
16 GB DDR4-3200
Windows
3440×1440
```

Charge cible locale :

```text
RTX 3060
├─ Ollama / Qwen3 8B
├─ Handy / Whisper Turbo ponctuel
└─ Chatterbox V3 résident
```

Ce cumul doit être mesuré en VRAM pendant le prochain voice gate.

## RTX 3070 Ti LAN — futur

Objectif : worker distant pour retirer une charge du PC principal.

Candidats :

1. Chatterbox TTS ;
2. STT résident ;
3. vision/YOLO ;
4. autres compute jobs.

Un worker Whisper LAN existe déjà dans le repo comme expérimentation, mais **n'est pas requis actuellement**.

---

# 15. CI / QUALITÉ

Workflow principal :

```text
.github/workflows/overlay-ci.yml
```

Doit vérifier :

- overlay validator ;
- syntaxe de tous les JS Command Center ;
- compile Python ;
- parsing PowerShell Windows ;
- smoke launcher ;
- detached HEAD ;
- voice sync / prompt patch ;
- config Handy.

Règle de travail : **ne pas faire tester physiquement à l'utilisateur un patch PowerShell/launcher avant que la CI du commit exact soit verte**, sauf urgence de diagnostic explicitement assumée.

---

# 16. NETTOYAGE DISQUE C: — INTERRUPTION EN COURS AVANT REPRISE VOIX

Le disque C: est presque plein. Un nettoyage ciblé est en cours avant de continuer les tests SHINO.

## Tailles déjà mesurées

### SHINO

```text
%LOCALAPPDATA%\SHINO-OS\runtime                 ~7.49 Go
├─ workers                                      ~5.28 Go
└─ jarvis-OS                                    ~2.21 Go
```

Ces données sont **actives** : ne pas supprimer en bloc.

### Hugging Face global

```text
C:\Users\jerry\.cache\huggingface              ~4.27 Go
```

Probablement utilisé notamment par Chatterbox : ne pas supprimer avant inventaire précis.

### Ollama

```text
C:\Users\jerry\.ollama\models                  ~4.87 Go
```

**GARDER** : Qwen actif.

### Codex runtimes

```text
C:\Users\jerry\.cache\codex-runtimes           ~1.3 Go
```

Cache reconstructible ; candidat suppression.

### LMNotebook-Neural-Audio

Total : **~23.6 Go**.

Répartition :

```text
model_lab                                       12.93 Go
└─ .runtime                                     12.93 Go
   ├─ huggingface                                7.56 Go
   └─ muq_venv                                   5.37 Go

backend                                         10.67 Go
├─ .venv                                         4.91 Go
├─ .venv-stems                                   4.20 Go
├─ models                                        1.24 Go
└─ .venv-anatomy                                 0.32 Go
```

Constat : le code lui-même est petit ; l'espace est mangé par **venvs + modèles**.

Potentiel reconstructible rien que dans les venvs Neural Audio : environ **14.8 Go**.

Mais avant suppression : vérifier la présence des `requirements*.txt`, `pyproject.toml`, scripts setup/install afin de garantir la reconstruction.

Commande prévue :

```powershell
Get-ChildItem "$env:USERPROFILE\Documents\LMNotebook-Neural-Audio" `
  -Recurse -File -Include `
  requirements*.txt,pyproject.toml,poetry.lock,uv.lock,environment.yml,setup*.ps1,install*.ps1 `
  -ErrorAction SilentlyContinue |
Select-Object FullName
```

Puis inventorier les modèles HF de Neural Audio avant d'effacer `model_lab\.runtime\huggingface`.

## Règle cleanup

Ne jamais supprimer automatiquement :

- repo source ;
- `.git` ;
- Ollama Qwen actif ;
- SHINO runtime actif ;
- Handy Whisper Turbo actif ;
- Chatterbox actif ;
- modèles Neural Audio avant identification.

Candidats sûrs/reconstructibles :

- pip cache ;
- Codex runtime cache ;
- vieux `__pycache__` (gain faible) ;
- venvs de projets dormants **après vérification reconstructibilité** ;
- anciens builds/artifacts/temp/logs.

---

# 17. ROADMAP PRIORISÉE

## P0 — terminer Voice Gate

- [x] STT Handy rapide/fiable.
- [x] Whisper Turbo Q8_0.
- [x] RTX 3060 Vulkan.
- [x] speech normalization.
- [x] streaming phrases.
- [x] Chatterbox V3 installé avec CUDA.
- [x] worker Chatterbox résident implémenté.
- [ ] pull du dernier head + vérifier prompt `[voix]` patched sans warning.
- [ ] vérifier `CHATTERBOX V3 · STREAM` physiquement.
- [ ] 20 tours vocaux.
- [ ] mesurer first-audio latency.
- [ ] mesurer VRAM/OOM.
- [ ] barge-in.

## P1 — Vision / caméra / gestes

- [ ] bouton CAM SHINO.
- [ ] réintégrer MediaPipe Jarvis.
- [ ] main/face overlay.
- [ ] Gesture Router.
- [ ] YOLO objects.
- [ ] clean privacy/stop.

## P2 — Runtime hardening

- [ ] `shino.bat stop`.
- [ ] `shino.bat restart`.
- [ ] doctor SHINO.
- [ ] auto-start Ollama.
- [ ] health matrix UI.
- [ ] rotation/log cleanup.
- [ ] gestion propre de l'espace disque.

## P3 — Skills métier/personnels

- [ ] RISO.
- [ ] MUSIC / SHINOBIWAN.
- [ ] DEV / GitHub.
- [ ] FILES / PC.

## P4 — Multi-node

- [ ] worker 3070 Ti LAN.
- [ ] choisir charge à offloader.
- [ ] heartbeat / reconnect.
- [ ] metrics GPU distantes.

## P5 — Produit / polish

- [ ] responsive secondaire.
- [ ] cockpit layout polish.
- [ ] settings centralisés.
- [ ] logs/diagnostics visibles.
- [ ] onboarding reproductible.
- [ ] documentation install depuis zéro.

---

# 18. DEFINITION OF DONE V0.2

PR #2 peut quitter DRAFT seulement si :

1. `shino.bat setup` fonctionne depuis machine propre ;
2. `shino.bat run` lance Jarvis + overlay ;
3. cockpit SHINO stable sur 3440×1440 ;
4. chat réel Qwen fonctionne ;
5. STT Handy validé ;
6. TTS naturel Chatterbox validé ou choix explicite d'un fallback ;
7. aucune lecture Markdown/tags ;
8. navigation HOME/Mission Control stable ;
9. 20 tours voix sans blocage ;
10. CI verte ;
11. README + ROADMAP à jour ;
12. aucune dépendance critique implicite non documentée.

La caméra/vision peut devenir V0.3 si nécessaire, mais la décision doit être explicite.

---

# 19. CHECKLIST DE REPRISE POUR UN AUTRE ASSISTANT / NOUVELLE SESSION

**Ne pas recommencer le projet.**

1. Lire ce fichier.
2. Inspecter PR #2 et son head actuel.
3. Lire `UPSTREAM.lock`.
4. Lire `docs/VOICE-NATURALNESS.md`.
5. Vérifier la dernière CI avant de demander un test utilisateur.
6. Considérer STT Handy comme validé.
7. Ne pas demander d'ouvrir Handy GUI.
8. Ne pas confondre warning Anthropic avec un bug Ollama.
9. Ne pas confondre erreur LiveKit upstream avec le pipeline SHINO Handy/Chatterbox.
10. Prochaine priorité technique : **validation Chatterbox réelle**, puis barge-in, puis caméra.
11. Prochaine priorité système immédiate si C: manque d'espace : continuer le **cleanup Neural Audio / caches**, sans supprimer les modèles actifs SHINO.

---

# 20. LIENS UTILES

- Repo SHINO : `https://github.com/shinobione/shino-os`
- PR #2 : `https://github.com/shinobione/shino-os/pull/2`
- Jarvis OS upstream : `https://github.com/Grominet95/jarvis-OS`
- Jarvis Skills : `https://github.com/Grominet95/jarvis-skills`
- Handy : `https://github.com/cjpais/Handy`
- Chatterbox : `https://github.com/resemble-ai/chatterbox`

---

# 21. DERNIER ÉTAT CONNU AU MOMENT DE CE HANDOFF

**Date : 04/09/2026**

Derniers faits importants :

- Chatterbox V3 setup a terminé avec **CUDA true** sur RTX 3060.
- Le modèle V3 a été préchargé avec succès.
- `shino.bat run` a annoncé le worker Chatterbox résident sur `127.0.0.1:8765`.
- Le launcher a encore affiché `Section [voix] upstream introuvable` ; la cause regex a été trouvée et patchée.
- Un smoke test Windows a été ajouté pour ce patch.
- Avant de continuer le voice gate, l'utilisateur a interrompu le travail pour libérer de l'espace sur C:.
- Neural Audio a été identifié comme très gros (~23.6 Go) avec ~14.8 Go de venvs potentiellement reconstructibles.

**Le prochain humain/assistant ne doit donc PAS repartir sur faster-whisper, réinstaller Handy, ni réinventer le cockpit. Il doit reprendre exactement ici.**
