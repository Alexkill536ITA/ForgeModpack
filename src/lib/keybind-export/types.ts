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

// Come l'exporter tratta le mappe multiple del progetto (guida la UI del dialog):
// - "all-in-one": esporta SEMPRE tutte le mappe in un UNICO file (formato
//   multi-profilo come keyset). Nessuna scelta di mappa: la UI chiama `buildAll`.
// - "single": esporta UNA sola mappa alla volta (es. options.txt, che fa merge in
//   un file vanilla a nome fisso). Il selettore mappa non offre l'opzione "all".
// - "per-map": esporta una mappa alla volta, oppure "all" = un file PER mappa
//   (es. HTML/PNG). Il selettore mappa offre anche l'opzione "all".
export type ExporterMapMode = "all-in-one" | "single" | "per-map"

export interface KeybindExporter {
  id: string               // "options-txt" | "keyset" | "html-view" | "image-png"
  label: string            // etichetta mostrata nel dialog
  defaultFileName: string  // "options.txt"
  available: boolean       // false = disabilitato in UI (formato non pronto)
  maps: ExporterMapMode    // vedi ExporterMapMode
  // Se true, `content` NON è testo da scrivere direttamente ma il markup SVG da
  // rasterizzare in immagine (PNG) lato UI, prima della scrittura binaria.
  image?: boolean
  build: (map: keybindMap, ctx: ExportContext) => Promise<ExportResult>
  // Richiesto per `maps === "all-in-one"`: esporta TUTTE le mappe in un solo file
  // (ogni keybindMap diventa un profilo). Per gli altri modi la UI esporta le
  // singole mappe via `build`.
  buildAll?: (maps: keybindMap[], ctx: ExportContext) => Promise<ExportResult>
}
