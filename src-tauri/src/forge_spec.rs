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
//
// Nella seconda parte del file c'e' la tabella delle API KEYBIND per versione
// (classi dell'SDK Forge/NeoForge cercate nel bytecode): stessa filosofia, il jar
// resta la fonte primaria e la versione del progetto serve solo da riferimento.

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

// --- API keybind per versione ---------------------------------------------
//
// Su Forge/NeoForge una keybind e' un oggetto costruito nel codice del mod, non un
// dato dichiarativo: la sua chiave di traduzione e' una stringa costante nel
// bytecode. Le classi coinvolte hanno cambiato nome e la registrazione ha cambiato
// meccanismo diverse volte (dati dalla documentazione Forge/NeoForge):
//
//   MC <= 1.7.10   `net.minecraft.client.settings.KeyBinding` +
//                  `cpw.mods.fml.client.registry.ClientRegistry.registerKeyBinding`
//   MC 1.8 - 1.16  stessa classe + `net.minecraftforge.fml.client.registry.ClientRegistry`
//   MC 1.17 - 1.19.2  classe rinominata `net.minecraft.client.KeyMapping`
//                  (mappings ufficiali Mojang), registrazione ancora via ClientRegistry
//   MC >= 1.19.3   `RegisterKeyMappingsEvent` sul mod bus
//                  (`net.minecraftforge.client.event`, NeoForge:
//                  `net.neoforged.neoforge.client.event`)
//   MC >= 1.21.9   le categorie diventano `KeyMapping.Category` (record con
//                  ResourceLocation) registrate con `registerCategory`; la loro
//                  chiave di traduzione e' `key.category.<namespace>.<path>`
//                  (SINGOLARE, prima era `key.categories.*`)
//
// Questi nomi sono cercabili nel bytecode dei jar pubblicati perche' la
// reobfuscation SRG rinomina solo metodi e campi, non le classi (vedi
// `class_scan.rs`). NON valgono per Fabric/Quilt, dove le classi MC sono in
// intermediary.

/// Come un mod dichiara e registra le proprie keybind, per generazione di Forge.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeybindApi {
    /// MC <= 1.7.10: `KeyBinding` + ClientRegistry sotto `cpw.mods.fml`.
    FmlLegacyCpw,
    /// MC 1.8 - 1.16.5: `KeyBinding` + ClientRegistry sotto `net.minecraftforge.fml`.
    FmlClientRegistry,
    /// MC 1.17 - 1.19.2: `KeyMapping` + ClientRegistry.
    KeyMappingClientRegistry,
    /// MC 1.19.3 - 1.21.8 (e NeoForge): `RegisterKeyMappingsEvent`.
    RegisterEvent,
    /// MC >= 1.21.9 / NeoForge 21.9: `RegisterKeyMappingsEvent` + `KeyMapping.Category`.
    RegisterEventCategories,
}

/// Nome della classe che rappresenta una keybind, per generazione: il rinomino
/// `KeyBinding` -> `KeyMapping` e' avvenuto in MC 1.17.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum KeybindEra {
    /// `net.minecraft.client.settings.KeyBinding` (MC <= 1.16.5).
    KeyBinding,
    /// `net.minecraft.client.KeyMapping` (MC >= 1.17).
    KeyMapping,
}

/// Una classe dell'SDK la cui presenza nel bytecode indica che quella classe del
/// mod dichiara/registra keybind.
pub struct KeybindMarker {
    /// Nome interno della classe (`a/b/C`), come appare nel constant pool.
    pub class: &'static str,
    /// Generazione a cui appartiene il marker.
    pub api: KeybindApi,
    /// `true` se il marker identifica da solo la generazione (es. l'evento di
    /// registrazione); `false` per le classi presenti in piu' versioni.
    pub decisive: bool,
}

/// Tutte le classi SDK cercate nel bytecode. Si cercano SEMPRE tutte, non solo
/// quelle del profilo: la cartella `mods` puo' contenere jar compilati per altre
/// versioni, e in quel caso vogliamo comunque leggerne le keybind (e segnalare la
/// discrepanza nei warning).
pub const KEYBIND_MARKERS: &[KeybindMarker] = &[
    // Classe keybind: identifica l'era (KeyBinding vs KeyMapping) ma non la versione esatta.
    KeybindMarker {
        class: "net/minecraft/client/settings/KeyBinding",
        api: KeybindApi::FmlClientRegistry,
        decisive: false,
    },
    KeybindMarker {
        class: "net/minecraft/client/KeyMapping",
        api: KeybindApi::RegisterEvent,
        decisive: false,
    },
    // Categorie tipizzate: solo 1.21.9+ / NeoForge 21.9+.
    KeybindMarker {
        class: "net/minecraft/client/KeyMapping$Category",
        api: KeybindApi::RegisterEventCategories,
        decisive: true,
    },
    // Registrazione: identifica la generazione.
    KeybindMarker {
        class: "cpw/mods/fml/client/registry/ClientRegistry",
        api: KeybindApi::FmlLegacyCpw,
        decisive: true,
    },
    KeybindMarker {
        class: "net/minecraftforge/fml/client/registry/ClientRegistry",
        api: KeybindApi::FmlClientRegistry,
        decisive: false,
    },
    KeybindMarker {
        class: "net/minecraftforge/client/event/RegisterKeyMappingsEvent",
        api: KeybindApi::RegisterEvent,
        decisive: true,
    },
    KeybindMarker {
        class: "net/neoforged/neoforge/client/event/RegisterKeyMappingsEvent",
        api: KeybindApi::RegisterEvent,
        decisive: true,
    },
    // Contesto di conflitto e modificatori: aggiunte Forge, presenti nelle classi
    // che costruiscono keybind anche quando la costruzione e' delegata a un helper.
    KeybindMarker {
        class: "net/minecraftforge/client/settings/KeyModifier",
        api: KeybindApi::FmlClientRegistry,
        decisive: false,
    },
    KeybindMarker {
        class: "net/minecraftforge/client/settings/IKeyConflictContext",
        api: KeybindApi::FmlClientRegistry,
        decisive: false,
    },
    KeybindMarker {
        class: "net/minecraftforge/client/settings/KeyConflictContext",
        api: KeybindApi::FmlClientRegistry,
        decisive: false,
    },
    KeybindMarker {
        class: "net/neoforged/neoforge/client/settings/KeyModifier",
        api: KeybindApi::RegisterEvent,
        decisive: false,
    },
    KeybindMarker {
        class: "net/neoforged/neoforge/client/settings/IKeyConflictContext",
        api: KeybindApi::RegisterEvent,
        decisive: false,
    },
    KeybindMarker {
        class: "net/neoforged/neoforge/client/settings/KeyConflictContext",
        api: KeybindApi::RegisterEvent,
        decisive: false,
    },
];

/// Era della classe keybind usata da una certa generazione di API.
pub fn keybind_era(api: KeybindApi) -> KeybindEra {
    match api {
        KeybindApi::FmlLegacyCpw | KeybindApi::FmlClientRegistry => KeybindEra::KeyBinding,
        KeybindApi::KeyMappingClientRegistry
        | KeybindApi::RegisterEvent
        | KeybindApi::RegisterEventCategories => KeybindEra::KeyMapping,
    }
}

/// Nome della classe keybind di un'era (per i messaggi di diagnostica).
pub fn keybind_era_label(era: KeybindEra) -> &'static str {
    match era {
        KeybindEra::KeyBinding => "KeyBinding (MC <= 1.16)",
        KeybindEra::KeyMapping => "KeyMapping (MC >= 1.17)",
    }
}

/// API keybind attesa per la versione di Minecraft (o, in mancanza, per la major
/// di Forge). `None` = nessun hint, nessuna aspettativa (niente warning).
pub fn keybind_api_for(mc: Option<&str>, forge: Option<&str>) -> Option<KeybindApi> {
    if let Some((major, minor, patch)) = mc.and_then(parse_version) {
        // Nuovo schema di versioning di Minecraft (major != 1): sempre moderno.
        if major != 1 {
            return Some(KeybindApi::RegisterEventCategories);
        }
        if (minor, patch) < (8, 0) {
            return Some(KeybindApi::FmlLegacyCpw);
        }
        if (minor, patch) < (17, 0) {
            return Some(KeybindApi::FmlClientRegistry);
        }
        if (minor, patch) < (19, 3) {
            return Some(KeybindApi::KeyMappingClientRegistry);
        }
        if (minor, patch) < (21, 9) {
            return Some(KeybindApi::RegisterEvent);
        }
        return Some(KeybindApi::RegisterEventCategories);
    }
    // Fallback sulla major di Forge: 10 = 1.7.10, 11..36 = 1.8..1.16.5,
    // 37..43 = 1.17..1.19.2, 44+ = 1.19.3 in poi (arrivo di RegisterKeyMappingsEvent).
    let (major, _, _) = forge.and_then(parse_version)?;
    Some(if major <= 10 {
        KeybindApi::FmlLegacyCpw
    } else if major <= 36 {
        KeybindApi::FmlClientRegistry
    } else if major <= 43 {
        KeybindApi::KeyMappingClientRegistry
    } else {
        KeybindApi::RegisterEvent
    })
}

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
    fn seleziona_l_api_keybind_dalla_versione_mc() {
        assert_eq!(
            keybind_api_for(Some("1.7.10"), None),
            Some(KeybindApi::FmlLegacyCpw)
        );
        assert_eq!(
            keybind_api_for(Some("1.12.2"), None),
            Some(KeybindApi::FmlClientRegistry)
        );
        assert_eq!(
            keybind_api_for(Some("1.16.5"), None),
            Some(KeybindApi::FmlClientRegistry)
        );
        assert_eq!(
            keybind_api_for(Some("1.18.2"), None),
            Some(KeybindApi::KeyMappingClientRegistry)
        );
        // Il passaggio a RegisterKeyMappingsEvent e' 1.19.3, non 1.19.
        assert_eq!(
            keybind_api_for(Some("1.19.2"), None),
            Some(KeybindApi::KeyMappingClientRegistry)
        );
        assert_eq!(
            keybind_api_for(Some("1.19.3"), None),
            Some(KeybindApi::RegisterEvent)
        );
        assert_eq!(
            keybind_api_for(Some("1.21.1"), None),
            Some(KeybindApi::RegisterEvent)
        );
        // KeyMapping.Category: da 1.21.9.
        assert_eq!(
            keybind_api_for(Some("1.21.9"), None),
            Some(KeybindApi::RegisterEventCategories)
        );
        // Senza hint non c'e' nessuna aspettativa.
        assert_eq!(keybind_api_for(None, None), None);
        // Fallback sulla major di Forge.
        assert_eq!(
            keybind_api_for(None, Some("14.23.5.2859")),
            Some(KeybindApi::FmlClientRegistry)
        );
        assert_eq!(
            keybind_api_for(None, Some("47.2.0")),
            Some(KeybindApi::RegisterEvent)
        );
    }

    #[test]
    fn era_della_classe_keybind() {
        assert_eq!(
            keybind_era(KeybindApi::FmlClientRegistry),
            KeybindEra::KeyBinding
        );
        assert_eq!(
            keybind_era(KeybindApi::KeyMappingClientRegistry),
            KeybindEra::KeyMapping
        );
        assert_eq!(
            keybind_era(KeybindApi::RegisterEventCategories),
            KeybindEra::KeyMapping
        );
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
