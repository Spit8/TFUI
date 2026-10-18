//! Import des images du jeu (`.tga`) en PNG dans la copie locale
//! (`<données de l’app>/game-cache/images/`), inspiré du convertisseur
//! tga2png (Pillow : `Image.open(tga).save(png)`, arborescence miroir), mais
//! fidèle au moteur : un masque en niveaux de gris devient un PNG blanc dont
//! l’opacité est le gris (la couleur du style le teinte, comme en jeu).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

use super::msg::ui;
use serde_json::json;

/// Image à importer : entrée d’une archive (`source` = `base/content/x.zip`)
/// ou fichier non compressé (`source` vide, `entry` relatif à la racine du jeu).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntry {
    pub source: String,
    pub entry: String,
}

/// Ligne de l’index des images importées.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    /// Chemin dans le jeu, relatif à `base/content` (ex. `gui/hud/icons/x@2x.tga`).
    pub path: String,
    /// PNG dans la copie locale, relatif à `game-cache`.
    pub png: String,
    pub width: u32,
    pub height: u32,
    /// Masque en niveaux de gris (teinté par la couleur du style).
    pub mask: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
    file: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub converted: usize,
    pub errors: Vec<String>,
}

/// Liste des `.tga` à importer : `ui` = `gui.zip`, `all` = toutes les archives
/// de `base/content` et les fichiers non compressés.
#[tauri::command]
pub fn plan_game_import(tf3_root: String, mode: String) -> Result<Vec<ImportEntry>, String> {
    let content = Path::new(tf3_root.trim()).join("base").join("content");
    let mut out = Vec::new();
    let zips: Vec<PathBuf> = if mode == "ui" {
        vec![content.join("gui.zip")]
    } else {
        let mut v: Vec<PathBuf> = fs::read_dir(&content)
            .map_err(|e| ui("cache.readBaseContent", json!({ "error": e.to_string() })))?
            .filter_map(|d| d.ok().map(|d| d.path()))
            .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("zip")).unwrap_or(false))
            .collect();
        v.sort();
        v
    };
    for zip_path in zips {
        let file = File::open(&zip_path).map_err(|e| format!("Ouverture {} : {e}", zip_path.display()))?;
        let mut archive = ZipArchive::new(file).map_err(|e| ui("cache.zipInvalid", json!({ "path": zip_path.display().to_string(), "error": e.to_string() })))?;
        let source = format!(
            "base/content/{}",
            zip_path.file_name().and_then(|n| n.to_str()).unwrap_or_default()
        );
        for i in 0..archive.len() {
            let Ok(entry) = archive.by_index(i) else { continue };
            let Ok(name) = entry.name() else { continue };
            let name = name.replace('\\', "/");
            if name.to_ascii_lowercase().ends_with(".tga") {
                out.push(ImportEntry { source: source.clone(), entry: name });
            }
        }
    }
    if mode == "all" {
        collect_loose(&content, &content, &mut out);
    }
    Ok(out)
}

/// `.tga` non compressés sous `base/content` (dossiers des contenus du jeu).
fn collect_loose(dir: &Path, content: &Path, out: &mut Vec<ImportEntry>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    let mut paths: Vec<PathBuf> = read.filter_map(|d| d.ok().map(|d| d.path())).collect();
    paths.sort();
    for p in paths {
        if p.is_dir() {
            collect_loose(&p, content, out);
        } else if p.extension().map(|x| x.eq_ignore_ascii_case("tga")).unwrap_or(false) {
            if let Ok(rel) = p.strip_prefix(content) {
                let rel = rel.to_string_lossy().replace('\\', "/");
                out.push(ImportEntry { source: String::new(), entry: format!("base/content/{rel}") });
            }
        }
    }
}

/// TGA → PNG RGBA. Gris : blanc + opacité = gris (règle du moteur).
pub fn convert_tga(bytes: &[u8]) -> Result<(Vec<u8>, u32, u32, bool), String> {
    let img = image::load_from_memory_with_format(bytes, image::ImageFormat::Tga)
        .map_err(|e| format!("TGA illisible : {e}"))?;
    let (w, h) = (img.width(), img.height());
    let (rgba, mask) = match img {
        image::DynamicImage::ImageLuma8(gray) => {
            let mut out = image::RgbaImage::new(w, h);
            for (x, y, p) in gray.enumerate_pixels() {
                out.put_pixel(x, y, image::Rgba([255, 255, 255, p[0]]));
            }
            (out, true)
        }
        other => (other.to_rgba8(), false),
    };
    let mut png = Vec::new();
    image::DynamicImage::ImageRgba8(rgba)
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| format!("PNG impossible : {e}"))?;
    Ok((png, w, h, mask))
}

/// Chemin de l’image dans le jeu, relatif à `base/content`.
fn game_path(item: &ImportEntry) -> String {
    item.entry.strip_prefix("base/content/").unwrap_or(&item.entry).to_string()
}

fn read_entry(
    root: &Path,
    item: &ImportEntry,
    archives: &mut HashMap<String, ZipArchive<File>>,
) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    if item.source.is_empty() {
        return fs::read(root.join(&item.entry)).map_err(|e| e.to_string());
    }
    if !archives.contains_key(&item.source) {
        let file = File::open(root.join(&item.source)).map_err(|e| e.to_string())?;
        archives.insert(item.source.clone(), ZipArchive::new(file).map_err(|e| e.to_string())?);
    }
    let archive = archives.get_mut(&item.source).ok_or("archive")?;
    let mut f = archive.by_name(&item.entry).map_err(|e| e.to_string())?;
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Convertit les images en parallèle (un fil par cœur), écrit les PNG et
/// l’index ; événement `game-import-progress` à chaque image. Une erreur sur
/// un fichier est comptée sans arrêter le lot.
#[tauri::command]
pub async fn import_game_images(
    app: AppHandle,
    tf3_root: String,
    app_data_dir: String,
    entries: Vec<ImportEntry>,
) -> Result<ImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || run_import(&app, &tf3_root, &app_data_dir, &entries))
        .await
        .map_err(|e| e.to_string())?
}

fn run_import(
    app: &AppHandle,
    tf3_root: &str,
    app_data_dir: &str,
    entries: &[ImportEntry],
) -> Result<ImportSummary, String> {
    let root = PathBuf::from(tf3_root.trim());
    let cache = Path::new(app_data_dir).join("game-cache");
    let total = entries.len();
    let next = AtomicUsize::new(0);
    let done = AtomicUsize::new(0);
    let index: Mutex<Vec<IndexEntry>> = Mutex::new(Vec::with_capacity(total));
    let errors: Mutex<Vec<String>> = Mutex::new(Vec::new());
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 16);

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                let mut archives: HashMap<String, ZipArchive<File>> = HashMap::new();
                loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    let Some(item) = entries.get(i) else { break };
                    let path = game_path(item);
                    let result = read_entry(&root, item, &mut archives).and_then(|bytes| convert_tga(&bytes));
                    match result {
                        Ok((png, width, height, mask)) => {
                            let rel = format!("images/{}", path.trim_end_matches(".tga").trim_end_matches(".TGA"));
                            let rel = format!("{rel}.png");
                            let out = cache.join(&rel);
                            let written = out
                                .parent()
                                .map(fs::create_dir_all)
                                .unwrap_or(Ok(()))
                                .and_then(|_| fs::write(&out, png));
                            match written {
                                Ok(()) => index.lock().unwrap().push(IndexEntry { path: path.clone(), png: rel, width, height, mask }),
                                Err(e) => errors.lock().unwrap().push(format!("{path} : {e}")),
                            }
                        }
                        Err(e) => errors.lock().unwrap().push(format!("{path} : {e}")),
                    }
                    let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = app.emit("game-import-progress", Progress { done: n, total, file: path });
                }
            });
        }
    });

    let mut index = index.into_inner().unwrap();
    index.sort_by(|a, b| a.path.cmp(&b.path));
    let images_dir = cache.join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&index).map_err(|e| e.to_string())?;
    fs::write(images_dir.join("index.json"), json).map_err(|e| ui("cache.index", json!({ "error": e.to_string() })))?;
    Ok(ImportSummary { converted: index.len(), errors: errors.into_inner().unwrap() })
}

#[cfg(test)]
mod tests {
    use super::convert_tga;

    fn tga(kind: u8, w: u16, h: u16, bpp: u8, descriptor: u8, data: &[u8]) -> Vec<u8> {
        let mut v = vec![0, 0, kind, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        v.extend_from_slice(&w.to_le_bytes());
        v.extend_from_slice(&h.to_le_bytes());
        v.push(bpp);
        v.push(descriptor);
        v.extend_from_slice(data);
        v
    }

    fn decode_png(png: &[u8]) -> image::RgbaImage {
        image::load_from_memory_with_format(png, image::ImageFormat::Png).unwrap().to_rgba8()
    }

    #[test]
    fn masque_gris_devient_blanc_avec_opacite() {
        let (png, w, h, mask) = convert_tga(&tga(3, 2, 1, 8, 0x20, &[0, 200])).unwrap();
        assert_eq!((w, h, mask), (2, 1, true));
        let img = decode_png(&png);
        assert_eq!(img.get_pixel(0, 0).0, [255, 255, 255, 0]);
        assert_eq!(img.get_pixel(1, 0).0, [255, 255, 255, 200]);
    }

    #[test]
    fn couleur_32_bits_conservee() {
        // BGRA, origine en haut.
        let (png, _, _, mask) = convert_tga(&tga(2, 1, 1, 32, 0x28, &[10, 20, 30, 40])).unwrap();
        assert!(!mask);
        assert_eq!(decode_png(&png).get_pixel(0, 0).0, [30, 20, 10, 40]);
    }
}

#[cfg(test)]
mod real_game {
    //! Mesure sur l’installation liée (ignoré par défaut) :
    //! `cargo test -- --ignored convert_gui_zip --nocapture`
    use super::*;

    #[test]
    #[ignore]
    fn convert_gui_zip() {
        let root = std::env::var("TF3_ROOT").unwrap_or_else(|_| r"C:\Program Files (x86)\Steam\steamapps\common\Transport Fever 3".into());
        let entries = plan_game_import(root.clone(), "ui".into()).unwrap();
        let start = std::time::Instant::now();
        let mut archives = HashMap::new();
        let (mut ok, mut masks, mut bytes) = (0usize, 0usize, 0usize);
        let mut errors = Vec::new();
        for item in &entries {
            match read_entry(Path::new(&root), item, &mut archives).and_then(|b| convert_tga(&b)) {
                Ok((png, _, _, mask)) => {
                    ok += 1;
                    bytes += png.len();
                    if mask {
                        masks += 1;
                    }
                }
                Err(e) => errors.push(format!("{} : {e}", item.entry)),
            }
        }
        println!(
            "{} entrées, {ok} converties ({masks} masques), {} erreurs, PNG {} Mo, {:.1} s (1 fil)",
            entries.len(),
            errors.len(),
            bytes / 1_000_000,
            start.elapsed().as_secs_f64()
        );
        for e in errors.iter().take(10) {
            println!("  {e}");
        }
    }
}
