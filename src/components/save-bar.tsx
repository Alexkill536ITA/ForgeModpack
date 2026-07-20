"use client"

import { create } from "@tauri-apps/plugin-fs"
import { join } from "@tauri-apps/api/path"
import { toast } from "sonner"
import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import { useAppDispatch, useAppSelector } from "../redux/hooks"
import { markSaved } from "../redux/project-slice"
import { toastStyles } from "../model/models"
import { useTranslation } from "@/src/i18n/i18n-provider"

/**
 * Barra globale di salvataggio: mostra un alert quando il progetto ha modifiche
 * non salvate e permette di scriverle su file. Montata nel layout, quindi
 * disponibile in ogni pagina. La sorgente di verità è `state.project.unsaved`.
 */
export function SaveBar() {
  const { t } = useTranslation()
  const project = useAppSelector((state) => state.project.project)
  const unsaved = useAppSelector((state) => state.project.unsaved)
  const dispatch = useAppDispatch()

  if (!project || !unsaved) return null

  async function handleSave() {
    if (!project) return

    if (!project.metadata.name.trim()) {
      toast.error(t("saveBar.setNameBeforeSaving"), {
        position: "top-right", style: toastStyles.destructive,
      })
      return
    }

    try {
      const filePath = await join(project.configs.workpath, `${project.metadata.name}.json`)
      const file = await create(filePath)
      await file.write(new TextEncoder().encode(JSON.stringify(project, null, 2)))
      await file.close()

      dispatch(markSaved())
      toast.success(t("saveBar.savedSuccessfully"), {
        position: "top-right", style: toastStyles.success,
      })
    } catch (error) {
      console.error(error)
      toast.error(t("saveBar.saveFailed"), {
        position: "top-right", style: toastStyles.destructive,
      })
    }
  }

  return (
    <Alert className="border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400">
      <CircleAlertIcon />
      <AlertTitle>{t("saveBar.unsavedTitle")}</AlertTitle>
      <AlertDescription className="text-amber-600/80 dark:text-amber-400/80">
        {t("saveBar.unsavedDescription")}
      </AlertDescription>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button type="button" variant="outline" onClick={handleSave}>{t("saveBar.save")}</Button>
      </AlertAction>
    </Alert>
  )
}
