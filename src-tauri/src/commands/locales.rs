//! Dossier des langues de l’utilisateur : `<données de l’app>/locales/*.json`
//! (ajout ou correction d’une traduction sans recompiler l’éditeur).

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::msg::ui;
use serde_json::json;

const TEMPLATE_SUFFIX: &str = ".modele.json";

fn locales_dir(app_data_dir: &str) -> PathBuf {
    Path::new(app_data_dir).join("locales")
}

/// `{ code: contenu }` des fichiers `<code>.json` (le modèle exporté est ignoré).
#[tauri::command]
pub fn read_user_locales(app_data_dir: String) -> Result<BTreeMap<String, String>, String> {
    read_user_locales_inner(&locales_dir(&app_data_dir))
}

pub fn read_user_locales_inner(dir: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut out = BTreeMap::new();
    if !dir.is_dir() {
        return Ok(out);
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if !name.ends_with(".json") || name.ends_with(TEMPLATE_SUFFIX) || !path.is_file() {
            continue;
        }
        let code = name.trim_end_matches(".json").to_string();
        let text = fs::read_to_string(&path).map_err(|e| format!("{name}: {e}"))?;
        out.insert(code, text.trim_start_matches('\u{feff}').to_string());
    }
    Ok(out)
}

/// Écrit le modèle (langue de base) dans le dossier des langues, le crée au
/// besoin, et renvoie le chemin du modèle.
#[tauri::command]
pub fn write_locale_template(app_data_dir: String, code: String, content: String) -> Result<String, String> {
    if code.is_empty() || !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(ui("locales.invalidCode", json!({ "code": code })));
    }
    let dir = locales_dir(&app_data_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{code}{TEMPLATE_SUFFIX}"));
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_locales_but_not_template() {
        let dir = std::env::temp_dir().join(format!("tfui_locales_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("en.json"), "\u{feff}{\"a\":\"b\"}").unwrap();
        fs::write(dir.join("fr.modele.json"), "{}").unwrap();
        fs::write(dir.join("notes.txt"), "x").unwrap();
        let got = read_user_locales_inner(&dir).unwrap();
        assert_eq!(got.keys().collect::<Vec<_>>(), vec!["en"]);
        assert_eq!(got["en"], "{\"a\":\"b\"}");
        let _ = fs::remove_dir_all(&dir);
    }
}
