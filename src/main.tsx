import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initLanguage } from "./i18n/loadLanguage";
import { installMonacoEnvironment } from "./monaco/env";
import { installNativeMenuBlocker } from "./ui/menu/nativeMenu";
import { TextFieldMenuHost } from "./ui/menu/TextFieldMenuHost";

installMonacoEnvironment();
// Jamais de menu natif du WebView, y compris sur l’écran de liaison du jeu.
installNativeMenuBlocker(document);
// Langue de l’interface (paramètres + dossier des langues) ; français en attendant.
void initLanguage().catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <TextFieldMenuHost />
  </React.StrictMode>,
);
