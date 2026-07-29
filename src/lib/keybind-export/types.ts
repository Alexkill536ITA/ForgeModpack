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

// Un'immagine dell'archivio: markup SVG da rasterizzare lato UI (il canvas esiste
// solo nel webview) e nome del file DENTRO lo zip, con le `/` delle cartelle.
export interface ExportImage {
  name: string
  svg: string
}

export interface ExportResult {
  content: string        // testo finale da scrivere
  suggestedPath: string  // path assoluto proposto (già join con workpath)
  warnings: string[]     // es. "3 keybind senza translation key: saltati"
  writtenLines: number   // numero di righe keybind prodotte (per il toast)
  // Solo per `output: "image-zip"`: le immagini da impacchettare, in ordine.
  images?: ExportImage[]
}

// Come l'exporter tratta le mappe multiple del progetto (guida la UI del dialog):
// - "all-in-one": esporta SEMPRE tutte le mappe in un UNICO file (formato
//   multi-profilo come keyset). Nessuna scelta di mappa: la UI chiama `buildAll`.
// - "single": esporta UNA sola mappa alla volta (es. options.txt, che fa merge in
//   un file vanilla a nome fisso). Il selettore mappa non offre l'opzione "all".
// - "per-map": esporta una mappa alla volta, oppure "all" = un file PER mappa
//   (es. HTML/PNG). Il selettore mappa offre anche l'opzione "all".
export type ExporterMapMode = "all-in-one" | "single" | "per-map"

// Cosa contiene il risultato e come la UI deve scriverlo:
//  - "text" (default): `content` è testo → `writeTextFile`.
//  - "image": `content` è markup SVG → la UI lo rasterizza in PNG (canvas) e
//    scrive i byte. Il canvas vive solo nel webview, per questo la
//    rasterizzazione non sta negli exporter (che restano puri).
//  - "image-zip": `images` sono più SVG → la UI li rasterizza e li impacchetta in
//    un unico archivio ZIP (vedi `zip-writer.ts`).
export type ExporterOutput = "text" | "image" | "image-zip"

export interface KeybindExporter {
  id: string               // "options-txt" | "keyset" | "html-view" | "image-png"
  label: string            // etichetta mostrata nel dialog
  defaultFileName: string  // "options.txt"
  available: boolean       // false = disabilitato in UI (formato non pronto)
  maps: ExporterMapMode    // vedi ExporterMapMode
  output?: ExporterOutput  // assente = "text"
  build: (map: keybindMap, ctx: ExportContext) => Promise<ExportResult>
  // Richiesto per `maps === "all-in-one"`: esporta TUTTE le mappe in un solo file
  // (ogni keybindMap diventa un profilo). Per gli altri modi la UI esporta le
  // singole mappe via `build`.
  buildAll?: (maps: keybindMap[], ctx: ExportContext) => Promise<ExportResult>
}
