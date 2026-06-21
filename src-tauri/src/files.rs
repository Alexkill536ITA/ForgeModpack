// Lettura ricorsiva dell'albero di una directory del modpack (es. `config`,
// `kubejs`), usata dal File Explorer della sezione "Documents". Restituisce una
// struttura ad albero (cartelle con figli, file foglia) ordinata con le cartelle
// prima dei file e alfabeticamente. La lettura/scrittura del CONTENUTO dei file
// avviene invece lato frontend via `@tauri-apps/plugin-fs`.

use std::fs;
use std::path::Path;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    /// Nome dell'elemento (ultimo segmento del path).
    pub name: String,
    /// Path assoluto, usato dal frontend per leggere/scrivere il file.
    pub path: String,
    pub is_dir: bool,
    /// Figli ordinati (solo per le cartelle); `None` per i file.
    pub children: Option<Vec<FileNode>>,
}

/// Legge ricorsivamente il contenuto di una directory. I symlink non vengono
/// seguiti come cartelle (evita cicli) e sono trattati come elementi foglia.
fn read_tree(dir: &Path) -> Result<Vec<FileNode>, String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

    let mut nodes: Vec<FileNode> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        // file_type() non segue i symlink: una cartella-symlink risulta non-dir.
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        let children = if is_dir {
            Some(read_tree(&path).unwrap_or_default())
        } else {
            None
        };

        nodes.push(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }

    // Cartelle prima dei file, poi ordine alfabetico (case-insensitive).
    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(nodes)
}

/// Comando Tauri: restituisce l'albero dei file di `dir`. Errore se la directory
/// non esiste (il frontend lo gestisce per non mostrare la cartella assente).
#[tauri::command]
pub fn read_dir_tree(dir: String) -> Result<Vec<FileNode>, String> {
    let path = Path::new(&dir);
    if !path.is_dir() {
        return Err(format!("Not a directory: {dir}"));
    }
    read_tree(path)
}
