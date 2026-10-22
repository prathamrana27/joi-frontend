import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// "Undo" under an answer after JOI sends an email, deletes an event or overwrites a file.
// The backend keeps the action reversible for `seconds` (emails are only sent once it ends);
// see tools/undo.py and POST /undo/{id}.
export default function UndoChip({ token, undo, compact = false }) {
  const deadline = undo.at + undo.seconds * 1000;
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [state, setState] = useState("ready"); // ready | working | done | failed
  const [note, setNote] = useState("");

  useEffect(() => {
    if (state !== "ready") return undefined;
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 500);
    return () => clearInterval(id);
  }, [deadline, state]);

  async function run() {
    setState("working");
    try {
      const r = await api.undo(token, undo.undo_id);
      setNote(r.message || "Undone.");
      setState("done");
    } catch (err) {
      setNote(err.message || "Couldn't undo that.");
      setState("failed");
    }
  }

  const size = compact ? "mt-2 px-2.5 py-1 text-[0.75rem]" : "mt-3 px-3 py-1.5 text-[0.8rem]";
  if (state === "done" || state === "failed") {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream/70 text-ink-soft ${size}`}>
        <span aria-hidden="true">{state === "done" ? "↩" : "⚠"}</span>
        {note}
      </div>
    );
  }
  if (left <= 0) {
    const done = undo.kind === "email_send" ? "Sent" : "Done";
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream/70 text-ink-faint ${size}`}>
        ✓ {done}
      </div>
    );
  }
  const mins = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;
  return (
    <button
      type="button"
      onClick={run}
      disabled={state === "working"}
      className={`inline-flex items-center gap-2 rounded-full border border-clay/40 bg-clay-50 font-medium text-clay-700 transition hover:bg-clay/15 disabled:opacity-60 ${size}`}
      title={undo.label}
    >
      <span aria-hidden="true">↩</span>
      {state === "working" ? "Undoing…" : `Undo ${undo.label ? `“${undo.label}”` : ""}`}
      <span className="tabular-nums text-ink-faint">{mins}</span>
    </button>
  );
}
