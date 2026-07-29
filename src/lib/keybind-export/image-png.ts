import { join } from "@tauri-apps/api/path"

import { KeybindExporter, ExportContext, ExportResult, ExportImage } from "./types"
import { keybindMap } from "../../model/models"
import { buildKeyboardSvg, layerCountOf } from "./keyboard-visual"

// Nomi sicuri per file system e per le voci dello ZIP: via i caratteri vietati su
// Windows, e niente `/` o `\` (nello zip sarebbero separatori di cartella).
function safeName(name: string, fallback: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").trim()
  return base || fallback
}

// Etichette dentro le immagini: restano in INGLESE come le altre dell'artefatto
// (gli exporter sono puri e non hanno accesso a `t`).
const COMPLETE = "All layers"
const LAYER = "Layer"
const LEGEND = "Legend"

/**
 * Exporter immagine: produce un **archivio ZIP** con la struttura
 *
 *     <nome mappa>/
 *       complete.png      → la mappa intera (tutti i livelli insieme)
 *       layer-1.png       → un'immagine per livello
 *       layer-2.png
 *       …
 *
 * Un solo PNG non basta più: da quando la mappa ha i livelli, l'immagine completa
 * mostra i tasti condivisi divisi in riquadri, mentre è la vista per livello che
 * si legge. Le due cose servono entrambe, quindi stanno nello stesso archivio.
 * Su una mappa a un livello solo l'archivio contiene la sola `complete.png`:
 * `layer-1.png` sarebbe la stessa immagine.
 *
 * `output: "image-zip"` dice alla UI di rasterizzare gli SVG (il canvas esiste
 * solo nel webview) e impacchettarli; l'exporter resta puro.
 */
export const imagePngExporter: KeybindExporter = {
  id: "image-png",
  label: "Images (ZIP of PNG)",
  defaultFileName: "keybinds.zip",
  available: true,
  maps: "per-map",
  output: "image-zip",

  async build(map: keybindMap, ctx: ExportContext): Promise<ExportResult> {
    const categories = ctx.project.keybindCategories
    const folder = safeName(map.name, "keybinds")
    const layerCount = layerCountOf(map)
    // `legend: true` disegna sotto la tastiera la legenda colore → mod.
    const common = { legend: true as const, legendLabel: LEGEND }

    const complete = buildKeyboardSvg(map, categories, undefined, {
      ...common,
      caption: `${map.name} — ${COMPLETE}`,
    })
    const images: ExportImage[] = [{ name: `${folder}/complete.png`, svg: complete.svg }]

    if (layerCount > 1) {
      for (let layer = 1; layer <= layerCount; layer++) {
        const { svg } = buildKeyboardSvg(map, categories, undefined, {
          ...common,
          layer,
          caption: `${map.name} — ${LAYER} ${layer}`,
        })
        images.push({ name: `${folder}/layer-${layer}.png`, svg })
      }
    }

    const suggestedPath = await join(ctx.workpath, `${folder}.zip`)
    const warnings: string[] = []
    if (map.keybinds.length === 0) warnings.push("The selected map has no keybinds.")
    return {
      // `content` resta l'immagine completa: è ciò che si vedrebbe esportando un
      // PNG singolo, e tiene il risultato leggibile anche fuori dallo zip.
      content: complete.svg,
      images,
      suggestedPath,
      warnings,
      writtenLines: map.keybinds.length,
    }
  },
}
