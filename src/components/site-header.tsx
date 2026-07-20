"use client"

import { Separator } from "../components/ui/separator"
import { SidebarTrigger } from "../components/ui/sidebar"
import { useAppSelector } from "../redux/hooks"
import { useTranslation } from "../i18n/i18n-provider"
import { LanguageSwitcher } from "./language-switcher"

export function SiteHeader() {
  const { t } = useTranslation()
  // Nome del progetto corrente; fallback quando nessun progetto è caricato.
  const name = useAppSelector((s) => s.project.project?.metadata.name)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{name?.trim() || t("header.noProject")}</h1>
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  )
}
