// Profili di formato dei mod Forge, selezionati in base alla versione di Minecraft.
//
// I metadati e i file di lingua dei mod Forge hanno cambiato formato nel tempo
// (dati ricavati dalla documentazione Forge/NeoForge, non dai jar):
//
//   - MC <= 1.12.2      metadati in `mcmod.info` (JSON, array o `{ modList: [...] }`),
//                       lang in `assets/<modid>/lang/en_US.lang` (formato properties);
//   - MC 1.13 - 1.20.4  metadati in `META-INF/mods.toml`, dipendenze con
//                       `mandatory = true|false`, lang in `assets/<modid>/lang/en_us.json`;
//   - MC >= 1.20.5      `META-INF/mods.toml` con dipendenze
//                       `type = "required"|"optional"|"incompatible"|"discouraged"`
//                       e campo `provides`; NeoForge rinomina il file in
//                       `META-INF/neoforge.mods.toml`.
//
// IMPORTANTE: il rilevamento PRIMARIO resta il contenuto del jar (quali file
// esistono davvero), perche' la cartella `mods` puo' contenere jar compilati per
// versioni diverse da quella dichiarata nel progetto. Il profilo serve a:
//   1. fare da TIE-BREAK sui jar "universali" che contengono entrambi i formati
//      di metadati (`mcmod.info` + `mods.toml`);
//   2. decidere l'ORDINE di lettura dei lang quando un jar ne ha di piu' formati;
//   3. produrre WARNING quando il formato trovato non corrisponde alla versione
//      di Minecraft del progetto (diagnostica mostrata in List Mods).

/// Formato dei metadati di un mod Forge.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MetaFormat {
    /// `mcmod.info` (Forge <= 1.12.2).
    McmodInfo,
    /// `META-INF/mods.toml` / `META-INF/neoforge.mods.toml` (Forge >= 1.13).
    ModsToml,
}

/// Come una dipendenza dichiara l'obbligatorieta' nel TOML.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DepStyle {
    /// `mandatory = true|false` (Forge 1.13 - 1.20.4).
    Mandatory,
    /// `type = "required"|"optional"|"incompatible"|"discouraged"` (>= 1.20.5).
    Type,
}

/// Formato di un file di lingua.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LangKind {
    /// `en_us.json`: oggetto JSON piatto { chiave: testo }.
    Json,
    /// `en_US.lang`: formato properties `chiave=testo`, commenti con `#`.
    Properties,
}

/// Profilo di formato atteso per una certa versione di Minecraft.
#[derive(Clone, Copy)]
pub struct ForgeSpec {
    /// Id stabile del profilo (usato nei messaggi di diagnostica).
    pub id: &'static str,
    /// Formato di metadati atteso: tie-break sui jar che ne contengono due.
    pub meta: MetaFormat,
    /// Formato di lang letto per primo (l'altro resta comunque letto come fallback).
    pub lang: LangKind,
    /// Stile di dipendenza atteso; `None` = nessuna aspettativa (niente warning).
    pub dep_style: Option<DepStyle>,
}

/// Forge <= 1.12.2: `mcmod.info` + lang `.lang`.
pub const LEGACY: ForgeSpec = ForgeSpec {
    id: "forge-legacy",
    meta: MetaFormat::McmodInfo,
    lang: LangKind::Properties,
    dep_style: Some(DepStyle::Mandatory),
};

/// Forge 1.13 - 1.20.4: `mods.toml` con `mandatory` + lang JSON.
pub const FML: ForgeSpec = ForgeSpec {
    id: "forge-fml",
    meta: MetaFormat::ModsToml,
    lang: LangKind::Json,
    dep_style: Some(DepStyle::Mandatory),
};

/// Forge/NeoForge >= 1.20.5: `mods.toml` con `type` + lang JSON.
pub const FML_MODERN: ForgeSpec = ForgeSpec {
    id: "forge-fml-modern",
    meta: MetaFormat::ModsToml,
    lang: LangKind::Json,
    dep_style: Some(DepStyle::Type),
};

/// Nessun hint di versione: si va solo di rilevamento dal jar. Preferisce i
/// formati moderni e NON emette warning di formato (non c'e' niente da attendersi).
pub const DETECT_ONLY: ForgeSpec = ForgeSpec {
    id: "detect-only",
    meta: MetaFormat::ModsToml,
    lang: LangKind::Json,
    dep_style: None,
};

/// Estrae `(major, minor, patch)` da una versione tipo "1.20.4", "1.12.2-pre1",
/// "47.2.0". Ritorna `None` per le versioni non numeriche (es. snapshot "24w14a").
fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let core = v.trim().split(['-', '_', '+']).next()?.trim();
    if core.is_empty() {
        return None;
    }
    let mut parts = core.split('.').map(|p| p.trim().parse::<u32>().ok());
    let major = parts.next()??;
    let minor = parts.next().flatten().unwrap_or(0);
    let patch = parts.next().flatten().unwrap_or(0);
    Some((major, minor, patch))
}

/// Profilo atteso per la versione di Minecraft (e, in mancanza, per la versione
/// di Forge). Entrambi gli hint sono opzionali: senza hint si usa `DETECT_ONLY`.
pub fn spec_for(mc: Option<&str>, forge: Option<&str>) -> &'static ForgeSpec {
    if let Some((major, minor, patch)) = mc.and_then(parse_version) {
        // Nuovi schemi di versioning di Minecraft (major != 1, es. "26.1"):
        // sempre formato moderno.
        if major != 1 {
            return &FML_MODERN;
        }
        if (minor, patch) < (13, 0) {
            return &LEGACY;
        }
        if (minor, patch) < (20, 5) {
            return &FML;
        }
        return &FML_MODERN;
    }
    // Fallback sulla major di Forge: 14 = MC 1.12.2, 25..49 = 1.13..1.20.4,
    // 50+ = 1.20.5 in poi (quando è arrivato `type =` nelle dipendenze).
    if let Some((major, _, _)) = forge.and_then(parse_version) {
        if major <= 14 {
            return &LEGACY;
        }
        if major <= 49 {
            return &FML;
        }
        return &FML_MODERN;
    }
    &DETECT_ONLY
}

/// Descrizione leggibile del formato di metadati atteso (per i warning).
pub fn meta_label(meta: MetaFormat) -> &'static str {
    match meta {
        MetaFormat::McmodInfo => "mcmod.info",
        MetaFormat::ModsToml => "mods.toml",
    }
}

/// Descrizione leggibile dello stile di dipendenza (per i warning).
pub fn dep_style_label(style: DepStyle) -> &'static str {
    match style {
        DepStyle::Mandatory => "mandatory =",
        DepStyle::Type => "type =",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seleziona_il_profilo_dalla_versione_mc() {
        assert_eq!(spec_for(Some("1.7.10"), None).id, LEGACY.id);
        assert_eq!(spec_for(Some("1.12.2"), None).id, LEGACY.id);
        assert_eq!(spec_for(Some("1.13"), None).id, FML.id);
        assert_eq!(spec_for(Some("1.20.1"), None).id, FML.id);
        assert_eq!(spec_for(Some("1.20.4"), None).id, FML.id);
        assert_eq!(spec_for(Some("1.20.5"), None).id, FML_MODERN.id);
        assert_eq!(spec_for(Some("1.21.4"), None).id, FML_MODERN.id);
        assert_eq!(spec_for(Some("26.1"), None).id, FML_MODERN.id);
    }

    #[test]
    fn ripiega_sulla_versione_forge_poi_sul_rilevamento() {
        assert_eq!(spec_for(None, Some("14.23.5.2859")).id, LEGACY.id);
        assert_eq!(spec_for(None, Some("47.2.0")).id, FML.id);
        assert_eq!(spec_for(None, Some("50.1.0")).id, FML_MODERN.id);
        assert_eq!(spec_for(None, None).id, DETECT_ONLY.id);
        // Snapshot: non parsabile -> ricade sull'hint Forge.
        assert_eq!(spec_for(Some("24w14a"), Some("14.23.5.2859")).id, LEGACY.id);
    }
}
