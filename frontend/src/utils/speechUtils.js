/**
 * Arise Text-to-Speech / Speech Synthesis Utility
 * Uses the native browser Web Speech API (window.speechSynthesis)
 * to read aloud AI responses with zero latency and zero external dependencies.
 */

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/**
 * Strips markdown formatting, links, and redundant special characters for natural voice synthesis.
 */
export function cleanSpeechText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
    .replace(/~~([^~]+)~~/g, '$1')           // strikethrough
    .replace(/[*_#`>]/g, '')                 // markdown bold, italic, code, headers, quotes
    .replace(/\s+/g, ' ')                    // multiple spaces
    .trim();
}

/**
 * Builds clear, plain-text speech representation from an AI response message object.
 * Formats verdict, headline, key observations, and recommended actions.
 */
export function buildSpeechText(msg) {
  if (!msg) return '';

  // If msg is already a plain string
  if (typeof msg === 'string') {
    return cleanSpeechText(msg);
  }

  const parts = [];

  if (msg.verdict) {
    const cleanVerdict = String(msg.verdict).replace(/_/g, ' ').trim();
    parts.push(`Verdict: ${cleanVerdict}.`);
  }

  if (msg.headline) {
    const cleanHeadline = cleanSpeechText(msg.headline);
    if (cleanHeadline) {
      parts.push(cleanHeadline.endsWith('.') ? cleanHeadline : `${cleanHeadline}.`);
    }
  }

  if (Array.isArray(msg.why) && msg.why.length > 0) {
    const cleanWhy = msg.why.map(cleanSpeechText).filter(Boolean);
    if (cleanWhy.length > 0) {
      parts.push(`Key observations: ${cleanWhy.join('. ')}.`);
    }
  }

  if (Array.isArray(msg.do) && msg.do.length > 0) {
    const cleanDo = msg.do.map(cleanSpeechText).filter(Boolean);
    if (cleanDo.length > 0) {
      parts.push(`Recommended actions: ${cleanDo.join('. ')}.`);
    }
  }

  if (msg.best_window && msg.best_window !== 'Unavailable' && msg.best_window !== 'No recommended outdoor window') {
    const cleanWindow = cleanSpeechText(msg.best_window);
    parts.push(`Best time to go out: ${cleanWindow}.`);
  }

  return parts.join(' ').trim();
}

/**
 * Speak given text aloud using browser SpeechSynthesis.
 * Automatically cancels any prior speech.
 *
 * @param {string} text - text to speak
 * @param {Object} options
 * @param {Function} [options.onStart]
 * @param {Function} [options.onEnd]
 * @param {Function} [options.onError]
 * @param {number} [options.rate=1.0]
 * @param {number} [options.pitch=1.0]
 * @param {string} [options.lang='en-US']
 * @returns {SpeechSynthesisUtterance|null}
 */
export function speakText(text, options = {}) {
  if (!isSpeechSynthesisSupported()) {
    console.warn('SpeechSynthesis is not supported in this environment.');
    options.onError?.(new Error('SpeechSynthesis not supported'));
    return null;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending or ongoing speech

    if (!text || !text.trim()) {
      options.onEnd?.();
      return null;
    }

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate = options.rate || 1.0;
    utterance.pitch = options.pitch || 1.0;
    utterance.lang = options.lang || 'en-US';

    // Try selecting natural English voice if available
    const voices = window.speechSynthesis.getVoices?.() || [];
    if (voices.length > 0) {
      const preferred = voices.find(v => (v.lang.startsWith('en') || v.lang.startsWith('en-IN') || v.lang.startsWith('en-US')) && v.name.includes('Google'))
        || voices.find(v => v.lang.startsWith('en'));
      if (preferred) {
        utterance.voice = preferred;
      }
    }

    if (options.onStart) utterance.onstart = options.onStart;
    utterance.onend = () => {
      options.onEnd?.();
    };
    utterance.onerror = (err) => {
      console.warn('SpeechSynthesis error:', err);
      options.onError?.(err);
    };

    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch (err) {
    console.warn('Failed to execute SpeechSynthesis:', err);
    options.onError?.(err);
    return null;
  }
}

/**
 * Stops any active speech playback immediately.
 */
export function stopSpeech() {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}
