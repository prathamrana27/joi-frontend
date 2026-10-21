import { useEffect, useRef, useState } from "react";
import Logo from "../components/ui/Logo.jsx";

const CLAY = "linear-gradient(135deg,#e68a67 0%,#d97757 55%,#c45f3d 120%)";

const STEPS = [
  { key: "check", title: "Checking your PC" },
  { key: "engine", title: "Installing JOI's AI engine" },
  { key: "model", title: "Downloading JOI's brain" },
  { key: "warm", title: "Waking JOI up" },
];

function formatBytes(n) {
  if (!n) return "0 MB";
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

// First-run setup: gets the on-device AI engine and model in place before JOI starts.
// Steps that are already done (e.g. the engine is installed) finish instantly.
export default function SetupPage({ onDone }) {
  const [phase, setPhase] = useState("check");
  const [progress, setProgress] = useState(null);
  const [hardware, setHardware] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const speedRef = useRef({ t: 0, bytes: 0, rate: 0 });

  useEffect(() => {
    return window.joiDesktop.onEngineProgress((p) => {
      if (p.phase === "check") {
        setHardware(p.hardware);
        return;
      }
      setPhase(p.phase);
      if (p.total) {
        // Smoothed download speed for the "time left" estimate.
        const now = Date.now();
        const s = speedRef.current;
        if (s.t && p.done > s.bytes) {
          const inst = ((p.done - s.bytes) / (now - s.t)) * 1000;
          s.rate = s.rate ? s.rate * 0.85 + inst * 0.15 : inst;
        }
        s.t = now;
        s.bytes = p.done;
        setProgress({ ...p, rate: s.rate });
      } else {
        setProgress(p.label ? { label: p.label } : null);
      }
      if (p.phase === "done") onDone();
    });
  }, [onDone]);

  async function start() {
    setError("");
    setRunning(true);
    speedRef.current = { t: 0, bytes: 0, rate: 0 };
    const res = await window.joiDesktop.runEngineSetup();
    setRunning(false);
    if (res?.ok) onDone();
    else setError(res?.error || "Setup didn't finish. Please try again.");
  }

  // Run once on mount; retries come from the button.
  useEffect(() => {
    start();
  }, []);

  const currentIndex = STEPS.findIndex((s) => s.key === phase);
  const pct = progress?.total ? Math.min(100, (progress.done / progress.total) * 100) : null;
  const eta =
    progress?.total && progress.rate > 0
      ? Math.max(0, Math.round((progress.total - progress.done) / progress.rate / 60))
      : null;

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-[520px] rounded-[28px] border border-ink/10 bg-white/80 p-8 shadow-lift backdrop-blur-md">
        <Logo size={40} />
        <h1 className="mt-6 font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink">
          Let's set up JOI
        </h1>
        <p className="mt-2 text-[0.95rem] text-ink-muted">
          JOI's AI runs right on this PC, so it needs a one-time download. You can keep using your computer while it
          works.
        </p>

        <ol className="mt-7 space-y-3">
          {STEPS.map((s, i) => {
            const state = error && i === currentIndex ? "error" : i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    state === "done"
                      ? "bg-sage text-white"
                      : state === "active"
                        ? "text-white"
                        : state === "error"
                          ? "bg-clay-700 text-white"
                          : "border border-ink/15 text-ink-faint"
                  }`}
                  style={state === "active" ? { backgroundImage: CLAY } : undefined}
                >
                  {state === "done" ? "✓" : state === "error" ? "!" : i + 1}
                </span>
                <span className={`text-[0.95rem] ${state === "todo" ? "text-ink-faint" : "font-medium text-ink"}`}>
                  {s.title}
                </span>
                {state === "active" && running && (
                  <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-clay/25 border-t-clay" />
                )}
              </li>
            );
          })}
        </ol>

        {pct !== null && !error && (
          <div className="mt-6">
            <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%`, backgroundImage: CLAY }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink-faint">
              <span>
                {progress.label} · {formatBytes(progress.done)} of {formatBytes(progress.total)}
              </span>
              <span>{eta !== null ? (eta < 1 ? "under a minute" : `about ${eta} min left`) : `${Math.round(pct)}%`}</span>
            </div>
          </div>
        )}
        {pct === null && progress?.label && !error && (
          <p className="mt-6 text-sm text-ink-faint">{progress.label}…</p>
        )}

        {hardware && (
          <div className="mt-6 rounded-2xl bg-ink/5 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            <div>
              Memory {hardware.ramGB} GB · Free disk {hardware.diskGB ?? "?"} GB
              {hardware.gpu ? ` · ${hardware.gpu.name}` : " · No dedicated graphics card"}
            </div>
            {hardware.issues.map((issue) => (
              <div key={issue} className="mt-1 text-clay-700">
                {issue}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6">
            <div className="rounded-2xl border border-clay/30 bg-clay-50 px-4 py-3 text-sm text-clay-700">{error}</div>
            <button
              onClick={start}
              className="mt-4 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-clay transition hover:-translate-y-0.5"
              style={{ backgroundImage: CLAY }}
            >
              Try again
            </button>
            <p className="mt-2 text-xs text-ink-faint">Downloads resume where they stopped.</p>
          </div>
        )}
      </div>
    </div>
  );
}
