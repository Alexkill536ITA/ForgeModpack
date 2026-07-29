# 8 — Saving and versions

## Two types of saving

In the app there are **two** distinct kinds of saving, which are best not to confuse:

```mermaid
graph TD
    A["Changes to the modpack<br/>(data, mods, keybinds, JVM…)"] --> SB["Save bar at the top → Save<br/>writes the project .json file"]
    B["Changes to a config file<br/>(Documents section)"] --> ED["Save/Ctrl+S in the editor<br/>writes that single file"]
```

| What you change | How it is saved |
|-----------------|-----------------|
| Pack data, active mods/datapacks, keybinds, JVM settings, notes, assets | **Save bar** at the top → `Save` (writes `<name>.json`) |
| A file inside `config`/`kubejs` (Documents section) | **Save** or **Ctrl/Cmd+S** inside the editor |

## The save bar

When you change something related to the project, a bar appears at the top reminding you to
save. Click **Save** to write everything to the `.json` file in the workspace folder. After
saving, the bar disappears.

> If the project has no name, saving will tell you: set the **Name** in the Dashboard
> ([chapter 2](./02-dashboard.md)).

## Save As / change folder

From the **File** menu:

- **Save As** — save the project to a new location or under a different name (the workspace folder is
  updated accordingly).
- **Change Workspace** — change the workspace folder of the current project.

If there are unsaved changes, the app always asks for confirmation before operations that could cause
you to lose your work (closing, opening another one, quitting).

## Application versions

> This part is mainly of interest to those who **build** the app themselves; a normal user doesn't need to do anything with it.

The app keeps its version aligned across multiple files and uses a small "gate" that **prevents
building** an out-of-date version:

```mermaid
graph LR
    Bump["pnpm bump<br/>(choose patch/minor/major)"] --> Tag["creates commit + version tag"]
    Tag --> Build["pnpm tauri:build"]
    Build --> Check{"version tagged<br/>and no commits after?"}
    Check -->|Yes| OK["build allowed"]
    Check -->|No| Blocked["build blocked:<br/>redo the bump"]
```

In practice, before generating the executable you run `pnpm bump` to increment the version; without
this step the build is blocked. The technical details are in the
[technical documentation](../technical/12-versioning-build.md).

## Checking for updates

On startup the app checks GitHub for a newer release of Forge Modpack. If there is one, a window shows
the current version, the new one and the release notes; the **Download** button opens the download
page in your browser. The app **does not update itself**: you download and run the installer manually.

If nothing new is found (or you are offline) startup shows no window at all: the check stays silent and
the app works normally offline too.

You can check at any time from the **Forge Modpack** menu (at the top of the sidebar) → **Check for
Updates**. When an update is available a dot appears next to the app name and the menu entry shows the
new version number.

The window also has an **Include beta versions (pre-releases)** checkbox:

- **off** (default): only stable versions are offered;
- **on**: pre-releases are offered too — test versions published before a stable one: more up to date,
  but potentially less tested.

Your choice is remembered for next time.
