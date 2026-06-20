"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { invoke } from "@tauri-apps/api/core"
import { join } from "@tauri-apps/api/path"
import { RefreshCcwIcon } from "lucide-react"

import { FileTree, type FileNode } from "./documents/file-tree"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
} from "./ui/sidebar"
import { cn } from "../lib/utils"
import { useAppDispatch, useAppSelector } from "../redux/hooks"
import { openDocument } from "../redux/documents-slice"
import { ScrollArea, ScrollBar } from "./ui/scroll-area"

// Cartelle del modpack mostrate nell'albero (lette dalla workpath).
const ROOT_FOLDERS = ["config", "kubejs"]

/**
 * Albero dei file di config/kubejs renderizzato direttamente nella sidebar.
 * Cliccando un file lo si apre nell'editor della pagina /documents (lo stato del
 * file selezionato vive in Redux, così sidebar ed editor sono disaccoppiati).
 * Si nasconde se non c'è un progetto caricato.
 */
export function NavFiles() {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const project = useAppSelector((s) => s.project.project)
  const openFile = useAppSelector((s) => s.documents.openFile)
  const workpath = project?.configs.workpath ?? null

  const [roots, setRoots] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)

  const loadTree = useCallback(async () => {
    if (!workpath) {
      setRoots([])
      return
    }
    setLoading(true)
    try {
      const found: FileNode[] = []
      for (const folder of ROOT_FOLDERS) {
        const dir = await join(workpath, folder)
        try {
          const children = await invoke<FileNode[]>("read_dir_tree", { dir })
          found.push({ name: folder, path: dir, isDir: true, children })
        } catch {
          // cartella inesistente: la ignoriamo
        }
      }
      setRoots(found)
    } finally {
      setLoading(false)
    }
  }, [workpath])

  // Ricarica al cambio di workpath.
  const initialized = useRef<string | null>(null)
  useEffect(() => {
    if (initialized.current === workpath) return
    initialized.current = workpath
    void loadTree()
  }, [workpath, loadTree])

  if (!project) return null

  function handleSelect(node: FileNode) {
    dispatch(openDocument({ path: node.path, name: node.name }))
    router.push("/documents")
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Files</SidebarGroupLabel>
      <SidebarGroupAction title="Refresh" onClick={() => void loadTree()} disabled={loading}>
        <RefreshCcwIcon className={cn(loading && "animate-spin")} />
        <span className="sr-only">Refresh</span>
      </SidebarGroupAction>
      <ScrollArea className="h-[70vh]">
        <div className="px-1">
          {loading && roots.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Reading folders…</p>
          ) : roots.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No config/kubejs folder.</p>
          ) : (
            <FileTree roots={roots} activePath={openFile?.path ?? null} onSelect={handleSelect} />
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </SidebarGroup>
  )
}
