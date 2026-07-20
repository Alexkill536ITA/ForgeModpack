"use client"

// Selettore di lingua dell'interfaccia. Mostra la lingua corrente e permette di
// cambiarla; la scelta è persistita (localStorage) dal provider i18n.

import { Languages } from "lucide-react"

import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { LOCALES } from "../i18n/config"
import { useTranslation } from "../i18n/i18n-provider"

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language.label")}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLocale(l.code)}
            data-active={l.code === locale}
            className="data-[active=true]:font-medium"
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
