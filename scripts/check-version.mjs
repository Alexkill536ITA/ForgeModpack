// Gate di versione per la BUILD: impedisce di buildare finché la versione
// corrente non è stata "generata" di fresco con `pnpm bump`. Regole di blocco:
//   1) deve esistere il tag git `v<versione>` (creato da `pnpm bump`);
//   2) non ci devono essere commit DOPO quel tag (altrimenti hai fatto lavoro
//      nuovo senza bumpare → la versione è "stantia").
// Le modifiche non committate producono solo un avviso (non bloccano).
//
// È incatenato nel `beforeBuildCommand` di tauri.conf.json, quindi vale sia per
// `pnpm tauri:build` sia per `tauri build`.

import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const version = pkg.version
const tag = `v${version}`

function run(cmd) {
  return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString().trim()
}
function fail(msg) {
  console.error(`\n✖ Build bloccata: ${msg}`)
  console.error(`  → Genera una nuova versione con \`pnpm bump\`.\n`)
  process.exit(1)
}

// 1) Il tag della versione corrente deve esistere.
try {
  run(`git rev-parse -q --verify "refs/tags/${tag}"`)
} catch {
  fail(`la versione ${version} non ha un tag git (${tag}).`)
}

// 2) Non devono esserci commit dopo il tag.
let ahead = "0"
try {
  ahead = run(`git rev-list --count "${tag}..HEAD"`)
} catch {
  fail(`impossibile confrontare HEAD con ${tag}.`)
}
if (Number(ahead) > 0) {
  fail(`ci sono ${ahead} commit dopo ${tag}.`)
}

// Avviso non bloccante per le modifiche non committate.
if (run("git status --porcelain")) {
  console.warn(`\n⚠ Modifiche non committate presenti: la build userà comunque la versione ${version}.`)
}

console.log(`✔ Versione ${version} (${tag}) verificata: build consentita.`)
