<div align="center">

<img src="src-tauri/icons/icon.png" alt="Logo ForgeModpack" width="512" height="512" />

# ForgeModpack

**Gestore e editor di configurazione per modpack Minecraft — desktop, offline-first.**

[![Version](https://img.shields.io/badge/version-1.2.6-blue.svg)](package.json)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB.svg?logo=tauri)](https://tauri.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000.svg?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**🌐 Lingua:** **Italiano** · [English](README.md)

</div>

---

## Cos'è

**ForgeModpack** è un'app **desktop** che aiuta a **gestire le dipendenze e le
configurazioni di un modpack Minecraft esistente**. Indichi la cartella del modpack:
l'app legge da disco i mod e le config presenti e — **solo se serve** — recupera online
i metadati delle versioni (Minecraft e modloader). Il tutto vive in un file di progetto
`<nome>.json` salvato nella cartella di lavoro (`workpath`).

> [!IMPORTANT]
> **Cosa NON è.** ForgeModpack **non è un launcher**: non scarica i mod e non avvia
> Minecraft. È un **manager/editor di configurazione**, pensato per verificare
> dipendenze, organizzare keybind e modificare i file di config del tuo modpack.

<div align="center">

![Application screenshot](docs/screenshot.gif)

*Dashboard di ForgeModpack — placeholder, sostituire con uno screenshot reale.*

</div>

## Funzionalità principali

- 🗂️ **Dashboard** — crea/apri/salva un progetto, gestisci i metadata, scegli modloader
  (**Forge · NeoForge · Fabric · Quilt · Datapack**, con modalità **ibrida**) e le versioni
  MC/loader filtrate dai manifest remoti.
- ⚡ **Cache manifest (SQLite)** — le versioni sono cachate localmente (TTL 24h) con
  refresh manuale: avvii rapidi e piena operatività **offline**.
- 🧩 **List Mods** — scansiona i `.jar` (backend Rust) ed estrae i metadati da tutti i
  formati di loader, compreso il Forge legacy (`mcmod.info`, ≤ 1.12.2). Tabella ordinabile e
  filtrabile con stato attivo, **verifica delle dipendenze mancanti** (incluse quelle
  bundlate via JarJar), **compatibilità con la versione di Minecraft del progetto** e il file
  di metadati da cui ogni jar è stato letto, con gli avvisi di scansione.
- 🛠️ **Note e falsi positivi** — una nota libera per ogni mod, più le correzioni manuali dei
  controlli: correggi il valore a mano (vincolo MC, modId) o marca il problema come falso
  positivo, indicando il motivo. Quello che silenzi esce dai conteggi e dai filtri, e un
  marcatore a chiave inglese distingue *"controllo superato"* da *"controllo messo a tacere"*.
- 🔄 **Sincronizzazione col disco** — mod e datapack vengono riletti dalla cartella a ogni
  apertura del progetto: i jar aggiunti, aggiornati o cancellati fuori dall'app si vedono
  subito.
- 📦 **Datapack** — gestisci i datapack (`.zip`/cartelle con `pack.mcmeta`), da soli o in
  combinazione ibrida con un loader classico.
- ⌨️ **Keybinds** — editor **grafico di tastiera** (layout ISO/IT + numpad + mouse), mappe
  multiple, **livelli illimitati** per mappa, classificazione per **Mod** e per **Tag**,
  macro (modificatore + tasto) e filtri che **isolano** la selezione invece di attenuarla. Le
  azioni sono quelle vere: lette dal **bytecode** delle classi che usano l'API keybind di
  Forge/NeoForge, più i file di lingua dei mod.
- 🔁 **Import/Export keybind** — importa profili di keybind e risolvi le azioni sui mod
  installati; **esporta** verso `options.txt` di Minecraft (merge conservativo), verso
  **Keyset** (`keybindprofiles.json`, tutte le mappe in un file), in **HTML** interattivo e in
  immagini **PNG** dentro uno ZIP (una per livello più quella completa).
- 🎛️ **JVM** — gestione degli argomenti della JVM (RAM + garbage collector) con i flag
  generati.
- 📝 **Documents** — file explorer di `config`/`kubejs` nella sidebar + **editor di codice
  Monaco** (offline) con dirty-state proprio, separato dal progetto.
- 🔔 **Controllo aggiornamenti** — l'app controlla le GitHub Releases all'avvio (in silenzio)
  o su richiesta, con opzione per includere le pre-release. Non si aggiorna mai da sola:
  l'installer lo scarichi tu.
- 🌐 **Interfaccia bilingue** — italiano e inglese, cambiabili al volo.
- 📊 **Analytics** — *previsto*: riepiloghi e statistiche del modpack (la pagina è ancora un
  segnaposto).

## Stack tecnologico

| Ambito | Tecnologie |
| --- | --- |
| Shell desktop | **Tauri 2** (backend **Rust**, edition 2021) |
| Frontend | **Next.js 16** (App Router, `output: "export"` / SSG puro), **React 19**, **TypeScript strict** |
| State | **Redux Toolkit** + React-Redux |
| UI | **shadcn/ui**, **Radix UI**, **Tailwind CSS v4**, `lucide-react`, `sonner` |
| Editor | **Monaco** (`@monaco-editor/react`, servito offline da `public/monaco`) |
| Persistenza | file di progetto JSON + cache **SQLite** (`tauri-plugin-sql`) |
| Tooling | **pnpm**, `@tauri-apps/cli` |

## Requisiti

- **Windows** — a ogni release vengono pubblicati gli installer pronti all'uso.
- **macOS / Linux** — nessun binario pubblicato: l'app è basata su Tauri, quindi si può
  compilare dai sorgenti (`pnpm tauri:build`).
- Un modpack Minecraft esistente su disco da gestire.

## Installazione (utente finale)

Scarica l'ultima versione dalla pagina
**[Releases](https://github.com/Alexkill536ITA/ForgeModpack/releases)**:

- `forgemodpack_<versione>_x64-setup.exe` — installer NSIS (consigliato)
- `forgemodpack_<versione>_x64_en-US.msi` — pacchetto MSI

Al primo avvio, crea o apri un progetto puntando alla cartella del tuo modpack. L'app ti avvisa
quando esce una versione nuova, ma non installa mai niente da sola: l'installer lo scarichi e
lo lanci tu.

## Sviluppo

### Prerequisiti

- [Node.js](https://nodejs.org) (LTS) + **[pnpm](https://pnpm.io)** (non usare npm/yarn)
- Toolchain **[Rust](https://www.rust-lang.org/tools/install)** (per Tauri)
- Le [dipendenze di sistema di Tauri](https://tauri.app/start/prerequisites/) per la tua piattaforma

### Setup

```bash
pnpm install
pnpm tauri:dev     # avvia l'app desktop in sviluppo (lancia anche il dev server Next)
```

> [!NOTE]
> Le API `@tauri-apps/plugin-*` (fs, dialog, http, sql) **funzionano solo dentro l'app
> Tauri**. Con il solo `pnpm dev` (web su http://localhost:3000) queste feature non sono
> disponibili: per testare le funzionalità reali usa `pnpm tauri:dev`.

### Comandi

```bash
pnpm dev          # Next dev server (web, http://localhost:3000)
pnpm tauri:dev    # App desktop in dev
pnpm build        # Export statico Next -> ./out (consumato da Tauri)
pnpm tauri:build  # Build dell'eseguibile desktop (richiede il bump, vedi Versioning)
pnpm bump         # Bump interattivo della versione (patch/minor/major) + commit + tag
pnpm icons        # Rigenera le icone dell'app dall'immagine sorgente
```

Verifiche:

```bash
pnpm exec tsc --noEmit              # type-check del frontend
cd src-tauri && cargo test --lib    # test Rust (parser dei metadati, range di versione, keybind)
```

> [!NOTE]
> `pnpm lint` al momento fallisce: `next lint` è stato rimosso in Next.js 16 e lo script non è
> ancora stato sostituito. La verifica da eseguire è il type-check qui sopra.

## Struttura del progetto

```
ForgeModpack_V2/
├─ src/
│  ├─ app/            # Pagine Next.js (App Router): /, /listmods, /keybinds,
│  │                  #   /jvm, /documents, /analytics
│  ├─ components/     # Componenti React (UI shadcn in components/ui, più i dialog
│  │                  #   in listmods/ e keybinds/)
│  ├─ redux/          # Store e slice (project, manifest, documents, keybind, busy)
│  ├─ lib/            # Helper: manifest, cache, scansioni, controlli mod, export keybind
│  ├─ model/          # Tipi del modello dati (project, mod, keybind, manifest)
│  └─ i18n/           # Sistema i18n custom + dizionari it/en
├─ src-tauri/
│  └─ src/            # Backend Rust: lib.rs, mods.rs (scansione jar/datapack),
│                     #   keybind_scan.rs + class_scan.rs (keybind dal bytecode),
│                     #   forge_spec.rs, mc_compat.rs (range di versione),
│                     #   files.rs (file tree)
├─ docs/              # Documentazione IT/EN (tecnica + guida d'uso)
├─ scripts/           # bump-version, check-version, copy-monaco, generate-icons
└─ public/            # Asset statici (icone loader, Monaco)
```

## Documentazione

La documentazione completa è in [`docs/`](docs) (con diagrammi Mermaid), in **due lingue**
e **due livelli**:

- 🇮🇹 **Tecnica** (sviluppatori): [`docs/it/tecnica/`](docs/it/tecnica/README.md)
- 🇮🇹 **Guida d'uso** (utenti): [`docs/it/utilizzo/`](docs/it/utilizzo/README.md)
- 🇬🇧 **Technical**: [`docs/en/technical/`](docs/en/technical/README.md)
- 🇬🇧 **Usage guide**: [`docs/en/usage/`](docs/en/usage/README.md)

Ogni cartella parte dal proprio `README.md` (indice). Le **note di rilascio** — bilingui, una
per versione — stanno nella pagina
[Releases](https://github.com/Alexkill536ITA/ForgeModpack/releases).

## Versioning & build

La versione è allineata in tre file (`package.json` = fonte di verità,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` + `Cargo.lock`) più il badge nei due
README. `pnpm bump` li aggiorna in blocco e crea commit + tag `vX.Y.Z`.

> [!WARNING]
> La build è **bloccata** da uno script di controllo versione: `pnpm tauri:build`
> fallisce se manca il tag `v<versione>` o se ci sono commit dopo quel tag. Esegui sempre
> `pnpm bump` prima di produrre un nuovo eseguibile.

## Contribuire

I contributi sono benvenuti! Prima di aprire una PR:

1. Segui le convenzioni del progetto (commenti e documentazione in **italiano**; UI
   internazionalizzata via `t("namespace.key")` con **parità di chiavi** tra `en.json` e
   `it.json`, mai stringhe hardcoded; ogni area scrollabile usa `ScrollArea`).
2. Verifica il type-check (`pnpm exec tsc --noEmit`) e, se hai toccato il backend, i test
   Rust (`cd src-tauri && cargo test --lib`).
3. Testa le feature reali con `pnpm tauri:dev`.

Consulta la [documentazione tecnica](docs/it/tecnica/README.md) per l'architettura.

## Licenza

Distribuito con licenza **MIT**. Vedi il file [`LICENSE`](LICENSE) per il testo completo.

© 2026 Alexkill536ITA

---

<div align="center">
<sub>Creato con Tauri 2 + Next.js 16 · Autore: <code>alexkill536</code></sub>
</div>
