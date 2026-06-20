# ForgeModpack V2

App desktop (**Tauri 2 + Next.js 16**) per **gestire le dipendenze di un modpack Minecraft**.

## Obiettivo

L'utente indica la **directory di un modpack esistente**; l'app legge direttamente le
configurazioni e i mod presenti sul disco e, **solo se necessario**, recupera online i
metadati (versioni MC e dei modloader). **Non scarica i mod** né avvia Minecraft: è un
manager/editor di configurazione, non un launcher.

Il progetto vive in un file `<nome>.json` (tipo [`project`](src/model/models.ts)) salvato
nella `workpath` scelta dall'utente.

## Comandi

```bash
pnpm dev          # Next dev server (web, http://localhost:3000)
pnpm tauri:dev    # App desktop in dev (avvia anche `pnpm dev`)
pnpm tauri:build  # Build dell'eseguibile desktop
pnpm build        # Export statico Next -> ./out (consumato da Tauri)
pnpm lint
```

Usa **pnpm** (non npm/yarn). Per testare le feature reali serve `tauri:dev`: le API
`@tauri-apps/plugin-*` (fs, dialog, http, sql) **non funzionano** nel solo `pnpm dev`.

## Stack & convenzioni

- **Next.js 16 App Router**, `output: "export"` (SSG puro, niente server/route handlers).
  Le pagine sono `"use client"`; immagini `unoptimized`.
- **Redux Toolkit** per lo state globale ([`src/redux`](src/redux)): slice `project`,
  `minecraftManifest`, `modLoaderManifest`, `documents` (file aperto nell'editor). Accesso via `useAppSelector`/`useAppDispatch`
  ([`hooks.ts`](src/redux/hooks.ts)), mai `useSelector` grezzo.
- **shadcn/ui** ([`src/components/ui`](src/components/ui)) + **Tailwind v4** (config in
  [`globals.css`](src/app/globals.css), tema `dark` forzato nel layout). Non modificare a
  mano i componenti `ui/`: rigenerali con `pnpm dlx shadcn@latest add <comp>`.
- **TypeScript strict**. Alias import `@/*` -> root.
- **Lingua**: testi UI in **inglese**, commenti e documentazione in **italiano** (vedi
  [`json-data.ts`](src/lib/json-data.ts)).

## Architettura

- **Modello dati**: [`src/model/models.ts`](src/model/models.ts) (`project`, `mod`,
  `asset`, `keybind`...) e [`manifest-mc-ml.ts`](src/model/manifest-mc-ml.ts) (tipi dei
  manifest remoti MC/Forge/NeoForge/Fabric/Quilt).
- **Manifest remoti**: [`get-manifest.ts`](src/lib/get-manifest.ts) usa
  `@tauri-apps/plugin-http` per scaricare versioni MC + modloader. Gli URL consentiti sono
  whitelistati in [`capabilities/default.json`](src-tauri/capabilities/default.json) —
  **ogni nuovo host va aggiunto lì**, altrimenti la fetch fallisce.
- **Cache versioni (SQLite)**: per non interrogare le API a ogni avvio, i manifest sono
  cachati in un DB SQLite (`tauri-plugin-sql`, feature `sqlite`). Tabella key-value
  `manifest_cache(key, data, updated_at)` con `data` = JSON serializzato; migration definita
  in [`lib.rs`](src-tauri/src/lib.rs). Accesso generico in
  [`cache-db.ts`](src/lib/cache-db.ts); orchestrazione TTL/fetch/fallback offline in
  [`manifest-cache.ts`](src/lib/manifest-cache.ts) (`getMinecraftManifestCached` /
  `getModLoaderManifestCached`, TTL 24h, `force=true` per il refresh manuale). La home fa il
  bootstrap dalla cache al mount e ricarica solo se assente/scaduta.
- **Lettura/scrittura file**: via `@tauri-apps/plugin-fs` / `plugin-dialog` direttamente
  nelle pagine; helper in [`database.ts`](src/lib/database.ts).
- **Editing immutabile del project**: [`json-data.ts`](src/lib/json-data.ts) espone
  `getByPath` / `setByPath` / `addByPath` / `removeByPath` con notazione a punti + filtri
  (`"mods[name=jei].version"`). Sono **immutabili** (ritornano un nuovo oggetto): usale per
  ogni modifica al project prima di fare `dispatch(updateProject(...))`. È il pattern
  centrale usato in [`page.tsx`](src/app/page.tsx) via `handleUpdateField`.
- **Layout**: [`layout.tsx`](src/app/layout.tsx) monta `ReduxProvider`, sidebar
  ([`app-sidebar.tsx`](src/components/app-sidebar.tsx)), header, la `<SaveBar />` globale e il
  `<Toaster />` di sonner (necessario perché i `toast(...)` siano visibili — va montato una sola
  volta qui).
- **Salvataggio globale**: lo stato `unsaved` vive in Redux ([`project-slice.ts`](src/redux/project-slice.ts)):
  `loadProject` (create/open → unsaved=false), `updateProject` (qualsiasi modifica → unsaved=true),
  `markSaved` (dopo la scrittura su file). [`save-bar.tsx`](src/components/save-bar.tsx) mostra
  l'alert e salva il progetto in `<workpath>/<name>.json` da qualsiasi pagina. **Le pagine non
  gestiscono più save/unsaved localmente**: basta dispatchare `updateProject`.
- **Navigazione**: le voci della sidebar usano `next/link` ([`nav-main.tsx`](src/components/nav-main.tsx)
  evidenzia la voce attiva via `usePathname`). Le route sono `/` (Dashboard/home),
  `/listmods`, `/keybinds`, `/jvm`, `/documents`, `/analytics`.
- **Guardia progetto**: [`project-gate.tsx`](src/components/project-gate.tsx) esporta
  `<ProjectGate>`: se non c'è un progetto in Redux mostra il blocco create/open, altrimenti
  rende i figli passando il progetto non-null via **render prop**
  (`<ProjectGate>{(project) => ...}</ProjectGate>`). Ogni pagina che richiede un progetto
  va avvolta in questo componente — è la fonte unica del blocco "No project selected".
- **Backend Rust**: [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) registra i plugin
  (fs, dialog, http, sql, opener), le migration SQLite e i comandi. Scritture SQL richiedono
  `sql:allow-execute` nelle capabilities.
- **Scansione mod (Rust)**: [`src-tauri/src/mods.rs`](src-tauri/src/mods.rs) espone il comando
  `scan_mods(dir)` che apre ogni `.jar` come ZIP (crate `zip`) ed estrae i metadati dal formato
  del loader: Forge `META-INF/mods.toml`, NeoForge `META-INF/neoforge.mods.toml` (crate `toml`),
  Fabric `fabric.mod.json`, Quilt `quilt.mod.json` (`serde_json`). Ritorna `ScannedMod[]`
  (filename, modId, name, modloader, version, description, authors, dependencies con
  `mandatory`, `provides`); fallback "unknown" col solo filename per jar non riconosciuti.
  `provides` = TUTTI i modId messi a disposizione dal jar: più `[[mods]]`, campo `provides` e
  **dipendenze incluse via JarJar** (`META-INF/jarjar/*.jar`, lette ricorsivamente). Serve a
  evitare falsi "dipendenza mancante" nella verifica (le deps referenziano modId, e su Forge
  molte dipendenze sono bundlate nel jar). `mandatory` considera sia `mandatory=` (Forge classico)
  sia `type="required"|"optional"` (formato nuovo). I comandi applicativi non richiedono permessi
  capability (a differenza dei comandi dei plugin). La scansione usa `std::fs`, non plugin-fs.
- **File explorer (Rust)**: [`src-tauri/src/files.rs`](src-tauri/src/files.rs) espone `read_dir_tree(dir)`
  che legge **ricorsivamente** una directory e ritorna un albero `FileNode[]` (`name`, `path`
  assoluto, `isDir`, `children`), cartelle prima dei file e in ordine alfabetico; i symlink non
  vengono seguiti come cartelle (no cicli). Errore se la dir non esiste (il frontend lo usa per
  saltare le cartelle assenti). Il **contenuto** dei file si legge/scrive lato frontend con
  `@tauri-apps/plugin-fs` (`readTextFile`/`writeTextFile`).
- **Editor di codice (Monaco)**: la sezione Documents usa `@monaco-editor/react`. L'app gira
  **offline**, quindi Monaco NON va caricato dalla CDN: [`scripts/copy-monaco.mjs`](scripts/copy-monaco.mjs)
  copia `node_modules/monaco-editor/min/vs` in `public/monaco/vs` (gitignored) ed è incatenato in
  `pnpm dev`/`pnpm build`; [`monaco-setup.ts`](src/lib/monaco-setup.ts) punta il loader a
  `/monaco/vs`. Il linguaggio si deduce dall'estensione in [`file-language.ts`](src/lib/file-language.ts).

## Stato del progetto

- **Fatto**: home ([`page.tsx`](src/app/page.tsx)) — create/open/save del project,
  metadata, scelta modloader + versioni filtrate dai manifest; **cache SQLite** dei manifest
  con TTL e refresh manuale.
  - **List Mods** ([`src/app/listmods/page.tsx`](src/app/listmods/page.tsx)) — card di
    riepilogo (totale/attive/inattive) + tabella con nome, versione, loader (badge), autori,
    checkbox `active` e colonna **Dependencies** (pallino verde se OK, rosso + lista dei modId
    mancanti via tooltip). `missingDependencies` confronta i `modId` delle dipendenze
    obbligatorie con l'insieme dei `provides` delle mod **attive**, ignorando loader/runtime
    (`RUNTIME_DEPS`). Nota: i progetti salvati prima di `provides` vanno ri-scansionati (refresh)
    per beneficiare di JarJar/provides; il fallback usa il solo `modId`. La scansione (`scan_mods`) scrive i risultati in `project.mods` (Redux,
    via `setByPath`), preservando `active` per `filename`; parte **solo se `project.mods` è
    vuoto** (una volta per workpath) o su refresh manuale, così non riscansiona a ogni
    navigazione. Le modifiche marcano `unsaved` (Redux): la `<SaveBar />` globale appare in
    qualsiasi pagina per salvare su file.
- **Da fare (focus attuale)**:
  - **Keybinds** ([`src/app/keybinds/page.tsx`](src/app/keybinds/page.tsx)) — rappresentazione
    grafica di tastiera (ISO/IT) + numpad + mouse, con layout data-driven in
    [`keyboard-layout.ts`](src/lib/keyboard-layout.ts) (unità rem; gli `id` dei tasti sono stabili:
    sono la chiave dei keybind). Una **nuova mappa nasce dal template**
    [`keybind-template.ts`](src/lib/keybind-template.ts) — file separato dal layout: `defaultKeybinds()`
    (binding di base mappati sugli id del layout) + `defaultCategories()` (solo UI, Movimento,
    Inventario), fuse nelle categorie del progetto senza duplicati. **Multi-mappa**: il progetto ha `keybindMaps: keybindMap[]` (es.
    "Tech & Armi", "Magia"); selettore di mappe in cima con add/remove, ognuna col proprio set
    di binding. Click su un tasto → dialog action + categoria; filtri dinamici che "dimmano" i
    tasti non in categoria. **Due assi di classificazione**: *Mod* (categoria primaria,
    `keybindCategory {name=nome mod, color, tags[]}`) e *Tag* (`keybindTag {name, color}`,
    secondo filtro associato alle mod). Due tasti header **Add Mod** (Combobox sulle mod →
    name = nome mod, colore, tag associati) e **Add Tag** (nome + colore). Due barre di filtro
    (Mods + Tags) che combinano il dimming. Il binding ha solo `category` (la mod); i tag
    vengono dalla mod. Persiste in `project.keybindCategories` / `project.keybindTags` /
    `project.keybindMaps` via `updateProject` (→ `unsaved` → SaveBar).
  - **Documents** — l'**albero dei file** di `config`/`kubejs` (lette dalla `workpath` via
    `read_dir_tree`) vive **nella sidebar** ([`nav-files.tsx`](src/components/nav-files.tsx), che usa
    [`file-tree.tsx`](src/components/documents/file-tree.tsx)). Il file selezionato è in Redux
    ([`documents-slice.ts`](src/redux/documents-slice.ts), `openDocument`/`closeDocument`), così
    sidebar ed editor sono disaccoppiati. La pagina ([`src/app/documents/page.tsx`](src/app/documents/page.tsx))
    rende **solo l'editor Monaco** ([`code-editor.tsx`](src/components/documents/code-editor.tsx))
    del file aperto: click su un file nella sidebar → `router.push("/documents")` + `readTextFile`;
    Save (bottone o Ctrl/Cmd+S) → `writeTextFile`. **L'editor ha un proprio stato "dirty"** (draft vs
    contenuto su disco), **separato** dal `project.json` e dalla `<SaveBar />`: i file di config non
    vivono nel project. Le cartelle assenti vengono saltate.

## Gotcha

- La home usa diversi `any` e logica fragile per filtrare le versioni dei modloader
  (es. confronti string su `mcversion.split('.')`): trattali con cautela nei refactor.
- `output: "export"` ⇒ niente API routes, middleware o server actions.
- `handleSave` ha due rami (file esistente / nuovo) con path costruiti a mano (`"\\"`):
  attenzione alla portabilità dei separatori.
