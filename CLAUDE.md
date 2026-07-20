# ForgeModpack V2

App desktop (**Tauri 2 + Next.js 16**) per **gestire le dipendenze di un modpack Minecraft**.

## Obiettivo

L'utente indica la **directory di un modpack esistente**; l'app legge direttamente le
configurazioni e i mod presenti sul disco e, **solo se necessario**, recupera online i
metadati (versioni MC e dei modloader). **Non scarica i mod** né avvia Minecraft: è un
manager/editor di configurazione, non un launcher.

Il progetto vive in un file `<nome>.json` (tipo [`project`](src/model/models.ts)) salvato
nella `workpath` scelta dall'utente.

## Documentazione

Documentazione in [`docs/`](docs) (con diagrammi Mermaid), in due lingue e due livelli:

- **Tecnica** (per sviluppatori): [`docs/it/tecnica/`](docs/it/tecnica/README.md) /
  [`docs/en/technical/`](docs/en/technical/README.md) — panoramica, architettura, modello dati,
  pagine frontend, state Redux, backend Rust, scansione mod/datapack/keybind, cache SQLite,
  keybinds, import/export keybind, JVM, editor Documents, versioning/build, helper di libreria.
- **Guida d'uso** (per utenti finali): [`docs/it/utilizzo/`](docs/it/utilizzo/README.md) /
  [`docs/en/usage/`](docs/en/usage/README.md) — primi passi, dashboard, mod e datapack, keybinds,
  import/export keybind, JVM, documenti, salvataggio e versioni.

Ogni cartella parte dal proprio `README.md` (indice). La guida d'uso è derivata dalla tecnica ma
è task-oriented e non tecnica.

## Comandi

```bash
pnpm dev          # Next dev server (web, http://localhost:3000)
pnpm tauri:dev    # App desktop in dev (avvia anche `pnpm dev`)
pnpm tauri:build  # Build dell'eseguibile desktop (BLOCCATA senza bump, vedi sotto)
pnpm build        # Export statico Next -> ./out (consumato da Tauri)
pnpm bump         # Bump interattivo della versione (patch/minor/major) + commit + tag
pnpm lint
```

Usa **pnpm** (non npm/yarn). Per testare le feature reali serve `tauri:dev`: le API
`@tauri-apps/plugin-*` (fs, dialog, http, sql) **non funzionano** nel solo `pnpm dev`.

**Versioning + gate di build**: la versione vive in TRE file da tenere allineati
(`package.json` = fonte di verità, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
+ `Cargo.lock`). `pnpm bump` ([`scripts/bump-version.mjs`](scripts/bump-version.mjs))
li aggiorna in blocco, poi crea commit + tag `vX.Y.Z`. La build è **bloccata** da
[`scripts/check-version.mjs`](scripts/check-version.mjs) (incatenato nel
`beforeBuildCommand` di `tauri.conf.json`, vale sia per `pnpm tauri:build` sia per
`tauri build`): fallisce se manca il tag `v<versione>` o se ci sono commit dopo quel tag,
costringendo a generare una versione nuova prima di ogni build.

## Stack & convenzioni

- **Next.js 16 App Router**, `output: "export"` (SSG puro, niente server/route handlers).
  Le pagine sono `"use client"`; immagini `unoptimized`.
- **Redux Toolkit** per lo state globale ([`src/redux`](src/redux)): slice `project`,
  `minecraftManifest`, `modLoaderManifest`, `documents` (file aperto nell'editor),
  `keybindActions` (azioni keybind scansionate dai jar, runtime). Accesso via `useAppSelector`/`useAppDispatch`
  ([`hooks.ts`](src/redux/hooks.ts)), mai `useSelector` grezzo.
- **shadcn/ui** ([`src/components/ui`](src/components/ui)) + **Tailwind v4** (config in
  [`globals.css`](src/app/globals.css), tema `dark` forzato nel layout). Non modificare a
  mano i componenti `ui/`: rigenerali con `pnpm dlx shadcn@latest add <comp>`.
- **TypeScript strict**. Alias import `@/*` -> root.
- **Lingua**: commenti e documentazione in **italiano** (vedi [`json-data.ts`](src/lib/json-data.ts)).
  L'interfaccia è **internazionalizzata** (i18n): le stringhe UI NON vanno hardcoded ma passano da
  `t("namespace.key")` (vedi sotto). L'inglese resta la lingua base/fallback.

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
- **i18n**: sistema custom leggero in [`src/i18n`](src/i18n) — `I18nProvider`
  ([`i18n-provider.tsx`](src/i18n/i18n-provider.tsx)) montato in `layout.tsx`, hook `useTranslation()`
  → `t("namespace.key", vars?)` con fallback all'inglese e interpolazione `{var}`; dizionari
  [`locales/en.json`](src/i18n/locales/en.json) (base) e [`locales/it.json`](src/i18n/locales/it.json)
  con **parità di chiavi**; lingua persistita in `localStorage`; selettore in
  [`language-switcher.tsx`](src/components/language-switcher.tsx). **Regola**: `t` va chiamato solo
  dentro componenti/hook (mai a livello di modulo). I **dati persistiti** nel `project.json` (tag di
  default, categoria "Vanilla", label vanilla, tipi di asset) restano in **inglese canonico**: si
  localizza solo la visualizzazione. Dettagli in [`docs/it/tecnica/14-i18n.md`](docs/it/tecnica/14-i18n.md).
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
  `mandatory`, `provides`, **`keybinds`**); fallback "unknown" col solo filename per jar non riconosciuti.
  **Scansione UNIFICATA**: nella stessa apertura del jar `scan_mods` legge anche le keybind
  (`collect_keybinds`), così ogni jar è aperto una sola volta per metadati + keybind (non esiste più
  un comando `scan_keybinds` separato).
  `provides` = TUTTI i modId messi a disposizione dal jar: più `[[mods]]`, campo `provides` e
  **dipendenze incluse via JarJar** (`META-INF/jarjar/*.jar`, lette ricorsivamente). Serve a
  evitare falsi "dipendenza mancante" nella verifica (le deps referenziano modId, e su Forge
  molte dipendenze sono bundlate nel jar). `mandatory` considera sia `mandatory=` (Forge classico)
  sia `type="required"|"optional"` (formato nuovo). I comandi applicativi non richiedono permessi
  capability (a differenza dei comandi dei plugin). La scansione usa `std::fs`, non plugin-fs.
- **Scansione datapack (Rust)**: `mods.rs` espone anche `scan_datapacks(dir)` che legge una cartella
  e per ogni `.zip`/cartella con `pack.mcmeta` estrae `ScannedDatapack[]` (filename, name, description
  appiattita dal text component, `packFormat`). Cache SQLite `datapacks:<dir>` in
  [`datapacks-scan.ts`](src/lib/datapacks-scan.ts). Usata da List Mods quando il loader è **datapack**.
- **Loader `datapack` + ibrido**: la home ha un quinto loader **Datapack** (senza versione di loader,
  dipende solo dalla versione MC). Selezionandolo compare la spunta **Hybrid** (`modloader.hybrid`) che
  abilita anche un loader classico (`modloader.hybridLoader` + versione) → modpack con mods **e**
  datapack. La cartella datapack è configurabile (`configs.datapacksPath`, path assoluto; default
  `<workpath>/datapacks`). **List Mods** ([`listmods/page.tsx`](src/app/listmods/page.tsx)) mostra:
  solo la tabella datapack se loader=datapack puro, mods+datapack se ibrido, solo mods se loader
  classico. I datapack sono persistiti in `project.datapacks` (con `active` per filename, come le mod).
- **Riconoscimento keybind (Rust)**: `collect_keybinds` (in `scan_mods`) legge le chiavi keybind
  dai file `assets/*/lang/en_us.json` (`{key, label}`, dedup). Il riconoscimento (`is_keybind_key`)
  NON si limita a `key.*`: i mod usano prefissi molto diversi (`key.jei.x`, `cos.key.x`,
  `create.keyinfo.x`, `iris.keybind.x`, `keybind.simplyjetpacks.x`, `mod.chiselsandbits.keys.x`),
  quindi una chiave è keybind se ha un **segmento marcatore**
  (`key`/`keys`/`keybind`/`keybinds`/`keyinfo`/`keymapping`), escludendo i titoli di categoria
  (`.categories.`). I lang vengono letti sia top-level sia dai **JarJar annidati**
  (`collect_lang_contents`, un livello): es. Create bundla Ponder (`key.ponder.ponder`). I mod che
  nominano le KeyMapping senza alcun marcatore (es. `config.jsg.*`, `placebo.toggleTrails`) non sono
  distinguibili dalle altre traduzioni e NON sono coperti da questo scan generico.
- **Risoluzione mirata keybind (Rust)**: `mods.rs` espone `resolve_keybind_labels(dir, keys)`: date
  le chiavi di traduzione ESATTE (es. gli `actionKey` di un `keybindprofiles.json` importato) cerca
  per match esatto nei lang di ogni jar la `label` e il `modId` proprietario, ritornando
  `ResolvedKeybind[]` (`key`, `label`, `modId`). Nessuna euristica → risolve anche le keybind con
  nomi non standard senza falsi positivi. Usato dall'import ([`import-dialog.tsx`](src/components/keybinds/import-dialog.tsx)
  via `resolveKeybindLabels` in [`keybind-cache.ts`](src/lib/keybind-cache.ts)) come primo passo
  (più affidabile) di `resolveOwner`.
- **Cache scansione mod (SQLite, UNICO punto dati)**: [`mods-scan.ts`](src/lib/mods-scan.ts)
  (`getModsScanCached`/`peekModsScanCache`) chiama `scan_mods` e cacha il risultato completo
  (metadati + `keybinds`) in un'unica entry `manifest_cache` con chiave `mods:<workpath>`, **senza
  TTL** (si invalida solo col refresh manuale). È l'unica fonte da cui:
  - **List Mods** ([`listmods/page.tsx`](src/app/listmods/page.tsx)) deriva `project.mods` (i metadati;
    i `keybinds` NON vengono copiati in `project.json`, che resta leggero);
  - **Keybinds/Import** derivano le azioni per mod: [`keybind-cache.ts`](src/lib/keybind-cache.ts)
    (`getKeybindActionsCached`/`peekKeybindActionsCache`) mappa la scansione unificata in
    `ModKeybinds[]` → slice Redux **runtime** ([`keybind-actions-slice.ts`](src/redux/keybind-actions-slice.ts)).
  La pagina keybinds al mount carica la cache se presente, **altrimenti esegue la scansione unificata**
  (così è utilizzabile anche senza aver prima aperto List Mods); refresh manuale = `force=true`.
- **Export keybind → file di config**: [`keybind-export/`](src/lib/keybind-export) definisce
  l'astrazione `KeybindExporter` (exporter **puri**: ritornano `{content, suggestedPath, warnings}`,
  non scrivono su disco — la scrittura + toast resta nella UI). `options-txt.ts` è l'exporter
  concreto per `options.txt` di Minecraft; `merge-options.ts` fa il **merge conservativo** (preserva
  le righe non-`key_*` e i bind di mod non gestite, sovrascrive/appende i propri, mantiene l'EOL
  CRLF/LF). `keyset.ts` è un placeholder disabilitato (`available:false`, formato TBD). La
  traduzione id-tasto → input code Minecraft è in [`mc-keycodes.ts`](src/lib/mc-keycodes.ts)
  (`toMinecraftInput`, fallback `key.keyboard.unknown` per i tasti IT accentati). UI in
  [`export-dialog.tsx`](src/components/keybinds/export-dialog.tsx) (scelta mappa/formato/destinazione).
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
    (i keybind VANILLA di Minecraft coi tasti di default, tutti con `actionKey` valido → esportabili)
    + `defaultCategories()` (una sola categoria non-mod, **"Vanilla"**), fuse nelle categorie del
    progetto senza duplicati. **Multi-mappa**: il progetto ha `keybindMaps: keybindMap[]` (es.
    "Tech & Armi", "Magia"); selettore di mappe in cima con add/remove, ognuna col proprio set
    di binding. Click su un tasto → dialog action + categoria; filtri dinamici che "dimmano" i
    tasti non in categoria. **Due assi di classificazione**: *Mod* (categoria primaria,
    `keybindCategory {name=nome mod, color, tags[]}`) e *Tag* (`keybindTag {name, color}`,
    secondo filtro associato alle mod). Due tasti header **Add Mod** (Combobox sulle mod →
    name = nome mod, colore, tag associati) e **Add Tag** (nome + colore). Due barre di filtro
    (Mods + Tags) che combinano il dimming. Il binding ha solo `category` (la mod); i tag
    vengono dalla mod. Persiste in `project.keybindCategories` / `project.keybindTags` /
    `project.keybindMaps` via `updateProject` (→ `unsaved` → SaveBar).
    - **Multi-binding per tasto**: un tasto può avere fino a **4** binding; il `KeyCap` divide
      lo sfondo in riquadri (1 pieno, 2 sopra/sotto, 3 = due in alto + fascia in basso, 4 = griglia
      2×2), un colore per mod.
    - **Selezione azioni per mod** (fatto): il dialog del tasto non usa più testo libero ma un
      **Combobox** con le azioni reali della mod selezionata (da `scan_keybinds`), ricercabile per
      label; fallback a input libero per mod senza keybind nei lang, azioni vanilla
      ([`keybind-template.ts`](src/lib/keybind-template.ts) `vanillaActions()`) per le categorie non-mod.
      Il binding memorizza sia `action` (label) sia `actionKey` (chiave `key.*`, opzionale →
      retrocompatibile) — quest'ultima serve all'export.
    - **Export config** (fatto per `options.txt`): bottone **Export** nella barra mappe → dialog
      (mappa/formato/destinazione). Vedi "Export keybind" nell'architettura. Il **keyset** è
      predisposto come exporter ma disabilitato (formato ancora da definire).
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
