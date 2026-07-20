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
import { useTranslation } from "@/src/i18n/i18n-provider"

// Cartelle del modpack mostrate nell'albero (lette dalla workpath).
const ROOT_FOLDERS = ["config", "kubejs"]

// --- Helper immutabili per aggiornare l'albero -----------------------------
// `roots` è l'unica fonte di verità (niente più stato "ombra" parallelo):
// create/rename/delete la aggiornano sempre in modo sincrono e ottimistico.
// Tutti scendono ricorsivamente nei `children` finché non trovano il
// nodo/la cartella giusta, ricostruendo solo il ramo toccato.

/** Inserisce `newNode` come figlio della cartella con path `parentPath`. */
function insertFileNode(nodes: FileNode[], parentPath: string, newNode: FileNode): FileNode[] {
  let changed = false

  const result = nodes.map((node) => {
    if (!node.isDir) return node

    if (node.path === parentPath) {
      changed = true
      return { ...node, children: [...(node.children ?? []), newNode] }
    }

    if (node.children && node.children.length > 0) {
      const newChildren = insertFileNode(node.children, parentPath, newNode)
      if (newChildren !== node.children) {
        changed = true
        return { ...node, children: newChildren }
      }
    }

    return node
  })

  return changed ? result : nodes
}

/** Sostituisce il nodo con path `oldPath` con `newNode` (usato dal rename). */
function replaceFileNode(nodes: FileNode[], oldPath: string, newNode: FileNode): FileNode[] {
  let changed = false

  const result = nodes.map((node) => {
    if (node.path === oldPath) {
      changed = true
      return newNode
    }

    if (node.isDir && node.children && node.children.length > 0) {
      const newChildren = replaceFileNode(node.children, oldPath, newNode)
      if (newChildren !== node.children) {
        changed = true
        return { ...node, children: newChildren }
      }
    }

    return node
  })

  return changed ? result : nodes
}

/** Rimuove il nodo con path `path`, ovunque si trovi nell'albero. */
function removeFileNodeByPath(nodes: FileNode[], path: string): FileNode[] {
  let changed = false

  const result = nodes.reduce<FileNode[]>((acc, node) => {
    if (node.path === path) {
      changed = true
      return acc
    }
    if (node.isDir && node.children && node.children.length > 0) {
      const newChildren = removeFileNodeByPath(node.children, path)
      if (newChildren !== node.children) {
        changed = true
        acc.push({ ...node, children: newChildren })
        return acc
      }
    }
    acc.push(node)
    return acc
  }, [])

  return changed ? result : nodes
}

/**
 * Albero dei file di config/kubejs renderizzato direttamente nella sidebar.
 * Cliccando un file lo si apre nell'editor della pagina /documents (lo stato del
 * file selezionato vive in Redux, così sidebar ed editor sono disaccoppiati).
 * Si nasconde se non c'è un progetto caricato.
 */
export function NavFiles() {
  const { t } = useTranslation()
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

  // Create/rename/delete aggiornano `roots` direttamente e in modo sincrono:
  // l'UI riflette subito il cambiamento fatto su disco, senza dipendere da
  // (né essere in race con) un refetch di `read_dir_tree`. Il bottone
  // "Refresh" in alto resta comunque disponibile come resync manuale.
  const handleFileCreated = useCallback((newNode: FileNode, parentPath: string) => {
    setRoots((prevRoots) => insertFileNode(prevRoots, parentPath, newNode))
  }, [])

  const handleFileRenamed = useCallback((oldNode: FileNode, newNode: FileNode) => {
    setRoots((prevRoots) => replaceFileNode(prevRoots, oldNode.path, newNode))
  }, [])

  const handleFileDeleted = useCallback((node: FileNode) => {
    setRoots((prevRoots) => removeFileNodeByPath(prevRoots, node.path))
  }, [])

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
      <SidebarGroupLabel>{t("files.title")}</SidebarGroupLabel>
      <SidebarGroupAction title={t("files.refresh")} onClick={() => void loadTree()} disabled={loading}>
        <RefreshCcwIcon className={cn(loading && "animate-spin")} />
        <span className="sr-only">{t("files.refresh")}</span>
      </SidebarGroupAction>
      <ScrollArea className="h-[70vh]">
        <div className="px-1">
          {loading && roots.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("files.readingFolders")}</p>
          ) : roots.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("files.noFolder")}</p>
          ) : (
            <FileTree
              roots={roots}
              activePath={openFile?.path ?? null}
              onSelect={handleSelect}
              onFileCreated={handleFileCreated}
              onFileRenamed={handleFileRenamed}
              onFileDeleted={handleFileDeleted}
            />
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </SidebarGroup>
  )
}