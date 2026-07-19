export * from "./types"

import { KeybindExporter } from "./types"
import { optionsTxtExporter } from "./options-txt"
import { keysetExporter } from "./keyset"

// Registro degli exporter disponibili (l'ordine è quello mostrato in UI).
export const EXPORTERS: KeybindExporter[] = [optionsTxtExporter, keysetExporter]

export const getExporter = (id: string): KeybindExporter | undefined =>
  EXPORTERS.find((e) => e.id === id)
