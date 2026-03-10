import React, { createContext, useContext, ReactNode } from "react";

interface TranslationBatchContextValue {
  detectLanguage: (text: string) => string | null;
}

const TranslationBatchContext = createContext<TranslationBatchContextValue | null>(
  null
);

export const useTranslationBatch = () => {
  const context = useContext(TranslationBatchContext);
  if (!context) {
    throw new Error(
      "useTranslationBatch must be used within TranslationBatchProvider"
    );
  }
  return context;
};

/**
 * Detect the script/language of a text using Unicode block ranges.
 *
 * This runs synchronously in the browser — zero network calls, zero nRPC
 * overhead. Accurate for scripts that are visually distinct from Latin
 * (CJK, Arabic, Cyrillic, Hebrew, Devanagari, Thai, Korean, Greek, …).
 * Returns a BCP-47 language tag, or null when the script is indeterminate
 * (e.g. plain ASCII that could be any Latin-script language).
 */
export function detectScriptLanguage(text: string): string | null {
  // Strip URLs, nostr entities, hashtags and whitespace before sampling.
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/nostr:\w+/g, "")
    .replace(/#\w+/g, "")
    .trim();

  if (!cleaned) return null;

  // Count characters per script family (ignore spaces/punctuation).
  let cjk = 0, arabic = 0, cyrillic = 0, devanagari = 0,
      thai = 0, korean = 0, greek = 0, hebrew = 0, latin = 0, other = 0;

  for (const ch of cleaned) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) { latin++; continue; } // Basic ASCII (Latin-like)
    if (cp >= 0x00c0 && cp <= 0x024f) { latin++; continue; } // Extended Latin
    if (cp >= 0x4e00 && cp <= 0x9fff) { cjk++; continue; }   // CJK Unified
    if (cp >= 0x3040 && cp <= 0x30ff) { cjk++; continue; }   // Hiragana/Katakana
    if (cp >= 0xf900 && cp <= 0xfaff) { cjk++; continue; }   // CJK Compatibility
    if (cp >= 0x0600 && cp <= 0x06ff) { arabic++; continue; }
    if (cp >= 0x0750 && cp <= 0x077f) { arabic++; continue; } // Arabic Supplement
    if (cp >= 0x0400 && cp <= 0x04ff) { cyrillic++; continue; }
    if (cp >= 0x0900 && cp <= 0x097f) { devanagari++; continue; }
    if (cp >= 0x0e00 && cp <= 0x0e7f) { thai++; continue; }
    if (cp >= 0xac00 && cp <= 0xd7af) { korean++; continue; } // Hangul syllables
    if (cp >= 0x1100 && cp <= 0x11ff) { korean++; continue; } // Hangul Jamo
    if (cp >= 0x0370 && cp <= 0x03ff) { greek++; continue; }
    if (cp >= 0x0590 && cp <= 0x05ff) { hebrew++; continue; }
    other++;
  }

  const total = cjk + arabic + cyrillic + devanagari + thai + korean + greek + hebrew + latin + other;
  if (total === 0) return null;

  // Pick the dominant non-Latin script if it exceeds 15% of characters.
  const threshold = total * 0.15;
  if (cjk > threshold)       return "zh";
  if (arabic > threshold)    return "ar";
  if (cyrillic > threshold)  return "ru";
  if (devanagari > threshold) return "hi";
  if (thai > threshold)      return "th";
  if (korean > threshold)    return "ko";
  if (greek > threshold)     return "el";
  if (hebrew > threshold)    return "he";

  // Mostly Latin — can't tell which Latin language without AI; return null
  // so the caller can decide whether to show a translate button.
  return null;
}

interface Props {
  children: ReactNode;
}

/**
 * TranslationBatchProvider
 *
 * Language detection is now done client-side using Unicode block analysis —
 * no nRPC calls, no batching timers, no network overhead.
 * nRPC is only invoked when the user explicitly clicks "Translate".
 */
export const TranslationBatchProvider: React.FC<Props> = ({ children }) => {
  const detectLanguage = (text: string): string | null =>
    detectScriptLanguage(text);

  return (
    <TranslationBatchContext.Provider value={{ detectLanguage }}>
      {children}
    </TranslationBatchContext.Provider>
  );
};
