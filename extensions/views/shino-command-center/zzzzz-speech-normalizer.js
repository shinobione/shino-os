(function () {
  'use strict';

  const originalFetch = window.fetch.bind(window);

  function stripEmoji(text) {
    try {
      return text
        .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
        .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');
    } catch (_) {
      return text.replace(/[\u2600-\u27BF]/g, '');
    }
  }

  function normalizeSpokenText(value) {
    let text = String(value || '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return '';

    // Technical routing/UI annotations are useful on screen but must never be spoken.
    // Examples seen in physical tests: [visuel], [son], [tool], [I], [CF], [BG:PROJECT].
    text = text
      .replace(/^\s*\[(?:visuel|visual|son|sound|audio|tool|outil)\]\s*:?\s*/gim, '')
      .replace(/^\s*\[(?:I|CF|BG(?::[A-Z0-9_-]+)?)\]\s*/gim, '')
      .replace(/\[(?:visuel|visual|son|sound|audio|tool|outil)\]\s*/gi, '')
      .replace(/\[(?:I|CF|BG(?::[A-Z0-9_-]+)?)\]\s*/g, '');

    // Code is useful on screen but should not be read symbol by symbol.
    let hadCodeBlock = false;
    text = text.replace(/```[\s\S]*?```/g, () => {
      hadCodeBlock = true;
      return ' ';
    });

    // Markdown links/images -> human-readable label only.
    text = text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/`([^`]+)`/g, '$1');

    // Markdown structure -> spoken structure.
    text = text
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*[-+*]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/^\s*\[(?:x| )\]\s*/gim, '')
      .replace(/\*\*|__|~~/g, '')
      .replace(/[\*_]/g, '')
      .replace(/\|/g, ', ');

    // Piper/eSpeak and some neural TTS engines can verbalise emoji Unicode names.
    text = stripEmoji(text);

    // Remove common text emoticons as well.
    text = text.replace(/(^|\s)(?:[:;=8][\-^']?[)(/DPp]|[)(/D][\-^']?[:;=8])(?=\s|$)/g, '$1');

    // Voice answers often start with model-chat filler that sounds artificial.
    text = text
      .replace(/^\s*(?:(?:euh+|heu+|hmm+|hum+)[,.!…\s-]*)+/i, '')
      .replace(/^\s*(?:bien sûr|bien sur|absolument|excellente question|bonne question)[,.!…\s-]*/i, '');

    // Preserve paragraphs as natural sentence pauses instead of reading layout.
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => /[.!?…:]$/.test(line) ? line : `${line}.`);
    text = lines.join(' ');

    if (hadCodeBlock) {
      text = `${text} Le code est affiché à l’écran.`.trim();
    }

    // Clean punctuation/spacing left by removed markup.
    text = text
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([.!?])\s*[.]+/g, '$1')
      .replace(/,{2,}/g, ',')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return text;
  }

  window.fetch = function shinoSpeechAwareFetch(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const method = String(init?.method || 'GET').toUpperCase();

    if (method === 'POST' && url.includes('/api/shino/voice/tts') && typeof init?.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload && typeof payload.text === 'string') {
          const spoken = normalizeSpokenText(payload.text);
          if (spoken && spoken !== payload.text) {
            console.debug('[SHINO-OS] Speech text normalized', {
              displayChars: payload.text.length,
              spokenChars: spoken.length,
            });
          }
          payload.text = spoken;
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch (_) {
        // Never block TTS because normalization failed.
      }
    }

    return originalFetch(input, init);
  };

  window.SHINOSpeech = {
    normalize: normalizeSpokenText,
  };
})();
