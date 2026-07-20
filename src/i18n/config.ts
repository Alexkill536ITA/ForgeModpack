// Configurazione dell'internazionalizzazione (i18n).
// L'inglese è la lingua BASE (fallback): le chiavi mancanti in altre lingue
// ricadono su en.json. La lingua scelta è una preferenza dell'utente, salvata
// localmente (localStorage) e valida per tutti i progetti.

export type Locale = "en" | "it"

// Elenco delle lingue disponibili, con etichetta mostrata nel selettore.
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
]

// Lingua di default / fallback.
export const DEFAULT_LOCALE: Locale = "en"

// Chiave usata in localStorage per ricordare la lingua scelta.
export const LOCALE_STORAGE_KEY = "fmp.locale"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value)
}
