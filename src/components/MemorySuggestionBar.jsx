import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

const CLAY = "linear-gradient(135deg,#e68a67 0%,#d97757 55%,#c45f3d 120%)";

// "JOI wants to remember: …" after a chat turn. The backend proposes lasting facts a few
// seconds after an answer (memory_learning.py); nothing is saved unless the user says so.
// `turn` changes after every finished answer, which starts a short check for suggestions.
export default function MemorySuggestionBar({ token, turn, compact = false }) {
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);

  async function check() {
    try {
      const r = await api.memorySuggestions(token);
      const next = (r.suggestions || [])[0] || null;
      setSuggestion(next);
      return next;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!token || !turn) return undefined;
    timers.current.forEach(clearTimeout);
    // Extraction runs after the answer, so look a few times over ~10 seconds.
    timers.current = [2500, 5500, 10000].map((ms) =>
      setTimeout(() => {
        if (!suggestion) check();
      }, ms)
    );
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, token]);

  async function decide(decision) {
    if (!suggestion) return;
    setBusy(true);
    try {
      await api.decideMemorySuggestion(token, suggestion.suggestion_id, decision);
    } catch {
      /* already handled elsewhere */
    }
    setBusy(false);
    setSuggestion(null);
    check();
  }

  if (!suggestion) return null;
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border border-clay/30 bg-clay-50/90 ${
        compact ? "mb-2 px-3 py-2 text-[0.8rem]" : "mb-2.5 px-4 py-2.5 text-sm"
      } animate-fade`}
    >
      <span className="shrink-0" aria-hidden="true">💡</span>
      <span className="min-w-0 flex-1 text-ink-soft">
        JOI wants to remember: <span className="font-medium text-ink">“{suggestion.text}”</span>
      </span>
      <button
        onClick={() => decide("accept")}
        disabled={busy}
        className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        style={{ backgroundImage: CLAY }}
      >
        Remember
      </button>
      <button
        onClick={() => decide("dismiss")}
        disabled={busy}
        className="shrink-0 rounded-full border border-ink/15 bg-white px-3 py-1 text-xs font-medium text-ink-soft disabled:opacity-60"
      >
        Not now
      </button>
    </div>
  );
}
