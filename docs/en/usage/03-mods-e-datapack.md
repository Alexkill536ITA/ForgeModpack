# 3 — Mods and datapacks

The **List Mods** section (in the sidebar) shows what your modpack actually contains: it reads the
`.jar` files from the `mods` folder (and the datapacks, if any) and lists them with all their details.

## How scanning works

The first time you open the section, the app **scans** the `mods` folder and reads the name, version,
authors, modloader and dependencies from each jar. The result is remembered, so it's instant the next
times.

```mermaid
graph LR
    Scan["Open List Mods"] --> Read["Reads the .jar files in mods/"]
    Read --> Table["Mods table"]
    Table --> Refresh["Refresh button<br/>to re-scan"]
```

> Use **Refresh** when you add, update or remove mods from the folder: it updates the list by reading
> the files again.

## The mods table

At the top you'll find three summaries: the **total** count, **active** mods and **inactive** ones.

The table shows, for each mod:

| Column | Meaning |
|---------|-------------|
| **On** | Toggle to enable/disable the mod |
| **Mod** | Mod name |
| **Version** | Version |
| **Loader** | Forge / NeoForge / Fabric / Quilt (colored badge) |
| **Authors** | Authors |
| **Dependencies** | Dependency status (see below) |

### Enabling and disabling mods

The **On** toggle lets you mark a mod as active or inactive. It's a way to keep track of what's part of
the pack without deleting files. The state is saved in the project.

### Searching for a mod

Use the **search** bar: you can type just a few letters of the name ("fuzzy" search) and the list
reorders itself to show the best matches first.

## Missing dependencies

The **Dependencies** column warns you if a mod is missing something it needs to work:

```mermaid
graph TD
    Dep["A mod's required dependencies"] --> Q{"Are they covered<br/>by the active mods?"}
    Q -->|Yes| Green["● green: all good"]
    Q -->|No| Red["● red: hover to<br/>see what's missing"]
```

- **Green dot** — all required dependencies are satisfied by the other active mods.
- **Red dot** — something is missing: hover over it to see the list of missing dependencies.

The check also accounts for dependencies **bundled inside** another jar (many Forge mods include the
libraries they need), so it reduces false alarms.

> 💡 If you open an old project and see lots of false "missing dependency" warnings, press **Refresh**:
> a fresh scan recognizes bundled libraries better.

## Datapacks

If your modpack uses **datapacks** (Datapack loader, or hybrid mode — see
[chapter 2](./02-dashboard.md)), a dedicated datapacks table also appears, with:

| Column | Meaning |
|---------|-------------|
| **On** | Enable/disable the datapack |
| **Datapack** | Name |
| **Pack format** | Datapack format |
| **Description** | Description |

What you see depending on the loader:

```mermaid
graph TD
    T{"Loader type"} -->|Classic| M["Mods table only"]
    T -->|Datapack only| D["Datapacks table only"]
    T -->|Hybrid| B["Mods table + Datapacks table"]
```

Datapacks are read from the datapacks folder (default `datapacks/`, or the one you set in the
Dashboard). Here too the **Refresh** button re-reads the folder.
