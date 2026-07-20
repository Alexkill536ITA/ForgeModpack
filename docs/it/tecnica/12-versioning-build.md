# 12 — Versioning e gate di build

La versione dell'app vive in **tre file** da tenere allineati; una build è **bloccata** finché la
versione corrente non è stata "generata di fresco" con `pnpm bump`.

## I tre file (+ lock)

```mermaid
graph TB
    PKG["package.json<br/>(FONTE DI VERITÀ)"] --> CONF["src-tauri/tauri.conf.json"]
    PKG --> CARGO["src-tauri/Cargo.toml"]
    CARGO --> LOCK["src-tauri/Cargo.lock<br/>(package 'forgemodpack')"]
```

## `pnpm bump` ([`bump-version.mjs`](../../../scripts/bump-version.mjs))

Bump interattivo che sincronizza tutti i file e crea commit + tag.

```mermaid
flowchart TD
    Start["pnpm bump"] --> Read["leggi versione da package.json"]
    Read --> Ask["scegli patch / minor / major"]
    Ask --> Check{"tag vX.Y.Z già esiste?"}
    Check -->|sì| Fail["errore: scegli altro incremento"]
    Check -->|no| Write["scrivi package.json + tauri.conf.json + Cargo.toml (+ Cargo.lock)"]
    Write --> Commit["git commit (solo i file di versione)"]
    Commit --> Tag["git tag vX.Y.Z"]
```

- `package.json` è la fonte di verità; deve essere semver `X.Y.Z`.
- Aggiorna: `package.json` e `tauri.conf.json` (JSON, indent 2), `Cargo.toml` (solo la prima riga
  `version = "..."`), `Cargo.lock` (versione del package `forgemodpack`, se il lock esiste).
- Crea commit (limitato ai file di versione) e tag `vX.Y.Z`. Fallisce se il tag esiste già.

## Gate di build ([`check-version.mjs`](../../../scripts/check-version.mjs))

Incatenato nel `beforeBuildCommand` di `tauri.conf.json` → vale sia per `pnpm tauri:build` sia per
`tauri build`.

```mermaid
flowchart TD
    Build["build"] --> T{"esiste tag v<versione>?"}
    T -->|no| Block1["✖ build bloccata:<br/>versione senza tag"]
    T -->|sì| A{"commit dopo il tag?"}
    A -->|sì| Block2["✖ build bloccata:<br/>N commit dopo il tag"]
    A -->|no| Warn{"modifiche non committate?"}
    Warn -->|sì| W["⚠ avviso (non blocca)"]
    Warn -->|no| OK["✔ build consentita"]
    W --> OK
```

Regole di blocco:
1. deve esistere il tag git `v<versione>` (creato da `pnpm bump`);
2. non ci devono essere commit **dopo** quel tag (altrimenti hai fatto lavoro nuovo senza bumpare →
   versione "stantia").

Le modifiche non committate producono solo un **avviso** (non bloccano).

## Flusso tipico di release

```mermaid
sequenceDiagram
    actor Dev
    Dev->>Repo: lavora + commit
    Dev->>Bump: pnpm bump (scegli incremento)
    Bump->>Repo: commit + tag vX.Y.Z
    Dev->>Build: pnpm tauri:build
    Build->>Gate: check-version
    Gate-->>Build: ✔ (tag presente, 0 commit dopo)
    Build-->>Dev: eseguibile
```

> In pratica: fai bump **subito prima** di ogni build. Qualsiasi commit successivo al tag richiede un
> nuovo bump prima di poter ribuildare.
