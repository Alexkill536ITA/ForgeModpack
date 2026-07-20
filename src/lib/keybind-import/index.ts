export * from "./types"

import { KeybindImporter } from "./types"
import { keysetImporter } from "./keyset"

// Registro degli importer disponibili (l'ordine è quello mostrato in UI).
export const IMPORTERS: KeybindImporter[] = [keysetImporter]

export const getImporter = (id: string): KeybindImporter | undefined =>
  IMPORTERS.find((i) => i.id === id)
