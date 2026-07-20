"use client"

import * as React from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { readTextFile } from "@tauri-apps/plugin-fs"

import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { useAppDispatch, useAppSelector } from "../redux/hooks"
import { loadProject } from "../redux/project-slice"
import { defaultJvmSettings, modloaderTypes, project } from "../model/models"
import { useTranslation } from "@/src/i18n/i18n-provider"

/**
 * Blocco mostrato quando nessun progetto è caricato: permette di crearne uno
 * nuovo (scegliendo la directory di lavoro) o di aprirne uno esistente da file.
 */
function NoProjectSelected() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  async function handleCreate() {
    const workpath = await open({ multiple: false, directory: true })
    if (!workpath) return

    dispatch(loadProject({
      metadata: { name: "", version: "", description: "" },
      modloader: { mcversion: "", type: modloaderTypes.FORGE, version: "" },
      assetes: [],
      notes: [],
      mods: [],
      datapacks: [],
      keybindMaps: [],
      keybindCategories: [],
      keybindTags: [],
      jvm: defaultJvmSettings(),
      configs: { workpath },
    }))
  }

  async function handleOpen() {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Project", extensions: ["json"] }],
    })
    if (!selected) return

    const file = await readTextFile(selected)
    const parsed = JSON.parse(file) as project
    // Normalizza i campi opzionali per i progetti salvati con versioni precedenti.
    dispatch(loadProject({
      ...parsed,
      assetes: parsed.assetes ?? [],
      notes: parsed.notes ?? [],
      mods: parsed.mods ?? [],
      datapacks: parsed.datapacks ?? [],
      keybindMaps: parsed.keybindMaps ?? [],
      keybindCategories: parsed.keybindCategories ?? [],
      keybindTags: parsed.keybindTags ?? [],
      jvm: parsed.jvm ?? defaultJvmSettings(),
    }))
  }

  return (
    <div className="h-[85vh] flex flex-col align-middle items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">{t("projectGate.noProjectSelected")}</h1>
      <p className="text-lg text-muted-foreground">{t("projectGate.getStarted")}</p>
      <div className="w-full max-w-xs space-y-2">
        <Button type="button" className="w-full" onClick={handleCreate}>{t("projectGate.create")}</Button>
        <Separator className="mb-2" />
        <Button type="button" className="w-full" onClick={handleOpen}>{t("projectGate.open")}</Button>
      </div>
    </div>
  )
}

/**
 * Guardia di pagina riutilizzabile: se non c'è un progetto caricato mostra il
 * blocco create/open; altrimenti rende i figli passando il progetto (non-null)
 * tramite render prop, così le pagine lo usano senza ulteriori controlli.
 *
 * Uso:
 *   <ProjectGate>{(project) => <MyContent project={project} />}</ProjectGate>
 */
export function ProjectGate({
  children,
}: {
  children: (project: project) => React.ReactNode
}) {
  const currentProject = useAppSelector((state) => state.project.project)

  if (!currentProject) return <NoProjectSelected />

  return <>{children(currentProject)}</>
}
