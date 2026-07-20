// Bump INTERATTIVO della versione del progetto. Aggiorna in modo SINCRONIZZATO
// tutti i file che contengono la versione (package.json, tauri.conf.json,
// Cargo.toml + Cargo.lock se presente), poi crea un commit e un tag git `vX.Y.Z`.
//
// `package.json` è la FONTE DI VERITÀ della versione corrente. Il tag creato qui
// è ciò che il gate di build (`check-version.mjs`) verifica per consentire la build.
//
// Uso: `pnpm bump`

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkgPath = join(root, "package.json")
const confPath = join(root, "src-tauri", "tauri.conf.json")
const cargoPath = join(root, "src-tauri", "Cargo.toml")
const lockPath = join(root, "src-tauri", "Cargo.lock")

function run(cmd) {
  return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString().trim()
}
function fail(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// --- Versione corrente (da package.json) ---
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
const current = pkg.version
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
if (!m) fail(`Versione corrente non semver in package.json: "${current}"`)
const [major, minor, patch] = m.slice(1).map(Number)

const candidates = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
  major: `${major + 1}.0.0`,
}

console.log(`\nVersione corrente: ${current}\n`)
console.log(`  1) patch → ${candidates.patch}`)
console.log(`  2) minor → ${candidates.minor}`)
console.log(`  3) major → ${candidates.major}\n`)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const raw = (await rl.question("Scegli incremento [1/2/3 o patch/minor/major]: ")).trim().toLowerCase()
rl.close()

const choice = { "1": "patch", "2": "minor", "3": "major", patch: "patch", minor: "minor", major: "major" }[raw]
if (!choice) fail(`Scelta non valida: "${raw}"`)
const next = candidates[choice]
const tag = `v${next}`

// Il tag non deve già esistere (altrimenti quella versione è già stata generata).
try {
  run(`git rev-parse -q --verify "refs/tags/${tag}"`)
  fail(`Il tag ${tag} esiste già: scegli un incremento diverso.`)
} catch {
  /* atteso: il tag non esiste ancora */
}

// --- Scrittura file (sincronizzata) ---
// package.json (JSON, indent 2)
pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

// tauri.conf.json (JSON, indent 2)
const conf = JSON.parse(readFileSync(confPath, "utf8"))
conf.version = next
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n")

// Cargo.toml: sostituisce SOLO la prima riga `version = "..."` (quella di [package]).
let cargo = readFileSync(cargoPath, "utf8")
cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${next}"`)
writeFileSync(cargoPath, cargo)

// Cargo.lock: aggiorna la versione del package "forgemodpack" (se il lock esiste),
// così non risulta modificato dopo la build.
const files = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"]
if (existsSync(lockPath)) {
  let lock = readFileSync(lockPath, "utf8")
  lock = lock.replace(/(name = "forgemodpack"\r?\nversion = )"[^"]*"/, `$1"${next}"`)
  writeFileSync(lockPath, lock)
  files.push("src-tauri/Cargo.lock")
}

// --- Git: commit (solo i file di versione) + tag ---
run(`git commit -m "${tag}" -- ${files.map((f) => `"${f}"`).join(" ")}`)
run(`git tag "${tag}"`)

console.log(`\n✔ Versione ${current} → ${next} (commit + tag ${tag}).`)
console.log(`  Ora puoi lanciare: pnpm tauri:build\n`)
