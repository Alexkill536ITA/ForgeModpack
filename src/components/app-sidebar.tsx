// app-sidebar.tsx
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
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { join, dirname, basename } from "@tauri-apps/api/path"
import { toast } from "sonner"
import { useConfirm } from "../providers/confirm-dialog-provider"
import { exit } from "@tauri-apps/plugin-process"
import { setByPath } from "../lib/json-data"
import { useTranslation } from "@/src/i18n/i18n-provider"

// ============================================================================
// CONSTANTS - Magic strings e configurazioni centralizzate
// ============================================================================

const TOAST_POSITION = "top-right" as const
const PROJECT_FILE_EXTENSION = "json" as const

// ============================================================================
// HELPER FUNCTIONS - Errori handling robusto
// ============================================================================

function notifySuccess(message: string): void {
  toast.success(message, { position: TOAST_POSITION, style: toastStyles.success })
}

function notifyError(message: string, error?: unknown): void {
  if (error) console.error(error)
  toast.error(message, { position: TOAST_POSITION, style: toastStyles.destructive })
}

async function writeProjectFile(filePath: string, data: project): Promise<void> {
  try {
    const content = JSON.stringify(data, null, 2)
    await writeTextFile(filePath, content)
  } catch (error) {
    const errorMessage = `Failed to write file: ${filePath}`
    console.error(errorMessage, error)
    throw new Error(errorMessage, { cause: error })
  }
}

async function parseProjectFile(raw: string): Promise<project> {
  try {
    return JSON.parse(raw) as project
  } catch (error) {
    const errorMessage = "Failed to parse project file as JSON"
    console.error(errorMessage, error)
    throw new Error(errorMessage, { cause: error })
  }
}

// ============================================================================
// NAVIGATION ITEMS - Spostati fuori dal componente
// ============================================================================

const NAV_MAIN_ITEMS = [
  { titleKey: "sidebar.navDashboard", url: "/", icon: <LayoutDashboardIcon /> },
  { titleKey: "sidebar.navListMods", url: "/listmods", icon: <ListIcon /> },
  { titleKey: "sidebar.navKeybinds", url: "/keybinds", icon: <KeyboardIcon /> },
  { titleKey: "sidebar.navJvm", url: "/jvm", icon: <CpuIcon /> },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { confirm } = useConfirm()
  const dispatch = useAppDispatch()
  const projectState = useAppSelector((state) => state.project.project)
  const projectUnsaved = useAppSelector((state) => state.project.unsaved)

  // ========================================================================
  // ACTIONS - Definizione chiara dei tipi di ritorno
  // ========================================================================

  const clearProject = (): void => { dispatch(loadProject(null)) }

  /**
   * Conferma la discarica delle modifiche non salvate.
   * Ritorna true se si può procedere, false se l'utente ha annullato.
   */
  const confirmDiscardUnsavedChanges = async (): Promise<boolean> => {
    if (!projectUnsaved) return true

    const result = await confirm({
      type: "cancel/continue/save",
      title: t("sidebar.unsavedTitle"),
      message: t("sidebar.unsavedMessage"),
      without: true,
    })

    if (result === true) {
      await saveProject()
      return true
    }
    return result === "continue"
  }

  const newProject = async (): Promise<void> => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return

    const workpath = await open({ multiple: false, directory: true })
    if (!workpath) return

    clearProject()
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

  const openProject = async (): Promise<void> => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Project", extensions: [PROJECT_FILE_EXTENSION] }],
    })
    if (!selected) return

    let raw: string
    try {
      raw = await readTextFile(selected)
    } catch (error) {
      notifyError(t("sidebar.readFileFailed"), error)
      return
    }

    let parsed: project
    try {
      parsed = await parseProjectFile(raw)
    } catch (error) {
      notifyError(t("sidebar.invalidProjectFile"), error)
      return
    }

    clearProject()
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

  const closeProject = async (): Promise<void> => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return
    clearProject()
  }

  const saveProject = async (): Promise<void> => {
    if (!projectState) return

    if (!projectState.metadata.name.trim()) {
      notifyError(t("sidebar.setNameBeforeSaving"))
      return
    }

    try {
      const filePath = await join(projectState.configs.workpath, `${projectState.metadata.name}.${PROJECT_FILE_EXTENSION}`)
      await writeProjectFile(filePath, projectState)
      dispatch(markSaved())
      notifySuccess(t("sidebar.savedSuccessfully"))
    } catch (error) {
      notifyError(t("sidebar.saveFailed"), error)
    }
  }

  const saveAsProject = async (): Promise<void> => {
    if (!projectState) return

    try {
      const selected = await save({
        title: t("sidebar.saveProjectAs"),
        filters: [{ name: "Project", extensions: [PROJECT_FILE_EXTENSION] }],
      })
      if (!selected) return // utente ha annullato il dialog

      await writeProjectFile(selected, projectState)

      const newWorkpath = await dirname(selected)
      const newName = (await basename(selected)).replace(/\.${PROJECT_FILE_EXTENSION}$/i, "")

      dispatch(loadProject({
        ...projectState,
        metadata: { ...projectState.metadata, name: newName },
        configs: { ...projectState.configs, workpath: newWorkpath },
      }))
      dispatch(markSaved())
      notifySuccess(t("sidebar.savedSuccessfully"))
    } catch (error) {
      notifyError(t("sidebar.saveFailed"), error)
    }
  }

  const changeWorkspace = async (): Promise<void> => {
    if (!projectState) return

    const newWorkpath = await open({ multiple: false, directory: true })
    if (!newWorkpath) return

    dispatch(updateProject(setByPath(projectState, "configs.workpath", newWorkpath)))
  }

  const exitApp = async (): Promise<void> => {
    if (projectState && !(await confirmDiscardUnsavedChanges())) return
    await exit(0)
  }

  // ========================================================================
  // REFS & EFFECTS - Pattern actionsRef mantenuto ma migliorato
  // ========================================================================

  const actionsRef = React.useRef<{
    newProject: typeof newProject
    openProject: typeof openProject
    closeProject: typeof closeProject
    saveProject: typeof saveProject
    saveAsProject: typeof saveAsProject
    exitApp: typeof exitApp
  } | null>(null)

  React.useEffect(() => {
    actionsRef.current = { newProject, openProject, closeProject, saveProject, saveAsProject, exitApp }
  }, [newProject, openProject, closeProject, saveProject, saveAsProject, exitApp])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isShortcutModifierPressed = event.ctrlKey || event.metaKey
      if (!isShortcutModifierPressed) return

      const target = event.target as HTMLElement | null
      const isTypingContext =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        (target as HTMLTextAreaElement).isContentEditable
      if (isTypingContext) return

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault()
          actionsRef.current?.newProject()
          break
        case "o":
          event.preventDefault()
          actionsRef.current?.openProject()
          break
        case "w":
          event.preventDefault()
          actionsRef.current?.closeProject()
          break
        case "s":
          event.preventDefault()
          if (event.shiftKey) {
            actionsRef.current?.saveAsProject()
          } else {
            actionsRef.current?.saveProject()
          }
          break
        case "q":
          event.preventDefault()
          actionsRef.current?.exitApp()
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  // ========================================================================
  // RENDER
  // ========================================================================

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
              <DropdownMenuContent className="w-56" aria-label={t("sidebar.projectMenuAria")}>
                <DropdownMenuLabel>{t("sidebar.file")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="flex justify-between items-center"
                    onClick={newProject}
                    aria-label={t("sidebar.newAria")}
                  >
                    <span>{t("sidebar.new")}</span>
                    <span className="text-xs text-muted-foreground">Ctrl + N</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex justify-between items-center"
                    onClick={openProject}
                    aria-label={t("sidebar.openAria")}
                  >
                    <span>{t("sidebar.open")}</span>
                    <span className="text-xs text-muted-foreground">Ctrl + O</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!projectState}
                    className="flex justify-between items-center"
                    onClick={closeProject}
                    aria-label={t("sidebar.closeAria")}
                  >
                    <span>{t("sidebar.close")}</span>
                    <span className="text-xs text-muted-foreground">Ctrl + W</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!projectState}
                    className="flex justify-between items-center"
                    onClick={saveProject}
                    aria-label={t("sidebar.saveAria")}
                  >
                    <span>{t("sidebar.save")}</span>
                    <span className="text-xs text-muted-foreground">Ctrl + S</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!projectState}
                    className="flex justify-between items-center"
                    onClick={saveAsProject}
                    aria-label={t("sidebar.saveAsAria")}
                  >
                    <span>{t("sidebar.saveAs")}</span>
                    <span className="text-xs text-muted-foreground">Ctrl + Shift + S</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!projectState}
                  onClick={changeWorkspace}
                  aria-label={t("sidebar.changeWorkspaceAria")}
                >
                  <span>{t("sidebar.changeWorkspace")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex justify-between items-center text-destructive hover:bg-destructive/30!"
                  onClick={exitApp}
                  aria-label={t("sidebar.exitAria")}
                >
                  <span>{t("sidebar.exit")}</span>
                  <span className="text-xs text-muted-foreground">Ctrl + Q</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV_MAIN_ITEMS.map((item) => ({ ...item, title: t(item.titleKey) }))} />
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
