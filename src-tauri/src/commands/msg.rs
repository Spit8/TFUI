//! Messages destinés à l’interface : `E:<clé>:<json des paramètres>`,
//! traduits côté éditeur avec la clé `backend.<clé>` de
//! `src/i18n/locales/fr.json` (voir `src/i18n/backend.ts`).

use serde_json::Value;

/// Message traduisible : `ui("io.read", json!({ "path": p, "error": e.to_string() }))`.
pub fn ui(key: &str, params: Value) -> String {
    if params.is_null() || params.as_object().map(|o| o.is_empty()).unwrap_or(false) {
        format!("E:{key}")
    } else {
        format!("E:{key}:{params}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn formats_codes() {
        assert_eq!(ui("a.b", json!({})), "E:a.b");
        assert_eq!(ui("a.b", json!({ "path": "x" })), "E:a.b:{\"path\":\"x\"}");
    }
}
