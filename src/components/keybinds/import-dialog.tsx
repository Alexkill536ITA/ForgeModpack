"use client"

import { useState } from "react"
import { readTextFile, exists } from "@tauri-apps/plugin-fs"
import { open } from "@tauri-apps/plugin-dialog"
import { join } from "@tauri-apps/api/path"
import { toast } from "sonner"
import { UploadIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Button } from "../ui/button"
import { Label } from "../ui/label"
import { keybindMap, project, toastStyles } from "../../model/models"
import {
  IMPORTERS,
  getImporter,
  ImportContext,
  ImportReport,
  ImportIssueReason,
} from "../../lib/keybind-import"
import { resolveKeybindLabels } from "../../lib/keybind-cache"
import { getModsScanCached } from "../../lib/mods-scan"
import { useAppDispatch } from "../../redux/hooks"
import { updateProject } from "../../redux/project-slice"
import { setKeybindActions } from "../../redux/keybind-actions-slice"

// Estrae tutte le chiavi di binding (actionKey) da un keybindprofiles.json, per
// la risoluzione mirata delle label/mod. Difensivo: torna [] se il JSON è rotto.
function collectActionKeys(content: string): string[] {
  try {
    const file = JSON.parse(content) as {
      profiles?: Record<string, { bindings?: Record<string, unknown> }>
    }
    const keys = new Set<string>()
    for (const prof of Object.values(file.profiles ?? {})) {
      for (const k of Object.keys(prof?.bindings ?? {})) keys.add(k)
    }
    return [...keys]
  } catch {
    return []
  }
}

// Messaggi di warning (toast) per tipo di problema.
const REASON_TOAST: Record<ImportIssueReason, (n: number) => string> = {
  "not-installed": (n) => `${n} binding(s) for mods not installed were skipped.`,
  unmapped: (n) => `${n} key(s) could not be mapped to the layout and were skipped.`,
  overflow: (n) => `${n} binding(s) exceeded the 4-per-key limit and were skipped.`,
}

export function ImportDialog({
  project,
  open: dialogOpen,
  onOpenChange,
  onImported,
}: {
  project: project
  open: boolean
  onOpenChange: (open: boolean) => void
  // Notifica la pagina con il report dettagliato (per la tabella sotto Keybinds).
  onImported: (report: ImportReport) => void
}) {
  const dispatch = useAppDispatch()
  const [importerId, setImporterId] = useState(IMPORTERS[0]?.id ?? "")
  const [source, setSource] = useState<"workpath" | "choose">("workpath")
  const [busy, setBusy] = useState(false)

  const importer = getImporter(importerId)

  async function handleImport() {
    if (!importer || !importer.available) return
    setBusy(true)
    try {
      // 1) Ottieni il contenuto del file (cartella progetto o scelta manuale).
      let content: string
      if (source === "workpath") {
        const path = await join(project.configs.workpath, ...importer.relativePath)
        if (!(await exists(path))) {
          toast.error(`No ${importer.defaultFileName} found in the project folder.`, {
            style: toastStyles.destructive,
          })
          return
        }
        content = await readTextFile(path)
      } else {
        const chosen = await open({
          multiple: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        })
        if (!chosen || typeof chosen !== "string") return // annullato
        content = await readTextFile(chosen)
      }

      // 2) Scansione UNIFICATA dei mod (cache SQLite): dà l'elenco dei mod
      //    installati (per verificare l'esistenza) e le loro keybind (per label).
      //    Aggiorna anche Redux così la board riflette lo scan.
      const workpath = project.configs.workpath
      const scanned = await getModsScanCached(workpath, false)
      // Mod installate = modId principali + i loro `provides` (alias). Così un
      // modId emulato conta come installato: es. EMI dichiara provides "jei",
      // quindi i binding key.jei.* vengono attribuiti a EMI invece di scartati.
      const installedMods: { modId: string; name: string }[] = []
      const seenIds = new Set<string>()
      for (const m of scanned) {
        if (m.modId && !seenIds.has(m.modId)) {
          seenIds.add(m.modId)
          installedMods.push({ modId: m.modId, name: m.name })
        }
      }
      for (const m of scanned) {
        for (const p of m.provides ?? []) {
          if (p && !seenIds.has(p)) {
            seenIds.add(p)
            installedMods.push({ modId: p, name: m.name })
          }
        }
      }
      const actionsByModId: Record<string, { key: string; label: string }[]> = {}
      const modKeybinds = scanned
        .filter((m) => m.modId && m.keybinds.length > 0)
        .map((m) => ({ filename: m.filename, modId: m.modId, keybinds: m.keybinds }))
      for (const m of modKeybinds) actionsByModId[m.modId] = m.keybinds
      dispatch(setKeybindActions({ workpath, mods: modKeybinds }))

      // 2b) Risoluzione MIRATA per match esatto delle chiavi presenti nel file:
      //     trova mod + label anche per le keybind con nomi non standard
      //     (config.jsg.*, placebo.toggle*), senza euristiche.
      const wantedKeys = collectActionKeys(content)
      const resolvedByKey: Record<string, { modId: string; label: string }> = {}
      try {
        for (const r of await resolveKeybindLabels(workpath, wantedKeys)) {
          resolvedByKey[r.key] = { modId: r.modId, label: r.label }
        }
      } catch (err) {
        console.error(err) // non bloccante: si ricade sulle euristiche
      }

      // 3) Parsing puro → mappe ricostruite + categorie mancanti + report.
      //    I binding di mod NON installate vengono scartati (reason "not-installed").
      const ctx: ImportContext = { project, installedMods, actionsByModId, resolvedByKey }
      const res = importer.parse(content, ctx)
      if (res.maps.length === 0) {
        toast.warning("No profiles found in the file.", { style: toastStyles.warning })
        return
      }

      // 4) Merge nel project: upsert delle mappe per nome, aggiunta delle
      //    categorie mancanti (le esistenti conservano colore/tag).
      const existingCatNames = new Set(project.keybindCategories.map((c) => c.name))
      const keybindCategories = [
        ...project.keybindCategories,
        ...res.newCategories.filter((c) => !existingCatNames.has(c.name)),
      ]
      const byName = new Map<string, keybindMap>(project.keybindMaps.map((m) => [m.name, m]))
      for (const m of res.maps) byName.set(m.name, { name: m.name, keybinds: m.keybinds, macros: m.macros })
      const keybindMaps = [...byName.values()]

      dispatch(updateProject({ ...project, keybindMaps, keybindCategories }))

      // 5) Toast di esito + warning per tipo di problema (i dettagli riga per
      //    riga finiscono nella tabella in pagina via onImported).
      toast.success(`Imported ${res.report.maps} map(s), ${res.report.bindings} binding(s).`, {
        style: toastStyles.success,
      })
      const counts = res.report.issues.reduce<Record<string, number>>((acc, iss) => {
        acc[iss.reason] = (acc[iss.reason] ?? 0) + 1
        return acc
      }, {})
      for (const reason of Object.keys(counts) as ImportIssueReason[]) {
        toast.warning(REASON_TOAST[reason](counts[reason]), { style: toastStyles.warning })
      }

      onImported(res.report)
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error("Import failed", { style: toastStyles.destructive })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import keybinds</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={importerId} onValueChange={setImporterId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORTERS.map((i) => (
                  <SelectItem key={i.id} value={i.id} disabled={!i.available}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as "workpath" | "choose")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workpath">Project folder ({importer?.defaultFileName})</SelectItem>
                <SelectItem value="choose">Choose file…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Profiles become keybind maps. Maps with the same name are replaced;
            missing mods are added automatically.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleImport} disabled={busy || !importer?.available}>
            <UploadIcon /> Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
