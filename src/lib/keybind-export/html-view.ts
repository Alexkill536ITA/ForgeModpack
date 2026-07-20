import { join } from "@tauri-apps/api/path"

import { KeybindExporter, ExportContext, ExportResult } from "./types"
import { keybindMap } from "../../model/models"
import { buildKeyboardHtml } from "./keyboard-visual"

// Rende un nome mappa sicuro come nome file.
function safeFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").trim()
  return (base || "keybinds") + ".html"
}

// Exporter: pagina HTML autonoma e interattiva (sola visualizzazione della
// tastiera con tooltip e filtri mod/tag). Nessuna dipendenza esterna: si apre in
// qualsiasi browser, anche offline.
export const htmlViewExporter: KeybindExporter = {
  id: "html-view",
  label: "Interactive HTML (keyboard view)",
  defaultFileName: "keybinds.html",
  available: true,
  maps: "per-map",

  async build(map: keybindMap, ctx: ExportContext): Promise<ExportResult> {
    const content = buildKeyboardHtml(map, ctx.project.keybindCategories)
    const suggestedPath = await join(ctx.workpath, safeFileName(map.name))
    const warnings: string[] = []
    if (map.keybinds.length === 0) warnings.push("The selected map has no keybinds.")
    return { content, suggestedPath, warnings, writtenLines: map.keybinds.length }
  },
}
