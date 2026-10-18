//! Copie permanente des ressources du jeu utilisées par l’éditeur (polices,
//! images de l’interface), dans `<données de l’app>/game-cache/`, et
//! empreinte de version de l’installation (métadonnées seulement).

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::msg::ui;
use serde_json::json;

/// Fichiers dont la taille et la date identifient une version du jeu.
const FINGERPRINT_FILES: &[&str] = &[
    "TransportFever3.exe",
    "base/content/gui.zip",
    "base/content/locale.zip",
    "base/content/scripts.zip",
    "base/tealdef/scripts/builtin.d.tl",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintEntry {
    pub path: String,
    pub size: u64,
    pub modified_ms: u64,
}

/// Empreinte de version : taille + date de quelques fichiers clés (aucun
/// hachage de gros fichier). Fichier absent : taille et date à 0.
#[tauri::command]
pub fn game_fingerprint(tf3_root: String) -> Vec<FingerprintEntry> {
    let root = Path::new(tf3_root.trim());
    FINGERPRINT_FILES
        .iter()
        .map(|rel| {
            let meta = fs::metadata(root.join(rel)).ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified_ms = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            FingerprintEntry { path: (*rel).to_string(), size, modified_ms }
        })
        .collect()
}

/// Chemin dans le cache, refusé s’il sort du dossier (`..`, absolu).
fn cache_path(app_data_dir: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(ui("cache.invalidPath", json!({ "path": rel })));
    }
    Ok(Path::new(app_data_dir).join("game-cache").join(rel_path))
}

/// Lit un fichier du cache (octets bruts) ; erreur s’il est absent.
#[tauri::command]
pub fn read_cache_file(app_data_dir: String, rel: String) -> Result<tauri::ipc::Response, String> {
    let path = cache_path(&app_data_dir, &rel)?;
    let bytes = fs::read(&path).map_err(|_| ui("cache.missing", json!({ "path": rel })))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Écrit un fichier du cache : octets bruts dans le corps, en-têtes
/// `x-app-data-dir` et `x-rel` (encodés URI).
#[tauri::command]
pub fn write_cache_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let header = |name: &str| -> Result<String, String> {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(super::fs_project::percent_decode)
            .ok_or_else(|| ui("cache.missingHeader", json!({ "name": name })))
    };
    let path = cache_path(&header("x-app-data-dir")?, &header("x-rel")?)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(ui("io.binaryBodyExpected", json!({})));
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| ui("cache.mkdir", json!({ "error": e.to_string() })))?;
    }
    fs::write(&path, bytes).map_err(|e| ui("cache.write", json!({ "error": e.to_string() })))
}

/// Vide le cache (mise à jour du jeu).
#[tauri::command]
pub fn clear_game_cache(app_data_dir: String) -> Result<(), String> {
    let dir = Path::new(&app_data_dir).join("game-cache");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| ui("cache.remove", json!({ "error": e.to_string() })))?;
    }
    Ok(())
}
