"use client"

import { useEffect, useRef, useState } from "react"
import {
  ChevronRightIcon,
  FileIcon,
  FileJsonIcon,
  FileCodeIcon,
  FileCogIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
} from "lucide-react"
import { exists, writeTextFile, remove, rename } from "@tauri-apps/plugin-fs"
import { join } from "@tauri-apps/api/path"

import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { useConfirm } from "@/src/providers/confirm-dialog-provider"
import { useTranslation } from "@/src/i18n/i18n-provider"

// Nodo dell'albero, rispecchia la struct `FileNode` del comando Rust `read_dir_tree`.
export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[] | null
  parent?: FileNode | null
}

/** Icona del file in base all'estensione (solo estetica). */
function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
  if (["json", "json5", "jsonc", "mcmeta"].includes(ext)) return FileJsonIcon
  if (["js", "mjs", "cjs", "ts", "zs"].includes(ext)) return FileCodeIcon
  if (["toml", "cfg", "conf", "ini", "properties"].includes(ext)) return FileCogIcon
  return FileIcon
}

/** Riga di input inline per il nome del nuovo file, allineata come una voce dell'albero. */
function NewFileRow({
  depth,
  onConfirm,
  onCancel,
}: {
  depth: number
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()
  const pad = { paddingLeft: `${depth * 0.75 + 0.5}rem` }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit() {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
    else onCancel()
  }

  return (
    <li>
      <div style={pad} className="flex w-full items-center gap-1.5 py-1 pr-2 text-sm">
        <span className="size-3.5 shrink-0" />
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              onCancel()
            }
          }}
          placeholder={t("fileTree.newFilePlaceholder")}
          className="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </li>
  )
}

function TreeNode({
  node,
  depth,
  parentPath,
  activePath,
  onSelect,
  onFileCreated,
  onFileRenamed,
  onFileDeleted,
}: {
  node: FileNode
  depth: number
  /** Path della cartella che contiene direttamente questo nodo (null solo per le root). */
  parentPath: string | null
  activePath: string | null
  onSelect: (node: FileNode) => void
  onFileCreated: (node: FileNode, parentPath: string) => void
  onFileRenamed: (oldNode: FileNode, newNode: FileNode) => void
  onFileDeleted: (node: FileNode) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Hook in cima al componente: non deve dipendere da rami condizionali
  // (node.isDir), altrimenti viola le regole degli hook di React.
  const { confirm } = useConfirm()
  const { t } = useTranslation()

  // Rientro proporzionale alla profondità (la riga parte sempre dal bordo).
  const pad = { paddingLeft: `${depth * 0.75 + 0.5}rem` }

  async function handleCreate(name: string) {
    setError(null)
    try {
      const fullPath = await join(node.path, name)

      if (await exists(fullPath)) {
        setError(t("fileTree.errorFileExists"))
        return
      }

      await writeTextFile(fullPath, "")

      const newNode: FileNode = { name, path: fullPath, isDir: false, parent: node }
      // Il genitore (FileTree -> NavFiles) inserisce subito il nodo nella sua
      // unica fonte di verità (`roots`): l'albero si aggiorna senza dover
      // aspettare un refetch dal backend.
      onFileCreated(newNode, node.path)
      onSelect(newNode)
      setCreating(false)
    } catch (err) {
      console.error("Creazione file fallita:", err)
      setError(t("fileTree.errorCreateFailed"))
    }
  }

  if (node.isDir) {
    const Folder = open ? FolderOpenIcon : FolderIcon
    const children = node.children ?? []

    return (
      <li>
        <div className="group flex w-full items-center">
          <Button
            variant={"ghost"}
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={pad}
            className="flex flex-1 items-center gap-1.5 rounded-sm py-1 pr-1 text-sm justify-start hover:bg-accent"
          >
            <ChevronRightIcon
              className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
            <Folder className="size-4 shrink-0 text-sky-400" />
            <span className="truncate" title={node.name}>{node.name}</span>
          </Button>
          <Button
            variant={"ghost"}
            type="button"
            title={t("fileTree.newFile")}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
              setCreating(true)
            }}
            className="mr-1 shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </div>

        {error && (
          <p style={pad} className="py-0.5 text-xs text-destructive">
            {error}
          </p>
        )}

        {open && (
          <ul>
            {creating && (
              <NewFileRow
                depth={depth + 1}
                onConfirm={handleCreate}
                onCancel={() => setCreating(false)}
              />
            )}
            {children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                parentPath={node.path}
                activePath={activePath}
                onSelect={onSelect}
                onFileCreated={onFileCreated}
                onFileRenamed={onFileRenamed}
                onFileDeleted={onFileDeleted}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const Icon = fileIcon(node.name)
  const active = activePath === node.path

  async function handleRename(newName: string) {
    setError(null)

    if (!parentPath) {
      // Non dovrebbe succedere: solo i file (mai le root, che sono cartelle)
      // possono essere rinominati, e ogni file ha sempre una cartella padre.
      console.error("Rinomina fallita: percorso padre sconosciuto")
      setError(t("fileTree.errorRenameFailed"))
      return
    }

    try {
      // Niente più parsing manuale del path (che assumeva il backslash di
      // Windows): si usa l'utility di path di Tauri, cross-platform.
      const fullPath = await join(parentPath, newName)

      if (fullPath !== node.path && (await exists(fullPath))) {
        setError(t("fileTree.errorFileExists"))
        return
      }

      await rename(node.path, fullPath)

      const newNode: FileNode = { ...node, name: newName, path: fullPath }

      // Il genitore sostituisce direttamente il vecchio nodo col nuovo:
      // nessun reload necessario, nessuna race tra rimozione e refetch.
      onFileRenamed(node, newNode)
      onSelect(newNode)
    } catch (err) {
      console.error("Rinomina fallita:", err)
      setError(t("fileTree.errorRenameFailed"))
    }
  }

  async function handleDelete() {
    const res = await confirm({ type: "delete", title: t("fileTree.deleteConfirmTitle", { name: node.name }) })
    if (!res) return
    try {
      await remove(node.path)
      onFileDeleted(node)
    } catch (err) {
      console.error("Eliminazione fallita:", err)
      alert(t("fileTree.errorDeleteFailed"))
    }
  }

  return (
    <li>
      <div className="group flex w-full items-center">
        <Button
          variant={"ghost"}
          type="button"
          onClick={() => onSelect(node)}
          style={pad}
          className={cn(
            "flex flex-1 items-center gap-1.5 rounded-sm py-1 pr-2 text-sm justify-start hover:bg-accent",
            active && "bg-accent font-medium"
          )}
        >
          {/* Spaziatore largo come il chevron delle cartelle, per allineare i nomi. */}
          <span className="size-3.5 shrink-0" />
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1 text-start" title={node.name}>
            {node.name}
          </span>
        </Button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <Button
            variant={"ghost"}
            type="button"
            title={t("fileTree.rename")}
            onClick={(e) => {
              e.stopPropagation()
              const newName = prompt(t("fileTree.renamePrompt"), node.name)
              if (newName && newName !== node.name) void handleRename(newName)
            }}
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:opacity-100"
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            variant={"ghost"}
            type="button"
            title={t("fileTree.delete")}
            onClick={(e) => {
              e.stopPropagation()
              void handleDelete()
            }}
            className="rounded-sm p-1 text-muted-foreground hover:bg-destructive/30! hover:text-foreground focus-visible:opacity-100"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>
      {error && (
        <p style={pad} className="py-0.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}

/**
 * Albero di file espandibile. Le `roots` sono le cartelle radice (es. `config`,
 * `kubejs`); ognuna è renderizzata come nodo cartella aperto di default.
 *
 * Creazione, rename ed eliminazione sono completamente ottimistici: ogni
 * callback riceve già il nodo pronto (o il vecchio nodo da rimuovere) e tocca
 * a chi possiede `roots` (tipicamente NavFiles) inserirlo/sostituirlo/
 * rimuoverlo nell'albero, senza dover aspettare un refetch dal backend.
 */
export function FileTree({
  roots,
  activePath,
  onSelect,
  onFileCreated,
  onFileRenamed,
  onFileDeleted,
}: {
  roots: FileNode[]
  activePath: string | null
  onSelect: (node: FileNode) => void
  /** Chiamato dopo aver creato un file: nuovo nodo + path della cartella padre. */
  onFileCreated: (node: FileNode, parentPath: string) => void
  /** Chiamato dopo aver rinominato un file: vecchio nodo + nuovo nodo. */
  onFileRenamed: (oldNode: FileNode, newNode: FileNode) => void
  /** Chiamato dopo aver eliminato un file. */
  onFileDeleted: (node: FileNode) => void
}) {
  return (
    <ul className="select-none">
      {roots.map((root) => (
        <TreeNode
          key={root.path}
          node={root}
          depth={0}
          parentPath={null}
          activePath={activePath}
          onSelect={onSelect}
          onFileCreated={onFileCreated}
          onFileRenamed={onFileRenamed}
          onFileDeleted={onFileDeleted}
        />
      ))}
    </ul>
  )
}