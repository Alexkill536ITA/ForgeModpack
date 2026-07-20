# 12 — Versioning and build gate

The app version lives in **three files** that must be kept aligned; a build is **blocked** until the
current version has been "freshly generated" with `pnpm bump`.

## The three files (+ lock)

```mermaid
graph TB
    PKG["package.json<br/>(SOURCE OF TRUTH)"] --> CONF["src-tauri/tauri.conf.json"]
    PKG --> CARGO["src-tauri/Cargo.toml"]
    CARGO --> LOCK["src-tauri/Cargo.lock<br/>(package 'forgemodpack')"]
```

## `pnpm bump` ([`bump-version.mjs`](../../../scripts/bump-version.mjs))

Interactive bump that synchronizes all the files and creates a commit + tag.

```mermaid
flowchart TD
    Start["pnpm bump"] --> Read["read version from package.json"]
    Read --> Ask["choose patch / minor / major"]
    Ask --> Check{"tag vX.Y.Z already exists?"}
    Check -->|yes| Fail["error: choose another increment"]
    Check -->|no| Write["write package.json + tauri.conf.json + Cargo.toml (+ Cargo.lock)"]
    Write --> Commit["git commit (only the version files)"]
    Commit --> Tag["git tag vX.Y.Z"]
```

- `package.json` is the source of truth; it must be semver `X.Y.Z`.
- Updates: `package.json` and `tauri.conf.json` (JSON, indent 2), `Cargo.toml` (only the first line
  `version = "..."`), `Cargo.lock` (version of the `forgemodpack` package, if the lock exists).
- Creates a commit (limited to the version files) and tag `vX.Y.Z`. Fails if the tag already exists.

## Build gate ([`check-version.mjs`](../../../scripts/check-version.mjs))

Chained into the `beforeBuildCommand` of `tauri.conf.json` → applies both to `pnpm tauri:build` and
`tauri build`.

```mermaid
flowchart TD
    Build["build"] --> T{"tag v<version> exists?"}
    T -->|no| Block1["✖ build blocked:<br/>version without tag"]
    T -->|yes| A{"commits after the tag?"}
    A -->|yes| Block2["✖ build blocked:<br/>N commits after the tag"]
    A -->|no| Warn{"uncommitted changes?"}
    Warn -->|yes| W["⚠ warning (does not block)"]
    Warn -->|no| OK["✔ build allowed"]
    W --> OK
```

Blocking rules:
1. the git tag `v<version>` must exist (created by `pnpm bump`);
2. there must be no commits **after** that tag (otherwise you did new work without bumping →
   "stale" version).

Uncommitted changes only produce a **warning** (they do not block).

## Typical release flow

```mermaid
sequenceDiagram
    actor Dev
    Dev->>Repo: work + commit
    Dev->>Bump: pnpm bump (choose increment)
    Bump->>Repo: commit + tag vX.Y.Z
    Dev->>Build: pnpm tauri:build
    Build->>Gate: check-version
    Gate-->>Build: ✔ (tag present, 0 commits after)
    Build-->>Dev: executable
```

> In practice: bump **right before** every build. Any commit following the tag requires a
> new bump before you can rebuild.
