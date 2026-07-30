<div align="center">

<img src="src-tauri/icons/icon.png" alt="ForgeModpack logo" width="512" height="512" />

# ForgeModpack

**Manager and configuration editor for Minecraft modpacks — desktop, offline-first.**

[![Version](https://img.shields.io/badge/version-1.2.6-blue.svg)](package.json)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB.svg?logo=tauri)](https://tauri.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000.svg?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**🌐 Language:** **English** · [Italiano](README.it.md)

</div>

---

## What it is

**ForgeModpack** is a **desktop** app that helps you **manage the dependencies and
configuration of an existing Minecraft modpack**. You point it at the modpack folder:
the app reads the mods and configs from disk and — **only when needed** — fetches version
metadata online (Minecraft and modloader). Everything lives in a project file
`<name>.json` saved in the working folder (`workpath`).

> [!IMPORTANT]
> **What it is NOT.** ForgeModpack **is not a launcher**: it does not download mods and it
> does not launch Minecraft. It is a **configuration manager/editor**, designed to verify
> dependencies, organize keybinds and edit your modpack's config files.

<div align="center">

![Application screenshot](docs/screenshot.gif)

*ForgeModpack dashboard — placeholder, replace with a real screenshot.*

</div>

## Key features

- 🗂️ **Dashboard** — create/open/save a project, manage metadata, choose the modloader
  (**Forge · NeoForge · Fabric · Quilt · Datapack**, with **hybrid** mode) and the MC/loader
  versions filtered from remote manifests.
- ⚡ **Manifest cache (SQLite)** — versions are cached locally (24h TTL) with manual
  refresh: fast startups and full **offline** operation.
- 🧩 **List Mods** — scans the `.jar` files (Rust backend) and extracts metadata from every
  loader format, legacy Forge included (`mcmod.info`, ≤ 1.12.2). Sortable and filterable
  table with active state, **missing dependency check** (including dependencies bundled via
  JarJar), **compatibility with the project's Minecraft version** and the metadata file each
  jar was read from, with scan warnings.
- 🛠️ **Notes and false positives** — a free note per mod, plus manual corrections to the
  checks: fix the value by hand (MC constraint, modId) or mark an issue as a false positive,
  stating the reason. What you silence leaves the counters and the filters, and a wrench
  marker keeps *"check passed"* from looking the same as *"check silenced"*.
- 🔄 **Sync with disk** — mods and datapacks are re-read from the folder every time you open
  the project: jars added, updated or deleted outside the app show up immediately.
- 📦 **Datapack** — manage datapacks (`.zip`/folders with `pack.mcmeta`), on their own or in
  a hybrid combination with a classic loader.
- ⌨️ **Keybinds** — graphical **keyboard editor** (ISO/IT layout + numpad + mouse), multiple
  maps, **unlimited layers** per map, classification by **Mod** and by **Tag**, macros
  (modifier + key) and filters that **isolate** the selection instead of dimming it. The
  actions are the real ones: read from the **bytecode** of the classes that use the
  Forge/NeoForge keybind API, plus the mods' language files.
- 🔁 **Keybind import/export** — import keybind profiles and resolve the actions against the
  installed mods; **export** to Minecraft's `options.txt` (conservative merge), to
  **Keyset** (`keybindprofiles.json`, every map in one file), to interactive **HTML** and to
  **PNG** images packed in a ZIP (one per layer plus the complete one).
- 🎛️ **JVM** — manage JVM arguments (RAM + garbage collector) with the generated flags.
- 📝 **Documents** — file explorer for `config`/`kubejs` in the sidebar + **Monaco code
  editor** (offline) with its own dirty state, separate from the project.
- 🔔 **Update check** — the app checks GitHub Releases at startup (silently) or on demand,
  with an opt-in for pre-releases. It never updates itself: you download the installer.
- 🌐 **Bilingual interface** — Italian and English, switchable at runtime.
- 📊 **Analytics** — *planned*: modpack summaries and statistics (the page is still a
  placeholder).

## Tech stack

| Area | Technologies |
| --- | --- |
| Desktop shell | **Tauri 2** (**Rust** backend, edition 2021) |
| Frontend | **Next.js 16** (App Router, `output: "export"` / pure SSG), **React 19**, **TypeScript strict** |
| State | **Redux Toolkit** + React-Redux |
| UI | **shadcn/ui**, **Radix UI**, **Tailwind CSS v4**, `lucide-react`, `sonner` |
| Editor | **Monaco** (`@monaco-editor/react`, served offline from `public/monaco`) |
| Persistence | JSON project file + **SQLite** cache (`tauri-plugin-sql`) |
| Tooling | **pnpm**, `@tauri-apps/cli` |

## Requirements

- **Windows** — ready-made installers are published with every release.
- **macOS / Linux** — no published binaries yet: the app is built with Tauri, so it can be
  compiled from source (`pnpm tauri:build`).
- An existing Minecraft modpack on disk to manage.

## Installation (end user)

Download the latest version from the
**[Releases](https://github.com/Alexkill536ITA/ForgeModpack/releases)** page:

- `forgemodpack_<version>_x64-setup.exe` — NSIS installer (recommended)
- `forgemodpack_<version>_x64_en-US.msi` — MSI package

On first launch, create or open a project by pointing it at your modpack folder. The app tells
you when a newer version is out, but it never installs anything on its own: you download and
run the installer.

## Development

### Prerequisites

- [Node.js](https://nodejs.org) (LTS) + **[pnpm](https://pnpm.io)** (do not use npm/yarn)
- **[Rust](https://www.rust-lang.org/tools/install)** toolchain (for Tauri)
- The [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your platform

### Setup

```bash
pnpm install
pnpm tauri:dev     # start the desktop app in development (also launches the Next dev server)
```

> [!NOTE]
> The `@tauri-apps/plugin-*` APIs (fs, dialog, http, sql) **only work inside the Tauri
> app**. With `pnpm dev` alone (web on http://localhost:3000) these features are not
> available: use `pnpm tauri:dev` to test the real functionality.

### Commands

```bash
pnpm dev          # Next dev server (web, http://localhost:3000)
pnpm tauri:dev    # Desktop app in dev
pnpm build        # Static Next export -> ./out (consumed by Tauri)
pnpm tauri:build  # Build the desktop executable (requires a version bump, see Versioning)
pnpm bump         # Interactive version bump (patch/minor/major) + commit + tag
pnpm icons        # Regenerate the app icons from the source image
```

Checks:

```bash
pnpm exec tsc --noEmit              # frontend type-check
cd src-tauri && cargo test --lib    # Rust tests (metadata parsers, version ranges, keybinds)
```

> [!NOTE]
> `pnpm lint` currently fails: `next lint` was removed in Next.js 16 and the script has not
> been replaced yet. The type-check above is what you should run.

## Project structure

```
ForgeModpack_V2/
├─ src/
│  ├─ app/            # Next.js pages (App Router): /, /listmods, /keybinds,
│  │                  #   /jvm, /documents, /analytics
│  ├─ components/     # React components (shadcn UI in components/ui, plus
│  │                  #   listmods/ and keybinds/ dialogs)
│  ├─ redux/          # Store and slices (project, manifest, documents, keybind, busy)
│  ├─ lib/            # Helpers: manifests, caches, scans, mod checks, keybind export
│  ├─ model/          # Data model types (project, mod, keybind, manifest)
│  └─ i18n/           # Custom i18n system + it/en dictionaries
├─ src-tauri/
│  └─ src/            # Rust backend: lib.rs, mods.rs (jar/datapack scans),
│                     #   keybind_scan.rs + class_scan.rs (keybinds from bytecode),
│                     #   forge_spec.rs, mc_compat.rs (version ranges),
│                     #   files.rs (file tree)
├─ docs/              # IT/EN documentation (technical + usage guide)
├─ scripts/           # bump-version, check-version, copy-monaco, generate-icons
└─ public/            # Static assets (loader icons, Monaco)
```

## Documentation

The full documentation is in [`docs/`](docs) (with Mermaid diagrams), in **two languages**
and **two levels**:

- 🇬🇧 **Technical** (developers): [`docs/en/technical/`](docs/en/technical/README.md)
- 🇬🇧 **Usage guide** (users): [`docs/en/usage/`](docs/en/usage/README.md)
- 🇮🇹 **Tecnica**: [`docs/it/tecnica/`](docs/it/tecnica/README.md)
- 🇮🇹 **Guida d'uso**: [`docs/it/utilizzo/`](docs/it/utilizzo/README.md)

Each folder starts from its own `README.md` (index). The **release notes** — bilingual, one
entry per version — are on the
[Releases](https://github.com/Alexkill536ITA/ForgeModpack/releases) page.

## Versioning & build

The version is kept in sync across three files (`package.json` = source of truth,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` + `Cargo.lock`) plus the badge in both
READMEs. `pnpm bump` updates them all at once and creates a commit + `vX.Y.Z` tag.

> [!WARNING]
> The build is **blocked** by a version-check script: `pnpm tauri:build` fails if the
> `v<version>` tag is missing or if there are commits after that tag. Always run
> `pnpm bump` before producing a new executable.

## Contributing

Contributions are welcome! Before opening a PR:

1. Follow the project conventions (comments and documentation in **Italian**; UI
   internationalized via `t("namespace.key")` with **matching keys** in `en.json` and
   `it.json`, never hardcoded strings; every scrollable area uses `ScrollArea`).
2. Verify the type-check (`pnpm exec tsc --noEmit`) and, if you touched the backend, the
   Rust tests (`cd src-tauri && cargo test --lib`).
3. Test the real features with `pnpm tauri:dev`.

See the [technical documentation](docs/en/technical/README.md) for the architecture.

## License

Distributed under the **MIT** license. See the [`LICENSE`](LICENSE) file for the full text.

© 2026 Alexkill536ITA

---

<div align="center">
<sub>Built with Tauri 2 + Next.js 16 · Author: <code>alexkill536</code></sub>
</div>
