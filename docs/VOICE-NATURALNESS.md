# SHINO-OS — Voice Naturalness Sprint

État : 2026-09-04

## Décision

Le STT local est considéré comme **validé** :

- capture micro navigateur : OK ;
- Handy headless : OK ;
- Whisper Large V3 Turbo : OK ;
- RTX 3060 via Vulkan : OK ;
- transcription française : jugée excellente par test physique ;
- latence STT : jugée très rapide.

**Règle : ne plus modifier le STT tant qu'un benchmark ou un bug réel ne le justifie pas.**

## Problème restant

La conversation vocale n'est pas encore naturelle pour trois raisons distinctes :

1. **LLM orienté texte** — Qwen produit encore des réponses pensées pour l'écran (longueur, structure, formulations écrites).
2. **Pipeline sériel** — SHINO attend la réponse LLM complète avant de lancer le TTS.
3. **Piper** — rapide et local, mais plafond de qualité/prosodie trop bas pour une voix de type assistant premium.

## Cible UX

```text
fin de parole utilisateur
   ↓
STT Handy (< ~1 s cible, déjà proche)
   ↓
Qwen commence à streamer
   ↓
1re phrase complète détectée
   ↓
TTS génère immédiatement la 1re phrase
   ↓
lecture pendant que Qwen continue
   ↓
file audio phrase 2 / phrase 3
```

Objectifs :

- premier son < 2 s après la fin de la phrase utilisateur ;
- aucune lecture de Markdown / emoji / URL / code brut ;
- réponses vocales courtes par défaut (1 à 3 phrases) ;
- formulation orale directe, sans tics artificiels ;
- interruption possible par l'utilisateur (barge-in) ;
- l'écran peut conserver une réponse plus riche que la version parlée.

## Sprint A2 — Voice UX

### A2.1 Prompt vocal dédié

- ajouter un mode `voice` au bridge Qwen ;
- instructions : français naturel, direct, 1–3 phrases par défaut ;
- pas de Markdown, emojis, listes ou titres dans la couche orale ;
- éviter les introductions génériques (« Bien sûr », « Excellente question », etc.) ;
- garder la réponse détaillée disponible à l'écran si nécessaire.

### A2.2 Streaming par phrases

Remplacer :

```text
attendre réponse complète → TTS complet → lecture
```

par :

```text
stream tokens → segmentation phrases → queue TTS → lecture progressive
```

Le chat continue d'afficher le flux complet pendant que la voix démarre dès la première phrase exploitable.

### A2.3 Nouveau moteur TTS

Piper devient **fallback**, pas moteur cible.

Candidats à benchmarker :

1. **Chatterbox Multilingual** — candidat principal : français, voix zero-shot, contrôle d'expressivité, modèle ~0.5B ;
2. **Kokoro-82M** — benchmark latence/CPU, très léger, français mais palette de voix plus limitée ;
3. **XTTS-v2** — référence secondaire pour voix custom française, plus ancien et plus lourd.

Critères :

- naturel français ;
- timbre crédible pour un assistant masculin/original ;
- temps de première audio ;
- RTF ;
- VRAM/RAM ;
- fonctionnement Windows ;
- possibilité de garder le modèle résident ;
- licence compatible avec l'usage SHINO-OS.

### A2.4 Barge-in

Pendant `SPEAKING` :

- si le micro détecte une nouvelle parole volontaire ;
- couper immédiatement le buffer audio courant ;
- passer orb → `LISTENING` ;
- annuler la queue TTS restante ;
- commencer le nouveau tour.

## Répartition hardware visée

### Aujourd'hui

```text
RTX 3060 12 GB
├─ Qwen3 8B / Ollama
└─ Handy / Whisper Turbo (process ponctuel)
CPU
└─ Piper fallback
```

### Cible locale possible

```text
RTX 3060
├─ Qwen3 8B
└─ TTS moderne résident si VRAM acceptable
Handy
└─ process STT ponctuel puis libération VRAM
```

### Cible LAN future

```text
PC principal / RTX 3060
└─ Qwen / UI

RTX 3070 Ti LAN
├─ STT résident
└─ TTS/vision selon benchmark
```

## Gate de validation

Le sprint voix n'est considéré réussi que si :

1. 20 phrases françaises transcrites sans régression STT ;
2. aucune lecture de syntaxe Markdown/emoji ;
3. réponse orale courte et naturelle ;
4. premier son < 2 s médian après fin de parole ;
5. 20 tours successifs sans blocage ;
6. interruption utilisateur fonctionnelle ;
7. TTS jugé subjectivement nettement supérieur à Piper.

## Runtime — rappel

- `shino.bat run` : doit tourner ;
- **Ollama** : doit tourner actuellement ;
- **Handy GUI** : peut rester fermé ; seul `handy.exe` + le modèle installé sont nécessaires ;
- **Piper** : pas de process séparé ; utilisé comme fallback ;
- futur TTS résident : sera lancé/arrêté par SHINO, pas manuellement.
