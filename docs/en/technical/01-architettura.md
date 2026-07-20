# 01 — Architecture

## Layers

```mermaid
graph TB
    subgraph FE["Frontend (Next.js, use client)"]
        Layout["layout.tsx<br/>ReduxProvider · Sidebar · SiteHeader · SaveBar · Toaster"]
        Pages["App Router pages"]
        Gate["ProjectGate (guard)"]
        Redux["Redux Toolkit (store)"]
        Lib["lib/ (pure logic + Tauri client)"]
    end
    subgraph BE["Rust Backend (Tauri)"]
        Cmd["Commands #[tauri::command]"]
        Plug["Plugins fs/dialog/http/sql/opener/process"]
    end
    Disk[("Disk: workpath")]
    Net["Remote APIs (whitelisted)"]

    Pages --> Gate --> Redux
    Pages --> Lib
    Lib -->|invoke| Cmd --> Disk
    Lib -->|plugin API| Plug --> Disk
    Lib -->|SQL| Plug
    Lib -.->|http fetch| Net
    Layout --> Pages
```

## Rust ↔ JavaScript boundary

Two paths toward the native side, with distinct responsibilities:

| Path | Use | Examples |
|----------|-----|--------|
| **Custom commands** (`invoke`) | Heavy disk reads (opening jar/zip, trees) | `scan_mods`, `scan_datapacks`, `resolve_keybind_labels`, `read_dir_tree` |
| **Tauri plugins** (JS APIs) | Text I/O, dialogs, network, DB | `readTextFile`/`writeTextFile`, `open`/`save`, `fetch`, `Database` |

> The allowed network hosts are **whitelisted** in
> [`capabilities/default.json`](../../../src-tauri/capabilities/default.json): every new host must be
> added there, otherwise the fetch fails. SQL writes require `sql:allow-execute`.

## Main data flow

```mermaid
sequenceDiagram
    actor U as User
    participant G as ProjectGate
    participant P as Page
    participant R as Redux (project)
    participant SB as SaveBar
    participant FS as plugin-fs

    U->>G: opens/creates project (dialog)
    G->>R: loadProject(project)  (unsaved=false)
    U->>P: edits a field
    P->>R: updateProject(setByPath(...))  (unsaved=true)
    R-->>SB: unsaved=true → show alert
    U->>SB: click Save
    SB->>FS: writeTextFile(<workpath>/<name>.json)
    SB->>R: markSaved()  (unsaved=false)
```

The central editing pattern is **immutable**: you use `setByPath`/`addByPath`/`removeByPath`
([`json-data.ts`](../../../src/lib/json-data.ts)) to produce a new `project`, then
`dispatch(updateProject(next))`. The pages **no longer** manage save/unsaved locally: it is enough
to dispatch `updateProject` and the global `<SaveBar />` appears everywhere. See [13 — Helpers](./13-helper-lib.md).

## Cross-cutting layout components

`layout.tsx` mounts the shared infrastructure exactly once:

```mermaid
graph TD
    RL["RootLayout"] --> RP["ReduxProvider"]
    RP --> TP["TooltipProvider"]
    TP --> CP["ConfirmProvider"]
    CP --> SP["SidebarProvider"]
    SP --> AS["AppSidebar (nav + file tree)"]
    SP --> SI["SidebarInset"]
    SI --> SH["SiteHeader (title = project name)"]
    SI --> SA["ScrollArea → SaveBar + children"]
    RP --> T["Toaster (sonner)"]
```

- **`ReduxProvider`**: global store.
- **`ConfirmProvider`**: reusable confirmation dialog (`useConfirm()`), e.g. to discard changes.
- **`AppSidebar`**: File menu (New/Open/Save/Save As/Close/Exit + Ctrl/Cmd shortcuts), nav items
  (`NavMain`) and config file tree (`NavFiles`).
- **`SaveBar`**: global save alert, the single source for writing `project.json`.
- **`Toaster`**: required so that sonner's `toast(...)` calls are visible (mounted only once).

## Persistence — two separate cycles

```mermaid
graph LR
    subgraph Project["Cycle 1: project.json"]
        UP["updateProject → unsaved"] --> Save["SaveBar / File menu → writeTextFile + markSaved"]
    end
    subgraph Docs["Cycle 2: config files"]
        Draft["editor draft (local dirty)"] --> WF["Save/Ctrl+S → writeTextFile"]
    end
```

The project (`project.json`) and the **config files** (Documents section) have **independent**
save cycles: the config files do **not** live in the project and have their own "dirty" state
in the editor, decoupled from the `SaveBar`.

## App routes

```mermaid
graph LR
    Home["/ Dashboard"] --- LM["/listmods"]
    LM --- KB["/keybinds"]
    KB --- JVM["/jvm"]
    JVM --- DOC["/documents"]
    DOC --- AN["/analytics (placeholder)"]
```

Every route (except the placeholder) is wrapped in `<ProjectGate>`: without a project it shows the
create/open block. Details in [03 — Frontend](./03-frontend-pagine.md).
