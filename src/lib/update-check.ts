// Verifica degli aggiornamenti dell'app leggendo le GitHub Releases del repo.
//
// È un check e NIENTE ALTRO: l'app non si aggiorna da sola (non usa
// `tauri-plugin-updater`, quindi non serve né una chiave di firma né un
// `latest.json` da pubblicare a ogni release). Se esiste una versione più
// recente si apre la pagina della release nel browser e l'utente scarica
// l'installer a mano.
//
// Le funzioni di confronto/selezione sono PURE (nessuna I/O): sono la parte che
// sbaglia in silenzio se il confronto delle versioni viene fatto con `>` su
// stringhe ("1.10.0" < "1.9.0").

import { fetch } from "@tauri-apps/plugin-http"
import { getVersion } from "@tauri-apps/api/app"

// Repo da cui leggere le release. Deve combaciare con l'`origin` del progetto.
export const UPDATE_REPO_OWNER = "Alexkill536ITA"
export const UPDATE_REPO_NAME = "ForgeModpack"

// Pagina umana (fallback quando non si conosce la URL della singola release).
export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases`

// L'endpoint è `/releases` (non `/releases/latest`) perché quest'ultimo IGNORA
// le pre-release: pubblicando beta la "latest" di GitHub resterebbe indietro.
// Il filtro sulle pre-release lo facciamo noi, in base alla preferenza utente.
const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases?per_page=30`

// Preferenza "includi versioni beta": vale per tutti i progetti (non è un dato
// del modpack), quindi sta in localStorage come la lingua e non nel project.json.
export const PRERELEASE_STORAGE_KEY = "fmp.updates.includePrerelease"

export function getIncludePrerelease(): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(PRERELEASE_STORAGE_KEY) === "true"
}

export function setIncludePrerelease(value: boolean): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(PRERELEASE_STORAGE_KEY, String(value))
}

// ============================================================================
// TIPI
// ============================================================================

// Sottoinsieme dei campi che ci servono della risposta GitHub (snake_case: è il
// JSON dell'API, non un nostro modello).
export interface GithubRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  prerelease: boolean
  draft: boolean
  published_at: string | null
}

// Release normalizzata per la UI.
export interface AppRelease {
  version: string // senza la "v" iniziale
  tag: string
  title: string
  notes: string
  url: string
  prerelease: boolean
  publishedAt: string | null
}

export interface UpdateCheckResult {
  current: string
  latest: AppRelease | null
  hasUpdate: boolean
}

// ============================================================================
// CONFRONTO VERSIONI (semver ridotto, puro)
// ============================================================================

interface ParsedVersion {
  core: number[]
  pre: string[]
}

// Accetta "1.2.0", "v1.2.0", "1.3.0-beta.1", "1.3.0+build.5".
// Ritorna null se non è una versione riconoscibile (tag non standard).
export function parseVersion(raw: string): ParsedVersion | null {
  const cleaned = raw.trim().replace(/^v/i, "")
  if (!cleaned) return null
  // I metadati di build (+...) non contano nel confronto.
  const withoutBuild = cleaned.split("+")[0]
  const [corePart, ...preParts] = withoutBuild.split("-")
  const core = corePart.split(".").map((part) => Number.parseInt(part, 10))
  if (core.length === 0 || core.some((n) => !Number.isFinite(n))) return null
  const pre = preParts
    .join("-")
    .split(".")
    .filter((s) => s.length > 0)
  return { core, pre }
}

/**
 * Confronta due versioni: -1 se a < b, 0 se equivalenti, 1 se a > b.
 * Se una delle due non è parsabile ritorna 0 ("non lo so" → nessun update
 * proposto: meglio tacere che segnalare un aggiornamento inesistente).
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0

  const coreLen = Math.max(pa.core.length, pb.core.length)
  for (let i = 0; i < coreLen; i++) {
    const diff = (pa.core[i] ?? 0) - (pb.core[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }

  // Core identico: la versione stabile batte la pre-release (1.3.0 > 1.3.0-beta.1).
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1

  const preLen = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < preLen; i++) {
    const ia = pa.pre[i]
    const ib = pb.pre[i]
    // Meno identificatori = versione minore (beta.1 < beta.1.2).
    if (ia === undefined) return -1
    if (ib === undefined) return 1
    if (ia === ib) continue
    const na = /^\d+$/.test(ia) ? Number(ia) : null
    const nb = /^\d+$/.test(ib) ? Number(ib) : null
    if (na !== null && nb !== null) return na < nb ? -1 : 1
    // Per semver un identificatore numerico è minore di uno alfanumerico.
    if (na !== null) return -1
    if (nb !== null) return 1
    return ia < ib ? -1 : 1
  }
  return 0
}

// ============================================================================
// SELEZIONE DELLA RELEASE (pura)
// ============================================================================

function toAppRelease(release: GithubRelease): AppRelease | null {
  const parsed = parseVersion(release.tag_name)
  if (!parsed) return null // tag non versionato: non sappiamo confrontarlo
  return {
    version: release.tag_name.trim().replace(/^v/i, "").split("+")[0],
    tag: release.tag_name,
    title: release.name?.trim() || release.tag_name,
    notes: release.body?.trim() ?? "",
    url: release.html_url || RELEASES_PAGE_URL,
    prerelease: release.prerelease,
    publishedAt: release.published_at,
  }
}

/**
 * Sceglie la release con la versione più alta tra quelle pubblicate.
 * Scarta le bozze e, se `includePrerelease` è false, le pre-release. Non si
 * fida dell'ordine restituito dall'API: confronta le versioni.
 */
export function pickLatestRelease(
  releases: GithubRelease[],
  includePrerelease: boolean
): AppRelease | null {
  const candidates = releases
    .filter((r) => !r.draft && (includePrerelease || !r.prerelease))
    .map(toAppRelease)
    .filter((r): r is AppRelease => r !== null)

  if (candidates.length === 0) return null
  return candidates.reduce((best, r) => (compareVersions(r.version, best.version) > 0 ? r : best))
}

/**
 * Ripulisce le note di release Markdown per mostrarle come testo semplice
 * (il dialog non ha un renderer Markdown): via i marcatori di titolo, il grassetto
 * e i link in forma `[testo](url)`.
 */
export function formatReleaseNotes(notes: string): string {
  return notes
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ============================================================================
// I/O
// ============================================================================

async function fetchReleases(): Promise<GithubRelease[]> {
  const res = await fetch(RELEASES_API_URL, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // Senza User-Agent l'API GitHub risponde 403: il client HTTP di Tauri
      // (reqwest) non ne manda uno di default.
      "User-Agent": `${UPDATE_REPO_NAME}-update-check`,
    },
  })
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error("Unexpected GitHub API response")
  return data as GithubRelease[]
}

/**
 * Versione dell'app installata (da tauri.conf.json / Cargo.toml).
 * Fuori dall'app desktop (`pnpm dev` nel browser) non è disponibile.
 */
export async function getCurrentVersion(): Promise<string> {
  return getVersion()
}

/**
 * Esegue il check completo. Lancia se la rete o l'API non rispondono: il
 * chiamante decide se avvisare (check manuale) o restare in silenzio (avvio).
 */
export async function checkForUpdate(includePrerelease?: boolean): Promise<UpdateCheckResult> {
  const withPrerelease = includePrerelease ?? getIncludePrerelease()
  const [current, releases] = await Promise.all([getCurrentVersion(), fetchReleases()])
  const latest = pickLatestRelease(releases, withPrerelease)
  return {
    current,
    latest,
    hasUpdate: latest !== null && compareVersions(latest.version, current) > 0,
  }
}
