import { join } from "@tauri-apps/api/path"

import { KeybindExporter, ExportContext, ExportResult } from "./types"
import { keybindMap } from "../../model/models"
import { buildKeyboardSvg } from "./keyboard-visual"

// Rende un nome mappa sicuro come nome file (PNG).
function safeFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").trim()
  return (base || "keybinds") + ".png"
}

// Exporter immagine: `content` è il markup SVG della tastiera; il flag `image`
// dice alla UI di rasterizzarlo in PNG (via canvas) prima della scrittura binaria.
export const imagePngExporter: KeybindExporter = {
  id: "image-png",
  label: "Image (PNG)",
  defaultFileName: "keybinds.png",
  available: true,
  image: true,

  async build(map: keybindMap, ctx: ExportContext): Promise<ExportResult> {
    // `legend: true` disegna sotto la tastiera la legenda colore → mod.
    const { svg } = buildKeyboardSvg(map, ctx.project.keybindCategories, undefined, {
      legend: true,
    })
    const suggestedPath = await join(ctx.workpath, safeFileName(map.name))
    const warnings: string[] = []
    if (map.keybinds.length === 0) warnings.push("The selected map has no keybinds.")
    return { content: svg, suggestedPath, warnings, writtenLines: map.keybinds.length }
  },
}
