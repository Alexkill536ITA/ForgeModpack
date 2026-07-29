"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useAppDispatch, useAppSelector } from "../redux/hooks"
import { updateProject } from "../redux/project-slice"
import { setKeybindActions } from "../redux/keybind-actions-slice"
import { resolveScanHint } from "../lib/forge-spec"
import { setByPath } from "../lib/json-data"
import {
  datapacksDir,
  diffDatapacks,
  diffMods,
  getDatapacksScanForLoad,
  getModsScanForLoad,
  hasChanges,
  toProjectDatapacks,
  toProjectMods,
  usesDatapacks,
  usesMods,
} from "../lib/mods-sync"
import { toastStyles } from "../model/models"
import { useBusy } from "../lib/use-busy"
import { useTranslation } from "@/src/i18n/i18n-provider"

/**
 * Componente headless montato nel layout: a ogni apertura di progetto rilegge
 * dal disco le mod e i datapack e aggiorna il project, così le liste non restano
 * congelate a quando il progetto è stato salvato (mod rimosse, aggiunte o
 * aggiornate fuori dall'app si vedono subito). Vive nel layout perché la
 * sincronizzazione non deve dipendere dalla pagina aperta.
 *
 * Il `project` viene aggiornato solo se qualcosa è davvero cambiato: così non
 * compare la SaveBar a vuoto. Quando cambia, un toast dice cosa è cambiato.
 * Nella stessa apertura le letture successive (pagine, refresh) riusano la cache
 * SQLite: vedi [`mods-sync.ts`](../lib/mods-sync.ts).
 *
 * Le guardie `appliedFor` sono controllate e impostate dopo l'await, non
 * prima: in dev React StrictMode invoca l'effect due volte e una guardia messa
 * prima farebbe scartare l'unico lavoro avviato. Così invece le due invocazioni
 * condividono la stessa scansione (dedup in `mods-sync.ts`) e solo la prima che
 * arriva applica il risultato.
 */
export function ModsSync() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  // Apre i jar: operazione pesante → overlay bloccante (vedi `use-busy.ts`).
  const busy = useBusy()
  const project = useAppSelector((s) => s.project.project)
  const loadId = useAppSelector((s) => s.project.loadId)

  // Ref sempre aggiornati: tra un await e l'altro l'utente può aver modificato il
  // progetto o la lingua, quindi si parte sempre dallo stato più recente.
  const projectRef = useRef(project)
  projectRef.current = project
  const tRef = useRef(t)
  tRef.current = t

  // Le guardie sono per (cartella, apertura): così anche un cambio di cartella di
  // lavoro o di cartella datapack fa ripartire la sincronizzazione.
  const modsAppliedFor = useRef<string | null>(null)
  const datapacksAppliedFor = useRef<string | null>(null)

  const workpath = project?.configs.workpath ?? ""
  const datapacksPath = project?.configs.datapacksPath

  useEffect(() => {
    const opened = projectRef.current
    if (!opened || !workpath) return
    const modsKey = `${workpath}::${loadId}`

    // --- Mod ---
    if (usesMods(opened) && modsAppliedFor.current !== modsKey) {
      void (async () => {
        try {
          const hint = await resolveScanHint(opened)
          const scanned = await busy(
            tRef.current("busy.scanningMods"),
            () => getModsScanForLoad(workpath, loadId, hint),
            { detail: workpath }
          )
          if (modsAppliedFor.current === modsKey) return // già applicato
          modsAppliedFor.current = modsKey

          // Azioni keybind per la pagina Keybinds (slice runtime).
          dispatch(
            setKeybindActions({
              workpath,
              mods: scanned
                .filter((m) => m.modId && m.keybinds.length > 0)
                .map((m) => ({ filename: m.filename, modId: m.modId, keybinds: m.keybinds })),
            })
          )

          const latest = projectRef.current
          if (!latest) return
          const mods = toProjectMods(scanned, latest.mods)
          const diff = diffMods(latest.mods, mods)
          if (!hasChanges(diff)) return
          dispatch(updateProject(setByPath(latest, "mods", mods)))
          toast.info(tRef.current("modsSync.modsUpdated", { ...diff }), {
            position: "top-right",
            style: toastStyles.info,
          })
        } catch (err) {
          // Cartella mods assente o illeggibile: lo stato lo mostra List Mods.
          console.error(err)
        }
      })()
    }

    // --- Datapack ---
    if (usesDatapacks(opened)) {
      void (async () => {
        try {
          const dir = await datapacksDir(opened)
          const datapacksKey = `${dir}::${loadId}`
          if (datapacksAppliedFor.current === datapacksKey) return
          const scanned = await busy(
            tRef.current("busy.scanningDatapacks"),
            () => getDatapacksScanForLoad(dir, loadId),
            { detail: dir }
          )
          if (datapacksAppliedFor.current === datapacksKey) return
          datapacksAppliedFor.current = datapacksKey

          const latest = projectRef.current
          if (!latest) return
          const datapacks = toProjectDatapacks(scanned, latest.datapacks ?? [])
          const diff = diffDatapacks(latest.datapacks ?? [], datapacks)
          if (!hasChanges(diff)) return
          dispatch(updateProject(setByPath(latest, "datapacks", datapacks)))
          toast.info(tRef.current("modsSync.datapacksUpdated", { ...diff }), {
            position: "top-right",
            style: toastStyles.info,
          })
        } catch (err) {
          console.error(err)
        }
      })()
    }
  }, [workpath, datapacksPath, loadId, dispatch, busy])

  return null
}
