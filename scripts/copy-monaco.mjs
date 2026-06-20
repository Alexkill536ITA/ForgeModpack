// Copia gli asset di Monaco Editor (`min/vs`) dentro `public/monaco/vs` così da
// poterli servire localmente: l'app Tauri gira offline e NON puo' caricare Monaco
// dalla CDN di default. Il loader viene poi puntato a `/monaco/vs`
// (vedi src/lib/monaco-setup.ts). Eseguito prima di `dev`/`build` (package.json).

import { cp, mkdir, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "node_modules", "monaco-editor", "min", "vs")
const dest = join(root, "public", "monaco", "vs")

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

if (!(await exists(src))) {
  console.error(`[copy-monaco] sorgente non trovata: ${src}\nEsegui prima 'pnpm install'.`)
  process.exit(1)
}

// Idempotente: salta la copia se la destinazione esiste gia' (build piu' veloci).
if (await exists(dest)) {
  console.log("[copy-monaco] asset gia' presenti, copia saltata.")
  process.exit(0)
}

await mkdir(dirname(dest), { recursive: true })
await cp(src, dest, { recursive: true })
console.log(`[copy-monaco] copiati gli asset Monaco in ${dest}`)
