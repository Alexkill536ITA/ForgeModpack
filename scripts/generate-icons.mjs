// Rigenera TUTTE le icone dell'app dal sorgente PNG usando il generatore
// integrato di Tauri (@tauri-apps/cli, già dipendenza del progetto). Da un unico
// `icon.png` quadrato (consigliato ≥ 1024x1024, con trasparenza) produce l'intero
// set standard nella cartella src-tauri/icons:
//   32x32.png, 128x128.png, 128x128@2x.png, StoreLogo.png,
//   Square30x30 / 44x44 / 71x71 / 89x89 / 107x107 / 142x142 / 150x150 /
//   284x284 / 310x310 Logo.png, icon.ico, icon.icns.
// Tutte coerenti con lo stesso sorgente (risolve i derivati disallineati/vecchi).
//
// Uso:
//   pnpm icons                 # usa src-tauri/icons/icon.png
//   pnpm icons path/al/mio.png # usa un sorgente diverso
//   node scripts/generate-icons.mjs [sorgente]

import { execSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = resolve(root, process.argv[2] ?? "src-tauri/icons/icon.png")
const outDir = join(root, "src-tauri", "icons")

if (!existsSync(source)) {
  console.error(`\n✖ Sorgente non trovato: ${source}\n`)
  process.exit(1)
}

console.log(`\nGenerazione icone da: ${source}`)
console.log(`Output: ${outDir}\n`)

// Il generatore di Tauri crea l'intero set (PNG + .ico + .icns) dal sorgente.
execSync(`pnpm tauri icon "${source}" -o "${outDir}"`, { cwd: root, stdio: "inherit" })

// Progetto SOLO desktop: rimuove gli artefatti mobile e i formati extra che il
// generatore produce sempre ma che non usiamo (non referenziati in tauri.conf.json).
for (const extra of ["ios", "android", "64x64.png"]) {
  rmSync(join(outDir, extra), { recursive: true, force: true })
}

console.log(`\n✔ Icone rigenerate da ${source} (desktop set).\n`)
