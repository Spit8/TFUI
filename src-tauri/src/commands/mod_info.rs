//! mod.json / modinfo.json helpers.
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use super::msg::ui;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModMetadataPatch {
    pub mod_id: String,
    pub revision: i64,
    pub severity_add: String,
    pub severity_remove: String,
    pub visible: bool,
    pub cosmetic: bool,
    pub name: String,
    pub summary: String,
    pub description: String,
    pub authors: Vec<Author>,
    pub tags: Vec<String>,
    pub url: String,
    pub pre_run_script: Option<String>,
    pub run_script: Option<String>,
    pub post_run_script: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Author {
    pub name: String,
    pub role: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldResult {
    pub project_dir: String,
    pub tfui_path: String,
    pub mod_root: String,
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.is_file() {
        return Ok(Map::new());
    }
    let text = fs::read_to_string(path)
        .map_err(|e| ui("io.read", json!({ "path": path.display().to_string(), "error": e.to_string() })))?;
    let v: Value = serde_json::from_str(&text)
        .map_err(|e| format!("JSON invalide ({}): {e}", path.display()))?;
    match v {
        Value::Object(m) => Ok(m),
        _ => Err(ui("io.notJsonObject", json!({ "path": path.display().to_string() }))),
    }
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| ui("io.mkdir", json!({ "path": parent.display().to_string(), "error": e.to_string() })))?;
    }
    let text = serde_json::to_string_pretty(value)
        .map_err(|e| ui("io.jsonSerialize", json!({ "error": e.to_string() })))?;
    fs::write(path, format!("{text}\n"))
        .map_err(|e| ui("io.write", json!({ "path": path.display().to_string(), "error": e.to_string() })))
}

fn script_obj(file_name: Option<&str>) -> Value {
    match file_name {
        Some(s) if !s.is_empty() => json!({ "fileName": s }),
        _ => json!({ "fileName": "" }),
    }
}

/// Merge patch into existing mod.json / modinfo.json, preserving unknown keys and params.
pub fn save_mod_metadata_inner(
    mod_root: &Path,
    patch: &ModMetadataPatch,
) -> Result<(), String> {
    let mod_json_path = mod_root.join("mod.json");
    let modinfo_path = mod_root.join("_metadata").join("modinfo.json");

    let mut mod_obj = read_json_object(&mod_json_path)?;
    mod_obj.insert("modId".into(), json!(patch.mod_id));
    mod_obj.insert("revision".into(), json!(patch.revision));
    mod_obj.insert("severityAdd".into(), json!(patch.severity_add));
    mod_obj.insert("severityRemove".into(), json!(patch.severity_remove));
    mod_obj.insert("visible".into(), json!(patch.visible));
    mod_obj.insert("cosmetic".into(), json!(patch.cosmetic));
    mod_obj.insert(
        "preRunScript".into(),
        script_obj(patch.pre_run_script.as_deref()),
    );
    mod_obj.insert("runScript".into(), script_obj(patch.run_script.as_deref()));
    mod_obj.insert(
        "postRunScript".into(),
        script_obj(patch.post_run_script.as_deref()),
    );
    // keep params / dependencies / incompatibilities if already present
    if !mod_obj.contains_key("dependencies") {
        mod_obj.insert("dependencies".into(), Value::Null);
    }
    if !mod_obj.contains_key("incompatibilities") {
        mod_obj.insert("incompatibilities".into(), Value::Null);
    }

    let mut info_obj = read_json_object(&modinfo_path)?;
    info_obj.insert("name".into(), json!(patch.name));
    info_obj.insert("summary".into(), json!(patch.summary));
    info_obj.insert("description".into(), json!(patch.description));
    info_obj.insert("url".into(), json!(patch.url));
    info_obj.insert("tags".into(), json!(patch.tags));
    info_obj.insert(
        "authors".into(),
        json!(patch
            .authors
            .iter()
            .map(|a| json!({ "name": a.name, "role": a.role }))
            .collect::<Vec<_>>()),
    );

    write_json(&mod_json_path, &Value::Object(mod_obj))?;
    write_json(&modinfo_path, &Value::Object(info_obj))?;
    Ok(())
}

#[tauri::command]
pub fn save_mod_metadata(mod_root: String, patch: ModMetadataPatch) -> Result<(), String> {
    save_mod_metadata_inner(Path::new(&mod_root), &patch)
}

#[tauri::command]
pub fn read_mod_metadata(mod_root: String) -> Result<Value, String> {
    let root = Path::new(&mod_root);
    let mod_json = read_json_object(&root.join("mod.json"))?;
    let modinfo = read_json_object(&root.join("_metadata").join("modinfo.json"))?;
    Ok(json!({ "mod": mod_json, "modinfo": modinfo }))
}

/// Create project tree §7.2. Does not write the .tfui.json (frontend does).
#[tauri::command]
pub fn create_mod_scaffold(
    parent_dir: String,
    mod_id: String,
    display_name: String,
) -> Result<ScaffoldResult, String> {
    create_mod_scaffold_inner(&parent_dir, &mod_id, &display_name)
}

pub fn create_mod_scaffold_inner(
    parent_dir: &str,
    mod_id: &str,
    display_name: &str,
) -> Result<ScaffoldResult, String> {
    if !mod_id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        || mod_id.is_empty()
    {
        return Err("modId invalide : utilisez [a-z0-9_]+".into());
    }
    let project_dir = PathBuf::from(parent_dir).join(mod_id);
    if project_dir.exists() {
        return Err(ui("mod.folderExists", json!({ "path": project_dir.display().to_string() })));
    }
    let mod_root = project_dir.join("mod");
    let gui = mod_root.join("content").join("gui");
    let meta = mod_root.join("_metadata");
    fs::create_dir_all(&gui)
        .map_err(|e| ui("mod.createGui", json!({ "error": e.to_string() })))?;
    fs::create_dir_all(&meta)
        .map_err(|e| ui("mod.createMetadata", json!({ "error": e.to_string() })))?;

    let gitignore = "build/\n*.tfui.autosave.json\n";
    fs::write(project_dir.join(".gitignore"), gitignore)
        .map_err(|e| format!(".gitignore: {e}"))?;

    let patch = ModMetadataPatch {
        mod_id: mod_id.to_string(),
        revision: 1,
        severity_add: "None".into(),
        severity_remove: "None".into(),
        visible: true,
        cosmetic: false,
        name: display_name.to_string(),
        summary: format!("Mod UI {display_name}"),
        description: format!("Créé avec TFUI."),
        authors: vec![Author {
            name: "Author".into(),
            role: "CREATOR".into(),
        }],
        tags: vec!["Script Mod".into()],
        url: String::new(),
        pre_run_script: None,
        run_script: None,
        post_run_script: None,
    };
    save_mod_metadata_inner(&mod_root, &patch)?;

    let tfui_path = project_dir.join(format!("{mod_id}.tfui.json"));
    Ok(ScaffoldResult {
        project_dir: project_dir.to_string_lossy().to_string(),
        tfui_path: tfui_path.to_string_lossy().to_string(),
        mod_root: mod_root.to_string_lossy().to_string(),
    })
}

/// Copy / resize image to `_metadata/0.png` (max 256px).
#[tauri::command]
pub fn set_mod_thumbnail(mod_root: String, source_image: String) -> Result<(), String> {
    set_mod_thumbnail_inner(Path::new(&mod_root), Path::new(&source_image))
}

pub fn set_mod_thumbnail_inner(mod_root: &Path, source: &Path) -> Result<(), String> {
    let dest_dir = mod_root.join("_metadata");
    fs::create_dir_all(&dest_dir)
        .map_err(|e| ui("mod.createMetadata", json!({ "error": e.to_string() })))?;
    let dest = dest_dir.join("0.png");

    // Prefer image crate resize; fall back to raw copy if decode fails.
    match image::open(source) {
        Ok(img) => {
            let resized = img.thumbnail(256, 256);
            resized
                .save(&dest)
                .map_err(|e| ui("mod.thumbnailSave", json!({ "error": e.to_string() })))?;
        }
        Err(_) => {
            fs::copy(source, &dest)
                .map_err(|e| ui("mod.thumbnailCopy", json!({ "error": e.to_string() })))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scaffold_and_preserve_params() {
        let base = std::env::temp_dir().join(format!(
            "tfui_scaffold_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let r = create_mod_scaffold_inner(
            base.to_str().unwrap(),
            "tfui_sandbox",
            "Sandbox",
        )
        .unwrap();
        assert!(Path::new(&r.mod_root).join("mod.json").is_file());

        // inject params then re-save
        let mod_json = Path::new(&r.mod_root).join("mod.json");
        let mut obj: Value = serde_json::from_str(&fs::read_to_string(&mod_json).unwrap()).unwrap();
        obj.as_object_mut()
            .unwrap()
            .insert("params".into(), json!([{ "key": "x" }]));
        fs::write(&mod_json, serde_json::to_string_pretty(&obj).unwrap()).unwrap();

        let patch = ModMetadataPatch {
            mod_id: "tfui_sandbox".into(),
            revision: 2,
            severity_add: "None".into(),
            severity_remove: "Warning".into(),
            visible: true,
            cosmetic: false,
            name: "Sandbox".into(),
            summary: "s".into(),
            description: "d".into(),
            authors: vec![],
            tags: vec![],
            url: String::new(),
            pre_run_script: None,
            run_script: None,
            post_run_script: None,
        };
        save_mod_metadata_inner(Path::new(&r.mod_root), &patch).unwrap();
        let again: Value =
            serde_json::from_str(&fs::read_to_string(&mod_json).unwrap()).unwrap();
        assert_eq!(again["revision"], 2);
        assert!(again.get("params").is_some());
        let _ = fs::remove_dir_all(&base);
    }
}
