use serde::Serialize;

/// Zone de travail d’un moniteur, en pixels logiques (même repère que
/// `window.screenX/screenY` côté WebView).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorBounds {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize)]
pub struct ScreenPoint {
    pub x: f64,
    pub y: f64,
}

/// Position du pointeur à l’écran, en pixels logiques. Sert à la fin d’un
/// glisser d’onglet : sous WebView2, `dragend` hors fenêtre renvoie souvent 0,0.
#[tauri::command]
pub fn cursor_position(window: tauri::Window) -> Result<ScreenPoint, String> {
    let p = window.cursor_position().map_err(|e| e.to_string())?;
    let scale = window
        .monitor_from_point(p.x, p.y)
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .or_else(|| window.scale_factor().ok())
        .unwrap_or(1.0);
    Ok(ScreenPoint {
        x: p.x / scale,
        y: p.y / scale,
    })
}

/// Liste les moniteurs branchés (garde-fou de position des fenêtres détachées).
#[tauri::command]
pub fn list_monitors(window: tauri::Window) -> Result<Vec<MonitorBounds>, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .map(|m| {
            let scale = m.scale_factor();
            let area = m.work_area();
            MonitorBounds {
                left: area.position.x as f64 / scale,
                top: area.position.y as f64 / scale,
                width: area.size.width as f64 / scale,
                height: area.size.height as f64 / scale,
            }
        })
        .collect())
}
