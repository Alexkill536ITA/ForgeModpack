"use client"

import { useState } from "react"
import { writeTextFile, readTextFile, exists } from "@tauri-apps/plugin-fs"
import { save } from "@tauri-apps/plugin-dialog"
import { basename } from "@tauri-apps/api/path"
import { toast } from "sonner"
import { DownloadIcon } from "lucide-react"

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
import { project, toastStyles } from "../../model/models"
import { EXPORTERS, getExporter, ExportContext } from "../../lib/keybind-export"

export function ExportDialog({
  project,
  open,
  onOpenChange,
  defaultMapIndex,
}: {
  project: project
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultMapIndex: number
}) {
  const maps = project.keybindMaps
  // Selezione mappa: indice come stringa, oppure "all" (solo per exporter
  // multi-profilo che espongono `buildAll`).
  const [mapSel, setMapSel] = useState<string>(String(defaultMapIndex))
  const [exporterId, setExporterId] = useState(EXPORTERS[0]?.id ?? "")
  const [dest, setDest] = useState<"workpath" | "choose">("workpath")
  const [busy, setBusy] = useState(false)

  const exporter = getExporter(exporterId)
  const supportsAll = !!exporter?.buildAll
  // "all" è valido solo se l'exporter lo supporta; altrimenti ripiega su una
  // mappa. Se cambia il set di mappe mentre il dialog è chiuso, riallinea.
  const effectiveSel =
    mapSel === "all"
      ? supportsAll
        ? "all"
        : "0"
      : Number(mapSel) < maps.length
        ? mapSel
        : "0"

  async function handleExport() {
    if (!exporter || !exporter.available || maps.length === 0) return
    setBusy(true)
    try {
      const ctx: ExportContext = {
        project,
        workpath: project.configs.workpath,
        readExisting: async (p) => ((await exists(p)) ? await readTextFile(p) : null),
      }
      const res =
        effectiveSel === "all" && exporter.buildAll
          ? await exporter.buildAll(maps, ctx)
          : await exporter.build(maps[Number(effectiveSel)], ctx)

      let target = res.suggestedPath
      if (dest === "choose") {
        const chosen = await save({ defaultPath: res.suggestedPath })
        if (!chosen) {
          setBusy(false)
          return // utente ha annullato
        }
        target = chosen
      }

      await writeTextFile(target, res.content)
      const name = await basename(target)
      toast.success(`Exported ${res.writtenLines} keybind(s) to ${name}`, {
        style: toastStyles.success,
      })
      for (const w of res.warnings) {
        toast.warning(w, { style: toastStyles.warning })
      }
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error("Export failed", { style: toastStyles.destructive })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export keybinds</DialogTitle>
        </DialogHeader>

        {maps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keybind maps to export.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Map</Label>
              <Select value={effectiveSel} onValueChange={setMapSel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportsAll && <SelectItem value="all">All maps</SelectItem>}
                  {maps.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={exporterId} onValueChange={setExporterId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORTERS.map((e) => (
                    <SelectItem key={e.id} value={e.id} disabled={!e.available}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={dest} onValueChange={(v) => setDest(v as "workpath" | "choose")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workpath">Project folder ({exporter?.defaultFileName})</SelectItem>
                  <SelectItem value="choose">Choose file…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleExport}
            disabled={busy || maps.length === 0 || !exporter?.available}
          >
            <DownloadIcon /> Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
