import { join } from "@tauri-apps/api/path"

import { KeybindExporter, ExportContext, ExportResult } from "./types"
import { keybindMap } from "../../model/models"
import { toMinecraftInput, UNMAPPED } from "../mc-keycodes"
import { buildOptionsContent } from "./merge-options"

// Exporter per il file options.txt di Minecraft vanilla.
export const optionsTxtExporter: KeybindExporter = {
  id: "options-txt",
  label: "Minecraft options.txt",
  defaultFileName: "options.txt",
  available: true,

  async build(map: keybindMap, ctx: ExportContext): Promise<ExportResult> {
    const warnings: string[] = []
    const entries = new Map<string, string>() // translationKey -> inputCode
    let skippedNoKey = 0
    let unmapped = 0
    let collisions = 0

    for (const kb of map.keybinds) {
      const tk = kb.actionKey?.trim()
      if (!tk) {
        skippedNoKey++
        continue
      }
      const code = toMinecraftInput(kb.key)
      if (code === UNMAPPED) unmapped++
      if (entries.has(tk)) collisions++ // più tasti sulla stessa azione: vince l'ultimo
      entries.set(tk, code)
    }

    if (skippedNoKey) warnings.push(`${skippedNoKey} keybind without a translation key were skipped.`)
    if (unmapped) warnings.push(`${unmapped} key(s) could not be mapped and were written as 'unknown'.`)
    if (collisions) warnings.push(`${collisions} action(s) bound to multiple keys: only the last was kept.`)

    const suggestedPath = await join(ctx.workpath, "options.txt")
    const existing = await ctx.readExisting(suggestedPath)
    const content = buildOptionsContent(existing, entries)

    return { content, suggestedPath, warnings, writtenLines: entries.size }
  },
}
