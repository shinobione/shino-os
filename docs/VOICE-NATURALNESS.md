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

La conversation vocale n'est pas encore validée comme naturelle. Les problèmes restants sont maintenant concentrés après le STT :

1. **qualité/prosodie TTS** — Piper reste trop synthétique pour la cible JARVIS ;
2. **latence de première audio** — à mesurer après passage au streaming par phrases ;
3. **réponse orale Qwen** — le tag `[voix]` upstream impose déjà des réponses courtes, mais l'obéissance du modèle local doit être validée physiquement ;
4. **barge-in** — interruption utilisateur pas encore implémentée.

## Cible UX

```text
fin de parole utilisateur
   ↓
STT Handy
   ↓
Qwen commence à streamer
   ↓
1re phrase complète détectée
   ↓
TTS génère immédiatement la 1re phrase
   ↓
lecture pendant que Qwen continue
   ↓
queue audio phrase 2 / phrase 3
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

État : **upstream déjà présent / validation à poursuivre**.

`/api/voice/generate` ajoute `[voix]` au message et le prompt Jarvis contient des règles vocales dédiées. SHINO conserve ce chemin afin de garder mémoire, tools et sessions.

### A2.2 Streaming par phrases

État : **implémenté dans SHINO — validation physique à faire**.

Le bridge chat expose maintenant les deltas du stream LLM. Le bridge voix :

```text
stream tokens
→ segmentation sur ponctuation
→ normalisation orale
→ queue TTS séquentielle
→ lecture progressive
```

La première phrase peut commencer à être synthétisée avant que Qwen ait terminé la réponse complète.

### A2.3 Nouveau moteur TTS

État : **Chatterbox intégré, installation locale à faire**.

Architecture :

```text
SHINO/Jarvis
   ↓ HTTP local
worker Chatterbox résident :127.0.0.1:8765
   ↓
Chatterbox Multilingual V3 / français
```

Le worker est isolé du runtime Jarvis dans son propre venv et garde le modèle chargé. Le launcher SHINO :

- démarre automatiquement le worker s'il est installé ;
- lance un warmup en arrière-plan ;
- configure `SHINO_TTS_URL` ;
- retombe automatiquement sur Piper si le worker n'est pas disponible ou si une synthèse échoue.

Installation Windows :

```powershell
.\shino.bat tts-setup
```

Le setup refuse l'installation si moins de 8 GB sont libres sur le disque du runtime.

Moteur cible actuel : **Chatterbox Multilingual V3** (~500M, français natif). Piper reste fallback de sécurité.

### A2.4 Speech rendering

État : **implémenté**.

Avant TTS :

- Markdown retiré ;
- emojis retirés ;
- liens nettoyés ;
- blocs de code non lus caractère par caractère ;
- listes transformées en pauses ;
- tics initiaux type `euh/hmm` supprimés.

Le texte affiché dans le chat reste inchangé.

### A2.5 Barge-in

État : **à faire**.

Pendant `SPEAKING` :

- détecter une nouvelle parole volontaire ;
- couper immédiatement l'audio courant ;
- orb → `LISTENING` ;
- annuler la queue TTS restante ;
- commencer le nouveau tour.

## Répartition hardware visée

### Validation locale actuelle

```text
RTX 3060 12 GB
├─ Qwen3 8B / Ollama
├─ Handy / Whisper Turbo (process ponctuel)
└─ Chatterbox V3 résident si VRAM suffisante

CPU
└─ Piper fallback
```

Le test physique doit mesurer la VRAM avec Qwen + Chatterbox simultanés. En cas d'OOM ou de latence excessive, Chatterbox devient candidat prioritaire au futur nœud RTX 3070 Ti LAN.

## Gate de validation

Le sprint voix n'est considéré réussi que si :

1. 20 phrases françaises transcrites sans régression STT ;
2. aucune lecture de syntaxe Markdown/emoji ;
3. réponse orale courte et naturelle ;
4. premier son < 2 s médian après fin de parole ;
5. 20 tours successifs sans blocage ;
6. interruption utilisateur fonctionnelle ;
7. TTS jugé subjectivement nettement supérieur à Piper ;
8. pas d'OOM avec le workload local retenu.

## Runtime — rappel

- `shino.bat run` : doit tourner ;
- **Ollama** : doit tourner actuellement ;
- **Handy GUI** : peut rester fermé ; seul `handy.exe` + le modèle installé sont nécessaires ;
- **Chatterbox GUI** : aucune GUI ; le worker est lancé automatiquement par SHINO après `tts-setup` ;
- **Piper** : pas de process séparé ; fallback automatique.
