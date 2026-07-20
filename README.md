<div align="center">

<img src="src-tauri/icons/icon.png" alt="ForgeModpack logo" width="512" height="512" />

# ForgeModpack

**Manager and configuration editor for Minecraft modpacks — desktop, offline-first.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
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
- 🧩 **List Mods** — scans the `.jar` files (Rust backend) and extracts metadata from the
  various loader formats; table with name, version, loader, authors, active state and
  **missing dependency checks** (including those bundled via JarJar).
- 📦 **Datapack** — manage datapacks (`.zip`/folders with `pack.mcmeta`), on their own or in
  a hybrid combination with a classic loader.
- ⌨️ **Keybinds** — graphical **keyboard editor** (ISO/IT layout + numpad + mouse), multiple
  maps, classification by **Mod** and by **Tag**, up to 4 bindings per key and real actions
  extracted from the mods' language files.
- 🔁 **Keybind import/export** — import keybind profiles and resolve the actions against the
  installed mods; **export** to Minecraft's `options.txt` with conservative merge.
- 🎛️ **JVM** — manage JVM arguments.
- 📝 **Documents** — file explorer for `config`/`kubejs` in the sidebar + **Monaco code
  editor** (offline) with its own dirty state, separate from the project.
- 📊 **Analytics** — modpack summaries and statistics.

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

- **Windows / macOS / Linux** (the app is distributed via Tauri; NSIS bundle on Windows).
- An existing Minecraft modpack on disk to manage.

## Installation (end user)

<!-- TODO: add the binaries link once the release is published -->
Download the latest version from the **[Releases](https://github.com/<owner>/<repo>/releases)**
page and install the executable for your operating system. On first launch, create or open a
project by pointing it at your modpack folder.

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
pnpm lint         # Lint
```

## Project structure

```
ForgeModpack_V2/
├─ src/
│  ├─ app/            # Next.js pages (App Router): /, /listmods, /keybinds,
│  │                  #   /jvm, /documents, /analytics
│  ├─ components/     # React components (shadcn UI in components/ui)
│  ├─ redux/          # Store and slices (project, manifest, documents, keybind...)
│  ├─ lib/            # Helpers: manifest, cache, scans, keybind-export, i18n utils
│  ├─ model/          # Data model types (project, mod, keybind, manifest)
│  └─ i18n/           # Custom i18n system + it/en dictionaries
├─ src-tauri/
│  └─ src/            # Rust backend: lib.rs, mods.rs (scans), files.rs (file tree)
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

Each folder starts from its own `README.md` (index).

## Versioning & build

The version is kept in sync across three files (`package.json` = source of truth,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` + `Cargo.lock`). `pnpm bump` updates them
all at once and creates a commit + `vX.Y.Z` tag.

> [!WARNING]
> The build is **blocked** by a version-check script: `pnpm tauri:build` fails if the
> `v<version>` tag is missing or if there are commits after that tag. Always run
> `pnpm bump` before producing a new executable.

## Contributing

Contributions are welcome! Before opening a PR:

1. Follow the project conventions (comments and documentation in **Italian**; UI
   internationalized via `t("namespace.key")`, never hardcoded strings).
2. Verify type-check and lint (`pnpm lint`).
3. Test the real features with `pnpm tauri:dev`.

See the [technical documentation](docs/en/technical/README.md) for the architecture.

## License

Distributed under the **MIT** license. See the [`LICENSE`](LICENSE) file for the full text.

© 2026 Alexkill536ITA

---

<div align="center">
<sub>Built with Tauri 2 + Next.js 16 · Author: <code>alexkill536</code></sub>
</div>
