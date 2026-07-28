# 06 — Mod, datapack and keybind scanning

The "read from disk" heart of the app. The Rust command [`scan_mods`](../../../src-tauri/src/mods.rs) opens
each `.jar` exactly once as a ZIP archive and extracts, **in a single pass**: metadata,
the `provides` list, keybinds and diagnostics (`format` + `warnings`). It is the data source for
List Mods and for Keybinds/Import.

## Format profiles per Minecraft version

Forge mods changed format over time, both for metadata and for language files. The profile table
lives in [`forge_spec.rs`](../../../src-tauri/src/forge_spec.rs):

| Profile | MC versions | Metadata | Dependencies | Lang |
|---------|-------------|----------|--------------|------|
| `forge-legacy` | ≤ 1.12.2 | `mcmod.info` (JSON) | `requiredMods` / `dependencies` (strings) | `assets/<modid>/lang/en_US.lang` (properties) |
| `forge-fml` | 1.13 – 1.20.4 | `META-INF/mods.toml` | `mandatory = true` / `false` | `assets/<modid>/lang/en_us.json` |
| `forge-fml-modern` | ≥ 1.20.5 | `META-INF/mods.toml` (NeoForge: `neoforge.mods.toml`) | `type = "required"…` + `provides` | `en_us.json` |
| `detect-only` | — (no hint) | prefers `mods.toml` | — | prefers JSON |

> **Primary detection is still the jar's content**: the `mods` folder may contain jars built for
> versions other than the project's. The profile is used to (1) break ties on jars that contain
> *both* metadata formats, (2) order the reading of lang files, (3) produce `warnings` when the
> format found does not match the version declared in the project.

### Where the version hint comes from

```mermaid
graph LR
    P["project.modloader<br/>mcversion · type · version"] --> H["resolveScanHint<br/>(forge-spec.ts)"]
    M[("manifest_cache<br/>modloader_manifest")] -.->|"missing Forge version:<br/>latest build for that MC"| H
    H -->|"{ mc, forge }"| C["invoke scan_mods<br/>resolve_keybind_labels"]
    C --> S["forge_spec::spec_for<br/>(profile table)"]
```

[`forge-spec.ts`](../../../src/lib/forge-spec.ts) builds the `{ mc, forge }` hint:

- `mc` = `project.modloader.mcversion` (usually enough to pick the profile);
- `forge` = the **Forge** loader version, used by the backend only when `mc` cannot be parsed
  (e.g. the `24w14a` snapshot). It is **not** passed for NeoForge: that uses a different numbering
  (20.4, 21.1…) which would skew the comparison against Forge numbering (14 / 47 / 50+).
- If the project is on Forge with no loader version picked yet, it is derived from the **latest
  build** for that MC version by reading the manifest already cached in SQLite (host already
  whitelisted, 24h TTL, offline fallback: with no network only `mc` is used).

`spec_for(mc, forge)` is a pure function, covered by unit tests.

## Unified scan of a jar

```mermaid
flowchart TD
    Start["scan_mods(dir, mc?, forge?)"] --> Spec["forge_spec::spec_for → expected profile"]
    Spec --> List["fs::read_dir → filter *.jar"]
    List --> Loop["for each jar: read_mod(path, spec)"]
    Loop --> Open{"open ZIP OK?"}
    Open -->|no| Bad["ScannedMod 'unreadable'<br/>+ warning"]
    Open -->|yes| Names["file_names() → format detection"]
    Names --> Meta["parse metadata of the format found"]
    Names --> Prov["collect_provides + collect_jarjar_provides"]
    Names --> Keys["collect_lang_docs → keybinds_from_langs"]
    Meta --> Result["ScannedMod<br/>+ format + warnings"]
    Prov --> Result
    Keys --> Result
    Result --> SortM["sort by filename"]
    Bad --> SortM
```

### Format detection (cascade)

```mermaid
graph TD
    A["META-INF/neoforge.mods.toml"] -->|absent| DUP{"mcmod.info<br/>AND mods.toml?"}
    A -.->|present| PN["parse_forge('neoforge')"]
    DUP -->|"yes → the profile decides"| TB["spec.meta:<br/>McmodInfo or ModsToml"]
    DUP -->|no| B["META-INF/mods.toml"]
    B -->|absent| MC["mcmod.info"]
    MC -->|absent| C["quilt.mod.json"]
    C -->|absent| D["fabric.mod.json"]
    D -->|absent| E["MANIFEST.MF<br/>then filename only"]
    B -.->|present| PF["parse_forge('forge')"]
    MC -.->|present| PL["parse_mcmod_info"]
    C -.->|present| PQ["parse_quilt"]
    D -.->|present| PFA["parse_fabric"]
```

| Format (`ScannedMod.format`) | File | Parser | Notes |
|---|---|---|---|
| `neoforge:mods.toml` | `META-INF/neoforge.mods.toml` | `parse_forge(…, "neoforge")` | same TOML schema as Forge |
| `forge:mods.toml` | `META-INF/mods.toml` | `parse_forge(…, "forge")` | also reads `MANIFEST.MF` |
| `forge:mcmod.info` | `mcmod.info` | `parse_mcmod_info` | Forge ≤ 1.12.2 |
| `quilt:quilt.mod.json` | `quilt.mod.json` | `parse_quilt` | data under `quilt_loader` |
| `fabric:fabric.mod.json` | `fabric.mod.json` | `parse_fabric` | |
| `unknown:manifest` | `META-INF/MANIFEST.MF` | `unknown_mod` | name/version from `Implementation-*` |
| `unknown` / `unreadable` | — | `unknown_mod` / `read_mod` | filename only / jar cannot be opened |

### Metadata parsing — per-format details

**Forge/NeoForge ≥ 1.13** (`parse_forge`):
- reads the first `[[mods]]` (`modId`, `displayName` → fallback `modId` → fallback filename,
  `version`, `description`); if the jar declares several mods it is reported in `warnings`;
- empty `version` or one with a placeholder (`${file.jarVersion}`) → `Implementation-Version` from
  `MANIFEST.MF`; if still unresolved, a warning;
- `authors`: from a `"a, b"` string or an array (`authors_from_toml`);
- **dependencies** (`forge_dependencies`): from `[[dependencies.<modId>]]` with a
  **case-insensitive** lookup over **all** the mod ids declared in the jar; accepts both
  `[[dependencies.x]]` (array) and `[dependencies.x]` (single table); if no key matches but the
  table is not empty the entries are used anyway, with a warning. Mandatory if `type == "required"`
  or `mandatory` (default `true`); `optional`/`incompatible`/`discouraged` are not;
- if the TOML **cannot be parsed**, instead of losing everything it falls back to a lenient
  line-by-line read (`lenient_toml_value` on `modId`/`displayName`/`version`) + a warning.

**Forge ≤ 1.12.2** (`parse_mcmod_info`): `mcmod.info` is either a root array or
`{ modListVersion, modList: [...] }`. Fields: `modid`, `name`, `version` (`${version}` placeholder →
`MANIFEST.MF`), `description`, `authorList` (or `authors`). Dependencies:

| Field | Mandatory by default | Entry format |
|---|---|---|
| `requiredMods` | yes | `jei`, `jei@[4.15,)` |
| `dependencies` | no (load order only) | `after:jei`, `required-after:jei@[4.15,)` |

`parse_legacy_dep` recognises the FML ordering prefixes (`required-after:`, `after:`, `before:`):
a prefix containing `required` makes the dependency mandatory; the rest is split on `@` into name +
`versionRange`.

**Fabric** (`parse_fabric`): `id`, `name`, `version`, `description`; `authors` from an array of strings
or `{name}`; `dependencies` from `depends` (all `mandatory: true`).

**Quilt** (`parse_quilt`): everything under `quilt_loader` (`id`, `version`, `metadata.name/description`,
`contributors`); `depends` as strings (`version:"*"`, mandatory) or objects `{id, versions, optional}`
(`mandatory = !optional`).

## `provides` and JarJar

`provides` = **all** the modIds a jar makes available. It serves to avoid false
"missing dependency" reports: on Forge many dependencies are bundled inside the jar.

```mermaid
graph TD
    P["jar's provides"] --> M1["modId of each [[mods]] / mcmod.info entry"]
    P --> M2["manifest's 'provides' field"]
    P --> M3["JarJar: META-INF/jarjar/*.jar<br/>(collect_jarjar_provides, 1 level)"]
    M3 --> N["for each nested jar:<br/>buffer → ZipArchive(Cursor) → collect_provides"]
    P --> Norm["normalize: trim + lowercase<br/>drop empty · sort · dedup"]
```

`collect_provides` applies the same detection cascade (including `mcmod.info`) and collects the
modIds; on broken TOML it at least recovers the `modId` leniently. `collect_jarjar_provides` opens
each jar inside `META-INF/jarjar/` (reading it into a buffer and re-opening it with `Cursor`) and
calls `collect_provides` — **only one level** deep.

> ⚠️ Projects saved **before** the introduction of `provides` must be re-scanned (refresh)
> to benefit from JarJar; the verification fallback uses `modId` alone.

## Keybind recognition

Within the same opening of the jar, `collect_lang_docs` gathers the English language files in **both
formats** and `keybinds_from_langs` extracts the keybinds from them.

```mermaid
flowchart TD
    CL["collect_lang_docs(archive, spec)"] --> Top["top-level lang<br/>assets/*/lang/en_us.json<br/>assets/*/lang/en_US.lang"]
    CL --> JJ["lang in nested JarJar<br/>(1 level, e.g. Create→Ponder)"]
    Top --> Ord
    JJ --> Ord
    Ord["order: the profile's format first"] --> Parse["lang_entries<br/>JSON: flat object<br/>Properties: key=text, # comments"]
    Parse --> Test{"is_keybind_key(key)?"}
    Test -->|no| Skip["drop"]
    Test -->|yes| Dedup{"already seen?"}
    Dedup -->|yes| Skip
    Dedup -->|no| Add["KeybindAction {key, label}"]
    Add --> Sort["sort by label"]
```

Path recognition is **case-insensitive** (legacy `en_US.lang` vs `en_us.json`); the ordering puts the
profile's expected format first, so on jars containing both the one matching the MC version wins. If
the jar has **no** English language file at all, the scan reports it in `warnings` (that is the case
where keybinds cannot be detected).

### `is_keybind_key` — heuristic

A key is considered a keybind if:
1. it does **not** contain `.categories.` nor start with `key.categories.` (excludes category titles);
2. **and** it has at least one marker segment among: `key`, `keys`, `keybind`, `keybinds`, `keyinfo`,
   `keymapping`.

This covers the heterogeneous prefixes used by mods: `key.jei.x`, `cos.key.x`, `create.keyinfo.x`,
`iris.keybind.x`, `keybind.simplyjetpacks.x`, `mod.chiselsandbits.keys.x`.

> **Known limitation**: mods that name their KeyMappings **without** any marker (e.g. `config.jsg.*`,
> `placebo.toggleTrails`) are indistinguishable from other translations → not covered by the generic
> scan. For those, targeted resolution is used (below).

## Targeted keybind resolution

`resolve_keybind_labels(dir, keys, mc?, forge?)` receives the **exact** translation keys (e.g. the
`actionKey`s of an imported `keybindprofiles.json`) and searches for an **exact match** across the
lang files of each jar for the `label` and the owning `modId` — in both lang formats, so it works on
legacy mods too. No heuristic → it also resolves keybinds with non-standard names without false
positives. The first jar that defines a key wins; keys not found are omitted.

It is used by import ([09 — Keybind I/O](./09-keybind-io.md)) as the first step, more reliable than the
generic scan.

## Diagnostics (`format` + `warnings`)

Every `ScannedMod` carries the detected format and the list of problems (in English, like the
exporter warnings). List Mods shows them in the **Format** column: a badge with the metadata file
name and, when there are warnings, an icon with a tooltip; a summary card counts the mods **with
warnings**. Typical cases:

| Warning | Meaning |
|---|---|
| `Metadata format … expected …` | jar built for an MC version other than the project's |
| `… is not valid TOML …` | malformed `mods.toml`: metadata read leniently |
| `Dependencies are declared under a different mod id …` | `[[dependencies.x]]` key not aligned with `modId` |
| `Dependencies declared with … while … is expected` | `mandatory =` / `type =` style not aligned with the MC version |
| `No English language file … found` | keybinds cannot be detected from this jar |
| `Version placeholder could not be resolved` | `${…}` not resolvable without `Implementation-Version` |
| `No known mod metadata … was found` | no recognised format (data from MANIFEST or filename only) |

These fields do **not** end up in `project.json`: List Mods reads them from the scan cache (peek on
mount), so the project file stays lightweight.

## Datapack

`scan_datapacks(dir)` reads a folder and, for each `.zip` or folder with a `pack.mcmeta`, extracts a
`ScannedDatapack`:

- `read_datapack`: if a directory it reads `pack.mcmeta` from disk; if a `.zip` it reads it from the
  archive; it drops items without a `pack.mcmeta`.
- `parse_pack_mcmeta`: extracts `pack_format` and the `description` **flattened** from the Minecraft
  text component (`text_component_to_string` handles string/array/objects with `text`+`extra`).

## Frontend side — scan cache

Scans are cached in SQLite (no TTL, invalidated only by manual refresh):

| Helper | File | Cache key | Command |
|--------|------|--------------|---------|
| `getModsScanCached` / `peekModsScanCache` | [`mods-scan.ts`](../../../src/lib/mods-scan.ts) | `mods:v3:<mc>:<forge>:<workpath>` | `scan_mods` |
| `getKeybindActionsCached` / `peekKeybindActionsCache` | [`keybind-cache.ts`](../../../src/lib/keybind-cache.ts) | (derives from `mods:v3`) | — |
| `resolveKeybindLabels` | [`keybind-cache.ts`](../../../src/lib/keybind-cache.ts) | (none) | `resolve_keybind_labels` |
| `getDatapacksScanCached` / `peekDatapacksScanCache` | [`datapacks-scan.ts`](../../../src/lib/datapacks-scan.ts) | `datapacks:v1:<dir>` | `scan_datapacks` |

`getModsScanCached` is the **single** data source: List Mods derives the metadata from it (without copying the
`keybinds` into `project.json`), Keybinds/Import derive the per-mod actions from it (`toModKeybinds` filters
the mods with at least one keybind). The **version hint is part of the key**: changing the Minecraft
version changes the expected format, so the scan is redone. The `v3` prefix invalidates caches
written before legacy format support and the `format`/`warnings` fields.

## Tests

`cargo test --lib` covers the pure parts and an end-to-end case as well: the
`scansione_end_to_end_legacy_e_moderno` test builds two real `.jar` files (one with `mcmod.info` +
`en_US.lang`, one with `mods.toml` + `en_us.json`) in a temporary folder and checks metadata,
dependencies, keybinds, `format`, `warnings` and `resolve_keybind_labels`.
