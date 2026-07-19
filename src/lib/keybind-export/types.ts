// Astrazione per l'export dei keybind del progetto verso i file di config di
// Minecraft/mod. Ogni formato è un `KeybindExporter`. Gli exporter sono PURI:
// non toccano il disco, ritornano il contenuto testuale + il path suggerito.
// La scrittura effettiva (writeTextFile) e i toast restano nella UI, così i
// permessi e la gestione errori sono centralizzati.

import { keybindMap, project } from "../../model/models"

export interface ExportContext {
  project: project
  workpath: string
  // Legge un file esistente (per gli exporter che fanno merge). Ritorna null se
  // il file non esiste. Iniettata dalla UI (che ha accesso a plugin-fs).
  readExisting: (absPath: string) => Promise<string | null>
}

export interface ExportResult {
  content: string        // testo finale da scrivere
  suggestedPath: string  // path assoluto proposto (già join con workpath)
  warnings: string[]     // es. "3 keybind senza translation key: saltati"
  writtenLines: number   // numero di righe keybind prodotte (per il toast)
}

export interface KeybindExporter {
  id: string               // "options-txt" | "keyset"
  label: string            // etichetta mostrata nel dialog
  defaultFileName: string  // "options.txt"
  available: boolean       // false = disabilitato in UI (formato non pronto)
  build: (map: keybindMap, ctx: ExportContext) => Promise<ExportResult>
}
