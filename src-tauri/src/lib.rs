mod commands;

use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, WebviewUrl};

/// Allow dockview popouts only (same-origin `/popout.html`).
fn is_dockview_popout_path(path: &str) -> bool {
    path.ends_with("/popout.html") || path == "/popout.html"
}

static POPOUT_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Crée la fenêtre détachée comme vraie fenêtre Tauri (même environnement
/// WebView2 que l’appelant) : le protocole de l’app est servi en release et
/// `window.open` renvoie toujours la fenêtre au code dockview.
fn create_popout_window(
    app: &AppHandle,
    features: tauri::webview::NewWindowFeatures,
) -> Option<tauri::WebviewWindow> {
    let n = POPOUT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let builder = WebviewWindowBuilder::new(
        app,
        format!("popout-{n}"),
        WebviewUrl::External("about:blank".parse().ok()?),
    )
    .window_features(features)
    .title("TFUI - Transport Fever 3 UI Editor")
    .disable_drag_drop_handler()
    .on_document_title_changed(|window, title| {
        let _ = window.set_title(&title);
    });
    builder.build().ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            // Taille / position de la fenêtre principale uniquement : les
            // fenêtres détachées sont positionnées par la disposition dockview.
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == "main")
                .build(),
        )
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("aucune fenêtre dans tauri.conf.json")?;

            let app_handle = app.handle().clone();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_new_window(move |url, features| {
                    if !is_dockview_popout_path(url.path()) {
                        return NewWindowResponse::Deny;
                    }
                    match create_popout_window(&app_handle, features) {
                        Some(window) => NewWindowResponse::Create { window },
                        // Repli : popup WebView2 par défaut (fonctionne en dev).
                        None => NewWindowResponse::Allow,
                    }
                })
                .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::game::verify_game_root,
            commands::game::detect_default_game_root,
            commands::game::read_game_file,
            commands::game::hash_game_file,
            commands::game::list_zip,
            commands::game::read_zip_entry,
            commands::game::read_zip_entries,
            commands::game::read_zip_entry_bytes,
            commands::game_cache::game_fingerprint,
            commands::game_cache::read_cache_file,
            commands::game_cache::write_cache_file,
            commands::game_cache::clear_game_cache,
            commands::game_import::plan_game_import,
            commands::game_import::import_game_images,
            commands::game::list_content_zips,
            commands::game::write_app_catalog_files,
            commands::fs_project::read_text_file,
            commands::fs_project::read_image_file,
            commands::fs_project::write_binary_file,
            commands::fs_project::write_text_file,
            commands::fs_project::write_generated_file,
            commands::fs_project::remove_generated_file,
            commands::fs_project::is_versioned,
            commands::locales::read_user_locales,
            commands::locales::write_locale_template,
            commands::fs_project::create_user_file_if_absent,
            commands::fs_project::list_dir_files,
            commands::mod_info::save_mod_metadata,
            commands::mod_info::read_mod_metadata,
            commands::mod_info::create_mod_scaffold,
            commands::mod_info::set_mod_thumbnail,
            commands::deploy::build_mod,
            commands::deploy::install_mod,
            commands::deploy::export_mod_zip,
            commands::deploy::is_tf3_running,
            commands::deploy::check_teal,
            commands::deploy::mod_source_hash,
            commands::deploy::read_build_state,
            commands::deploy::write_build_state,
            commands::deploy::read_install_hash,
            commands::window::list_monitors,
            commands::game_run::launch_game,
            commands::game_run::read_game_log,
            commands::window::cursor_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
