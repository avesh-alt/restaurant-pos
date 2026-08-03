import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App.js";
import { OfflineBanner } from "./OfflineBanner.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OfflineBanner />
    <App />
  </React.StrictMode>,
);
