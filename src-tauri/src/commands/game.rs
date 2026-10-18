use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use zip::ZipArchive;

use super::msg::ui;
use serde_json::json;

const DEFAULT_TF3_ROOT: &str = r"C:\Program Files (x86)\Steam\steamapps\common\Transport Fever 3";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRootCheck {
    pub ok: bool,
    pub tf3_root: String,
    pub builtin_path: String,
    pub message: String,
}

fn builtin_path_for(tf3_root: &Path) -> PathBuf {
    tf3_root
        .join("base")
        .join("tealdef")
        .join("scripts")
        .join("builtin.d.tl")
}

fn check_root(tf3_root: &Path) -> GameRootCheck {
    let builtin = builtin_path_for(tf3_root);
    let root_str = tf3_root.display().to_string();
    let builtin_str = builtin.display().to_string();
    let api = tf3_root.join("api").join("tealdef");

    if !tf3_root.exists() {
        return GameRootCheck {
            ok: false,
            tf3_root: root_str,
            builtin_path: builtin_str,
            message: ui("game.rootNotFound", json!({ "path": tf3_root.display().to_string() })),
        };
    }

    if !api.is_dir() {
        return GameRootCheck {
            ok: false,
            tf3_root: root_str,
            builtin_path: builtin_str,
            message: ui("game.folderMissing", json!({ "path": api.display().to_string() })),
        };
    }

    if builtin.is_file() {
        GameRootCheck {
            ok: true,
            tf3_root: root_str,
            builtin_path: builtin_str,
            message: ui("game.rootValid", json!({ "path": builtin.display().to_string() })),
        }
    } else {
        GameRootCheck {
            ok: false,
            tf3_root: root_str,
            builtin_path: builtin_str,
            message: ui("game.builtinMissing", json!({ "path": builtin.display().to_string() })),
        }
    }
}

fn resolve_under_root(tf3_root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = relative.trim().replace('/', "\\");
    if rel.is_empty() {
        return Err(ui("game.emptyRelative", json!({})));
    }
    let candidate = tf3_root.join(&rel);
    let root_canon = tf3_root
        .canonicalize()
        .map_err(|e| format!("TF3_ROOT invalide : {e}"))?;
    // Reject .. components before canonicalize of missing files
    for component in Path::new(&rel).components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(ui("game.forbiddenRelative", json!({ "path": relative }))),
        }
    }
    if let Ok(canon) = candidate.canonicalize() {
        if !canon.starts_with(&root_canon) {
            return Err(ui("game.outsideRoot", json!({})));
        }
        return Ok(canon);
    }
    // For missing files still ensure parent is under root when possible
    if let Some(parent) = candidate.parent() {
        if let Ok(p) = parent.canonicalize() {
            if !p.starts_with(&root_canon) {
                return Err(ui("game.outsideRoot", json!({})));
            }
        }
    }
    Ok(candidate)
}

#[tauri::command]
pub fn verify_game_root(tf3_root: String) -> GameRootCheck {
    check_root(Path::new(tf3_root.trim()))
}

#[tauri::command]
pub fn detect_default_game_root() -> GameRootCheck {
    let candidates = [
        PathBuf::from(DEFAULT_TF3_ROOT),
        PathBuf::from(r"C:\Program Files\Steam\steamapps\common\Transport Fever 3"),
        PathBuf::from(r"D:\SteamLibrary\steamapps\common\Transport Fever 3"),
    ];

    for candidate in candidates {
        let result = check_root(&candidate);
        if result.ok {
            return result;
        }
    }

    let fallback = check_root(Path::new(DEFAULT_TF3_ROOT));
    GameRootCheck {
        ok: false,
        tf3_root: fallback.tf3_root,
        builtin_path: fallback.builtin_path,
        message: ui("game.notDetected", json!({ "detail": fallback.message })),
    }
}

#[tauri::command]
pub fn read_game_file(tf3_root: String, relative_path: String) -> Result<String, String> {
    let path = resolve_under_root(Path::new(tf3_root.trim()), &relative_path)?;
    std::fs::read_to_string(&path).map_err(|e| ui("io.read", json!({ "path": path.display().to_string(), "error": e.to_string() })))
}

#[tauri::command]
pub fn hash_game_file(tf3_root: String, relative_path: String) -> Result<String, String> {
    let path = resolve_under_root(Path::new(tf3_root.trim()), &relative_path)?;
    let bytes = std::fs::read(&path).map_err(|e| ui("io.read", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub fn list_zip(
    tf3_root: String,
    zip_relative: String,
    suffix: Option<String>,
) -> Result<Vec<String>, String> {
    let path = resolve_under_root(Path::new(tf3_root.trim()), &zip_relative)?;
    let file = File::open(&path).map_err(|e| ui("zip.open", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let archive =
        ZipArchive::new(file).map_err(|e| ui("zip.invalid", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let suffix = suffix.unwrap_or_default().to_ascii_lowercase();
    // Noms lus dans l’annuaire central, sans ouvrir les entrées : certaines
    // archives du jeu ont un en-tête local irrégulier (première entrée de
    // gui.zip), ce qui faisait échouer toute la liste (0 feuille importée).
    let mut names: Vec<String> = archive
        .file_names()
        // Nom illisible : cette entrée est ignorée plutôt que toute l’archive.
        .filter_map(|n| n.ok().map(|n| n.replace('\\', "/")))
        .filter(|n| suffix.is_empty() || n.to_ascii_lowercase().ends_with(&suffix))
        .collect();
    names.sort();
    Ok(names)
}

/// Entrée binaire d’une archive du jeu (police, image .tga), sans JSON.
/// Lue depuis l’installation à l’exécution, jamais copiée dans le dépôt.
#[tauri::command]
pub fn read_zip_entry_bytes(
    tf3_root: String,
    zip_relative: String,
    entry: String,
) -> Result<tauri::ipc::Response, String> {
    let path = resolve_under_root(Path::new(tf3_root.trim()), &zip_relative)?;
    let file = File::open(&path).map_err(|e| ui("zip.open", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| ui("zip.invalid", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let wanted = entry.replace('\\', "/");
    let alt = entry.replace('/', "\\");
    let name = if archive.index_for_name(&wanted).is_some() { wanted.clone() } else { alt };
    let mut found = archive
        .by_name(&name)
        .map_err(|e| ui("zip.entryNotFound", json!({ "entry": wanted, "error": e.to_string() })))?;
    let mut buf = Vec::new();
    found
        .read_to_end(&mut buf)
        .map_err(|e| ui("zip.readEntry", json!({ "entry": wanted, "error": e.to_string() })))?;
    Ok(tauri::ipc::Response::new(buf))
}

#[derive(Debug, Serialize)]
pub struct ZipTextEntry {
    pub name: String,
    pub content: String,
}

/// Toutes les entrées texte d’une archive dont le nom finit par `suffix`, en
/// une seule ouverture : rouvrir une archive de plusieurs centaines de Mo par
/// entrée (`read_zip_entry`) bloquait le démarrage plusieurs minutes. Commande
/// `async` : exécutée hors du fil principal, l’interface reste fluide. Une
/// entrée illisible est ignorée.
#[tauri::command]
pub async fn read_zip_entries(
    tf3_root: String,
    zip_relative: String,
    suffix: String,
) -> Result<Vec<ZipTextEntry>, String> {
    let path = resolve_under_root(Path::new(tf3_root.trim()), &zip_relative)?;
    let file = File::open(&path).map_err(|e| ui("zip.open", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| ui("zip.invalid", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let suffix = suffix.to_ascii_lowercase();
    // Noms de l’annuaire central (voir `list_zip` : en-têtes locaux irréguliers).
    let mut names: Vec<String> = archive
        .file_names()
        .filter_map(|n| n.ok().map(|n| n.to_string()))
        .filter(|n| n.to_ascii_lowercase().ends_with(&suffix))
        .collect();
    names.sort();
    let mut out = Vec::new();
    for raw in names {
        let Ok(mut found) = archive.by_name(&raw) else { continue };
        let mut content = String::new();
        if found.read_to_string(&mut content).is_ok() {
            out.push(ZipTextEntry { name: raw.replace('\\', "/"), content });
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn read_zip_entry(
    tf3_root: String,
    zip_relative: String,
    entry: String,
) -> Result<String, String> {
    let path = resolve_under_root(Path::new(tf3_root.trim()), &zip_relative)?;
    let file = File::open(&path).map_err(|e| ui("zip.open", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| ui("zip.invalid", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let wanted = entry.replace('\\', "/");
    let alt = entry.replace('/', "\\");
    let mut buf = String::new();
    if let Ok(mut found) = archive.by_name(&wanted) {
        found
            .read_to_string(&mut buf)
            .map_err(|e| ui("zip.readEntry", json!({ "entry": wanted, "error": e.to_string() })))?;
        return Ok(buf);
    }
    let mut found = archive
        .by_name(&alt)
        .map_err(|e| ui("zip.entryNotFound", json!({ "entry": wanted, "error": e.to_string() })))?;
    found
        .read_to_string(&mut buf)
        .map_err(|e| ui("zip.readEntry", json!({ "entry": wanted, "error": e.to_string() })))?;
    Ok(buf)
}

#[tauri::command]
pub fn list_content_zips(tf3_root: String) -> Result<Vec<String>, String> {
    let dir = resolve_under_root(Path::new(tf3_root.trim()), "base/content")?;
    let mut zips = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| ui("game.readContent", json!({ "path": dir.display().to_string(), "error": e.to_string() })))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.to_ascii_lowercase().ends_with(".zip") {
            zips.push(format!("base/content/{name}"));
        }
    }
    zips.sort();
    Ok(zips)
}

#[tauri::command]
pub fn write_app_catalog_files(
    app_data_dir: String,
    catalog_json: String,
    style_json: String,
) -> Result<(), String> {
    let dir = PathBuf::from(app_data_dir.trim());
    std::fs::create_dir_all(&dir).map_err(|e| ui("game.appDataCreate", json!({ "error": e.to_string() })))?;
    let catalog_path = dir.join("catalog.generated.json");
    let style_path = dir.join("style-vocabulary.generated.json");
    let mut f1 = File::create(&catalog_path).map_err(|e| ui("game.catalogWrite", json!({ "error": e.to_string() })))?;
    f1.write_all(catalog_json.as_bytes())
        .map_err(|e| ui("game.catalogWrite", json!({ "error": e.to_string() })))?;
    let mut f2 = File::create(&style_path).map_err(|e| ui("game.styleVocabWrite", json!({ "error": e.to_string() })))?;
    f2.write_all(style_json.as_bytes())
        .map_err(|e| ui("game.styleVocabWrite", json!({ "error": e.to_string() })))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Contenu du jeu lié par `pnpm link-game` (`fixtures/base-content`), si présent.
    fn linked_content() -> Option<PathBuf> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("fixtures").join("base-content");
        dir.join("gui.zip").exists().then_some(dir)
    }

    #[test]
    fn lists_css_lua_of_game_archive() {
        let Some(dir) = linked_content() else { return };
        let names = list_zip(dir.display().to_string(), "gui.zip".into(), Some(".css.lua".into()))
            .expect("liste de gui.zip");
        assert!(names.iter().any(|n| n == "gui/main/builtin.css.lua"), "{names:?}");
        assert!(names.len() > 30, "{}", names.len());
    }

    #[test]
    fn rejects_missing_root() {
        let result = check_root(Path::new(r"Z:\chemin\inexistant\tf3"));
        assert!(!result.ok);
        assert!(result.message.starts_with("E:game.rootNotFound"));
    }

    #[test]
    fn accepts_root_with_builtin() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("tfui_test_{nanos}"));
        let builtin = builtin_path_for(&root);
        fs::create_dir_all(builtin.parent().expect("parent")).expect("mkdir");
        fs::create_dir_all(root.join("api").join("tealdef")).expect("mkdir api");
        fs::write(&builtin, "-- test").expect("write");

        let result = check_root(&root);
        assert!(result.ok, "{}", result.message);

        let content = read_game_file(
            root.display().to_string(),
            "base/tealdef/scripts/builtin.d.tl".into(),
        )
        .expect("read");
        assert_eq!(content, "-- test");

        let hash = hash_game_file(
            root.display().to_string(),
            "base/tealdef/scripts/builtin.d.tl".into(),
        )
        .expect("hash");
        assert_eq!(hash.len(), 64);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_path_escape() {
        let err = resolve_under_root(Path::new(r"C:\Games\TF3"), "..\\Windows\\System32");
        assert!(err.is_err());
    }
}
