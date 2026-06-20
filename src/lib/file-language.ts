// Deduce il linguaggio Monaco dall'estensione di un file. Coerente con i tipi di
// file tipici di un modpack: config Forge/NeoForge (`.toml`, `.cfg`, `.properties`),
// dati (`.json`, `.json5`, `.snbt`), script KubeJS (`.js`, `.ts`), ecc.

const EXTENSION_LANGUAGE: Record<string, string> = {
  json: "json",
  json5: "json",
  jsonc: "json",
  mcmeta: "json",
  toml: "ini", // Monaco non ha un grammar TOML dedicato: "ini" rende bene chiavi/sezioni
  cfg: "ini",
  conf: "ini",
  ini: "ini",
  properties: "ini",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  snbt: "plaintext",
  nbt: "plaintext",
  txt: "plaintext",
  log: "plaintext",
  md: "markdown",
  markdown: "markdown",
  xml: "xml",
  html: "html",
  css: "css",
  yml: "yaml",
  yaml: "yaml",
  zs: "javascript", // ZenScript (CraftTweaker): nessun grammar nativo, JS si avvicina
}

/** Linguaggio Monaco per il file dato (default "plaintext"). */
export function languageFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".")
  if (dot === -1) return "plaintext"
  const ext = filename.slice(dot + 1).toLowerCase()
  return EXTENSION_LANGUAGE[ext] ?? "plaintext"
}

// Colore (classe Tailwind) per il badge del tipo file nella status bar.
const LANGUAGE_COLOR: Record<string, string> = {
  json: "text-amber-400",
  ini: "text-sky-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-400",
  markdown: "text-purple-400",
  xml: "text-orange-400",
  html: "text-orange-400",
  css: "text-pink-400",
  yaml: "text-emerald-400",
  plaintext: "text-muted-foreground",
}

/** Classe di colore per il linguaggio del file (default: muted). */
export function languageColor(language: string): string {
  return LANGUAGE_COLOR[language] ?? "text-muted-foreground"
}

// Linguaggi per cui Monaco esegue una validazione di sintassi nativa: solo per
// questi ha senso mostrare l'esito "valido / errori" nella status bar.
const VALIDATED_LANGUAGES = new Set(["json", "javascript", "typescript", "css", "html"])

/** True se Monaco valida la sintassi del linguaggio dato. */
export function hasSyntaxValidation(language: string): boolean {
  return VALIDATED_LANGUAGES.has(language)
}
