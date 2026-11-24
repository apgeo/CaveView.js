import { sk } from './sk';
import { en } from './en';
import { fr } from './fr';
import { de } from './de';

export type Language = 'sk' | 'en' | 'fr' | 'de';
export type Translations = typeof sk;

const languages: Record<Language, Translations> = { sk, en, fr, de };

/**
 * Získa preferovaný jazyk:
 * - Ak je v localStorage uložený výber, použije sa ten.
 * - Ak sa používateľ pripája zo Slovenska alebo Česka (časové pásmo Bratislava/Praha alebo jazyk sk/cs) -> predvolený 'sk'.
 * - Z ostatných krajín -> predvolený 'en'.
 */
export function getBrowserLanguage(): Language {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('cv-language') as Language;
      if (saved && Object.keys(languages).includes(saved)) {
        return saved;
      }
    }
  } catch {
    // ignorovať chyby úložiska
  }

  // Detekcia Slovenska a Česka podľa časového pásma
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === 'Europe/Bratislava' || tz === 'Europe/Prague') {
        return 'sk';
      }
    }
  } catch {
    // ignorovať
  }

  // Detekcia podľa jazykových preferencií prehliadača (sk, cs)
  try {
    if (typeof navigator !== 'undefined') {
      const navLangs = navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language || ''];

      for (const l of navLangs) {
        const prefix = l.toLowerCase().split('-')[0];
        if (prefix === 'sk' || prefix === 'cs') {
          return 'sk';
        }
      }
    }
  } catch {
    // ignorovať
  }

  // Pre ostatné krajiny je predvolený jazyk English
  return 'en';
}

/**
 * Pomocná funkcia na získanie prekladu podľa kľúča (napr. "ui.welcome")
 */
export function getTranslation(lang: Language, key: string): string {
  const keys = key.split('.');
  let current: any = languages[lang];
  
  for (const k of keys) {
    if (current[k] === undefined) return key;
    current = current[k];
  }
  
  return current;
}

export { languages };
