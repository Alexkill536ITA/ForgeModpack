"use client"

import { useEffect, useRef } from "react"
import Editor, { type OnMount, type Monaco } from "@monaco-editor/react"
import type { editor as MonacoEditor, Uri } from "monaco-editor"

import { setupMonacoLoader } from "../../lib/monaco-setup"
import { languageFromFilename } from "../../lib/file-language"
import { diffLines, type LineChange } from "../../lib/line-diff"
import { Spinner } from "../ui/spinner"

// Punta il loader agli asset locali (offline) una sola volta, al primo import.
setupMonacoLoader()

/** Posizione del cursore (1-based) + righe totali, per la status bar. */
export interface CursorInfo {
  line: number
  column: number
  lineCount: number
}

/** Esito della validazione di sintassi (dai marker di Monaco). */
export interface Diagnostics {
  errors: number
  warnings: number
}

/**
 * Wrapper di Monaco Editor. Mostra/edita il contenuto del file aperto, deduce il
 * linguaggio dal nome file e notifica le modifiche al parent (che traccia il
 * "dirty" e salva). `onSave` viene invocato anche da Ctrl/Cmd+S dentro l'editor.
 * `original` è il contenuto su disco: il diff con `value` alimenta i marcatori
 * "dirty diff" nel gutter e il conteggio modifiche (`onChangesChange`).
 */
export function CodeEditor({
  filename,
  value,
  original,
  onChange,
  onSave,
  onCursorChange,
  onChangesChange,
  onDiagnostics,
}: {
  filename: string
  value: string
  original: string
  onChange: (value: string) => void
  onSave: () => void
  onCursorChange?: (info: CursorInfo) => void
  onChangesChange?: (counts: LineChange["counts"]) => void
  onDiagnostics?: (diag: Diagnostics) => void
}) {
  // Ref sempre aggiornati alle callback: gli handler Monaco sono registrati una
  // volta sola al mount, ma devono chiamare le versioni correnti.
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const cursorRef = useRef(onCursorChange)
  cursorRef.current = onCursorChange
  const changesRef = useRef(onChangesChange)
  changesRef.current = onChangesChange
  const diagRef = useRef(onDiagnostics)
  diagRef.current = onDiagnostics
  const originalRef = useRef(original)
  originalRef.current = original

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const decorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)

  // Ricalcola i marcatori dirty-diff confrontando il testo corrente col disco.
  const refreshDiff = () => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return

    const change = diffLines(originalRef.current, model.getValue())
    changesRef.current?.(change.counts)

    const decos: MonacoEditor.IModelDeltaDecoration[] = []
    const lineCount = model.getLineCount()
    const push = (ln: number, cls: string) => {
      if (ln < 1 || ln > lineCount) return
      decos.push({
        range: new monaco.Range(ln, 1, ln, 1),
        options: { isWholeLine: true, linesDecorationsClassName: `dirty-line ${cls}` },
      })
    }
    change.added.forEach((ln) => push(ln, "dirty-line-added"))
    change.modified.forEach((ln) => push(ln, "dirty-line-modified"))
    change.deletedAt.forEach((ln) => push(ln, "dirty-line-deleted"))

    if (!decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection(decos)
    } else {
      decorationsRef.current.set(decos)
    }
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current()
    })

    // Verifica di sintassi: conta i marker di diagnostica del modello corrente
    // (validazione nativa di Monaco per JSON, JS/TS, CSS, HTML).
    const reportDiagnostics = () => {
      const model = editor.getModel()
      if (!model) return
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
      diagRef.current?.({
        errors: markers.filter((m: MonacoEditor.IMarker) => m.severity === monaco.MarkerSeverity.Error).length,
        warnings: markers.filter((m: MonacoEditor.IMarker) => m.severity === monaco.MarkerSeverity.Warning).length,
      })
    }
    monaco.editor.onDidChangeMarkers((uris: readonly Uri[]) => {
      const model = editor.getModel()
      if (!model) return
      if (uris.some((u: Uri) => u.toString() === model.uri.toString())) reportDiagnostics()
    })
    reportDiagnostics()

    // Riporta la posizione del cursore (e le righe totali) al parent.
    const reportCursor = () => {
      const pos = editor.getPosition()
      if (!pos) return
      cursorRef.current?.({
        line: pos.lineNumber,
        column: pos.column,
        lineCount: editor.getModel()?.getLineCount() ?? 0,
      })
    }
    editor.onDidChangeCursorPosition(reportCursor)
    editor.onDidChangeModelContent(() => {
      reportCursor()
      refreshDiff()
    })
    reportCursor()
    refreshDiff()
  }

  // Dopo un salvataggio `original` diventa il testo corrente: ricalcola il diff
  // (così i marcatori spariscono) senza rimontare l'editor.
  useEffect(() => {
    refreshDiff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original])

  return (
    <Editor
      key={filename}
      theme="vs-dark"
      language={languageFromFilename(filename)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      loading={<Spinner className="size-6" />}
      options={{
        fontSize: 13,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: "selection",
        glyphMargin: false,
      }}
    />
  )
}

/** Hook: registra Ctrl/Cmd+S a livello di pagina per salvare anche fuori focus editor. */
export function usePageSaveShortcut(onSave: () => void, enabled: boolean) {
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [enabled])
}
