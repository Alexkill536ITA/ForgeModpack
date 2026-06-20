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
} from "lucide-react"
import { exists, writeTextFile } from "@tauri-apps/plugin-fs"
import { join } from "@tauri-apps/api/path"

import { cn } from "../../lib/utils"

// Nodo dell'albero, rispecchia la struct `FileNode` del comando Rust `read_dir_tree`.
export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[] | null
}

/** Icona del file in base all'estensione (solo estetica). */
function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
  if (["json", "json5", "jsonc", "mcmeta"].includes(ext)) return FileJsonIcon
  if (["js", "mjs", "cjs", "ts", "zs"].includes(ext)) return FileCodeIcon
  if (["toml", "cfg", "conf", "ini", "properties"].includes(ext)) return FileCogIcon
  return FileIcon
}

/**
 * Unisce i figli "reali" (arrivati da `roots`) con quelli creati localmente
 * non ancora confermati da un refetch del backend. Deduplica per `path`: se
 * il genitore alla fine ricarica l'albero e il file reale appare, quello
 * "ottimistico" smette automaticamente di essere mostrato due volte.
 */
function mergeChildren(real: FileNode[] | null | undefined, extra: FileNode[] | undefined) {
  if (!extra || extra.length === 0) return real ?? []
  const realPaths = new Set((real ?? []).map((c) => c.path))
  const onlyNew = extra.filter((c) => !realPaths.has(c.path))
  return [...(real ?? []), ...onlyNew]
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
          placeholder="nome-file.json"
          className="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </li>
  )
}

function TreeNode({
  node,
  depth,
  activePath,
  onSelect,
  onFileCreated,
  createdChildren,
  addCreatedChild,
}: {
  node: FileNode
  depth: number
  activePath: string | null
  onSelect: (node: FileNode) => void
  onFileCreated?: (node: FileNode, parent: FileNode) => void
  createdChildren: Record<string, FileNode[]>
  addCreatedChild: (parentPath: string, node: FileNode) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rientro proporzionale alla profondità (la riga parte sempre dal bordo).
  const pad = { paddingLeft: `${depth * 0.75 + 0.5}rem` }

  async function handleCreate(name: string) {
    setError(null)
    try {
      const fullPath = await join(node.path, name)

      if (await exists(fullPath)) {
        setError("Esiste già un file con questo nome")
        return
      }

      await writeTextFile(fullPath, "")

      const newNode: FileNode = { name, path: fullPath, isDir: false }
      // Aggiornamento ottimistico: il file appare subito nell'albero anche
      // se il genitore non ricarica `roots`.
      addCreatedChild(node.path, newNode)
      onFileCreated?.(newNode, node)
      onSelect(newNode)
      setCreating(false)
    } catch (err) {
      console.error("Creazione file fallita:", err)
      setError("Creazione file fallita")
    }
  }

  if (node.isDir) {
    const Folder = open ? FolderOpenIcon : FolderIcon
    const children = mergeChildren(node.children, createdChildren[node.path])

    return (
      <li>
        <div className="group flex w-full items-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={pad}
            className="flex flex-1 items-center gap-1.5 rounded-sm py-1 pr-1 text-sm hover:bg-accent"
          >
            <ChevronRightIcon
              className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
            <Folder className="size-4 shrink-0 text-sky-400" />
            <span className="truncate" title={node.name}>{node.name}</span>
          </button>
          <button
            type="button"
            title="Nuovo file"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
              setCreating(true)
            }}
            className="mr-1 shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            <PlusIcon className="size-3.5" />
          </button>
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
                activePath={activePath}
                onSelect={onSelect}
                onFileCreated={onFileCreated}
                createdChildren={createdChildren}
                addCreatedChild={addCreatedChild}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const Icon = fileIcon(node.name)
  const active = activePath === node.path
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node)}
        style={pad}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm py-1 pr-2 text-sm hover:bg-accent",
          active && "bg-accent font-medium"
        )}
      >
        {/* Spaziatore largo come il chevron delle cartelle, per allineare i nomi. */}
        <span className="size-3.5 shrink-0" />
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate" title={node.name}>{node.name}</span>
      </button>
    </li>
  )
}

/**
 * Albero di file espandibile. Le `roots` sono le cartelle radice (es. `config`,
 * `kubejs`); ognuna è renderizzata come nodo cartella aperto di default.
 */
export function FileTree({
  roots,
  activePath,
  onSelect,
  onFileCreated,
}: {
  roots: FileNode[]
  activePath: string | null
  onSelect: (node: FileNode) => void
  /** Chiamato dopo aver creato un file, con il nuovo nodo e la cartella padre — usalo se vuoi anche ricaricare l'albero dal backend. */
  onFileCreated?: (node: FileNode, parent: FileNode) => void
}) {
  // Mappa path-cartella -> file creati localmente non ancora presenti in `roots`.
  // Senza questo stato il file scritto su disco non comparirebbe nell'albero
  // finché `roots` non viene ricalcolato e passato di nuovo da fuori.
  const [createdChildren, setCreatedChildren] = useState<Record<string, FileNode[]>>({})

  function addCreatedChild(parentPath: string, node: FileNode) {
    setCreatedChildren((prev) => ({
      ...prev,
      [parentPath]: [...(prev[parentPath] ?? []), node],
    }))
  }

  return (
    <ul className="select-none">
      {roots.map((root) => (
        <TreeNode
          key={root.path}
          node={root}
          depth={0}
          activePath={activePath}
          onSelect={onSelect}
          onFileCreated={onFileCreated}
          createdChildren={createdChildren}
          addCreatedChild={addCreatedChild}
        />
      ))}
    </ul>
  )
}