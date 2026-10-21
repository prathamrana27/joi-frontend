import { useEffect, useRef, useState } from "react";
import { api, loadAuth } from "../lib/api.js";
import { useAuth } from "../state/auth.jsx";
import Markdown from "../components/ui/Markdown.jsx";
import { stripToolCalls, toolLabel } from "../lib/toolText.js";
import { IconSend, IconMic, IconStop, IconClose, IconNewChat } from "../components/ui/Icons.jsx";
import Mascot from "./Mascot.jsx";
import "./quick.css";

// The quick assistant: JOI in a small corner popup. Ask by typing or by voice; spoken
// questions get spoken answers. "Open full app" continues the same conversation there.

const CLAY = "linear-gradient(135deg,#e68a67 0%,#d97757 55%,#c45f3d 120%)";

const SUGGESTIONS = ["Any new emails?", "What's on my calendar today?", "How's my PC doing?", "Play or pause my music"];

const newConversationId = () =>
  crypto?.randomUUID ? `conv_quick_${crypto.randomUUID()}` : `conv_quick_${Date.now()}`;

const IconExpand = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-7 7" />
    <path d="M10 20H4v-6" />
    <path d="M4 20l7-7" />
  </svg>
);

function approvalSummary(args) {
  const s = Object.entries(args || {})
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

export default function QuickApp() {
  const { ready, token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [happy, setHappy] = useState(false);
  const [conversationId, setConversationId] = useState(newConversationId);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);

  // Shown again from the shortcut: pick up a sign-in that happened in the full app.
  useEffect(() => {
    return window.joiDesktop?.onQuickShown?.(() => {
      const stored = loadAuth()?.access_token || null;
      if (stored !== token) window.location.reload();
      else setTimeout(() => inputRef.current?.focus(), 60);
    });
  }, [token]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (recording) recRef.current?.stop();
      else window.joiDesktop?.quickHide?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [ready]);

  const patch = (i, fn) =>
    setMessages((p) => {
      const c = [...p];
      c[i] = fn(c[i]);
      return c;
    });

  async function speak(text) {
    const clean = stripToolCalls(text).replace(/[*_`#>]/g, "").trim();
    if (!clean) return;
    try {
      const blob = await api.speak(token, clean.slice(0, 1500));
      audioRef.current?.pause();
      audioRef.current = new Audio(URL.createObjectURL(blob));
      audioRef.current.play().catch(() => {});
    } catch {
      /* no voice provider configured: the text answer is still shown */
    }
  }

  async function streamInto(ai, start, { voice = false } = {}) {
    setBusy(true);
    setStep(null);
    let finalText = "";
    try {
      await start({
        onEvent(event, data) {
          if (event === "ai_chunk" && data.chunk) {
            finalText += data.chunk;
            patch(ai, (m) => ({ ...m, content: m.content + data.chunk }));
          } else if (event === "ai_reset") {
            finalText = "";
            patch(ai, (m) => ({ ...m, content: "" }));
          } else if (event === "workflow_step_started") {
            setStep(data.tool);
          } else if (event === "workflow_step_completed") {
            setStep(null);
            patch(ai, (m) => ({ ...m, content: m.content + "\n\n" }));
          } else if (event === "workflow_step_requires_approval") {
            setStep(null);
            patch(ai, (m) => ({
              ...m,
              approval: { id: data.approval_id, tool: data.tool, args: data.args, status: "pending" },
            }));
          }
        },
      });
    } catch (err) {
      patch(ai, (m) => ({ ...m, content: m.content || `Sorry, something went wrong: ${err.message}` }));
    } finally {
      setBusy(false);
      setStep(null);
      setHappy(true);
      setTimeout(() => setHappy(false), 1800);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (voice && finalText.trim()) speak(finalText);
  }

  async function send(text, { voice = false } = {}) {
    const content = (text ?? input).trim();
    if (!content || busy || !token) return;
    setInput("");
    const history = messages.filter((m) => m.content).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages, { role: "user", content }, { role: "assistant", content: "" }];
    setMessages(next);
    await streamInto(
      next.length - 1,
      (opts) => api.streamChat({ token, conversationId, message: content, history, ...opts }),
      { voice }
    );
  }

  async function decide(i, decision) {
    const approval = messages[i]?.approval;
    if (!approval || busy) return;
    patch(i, (m) => ({ ...m, approval: { ...approval, status: "deciding" } }));
    try {
      await api.decideApproval(token, approval.id, decision);
    } catch {
      patch(i, (m) => ({ ...m, approval: { ...approval, status: "pending" } }));
      return;
    }
    patch(i, (m) => ({ ...m, approval: { ...approval, status: decision } }));
    if (decision === "denied") {
      setMessages((p) => [...p, { role: "assistant", content: "Okay, I won't do that." }]);
      return;
    }
    const ai = messages.length;
    setMessages((p) => [...p, { role: "assistant", content: "" }]);
    await streamInto(ai, (opts) => api.resumeChat({ token, conversationId, approvalId: approval.id, ...opts }));
  }

  async function toggleRecording() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const r = await api.transcribeAudio(token, blob, "speech.webm");
          // Spoken question: send it straight away and answer out loud.
          if (r.text?.trim()) send(r.text, { voice: true });
        } catch {
          setInput((v) => v || "");
        } finally {
          setTranscribing(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  function startOver() {
    setMessages([]);
    setConversationId(newConversationId());
    inputRef.current?.focus();
  }

  const last = messages[messages.length - 1];
  const lastHasText = last?.role === "assistant" && stripToolCalls(last.content);
  const mood = recording
    ? "listening"
    : transcribing || (busy && !lastHasText)
      ? "thinking"
      : busy
        ? "talking"
        : happy
          ? "happy"
          : "idle";

  const firstName = user?.first_name || user?.display_name?.split(" ")[0] || "";
  const empty = messages.length === 0;

  return (
    <div className="quick-shell">
      <div className="quick-panel">
        <div className="quick-bar">
          <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">JOI</span>
          <div className="flex items-center gap-1">
            {!empty && (
              <button onClick={startOver} title="New conversation" className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition hover:bg-ink/5 hover:text-ink">
                <IconNewChat width={16} height={16} />
              </button>
            )}
            <button
              onClick={() => window.joiDesktop?.openFullApp?.(empty ? "" : conversationId)}
              title="Open the full app"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition hover:bg-ink/5 hover:text-ink"
            >
              <IconExpand width={15} height={15} />
            </button>
            <button
              onClick={() => window.joiDesktop?.quickHide?.()}
              title="Hide (Esc)"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition hover:bg-ink/5 hover:text-ink"
            >
              <IconClose width={16} height={16} />
            </button>
          </div>
        </div>

        {/* Mascot: big when idle, compact once a conversation is going */}
        <div className={`flex shrink-0 ${empty ? "flex-col items-center px-6 pt-2" : "items-center gap-3 px-5 pb-1"}`}>
          <Mascot mood={mood} size={empty ? 124 : 64} />
          {!empty && (
            <div className="min-w-0 text-sm text-ink-muted">
              {recording
                ? "Listening… tap stop when you're done"
                : transcribing
                  ? "Getting what you said…"
                  : step
                    ? `Using ${toolLabel(step)}…`
                    : busy
                      ? "On it…"
                      : "Anything else?"}
            </div>
          )}
          {empty && (
            <div className="quick-bubble mt-3 w-full text-center">
              {!ready ? (
                "One moment…"
              ) : !token ? (
                <>
                  <div className="font-medium">Sign in to JOI first.</div>
                  <button
                    onClick={() => window.joiDesktop?.openFullApp?.()}
                    className="mt-2 rounded-full px-4 py-1.5 text-sm font-medium text-white"
                    style={{ backgroundImage: CLAY }}
                  >
                    Open JOI
                  </button>
                </>
              ) : recording ? (
                "I'm listening…"
              ) : transcribing ? (
                "Getting what you said…"
              ) : (
                <>
                  <div className="font-display text-[1.15rem] font-semibold leading-snug">
                    Hi{firstName ? ` ${firstName}` : ""}! What do you want to do today?
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">Type below or tap the mic and just say it.</div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Conversation / suggestions */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
          {empty && token ? (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink/10 bg-white/80 px-3 py-1.5 text-[0.8rem] text-ink-soft transition hover:border-clay/50 hover:text-clay-700"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[0.88rem] text-cream">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="max-w-[95%] text-[0.88rem] leading-relaxed text-ink">
                    {stripToolCalls(m.content) && (
                      <div className="rounded-2xl rounded-tl-md border border-ink/10 bg-white/90 px-3.5 py-2.5">
                        <Markdown>{stripToolCalls(m.content)}</Markdown>
                      </div>
                    )}
                    {m.approval && <QuickApproval approval={m.approval} disabled={busy} onDecide={(d) => decide(i, d)} />}
                    {!stripToolCalls(m.content) && !m.approval && busy && i === messages.length - 1 && (
                      <span className="inline-flex gap-1 px-1 py-2">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-clay/60 [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-clay/60 [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-clay/60" />
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 pb-3">
          <div className="flex items-center gap-1.5 rounded-full border border-ink/12 bg-white/95 p-1.5 pl-4 shadow-soft focus-within:border-clay/50">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={!token}
              placeholder={recording ? "Listening…" : transcribing ? "Transcribing…" : "Ask JOI anything…"}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[0.92rem] text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              onClick={toggleRecording}
              disabled={!token || transcribing || busy}
              title={recording ? "Stop" : "Speak"}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
                recording ? "animate-pulse text-white" : "text-ink-faint hover:bg-ink/5 hover:text-ink"
              }`}
              style={recording ? { backgroundImage: CLAY } : undefined}
            >
              {recording ? <IconStop width={16} height={16} /> : <IconMic width={17} height={17} />}
            </button>
            <button
              onClick={() => send()}
              disabled={!input.trim() || busy || !token}
              title="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-40"
              style={{ backgroundImage: CLAY }}
            >
              <IconSend width={16} height={16} />
            </button>
          </div>
          <div className="mt-1.5 text-center text-[0.68rem] text-ink-faint">Esc to hide · Ctrl + Alt + J to bring me back</div>
        </div>
      </div>
    </div>
  );
}

function QuickApproval({ approval, disabled, onDecide }) {
  const label = toolLabel(approval.tool);
  if (approval.status === "approved" || approval.status === "denied") {
    return (
      <div className="mt-1.5 text-xs text-ink-faint">
        {approval.status === "approved" ? `Approved: ${label}` : `Denied: ${label}`}
      </div>
    );
  }
  const summary = approvalSummary(approval.args);
  return (
    <div className="mt-1.5 rounded-2xl border border-clay/35 bg-white px-3.5 py-3">
      <div className="text-[0.88rem] font-semibold text-ink">Allow JOI to use {label}?</div>
      {summary && (
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-ink/5 px-2.5 py-1.5 font-mono text-[0.7rem] text-ink-soft">
          {summary}
        </pre>
      )}
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={() => onDecide("approved")}
          disabled={disabled || approval.status === "deciding"}
          className="rounded-full px-3.5 py-1 text-[0.8rem] font-medium text-white disabled:opacity-60"
          style={{ backgroundImage: CLAY }}
        >
          {approval.status === "deciding" ? "Working…" : "Approve"}
        </button>
        <button
          onClick={() => onDecide("denied")}
          disabled={disabled || approval.status === "deciding"}
          className="rounded-full border border-ink/15 bg-white px-3.5 py-1 text-[0.8rem] font-medium text-ink-soft disabled:opacity-60"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
