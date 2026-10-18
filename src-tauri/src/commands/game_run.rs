use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

use super::msg::ui;
use serde_json::json;

/// Exécutable du jeu, à la racine de l’installation.
const GAME_EXE: &str = "TransportFever3.exe";

/// Taille maximale lue dans le journal (la fin, où sont les erreurs récentes).
const LOG_TAIL_BYTES: u64 = 4 * 1024 * 1024;

fn game_exe(tf3_root: &str) -> Result<PathBuf, String> {
    let exe = Path::new(tf3_root).join(GAME_EXE);
    if exe.is_file() {
        Ok(exe)
    } else {
        Err(ui("game.exeNotFound", json!({ "path": exe.display().to_string() })))
    }
}

/// Dossier des données utilisateur du jeu : parent du dossier `staging_area`
/// (vérifié : `…/local/staging_area` et `…/local/crash_dump/stdout.txt`).
fn user_data_dir(staging_area: &str) -> Result<PathBuf, String> {
    Path::new(staging_area)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| ui("game.stagingInvalid", json!({})))
}

/// Erreur Windows « L’opération demandée nécessite une élévation ».
const ERROR_ELEVATION_REQUIRED: i32 = 740;

/// Lance le jeu (détaché) avec des arguments optionnels.
///
/// L’exécutable peut exiger des droits élevés : `CreateProcess` échoue alors
/// (os error 740). On repasse par le shell Windows (`start`, soit
/// `ShellExecute`), qui gère l’élévation comme un double-clic.
#[tauri::command]
pub fn launch_game(tf3_root: String, args: Vec<String>) -> Result<(), String> {
    let exe = game_exe(&tf3_root)?;
    match Command::new(&exe).args(&args).current_dir(&tf3_root).spawn() {
        Ok(_) => Ok(()),
        Err(e) if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) => {
            launch_via_shell(&exe, &args, &tf3_root)
        }
        Err(e) => Err(ui("game.launchFailed", json!({ "error": e.to_string() }))),
    }
}

#[cfg(windows)]
fn launch_via_shell(exe: &Path, args: &[String], cwd: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // cmd /C start "" "<exe>" "<arg>"… — guillemets posés à la main (raw_arg)
    // pour les chemins avec espaces.
    let mut line = format!("/C start \"\" \"{}\"", exe.display());
    for a in args {
        line.push_str(&format!(" \"{}\"", a.replace('"', "")));
    }
    Command::new("cmd")
        .raw_arg(line)
        .current_dir(cwd)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| ui("game.launchFailed", json!({ "error": e.to_string() })))?;
    Ok(())
}

#[cfg(not(windows))]
fn launch_via_shell(_exe: &Path, _args: &[String], _cwd: &str) -> Result<(), String> {
    Err(ui("game.elevationRequired", json!({})))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLog {
    pub path: String,
    /// Fin du journal (texte).
    pub content: String,
    /// Date de dernière écriture (ms depuis l’époque Unix).
    pub modified_ms: u64,
}

/// Lit la fin du journal de la dernière session du jeu.
#[tauri::command]
pub fn read_game_log(staging_area: String) -> Result<GameLog, String> {
    let path = user_data_dir(&staging_area)?
        .join("crash_dump")
        .join("stdout.txt");
    let meta = fs::metadata(&path).map_err(|_| {
        ui("game.logNotFound", json!({ "path": path.display().to_string() }))
    })?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let start = bytes.len().saturating_sub(LOG_TAIL_BYTES as usize);
    Ok(GameLog {
        path: path.to_string_lossy().to_string(),
        content: String::from_utf8_lossy(&bytes[start..]).to_string(),
        modified_ms,
    })
}
