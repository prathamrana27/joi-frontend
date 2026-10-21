import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import QuickApp from "./quick/QuickApp.jsx";
import { AuthProvider } from "./state/auth.jsx";
import "./index.css";

// The same bundle serves two windows: the full app, and the small corner popup ("#/quick").
const isQuick = window.location.hash.startsWith("#/quick");
if (isQuick) {
  document.documentElement.classList.add("quick-mode");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>{isQuick ? <QuickApp /> : <App />}</AuthProvider>
  </React.StrictMode>
);
