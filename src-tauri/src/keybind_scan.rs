// Riconoscimento delle keybind dal BYTECODE dei jar Forge/NeoForge.
//
// Il riconoscimento dai soli file di lingua e' un'euristica sui nomi delle chiavi
// (vedi `is_keybind_key` in `mods.rs`): sbaglia in due direzioni — perde le keybind
// con nomi non standard (`config.jsg.address_down`, `placebo.toggleTrails`) e
// prende per keybind traduzioni che contengono un segmento "key" ma non lo sono.
//
// Qui invece si guarda come Forge dichiara DAVVERO una keybind: un oggetto
// `KeyBinding`/`KeyMapping` costruito nel codice del mod, con la chiave di
// traduzione come stringa costante. Quindi:
//
//   1. per ogni `.class` del jar si legge il constant pool (`class_scan`);
//   2. se la classe referenzia una delle classi dell'SDK keybind
//      (`forge_spec::KEYBIND_MARKERS`, tabella per versione), le sue stringhe
//      costanti diventano CANDIDATE;
//   3. chi passa il taglio finale e' deciso dall'intersezione con le chiavi dei
//      file di lingua (in `mods.rs`): una candidata che e' anche una chiave di
//      traduzione e' una keybind CERTA, non indovinata.
//
// Le keybind che restano fuori (chiave costruita a runtime per concatenazione, o
// dichiarata in una classe che non referenzia l'SDK) sono comunque coperte
// dall'euristica sui lang, marcata come tale in `KeybindAction.source`.
//
// Vale per Forge/NeoForge: nei loro jar i nomi delle classi Minecraft restano
// leggibili (la reobfuscation SRG tocca solo metodi e campi). Su Fabric/Quilt le
// classi MC sono in *intermediary* (`class_304`), quindi il match per nome non si
// applica e resta la sola euristica sui lang.

use std::collections::HashSet;
use std::io::{BufReader, Cursor, Read, Seek};

use zip::ZipArchive;

use crate::class_scan;
use crate::forge_spec::{KeybindApi, KeybindEra, KEYBIND_MARKERS};

/// Limite di classi ispezionate per jar: guardia contro jar enormi (il costo e'
/// la decompressione). Oltre il limite lo scan si dichiara troncato e la
/// diagnostica lo segnala, invece di far finta di aver visto tutto.
const MAX_CLASSES_PER_JAR: usize = 30_000;

/// Risultato dello scan del bytecode di un jar.
#[derive(Default)]
pub struct BytecodeScan {
    /// Stringhe costanti dichiarate nelle classi che usano l'API keybind.
    pub candidates: HashSet<String>,
    /// Generazione di API rilevata, se un marker decisivo l'ha identificata.
    pub api: Option<KeybindApi>,
    /// Ere della classe keybind viste nel jar (`KeyBinding` e/o `KeyMapping`).
    pub eras: HashSet<KeybindEra>,
    /// Classi effettivamente ispezionate (diagnostica).
    pub classes: usize,
    /// `true` se si e' raggiunto `MAX_CLASSES_PER_JAR`.
    pub truncated: bool,
}

impl BytecodeScan {
    /// `true` se il jar usa l'API keybind (a prescindere dalle chiavi trovate).
    pub fn uses_keybind_api(&self) -> bool {
        !self.eras.is_empty() || self.api.is_some()
    }
}

/// Ordine di "recenza" delle generazioni: a parita' di marker decisivi trovati
/// vince la piu' recente (un jar puo' contenere classi di compatibilita').
fn rank(api: KeybindApi) -> u8 {
    match api {
        KeybindApi::FmlLegacyCpw => 0,
        KeybindApi::FmlClientRegistry => 1,
        KeybindApi::KeyMappingClientRegistry => 2,
        KeybindApi::RegisterEvent => 3,
        KeybindApi::RegisterEventCategories => 4,
    }
}

/// Era della classe keybind indicata da un nome di classe SDK, se e' una delle
/// due classi keybind (gli altri marker riguardano la registrazione).
fn era_of_marker(class: &str) -> Option<KeybindEra> {
    match class {
        "net/minecraft/client/settings/KeyBinding" => Some(KeybindEra::KeyBinding),
        "net/minecraft/client/KeyMapping" | "net/minecraft/client/KeyMapping$Category" => {
            Some(KeybindEra::KeyMapping)
        }
        _ => None,
    }
}

/// Filtro grossolano: la stringa potrebbe essere una chiave di traduzione?
/// Serve solo a non accumulare in memoria ogni stringa del bytecode; il taglio
/// vero e' l'intersezione con le chiavi dei lang.
pub fn looks_like_translation_key(s: &str) -> bool {
    if s.len() < 3 || s.len() > 200 {
        return false;
    }
    if !s.contains('.') || s.starts_with('.') || s.ends_with('.') {
        return false;
    }
    // Path di risorse, format string, SQL, JSON... non sono chiavi di traduzione.
    if s.chars().any(|c| {
        c.is_whitespace() || matches!(c, '/' | '\\' | '%' | '{' | '}' | '"' | '=' | ',' | '(' | ')')
    }) {
        return false;
    }
    // Nomi di file (`foo.json`, `bar.png`) e nomi di classe (`com.foo.Bar.class`).
    let last = s.rsplit('.').next().unwrap_or("");
    !matches!(
        last.to_ascii_lowercase().as_str(),
        "class" | "json" | "png" | "txt" | "toml" | "cfg" | "properties" | "lang" | "jar" | "zip"
            | "ogg" | "nbt" | "mcmeta"
    )
}

/// `true` se la chiave e' il TITOLO di una categoria della schermata Controls, non
/// un'azione. Due formati, secondo la versione:
///   - `key.categories.<x>` (anche con prefisso del mod: `mymod.key.categories.main`);
///   - `key.category.<namespace>.<path>` — SINGOLARE, introdotto in MC 1.21.9 /
///     NeoForge 21.9 con `KeyMapping.Category`.
pub fn is_category_key(k: &str) -> bool {
    let segments: Vec<&str> = k.split('.').collect();
    for (i, seg) in segments.iter().enumerate() {
        if *seg == "categories" {
            return true;
        }
        // `category` conta solo se preceduto da `key` (o all'inizio della chiave):
        // evita di scartare azioni tipo `key.mod.mycategory.toggle`.
        if *seg == "category" && (i == 0 || segments[i - 1] == "key") {
            return true;
        }
    }
    false
}

/// Legge il bytecode di un jar (e dei suoi JarJar annidati, un livello) e
/// raccoglie le stringhe costanti delle classi che usano l'API keybind.
pub fn scan_bytecode<R: Read + Seek>(archive: &mut ZipArchive<R>) -> BytecodeScan {
    let mut out = BytecodeScan::default();
    scan_archive(archive, &mut out, true);
    out
}

fn scan_archive<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    out: &mut BytecodeScan,
    with_nested: bool,
) {
    // I nomi vanno raccolti prima: `file_names()` prende in prestito l'archivio.
    let classes: Vec<String> = archive
        .file_names()
        .filter(|n| n.to_ascii_lowercase().ends_with(".class"))
        .map(|n| n.to_string())
        .collect();

    for name in classes {
        if out.classes >= MAX_CLASSES_PER_JAR {
            out.truncated = true;
            break;
        }
        out.classes += 1;

        let entry = match archive.by_name(&name) {
            Ok(e) => e,
            Err(_) => continue,
        };
        // Il constant pool sta all'inizio del file: la lettura (e la
        // decompressione) si ferma appena finito, senza leggere tutta la classe.
        let constants = match class_scan::read_constants(BufReader::new(entry)) {
            Some(c) => c,
            None => continue,
        };

        let mut is_keybind_class = false;
        for class_ref in &constants.class_refs {
            let marker = match KEYBIND_MARKERS.iter().find(|m| m.class == class_ref.as_str()) {
                Some(m) => m,
                None => continue,
            };
            is_keybind_class = true;
            if let Some(era) = era_of_marker(marker.class) {
                out.eras.insert(era);
            }
            if marker.decisive
                && out.api.map(|current| rank(marker.api) > rank(current)).unwrap_or(true)
            {
                out.api = Some(marker.api);
            }
        }
        if !is_keybind_class {
            continue;
        }

        for s in constants.strings {
            if looks_like_translation_key(&s) && !is_category_key(&s) {
                out.candidates.insert(s);
            }
        }
    }

    if !with_nested {
        return;
    }

    // Dipendenze incluse via JarJar: alcune portano keybind proprie (es. Create
    // include Ponder). Un solo livello, come per i file di lingua.
    let nested: Vec<String> = archive
        .file_names()
        .filter(|n| n.starts_with("META-INF/jarjar/") && n.ends_with(".jar"))
        .map(|n| n.to_string())
        .collect();
    for name in nested {
        let mut buf = Vec::new();
        match archive.by_name(&name) {
            Ok(mut entry) => {
                if entry.read_to_end(&mut buf).is_err() {
                    continue;
                }
            }
            Err(_) => continue,
        }
        if let Ok(mut inner) = ZipArchive::new(Cursor::new(buf)) {
            scan_archive(&mut inner, out, false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::class_scan::test_support::class_file;
    use std::io::Write;

    fn jar(files: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default();
            for (name, content) in files {
                zip.start_file(*name, options).unwrap();
                zip.write_all(content).unwrap();
            }
            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn riconosce_le_categorie_dei_due_formati() {
        // Formato storico.
        assert!(is_category_key("key.categories.examplemod"));
        assert!(is_category_key("mymod.key.categories.main"));
        // Formato 1.21.9+ (`KeyMapping.Category`), singolare.
        assert!(is_category_key("key.category.examplemod.main"));
        // Categoria dichiarata senza prefisso `key.` (stile usato su Fabric).
        assert!(is_category_key("category.examplemod.test"));
        // Azioni: non sono categorie.
        assert!(!is_category_key("key.examplemod.jump"));
        assert!(!is_category_key("key.mod.mycategory.toggle"));
        assert!(!is_category_key("placebo.toggleTrails"));
    }

    #[test]
    fn filtra_le_stringhe_che_non_sono_chiavi() {
        assert!(looks_like_translation_key("key.jei.toggleOverlay"));
        assert!(looks_like_translation_key("placebo.toggleTrails"));
        assert!(looks_like_translation_key("config.jsg.address_down"));
        assert!(!looks_like_translation_key("assets/mymod/lang/en_us.json"));
        assert!(!looks_like_translation_key("textures.gui.widget.png"));
        assert!(!looks_like_translation_key("no dots here"));
        assert!(!looks_like_translation_key("Hello, %s."));
    }

    #[test]
    fn raccoglie_solo_le_stringhe_delle_classi_che_usano_l_api() {
        let keybind_class = class_file(
            &[
                "net/minecraft/client/KeyMapping",
                "net/minecraftforge/client/event/RegisterKeyMappingsEvent",
            ],
            // Chiave non standard (senza marcatore "key"): l'euristica sui lang la
            // perderebbe, il bytecode no.
            &["placebo.toggleTrails", "key.categories.placebo"],
        );
        let other_class = class_file(&["java/lang/String"], &["gui.placebo.tooltip.key"]);
        let bytes = jar(&[
            ("com/example/KeyBinds.class", keybind_class),
            ("com/example/Other.class", other_class),
        ]);

        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let scan = scan_bytecode(&mut archive);

        assert!(scan.candidates.contains("placebo.toggleTrails"));
        // La categoria non e' un'azione.
        assert!(!scan.candidates.contains("key.categories.placebo"));
        // Stringa di una classe che non usa l'API keybind: ignorata (sarebbe un
        // falso positivo dell'euristica sui nomi).
        assert!(!scan.candidates.contains("gui.placebo.tooltip.key"));
        assert_eq!(scan.classes, 2);
        assert!(!scan.truncated);
        assert_eq!(scan.api, Some(KeybindApi::RegisterEvent));
        assert!(scan.eras.contains(&KeybindEra::KeyMapping));
        assert!(scan.uses_keybind_api());
    }

    #[test]
    fn rileva_l_era_legacy_e_le_keybind_dei_jarjar() {
        let legacy = class_file(
            &[
                "net/minecraft/client/settings/KeyBinding",
                "cpw/mods/fml/client/registry/ClientRegistry",
            ],
            &["key.mymod.legacyAction"],
        );
        let nested_inner = class_file(
            &["net/minecraft/client/KeyMapping"],
            &["key.ponder.ponder"],
        );
        let nested_jar = jar(&[("com/ponder/Keys.class", nested_inner)]);
        let bytes = jar(&[
            ("com/mymod/Keys.class", legacy),
            ("META-INF/jarjar/ponder.jar", nested_jar),
        ]);

        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let scan = scan_bytecode(&mut archive);

        assert!(scan.candidates.contains("key.mymod.legacyAction"));
        // Keybind di una dipendenza bundlata.
        assert!(scan.candidates.contains("key.ponder.ponder"));
        assert!(scan.eras.contains(&KeybindEra::KeyBinding));
        assert!(scan.eras.contains(&KeybindEra::KeyMapping));
        assert_eq!(scan.api, Some(KeybindApi::FmlLegacyCpw));
    }
}
