# 07 — SQLite cache and remote manifests

To avoid querying the APIs on every launch, the app caches the manifests (and the scans) in a local
SQLite DB. The network is used **only** for version metadata: never to download mods.

## Key-value cache (SQLite)

[`cache-db.ts`](../../../src/lib/cache-db.ts) exposes generic access to the `manifest_cache` table
(schema in [05 — Rust Backend](./05-backend-rust.md)):

```mermaid
graph LR
    getCache["getCache&lt;T&gt;(key)"] -->|SELECT| Row["{data, updated_at}"]
    Row --> Parse["JSON.parse → CacheEntry&lt;T&gt; {data, updatedAt}"]
    setCache["setCache&lt;T&gt;(key, data)"] -->|INSERT ... ON CONFLICT| Upsert["data=JSON.stringify, updated_at=Date.now()"]
```

- Singleton connection (`Database.load("sqlite:forgemodpack.db")`) → the migrations run
  only once.
- `getCache<T>(key)`: returns `{ data, updatedAt }` or `null`.
- `setCache<T>(key, data)`: upsert with the current timestamp.

### Keys used

| Key | Content | TTL |
|--------|-----------|-----|
| `minecraft_manifest` | MC versions manifest | 24h |
| `modloader_manifest` | Forge/NeoForge/Fabric/Quilt manifest | 24h |
| `mods:v2:<workpath>` | Mod scan (metadata + keybind) | none (manual refresh) |
| `datapacks:v1:<dir>` | Datapack scan | none (manual refresh) |

## Remote manifests

[`get-manifest.ts`](../../../src/lib/get-manifest.ts) uses `@tauri-apps/plugin-http` to download the data.
The hosts are **whitelisted** in [`capabilities/default.json`](../../../src-tauri/capabilities/default.json).

```mermaid
graph TB
    subgraph MC["Minecraft"]
        F1["piston-meta.mojang.com<br/>version_manifest_v2.json"]
    end
    subgraph MLoaders["Modloader"]
        F2["files.minecraftforge.net<br/>maven-metadata.json"]
        F3["maven.neoforged.net<br/>versions/releases"]
        F4["meta.fabricmc.net<br/>loader + game"]
        F5["meta.quiltmc.org<br/>loader + game"]
    end
    F1 --> GM["getMinecraftManifest()"]
    F2 & F3 & F4 & F5 --> UM["updateModLoaderManifest()<br/>(Promise.all → ModLoaderManifest)"]
```

`updateModLoaderManifest()` runs the six fetches in parallel (Forge, NeoForge, Fabric loader+game,
Quilt loader+game) and recomposes them into a single `ModLoaderManifest`.

## Cache strategy (TTL + offline fallback)

[`manifest-cache.ts`](../../../src/lib/manifest-cache.ts) orchestrates TTL, fetch and fallback:

```mermaid
flowchart TD
    Start["loadCached(key, fetcher, force)"] --> Get["getCache(key)"]
    Get --> Q{"!force && cache present && !stale?"}
    Q -->|yes| Ret["return cache"]
    Q -->|no| Fetch["fetcher()"]
    Fetch -->|ok| Save["setCache + return fresh"]
    Fetch -->|error| Fb{"cache present?"}
    Fb -->|yes| Stale["return cache (even if stale)<br/>→ app usable offline"]
    Fb -->|no| Throw["propagate error"]
```

- **TTL** = 24h (`TTL_MS`); `isStale(updatedAt)` = `Date.now() - updatedAt > TTL_MS`.
- Public APIs:
  - `getMinecraftManifestCached(force = false)`
  - `getModLoaderManifestCached(force = false)`
- `force = true` (manual refresh from the Home) bypasses the cache and re-downloads.
- If the fetch fails (offline) but a cache exists, it uses it **even if expired**.

## Bootstrap in Home

```mermaid
sequenceDiagram
    participant H as Home (mount)
    participant MCache as manifest-cache
    participant DB as SQLite
    participant Net as Remote API
    participant R as Redux

    H->>MCache: getMinecraftManifestCached() + getModLoaderManifestCached()
    MCache->>DB: getCache
    alt fresh cache
        DB-->>MCache: data
    else absent/expired
        MCache->>Net: fetch
        Net-->>MCache: data → setCache
    end
    MCache-->>H: manifest
    H->>R: updateMinecraftManifest / loadManifest
```

A ref (`bootstrapped`) avoids the double fetch caused by React StrictMode.

## Scan cache

The mod/datapack scans use the same SQLite store but **without TTL** (the folder changes
rarely; it is invalidated only by manual refresh). Details in
[06 — Scanning](./06-scansione.md). The versioning in the key (`v2`, `v1`) allows invalidating
old caches in bulk when the shape of the data changes.
