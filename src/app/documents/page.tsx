"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { SaveIcon, FilePenIcon, CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { ProjectGate } from "../../components/project-gate"
import { CodeEditor, usePageSaveShortcut, type CursorInfo, type Diagnostics } from "../../components/documents/code-editor"
import type { LineChange } from "../../lib/line-diff"
import { Button } from "../../components/ui/button"
import { Spinner } from "../../components/ui/spinner"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "../../components/ui/empty"
import { useAppDispatch, useAppSelector } from "../../redux/hooks"
import { openDocument } from "../../redux/documents-slice"
import { languageFromFilename, languageColor, hasSyntaxValidation } from "../../lib/file-language"
import { cn } from "../../lib/utils"
import { toastStyles } from "../../model/models"

function DocumentsEditor() {
  const dispatch = useAppDispatch()
  const openFile = useAppSelector((s) => s.documents.openFile)

  const [content, setContent] = useState<string | null>(null) // contenuto su disco
  const [draft, setDraft] = useState("") // contenuto correntemente nell'editor
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, lineCount: 0 })
  const [changes, setChanges] = useState<LineChange["counts"]>({ added: 0, modified: 0, removed: 0 })
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({ errors: 0, warnings: 0 })

  const dirty = content !== null && draft !== content
  const language = openFile ? languageFromFilename(openFile.name) : "plaintext"
  const validated = hasSyntaxValidation(language)

  // Tiene traccia del file effettivamente caricato e di quello precedente (per il
  // confronto/ripristino quando si cambia file con modifiche non salvate).
  const loadedPath = useRef<string | null>(null)
  const prevFile = useRef<typeof openFile>(null)

  useEffect(() => {
    if (!openFile) {
      loadedPath.current = null
      prevFile.current = null
      setContent(null)
      setDraft("")
      return
    }
    // Stesso file già caricato: niente da fare (l'effect rigira anche sui keystroke).
    if (loadedPath.current === openFile.path) return

    // Cambio file con modifiche non salvate: chiedi conferma, altrimenti ripristina
    // la selezione precedente nello store.
    if (content !== null && draft !== content && prevFile.current) {
      if (!confirm("Discard unsaved changes in the current file?")) {
        dispatch(openDocument(prevFile.current))
        return
      }
    }

    loadedPath.current = openFile.path
    prevFile.current = openFile
    setLoading(true)
    readTextFile(openFile.path)
      .then((c) => {
        setContent(c)
        setDraft(c)
      })
      .catch((err) => {
        console.error(err)
        toast.error("Could not open file", { style: toastStyles.destructive })
        setContent(null)
        setDraft("")
      })
      .finally(() => setLoading(false))
  }, [openFile, content, draft, dispatch])

  const handleSave = useCallback(async () => {
    if (!openFile || saving || content === null) return
    setSaving(true)
    try {
      await writeTextFile(openFile.path, draft)
      setContent(draft)
      toast.success(`Saved ${openFile.name}`, { style: toastStyles.success })
    } catch (err) {
      console.error(err)
      toast.error("Could not save file", { style: toastStyles.destructive })
    } finally {
      setSaving(false)
    }
  }, [openFile, draft, saving, content])

  // Ctrl/Cmd+S salva anche quando il focus è fuori dall'editor.
  usePageSaveShortcut(() => void handleSave(), dirty)

  if (!openFile) {
    return (
      <div className="rounded-xl border bg-card" style={{ height: "calc(90vh - 3rem)" }}>
        <Empty className="h-full border-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilePenIcon />
            </EmptyMedia>
            <EmptyTitle>No file open</EmptyTitle>
            <EmptyDescription>
              Pick a file from the Files tree in the sidebar to view and edit it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border bg-card"
      style={{ height: "calc(90vh - 3rem)" }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="truncate text-sm text-muted-foreground">
          {openFile.name}
          {dirty && <span className="ml-2 text-amber-400">● unsaved</span>}
        </span>
        <Button
          size="sm"
          variant={dirty ? "default" : "secondary"}
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
        >
          {saving ? <Spinner className="size-4" /> : <SaveIcon className="size-4" />}
          Save
        </Button>
      </div>
      <div className="relative flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-6" />
          </div>
        ) : (
          <CodeEditor
            filename={openFile.name}
            value={draft}
            original={content ?? ""}
            onChange={setDraft}
            onSave={() => void handleSave()}
            onCursorChange={setCursor}
            onChangesChange={setChanges}
            onDiagnostics={setDiagnostics}
          />
        )}
      </div>

      {/* Status bar (stile editor di codice): modifiche + cursore + tipo di file */}
      <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {/* Verifica di sintassi (solo per i linguaggi validati da Monaco) */}
          {validated &&
            (diagnostics.errors > 0 ? (
              <span className="flex items-center gap-1 font-medium text-red-400">
                <CircleXIcon className="size-3.5" /> {diagnostics.errors} error{diagnostics.errors > 1 ? "s" : ""}
              </span>
            ) : diagnostics.warnings > 0 ? (
              <span className="flex items-center gap-1 font-medium text-amber-400">
                <TriangleAlertIcon className="size-3.5" /> {diagnostics.warnings} warning{diagnostics.warnings > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="flex items-center gap-1 font-medium text-emerald-400">
                <CircleCheckIcon className="size-3.5" /> Valid
              </span>
            ))}
          <span>{cursor.lineCount} lines</span>
          {(changes.added > 0 || changes.modified > 0 || changes.removed > 0) && (
            <span className="flex items-center gap-2 font-medium">
              {changes.added > 0 && <span className="text-emerald-400">+{changes.added}</span>}
              {changes.modified > 0 && <span className="text-blue-400">~{changes.modified}</span>}
              {changes.removed > 0 && <span className="text-red-400">-{changes.removed}</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>Ln {cursor.line}, Col {cursor.column}</span>
          <span className={cn("font-medium uppercase", languageColor(languageFromFilename(openFile.name)))}>
            {languageFromFilename(openFile.name)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function DocumentsPage() {
  return <ProjectGate>{() => <DocumentsEditor />}</ProjectGate>
}
