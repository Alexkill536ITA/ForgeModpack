// Scansione della cartella `mods` di un modpack: ogni .jar viene aperto come
// archivio ZIP e i metadati estratti dal formato del rispettivo mod loader.
//   - NeoForge         -> META-INF/neoforge.mods.toml
//   - Forge >= 1.13    -> META-INF/mods.toml (stesso schema TOML)
//   - Forge <= 1.12.2  -> mcmod.info (JSON: array oppure { modList: [...] })
//   - Fabric           -> fabric.mod.json
//   - Quilt            -> quilt.mod.json (annidato sotto "quilt_loader")
// Per i jar senza metadati riconosciuti si prova il MANIFEST.MF e, in ultima
// istanza, si restituisce una riga con il solo filename (loader "unknown").
//
// Il formato atteso per la versione di Minecraft del progetto arriva da
// [`forge_spec`]: NON decide da solo cosa leggere (il rilevamento primario e'
// sempre il contenuto del jar, perche' la cartella mods puo' contenere jar di
// versioni diverse), ma fa da tie-break sui jar che contengono entrambi i
// formati, ordina la lettura dei lang e alimenta i `warnings` di diagnostica.
//
// Per la verifica delle dipendenze ogni mod espone `provides`: l'elenco di TUTTI
// i modId che il jar mette a disposizione, considerando piu' `[[mods]]`, il campo
// `provides` e soprattutto le dipendenze incluse (JarJar in META-INF/jarjar/),
// molto comuni su Forge.

use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Read, Seek};
use std::path::Path;

use serde::Serialize;
use serde_json::Value as JsonValue;
use zip::ZipArchive;

use crate::forge_spec::{self, DepStyle, ForgeSpec, KeybindApi, LangKind, MetaFormat};
use crate::keybind_scan;
use crate::mc_compat;

// Nomi dei file di metadati riconosciuti.
const NEOFORGE_TOML: &str = "META-INF/neoforge.mods.toml";
const FORGE_TOML: &str = "META-INF/mods.toml";
const MCMOD_INFO: &str = "mcmod.info";
const QUILT_JSON: &str = "quilt.mod.json";
const FABRIC_JSON: &str = "fabric.mod.json";
const MANIFEST: &str = "META-INF/MANIFEST.MF";

#[derive(Serialize)]
pub struct ModDependency {
    pub name: String,
    pub version: String,
    pub mandatory: bool,
}

/// Da dove viene la certezza che una chiave di traduzione sia una keybind.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum KeybindSource {
    /// La chiave e' una stringa costante di una classe che usa l'API keybind di
    /// Forge/NeoForge (`KeyBinding`/`KeyMapping`): keybind CERTA.
    Bytecode,
    /// La chiave "sembra" una keybind dal nome (euristica sui lang): probabile.
    Lang,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeybindAction {
    /// Chiave di traduzione, es. "key.jei.toggleOverlay".
    pub key: String,
    /// Testo leggibile dal file en_us (fallback: la chiave stessa).
    pub label: String,
    /// Come e' stata riconosciuta: dal bytecode (certa) o dal nome (euristica).
    pub source: KeybindSource,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedMod {
    pub filename: String,
    pub mod_id: String,
    pub name: String,
    pub modloader: String,
    pub version: String,
    pub description: Option<String>,
    pub authors: Vec<String>,
    pub dependencies: Vec<ModDependency>,
    /// Tutti i modId forniti dal jar (incluso il principale, i provides e i JarJar).
    pub provides: Vec<String>,
    /// Keybind definite dalla mod (chiave di traduzione + label), lette dai lang.
    /// Incluse nella STESSA scansione dei metadati per aprire ogni jar una volta.
    pub keybinds: Vec<KeybindAction>,
    /// Formato di metadati effettivamente rilevato, es. "forge:mods.toml",
    /// "forge:mcmod.info", "fabric", "unknown:manifest". Usato dalla diagnostica.
    pub format: String,
    /// Vincolo di versione Minecraft dichiarato dalla mod, nel dialetto del suo
    /// loader (range Maven per Forge/NeoForge, espressione semver per
    /// Fabric/Quilt, `mcversion` per il legacy). `None` se la mod non lo dichiara.
    pub mc_version: Option<String>,
    /// Esito del confronto tra `mc_version` e la versione MC del progetto:
    /// `None` = non verificabile (vincolo assente, sintassi sconosciuta, o
    /// nessuna versione MC nel progetto).
    pub mc_compatible: Option<bool>,
    /// Problemi riscontrati leggendo il jar (mostrati in List Mods). In inglese,
    /// come i warning degli exporter.
    pub warnings: Vec<String>,
}

/// Riga "vuota" da cui partono tutti i parser.
fn empty_mod(filename: &str, modloader: &str, format: &str) -> ScannedMod {
    ScannedMod {
        filename: filename.to_string(),
        mod_id: String::new(),
        name: filename.to_string(),
        modloader: modloader.to_string(),
        version: String::new(),
        description: None,
        authors: Vec::new(),
        dependencies: Vec::new(),
        provides: Vec::new(),
        keybinds: Vec::new(),
        format: format.to_string(),
        mc_version: None,
        mc_compatible: None,
        warnings: Vec::new(),
    }
}

/// Legge il contenuto testuale di una entry dello zip, se presente.
///
/// I file dei mod NON sono sempre UTF-8: i `.lang` e i `mcmod.info` dei mod
/// legacy (Forge <= 1.12.2) sono spesso in ISO-8859-1. Leggere in UTF-8 stretto
/// scarterebbe l'INTERO file (perdendo tutte le keybind di quel mod), quindi in
/// caso di byte non validi si ripiega su ISO-8859-1, che non puo' fallire.
fn read_entry<R: Read + Seek>(archive: &mut ZipArchive<R>, name: &str) -> Option<String> {
    let mut file = archive.by_name(name).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(decode_text(bytes))
}

/// UTF-8 se valido, altrimenti ISO-8859-1 (latin-1): ogni byte e' un code point.
/// Rimuove anche il BOM UTF-8, che altrimenti farebbe fallire il parse JSON
/// (serde_json non lo tollera) o finirebbe nella prima chiave di un `.lang`.
fn decode_text(bytes: Vec<u8>) -> String {
    let bytes = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(rest) => rest.to_vec(),
        None => bytes,
    };
    match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(err) => err
            .into_bytes()
            .into_iter()
            .map(|b| b as char)
            .collect::<String>(),
    }
}

/// Estrae un campo dal MANIFEST.MF (es. `Implementation-Version`, usato da Forge
/// per risolvere il placeholder `${file.jarVersion}`).
fn manifest_field(manifest: &str, key: &str) -> Option<String> {
    for line in manifest.lines() {
        if let Some(rest) = line.strip_prefix(key) {
            if let Some(value) = rest.strip_prefix(':') {
                let value = value.trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn manifest_version(manifest: &str) -> Option<String> {
    manifest_field(manifest, "Implementation-Version")
}

/// Sostituisce una versione vuota o con placeholder (`${file.jarVersion}`) con
/// l'`Implementation-Version` del MANIFEST. Segnala se resta non risolta.
fn resolve_version(version: String, manifest: Option<&str>, warnings: &mut Vec<String>) -> String {
    if !version.is_empty() && !version.contains("${") {
        return version;
    }
    if let Some(v) = manifest.and_then(manifest_version) {
        return v;
    }
    if version.contains("${") {
        warnings.push(
            "Version placeholder could not be resolved (no Implementation-Version in MANIFEST.MF)."
                .to_string(),
        );
    }
    version
}

/// Unisce dipendenze deduplicando per nome (case-insensitive). Se una dipendenza
/// compare piu' volte resta obbligatoria se lo e' almeno una volta.
fn merge_deps(target: &mut Vec<ModDependency>, incoming: Vec<ModDependency>) {
    for dep in incoming {
        match target
            .iter_mut()
            .find(|d| d.name.eq_ignore_ascii_case(&dep.name))
        {
            Some(existing) => {
                existing.mandatory = existing.mandatory || dep.mandatory;
                if existing.version.is_empty() {
                    existing.version = dep.version;
                }
            }
            None => target.push(dep),
        }
    }
}

// ---------------------------------------------------------------------------
// Forge / NeoForge >= 1.13 — META-INF/(neoforge.)mods.toml
// ---------------------------------------------------------------------------

/// authors in mods.toml puo' essere una stringa ("a, b") o un array.
fn authors_from_toml(value: &toml::Value) -> Vec<String> {
    if let Some(s) = value.as_str() {
        s.split(',')
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect()
    } else if let Some(arr) = value.as_array() {
        arr.iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect()
    } else {
        Vec::new()
    }
}

/// Una dipendenza Forge/NeoForge e' obbligatoria se `type="required"` (formato
/// dal 1.20.5) oppure `mandatory=true` (formato classico, default true).
/// `optional`, `incompatible` e `discouraged` non sono obbligatorie.
fn forge_dep_mandatory(dep: &toml::Value) -> bool {
    if let Some(kind) = dep.get("type").and_then(|v| v.as_str()) {
        return kind.eq_ignore_ascii_case("required");
    }
    dep.get("mandatory")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Converte una entry di dipendenza TOML in `ModDependency`.
fn toml_dep(dep: &toml::Value) -> Option<ModDependency> {
    let name = dep.get("modId").and_then(|v| v.as_str())?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let version = dep
        .get("versionRange")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Some(ModDependency {
        name,
        version,
        mandatory: forge_dep_mandatory(dep),
    })
}

/// Quali campi usa una entry (o un array di entry) per dichiarare
/// l'obbligatorieta': `(usa type, usa mandatory)`. Serve solo alla diagnostica.
fn declared_dep_style(entry: &toml::Value) -> (bool, bool) {
    let of_one = |dep: &toml::Value| (dep.get("type").is_some(), dep.get("mandatory").is_some());
    if let Some(arr) = entry.as_array() {
        arr.iter().fold((false, false), |acc, dep| {
            let (has_type, has_mandatory) = of_one(dep);
            (acc.0 || has_type, acc.1 || has_mandatory)
        })
    } else if entry.is_table() {
        of_one(entry)
    } else {
        (false, false)
    }
}

/// Le dipendenze stanno in `[[dependencies.<modId>]]`. Il lookup e'
/// case-insensitive (alcuni mod dichiarano `modId = "MyMod"` e
/// `[[dependencies.mymod]]`) e considera TUTTI i modId dichiarati nel jar.
/// Se nessuna chiave combacia ma la tabella non e' vuota, le entry vengono usate
/// comunque (con warning): meglio una dipendenza in piu' che una verifica muta.
fn forge_dependencies(
    value: &toml::Value,
    ids: &[String],
    spec: &ForgeSpec,
    warnings: &mut Vec<String>,
) -> Vec<ModDependency> {
    let table = match value.get("dependencies").and_then(|d| d.as_table()) {
        Some(t) if !t.is_empty() => t,
        _ => return Vec::new(),
    };

    // `[[dependencies.x]]` = array di tabelle; alcuni mod scrivono `[dependencies.x]`
    // (tabella singola): accettiamo entrambe le forme.
    let entries_of = |v: &toml::Value| -> Vec<ModDependency> {
        if let Some(arr) = v.as_array() {
            arr.iter().filter_map(toml_dep).collect()
        } else if v.is_table() {
            toml_dep(v).into_iter().collect()
        } else {
            Vec::new()
        }
    };

    let mut deps: Vec<ModDependency> = Vec::new();
    let mut saw_mandatory = false;
    let mut saw_type = false;

    let mut matched = false;
    for (key, entry) in table {
        if ids.iter().any(|id| id.eq_ignore_ascii_case(key)) {
            matched = true;
            let (has_type, has_mandatory) = declared_dep_style(entry);
            saw_type |= has_type;
            saw_mandatory |= has_mandatory;
            merge_deps(&mut deps, entries_of(entry));
        }
    }

    if !matched {
        let keys: Vec<&str> = table.keys().map(|k| k.as_str()).collect();
        warnings.push(format!(
            "Dependencies are declared under a different mod id ({}): used anyway.",
            keys.join(", ")
        ));
        for entry in table.values() {
            let (has_type, has_mandatory) = declared_dep_style(entry);
            saw_type |= has_type;
            saw_mandatory |= has_mandatory;
            merge_deps(&mut deps, entries_of(entry));
        }
    }

    // Diagnostica: stile di dichiarazione non allineato alla versione del progetto.
    if let Some(expected) = spec.dep_style {
        let found = match (saw_type, saw_mandatory) {
            (true, false) => Some(DepStyle::Type),
            (false, true) => Some(DepStyle::Mandatory),
            _ => None, // nessuno dei due, oppure entrambi: niente da segnalare
        };
        if let Some(found) = found {
            if found != expected {
                warnings.push(format!(
                    "Dependencies declared with `{}` while `{}` is expected for the project's Minecraft version.",
                    forge_spec::dep_style_label(found),
                    forge_spec::dep_style_label(expected)
                ));
            }
        }
    }

    deps
}

/// Lettura permissiva di `chiave = "valore"` da un TOML non parsabile: serve a
/// non perdere del tutto i metadati dei jar con `mods.toml` malformato.
fn lenient_toml_value(toml_str: &str, key: &str) -> Option<String> {
    for line in toml_str.lines() {
        let line = line.trim();
        let rest = match line.strip_prefix(key) {
            Some(rest) => rest.trim_start(),
            None => continue,
        };
        let rest = match rest.strip_prefix('=') {
            Some(rest) => rest.trim(),
            None => continue,
        };
        let value = rest
            .trim_matches(|c| c == '"' || c == '\'')
            .trim()
            .to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

/// Parsing dei mods.toml di Forge/NeoForge (stesso schema).
fn parse_forge(
    filename: &str,
    modloader: &str,
    format: &str,
    toml_str: &str,
    manifest: Option<&str>,
    spec: &ForgeSpec,
) -> ScannedMod {
    let mut scanned = empty_mod(filename, modloader, format);

    let value = match toml_str.parse::<toml::Value>() {
        Ok(v) => v,
        Err(err) => {
            // TOML rotto: estrazione permissiva riga per riga invece di perdere tutto.
            scanned.warnings.push(format!(
                "{} is not valid TOML ({}): metadata read in lenient mode.",
                format, err
            ));
            let mod_id = lenient_toml_value(toml_str, "modId").unwrap_or_default();
            let name = lenient_toml_value(toml_str, "displayName").unwrap_or_else(|| {
                if mod_id.is_empty() {
                    filename.to_string()
                } else {
                    mod_id.clone()
                }
            });
            let version = lenient_toml_value(toml_str, "version").unwrap_or_default();
            scanned.version = resolve_version(version, manifest, &mut scanned.warnings);
            scanned.mod_id = mod_id;
            scanned.name = name;
            return scanned;
        }
    };

    let entries: Vec<&toml::Value> = value
        .get("mods")
        .and_then(|m| m.as_array())
        .map(|arr| arr.iter().collect())
        .unwrap_or_default();

    if entries.len() > 1 {
        scanned.warnings.push(format!(
            "Jar declares {} mods: the first one is shown (all ids are still used for dependency checks).",
            entries.len()
        ));
    }

    let first = entries.first().copied();
    let get = |key: &str| {
        first
            .and_then(|m| m.get(key))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    scanned.mod_id = get("modId").unwrap_or_default();
    scanned.name = get("displayName").unwrap_or_else(|| {
        if scanned.mod_id.is_empty() {
            filename.to_string()
        } else {
            scanned.mod_id.clone()
        }
    });
    if scanned.mod_id.is_empty() {
        scanned
            .warnings
            .push(format!("No mod id declared in {}.", format));
    }

    scanned.version = resolve_version(
        get("version").unwrap_or_default(),
        manifest,
        &mut scanned.warnings,
    );
    scanned.description = get("description");
    scanned.authors = first
        .and_then(|m| m.get("authors"))
        .map(authors_from_toml)
        .unwrap_or_default();

    // Tutti i modId dichiarati: servono per il lookup delle dipendenze.
    let ids: Vec<String> = entries
        .iter()
        .filter_map(|m| m.get("modId").and_then(|v| v.as_str()))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    scanned.dependencies = forge_dependencies(&value, &ids, spec, &mut scanned.warnings);

    scanned
}

// ---------------------------------------------------------------------------
// Forge <= 1.12.2 — mcmod.info
// ---------------------------------------------------------------------------

/// Le entry di un `mcmod.info`: array in radice oppure `{ modListVersion, modList: [...] }`.
fn mcmod_entries(value: &JsonValue) -> Vec<&JsonValue> {
    if let Some(arr) = value.as_array() {
        return arr.iter().collect();
    }
    if let Some(arr) = value.get("modList").and_then(|m| m.as_array()) {
        return arr.iter().collect();
    }
    if value.is_object() {
        return vec![value];
    }
    Vec::new()
}

/// Una entry di `dependencies`/`requiredMods` in mcmod.info, es.
///   "jei"                          dipendenza semplice
///   "jei@[4.15.0,)"                con range di versione
///   "required-after:jei@[4.15.0,)" con prefisso di ordinamento FML
/// `default_mandatory` vale quando il prefisso non dice nulla: `requiredMods`
/// e' obbligatoria per definizione, `dependencies` esprime solo l'ordine di
/// caricamento (quindi non obbligatoria salvo prefisso `required`).
fn parse_legacy_dep(raw: &str, default_mandatory: bool) -> Option<ModDependency> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    let mut mandatory = default_mandatory;
    let mut rest = raw;

    if let Some((prefix, tail)) = raw.split_once(':') {
        let prefix = prefix.trim().to_ascii_lowercase();
        let is_ordering = !prefix.is_empty()
            && prefix
                .split('-')
                .all(|seg| matches!(seg, "required" | "after" | "before"));
        if is_ordering {
            mandatory = prefix.contains("required");
            rest = tail;
        }
    }

    let (name, version) = match rest.split_once('@') {
        Some((name, version)) => (name.trim(), version.trim()),
        None => (rest.trim(), ""),
    };
    if name.is_empty() || name == "*" {
        return None;
    }

    Some(ModDependency {
        name: name.to_string(),
        version: version.to_string(),
        mandatory,
    })
}

/// Dipendenze legacy da un campo array di stringhe.
fn legacy_deps(entry: &JsonValue, field: &str, default_mandatory: bool) -> Vec<ModDependency> {
    entry
        .get(field)
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .filter_map(|s| parse_legacy_dep(s, default_mandatory))
                .collect()
        })
        .unwrap_or_default()
}

/// Parsing di mcmod.info (Forge <= 1.12.2).
fn parse_mcmod_info(filename: &str, json_str: &str, manifest: Option<&str>) -> ScannedMod {
    let mut scanned = empty_mod(filename, "forge", "forge:mcmod.info");

    let value: JsonValue = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(err) => {
            scanned.warnings.push(format!(
                "mcmod.info is not valid JSON ({}): only the filename is available.",
                err
            ));
            return scanned;
        }
    };

    let entries = mcmod_entries(&value);
    if entries.is_empty() {
        scanned
            .warnings
            .push("mcmod.info contains no mod entry.".to_string());
        return scanned;
    }
    if entries.len() > 1 {
        scanned.warnings.push(format!(
            "mcmod.info declares {} mods: the first one is shown (all ids are still used for dependency checks).",
            entries.len()
        ));
    }

    let first = entries[0];
    let text = |key: &str| {
        first
            .get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    scanned.mod_id = text("modid").or_else(|| text("modId")).unwrap_or_default();
    scanned.name = text("name").unwrap_or_else(|| {
        if scanned.mod_id.is_empty() {
            filename.to_string()
        } else {
            scanned.mod_id.clone()
        }
    });
    if scanned.mod_id.is_empty() {
        scanned
            .warnings
            .push("No mod id declared in mcmod.info.".to_string());
    }

    // In legacy il placeholder tipico è `${version}` (sostituito da Gradle).
    scanned.version = resolve_version(
        text("version").unwrap_or_default(),
        manifest,
        &mut scanned.warnings,
    );
    scanned.description = text("description");
    // Nel legacy il vincolo MC non e' una dipendenza ma un campo suo.
    scanned.mc_version = text("mcversion");

    // authorList (standard) oppure authors (usato da alcuni mod).
    scanned.authors = ["authorList", "authors"]
        .iter()
        .filter_map(|key| first.get(*key))
        .filter_map(|v| v.as_array())
        .flat_map(|arr| arr.iter().filter_map(|v| v.as_str()))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    // requiredMods = obbligatorie; dependencies = ordine di caricamento.
    let mut deps: Vec<ModDependency> = Vec::new();
    for entry in &entries {
        merge_deps(&mut deps, legacy_deps(entry, "requiredMods", true));
        merge_deps(&mut deps, legacy_deps(entry, "dependencies", false));
    }
    scanned.dependencies = deps;

    scanned
}

// ---------------------------------------------------------------------------
// Fabric / Quilt
// ---------------------------------------------------------------------------

/// Parsing di fabric.mod.json.
fn parse_fabric(filename: &str, json_str: &str) -> ScannedMod {
    let mut scanned = empty_mod(filename, "fabric", "fabric:fabric.mod.json");

    let v: JsonValue = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(err) => {
            scanned.warnings.push(format!(
                "fabric.mod.json is not valid JSON ({}): only the filename is available.",
                err
            ));
            return scanned;
        }
    };

    scanned.mod_id = v
        .get("id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    scanned.name = v
        .get("name")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if scanned.mod_id.is_empty() {
                filename.to_string()
            } else {
                scanned.mod_id.clone()
            }
        });
    scanned.version = v
        .get("version")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    scanned.description = v
        .get("description")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|d| !d.is_empty());

    // authors: array di stringhe oppure di oggetti { name }
    scanned.authors = v
        .get("authors")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| {
                    x.as_str().map(|s| s.to_string()).or_else(|| {
                        x.get("name")
                            .and_then(|n| n.as_str())
                            .map(|s| s.to_string())
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    // depends: oggetto { modId: versionRange } (tutte obbligatorie)
    scanned.dependencies = v
        .get("depends")
        .and_then(|d| d.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, val)| ModDependency {
                    name: k.clone(),
                    version: val.as_str().unwrap_or("").to_string(),
                    mandatory: true,
                })
                .collect()
        })
        .unwrap_or_default();

    scanned
}

/// Parsing di quilt.mod.json (dati sotto "quilt_loader").
fn parse_quilt(filename: &str, json_str: &str) -> ScannedMod {
    let mut scanned = empty_mod(filename, "quilt", "quilt:quilt.mod.json");

    let v: JsonValue = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(err) => {
            scanned.warnings.push(format!(
                "quilt.mod.json is not valid JSON ({}): only the filename is available.",
                err
            ));
            return scanned;
        }
    };
    let loader = v.get("quilt_loader");

    scanned.mod_id = loader
        .and_then(|q| q.get("id"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    scanned.version = loader
        .and_then(|q| q.get("version"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let metadata = loader.and_then(|q| q.get("metadata"));
    scanned.name = metadata
        .and_then(|m| m.get("name"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if scanned.mod_id.is_empty() {
                filename.to_string()
            } else {
                scanned.mod_id.clone()
            }
        });
    scanned.description = metadata
        .and_then(|m| m.get("description"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|d| !d.is_empty());

    // contributors: oggetto { "Nome": "Ruolo" } -> teniamo i nomi
    scanned.authors = metadata
        .and_then(|m| m.get("contributors"))
        .and_then(|c| c.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();

    // depends: array di stringhe oppure di oggetti { id, versions, optional }
    scanned.dependencies = loader
        .and_then(|q| q.get("depends"))
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|dep| {
                    if let Some(s) = dep.as_str() {
                        return Some(ModDependency {
                            name: s.to_string(),
                            version: "*".to_string(),
                            mandatory: true,
                        });
                    }
                    let name = dep.get("id").and_then(|x| x.as_str())?.to_string();
                    let version = dep
                        .get("versions")
                        .and_then(|x| x.as_str())
                        .unwrap_or("*")
                        .to_string();
                    let optional = dep
                        .get("optional")
                        .and_then(|x| x.as_bool())
                        .unwrap_or(false);
                    Some(ModDependency {
                        name,
                        version,
                        mandatory: !optional,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    scanned
}

// --- Raccolta dei modId forniti (per la verifica delle dipendenze) ---

fn provided_from_toml(toml_str: &str) -> Vec<String> {
    let value = match toml_str.parse::<toml::Value>() {
        Ok(v) => v,
        Err(_) => {
            // TOML rotto: recupera almeno il modId in modo permissivo.
            return lenient_toml_value(toml_str, "modId").into_iter().collect();
        }
    };
    let mut ids = Vec::new();
    if let Some(arr) = value.get("mods").and_then(|m| m.as_array()) {
        for entry in arr {
            if let Some(id) = entry.get("modId").and_then(|v| v.as_str()) {
                ids.push(id.to_string());
            }
            if let Some(provides) = entry.get("provides").and_then(|v| v.as_array()) {
                for p in provides {
                    if let Some(s) = p.as_str() {
                        ids.push(s.to_string());
                    }
                }
            }
        }
    }
    ids
}

/// modId forniti da un mcmod.info (tutte le entry della lista).
fn provided_from_mcmod_info(json_str: &str) -> Vec<String> {
    let value: JsonValue = serde_json::from_str(json_str).unwrap_or(JsonValue::Null);
    mcmod_entries(&value)
        .iter()
        .filter_map(|entry| {
            entry
                .get("modid")
                .or_else(|| entry.get("modId"))
                .and_then(|v| v.as_str())
        })
        .map(|s| s.to_string())
        .collect()
}

fn provided_from_fabric(json_str: &str) -> Vec<String> {
    let v: JsonValue = serde_json::from_str(json_str).unwrap_or(JsonValue::Null);
    let mut ids = Vec::new();
    if let Some(id) = v.get("id").and_then(|x| x.as_str()) {
        ids.push(id.to_string());
    }
    if let Some(arr) = v.get("provides").and_then(|x| x.as_array()) {
        for x in arr {
            if let Some(s) = x.as_str() {
                ids.push(s.to_string());
            }
        }
    }
    ids
}

fn provided_from_quilt(json_str: &str) -> Vec<String> {
    let v: JsonValue = serde_json::from_str(json_str).unwrap_or(JsonValue::Null);
    let loader = v.get("quilt_loader");
    let mut ids = Vec::new();
    if let Some(id) = loader.and_then(|q| q.get("id")).and_then(|x| x.as_str()) {
        ids.push(id.to_string());
    }
    if let Some(arr) = loader
        .and_then(|q| q.get("provides"))
        .and_then(|x| x.as_array())
    {
        for x in arr {
            if let Some(s) = x.as_str() {
                ids.push(s.to_string());
            } else if let Some(s) = x.get("id").and_then(|i| i.as_str()) {
                ids.push(s.to_string());
            }
        }
    }
    ids
}

/// modId forniti dai metadati propri di un archivio (qualunque loader/versione).
fn collect_provides<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Vec<String> {
    if let Some(s) = read_entry(archive, NEOFORGE_TOML) {
        return provided_from_toml(&s);
    }
    if let Some(s) = read_entry(archive, FORGE_TOML) {
        return provided_from_toml(&s);
    }
    if let Some(s) = read_entry(archive, QUILT_JSON) {
        return provided_from_quilt(&s);
    }
    if let Some(s) = read_entry(archive, FABRIC_JSON) {
        return provided_from_fabric(&s);
    }
    if let Some(s) = read_entry(archive, MCMOD_INFO) {
        return provided_from_mcmod_info(&s);
    }
    Vec::new()
}

/// modId forniti dalle dipendenze incluse nel jar (META-INF/jarjar/*.jar).
fn collect_jarjar_provides<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Vec<String> {
    let nested: Vec<String> = archive
        .file_names()
        .filter(|n| n.starts_with("META-INF/jarjar/") && n.ends_with(".jar"))
        .map(|s| s.to_string())
        .collect();

    let mut ids = Vec::new();
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
            ids.extend(collect_provides(&mut inner));
        }
    }
    ids
}

// ---------------------------------------------------------------------------
// Lettura di un jar
// ---------------------------------------------------------------------------

/// Fallback per i jar senza metadati riconosciuti: prova il MANIFEST.MF.
fn unknown_mod(filename: &str, manifest: Option<&str>) -> ScannedMod {
    let mut scanned = empty_mod(filename, "unknown", "unknown");

    if let Some(manifest) = manifest {
        let title = manifest_field(manifest, "Implementation-Title")
            .or_else(|| manifest_field(manifest, "Specification-Title"));
        if let Some(title) = title {
            scanned.name = title;
            scanned.format = "unknown:manifest".to_string();
        }
        if let Some(version) = manifest_version(manifest) {
            scanned.version = version;
        }
    }

    scanned.warnings.push(
        "No known mod metadata (mods.toml, mcmod.info, fabric.mod.json, quilt.mod.json) was found."
            .to_string(),
    );
    scanned
}

/// Apre un singolo .jar e ne estrae i metadati nel formato del loader trovato.
/// `spec` e' il formato ATTESO per la versione MC del progetto: usato come
/// tie-break e per la diagnostica, mai come unica fonte di verita'. `keybind_api`
/// e' l'API keybind attesa per quella versione (solo diagnostica: le classi SDK
/// vengono cercate tutte, vedi `keybind_scan`). `mc` e' la versione MC del
/// progetto, contro cui si verifica il vincolo dichiarato dalla mod.
fn read_mod(
    path: &Path,
    spec: &ForgeSpec,
    keybind_api: Option<KeybindApi>,
    mc: Option<&str>,
) -> ScannedMod {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(err) => {
            let mut scanned = empty_mod(&filename, "unknown", "unreadable");
            scanned
                .warnings
                .push(format!("The file could not be opened ({}).", err));
            return scanned;
        }
    };
    let mut archive = match ZipArchive::new(file) {
        Ok(a) => a,
        Err(err) => {
            let mut scanned = empty_mod(&filename, "unknown", "unreadable");
            scanned
                .warnings
                .push(format!("The jar is not a valid ZIP archive ({}).", err));
            return scanned;
        }
    };

    // Elenco delle entry: il rilevamento del formato guarda cosa c'e' DAVVERO nel jar.
    let names: Vec<String> = archive.file_names().map(|n| n.to_string()).collect();
    let has = |wanted: &str| names.iter().any(|n| n == wanted);

    let has_neoforge = has(NEOFORGE_TOML);
    let has_forge_toml = has(FORGE_TOML);
    let has_mcmod = has(MCMOD_INFO);
    let has_quilt = has(QUILT_JSON);
    let has_fabric = has(FABRIC_JSON);

    // I jar "universali" possono contenere sia mcmod.info sia mods.toml: in quel
    // caso decide il formato atteso per la versione di Minecraft del progetto.
    let prefer_legacy = has_mcmod && (!has_forge_toml || spec.meta == MetaFormat::McmodInfo);

    let mut scanned = if has_neoforge {
        let toml_str = read_entry(&mut archive, NEOFORGE_TOML).unwrap_or_default();
        let manifest = read_entry(&mut archive, MANIFEST);
        parse_forge(
            &filename,
            "neoforge",
            "neoforge:mods.toml",
            &toml_str,
            manifest.as_deref(),
            spec,
        )
    } else if prefer_legacy {
        let json_str = read_entry(&mut archive, MCMOD_INFO).unwrap_or_default();
        let manifest = read_entry(&mut archive, MANIFEST);
        parse_mcmod_info(&filename, &json_str, manifest.as_deref())
    } else if has_forge_toml {
        let toml_str = read_entry(&mut archive, FORGE_TOML).unwrap_or_default();
        let manifest = read_entry(&mut archive, MANIFEST);
        parse_forge(
            &filename,
            "forge",
            "forge:mods.toml",
            &toml_str,
            manifest.as_deref(),
            spec,
        )
    } else if has_quilt {
        let json_str = read_entry(&mut archive, QUILT_JSON).unwrap_or_default();
        parse_quilt(&filename, &json_str)
    } else if has_fabric {
        let json_str = read_entry(&mut archive, FABRIC_JSON).unwrap_or_default();
        parse_fabric(&filename, &json_str)
    } else {
        let manifest = read_entry(&mut archive, MANIFEST);
        unknown_mod(&filename, manifest.as_deref())
    };

    // Jar che contiene entrambi i formati Forge: segnalalo (l'altro è ignorato).
    if has_mcmod && has_forge_toml {
        scanned.warnings.push(format!(
            "Jar contains both mcmod.info and mods.toml: {} was used, matching the project's Minecraft version.",
            forge_spec::meta_label(if prefer_legacy {
                MetaFormat::McmodInfo
            } else {
                MetaFormat::ModsToml
            })
        ));
    } else if scanned.modloader == "forge" || scanned.modloader == "neoforge" {
        // Formato Forge non allineato alla versione MC del progetto: tipico dei
        // jar copiati nella cartella mods sbagliata.
        let found = if has_mcmod {
            MetaFormat::McmodInfo
        } else {
            MetaFormat::ModsToml
        };
        if found != spec.meta && spec.dep_style.is_some() {
            scanned.warnings.push(format!(
                "Metadata format {} found, but {} is expected for the project's Minecraft version (profile {}).",
                forge_spec::meta_label(found),
                forge_spec::meta_label(spec.meta),
                spec.id
            ));
        }
    }

    // Compatibilita' con la versione MC del progetto. Il vincolo sta nella
    // dipendenza verso `minecraft` (Forge/NeoForge/Fabric/Quilt) oppure nel campo
    // `mcversion` (legacy, gia' letto dal parser). Un vincolo assente o in una
    // sintassi non riconosciuta resta `None`: si mostra "sconosciuto", non un
    // falso allarme.
    if scanned.mc_version.is_none() {
        scanned.mc_version = mc_compat::constraint_from_deps(
            scanned
                .dependencies
                .iter()
                .map(|d| (d.name.as_str(), d.version.as_str())),
        );
    }
    if let (Some(constraint), Some(project_mc)) = (scanned.mc_version.as_deref(), mc) {
        scanned.mc_compatible = mc_compat::matches(constraint, project_mc);
        if scanned.mc_compatible == Some(false) {
            scanned.warnings.push(format!(
                "Declares Minecraft {} but the project targets {}.",
                constraint, project_mc
            ));
        }
    }

    // modId forniti: propri + provides + dipendenze incluse (JarJar).
    let mut provides = collect_provides(&mut archive);
    provides.extend(collect_jarjar_provides(&mut archive));
    provides
        .iter_mut()
        .for_each(|id| *id = id.trim().to_lowercase());
    provides.retain(|id| !id.is_empty());
    provides.sort();
    provides.dedup();
    scanned.provides = provides;

    // Keybind della mod: lette nella stessa apertura del jar (un solo I/O).
    //
    // Su Forge/NeoForge si guarda anche il BYTECODE: le classi che usano l'API
    // keybind (`KeyBinding`/`KeyMapping`, vedi `keybind_scan`) dichiarano le
    // chiavi di traduzione come stringhe costanti, quindi l'incrocio con i lang
    // da' keybind CERTE invece che indovinate dal nome. Su Fabric/Quilt le classi
    // Minecraft sono in intermediary: la' resta la sola euristica sui lang.
    let uses_forge_api = matches!(scanned.modloader.as_str(), "forge" | "neoforge" | "unknown");
    let bytecode = if uses_forge_api {
        keybind_scan::scan_bytecode(&mut archive)
    } else {
        keybind_scan::BytecodeScan::default()
    };

    let langs = collect_lang_docs(&mut archive, spec);
    // Il warning sui lang mancanti ha senso solo se il jar dichiara keybind: per
    // le mod senza keybind l'assenza di lang inglesi non e' un problema.
    let expects_keybinds = if uses_forge_api {
        bytecode.uses_keybind_api()
    } else {
        true
    };
    if langs.is_empty() && expects_keybinds {
        scanned.warnings.push(
            "No English language file (en_us.json / en_US.lang) found: keybinds cannot be detected."
                .to_string(),
        );
    }
    if bytecode.truncated {
        scanned.warnings.push(format!(
            "Bytecode scan stopped after {} classes: some keybinds may be missing.",
            bytecode.classes
        ));
    }
    // Era della classe keybind diversa da quella attesa per la versione MC del
    // progetto: segnale tipico di un jar compilato per un'altra versione.
    if let Some(expected) = keybind_api {
        let expected_era = forge_spec::keybind_era(expected);
        if !bytecode.eras.is_empty() && !bytecode.eras.contains(&expected_era) {
            let found = bytecode
                .eras
                .iter()
                .map(|era| forge_spec::keybind_era_label(*era))
                .collect::<Vec<_>>()
                .join(", ");
            scanned.warnings.push(format!(
                "Keybinds use {}, but the project's Minecraft version expects {}: the jar may target a different Minecraft version.",
                found,
                forge_spec::keybind_era_label(expected_era)
            ));
        }
    }
    scanned.keybinds = keybinds_from_langs(&langs, &bytecode.candidates);

    scanned
}

/// Comando Tauri: scansiona una directory restituendo i metadati di tutti i .jar.
/// `mc` (versione di Minecraft del progetto) e `forge` (versione del loader) sono
/// hint opzionali: selezionano il profilo di formato atteso (vedi `forge_spec`).
///
/// I jar vengono letti su piu' THREAD: la lettura del bytecode per le keybind
/// aggiunge decompressione, e i jar sono indipendenti tra loro. L'ordine finale e'
/// sempre alfabetico, quindi il risultato non dipende dallo scheduling.
#[tauri::command]
pub fn scan_mods(
    dir: String,
    mc: Option<String>,
    forge: Option<String>,
) -> Result<Vec<ScannedMod>, String> {
    let spec = forge_spec::spec_for(mc.as_deref(), forge.as_deref());
    let keybind_api = forge_spec::keybind_api_for(mc.as_deref(), forge.as_deref());
    // `&str` invece di `Option<String>`: e' Copy, quindi ogni thread lo cattura
    // senza consumare `mc` (che serve a tutti i chunk).
    let mc_hint: Option<&str> = mc.as_deref();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let paths: Vec<std::path::PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("jar"))
                .unwrap_or(false)
        })
        .collect();

    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2)
        .clamp(1, 8);
    let chunk_size = paths.len().div_ceil(threads).max(1);

    let mut mods: Vec<ScannedMod> = std::thread::scope(|scope| {
        let handles: Vec<_> = paths
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .map(|p| read_mod(p, spec, keybind_api, mc_hint))
                        .collect::<Vec<ScannedMod>>()
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().unwrap_or_default())
            .collect()
    });

    mods.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(mods)
}

// --- Scansione dei datapack ---
//
// Un datapack è un file .zip (o una cartella) con un `pack.mcmeta` alla radice:
//   { "pack": { "pack_format": <n>, "description": <string|text-component> } }
// La `description` può essere una stringa semplice o un "text component" JSON
// (oggetto con `text`/`extra`, o un array di componenti): la appiattiamo a testo.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedDatapack {
    pub filename: String,
    pub name: String,
    pub description: Option<String>,
    pub pack_format: Option<i64>,
}

/// Appiattisce un "text component" di Minecraft (stringa, oggetto {text, extra},
/// o array di componenti) in testo semplice.
fn text_component_to_string(v: &JsonValue) -> String {
    match v {
        JsonValue::String(s) => s.clone(),
        JsonValue::Array(arr) => arr.iter().map(text_component_to_string).collect(),
        JsonValue::Object(obj) => {
            let mut out = String::new();
            if let Some(t) = obj.get("text").and_then(|x| x.as_str()) {
                out.push_str(t);
            }
            if let Some(extra) = obj.get("extra").and_then(|x| x.as_array()) {
                for e in extra {
                    out.push_str(&text_component_to_string(e));
                }
            }
            out
        }
        _ => String::new(),
    }
}

/// Estrae `description` (testo) e `pack_format` da un pack.mcmeta.
fn parse_pack_mcmeta(content: &str) -> (Option<String>, Option<i64>) {
    let v: JsonValue = serde_json::from_str(content).unwrap_or(JsonValue::Null);
    let pack = v.get("pack");
    let pack_format = pack
        .and_then(|p| p.get("pack_format"))
        .and_then(|x| x.as_i64());
    let description = pack
        .and_then(|p| p.get("description"))
        .map(|d| text_component_to_string(d).trim().to_string())
        .filter(|s| !s.is_empty());
    (description, pack_format)
}

/// Legge un singolo datapack (file .zip o cartella con pack.mcmeta). Ritorna
/// `None` se l'entry non è un datapack valido (nessun pack.mcmeta).
fn read_datapack(path: &Path) -> Option<ScannedDatapack> {
    let filename = path.file_name().and_then(|n| n.to_str())?.to_string();

    if path.is_dir() {
        // Cartella datapack: pack.mcmeta letto dal disco.
        let content = fs::read_to_string(path.join("pack.mcmeta")).ok()?;
        let (description, pack_format) = parse_pack_mcmeta(&content);
        Some(ScannedDatapack {
            filename: filename.clone(),
            name: filename,
            description,
            pack_format,
        })
    } else {
        // File .zip: pack.mcmeta letto dall'archivio.
        let is_zip = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("zip"))
            .unwrap_or(false);
        if !is_zip {
            return None;
        }
        let file = fs::File::open(path).ok()?;
        let mut archive = ZipArchive::new(file).ok()?;
        let content = read_entry(&mut archive, "pack.mcmeta")?;
        let (description, pack_format) = parse_pack_mcmeta(&content);
        // Nome senza estensione .zip.
        let name = if filename.to_lowercase().ends_with(".zip") {
            filename[..filename.len() - 4].to_string()
        } else {
            filename.clone()
        };
        Some(ScannedDatapack {
            filename,
            name,
            description,
            pack_format,
        })
    }
}

/// Comando Tauri: scansiona una directory restituendo i datapack (.zip o
/// cartelle) con pack.mcmeta. Errore se la dir non esiste (il frontend lo usa
/// per mostrare lo stato "cartella non trovata").
#[tauri::command]
pub fn scan_datapacks(dir: String) -> Result<Vec<ScannedDatapack>, String> {
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut packs: Vec<ScannedDatapack> = entries
        .flatten()
        .map(|e| e.path())
        .filter_map(|p| read_datapack(&p))
        .collect();

    packs.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(packs)
}

// --- Scansione delle keybind (azioni configurabili) definite da ogni mod ---
//
// Le keybind di una mod sono chiavi di traduzione nei file di lingua:
//   - MC >= 1.13   `assets/<modid>/lang/en_us.json`  (oggetto JSON piatto)
//   - MC <= 1.12.2 `assets/<modid>/lang/en_US.lang`  (properties `chiave=testo`)
// NON tutte iniziano con `key.`: i mod usano prefissi molto diversi, es.
//   key.jei.toggleOverlay        (vanilla-style)
//   cos.key.opencosarmorinventory / create_radar.key.binocular.fire
//   create.keyinfo.toolbelt / railways.keyinfo.* / tfmg.keyinfo.*
//   iris.keybind.reload / keybind.simplyjetpacks.jetpack_hover
//   mod.chiselsandbits.keys.key.undo
// Riconosciamo una keybind se la chiave contiene un SEGMENTO marcatore
// (key/keys/keybind/keybinds/keyinfo/keymapping), escludendo i titoli di
// categoria (`.categories.`).
// LIMITE noto: alcuni mod usano nomi senza alcun marcatore (es.
// `config.jsg.address_down`, `placebo.toggleTrails`): NON sono distinguibili
// dalle altre traduzioni leggendo solo i lang, quindi non vengono raccolti dallo
// scan generico (per quelle chiavi c'è `resolve_keybind_labels`, match esatto).
//
// I lang sono letti DENTRO `read_mod` (keybind embeddate in `ScannedMod.keybinds`),
// così ogni jar viene aperto una sola volta per metadati + keybind.

/// Un file di lingua letto da un jar, con il suo formato.
struct LangDoc {
    kind: LangKind,
    content: String,
}

/// True se la chiave di traduzione `k` è (verosimilmente) una keybind.
fn is_keybind_key(k: &str) -> bool {
    // Esclude i titoli di categoria della schermata Controls (non azioni), in
    // entrambi i formati: `key.categories.*` e `key.category.<ns>.<path>` (1.21.9+).
    if keybind_scan::is_category_key(k) {
        return false;
    }
    // Un segmento della chiave è un marcatore di keybind.
    k.split('.').any(|seg| {
        matches!(
            seg,
            "key" | "keys" | "keybind" | "keybinds" | "keyinfo" | "keymapping"
        )
    })
}

/// Riconosce un file di lingua inglese e il suo formato dal path nello zip.
/// Il confronto è case-insensitive: in legacy il file è `en_US.lang`.
fn lang_kind_of(name: &str) -> Option<LangKind> {
    if !name.starts_with("assets/") {
        return None;
    }
    let lower = name.to_ascii_lowercase();
    if lower.ends_with("/lang/en_us.json") {
        return Some(LangKind::Json);
    }
    if lower.ends_with("/lang/en_us.lang") {
        return Some(LangKind::Properties);
    }
    None
}

/// Coppie (chiave, testo) di un file di lingua, secondo il suo formato.
fn lang_entries(doc: &LangDoc) -> Vec<(String, String)> {
    match doc.kind {
        LangKind::Json => {
            let json: JsonValue = match serde_json::from_str(&doc.content) {
                Ok(v) => v,
                Err(_) => return Vec::new(),
            };
            match json.as_object() {
                Some(obj) => obj
                    .iter()
                    .map(|(k, v)| {
                        let label = v.as_str().filter(|s| !s.is_empty()).unwrap_or(k);
                        (k.clone(), label.to_string())
                    })
                    .collect(),
                None => Vec::new(),
            }
        }
        // Formato properties: `chiave=testo`, commenti con `#`, BOM possibile.
        LangKind::Properties => doc
            .content
            .lines()
            .filter_map(|line| {
                let line = line.trim_start_matches('\u{feff}').trim();
                if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
                    return None;
                }
                let (key, value) = line.split_once('=')?;
                let key = key.trim();
                if key.is_empty() {
                    return None;
                }
                let value = value.trim();
                let label = if value.is_empty() { key } else { value };
                Some((key.to_string(), label.to_string()))
            })
            .collect(),
    }
}

/// Ritorna i file di lingua inglese del jar (JSON e/o properties), INCLUSI quelli
/// nei JarJar annidati (`META-INF/jarjar/*.jar`, un livello di profondità). Serve
/// perché alcuni mod bundlano librerie con proprie keybind: es. Create include
/// Ponder (`key.ponder.ponder`) come JarJar.
/// L'ordine mette per primo il formato atteso dal profilo (`spec.lang`), così in
/// caso di jar con entrambi i formati vince quello coerente con la versione MC.
fn collect_lang_docs<R: Read + Seek>(archive: &mut ZipArchive<R>, spec: &ForgeSpec) -> Vec<LangDoc> {
    let mut out: Vec<LangDoc> = Vec::new();

    // Lang top-level (raccogliere i nomi PRIMA: file_names() borrowa l'archivio).
    let top: Vec<(String, LangKind)> = archive
        .file_names()
        .filter_map(|n| lang_kind_of(n).map(|kind| (n.to_string(), kind)))
        .collect();
    for (name, kind) in top {
        if let Some(content) = read_entry(archive, &name) {
            out.push(LangDoc { kind, content });
        }
    }

    // Lang dei JarJar annidati.
    let nested: Vec<String> = archive
        .file_names()
        .filter(|n| n.starts_with("META-INF/jarjar/") && n.ends_with(".jar"))
        .map(|s| s.to_string())
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
            let inner_langs: Vec<(String, LangKind)> = inner
                .file_names()
                .filter_map(|n| lang_kind_of(n).map(|kind| (n.to_string(), kind)))
                .collect();
            for (name, kind) in inner_langs {
                if let Some(content) = read_entry(&mut inner, &name) {
                    out.push(LangDoc { kind, content });
                }
            }
        }
    }

    // Formato atteso prima (sort stabile: mantiene l'ordine dentro ogni gruppo).
    out.sort_by_key(|doc| if doc.kind == spec.lang { 0 } else { 1 });
    out
}

/// Estrae le keybind dai file di lingua già letti, incrociandoli con le chiavi
/// dichiarate nel BYTECODE (`candidates`, vedi `keybind_scan`):
///   - chiave presente tra le candidate  -> keybind CERTA (`source = bytecode`),
///     anche se il nome non ha nessun marcatore (`placebo.toggleTrails`);
///   - altrimenti si ricade sull'euristica sul nome (`source = lang`).
///
/// Dedup per chiave (vince il primo lang, cioè il formato atteso dal profilo),
/// ordinate per label.
fn keybinds_from_langs(langs: &[LangDoc], candidates: &HashSet<String>) -> Vec<KeybindAction> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut keybinds: Vec<KeybindAction> = Vec::new();

    for doc in langs {
        for (key, label) in lang_entries(doc) {
            let source = if candidates.contains(&key) {
                KeybindSource::Bytecode
            } else if is_keybind_key(&key) {
                KeybindSource::Lang
            } else {
                continue;
            };
            if !seen.insert(key.clone()) {
                continue; // dedup per chiave (namespace/lang multipli)
            }
            keybinds.push(KeybindAction { key, label, source });
        }
    }

    keybinds.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    keybinds
}

/// modId principale del jar, riusando la stessa cascata di detection loader di
/// `read_mod` (il primo id fornito dai metadati è il modId principale).
fn read_mod_id<R: Read + Seek>(archive: &mut ZipArchive<R>) -> String {
    collect_provides(archive).into_iter().next().unwrap_or_default()
}

// --- Risoluzione mirata di label/mod per chiavi di traduzione note ---
//
// A differenza dello scan generico (che deve INDOVINARE quali chiavi lang sono
// keybind), qui riceviamo le chiavi ESATTE (es. gli actionKey di un
// keybindprofiles.json importato) e le cerchiamo per match esatto nei lang di
// ogni jar. Così risolviamo anche le keybind con nomi senza marcatore
// (`config.jsg.*`, `placebo.toggle*`) senza rischio di falsi positivi.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedKeybind {
    pub key: String,
    pub label: String,
    pub mod_id: String,
}

/// Comando Tauri: per ogni chiave richiesta trova (match esatto) la label dal
/// file di lingua inglese (`en_us.json` o `en_US.lang`) e il modId del jar che la
/// definisce. Le chiavi non trovate vengono semplicemente omesse. `mc`/`forge`
/// sono gli stessi hint di `scan_mods` (ordine di lettura dei lang).
#[tauri::command]
pub fn resolve_keybind_labels(
    dir: String,
    keys: Vec<String>,
    mc: Option<String>,
    forge: Option<String>,
) -> Result<Vec<ResolvedKeybind>, String> {
    let spec = forge_spec::spec_for(mc.as_deref(), forge.as_deref());
    let wanted: HashSet<String> = keys.into_iter().collect();
    if wanted.is_empty() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    // key -> (label, modId). Il primo jar che definisce la chiave vince.
    let mut resolved: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new();

    let jars = entries.flatten().map(|e| e.path()).filter(|p| {
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("jar"))
            .unwrap_or(false)
    });

    for path in jars {
        let file = match fs::File::open(&path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let mut archive = match ZipArchive::new(file) {
            Ok(a) => a,
            Err(_) => continue,
        };
        let mod_id = read_mod_id(&mut archive);

        // Legge i lang top-level + quelli dei JarJar annidati (es. Ponder dentro
        // Create), in entrambi i formati, così risolve anche le keybind bundlate.
        for doc in collect_lang_docs(&mut archive, spec) {
            for (key, label) in lang_entries(&doc) {
                if !wanted.contains(&key) || resolved.contains_key(&key) {
                    continue;
                }
                resolved.insert(key, (label, mod_id.clone()));
            }
        }
    }

    Ok(resolved
        .into_iter()
        .map(|(key, (label, mod_id))| ResolvedKeybind { key, label, mod_id })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::forge_spec::{FML, LEGACY};

    #[test]
    fn dipendenze_legacy_con_prefisso_di_ordinamento() {
        let dep = parse_legacy_dep("required-after:jei@[4.15.0,)", false).unwrap();
        assert_eq!(dep.name, "jei");
        assert_eq!(dep.version, "[4.15.0,)");
        assert!(dep.mandatory);

        let dep = parse_legacy_dep("after:baubles", true).unwrap();
        assert_eq!(dep.name, "baubles");
        assert!(!dep.mandatory, "`after:` non implica obbligatorieta'");

        let dep = parse_legacy_dep("forge@[14.23.5,)", true).unwrap();
        assert_eq!(dep.name, "forge");
        assert!(dep.mandatory, "requiredMods: obbligatoria per default");

        assert!(parse_legacy_dep("  ", true).is_none());
        assert!(parse_legacy_dep("*", true).is_none());
    }

    #[test]
    fn mcmod_info_array_e_modlist() {
        let json = r#"[{
            "modid": "tconstruct",
            "name": "Tinkers' Construct",
            "version": "2.13.0",
            "description": "Modify all the things",
            "authorList": ["mDiyo", "boni"],
            "requiredMods": ["mantle@[1.12,)"],
            "dependencies": ["after:jei"]
        }]"#;
        let m = parse_mcmod_info("tconstruct.jar", json, None);
        assert_eq!(m.mod_id, "tconstruct");
        assert_eq!(m.name, "Tinkers' Construct");
        assert_eq!(m.version, "2.13.0");
        assert_eq!(m.modloader, "forge");
        assert_eq!(m.format, "forge:mcmod.info");
        assert_eq!(m.authors, vec!["mDiyo", "boni"]);
        assert_eq!(m.dependencies.len(), 2);
        assert!(m.dependencies.iter().any(|d| d.name == "mantle" && d.mandatory));
        assert!(m.dependencies.iter().any(|d| d.name == "jei" && !d.mandatory));
        assert!(m.warnings.is_empty());

        let wrapped = r#"{ "modListVersion": 2, "modList": [{ "modid": "x", "name": "X" }] }"#;
        assert_eq!(parse_mcmod_info("x.jar", wrapped, None).mod_id, "x");
        assert_eq!(provided_from_mcmod_info(wrapped), vec!["x"]);
    }

    #[test]
    fn versione_legacy_dal_manifest() {
        let json = r#"[{ "modid": "x", "version": "${version}" }]"#;
        let manifest = "Manifest-Version: 1.0\nImplementation-Version: 1.4.2\n";
        let m = parse_mcmod_info("x.jar", json, Some(manifest));
        assert_eq!(m.version, "1.4.2");
        assert!(m.warnings.is_empty());
    }

    #[test]
    fn dipendenze_toml_case_insensitive() {
        let toml_str = r#"
            modLoader = "javafml"
            [[mods]]
            modId = "MyMod"
            displayName = "My Mod"
            version = "1.0.0"
            [[dependencies.mymod]]
            modId = "jei"
            mandatory = true
            versionRange = "[10,)"
        "#;
        let m = parse_forge("m.jar", "forge", "forge:mods.toml", toml_str, None, &FML);
        assert_eq!(m.mod_id, "MyMod");
        assert_eq!(m.dependencies.len(), 1);
        assert_eq!(m.dependencies[0].name, "jei");
        assert!(m.warnings.is_empty(), "warnings inattesi: {:?}", m.warnings);
    }

    #[test]
    fn toml_malformato_ripiega_su_lettura_permissiva() {
        let toml_str = "[[mods]]\nmodId = \"broken\"\ndisplayName = \"Broken\"\nversion = \"1.0\"\nquesta riga non e' TOML";
        let m = parse_forge("b.jar", "forge", "forge:mods.toml", toml_str, None, &FML);
        assert_eq!(m.mod_id, "broken");
        assert_eq!(m.name, "Broken");
        assert_eq!(m.version, "1.0");
        assert!(m.warnings.iter().any(|w| w.contains("lenient")));
    }

    #[test]
    fn segnala_stile_dipendenze_non_allineato() {
        let toml_str = r#"
            [[mods]]
            modId = "x"
            [[dependencies.x]]
            modId = "jei"
            type = "required"
        "#;
        // Profilo 1.13-1.20.4 (attende `mandatory =`) ma il jar usa `type =`.
        let m = parse_forge("x.jar", "forge", "forge:mods.toml", toml_str, None, &FML);
        assert!(m.warnings.iter().any(|w| w.contains("type =")));
    }

    #[test]
    fn lang_properties_e_json() {
        let props = LangDoc {
            kind: LangKind::Properties,
            content: "# commento\nkey.tconstruct.book=Open Book\nitem.foo.name=Foo\n\n".to_string(),
        }
        .into_entries();
        assert!(props.contains(&("key.tconstruct.book".into(), "Open Book".into())));
        assert!(props.contains(&("item.foo.name".into(), "Foo".into())));
        assert_eq!(props.len(), 2);

        let json = LangDoc {
            kind: LangKind::Json,
            content: r#"{ "key.jei.toggle": "Toggle", "key.categories.jei": "JEI" }"#.to_string(),
        }
        .into_entries();
        assert_eq!(json.len(), 2);

        let keybinds = keybinds_from_langs(
            &[LangDoc {
                kind: LangKind::Properties,
                content:
                    "key.tconstruct.book=Open Book\nkey.categories.tconstruct=Tinkers\nitem.x.name=X"
                        .to_string(),
            }],
            &HashSet::new(),
        );
        assert_eq!(keybinds.len(), 1, "categorie e traduzioni normali escluse");
        assert_eq!(keybinds[0].key, "key.tconstruct.book");
        assert_eq!(keybinds[0].label, "Open Book");
        assert_eq!(keybinds[0].source, KeybindSource::Lang);
    }

    #[test]
    fn le_chiavi_dal_bytecode_vincono_sull_euristica_del_nome() {
        let langs = [LangDoc {
            kind: LangKind::Json,
            content: r#"{
                "placebo.toggleTrails": "Toggle Trails",
                "key.placebo.other": "Other",
                "gui.placebo.press.key": "Press a key",
                "key.category.placebo.main": "Placebo"
            }"#
            .to_string(),
        }];
        // Solo la prima chiave e' dichiarata nel bytecode.
        let candidates: HashSet<String> = ["placebo.toggleTrails".to_string()].into_iter().collect();
        let keybinds = keybinds_from_langs(&langs, &candidates);

        let by_key = |k: &str| keybinds.iter().find(|kb| kb.key == k);
        // Nome senza marcatore: la trova solo grazie al bytecode.
        assert_eq!(
            by_key("placebo.toggleTrails").map(|kb| kb.source),
            Some(KeybindSource::Bytecode)
        );
        // Nome con marcatore ma non nel bytecode: resta un'euristica.
        assert_eq!(
            by_key("key.placebo.other").map(|kb| kb.source),
            Some(KeybindSource::Lang)
        );
        // La categoria in formato 1.21.9+ (`key.category.<ns>.<path>`) non e' un'azione.
        assert!(by_key("key.category.placebo.main").is_none());
        // `gui.placebo.press.key` passa l'euristica (segmento "key"): e' il tipo di
        // falso positivo che il bytecode permette di distinguere via `source`.
        assert_eq!(
            by_key("gui.placebo.press.key").map(|kb| kb.source),
            Some(KeybindSource::Lang)
        );
    }

    #[test]
    fn decodifica_lang_non_utf8_e_con_bom() {
        // "Café" in ISO-8859-1: byte 0xE9 non e' UTF-8 valido.
        let latin1 = vec![
            b'k', b'e', b'y', b'.', b'x', b'.', b'a', b'=', b'C', b'a', b'f', 0xE9,
        ];
        let text = decode_text(latin1);
        assert_eq!(text, "key.x.a=Café");

        let with_bom = [vec![0xEF, 0xBB, 0xBF], b"{\"a\":1}".to_vec()].concat();
        assert_eq!(decode_text(with_bom), "{\"a\":1}");
    }

    #[test]
    fn ordine_lang_segue_il_profilo() {
        let docs = [
            LangDoc {
                kind: LangKind::Json,
                content: r#"{ "key.x.a": "Json" }"#.to_string(),
            },
            LangDoc {
                kind: LangKind::Properties,
                content: "key.x.a=Properties".to_string(),
            },
        ];
        // Profilo legacy: vince il .lang; profilo moderno: vince il .json.
        let mut legacy_first = docs.iter().map(|d| d.kind).collect::<Vec<_>>();
        legacy_first.sort_by_key(|k| if *k == LEGACY.lang { 0 } else { 1 });
        assert_eq!(legacy_first[0], LangKind::Properties);
        let mut modern_first = docs.iter().map(|d| d.kind).collect::<Vec<_>>();
        modern_first.sort_by_key(|k| if *k == FML.lang { 0 } else { 1 });
        assert_eq!(modern_first[0], LangKind::Json);
    }

    // Helper di test: LangDoc da &str + entries.
    impl LangDoc {
        fn into_entries(self) -> Vec<(String, String)> {
            lang_entries(&self)
        }
    }

    /// Scrive un .jar (zip) di prova con le entry indicate.
    fn write_jar(dir: &Path, name: &str, files: &[(&str, &str)]) {
        let binary: Vec<(&str, Vec<u8>)> = files
            .iter()
            .map(|(p, c)| (*p, c.as_bytes().to_vec()))
            .collect();
        write_jar_bytes(dir, name, &binary);
    }

    /// Come `write_jar`, ma con entry binarie (serve per i `.class`).
    fn write_jar_bytes(dir: &Path, name: &str, files: &[(&str, Vec<u8>)]) {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let file = fs::File::create(dir.join(name)).expect("creazione jar di test");
        let mut zip = zip::ZipWriter::new(file);
        for (path, content) in files {
            zip.start_file(*path, SimpleFileOptions::default()).unwrap();
            zip.write_all(content).unwrap();
        }
        zip.finish().unwrap();
    }

    /// Scansione completa (zip reale su disco) di un jar Forge legacy e di uno
    /// moderno, con progetto dichiarato su 1.12.2.
    #[test]
    fn scansione_end_to_end_legacy_e_moderno() {
        let dir = std::env::temp_dir().join(format!("fmp-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        write_jar(
            &dir,
            "legacy.jar",
            &[
                (
                    "mcmod.info",
                    r#"[{"modid":"tconstruct","name":"Tinkers' Construct","version":"2.13.0",
                        "authorList":["mDiyo"],"requiredMods":["mantle@[1.12,)"],
                        "dependencies":["after:jei"]}]"#,
                ),
                (
                    "assets/tconstruct/lang/en_US.lang",
                    "# commento\nkey.tconstruct.book=Open Book\nkey.categories.tconstruct=Tinkers\nitem.foo.name=Foo\n",
                ),
            ],
        );
        write_jar(
            &dir,
            "modern.jar",
            &[
                (
                    "META-INF/mods.toml",
                    "[[mods]]\nmodId=\"jei\"\ndisplayName=\"Just Enough Items\"\nversion=\"15.2.0\"\n\n[[dependencies.jei]]\nmodId=\"forge\"\nmandatory=true\nversionRange=\"[47,)\"\n",
                ),
                (
                    "assets/jei/lang/en_us.json",
                    r#"{"key.jei.toggleOverlay":"Toggle Overlay"}"#,
                ),
            ],
        );

        let path = dir.to_string_lossy().to_string();
        let mods = scan_mods(path.clone(), Some("1.12.2".into()), None).unwrap();
        assert_eq!(mods.len(), 2);

        let legacy = mods.iter().find(|m| m.filename == "legacy.jar").unwrap();
        assert_eq!(legacy.mod_id, "tconstruct");
        assert_eq!(legacy.name, "Tinkers' Construct");
        assert_eq!(legacy.version, "2.13.0");
        assert_eq!(legacy.modloader, "forge");
        assert_eq!(legacy.format, "forge:mcmod.info");
        assert_eq!(legacy.provides, vec!["tconstruct"]);
        assert_eq!(legacy.dependencies.len(), 2);
        assert!(legacy
            .dependencies
            .iter()
            .any(|d| d.name == "mantle" && d.mandatory));
        assert_eq!(legacy.keybinds.len(), 1, "solo la keybind, non le altre lang");
        assert_eq!(legacy.keybinds[0].key, "key.tconstruct.book");
        assert_eq!(legacy.keybinds[0].label, "Open Book");
        assert!(legacy.warnings.is_empty(), "warnings: {:?}", legacy.warnings);

        let modern = mods.iter().find(|m| m.filename == "modern.jar").unwrap();
        assert_eq!(modern.mod_id, "jei");
        assert_eq!(modern.name, "Just Enough Items");
        assert_eq!(modern.keybinds.len(), 1);
        assert_eq!(modern.format, "forge:mods.toml");
        // Il progetto è su 1.12.2 ma il jar è 1.13+: segnalato in diagnostica.
        assert!(
            modern.warnings.iter().any(|w| w.contains("mods.toml")),
            "atteso warning di formato: {:?}",
            modern.warnings
        );

        // Compatibilita' MC: il legacy dichiara `mcversion` (e il progetto e'
        // proprio su quella versione), il moderno non dichiara nulla su
        // minecraft, quindi resta non verificabile.
        assert_eq!(legacy.mc_version, None, "questo mcmod.info non ha mcversion");
        assert_eq!(legacy.mc_compatible, None);
        assert_eq!(modern.mc_version, None, "nessuna dipendenza su minecraft");
        assert_eq!(modern.mc_compatible, None);

        // Risoluzione mirata: trova una chiave SENZA marcatore dentro un .lang.
        let resolved = resolve_keybind_labels(
            path.clone(),
            vec!["item.foo.name".into()],
            Some("1.12.2".into()),
            None,
        )
        .unwrap();
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].label, "Foo");
        assert_eq!(resolved[0].mod_id, "tconstruct");

        fs::remove_dir_all(&dir).ok();
    }

    /// Keybind dichiarate nel bytecode: chiave senza marcatore riconosciuta, e
    /// diagnostica quando l'era della classe keybind non e' quella della versione
    /// Verifica della compatibilita' con la versione MC del progetto: il vincolo
    /// arriva dalla dipendenza verso `minecraft` (moderni) o da `mcversion`
    /// (legacy), e chi non lo dichiara NON diventa "incompatibile".
    #[test]
    fn verifica_compatibilita_versione_mc() {
        let dir = std::env::temp_dir().join(format!("fmp-mccompat-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        write_jar(
            &dir,
            "ok.jar",
            &[(
                "META-INF/mods.toml",
                "[[mods]]\nmodId=\"jei\"\ndisplayName=\"JEI\"\nversion=\"15.2.0\"\n\n[[dependencies.jei]]\nmodId=\"minecraft\"\nmandatory=true\nversionRange=\"[1.20.1,1.21)\"\n",
            )],
        );
        write_jar(
            &dir,
            "vecchia.jar",
            &[(
                "META-INF/mods.toml",
                "[[mods]]\nmodId=\"old\"\ndisplayName=\"Old\"\nversion=\"1.0\"\n\n[[dependencies.old]]\nmodId=\"minecraft\"\nmandatory=true\nversionRange=\"[1.19.2,1.20)\"\n",
            )],
        );
        write_jar(
            &dir,
            "fabric.jar",
            &[(
                "fabric.mod.json",
                r#"{"id":"sodium","name":"Sodium","version":"0.5.8","depends":{"minecraft":">=1.20.1 <1.21"}}"#,
            )],
        );
        write_jar(
            &dir,
            "muta.jar",
            &[(
                "META-INF/mods.toml",
                "[[mods]]\nmodId=\"quiet\"\ndisplayName=\"Quiet\"\nversion=\"1.0\"\n",
            )],
        );

        let path = dir.to_string_lossy().to_string();
        let mods = scan_mods(path, Some("1.20.1".into()), None).unwrap();
        let get = |name: &str| mods.iter().find(|m| m.filename == name).unwrap();

        let ok = get("ok.jar");
        assert_eq!(ok.mc_version.as_deref(), Some("[1.20.1,1.21)"));
        assert_eq!(ok.mc_compatible, Some(true));
        assert!(
            !ok.warnings.iter().any(|w| w.contains("targets")),
            "nessun avviso di versione: {:?}",
            ok.warnings
        );

        let vecchia = get("vecchia.jar");
        assert_eq!(vecchia.mc_compatible, Some(false));
        assert!(
            vecchia
                .warnings
                .iter()
                .any(|w| w.contains("Declares Minecraft [1.19.2,1.20)") && w.contains("1.20.1")),
            "atteso avviso di incompatibilita': {:?}",
            vecchia.warnings
        );

        // Fabric: dialetto diverso, stessa verifica.
        let fabric = get("fabric.jar");
        assert_eq!(fabric.mc_version.as_deref(), Some(">=1.20.1 <1.21"));
        assert_eq!(fabric.mc_compatible, Some(true));

        // Chi non dichiara nulla resta "sconosciuto", non incompatibile.
        let muta = get("muta.jar");
        assert_eq!(muta.mc_version, None);
        assert_eq!(muta.mc_compatible, None);

        // Senza versione MC nel progetto non si verifica niente.
        let senza_hint = scan_mods(dir.to_string_lossy().to_string(), None, None).unwrap();
        assert!(senza_hint.iter().all(|m| m.mc_compatible.is_none()));

        let _ = fs::remove_dir_all(&dir);
    }

    /// MC del progetto.
    #[test]
    fn scansione_keybind_dal_bytecode() {
        use crate::class_scan::test_support::class_file;

        let dir = std::env::temp_dir().join(format!("fmp-bytecode-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // Mod 1.16 (classe `KeyBinding`) con una keybind dal nome non standard.
        write_jar_bytes(
            &dir,
            "placebo.jar",
            &[
                (
                    "META-INF/mods.toml",
                    b"[[mods]]\nmodId=\"placebo\"\ndisplayName=\"Placebo\"\nversion=\"4.6.0\"\n".to_vec(),
                ),
                (
                    "assets/placebo/lang/en_us.json",
                    br#"{"placebo.toggleTrails":"Toggle Trails","gui.placebo.hold.key":"Hold key"}"#
                        .to_vec(),
                ),
                (
                    "shadows/placebo/PlaceboClient.class",
                    class_file(
                        &[
                            "net/minecraft/client/settings/KeyBinding",
                            "net/minecraftforge/fml/client/registry/ClientRegistry",
                        ],
                        &["placebo.toggleTrails"],
                    ),
                ),
            ],
        );

        // Progetto su 1.20.1: si aspetta `KeyMapping`, il jar usa `KeyBinding`.
        let mods = scan_mods(
            dir.to_string_lossy().to_string(),
            Some("1.20.1".into()),
            Some("47.2.0".into()),
        )
        .unwrap();
        let m = mods.iter().find(|m| m.filename == "placebo.jar").unwrap();

        let toggle = m
            .keybinds
            .iter()
            .find(|k| k.key == "placebo.toggleTrails")
            .expect("keybind senza marcatore trovata grazie al bytecode");
        assert_eq!(toggle.label, "Toggle Trails");
        assert_eq!(toggle.source, KeybindSource::Bytecode);

        // La traduzione con segmento "key" resta un'euristica, distinguibile.
        let hold = m
            .keybinds
            .iter()
            .find(|k| k.key == "gui.placebo.hold.key")
            .expect("euristica sul nome ancora attiva");
        assert_eq!(hold.source, KeybindSource::Lang);

        assert!(
            m.warnings
                .iter()
                .any(|w| w.contains("KeyBinding") && w.contains("KeyMapping")),
            "atteso warning sull'era della classe keybind: {:?}",
            m.warnings
        );

        fs::remove_dir_all(&dir).ok();
    }

    /// Il warning sui lang mancanti si emette solo per i jar che dichiarano
    /// keybind: una mod senza keybind non deve generare rumore in diagnostica.
    #[test]
    fn nessun_warning_lang_per_le_mod_senza_keybind() {
        use crate::class_scan::test_support::class_file;

        let dir = std::env::temp_dir().join(format!("fmp-nolang-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        write_jar_bytes(
            &dir,
            "plain.jar",
            &[
                (
                    "META-INF/mods.toml",
                    b"[[mods]]\nmodId=\"plain\"\ndisplayName=\"Plain\"\nversion=\"1.0\"\n".to_vec(),
                ),
                (
                    "com/plain/Main.class",
                    class_file(&["java/lang/Object"], &["plain.something"]),
                ),
            ],
        );
        write_jar_bytes(
            &dir,
            "bound.jar",
            &[
                (
                    "META-INF/mods.toml",
                    b"[[mods]]\nmodId=\"bound\"\ndisplayName=\"Bound\"\nversion=\"1.0\"\n".to_vec(),
                ),
                (
                    "com/bound/Keys.class",
                    class_file(&["net/minecraft/client/KeyMapping"], &["key.bound.jump"]),
                ),
            ],
        );

        let mods = scan_mods(
            dir.to_string_lossy().to_string(),
            Some("1.20.1".into()),
            None,
        )
        .unwrap();

        let plain = mods.iter().find(|m| m.filename == "plain.jar").unwrap();
        assert!(
            !plain.warnings.iter().any(|w| w.contains("language file")),
            "mod senza keybind: nessun warning sui lang ({:?})",
            plain.warnings
        );

        let bound = mods.iter().find(|m| m.filename == "bound.jar").unwrap();
        assert!(
            bound.warnings.iter().any(|w| w.contains("language file")),
            "mod con keybind e senza lang: warning atteso ({:?})",
            bound.warnings
        );

        fs::remove_dir_all(&dir).ok();
    }

}
