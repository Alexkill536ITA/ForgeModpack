# 02 — Data model

All the saveable state of a modpack lives in a single `project` object
([`src/model/models.ts`](../../../src/model/models.ts)), serialized to the file
`<workpath>/<name>.json`. The types for the remote manifests live instead in
[`src/model/manifest-mc-ml.ts`](../../../src/model/manifest-mc-ml.ts).

## Entity diagram

```mermaid
classDiagram
    class project {
        metadata
        modloader
        assetes: asset[]
        notes?: string[]
        mods: mod[]
        datapacks?: datapack[]
        keybindMaps: keybindMap[]
        keybindCategories: keybindCategory[]
        keybindTags: keybindTag[]
        jvm: jvmSettings
        configs
    }
    class metadata {
        name: string
        version: string
        description: string
    }
    class modloader {
        mcversion: string
        type: modloaderTypes
        version: string
        hybrid?: boolean
        hybridLoader?: modloaderTypes
    }
    class configs {
        workpath: string
        datapacksPath?: string
    }
    class mod {
        active: boolean
        filename: string
        modId: string
        name: string
        modloader: modloaderTypes
        version: string
        provides: string[]
        description?: string
        authors?: string[]
        dependencies?: dependency[]
        note?: string
        checks?: modChecks
    }
    class modChecks {
        mc?: checkFix
        dependencies?: Record~string, checkFix~
        warnings?: Record~string, checkFix~
    }
    class checkFix {
        falsePositive?: boolean
        value?: string
        note?: string
    }
    class dependency {
        name: string
        version: string
        mandatory: boolean
    }
    class datapack {
        active: boolean
        filename: string
        name: string
        description?: string
        packFormat?: number
    }
    class asset {
        type: string
        name: string
        path: string
        url?: string
        notes?: string[]
    }
    class jvmSettings {
        ramGb: number
        gc: gcType
    }
    class keybindMap {
        name: string
        keybinds: keybind[]
        macros?: macro[]
    }
    class keybind {
        key: string
        action: string
        actionKey?: string
        category: string
    }
    class macro {
        modifier: macroModifier
        key: string
        action: string
        actionKey?: string
        category: string
    }
    class keybindCategory {
        name: string
        color: string
        tags: string[]
    }
    class keybindTag {
        name: string
    }

    project *-- metadata
    project *-- modloader
    project *-- configs
    project *-- jvmSettings
    project "1" *-- "*" mod
    project "1" *-- "*" datapack
    project "1" *-- "*" asset
    project "1" *-- "*" keybindMap
    project "1" *-- "*" keybindCategory
    project "1" *-- "*" keybindTag
    mod "1" *-- "*" dependency
    mod "1" *-- "0..1" modChecks
    modChecks "1" *-- "*" checkFix
    keybindMap "1" *-- "*" keybind
    keybindMap "1" *-- "*" macro
```

## `project` — main fields

| Field | Type | Notes |
|-------|------|-------|
| `metadata` | `{ name, version, description }` | Pack metadata |
| `modloader` | see below | Loader + versions + hybrid mode |
| `assetes` | `asset[]` | Resources (resource/shader pack…) — historical name with a typo |
| `notes?` | `string[]` | Free-form project notes (optional, backward compatible) |
| `mods` | `mod[]` | Mod list, derived from the scan |
| `datapacks?` | `datapack[]` | Datapacks (optional, backward compatible) |
| `keybindMaps` | `keybindMap[]` | Keybind maps (multi-map) |
| `keybindCategories` | `keybindCategory[]` | Primary categories = mods (+ "Vanilla") |
| `keybindTags` | `keybindTag[]` | Secondary filter tags |
| `jvm` | `jvmSettings` | RAM + garbage collector |
| `configs` | `{ workpath, datapacksPath? }` | Project paths |

### `modloader` and the hybrid mode

```mermaid
graph TD
    Type{"modloader.type"}
    Type -->|forge/neoforge/fabric/quilt| Classic["Classic loader<br/>+ modloader.version<br/>mods/"]
    Type -->|datapack| DP["Datapack only<br/>no loader version<br/>datapacks/"]
    DP --> Hyb{"modloader.hybrid?"}
    Hyb -->|true| Both["Hybrid:<br/>hybridLoader + version<br/>mods/ AND datapacks/"]
    Hyb -->|false| OnlyDP["datapacks/ only"]
```

`modloaderTypes` (enum): `forge`, `neoforge`, `fabric`, `quilt`, `datapack`, `unknown`.

- With a classic `type`: the modpack has only mods; `version` = the loader version.
- With `type === "datapack"`: no loader version, it depends only on `mcversion`.
  - If `hybrid === true`: `hybridLoader` is the additional classic loader and `version` becomes
    its version → modpack with **mods AND datapacks**.

### `mod`

Populated by scanning the jars (see [06 — Scanning](./06-scansione.md)). The key field is
`provides`: **all** the modIds made available by the jar (multi-`[[mods]]`, the `provides` field
and dependencies bundled via JarJar). It is used by List Mods' dependency check to avoid false
"missing dependency" reports. `active` is preserved by `filename` across scans.

> ⚠️ The `keybinds` read from the scan are **not** copied into `project.json`: they stay only in
> the SQLite cache, so the project file remains lightweight.

### `note` and `checks` — the user's own data about a mod

These are the only fields of `mod` that do **not** come from the scan, so
[`toProjectMods`](../../../src/lib/mods-sync.ts) preserves them by `filename` together with
`active` (otherwise re-reading the jars would wipe them); they are excluded from the diff
signature, just like `active`. A mod that disappears from disk takes its note with it.

- **`note?: string`** — free note about the mod ("do not update: it breaks the recipes…"). In List
  Mods it shows up as an icon in the corner of the name cell, with the text in the tooltip.
- **`checks?: modChecks`** — manual corrections of the diagnostic checks. The checks (MC
  compatibility, missing dependencies, warnings) read metadata written by hand by mod authors: they
  can be wrong. A `checkFix` records `falsePositive` (the issue is not real), `value` (the correct
  value: MC constraint or the dependency's modId) and `note` (**the reason**), so the decision stays
  written in the project instead of living in the head of whoever made it.

`modChecks` has one entry per **check column**, and for dependencies/warnings the correction is
keyed on the **single issue** (declared modId / warning text): a false positive covering "the whole
column" would also hide issues that appear after a jar update. The logic that applies the
corrections lives in [`mod-checks.ts`](../../../src/lib/mod-checks.ts) (pure functions) and is used
by both the cells and the counters/filters of List Mods.

### `keybind` / `macro` / `keybindCategory` / `keybindTag`

- **`keybind`**: `key` (id of the physical key, see [`keyboard-layout.ts`](../../../src/lib/keyboard-layout.ts)),
  `action` (human-readable label), `actionKey?` (translation key for export, backward compatible),
  `category` (mod name or "Vanilla").
- **`macro`**: like `keybind` but with a `modifier` (`ctrl` | `shift` | `alt`) — combinations like
  Ctrl+A; they live in the map separately from normal keybinds.
- **`keybindCategory`**: primary category = a mod (`name` = mod name), with a HEX `color` and `tags[]`.
- **`keybindTag`**: second filter axis (only `name`).

Details in [08 — Keybinds](./08-keybinds.md).

### `jvmSettings`

`{ ramGb: number, gc: gcType }` with `gcType = "g1" | "zgc" | "shen"`. Default via
`defaultJvmSettings()` → `{ ramGb: 4, gc: "g1" }`. See [10 — JVM](./10-jvm.md).

## Remote manifest types

[`manifest-mc-ml.ts`](../../../src/model/manifest-mc-ml.ts) defines the shapes of the API responses:

- **`MinecraftManifest`**: `{ latest: {release, snapshot}, versions: VersionEntry[] }`.
- **`ForgeMavenMetadata`**: map `{ [mcVersion]: string[] }`.
- **`NeoForgeVersions`**: `{ isSnapshot: boolean, versions: string[] }`.
- **Fabric / Quilt**: separate responses for loader and game version, recomposed into `ModLoaderManifest`
  by [`get-manifest.ts`](../../../src/lib/get-manifest.ts).

See [07 — Cache and manifests](./07-cache-manifest.md).

## `toastStyles`

`models.ts` also exports `toastStyles` (info/success/warning/destructive): objects of custom CSS
properties to color sonner's toasts consistently with the theme.
