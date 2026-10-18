//! Build / install / export commands.
use serde::Serialize;
use serde_json::{json, Map, Value};
use super::msg::ui;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Avoid flashing a console window for short-lived CLI tools (R20).
#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_cmd: &mut Command) {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub build_dir: String,
    pub file_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub target_dir: String,
    pub preserved_mod_io_fileid: bool,
}

fn should_exclude(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    if name.ends_with(".bak") {
        return true;
    }
    if name.contains(".tfui") {
        return true;
    }
    false
}

/// Copie d’un fichier, toujours inscriptible à l’arrivée : les fichiers
/// générés sont en lecture seule dans le projet, pas dans build ni staging
/// (sinon le build et l’installation suivants ne pourraient plus les remplacer).
fn copy_writable(from: &Path, to: &Path) -> Result<(), String> {
    if to.is_file() {
        make_writable(to);
    }
    fs::copy(from, to).map_err(|e| ui("io.copy", json!({ "from": from.display().to_string(), "to": to.display().to_string(), "error": e.to_string() })))?;
    make_writable(to);
    Ok(())
}

fn make_writable(p: &Path) {
    if let Ok(meta) = fs::metadata(p) {
        let mut perms = meta.permissions();
        if perms.readonly() {
            #[allow(clippy::permissions_set_readonly_false)]
            perms.set_readonly(false);
            let _ = fs::set_permissions(p, perms);
        }
    }
}

/// `remove_dir_all` qui passe outre la lecture seule (anciens builds).
fn remove_dir_all_writable(dir: &Path) -> std::io::Result<()> {
    fn unlock(d: &Path) {
        if let Ok(read) = fs::read_dir(d) {
            for e in read.flatten() {
                let p = e.path();
                if p.is_dir() {
                    unlock(&p);
                } else {
                    make_writable(&p);
                }
            }
        }
    }
    unlock(dir);
    fs::remove_dir_all(dir)
}

fn copy_dir_filtered(src: &Path, dst: &Path) -> Result<usize, String> {
    fs::create_dir_all(dst)
        .map_err(|e| ui("io.mkdir", json!({ "path": dst.display().to_string(), "error": e.to_string() })))?;
    let mut count = 0usize;
    for entry in fs::read_dir(src).map_err(|e| format!("Lecture {}: {e}", src.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if should_exclude(&name) {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        if from.is_dir() {
            count += copy_dir_filtered(&from, &to)?;
        } else {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            copy_writable(&from, &to)?;
            count += 1;
        }
    }
    Ok(count)
}

fn dir_hash(root: &Path) -> Result<String, String> {
    let mut hasher = Sha256::new();
    fn walk(path: &Path, hasher: &mut Sha256) -> Result<(), String> {
        let mut entries: Vec<_> = fs::read_dir(path)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if should_exclude(&name) {
                continue;
            }
            hasher.update(name.as_bytes());
            if p.is_dir() {
                walk(&p, hasher)?;
            } else {
                let mut f = File::open(&p).map_err(|e| e.to_string())?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                hasher.update(&buf);
            }
        }
        Ok(())
    }
    walk(root, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn history_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("install_history.json")
}

fn load_history(app_data_dir: &Path) -> Map<String, Value> {
    let path = history_path(app_data_dir);
    if !path.is_file() {
        return Map::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn save_history(app_data_dir: &Path, map: &Map<String, Value>) -> Result<(), String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&Value::Object(map.clone()))
        .map_err(|e| e.to_string())?;
    fs::write(history_path(app_data_dir), format!("{text}\n")).map_err(|e| e.to_string())
}

/// True if `child` is under `parent` (or equal).
/// When `child` does not exist yet, canonicalize the first existing ancestor,
/// append the remaining components (honouring `..`), then compare
/// (case-insensitive on Windows).
fn is_under(child: &Path, parent: &Path) -> bool {
    let Ok(parent_canon) = parent.canonicalize() else {
        return false;
    };
    let child_resolved = resolve_path_for_compare(child);
    path_starts_with(&child_resolved, &parent_canon)
}

fn resolve_path_for_compare(path: &Path) -> PathBuf {
    if let Ok(c) = path.canonicalize() {
        return c;
    }
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    let mut cur = path.to_path_buf();
    while !cur.exists() {
        match cur.file_name() {
            Some(name) => suffix.push(name.to_os_string()),
            None => break,
        }
        match cur.parent() {
            Some(p) if p != cur.as_path() => cur = p.to_path_buf(),
            _ => break,
        }
    }
    let mut base = cur.canonicalize().unwrap_or(cur);
    for part in suffix.into_iter().rev() {
        if part == "." {
            continue;
        }
        if part == ".." {
            if let Some(parent) = base.parent() {
                base = parent.to_path_buf();
            }
            continue;
        }
        base.push(part);
    }
    base
}

fn path_starts_with(child: &Path, parent: &Path) -> bool {
    #[cfg(windows)]
    {
        let c = child.to_string_lossy().to_lowercase().replace('/', "\\");
        let p = parent.to_string_lossy().to_lowercase().replace('/', "\\");
        let p = p.trim_end_matches('\\').to_string();
        c == p || c.starts_with(&(p + "\\"))
    }
    #[cfg(not(windows))]
    {
        child.starts_with(parent)
    }
}

pub fn build_mod_inner(
    project_dir: &Path,
    mod_root_rel: &str,
    mod_id: &str,
) -> Result<BuildResult, String> {
    let src = project_dir.join(mod_root_rel);
    if !src.is_dir() {
        return Err(ui("deploy.modRootNotFound", json!({ "path": src.display().to_string() })));
    }
    let build_dir = project_dir.join("build").join(mod_id);
    if build_dir.exists() {
        remove_dir_all_writable(&build_dir)
            .map_err(|e| ui("deploy.cleanBuild", json!({ "error": e.to_string() })))?;
    }
    let count = copy_dir_filtered(&src, &build_dir)?;
    Ok(BuildResult {
        build_dir: build_dir.to_string_lossy().to_string(),
        file_count: count,
    })
}

#[tauri::command]
pub fn build_mod(
    project_dir: String,
    mod_root_rel: String,
    mod_id: String,
) -> Result<BuildResult, String> {
    build_mod_inner(Path::new(&project_dir), &mod_root_rel, &mod_id)
}

fn chrono_like_now() -> String {
    // avoid chrono dep — ISO-ish via system time
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

#[tauri::command]
pub fn install_mod(
    build_dir: String,
    staging_area: String,
    mod_id: String,
    tf3_root: String,
    app_data_dir: String,
    force: bool,
) -> Result<InstallResult, String> {
    install_mod_inner(
        Path::new(&build_dir),
        Path::new(&staging_area),
        &mod_id,
        Path::new(&tf3_root),
        Path::new(&app_data_dir),
        force,
    )
}

pub fn install_mod_inner(
    build_dir: &Path,
    staging_area: &Path,
    mod_id: &str,
    tf3_root: &Path,
    app_data_dir: &Path,
    force: bool,
) -> Result<InstallResult, String> {
    if !build_dir.is_dir() {
        return Err(ui("deploy.buildNotFound", json!({ "path": build_dir.display().to_string() })));
    }
    let target = staging_area.join(mod_id);
    if is_under(&target, tf3_root) || is_under(staging_area, tf3_root) {
        return Err(ui("deploy.refuseTf3Root", json!({ "path": tf3_root.display().to_string() })));
    }

    let history = load_history(app_data_dir);
    let entry = history.get(mod_id);
    if target.exists() && entry.is_none() && !force {
        return Err(format!(
            "needs_confirm:{}",
            target.display()
        ));
    }

    // Manifeste : fichiers installés par l’éditeur la dernière fois, avec leur
    // empreinte. Historique ancien (sans manifeste) : si le staging n’a pas
    // bougé depuis l’installation, tous ses fichiers sont à l’éditeur.
    let build_files = file_hashes(build_dir)?;
    let manifest: Map<String, Value> = match entry.and_then(|e| e.get("files")).and_then(|f| f.as_object()) {
        Some(files) => files.clone(),
        None => match entry.and_then(|e| e.get("hash")).and_then(|h| h.as_str()) {
            Some(old) if target.is_dir() && dir_hash(&target)? == old => file_hashes(&target)?
                .into_iter()
                .map(|(k, v)| (k, Value::String(v)))
                .collect(),
            _ => Map::new(),
        },
    };
    let current = if target.is_dir() { file_hashes(&target)? } else { Default::default() };

    // Fichiers modifiés à la main dans le staging que l’installation écraserait
    // ou supprimerait : jamais sans accord.
    let mut modified: Vec<String> = Vec::new();
    for (rel, now) in &current {
        let installed = manifest.get(rel).and_then(|v| v.as_str());
        let in_build = build_files.get(rel);
        let touched = match installed {
            // Installé par l’éditeur puis modifié.
            Some(h) => h != now && in_build.map(|b| b != now).unwrap_or(true),
            // Ajouté à la main : seulement s’il serait écrasé par un autre contenu.
            None => in_build.map(|b| b != now).unwrap_or(false),
        };
        if touched {
            modified.push(rel.clone());
        }
    }
    modified.sort();
    if !modified.is_empty() && !force && entry.is_some() {
        return Err(format!("modified_in_staging:{}", modified.join("\n")));
    }

    let fileid_rel = "_metadata/mod.io_fileid.txt";
    let preserved = current.contains_key(fileid_rel) && !build_files.contains_key(fileid_rel);

    // Copie du build (fichier par fichier, sans vider le dossier).
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    for rel in build_files.keys() {
        let from = build_dir.join(rel);
        let to = target.join(rel);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        copy_writable(&from, &to)?;
    }
    // Retrait de ce que l’éditeur avait installé et qui n’est plus dans le
    // build ; les fichiers ajoutés à la main ne sont jamais touchés.
    for rel in manifest.keys() {
        if build_files.contains_key(rel) {
            continue;
        }
        let path = target.join(rel);
        let unchanged = current.get(rel).map(|now| Some(now.as_str()) == manifest.get(rel).and_then(|v| v.as_str()));
        if path.is_file() && (unchanged == Some(true) || force) {
            make_writable(&path);
            let _ = fs::remove_file(&path);
            remove_empty_parents(&path, &target);
        }
    }

    let hash = dir_hash(&target)?;
    let files: Map<String, Value> = build_files.into_iter().map(|(k, v)| (k, Value::String(v))).collect();
    let mut hist = load_history(app_data_dir);
    hist.insert(
        mod_id.to_string(),
        json!({
            "path": target.to_string_lossy(),
            "date": chrono_like_now(),
            "hash": hash,
            "files": files,
        }),
    );
    save_history(app_data_dir, &hist)?;

    Ok(InstallResult {
        target_dir: target.to_string_lossy().to_string(),
        preserved_mod_io_fileid: preserved,
    })
}

/// Empreinte (sha256) de chaque fichier, chemins relatifs en `/` (mêmes
/// exclusions que le build).
fn file_hashes(root: &Path) -> Result<std::collections::BTreeMap<String, String>, String> {
    fn walk(base: &Path, dir: &Path, out: &mut std::collections::BTreeMap<String, String>) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| format!("Lecture {}: {e}", dir.display()))? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if should_exclude(&name) {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                walk(base, &path, out)?;
            } else {
                let bytes = fs::read(&path).map_err(|e| format!("Lecture {}: {e}", path.display()))?;
                let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
                let rel = rel.to_string_lossy().replace('\\', "/");
                out.insert(rel, format!("{:x}", Sha256::digest(&bytes)));
            }
        }
        Ok(())
    }
    let mut out = std::collections::BTreeMap::new();
    walk(root, root, &mut out)?;
    Ok(out)
}

/// Supprime les dossiers devenus vides entre `file` et `stop` (exclu).
fn remove_empty_parents(file: &Path, stop: &Path) {
    let mut dir = file.parent();
    while let Some(d) = dir {
        if d == stop || !d.starts_with(stop) {
            break;
        }
        if fs::remove_dir(d).is_err() {
            break;
        }
        dir = d.parent();
    }
}

pub fn export_mod_zip_inner(build_dir: &Path, zip_path: &Path) -> Result<(), String> {
    if !build_dir.is_dir() {
        return Err(ui("deploy.buildNotFound", json!({ "path": build_dir.display().to_string() })));
    }
    if let Some(parent) = zip_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);

    fn add_dir(zip: &mut ZipWriter<File>, base: &Path, dir: &Path) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if should_exclude(&name) {
                continue;
            }
            let rel = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if path.is_dir() {
                zip.add_directory(
                    format!("{rel}/"),
                    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
                )
                .map_err(|e| e.to_string())?;
                add_dir(zip, base, &path)?;
            } else {
                zip.start_file(
                    &rel,
                    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
                )
                .map_err(|e| e.to_string())?;
                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                zip.write_all(&bytes).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    add_dir(&mut zip, build_dir, build_dir)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_mod_zip(build_dir: String, zip_path: String) -> Result<(), String> {
    export_mod_zip_inner(Path::new(&build_dir), Path::new(&zip_path))
}

#[tauri::command]
pub fn is_tf3_running() -> Result<bool, String> {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("tasklist");
        cmd.args(["/FI", "IMAGENAME eq TransportFever3.exe", "/NH"]);
        hide_console(&mut cmd);
        let output = cmd.output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Ok(stdout.to_ascii_lowercase().contains("transportfever3.exe"));
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("pgrep")
            .args(["-f", "TransportFever3"])
            .output();
        Ok(matches!(output, Ok(o) if o.status.success()))
    }
}

#[tauri::command]
pub fn check_teal(mod_root: String, gui_dir: String) -> Result<Vec<String>, String> {
    let root = Path::new(&mod_root);
    let tlconfig = root.join("tlconfig.lua");
    if !tlconfig.is_file() {
        return Ok(vec![
            format!("info: {}", ui("teal.noConfig", json!({}))),
        ]);
    }
    let mut tl_ver = Command::new("tl");
    tl_ver.arg("--version");
    hide_console(&mut tl_ver);
    let tl = tl_ver.output();
    if tl.is_err() || !tl.as_ref().unwrap().status.success() {
        return Ok(vec![
            format!("info: {}", ui("teal.noTl", json!({}))),
        ]);
    }
    let gui = root.join("content").join(&gui_dir);
    let mut args = vec!["check".to_string()];
    if gui.is_dir() {
        for entry in fs::read_dir(&gui).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("lua")
                || p.extension().and_then(|e| e.to_str()) == Some("tl")
            {
                args.push(p.to_string_lossy().to_string());
            }
        }
    }
    if args.len() == 1 {
        return Ok(vec![format!("info: {}", ui("teal.noFiles", json!({})))]);
    }
    let mut tl_check = Command::new("tl");
    tl_check.args(&args).current_dir(root);
    hide_console(&mut tl_check);
    let output = tl_check.output().map_err(|e| e.to_string())?;
    let mut lines = Vec::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stdout.lines().chain(stderr.lines()) {
        if !line.trim().is_empty() {
            lines.push(line.to_string());
        }
    }
    if lines.is_empty() {
        if output.status.success() {
            lines.push(format!("ok: {}", ui("teal.ok", json!({}))));
        } else {
            lines.push(format!("error: {}", ui("teal.failed", json!({}))));
        }
    }
    Ok(lines)
}

#[derive(Debug, Serialize, serde::Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BuildStateEntry {
    pub gui_hash: String,
    pub source_hash: String,
    pub fingerprint: String,
    pub built_at: String,
}

fn build_state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("build_state.json")
}

fn load_build_state(app_data_dir: &Path) -> Map<String, Value> {
    let path = build_state_path(app_data_dir);
    if !path.is_file() {
        return Map::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn save_build_state(app_data_dir: &Path, map: &Map<String, Value>) -> Result<(), String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&Value::Object(map.clone()))
        .map_err(|e| e.to_string())?;
    fs::write(build_state_path(app_data_dir), format!("{text}\n")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mod_source_hash(project_dir: String, mod_root_rel: String) -> Result<String, String> {
    let root = Path::new(&project_dir).join(&mod_root_rel);
    if !root.is_dir() {
        return Err(ui("deploy.modFolderNotFound", json!({ "path": root.display().to_string() })));
    }
    dir_hash(&root)
}

#[tauri::command]
pub fn read_build_state(
    app_data_dir: String,
    project_path: String,
) -> Result<Option<BuildStateEntry>, String> {
    let map = load_build_state(Path::new(&app_data_dir));
    let Some(v) = map.get(&project_path) else {
        return Ok(None);
    };
    serde_json::from_value(v.clone()).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_build_state(
    app_data_dir: String,
    project_path: String,
    entry: BuildStateEntry,
) -> Result<(), String> {
    let mut map = load_build_state(Path::new(&app_data_dir));
    let value = serde_json::to_value(&entry).map_err(|e| e.to_string())?;
    map.insert(project_path, value);
    save_build_state(Path::new(&app_data_dir), &map)
}

#[tauri::command]
pub fn read_install_hash(app_data_dir: String, mod_id: String) -> Result<Option<String>, String> {
    let history = load_history(Path::new(&app_data_dir));
    let Some(v) = history.get(&mod_id) else {
        return Ok(None);
    };
    Ok(v.get("hash").and_then(|h| h.as_str()).map(|s| s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("tfui_deploy_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn build_excludes_bak_and_tfui() {
        let root = tmp("build");
        let mod_root = root.join("mod");
        fs::create_dir_all(mod_root.join("content/gui")).unwrap();
        fs::write(mod_root.join("mod.json"), "{}").unwrap();
        fs::write(mod_root.join("content/gui/a.script.lua"), "x").unwrap();
        fs::write(mod_root.join("content/gui/a.script.lua.bak"), "old").unwrap();
        fs::write(mod_root.join("secret.tfui.json"), "{}").unwrap();
        fs::write(mod_root.join(".hidden"), "h").unwrap();

        let r = build_mod_inner(&root, "mod", "m1").unwrap();
        let build = Path::new(&r.build_dir);
        assert!(build.join("content/gui/a.script.lua").is_file());
        assert!(!build.join("content/gui/a.script.lua.bak").exists());
        assert!(!build.join("secret.tfui.json").exists());
        assert!(!build.join(".hidden").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn install_refuses_under_tf3_root() {
        let root = tmp("refuse");
        let tf3 = root.join("game");
        let staging = tf3.join("mods");
        let build = root.join("build/m");
        fs::create_dir_all(&build).unwrap();
        fs::write(build.join("mod.json"), "{}").unwrap();
        fs::create_dir_all(&staging).unwrap();
        let app = root.join("appdata");
        let err = install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap_err();
        assert!(err.starts_with("E:deploy.refuseTf3Root"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn is_under_case_insensitive_on_windows() {
        let root = tmp("case");
        let parent = root.join("GameRoot");
        fs::create_dir_all(&parent).unwrap();
        let child = parent.join("Mods").join("future_mod");
        // child does not exist yet — must still detect containment
        assert!(is_under(&child, &parent));
        #[cfg(windows)]
        {
            let weird = PathBuf::from(
                parent
                    .to_string_lossy()
                    .to_uppercase(),
            )
            .join("mods")
            .join("x");
            assert!(is_under(&weird, &parent));
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn is_under_resolves_dotdot() {
        let root = tmp("dotdot");
        let parent = root.join("safe");
        let outside = root.join("outside");
        fs::create_dir_all(&parent).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let sneaky = parent.join("..").join("outside").join("mod");
        assert!(!is_under(&sneaky, &parent));
        let inside = parent.join("sub").join("..").join("nested_mod");
        assert!(is_under(&inside, &parent));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn install_needs_confirm_without_history() {
        let root = tmp("confirm");
        let tf3 = root.join("game");
        let staging = root.join("staging");
        let build = root.join("build/m");
        let app = root.join("appdata");
        fs::create_dir_all(&tf3).unwrap();
        fs::create_dir_all(&build).unwrap();
        fs::write(build.join("mod.json"), "{}").unwrap();
        fs::create_dir_all(staging.join("m")).unwrap();
        fs::write(staging.join("m/old.txt"), "x").unwrap();
        let err = install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap_err();
        assert!(err.starts_with("needs_confirm:"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn install_preserves_mod_io_fileid() {
        let root = tmp("fileid");
        let tf3 = root.join("game");
        let staging = root.join("staging");
        let build = root.join("build/m");
        let app = root.join("appdata");
        fs::create_dir_all(&tf3).unwrap();
        fs::create_dir_all(build.join("_metadata")).unwrap();
        fs::write(build.join("mod.json"), "{}").unwrap();
        fs::create_dir_all(staging.join("m/_metadata")).unwrap();
        fs::write(
            staging.join("m/_metadata/mod.io_fileid.txt"),
            "12345",
        )
        .unwrap();
        // force because staging exists without history
        let r = install_mod_inner(&build, &staging, "m", &tf3, &app, true).unwrap();
        assert!(r.preserved_mod_io_fileid);
        let content = fs::read_to_string(
            Path::new(&r.target_dir).join("_metadata/mod.io_fileid.txt"),
        )
        .unwrap();
        assert_eq!(content, "12345");
        let _ = fs::remove_dir_all(&root);
    }

    fn setup_install(name: &str) -> (PathBuf, PathBuf, PathBuf, PathBuf, PathBuf) {
        let root = tmp(name);
        let tf3 = root.join("game");
        let staging = root.join("staging");
        let build = root.join("build/m");
        let app = root.join("appdata");
        fs::create_dir_all(&tf3).unwrap();
        fs::create_dir_all(build.join("content/gui")).unwrap();
        fs::write(build.join("mod.json"), "{}").unwrap();
        fs::write(build.join("content/gui/a.script.lua"), "v1").unwrap();
        (root, tf3, staging, build, app)
    }

    #[test]
    fn install_keeps_files_added_by_hand_in_staging() {
        let (root, tf3, staging, build, app) = setup_install("added");
        install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap();
        fs::write(staging.join("m/mes_notes.txt"), "à moi").unwrap();
        fs::write(build.join("content/gui/a.script.lua"), "v2").unwrap();
        install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap();
        assert_eq!(fs::read_to_string(staging.join("m/mes_notes.txt")).unwrap(), "à moi");
        assert_eq!(fs::read_to_string(staging.join("m/content/gui/a.script.lua")).unwrap(), "v2");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn install_refuses_to_overwrite_hand_edits_without_consent() {
        let (root, tf3, staging, build, app) = setup_install("edited");
        install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap();
        fs::write(staging.join("m/content/gui/a.script.lua"), "retouche").unwrap();
        fs::write(build.join("content/gui/a.script.lua"), "v2").unwrap();
        let err = install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap_err();
        assert!(err.starts_with("modified_in_staging:"));
        assert!(err.contains("content/gui/a.script.lua"));
        assert_eq!(fs::read_to_string(staging.join("m/content/gui/a.script.lua")).unwrap(), "retouche");
        // Accord explicite : écrasé.
        install_mod_inner(&build, &staging, "m", &tf3, &app, true).unwrap();
        assert_eq!(fs::read_to_string(staging.join("m/content/gui/a.script.lua")).unwrap(), "v2");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn install_removes_files_dropped_from_build() {
        let (root, tf3, staging, build, app) = setup_install("dropped");
        fs::write(build.join("content/gui/b.css.lua"), "css").unwrap();
        install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap();
        fs::remove_file(build.join("content/gui/b.css.lua")).unwrap();
        install_mod_inner(&build, &staging, "m", &tf3, &app, false).unwrap();
        assert!(!staging.join("m/content/gui/b.css.lua").exists());
        assert!(staging.join("m/content/gui/a.script.lua").is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn readonly_generated_files_do_not_block_build_or_install() {
        let (root, tf3, staging, build, app) = setup_install("readonly");
        let src = root.join("proj/mod/content/gui");
        fs::create_dir_all(&src).unwrap();
        fs::write(root.join("proj/mod/mod.json"), "{}").unwrap();
        let gen = src.join("g.script.lua");
        fs::write(&gen, "x").unwrap();
        let mut perms = fs::metadata(&gen).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&gen, perms).unwrap();
        // Deux builds et deux installations de suite : aucune erreur d’accès.
        for _ in 0..2 {
            let r = build_mod_inner(&root.join("proj"), "mod", "m").unwrap();
            let built = Path::new(&r.build_dir);
            assert!(!fs::metadata(built.join("content/gui/g.script.lua")).unwrap().permissions().readonly());
            install_mod_inner(built, &staging, "m", &tf3, &app, true).unwrap();
        }
        let _ = build;
        make_writable(&gen);
        let _ = fs::remove_dir_all(&root);
    }
}
