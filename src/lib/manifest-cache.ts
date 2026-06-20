import { MinecraftManifest, ModLoaderManifest } from "../model/manifest-mc-ml";
import { getMinecraftManifest, updateModLoaderManifest } from "./get-manifest";
import { getCache, setCache } from "./cache-db";

// Chiavi della cache key-value in `manifest_cache`.
const MC_KEY = "minecraft_manifest";
const ML_KEY = "modloader_manifest";

// Durata di validità della cache: oltre questa soglia i dati sono considerati
// "stale" e vengono riscaricati dalle API al prossimo accesso.
const TTL_MS = 24 * 60 * 60 * 1000; // 24 ore

function isStale(updatedAt: number): boolean {
    return Date.now() - updatedAt > TTL_MS;
}

/**
 * Restituisce un manifest applicando la strategia di cache:
 *  1. se `force` è false e la cache è presente e fresca -> ritorna la cache;
 *  2. altrimenti scarica dalle API e aggiorna la cache;
 *  3. se la fetch fallisce (es. offline) ma esiste una cache, ne fa fallback
 *     anche se stale, così l'app resta utilizzabile senza rete.
 */
async function loadCached<T>(
    key: string,
    fetcher: () => Promise<T>,
    force: boolean
): Promise<T> {
    const cached = await getCache<T>(key);

    if (!force && cached && !isStale(cached.updatedAt)) {
        return cached.data;
    }

    try {
        const fresh = await fetcher();
        await setCache(key, fresh);
        return fresh;
    } catch (error) {
        if (cached) {
            console.warn(`Fetch fallita per "${key}", uso la cache locale.`, error);
            return cached.data;
        }
        throw error;
    }
}

export function getMinecraftManifestCached(force = false): Promise<MinecraftManifest> {
    return loadCached(MC_KEY, getMinecraftManifest, force);
}

export function getModLoaderManifestCached(force = false): Promise<ModLoaderManifest> {
    return loadCached(ML_KEY, updateModLoaderManifest, force);
}
