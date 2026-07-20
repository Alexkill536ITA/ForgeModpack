# 01 — Architettura

## Layer

```mermaid
graph TB
    subgraph FE["Frontend (Next.js, use client)"]
        Layout["layout.tsx<br/>ReduxProvider · Sidebar · SiteHeader · SaveBar · Toaster"]
        Pages["Pagine App Router"]
        Gate["ProjectGate (guardia)"]
        Redux["Redux Toolkit (store)"]
        Lib["lib/ (logica pura + client Tauri)"]
    end
    subgraph BE["Backend Rust (Tauri)"]
        Cmd["Comandi #[tauri::command]"]
        Plug["Plugin fs/dialog/http/sql/opener/process"]
    end
    Disk[("Disco: workpath")]
    Net["API remote (whitelisted)"]

    Pages --> Gate --> Redux
    Pages --> Lib
    Lib -->|invoke| Cmd --> Disk
    Lib -->|plugin API| Plug --> Disk
    Lib -->|SQL| Plug
    Lib -.->|http fetch| Net
    Layout --> Pages
```

## Boundary Rust ↔ JavaScript

Due percorsi verso il nativo, con responsabilità distinte:

| Percorso | Uso | Esempi |
|----------|-----|--------|
| **Comandi custom** (`invoke`) | Lettura pesante del disco (apertura jar/zip, alberi) | `scan_mods`, `scan_datapacks`, `resolve_keybind_labels`, `read_dir_tree` |
| **Plugin Tauri** (API JS) | I/O testuale, dialog, rete, DB | `readTextFile`/`writeTextFile`, `open`/`save`, `fetch`, `Database` |

> Gli host di rete consentiti sono **whitelistati** in
> [`capabilities/default.json`](../../../src-tauri/capabilities/default.json): ogni nuovo host va
> aggiunto lì, altrimenti la fetch fallisce. Le scritture SQL richiedono `sql:allow-execute`.

## Flusso dati principale

```mermaid
sequenceDiagram
    actor U as Utente
    participant G as ProjectGate
    participant P as Pagina
    participant R as Redux (project)
    participant SB as SaveBar
    participant FS as plugin-fs

    U->>G: apre/crea progetto (dialog)
    G->>R: loadProject(project)  (unsaved=false)
    U->>P: modifica un campo
    P->>R: updateProject(setByPath(...))  (unsaved=true)
    R-->>SB: unsaved=true → mostra alert
    U->>SB: clic Save
    SB->>FS: writeTextFile(<workpath>/<name>.json)
    SB->>R: markSaved()  (unsaved=false)
```

Il pattern centrale di modifica è **immutabile**: si usa `setByPath`/`addByPath`/`removeByPath`
([`json-data.ts`](../../../src/lib/json-data.ts)) per produrre un nuovo `project`, poi
`dispatch(updateProject(next))`. Le pagine **non** gestiscono più save/unsaved localmente: basta
dispatchare `updateProject` e la `<SaveBar />` globale compare ovunque. Vedi [13 — Helper](./13-helper-lib.md).

## Componenti trasversali del layout

`layout.tsx` monta una sola volta l'infrastruttura condivisa:

```mermaid
graph TD
    RL["RootLayout"] --> RP["ReduxProvider"]
    RP --> TP["TooltipProvider"]
    TP --> CP["ConfirmProvider"]
    CP --> SP["SidebarProvider"]
    SP --> AS["AppSidebar (nav + file tree)"]
    SP --> SI["SidebarInset"]
    SI --> SH["SiteHeader (titolo = nome progetto)"]
    SI --> SA["ScrollArea → SaveBar + children"]
    RP --> T["Toaster (sonner)"]
```

- **`ReduxProvider`**: store globale.
- **`ConfirmProvider`**: dialog di conferma riusabile (`useConfirm()`), es. per scartare modifiche.
- **`AppSidebar`**: menu File (New/Open/Save/Save As/Close/Exit + scorciatoie Ctrl/Cmd), nav voci
  (`NavMain`) e albero file config (`NavFiles`).
- **`SaveBar`**: alert di salvataggio globale, unica fonte per scrivere `project.json`.
- **`Toaster`**: necessario perché i `toast(...)` di sonner siano visibili (montato una sola volta).

## Persistenza — due cicli separati

```mermaid
graph LR
    subgraph Project["Ciclo 1: project.json"]
        UP["updateProject → unsaved"] --> Save["SaveBar / menu File → writeTextFile + markSaved"]
    end
    subgraph Docs["Ciclo 2: file di config"]
        Draft["editor draft (dirty locale)"] --> WF["Save/Ctrl+S → writeTextFile"]
    end
```

Il progetto (`project.json`) e i **file di config** (sezione Documents) hanno cicli di salvataggio
**indipendenti**: i file di config **non** vivono nel project e hanno un proprio stato "dirty"
nell'editor, slegato dalla `SaveBar`.

## Route dell'app

```mermaid
graph LR
    Home["/ Dashboard"] --- LM["/listmods"]
    LM --- KB["/keybinds"]
    KB --- JVM["/jvm"]
    JVM --- DOC["/documents"]
    DOC --- AN["/analytics (placeholder)"]
```

Ogni route (tranne il placeholder) è avvolta in `<ProjectGate>`: senza progetto mostra il blocco
create/open. Dettagli in [03 — Frontend](./03-frontend-pagine.md).
