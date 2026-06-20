// Scansione della cartella `mods` di un modpack: ogni .jar viene aperto come
// archivio ZIP e i metadati estratti dal formato del rispettivo mod loader.
//   - Forge    -> META-INF/mods.toml
//   - NeoForge -> META-INF/neoforge.mods.toml (stesso schema TOML di Forge)
//   - Fabric   -> fabric.mod.json
//   - Quilt    -> quilt.mod.json (annidato sotto "quilt_loader")
// Per i jar senza metadati riconosciuti viene comunque restituita una riga con
// il solo filename (loader "unknown").
//
// Per la verifica delle dipendenze ogni mod espone `provides`: l'elenco di TUTTI
// i modId che il jar mette a disposizione, considerando piu' `[[mods]]`, il campo
// `provides` e soprattutto le dipendenze incluse (JarJar in META-INF/jarjar/),
// molto comuni su Forge.

use std::fs;
use std::io::{Cursor, Read, Seek};
use std::path::Path;

use serde::Serialize;
use serde_json::Value as JsonValue;
use zip::ZipArchive;

#[derive(Serialize)]
pub struct ModDependency {
    pub name: String,
    pub version: String,
    pub mandatory: bool,
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
}

/// Legge il contenuto testuale di una entry dello zip, se presente.
fn read_entry<R: Read + Seek>(archive: &mut ZipArchive<R>, name: &str) -> Option<String> {
    let mut file = archive.by_name(name).ok()?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).ok()?;
    Some(contents)
}

/// Estrae `Implementation-Version` dal MANIFEST.MF (usato da Forge per
/// risolvere il placeholder `${file.jarVersion}`).
fn manifest_version(manifest: &str) -> Option<String> {
    for line in manifest.lines() {
        if let Some(rest) = line.strip_prefix("Implementation-Version:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

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
/// nuovo) oppure `mandatory=true` (formato classico, default true).
fn forge_dep_mandatory(dep: &toml::Value) -> bool {
    if let Some(kind) = dep.get("type").and_then(|v| v.as_str()) {
        return kind.eq_ignore_ascii_case("required");
    }
    dep.get("mandatory").and_then(|v| v.as_bool()).unwrap_or(true)
}

/// Parsing dei mods.toml di Forge/NeoForge (stesso schema).
fn parse_forge(
    filename: &str,
    modloader: &str,
    toml_str: &str,
    manifest: Option<&str>,
) -> ScannedMod {
    let value = toml_str
        .parse::<toml::Value>()
        .unwrap_or_else(|_| toml::Value::Table(Default::default()));

    let first = value
        .get("mods")
        .and_then(|m| m.as_array())
        .and_then(|arr| arr.first());

    let get = |key: &str| {
        first
            .and_then(|m| m.get(key))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
    };

    let mod_id = get("modId").unwrap_or_default();
    let name = get("displayName").unwrap_or_else(|| mod_id.clone());

    let mut version = get("version").unwrap_or_default();
    if version.is_empty() || version.contains("${file.jarVersion}") {
        if let Some(v) = manifest.and_then(manifest_version) {
            version = v;
        }
    }

    let description = get("description").filter(|d| !d.is_empty());

    let authors = first
        .and_then(|m| m.get("authors"))
        .map(authors_from_toml)
        .unwrap_or_default();

    // dependencies.<modId> = array di tabelle { modId, versionRange, mandatory/type }
    let dependencies = value
        .get("dependencies")
        .and_then(|d| d.get(&mod_id))
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|dep| {
                    let name = dep.get("modId").and_then(|v| v.as_str())?.to_string();
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
                })
                .collect()
        })
        .unwrap_or_default();

    ScannedMod {
        filename: filename.to_string(),
        mod_id,
        name,
        modloader: modloader.to_string(),
        version,
        description,
        authors,
        dependencies,
        provides: Vec::new(),
    }
}

/// Parsing di fabric.mod.json.
fn parse_fabric(filename: &str, json_str: &str) -> ScannedMod {
    let v: JsonValue = serde_json::from_str(json_str).unwrap_or(JsonValue::Null);

    let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| id.clone());
    let version = v
        .get("version")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let description = v
        .get("description")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|d| !d.is_empty());

    // authors: array di stringhe oppure di oggetti { name }
    let authors = v
        .get("authors")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| {
                    x.as_str().map(|s| s.to_string()).or_else(|| {
                        x.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    // depends: oggetto { modId: versionRange } (tutte obbligatorie)
    let dependencies = v
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

    ScannedMod {
        filename: filename.to_string(),
        mod_id: id,
        name,
        modloader: "fabric".to_string(),
        version,
        description,
        authors,
        dependencies,
        provides: Vec::new(),
    }
}

/// Parsing di quilt.mod.json (dati sotto "quilt_loader").
fn parse_quilt(filename: &str, json_str: &str) -> ScannedMod {
    let v: JsonValue = serde_json::from_str(json_str).unwrap_or(JsonValue::Null);
    let loader = v.get("quilt_loader");

    let id = loader
        .and_then(|q| q.get("id"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let version = loader
        .and_then(|q| q.get("version"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let metadata = loader.and_then(|q| q.get("metadata"));
    let name = metadata
        .and_then(|m| m.get("name"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| id.clone());
    let description = metadata
        .and_then(|m| m.get("description"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|d| !d.is_empty());

    // contributors: oggetto { "Nome": "Ruolo" } -> teniamo i nomi
    let authors = metadata
        .and_then(|m| m.get("contributors"))
        .and_then(|c| c.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();

    // depends: array di stringhe oppure di oggetti { id, versions, optional }
    let dependencies = loader
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
                    let optional = dep.get("optional").and_then(|x| x.as_bool()).unwrap_or(false);
                    Some(ModDependency {
                        name,
                        version,
                        mandatory: !optional,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    ScannedMod {
        filename: filename.to_string(),
        mod_id: id,
        name,
        modloader: "quilt".to_string(),
        version,
        description,
        authors,
        dependencies,
        provides: Vec::new(),
    }
}

// --- Raccolta dei modId forniti (per la verifica delle dipendenze) ---

fn provided_from_toml(toml_str: &str) -> Vec<String> {
    let value = match toml_str.parse::<toml::Value>() {
        Ok(v) => v,
        Err(_) => return Vec::new(),
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
    if let Some(arr) = loader.and_then(|q| q.get("provides")).and_then(|x| x.as_array()) {
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

/// modId forniti dai metadati propri di un archivio (qualunque loader).
fn collect_provides<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Vec<String> {
    if let Some(s) = read_entry(archive, "META-INF/neoforge.mods.toml") {
        return provided_from_toml(&s);
    }
    if let Some(s) = read_entry(archive, "META-INF/mods.toml") {
        return provided_from_toml(&s);
    }
    if let Some(s) = read_entry(archive, "quilt.mod.json") {
        return provided_from_quilt(&s);
    }
    if let Some(s) = read_entry(archive, "fabric.mod.json") {
        return provided_from_fabric(&s);
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

/// Apre un singolo .jar e ne estrae i metadati nel formato del loader trovato.
fn read_mod(path: &Path) -> ScannedMod {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let unknown = |filename: &str| ScannedMod {
        filename: filename.to_string(),
        mod_id: String::new(),
        name: filename.to_string(),
        modloader: "unknown".to_string(),
        version: String::new(),
        description: None,
        authors: Vec::new(),
        dependencies: Vec::new(),
        provides: Vec::new(),
    };

    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return unknown(&filename),
    };
    let mut archive = match ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return unknown(&filename),
    };

    // Metadati principali (per le colonne della tabella).
    let mut scanned = if let Some(s) = read_entry(&mut archive, "META-INF/neoforge.mods.toml") {
        let manifest = read_entry(&mut archive, "META-INF/MANIFEST.MF");
        parse_forge(&filename, "neoforge", &s, manifest.as_deref())
    } else if let Some(s) = read_entry(&mut archive, "META-INF/mods.toml") {
        let manifest = read_entry(&mut archive, "META-INF/MANIFEST.MF");
        parse_forge(&filename, "forge", &s, manifest.as_deref())
    } else if let Some(s) = read_entry(&mut archive, "quilt.mod.json") {
        parse_quilt(&filename, &s)
    } else if let Some(s) = read_entry(&mut archive, "fabric.mod.json") {
        parse_fabric(&filename, &s)
    } else {
        unknown(&filename)
    };

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

    scanned
}

/// Comando Tauri: scansiona una directory restituendo i metadati di tutti i .jar.
#[tauri::command]
pub fn scan_mods(dir: String) -> Result<Vec<ScannedMod>, String> {
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut mods: Vec<ScannedMod> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("jar"))
                .unwrap_or(false)
        })
        .map(|p| read_mod(&p))
        .collect();

    mods.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(mods)
}
