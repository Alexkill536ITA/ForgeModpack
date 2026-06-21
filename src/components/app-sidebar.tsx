"use client"

import * as React from "react"

import { NavFiles } from "../components/nav-files"
import { NavMain } from "../components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "../components/ui/sidebar"
import { LayoutDashboardIcon, ListIcon, HammerIcon, CopyrightIcon, KeyboardIcon, CpuIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Button } from "./ui/button"
import { useAppDispatch, useAppSelector } from "../redux/hooks"
import { loadProject, markSaved, updateProject } from "../redux/project-slice"
import { open, save } from "@tauri-apps/plugin-dialog"
import { defaultJvmSettings, modloaderTypes, project, toastStyles } from "../model/models"
import { create, readTextFile } from "@tauri-apps/plugin-fs"
import { join, dirname, basename } from "@tauri-apps/api/path"
import { toast } from "sonner"
import { useConfirm } from "../providers/confirm-dialog-provider"
import { exit } from "@tauri-apps/plugin-process"
import { setByPath } from "../lib/json-data"

// Voci di navigazione principali. Spostate fuori dal componente: l'oggetto
// non dipende da props/state, quindi non serve ricrearlo ad ogni render.
const NAV_MAIN_ITEMS = [
  { title: "Dashboard", url: "/", icon: <LayoutDashboardIcon /> },
  { title: "List Mods", url: "/listmods", icon: <ListIcon /> },
  { title: "keybinds", url: "/keybinds", icon: <KeyboardIcon /> },
  { title: "JVM", url: "/jvm", icon: <CpuIcon /> },
]

function notifySuccess(message: string) {
  toast.success(message, { position: "top-right", style: toastStyles.success })
}

function notifyError(message: string, error?: unknown) {
  if (error) console.error(error)
  toast.error(message, { position: "top-right", style: toastStyles.destructive })
}

async function writeProjectFile(filePath: string, data: project) {
  const file = await create(filePath)
  try {
    await file.write(new TextEncoder().encode(JSON.stringify(data, null, 2)))
  } finally {
    await file.close()
  }
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { confirm } = useConfirm()
  const dispatch = useAppDispatch()
  const projectState = useAppSelector((state) => state.project.project)
  const projectUnsaved = useAppSelector((state) => state.project.unsaved)

  const clearProject = () => dispatch(loadProject(null))

  /**
   * Se ci sono modifiche non salvate, chiede conferma all'utente.
   * Ritorna true se si può procedere con l'azione richiesta (new/open/close/exit).
   */
  const confirmDiscardUnsavedChanges = async () => {
    if (!projectUnsaved) return true

    const result = await confirm({
      type: "cancel/continue/save",
      title: "Warning Unsaved Changes",
      message: "You have unsaved changes. Do you want to save them?",
      whitout: true,
    })

    if (result === true) {
      await saveProject()
      return true
    }
    return result === "continue"
  }

  const newProject = async () => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return

    const workpath = await open({ multiple: false, directory: true })
    if (!workpath) return

    clearProject()
    dispatch(loadProject({
      metadata: { name: "", version: "", description: "" },
      modloader: { mcversion: "", type: modloaderTypes.FORGE, version: "" },
      assetes: [],
      mods: [],
      keybindMaps: [],
      keybindCategories: [],
      keybindTags: [],
      jvm: defaultJvmSettings(),
      configs: { workpath },
    }))
  }

  const openProject = async () => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Project", extensions: ["json"] }],
    })
    if (!selected) return

    const raw = await readTextFile(selected)
    const parsed = JSON.parse(raw) as project

    clearProject()
    // Normalizza i campi opzionali per i progetti salvati con versioni precedenti.
    dispatch(loadProject({
      ...parsed,
      assetes: parsed.assetes ?? [],
      mods: parsed.mods ?? [],
      keybindMaps: parsed.keybindMaps ?? [],
      keybindCategories: parsed.keybindCategories ?? [],
      keybindTags: parsed.keybindTags ?? [],
      jvm: parsed.jvm ?? defaultJvmSettings(),
    }))
  }

  const closeProject = async () => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return
    clearProject()
  }

  const saveProject = async () => {
    if (!projectState) return

    if (!projectState.metadata.name.trim()) {
      notifyError("Set a project name before saving")
      return
    }

    try {
      const filePath = await join(projectState.configs.workpath, `${projectState.metadata.name}.json`)
      await writeProjectFile(filePath, projectState)
      dispatch(markSaved())
      notifySuccess("Saved successfully")
    } catch (error) {
      notifyError("Save failed", error)
    }
  }

  const saveAsProject = async () => {
    if (!projectState) return

    try {
      const selected = await save({
        title: "Save Project As",
        filters: [{ name: "Project", extensions: ["json"] }],
      })
      if (!selected) return // utente ha annullato il dialog

      await writeProjectFile(selected, projectState)

      // Aggiorna nome e workpath del progetto in base alla nuova destinazione,
      // così il prossimo "Save" semplice salverà nello stesso posto.
      const newWorkpath = await dirname(selected)
      const newName = (await basename(selected)).replace(/\.json$/i, "")

      dispatch(loadProject({
        ...projectState,
        metadata: { ...projectState.metadata, name: newName },
        configs: { ...projectState.configs, workpath: newWorkpath },
      }))
      dispatch(markSaved())
      notifySuccess("Saved successfully")
    } catch (error) {
      notifyError("Save failed", error)
    }
  }

  const changeWorkspace = async () => {
    if (!projectState) return

    const newWorkpath = await open({ multiple: false, directory: true })
    if (!newWorkpath) return

    dispatch(updateProject(setByPath(projectState, "configs.workpath", newWorkpath)))
  }

  const exitApp = async () => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return
    await exit(0)
  }

  // Le azioni vengono ricreate ad ogni render (chiudono su projectState/projectUnsaved
  // aggiornati). Le teniamo in un ref così il listener globale può restare montato
  // una sola volta invece di essere ri-registrato ad ogni render.
  const actionsRef = React.useRef({ newProject, openProject, closeProject, saveProject, saveAsProject, exitApp })
  React.useEffect(() => {
    actionsRef.current = { newProject, openProject, closeProject, saveProject, saveAsProject, exitApp }
  })

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcutModifierPressed = event.ctrlKey || event.metaKey
      if (!isShortcutModifierPressed) return

      // Evita di intercettare le scorciatoie mentre l'utente sta scrivendo
      // in un campo di testo (es. nome progetto).
      const target = event.target as HTMLElement | null
      const isTypingContext = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable
      if (isTypingContext) return

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault()
          actionsRef.current.newProject()
          break
        case "o":
          event.preventDefault()
          actionsRef.current.openProject()
          break
        case "w":
          event.preventDefault()
          actionsRef.current.closeProject()
          break
        case "s":
          event.preventDefault()
          if (event.shiftKey) {
            actionsRef.current.saveAsProject()
          } else {
            actionsRef.current.saveProject()
          }
          break
        case "q":
          event.preventDefault()
          actionsRef.current.exitApp()
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <HammerIcon className="size-5!" />
                  <span className="text-base font-semibold">Forge Modpack</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>File</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="flex justify-between items-center" onClick={newProject}>
                    <span>New</span>
                    <span className="text-xs text-muted-foreground">Ctrl + N</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="flex justify-between items-center" onClick={openProject}>
                    <span>Open</span>
                    <span className="text-xs text-muted-foreground">Ctrl + O</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!projectState} className="flex justify-between items-center" onClick={closeProject}>
                    <span>Close</span>
                    <span className="text-xs text-muted-foreground">Ctrl + W</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={!projectState} className="flex justify-between items-center" onClick={saveProject}>
                    <span>Save</span>
                    <span className="text-xs text-muted-foreground">Ctrl + S</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!projectState} className="flex justify-between items-center" onClick={saveAsProject}>
                    <span>Save As</span>
                    <span className="text-xs text-muted-foreground">Ctrl + Shift + S</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!projectState} onClick={changeWorkspace}>
                  <span>Change Workspace</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="flex justify-between items-center text-destructive hover:bg-destructive/30!"
                    onClick={exitApp}
                  >
                    <span>Exit</span>
                    <span className="text-xs text-muted-foreground">Ctrl + Q</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV_MAIN_ITEMS} />
        <NavFiles />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex gap-2 items-center">
          <CopyrightIcon size={16} />
          <span className="text-xs">2026 Forge Modpack by Alexkill536ITA</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}