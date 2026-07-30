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
  `keybindActions` (azioni keybind scansionate dai jar, runtime), `busy` (operazioni pesanti in corso →
  overlay bloccante, runtime). Accesso via `useAppSelector`/`useAppDispatch`
  ([`hooks.ts`](src/redux/hooks.ts)), mai `useSelector` grezzo.
- **shadcn/ui** ([`src/components/ui`](src/components/ui)) + **Tailwind v4** (config in
  [`globals.css`](src/app/globals.css), tema `dark` forzato nel layout). Non modificare a
  mano i componenti `ui/`: rigenerali con `pnpm dlx shadcn@latest add <comp>`.
- **Scroll = sempre `ScrollArea`**: ogni area scrollabile usa
  [`scroll-area.tsx`](src/components/ui/scroll-area.tsx), **mai** `overflow-x/y-auto` a mano. Motivo:
  una sola barra di scorrimento in tutta l'app (stile coerente, non quella del sistema che su Windows
  è larga e chiara) e comportamento uniforme. Per lo scorrimento **orizzontale** va passata la barra
  esplicita — `<ScrollBar orientation="horizontal" />` come figlio, perché il default del componente è
  verticale — e va lasciato spazio in fondo al contenuto (`pb-2.5`) perché la barra non lo copra.
  Esempio: `ChipStrip` in [`keybinds/page.tsx`](src/app/keybinds/page.tsx).
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
  ([`app-sidebar.tsx`](src/components/app-sidebar.tsx)), header, la `<SaveBar />` globale, il
  `<BusyOverlay />` e il `<Toaster />` di sonner (necessario perché i `toast(...)` siano visibili — va
  montato una sola volta qui).
- **Overlay di caricamento (operazioni bloccanti)**: le operazioni pesanti (apertura di tutti i jar per
  scansione/import, export multi-file, refresh dei manifest, lettura dell'albero dei file) devono
  mostrare l'overlay globale [`busy-overlay.tsx`](src/components/busy-overlay.tsx), che copre lo
  schermo e **impedisce l'interazione** (l'utente non deve cambiare progetto o pagina a metà lavoro).
  Non si dispatcha a mano lo slice [`busy-slice.ts`](src/redux/busy-slice.ts): si usa l'hook
  [`use-busy.ts`](src/lib/use-busy.ts) — `await busy(t("busy.x"), () => lavoro(), { detail })`, che
  chiude il task in `finally` (anche su errore). Il callback riceve `setMessage` per le operazioni a
  fasi. La comparsa è **ritardata di 250 ms** (dentro la stessa apertura le scansioni rispondono dalla
  cache: senza soglia l'overlay lampeggerebbe a ogni navigazione) e i task concorrenti sono ammessi
  (mostra il primo, conta gli altri). Il wrap va messo **dopo** i dialog di scelta file/cartella, così
  l'overlay non li copre. Gli spinner locali restano: dicono *quale* comando è in corso.
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
  **Gotcha del cambio progetto**: `ProjectGate` rende sempre lo STESSO componente figlio, quindi
  passando da un progetto all'altro React riusa l'istanza e lo **stato locale della pagina
  sopravvive** (liste, filtri, dati scansionati della sessione precedente). Le pagine con stato
  derivato dal progetto passano una `key` legata all'identità del progetto
  (`${loadId}::${workpath}`) per forzare il remount — vedi `listmods/page.tsx` e `keybinds/page.tsx`.
- **Backend Rust**: [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) registra i plugin
  (fs, dialog, http, sql, opener), le migration SQLite e i comandi. Scritture SQL richiedono
  `sql:allow-execute` nelle capabilities.
- **Profili di formato Forge per versione (Rust)**: [`forge_spec.rs`](src-tauri/src/forge_spec.rs)
  contiene **le sole** tabelle versione MC → formato/API attesi (formato dei metadati e API keybind,
  vedi "Riconoscimento keybind"): `forge-legacy` (≤1.12.2: `mcmod.info`
  + lang `en_US.lang` properties), `forge-fml` (1.13–1.20.4: `mods.toml` + `mandatory=` + lang JSON),
  `forge-fml-modern` (≥1.20.5: `mods.toml` + `type=` + `provides`), `detect-only` (senza hint).
  `spec_for(mc, forge)` è puro e testato. **Il rilevamento primario resta il contenuto del jar**: il
  profilo serve solo da tie-break (jar con entrambi i formati), per l'ordine di lettura dei lang e
  per i `warnings` di diagnostica. L'hint `{mc, forge}` è costruito da
  [`forge-spec.ts`](src/lib/forge-spec.ts) (`resolveScanHint`): `mc` dal project, `forge` solo per
  loader **Forge** (NeoForge ha numerazione diversa) e, se il progetto non ha ancora una versione di
  loader, dedotta dall'ultima build nel manifest già cachato in SQLite (nessun host nuovo).
- **Scansione mod (Rust)**: [`src-tauri/src/mods.rs`](src-tauri/src/mods.rs) espone il comando
  `scan_mods(dir, mc?, forge?)` che apre ogni `.jar` come ZIP (crate `zip`) ed estrae i metadati dal
  formato **rilevato dalle entry del jar**: NeoForge `META-INF/neoforge.mods.toml`, Forge
  `META-INF/mods.toml` (crate `toml`), **Forge ≤1.12.2 `mcmod.info`** (`parse_mcmod_info`, array o
  `{modList}`), Quilt `quilt.mod.json`, Fabric `fabric.mod.json` (`serde_json`); poi `MANIFEST.MF`
  (`Implementation-Title`/`-Version`) e infine il solo filename. Ritorna `ScannedMod[]`
  (filename, modId, name, modloader, version, description, authors, dependencies con
  `mandatory`, `provides`, **`keybinds`**, **`format`**, **`warnings`**).
  **Scansione UNIFICATA**: nella stessa apertura del jar `scan_mods` legge anche le keybind, così
  ogni jar è aperto una sola volta per metadati + keybind (non esiste un comando `scan_keybinds`).
  `provides` = TUTTI i modId messi a disposizione dal jar: più `[[mods]]`/entry di `mcmod.info`,
  campo `provides` e **dipendenze incluse via JarJar** (`META-INF/jarjar/*.jar`, lette
  ricorsivamente). Serve a evitare falsi "dipendenza mancante" nella verifica (le deps referenziano
  modId, e su Forge molte dipendenze sono bundlate nel jar).
  **Robustezza** (`forge_dependencies`): lookup di `[[dependencies.<modId>]]` **case-insensitive** su
  tutti i modId del jar, accetta anche la tabella singola `[dependencies.x]`, e se nessuna chiave
  combacia usa comunque le entry (con warning). `mandatory` considera sia `mandatory=` sia
  `type="required"` (`optional`/`incompatible`/`discouraged` = non obbligatorie); su `mods.toml` non
  parsabile si passa a una lettura permissiva riga per riga (`lenient_toml_value`) invece di
  restituire una mod vuota. Legacy: `requiredMods` (obbligatorie) + `dependencies` (solo ordine,
  prefissi FML `required-after:`/`after:`/`before:` via `parse_legacy_dep`).
  **Compatibilità versione MC**: [`mc_compat.rs`](src-tauri/src/mc_compat.rs) (puro, testato)
  confronta la versione MC del progetto col vincolo dichiarato dalla mod, che sta in **tre dialetti**:
  range **Maven** nella dipendenza verso `minecraft` (Forge/NeoForge: `[1.20.1,1.21)`, `(,1.19]`,
  `[1.12.2]`, gruppi in OR), espressione **semver-like** (Fabric/Quilt: `>=1.20.1 <1.21`, `~`, `^`,
  `1.20.x`, `*`, `||`) e campo **`mcversion`** (legacy `mcmod.info`). `compare_versions` confronta per
  componenti (numerici come numeri, coda testuale = pre-release più bassa). `ScannedMod` porta
  `mcVersion` (il vincolo) e `mcCompatible: Option<bool>`; **`None` = non lo so** (vincolo assente,
  sintassi non riconosciuta, o progetto senza versione MC) e non genera avvisi: un falso
  "incompatibile" farebbe cercare un problema che non esiste. Se `Some(false)` viene aggiunto anche un
  warning. Una versione secca copre la sua generazione (`1.20` vale per `1.20.1`), il contrario no.
  **Diagnostica**: `format` (es. `forge:mcmod.info`, `unknown:manifest`) e `warnings` in inglese
  (formato non allineato alla versione MC, TOML rotto, nessun lang, placeholder di versione
  irrisolto…) — mostrati in List Mods, **non** persistiti in `project.json`.
  I comandi applicativi non richiedono permessi capability (a differenza dei comandi dei plugin).
  La scansione usa `std::fs`, non plugin-fs, e legge i jar su **più thread** (`std::thread::scope`,
  fino a 8: la lettura del bytecode per le keybind aggiunge decompressione); l'ordine finale è sempre
  alfabetico, quindi non dipende dallo scheduling. `read_entry` decodifica UTF-8 e, se i byte non
  sono validi, **ISO-8859-1** (i `.lang`/`mcmod.info` legacy lo sono spesso: in UTF-8 stretto il file
  intero verrebbe scartato) rimuovendo anche il BOM. `cargo test --lib` copre parser puri + end-to-end
  che costruiscono jar reali (legacy, moderno, con bytecode) in temp.
- **Scansione datapack (Rust)**: `mods.rs` espone anche `scan_datapacks(dir)` che legge una cartella
  e per ogni `.zip`/cartella con `pack.mcmeta` estrae `ScannedDatapack[]` (filename, name, description
  appiattita dal text component, `packFormat`). Cache SQLite `datapacks:<dir>` in
  [`datapacks-scan.ts`](src/lib/datapacks-scan.ts). Usata da List Mods quando il loader è **datapack**.
- **Loader `datapack` + ibrido**: la home ha un quinto loader **Datapack** (senza versione di loader,
  dipende solo dalla versione MC). **Disponibile solo da MC 1.13** (i datapack non esistono prima):
  come per NeoForge (≥1.20.1) il toggle è disabilitato sotto quella minor via `isBelowMcMinor(mc, min)`
  in [`page.tsx`](src/app/page.tsx) — che ragiona solo sullo schema "1.x", perché nei nuovi schemi di
  versioning (major ≠ "1") la feature esiste sempre — con una riga di spiegazione sotto i toggle.
  Scegliendo una versione MC < 1.13 mentre il progetto è su Datapack, `handleUpdateField` riporta il
  loader a Forge e azzera l'ibrido (con toast): la combinazione sarebbe impossibile. I progetti
  **già salvati** in quello stato non vengono corretti all'apertura (un `updateProject` in apertura
  farebbe comparire la SaveBar a vuoto). Selezionandolo compare la spunta **Hybrid** (`modloader.hybrid`) che
  abilita anche un loader classico (`modloader.hybridLoader` + versione) → modpack con mods **e**
  datapack. La cartella datapack è configurabile (`configs.datapacksPath`, path assoluto; default
  `<workpath>/datapacks`). **List Mods** ([`listmods/page.tsx`](src/app/listmods/page.tsx)) mostra:
  solo la tabella datapack se loader=datapack puro, mods+datapack se ibrido, solo mods se loader
  classico. I datapack sono persistiti in `project.datapacks` (con `active` per filename, come le mod).
- **Riconoscimento keybind (Rust)**: DUE fonti incrociate nella stessa apertura del jar, ogni
  `KeybindAction` porta un campo **`source`** (`"bytecode"` = certa, `"lang"` = euristica).
  1. **Bytecode** ([`keybind_scan.rs`](src-tauri/src/keybind_scan.rs) +
     [`class_scan.rs`](src-tauri/src/class_scan.rs)): su Forge/NeoForge una keybind è un oggetto
     `KeyBinding`/`KeyMapping` costruito nel codice e la sua chiave di traduzione è una **stringa
     costante** del class file. Per ogni `.class` (anche dei JarJar) si legge **solo header +
     constant pool** (parser scritto a mano, nessuna crate nuova: la decompressione si ferma lì); se
     la classe referenzia una classe SDK (`forge_spec::KEYBIND_MARKERS`) le sue stringhe diventano
     *candidate*; una candidata che è anche chiave dei lang è una keybind **certa**, anche senza
     marcatori nel nome. Funziona perché la reobfuscation SRG rinomina solo metodi/campi, non le
     classi. NON si applica a Fabric/Quilt (classi MC in *intermediary*, `class_304`).
     La **tabella API keybind per versione** vive in `forge_spec.rs` (`keybind_api_for`,
     `KEYBIND_MARKERS`): ≤1.7.10 `KeyBinding` + `cpw.mods.fml…ClientRegistry`; 1.8–1.16.5 `KeyBinding`
     + `net.minecraftforge.fml…ClientRegistry`; 1.17–1.19.2 `KeyMapping` + ClientRegistry; ≥1.19.3
     `RegisterKeyMappingsEvent` (NeoForge: package `net.neoforged.neoforge.client.event`); ≥1.21.9 /
     NeoForge 21.9 `KeyMapping.Category` + `registerCategory`. Le classi si cercano **tutte** (la
     cartella `mods` può avere jar di altre versioni); l'API attesa serve solo alla diagnostica —
     se l'era della classe rilevata (`KeyBinding` ≤1.16 vs `KeyMapping` ≥1.17) non combacia con la
     versione MC del progetto arriva un warning ("jar per la versione sbagliata").
  2. **Lang** (`collect_lang_docs` + `keybinds_from_langs`): file di lingua inglese in **entrambi i
     formati** — `assets/*/lang/en_us.json` (JSON piatto) e `assets/*/lang/en_US.lang` (properties,
     Forge ≤1.12.2) — match del path **case-insensitive**, priorità al formato del profilo, dedup,
     letti sia top-level sia dai **JarJar annidati** (un livello: es. Create bundla Ponder,
     `key.ponder.ponder`). L'euristica `is_keybind_key` chiede un **segmento marcatore**
     (`key`/`keys`/`keybind`/`keybinds`/`keyinfo`/`keymapping`) — i mod usano prefissi molto diversi
     (`key.jei.x`, `cos.key.x`, `create.keyinfo.x`, `iris.keybind.x`, `keybind.simplyjetpacks.x`,
     `mod.chiselsandbits.keys.x`) — escludendo i titoli di categoria via `is_category_key`: segmento
     `categories` **oppure** `category` preceduto da `key` (formato `key.category.<ns>.<path>`,
     introdotto con `KeyMapping.Category` in 1.21.9).
  Il warning "nessun lang inglese" viene emesso **solo se il jar dichiara keybind** (prima era su
  ogni mod senza lang: rumore). Restano fuori le keybind con chiave costruita a runtime
  (`"key." + MODID + ".x"`) o dichiarata in classi che non referenziano l'SDK: per quelle c'è la
  risoluzione mirata. La pagina Keybinds elenca **prima le keybind certe** (`source = "bytecode"`).
- **Risoluzione mirata keybind (Rust)**: `mods.rs` espone `resolve_keybind_labels(dir, keys, mc?, forge?)`:
  date le chiavi di traduzione ESATTE (es. gli `actionKey` di un `keybindprofiles.json` importato) cerca
  per match esatto nei lang di ogni jar (JSON **e** `.lang`) la `label` e il `modId` proprietario, ritornando
  `ResolvedKeybind[]` (`key`, `label`, `modId`). Nessuna euristica → risolve anche le keybind con
  nomi non standard senza falsi positivi. Usato dall'import ([`import-dialog.tsx`](src/components/keybinds/import-dialog.tsx)
  via `resolveKeybindLabels` in [`keybind-cache.ts`](src/lib/keybind-cache.ts)) come primo passo
  (più affidabile) di `resolveOwner`.
- **Cache scansione mod (SQLite, UNICO punto dati)**: [`mods-scan.ts`](src/lib/mods-scan.ts)
  (`getModsScanCached`/`peekModsScanCache`) chiama `scan_mods` e cacha il risultato completo
  (metadati + `keybinds` + diagnostica) in un'unica entry `manifest_cache` con chiave
  `mods:v4:<mc>:<forge>:<workpath>`, **senza TTL** (si invalida solo col refresh manuale). L'hint di
  versione fa parte della chiave: cambiando versione MC cambia il formato atteso, quindi si
  riscansiona. È l'unica fonte da cui:
  - **List Mods** ([`listmods/page.tsx`](src/app/listmods/page.tsx)) deriva `project.mods` (i metadati;
    i `keybinds` NON vengono copiati in `project.json`, che resta leggero);
  - **Keybinds/Import** derivano le azioni per mod: [`keybind-cache.ts`](src/lib/keybind-cache.ts)
    (`getKeybindActionsCached`/`peekKeybindActionsCache`) mappa la scansione unificata in
    `ModKeybinds[]` → slice Redux **runtime** ([`keybind-actions-slice.ts`](src/redux/keybind-actions-slice.ts)).
  La pagina keybinds al mount carica la cache se presente, **altrimenti esegue la scansione unificata**
  (così è utilizzabile anche senza aver prima aperto List Mods); refresh manuale = `force=true`.
- **Sincronizzazione col disco (mod/datapack)**: le liste derivate dal disco NON devono restare
  congelate a quando il progetto è stato salvato. Lo slice project ha un contatore `loadId`
  incrementato da `loadProject` (create/open/close, **non** persistito):
  [`mods-sync.ts`](src/lib/mods-sync.ts) espone i wrapper `getModsScanForLoad` /
  `getDatapacksScanForLoad` che alla **prima** lettura di ogni apertura rileggono i file dal disco
  (`force`) e poi usano la cache SQLite — con dedup delle richieste concorrenti (più chiamanti nello
  stesso istante condividono UNA scansione) — più `refreshModsScan`/`refreshDatapacksScan` per il
  refresh manuale. Nello stesso modulo vivono `toProjectMods`/`toProjectDatapacks` (conversione
  scansione → liste del project preservando `active` per `filename`; le voci non più sul disco
  spariscono) e `diffMods`/`diffDatapacks`: **si dispatcha `updateProject` solo se il diff non è
  vuoto**, così aprire un progetto o una pagina non fa comparire la SaveBar a vuoto.
  [`mods-sync.tsx`](src/components/mods-sync.tsx) (`<ModsSync />`, headless, montato nel layout) fa
  la sincronizzazione a ogni apertura **indipendentemente dalla pagina aperta**, aggiorna anche lo
  slice `keybindActions` e mostra un toast con il conteggio aggiunte/rimozioni/aggiornamenti.
  **Gotcha React**: le guardie "già fatto" vanno controllate e impostate **dopo** l'`await`, mai
  prima, altrimenti in dev StrictMode (doppia invocazione degli effect) il lavoro avviato viene
  scartato e non si applica nulla.
- **Export keybind → file di config**: [`keybind-export/`](src/lib/keybind-export) definisce
  l'astrazione `KeybindExporter` (exporter **puri**: ritornano `{content, suggestedPath, warnings}`,
  non scrivono su disco — la scrittura + toast resta nella UI). `options-txt.ts` è l'exporter
  concreto per `options.txt` di Minecraft; `merge-options.ts` fa il **merge conservativo** (preserva
  le righe non-`key_*` e i bind di mod non gestite, sovrascrive/appende i propri, mantiene l'EOL
  CRLF/LF). `keyset.ts` è l'exporter **attivo** per la mod BeeBoyD/Keyset (`config/keybindprofiles.json`,
  multi-profilo: ogni mappa = un profilo, merge conservativo); il formato è verificato contro il codec
  del mod (`schema` accettato solo `0` o `1=CONFIG_SCHEMA`, `key` omesso se unbound, slug id con `-`).
  `html-view.ts`/`image-png.ts` esportano la tastiera come HTML interattivo/immagini (`keyboard-visual.ts`,
  **allineato alla pagina Keybinds**: `UNIT=54`/`GAP=5` come `KEY_SCALE=1.35`, testo non scalato ma
  azione su due righe (`wrapTwoLines`), `opts.layer` per il livello mostrato + angolo piegato, e
  nell'HTML un SVG **per livello** con selettore, filtri che **isolano** invece di attenuare — stati
  `.on`/`.off`/`.solo` pre-renderizzati e scambiati dal CSS, nessun disegno lato JS).
  **`image-png` produce un ZIP**, non un PNG singolo: `<nome mappa>/complete.png` (tutti i livelli) +
  `layer-N.png` (uno per livello, con caption in alto); con un livello solo resta la sola `complete.png`.
  Il campo `output: "text" | "image" | "image-zip"` del `KeybindExporter` (era il flag `image`) dice
  alla UI come scrivere: rasterizzazione (`svgToPngBytes`, il canvas esiste solo nel webview) e
  impacchettamento restano in [`export-dialog.tsx`](src/components/keybinds/export-dialog.tsx), gli
  exporter restano puri. Lo ZIP è scritto a mano in [`zip-writer.ts`](src/lib/zip-writer.ts)
  (`buildZip`): solo metodo **STORE** — i PNG sono già compressi, quindi deflate non vale una
  dipendenza npm né il passaggio dei byte a Rust — deterministico (timestamp fisso), nomi in UTF-8
  (necessario per le mappe con accenti), niente ZIP64.
  La traduzione id-tasto → input code Minecraft è in [`mc-keycodes.ts`](src/lib/mc-keycodes.ts)
  (`toMinecraftInput`, fallback `key.keyboard.unknown` per i tasti IT accentati). Ogni exporter dichiara
  `maps: "all-in-one" | "single" | "per-map"`; UI in
  [`export-dialog.tsx`](src/components/keybinds/export-dialog.tsx): si sceglie **prima il formato**, poi
  il selettore mappa compare in base a `maps` (keyset=tutte, options.txt=singola, html/png=singola o
  "All"=un file per mappa). L'export multi-file può scrivere in una cartella scelta (`openDialog`).
- **Check aggiornamenti**: [`update-check.ts`](src/lib/update-check.ts) confronta la versione
  installata (`getVersion()`) con le GitHub Releases del repo (`GET /repos/.../releases`, **non**
  `/releases/latest`: quello ignora le pre-release, e le beta pubblicate resterebbero invisibili).
  L'host `https://api.github.com/**` è whitelistato nelle capabilities e la richiesta manda un
  `User-Agent` esplicito (senza, l'API risponde 403). `compareVersions`/`pickLatestRelease` sono
  **pure** (semver ridotto: un tag non versionato vale 0 = nessun update proposto). È solo un CHECK:
  niente `tauri-plugin-updater`, quindi nessuna chiave di firma — il bottone Download apre la pagina
  della release con `openUrl`. La preferenza "includi pre-release"
  (`fmp.updates.includePrerelease`) sta in `localStorage` come la lingua, default off.
  [`update-provider.tsx`](src/providers/update-provider.tsx) (montato in `layout.tsx` dentro
  `ConfirmProvider`, così avvolge la sidebar) espone `useUpdateCheck()` →
  `{ checkNow, updateAvailable, latestVersion }`: check **automatico e silenzioso all'avvio** (apre il
  dialog solo se c'è una versione nuova; gli errori restano in console: l'app funziona offline) e
  **manuale** dalla voce "Controlla aggiornamenti" del menu della sidebar (apre sempre il dialog).
  Niente `BusyOverlay`: è una richiesta HTTP leggera. La guardia del check all'avvio sta **prima**
  dell'`await` (unico scopo: non chiamare l'API due volte in StrictMode — rate limit 60 req/h).
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
    riepilogo (totale/attive/inattive/dipendenze mancanti/**incompatibili**/**con avvisi**) + tabella
    con nome, versione, loader (badge), colonna **MC** (vincolo di versione dichiarato dalla mod +
    pallino verde/rosso/grigio secondo `mcCompatible`, grigio = non verificabile),
    colonna **Format** (badge del file di metadati rilevato + icona con
    tooltip dei `warnings` di scansione, presi dalla stessa scansione), autori,
    checkbox `active` e colonna **Dependencies** (pallino verde se OK, rosso + lista dei modId
    mancanti via tooltip). `missingDependencies` confronta i `modId` delle dipendenze
    obbligatorie con l'insieme dei `provides` delle mod **attive**, ignorando loader/runtime
    (`RUNTIME_DEPS`) — vive in [`mod-checks.ts`](src/lib/mod-checks.ts) insieme al resto della
    logica dei controlli.
    **Colonna Azioni + correzione dei controlli**: ultima colonna, un `DropdownMenu` per riga con
    **Nota** ([`note-dialog.tsx`](src/components/listmods/note-dialog.tsx)) e **Segna come falso
    positivo** ([`checks-dialog.tsx`](src/components/listmods/checks-dialog.tsx)). `mod.note` è una
    nota libera dell'utente, mostrata come icona nell'angolo in alto a destra della cella del nome
    (tooltip col testo, click = modifica). `mod.checks` (`modChecks`/`checkFix` in
    [`models.ts`](src/model/models.ts)) registra le correzioni manuali dei controlli diagnostici: per
    ogni problema `falsePositive` (non è reale), `value` (il valore giusto: vincolo MC o modId della
    dipendenza) e `note` (**il motivo**). Granularità **per singolo problema** (chiave = modId
    dichiarato / testo dell'avviso), non per colonna intera: un falso positivo "su tutta la colonna"
    nasconderebbe anche i problemi comparsi dopo un aggiornamento del jar. Tutte le funzioni di
    [`mod-checks.ts`](src/lib/mod-checks.ts) (`missingDependencies`, `activeWarnings`,
    `effectiveMcCompatible`…) applicano già le correzioni, quindi celle, `SummaryCard`, chip e
    `sortValue` restano coerenti da soli: **un falso positivo esce davvero dai conteggi**. Le celle
    mostrano un marcatore a chiave inglese (`FixMark`) quando il controllo passa per decisione
    dell'utente e non per esito della scansione (senza quel segno una correzione sbagliata sarebbe
    indistinguibile da un jar a posto). `note`/`checks` sono dati dell'UTENTE: `toProjectMods` li
    preserva per `filename` come `active` e restano fuori da `modSignature` (non contano nel diff). Nota: i progetti salvati prima di `provides` vanno ri-scansionati (refresh)
    per beneficiare di JarJar/provides; il fallback usa il solo `modId`. La scansione (`scan_mods`) scrive i risultati in `project.mods` (Redux,
    via `setByPath`), preservando `active` per `filename`. **Si allinea al disco a ogni APERTURA di
    progetto** (vedi "Sincronizzazione col disco"), non solo quando `project.mods` è vuoto: mod
    rimosse/aggiunte/aggiornate fuori dall'app si riflettono subito. Dentro la stessa apertura si usa
    la cache, così navigare tra le pagine non riapre i jar. Le modifiche marcano `unsaved` (Redux): la `<SaveBar />` globale appare in
    qualsiasi pagina per salvare su file.
    **Ordinamento + filtri della tabella mod**: `visibleMods` è una pipeline memoizzata
    **chip → ricerca fuzzy → sort**. Gli header sono cliccabili (`SortableHead`, ciclo
    `asc → desc → null`, `aria-sort`); `sortValue` mappa la colonna sul valore da confrontare
    (`active` → 0/1, `deps` → n. di dipendenze mancanti, `format` → etichetta mostrata) e
    `compareMods` usa `Intl.Collator({numeric: true})` — confronto **naturale**, "1.10.0" dopo
    "1.9.0" — col nome come tie-break; **non** semver (le versioni delle mod spesso non lo sono).
    L'ordine di partenza è `DEFAULT_SORT = {name, asc}` via
    `effectiveSort = sort ?? (query ? null : DEFAULT_SORT)`: la tabella è **alfabetica per nome**
    (l'ordine di scansione è alfabetico per *filename*, che è diverso), tranne **mentre si cerca**,
    dove senza click vince la rilevanza fuzzy; un sort esplicito batte sempre la rilevanza. Il ciclo
    dell'header parte da `effectiveSort`, così il primo click su "Mod" inverte l'ordine visibile
    invece di riapplicarlo. I chip
    (`ToggleGroup` multiplo: active/inactive/missing/incompatible/warnings, coi conteggi delle
    SummaryCard) usano `matchesFilters`: OR **dentro** il gruppo (stato | problemi), AND **tra**
    gruppi; siccome `missing` guarda solo le mod attive, "inactive + missing" è vuoto per costruzione
    (mentre `incompatible` conta anche le mod spente: dipende dal jar, non dal checkbox). Si ordina
    sempre una **copia** dell'array (viene da Redux). La tabella datapack resta con la sola ricerca.
- **Da fare (focus attuale)**:
  - **Keybinds** ([`src/app/keybinds/page.tsx`](src/app/keybinds/page.tsx)) — rappresentazione
    grafica di tastiera (ISO/IT) + numpad + mouse, con layout data-driven in
    [`keyboard-layout.ts`](src/lib/keyboard-layout.ts) (unità rem; gli `id` dei tasti sono stabili:
    sono la chiave dei keybind). La **scala** ha un unico punto di verità in `page.tsx`: `KEY_SCALE`
    (1.35 → tasto 1u = 3.375rem/54px) da cui derivano `UNIT_REM`, `GAP_REM`, `KEY_GAP_STYLE` (i gap del
    markup, prima `gap-1` per coincidenza) e `scaledPx()` per l'angolo piegato — scalarne solo una parte
    sfalserebbe `keyWidth()`, che somma unità **e** gap, e i tasti larghi non starebbero più sulla
    griglia. I **corpi del testo NON scalano** (restano 9/7.5/10px): il tasto grande serve a dare
    spazio all'azione, non a scriverla più grande. A questa scala i tre blocchi (tastiera/numpad/mouse)
    vanno a capo (`flex-wrap`), con `overflow-x-auto` a coprire la sola tastiera. Una **nuova mappa nasce dal template**
    [`keybind-template.ts`](src/lib/keybind-template.ts) — file separato dal layout: `defaultKeybinds()`
    (i keybind VANILLA di Minecraft coi tasti di default, tutti con `actionKey` valido → esportabili)
    + `defaultCategories()` (una sola categoria non-mod, **"Vanilla"**), fuse nelle categorie del
    progetto senza duplicati. **Multi-mappa**: il progetto ha `keybindMaps: keybindMap[]` (es.
    "Tech & Armi", "Magia"); selettore di mappe in cima con add/remove, ognuna col proprio set
    di binding. Click su un tasto → dialog action + categoria; filtri dinamici che **isolano** la
    selezione (vedi "Vista isolata"). **Due assi di classificazione**: *Mod* (categoria primaria,
    `keybindCategory {name=nome mod, color, tags[]}`) e *Tag* (`keybindTag {name, color}`,
    secondo filtro associato alle mod). Due tasti header **Add Mod** (Combobox sulle mod →
    name = nome mod, colore, tag associati) e **Add Tag** (nome + colore). Due barre di filtro
    (Mods + Tags) che si combinano. Il binding ha solo `category` (la mod); i tag
    vengono dalla mod. Persiste in `project.keybindCategories` / `project.keybindTags` /
    `project.keybindMaps` via `updateProject` (→ `unsaved` → SaveBar).
    - **Barra dei filtri (blocco Keybinds)**: offre **solo ciò che la mappa attiva usa davvero**
      (`usedInMap` → `filterCategories`/`filterTags`, da binding **e** macro): le categorie sono di
      progetto, e filtrare per una mod senza tasti in quella mappa dava una tastiera vuota, col chip
      utile sepolto tra decine. Il valore **selezionato** resta in lista anche se non più in uso
      (cambiando mappa), altrimenti un filtro attivo diventerebbe invisibile e non si potrebbe togliere.
      I chip stanno in un `ChipStrip`: **massimo due righe** (`grid-flow-col` + `grid-rows-2` → cresce
      in larghezza, non in altezza) con **scroll orizzontale**, perché sta sopra la tastiera e a capo
      libero la spingeva fuori dallo schermo; etichetta e chip "Tutte" restano fuori dall'area che
      scorre. Le card **Mods**/**Tags** in cima NON usano il `ChipStrip` e mostrano tutto il progetto:
      sono la lista di gestione (colore, tag), da raggiungere anche prima dell'uso in una mappa.
    - **Vista isolata (filtri)**: con almeno un filtro attivo (`filtersActive` = mod, tag o ricerca)
      ogni tasto mostra **solo i binding che corrispondono**, a colore pieno, e i tasti senza
      corrispondenze restano **vuoti** come su una mappa nuova: filtrando per una mod si guarda "il
      livello dedicato" a quella mod, non una tastiera con i colori di tutte. Prima i binding delle
      altre mod restavano sul tasto attenuati (`opacity-20`), che è il rumore che si voleva togliere:
      il `dimmed` non esiste più. I binding esclusi non sono persi di vista — l'**angolo piegato**
      del `KeyCap` (prop `hiddenLabel`) copre entrambi i casi: altri livelli (`alsoOnLayers`) nella
      vista per livello, altre mod (`alsoUsedBy`) nella vista isolata; senza quel segno un tasto già
      occupato sembrerebbe libero. Stessa regola per le **macro** (chip colorati nella stessa vista):
      quelle fuori filtro sono nascoste, non attenuate (`visibleMacros` preserva l'indice originale,
      che è quello che l'editor salva).
    I **tag di default** (`defaultTags()`) entrano nel progetto **alla creazione**, non alla prima
    mappa: si assegnano alle mod con "Add Mod", che funziona anche senza mappe. Il progetto vuoto ha
    un'unica fabbrica [`new-project.ts`](src/lib/new-project.ts) (`emptyProject(workpath)`), usata sia
    dal menu della sidebar sia da `ProjectGate`: prima l'oggetto era duplicato nei due file. La fusione
    dei tag alla creazione di una mappa resta come rete di sicurezza per i progetti più vecchi
    (`keybindTags` vuoto), mentre le categorie nascono davvero lì ("Vanilla" ha senso con una mappa).
    - **Layer (livelli) della mappa**: livelli **illimitati** per mappa (`keybindMap.layerCount`,
      `keybind.layer`, assenti = 1 → retrocompatibile). Si guarda **un livello per volta** (lista a
      sinistra della tastiera, con conteggio per livello + voce "Tutti i livelli"), così su ogni tasto
      compare un solo binding a **colore pieno** invece del tasto diviso in riquadri di colori diversi.
      Un tasto usato anche su altri livelli mostra un **angolo piegato** in alto a destra (+ tooltip);
      prima erano puntini, troppo sporchi sul tasto. `effectiveLayer` ricade su 1 se il livello selezionato non esiste nella mappa
      corrente (mappe con numero di livelli diverso). **Appiattimento automatico**: con un filtro
      attivo si vedono tutti i livelli insieme (lì il sottoinsieme è piccolo e spezzarlo ostacola, e
      la vista isolata mostra comunque un colore solo per tasto). L'**editor del tasto** mostra un riquadro per livello e i binding si spostano da un
      livello all'altro da una **Select del livello** (niente drag & drop): la lista dei binding è piatta,
      ordinata per livello (`sortedDrafts`) dentro una `ScrollArea` — i binding non hanno un massimo,
      quindi il dialog non deve crescere oltre lo schermo. L'ultima voce della Select
      (`NEW_LAYER_VALUE`) crea un livello in più e ci sposta il binding, persistito col salvataggio.
      Nessuno scambio automatico: due binding sullo stesso livello sono ammessi e `sharedLayers` lo
      segnala (là il tasto tornerebbe diviso in riquadri).
      "Distribuisci sui livelli" ripartisce i binding che condividono un tasto (uno per livello):
      serve ai progetti nati prima dei layer, dove tutto sta sul livello 1. Si rimuove solo l'**ultimo
      livello se vuoto** (cancellarne uno pieno butterebbe via binding senza mostrare cosa si perde).
      L'**import** assegna i livelli progressivamente per tasto (1°→L1, 2°→L2…) e riporta
      `ImportedMap.layerCount`; non scarta più nulla per "troppe azioni sullo stesso tasto" (il motivo
      `overflow` non esiste più). L'**export** è invariato (i layer sono organizzazione della vista).
      **"Tutti i profili"** (l'unica azione che scrive su mappe che non stai guardando) chiede
      conferma e NON usa più `LayersIcon`: con la stessa icona del bottone "+ Livello", accanto, un
      click di troppo rendeva tutte le mappe identiche senza possibilità di annullare.
    - **Multi-binding per tasto**: nessun limite (uno per livello, livelli illimitati); nella
      vista appiattita **senza filtri** ("Tutti i livelli") il `KeyCap` divide lo sfondo in riquadri
      (1 pieno, 2 sopra/sotto, 3 = due in alto + fascia in basso, 4+ = griglia 2×2), un colore per mod.
    - **Selezione azioni per mod** (fatto): il dialog del tasto non usa più testo libero ma un
      **Combobox** con le azioni reali della mod selezionata (da `scan_keybinds`), ricercabile per
      label; fallback a input libero per mod senza keybind nei lang, azioni vanilla
      ([`keybind-template.ts`](src/lib/keybind-template.ts) `vanillaActions()`) per le categorie non-mod.
      Il binding memorizza sia `action` (label) sia `actionKey` (chiave `key.*`, opzionale →
      retrocompatibile) — quest'ultima serve all'export.
    - **Export config** (fatto): bottone **Export** nella barra mappe → dialog (formato prima, poi
      mappa/destinazione). Vedi "Export keybind" nell'architettura. Formati attivi: `options.txt`,
      **keyset** (`keybindprofiles.json`, tutte le mappe), HTML interattivo e PNG.
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
