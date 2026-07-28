"use client"

import { useState } from "react"
import { writeTextFile, writeFile, readTextFile, exists } from "@tauri-apps/plugin-fs"
import { save, open as openDialog } from "@tauri-apps/plugin-dialog"
import { basename, join } from "@tauri-apps/api/path"
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
import { useBusy } from "../../lib/use-busy"
import { useTranslation } from "@/src/i18n/i18n-provider"

// Rasterizza un markup SVG in byte PNG usando un canvas (nel webview). `scale`
// aumenta la risoluzione per un'immagine nitida. Le dimensioni derivano dagli
// attributi width/height dell'SVG.
async function svgToPngBytes(svg: string, scale = 2): Promise<Uint8Array> {
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Could not load SVG for rasterization"))
    img.src = url
  })
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const cctx = canvas.getContext("2d")
  if (!cctx) throw new Error("Canvas 2D context unavailable")
  cctx.scale(scale, scale)
  cctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png")
  )
  return new Uint8Array(await blob.arrayBuffer())
}

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
  const { t } = useTranslation()
  const maps = project.keybindMaps
  // Il formato si sceglie PER PRIMO: guida se/come compare il selettore mappa.
  const [exporterId, setExporterId] = useState(EXPORTERS[0]?.id ?? "")
  // Selezione mappa: indice come stringa, oppure "all". Ha senso solo quando
  // l'exporter espone il selettore (vedi `mapMode`).
  const [mapSel, setMapSel] = useState<string>(String(defaultMapIndex))
  const [dest, setDest] = useState<"workpath" | "choose">("workpath")
  const [busy, setBusy] = useState(false)
  // Overlay bloccante: generare gli HTML/PNG di più mappe non è istantaneo.
  // (`runBusy` per non confondersi con lo stato `busy` del bottone.)
  const runBusy = useBusy()

  const exporter = getExporter(exporterId)
  const mapMode = exporter?.maps ?? "single"
  // Il selettore mappa compare per "single" e "per-map"; per "all-in-one"
  // (keyset) si esportano SEMPRE tutte le mappe, senza scelta.
  const showMapSelect = mapMode !== "all-in-one"
  // L'opzione "All" nel selettore è solo per "per-map" (HTML/PNG): genera un
  // file per mappa. Su "single" (options.txt) non è ammessa.
  const allowAll = mapMode === "per-map"
  // Se selezionato "all" ma l'exporter non lo consente, ripiega su una mappa;
  // riallinea anche se il set di mappe è cambiato a dialog chiuso.
  const effectiveSel =
    mapSel === "all"
      ? allowAll
        ? "all"
        : "0"
      : Number(mapSel) < maps.length
        ? mapSel
        : "0"
  // Esportazione multi-file (un file per mappa): solo "per-map" con "all".
  const isMultiFile = mapMode === "per-map" && effectiveSel === "all"

  // Scrive un ExportResult su disco (testo o PNG rasterizzato) a `target`.
  async function writeResult(target: string, res: { content: string }) {
    if (exporter?.image) {
      await writeFile(target, await svgToPngBytes(res.content))
    } else {
      await writeTextFile(target, res.content)
    }
  }

  async function handleExport() {
    if (!exporter || !exporter.available || maps.length === 0) return
    setBusy(true)
    try {
      const ctx: ExportContext = {
        project,
        workpath: project.configs.workpath,
        readExisting: async (p) => ((await exists(p)) ? await readTextFile(p) : null),
      }

      // --- "All" per-map: un file per mappa (HTML/PNG) ---
      if (isMultiFile) {
        // Destinazione = una CARTELLA (i nomi file derivano da ogni mappa).
        let targetDir: string | null = null
        if (dest === "choose") {
          const chosen = await openDialog({ directory: true, defaultPath: ctx.workpath })
          if (!chosen || Array.isArray(chosen)) {
            setBusy(false)
            return // annullato
          }
          targetDir = chosen
        }
        const warnings: string[] = []
        let written = 0
        await runBusy(t("busy.exportingKeybinds"), async (setMessage) => {
          for (const map of maps) {
            // Il dettaglio dice quale mappa è in lavorazione.
            setMessage(t("busy.exportingKeybinds"), map.name)
            const res = await exporter.build(map, ctx)
            const target = targetDir ? await join(targetDir, await basename(res.suggestedPath)) : res.suggestedPath
            await writeResult(target, res)
            warnings.push(...res.warnings)
            written++
          }
        })
        toast.success(t("keybindIo.exportSuccessMulti", { count: written }), {
          style: toastStyles.success,
        })
        for (const w of warnings) toast.warning(w, { style: toastStyles.warning })
        onOpenChange(false)
        return
      }

      // --- File singolo: tutte le mappe in uno (all-in-one) o una sola mappa ---
      const res = await runBusy(t("busy.exportingKeybinds"), () =>
        mapMode === "all-in-one" && exporter.buildAll
          ? exporter.buildAll(maps, ctx)
          : exporter.build(maps[Number(effectiveSel)], ctx)
      )

      let target = res.suggestedPath
      if (dest === "choose") {
        const chosen = await save({ defaultPath: res.suggestedPath })
        if (!chosen) {
          setBusy(false)
          return // utente ha annullato
        }
        target = chosen
      }

      await runBusy(t("busy.exportingKeybinds"), () => writeResult(target, res), {
        detail: target,
      })
      const name = await basename(target)
      toast.success(t("keybindIo.exportSuccess", { count: res.writtenLines, name }), {
        style: toastStyles.success,
      })
      for (const w of res.warnings) {
        toast.warning(w, { style: toastStyles.warning })
      }
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error(t("keybindIo.exportFailed"), { style: toastStyles.destructive })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("keybindIo.exportTitle")}</DialogTitle>
        </DialogHeader>

        {maps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("keybindIo.noMapsToExport")}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("keybindIo.format")}</Label>
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

            {showMapSelect && (
              <div className="space-y-2">
                <Label>{t("keybindIo.map")}</Label>
                <Select value={effectiveSel} onValueChange={setMapSel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowAll && <SelectItem value="all">{t("keybindIo.allMaps")}</SelectItem>}
                    {maps.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("keybindIo.destination")}</Label>
              <Select value={dest} onValueChange={(v) => setDest(v as "workpath" | "choose")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workpath">
                    {isMultiFile
                      ? t("keybindIo.projectFolderAll")
                      : t("keybindIo.projectFolder", { defaultFileName: exporter?.defaultFileName ?? "" })}
                  </SelectItem>
                  <SelectItem value="choose">
                    {isMultiFile ? t("keybindIo.chooseFolder") : t("keybindIo.chooseFile")}
                  </SelectItem>
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
            <DownloadIcon /> {t("keybindIo.export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
