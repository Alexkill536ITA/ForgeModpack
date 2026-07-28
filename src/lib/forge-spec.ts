// Hint di versione passati alla scansione dei mod (comandi Rust `scan_mods` e
// `resolve_keybind_labels`).
//
// La TABELLA dei profili di formato (quale file di metadati e quale formato di
// lang aspettarsi per una data versione di Minecraft) vive in UN SOLO posto:
// `src-tauri/src/forge_spec.rs`. Qui ci limitiamo a costruire l'hint che le
// permette di scegliere il profilo:
//
//   - `mc`    = versione di Minecraft del progetto (di norma basta questa);
//   - `forge` = versione del loader **Forge**, usata dal backend solo quando la
//               versione MC non è interpretabile (es. snapshot "24w14a").
//
// La parte "online" è il completamento dell'hint: se il progetto non ha ancora
// scelto una versione di loader, la si deduce dal manifest dei modloader già
// cachato in SQLite ([`manifest-cache.ts`](./manifest-cache.ts) — host già in
// whitelist, TTL 24h, fallback offline). Nessuna nuova chiamata di rete.

import { modloaderTypes, project } from "../model/models"
import { getModLoaderManifestCached } from "./manifest-cache"

export interface scanHint {
  mc?: string
  forge?: string
}

/**
 * Loader "classico" effettivo del progetto: il tipo stesso se classico, oppure
 * l'`hybridLoader` quando il progetto è datapack + ibrido. `undefined` per i
 * datapack puri (nessun loader).
 */
function effectiveLoader(p: project): modloaderTypes | undefined {
  const { type, hybrid, hybridLoader } = p.modloader
  if (type === modloaderTypes.DATAPACK) return hybrid ? hybridLoader : undefined
  return type
}

/**
 * Hint sincrono, senza toccare cache né rete: versione MC + versione Forge
 * dichiarata nel progetto. È quello che si usa quando serve solo la chiave di
 * cache o quando il manifest non è disponibile.
 *
 * NOTA: la versione viene passata solo per **Forge**, perché il backend la
 * interpreta con la numerazione Forge (14 = 1.12.2, 47 = 1.20.1, 50+ = 1.20.5+).
 * NeoForge usa una numerazione diversa (20.4, 21.1…) che falserebbe il
 * confronto: per NeoForge basta e avanza la versione di Minecraft.
 */
export function scanHintOf(p: project): scanHint {
  const mc = p.modloader.mcversion?.trim() || undefined
  const loader = effectiveLoader(p)
  const forge =
    loader === modloaderTypes.FORGE ? p.modloader.version?.trim() || undefined : undefined
  return { mc, forge }
}

/**
 * Ultima build Forge disponibile per una versione di Minecraft, dal manifest
 * cachato. Le entry sono nel formato `"<mc>-<forge>"` in ordine crescente.
 */
async function latestForgeVersion(mc: string): Promise<string | undefined> {
  const manifest = await getModLoaderManifestCached()
  const builds = manifest.forge?.[mc] ?? []
  const last = builds[builds.length - 1]
  return last?.split("-")[1] || undefined
}

/**
 * Hint completo: come `scanHintOf`, ma se il progetto è su Forge senza versione
 * di loader scelta la deduce dal manifest cachato (così il backend ha un
 * fallback anche quando la versione MC non è interpretabile). Non fallisce mai:
 * offline si ritorna il solo hint sincrono.
 */
export async function resolveScanHint(p: project): Promise<scanHint> {
  const hint = scanHintOf(p)
  if (hint.forge || !hint.mc) return hint
  if (effectiveLoader(p) !== modloaderTypes.FORGE) return hint
  try {
    return { ...hint, forge: await latestForgeVersion(hint.mc) }
  } catch (err) {
    console.warn("Manifest Forge non disponibile: hint limitato alla versione MC.", err)
    return hint
  }
}
