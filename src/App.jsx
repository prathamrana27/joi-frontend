import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./state/auth.jsx";
import { BackgroundOrbs } from "./components/ui/Glass.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import SetupPage from "./pages/SetupPage.jsx";

// "checking" until the desktop app reports whether JOI's AI engine and model are ready;
// browsers (no desktop bridge) skip straight to the app.
function useEngineReady() {
  const hasBridge = typeof window !== "undefined" && !!window.joiDesktop?.engineStatus;
  const [state, setState] = useState(hasBridge ? "checking" : "ready");

  useEffect(() => {
    if (!hasBridge) return;
    window.joiDesktop
      .engineStatus()
      .then((s) => setState(s?.ready ? "ready" : "setup"))
      .catch(() => setState("setup"));
  }, [hasBridge]);

  const markReady = useCallback(() => setState("ready"), []);
  return [state, markReady];
}

export default function App() {
  const { ready, token } = useAuth();
  const [engine, markEngineReady] = useEngineReady();

  return (
    <>
      <BackgroundOrbs />
      {!ready || engine === "checking" ? (
        <div className="grid h-full place-items-center">
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="h-2 w-2 animate-ping rounded-full bg-clay" />
            Loading JOI…
          </div>
        </div>
      ) : engine === "setup" ? (
        <SetupPage onDone={markEngineReady} />
      ) : token ? (
        <ChatPage />
      ) : (
        <AuthPage />
      )}
    </>
  );
}
