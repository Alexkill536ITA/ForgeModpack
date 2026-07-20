"use client"

// Provider i18n leggero: nessuna dipendenza esterna. Tiene la lingua corrente in
// stato React, la persiste in localStorage e la rende disponibile via
// `useTranslation()`. La funzione `t(key, vars?)` risolve una chiave a punti nel
// dizionario della lingua attiva, con fallback all'inglese e poi alla chiave
// stessa; supporta l'interpolazione `{nome}`.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { DEFAULT_LOCALE, isLocale, Locale, LOCALE_STORAGE_KEY } from "./config"
import en from "./locales/en.json"
import it from "./locales/it.json"

// Dizionario annidato: valori stringa o sotto-oggetti.
type Messages = { [key: string]: string | Messages }

const MESSAGES: Record<Locale, Messages> = {
  en: en as Messages,
  it: it as Messages,
}

export type TranslateVars = Record<string, string | number>
export type TranslateFn = (key: string, vars?: TranslateVars) => string

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslateFn
}

const I18nContext = createContext<I18nContextValue | null>(null)

// Naviga il dizionario seguendo una chiave a punti ("dashboard.details").
function lookup(messages: Messages, key: string): string | undefined {
  const value = key.split(".").reduce<string | Messages | undefined>((acc, part) => {
    if (acc && typeof acc === "object") return acc[part]
    return undefined
  }, messages)
  return typeof value === "string" ? value : undefined
}

// Sostituisce i segnaposto {nome} con i valori passati.
function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  )
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Parte sempre dal default per evitare mismatch di hydration (SSG), poi legge
  // la preferenza salvata al mount lato client.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(saved)) setLocaleState(saved)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  }, [])

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const value = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES[DEFAULT_LOCALE], key) ?? key
      return interpolate(value, vars)
    },
    [locale]
  )

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useTranslation must be used inside I18nProvider")
  return ctx
}
