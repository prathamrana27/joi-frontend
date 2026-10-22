import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../state/auth.jsx";
import { TextArea } from "../components/ui/Glass.jsx";
import {
  IconSend,
  IconPlus,
  IconLogout,
  IconClose,
  IconActivity,
  IconTrash,
  IconSettings,
  IconMic,
  IconStop,
  IconSpeaker,
  IconSpeakerOff,
} from "../components/ui/Icons.jsx";
import Settings from "../components/Settings.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import Markdown from "../components/ui/Markdown.jsx";
import { LOGO_ICON } from "../assets/logos.js";
import { stripToolCalls, toolLabel } from "../lib/toolText.js";
import { speakText } from "../lib/speech.js";
import MemorySuggestionBar from "../components/MemorySuggestionBar.jsx";
import UndoChip from "../components/UndoChip.jsx";
import Logo from "../components/ui/Logo.jsx";
import { useNotifications, Toasts, NotificationBell } from "../components/Notifications.jsx";

function newConversationId() {
  if (crypto?.randomUUID) return `conv_${crypto.randomUUID()}`;
  return `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const SUGGESTIONS = [
  "Summarize today's news",
  "Draft a polite email",
  "What's on my calendar?",
  "Search the web for me",
];

// Inline gradient/colors — guaranteed to render regardless of CSS-class cache state.
const CLAY = "linear-gradient(135deg,#e68a67 0%,#d97757 55%,#c45f3d 120%)";
const INK = "#17150f";
const INK_MUTED = "#595247";
const INK_FAINT = "#857d70";

const STEP_DOT = { run: "bg-clay", ok: "bg-sage", wait: "bg-amber-500", err: "bg-clay-700" };
const STEP_STATUS = { run: "Running", ok: "Done", wait: "Needs approval", err: "Failed" };

// The backend records a paused step as "Tool 'x' requires approval before execution.
// Approval ID: apr_…". On reload, turn that back into an approval card (with buttons
// only if it's still pending) and drop turns that were nothing but a hidden tool call.
const APPROVAL_TEXT_RE = /^Tool '([\w-]+)' requires approval before execution\. Approval ID: (apr_\w+)/;

function restoreMessages(raw, pendingById) {
  const out = [];
  for (const m of raw) {
    const content = String(m.content || "");
    const match = m.role === "assistant" && content.match(APPROVAL_TEXT_RE);
    if (match) {
      const p = pendingById.get(match[2]);
      out.push({
        role: "assistant",
        content: "",
        approval: { id: match[2], tool: match[1], args: p?.tool_args || {}, status: p ? "pending" : "closed" },
      });
    } else if (m.role === "user" || stripToolCalls(content)) {
      out.push({ role: m.role, content });
    }
  }
  return out;
}

// What exactly is being approved, in a readable form (the user should see the real arguments).
function approvalSummary(args) {
  const parts = Object.entries(args || {})
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  const s = parts.join("\n");
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}


function ApprovalCard({ approval, disabled, onDecide }) {
  const label = toolLabel(approval.tool);
  const summary = approvalSummary(approval.args);
  const status = approval.status;

  if (status === "approved" || status === "denied" || status === "closed") {
    const text =
      status === "approved" ? `Approved: ${label}` : status === "denied" ? `Denied: ${label}` : `Approval for ${label} was handled`;
    return <div className="text-sm text-ink-faint">{text}</div>;
  }

  return (
    <div className="mt-1 min-w-[260px]">
      <div className="text-[0.95rem] font-semibold text-ink">Allow JOI to use {label}?</div>
      <div className="mt-0.5 text-xs text-ink-faint">Nothing happens until you approve.</div>
      {summary && (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-ink/5 px-3 py-2 font-mono text-xs leading-relaxed text-ink-soft">
          {summary}
        </pre>
      )}
      {approval.error && <div className="mt-2 text-xs text-clay-700">{approval.error}</div>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onDecide("approved")}
          disabled={disabled || status === "deciding"}
          style={{ backgroundImage: CLAY }}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-clay transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {status === "deciding" ? "Working…" : "Approve"}
        </button>
        <button
          onClick={() => onDecide("denied")}
          disabled={disabled || status === "deciding"}
          className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm font-medium text-ink-soft transition hover:border-ink/30 hover:text-ink disabled:opacity-60"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { token, user, signOut } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [conversationId, setConversationId] = useState(() => newConversationId());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState(0); // bumps after each answer (memory suggestions)
  const [workflow, setWorkflow] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const abortRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const ttsOnRef = useRef(false);
  ttsOnRef.current = ttsOn;

  const initials = (user?.first_name?.[0] || user?.email?.[0] || "U").toUpperCase();
  const notif = useNotifications(token);

  useEffect(() => {
    api.listSessions(token).then((r) => setSessions(r.sessions || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // auto-grow textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  async function openSession(id) {
    try {
      const [s, pending] = await Promise.all([
        api.getSession(token, id),
        api.getApprovals(token).catch(() => ({ approvals: [] })),
      ]);
      const pendingById = new Map((pending.approvals || []).map((a) => [a.approval_id, a]));
      setConversationId(s.session_id);
      setMessages(restoreMessages(s.messages || [], pendingById));
      setWorkflow([]);
    } catch { /* ignore */ }
  }

  // "Open full app" from the quick popup: show that conversation here.
  useEffect(() => {
    return window.joiDesktop?.onDesktopEvent?.((evt) => {
      if (evt?.name !== "open_session" || !evt.payload?.id) return;
      api.listSessions(token).then((r) => setSessions(r.sessions || [])).catch(() => {});
      openSession(evt.payload.id);
    });
  }, [token]);

  function startNewChat() {
    abortRef.current?.abort();
    setConversationId(newConversationId());
    setMessages([]);
    setWorkflow([]);
  }

  async function doDelete(id) {
    const prev = sessions;
    setSessions((list) => list.filter((s) => s.session_id !== id)); // optimistic
    try {
      await api.deleteSession(token, id);
      if (id === conversationId) startNewChat();
    } catch {
      setSessions(prev); // restore on failure
    }
  }

  function patchMessage(i, fn) {
    setMessages((p) => {
      const c = [...p];
      c[i] = fn(c[i]);
      return c;
    });
  }

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setWorkflow([]);

    const history = messages
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages, { role: "user", content }, { role: "assistant", content: "" }];
    setMessages(next);
    await streamInto(next.length - 1, (opts) =>
      api.streamChat({ token, conversationId, message: content, history, ...opts })
    );
  }

  // Approve or deny a paused tool call from the card in the chat. Approving runs the
  // exact call that was shown and lets JOI finish the task in a new reply.
  async function decideApproval(i, decision) {
    const approval = messages[i]?.approval;
    if (!approval || busy) return;
    patchMessage(i, (m) => ({ ...m, approval: { ...approval, status: "deciding" } }));
    try {
      await api.decideApproval(token, approval.id, decision);
    } catch (err) {
      patchMessage(i, (m) => ({ ...m, approval: { ...approval, status: "pending", error: err.message } }));
      return;
    }
    patchMessage(i, (m) => ({ ...m, approval: { ...approval, status: decision } }));
    if (decision === "denied") {
      setMessages((p) => [...p, { role: "assistant", content: "Okay, I won't do that." }]);
      return;
    }
    setWorkflow([]);
    const ai = messages.length;
    setMessages((p) => [...p, { role: "assistant", content: "" }]);
    await streamInto(ai, (opts) =>
      api.resumeChat({ token, conversationId, approvalId: approval.id, ...opts })
    );
  }

  async function streamInto(ai, start) {
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let finalText = "";

    try {
      await start({
        signal: controller.signal,
        onEvent(event, data) {
          if (event === "ai_chunk" && data.chunk) {
            finalText += data.chunk;
            patchMessage(ai, (m) => ({ ...m, content: m.content + data.chunk }));
          } else if (event === "ai_reset") {
            // The backend discarded an ungrounded draft and is regenerating it.
            finalText = "";
            patchMessage(ai, (m) => ({ ...m, content: "" }));
          } else if (event === "workflow_step_started") {
            setWorkflow((w) => [...w, { step: data.step_index, tool: data.tool, k: "run" }]);
          } else if (event === "workflow_step_completed") {
            // One row per step: flip the running row to its outcome rather than adding another.
            const failed = String(data.result || "").trimStart().startsWith("Error");
            setWorkflow((w) =>
              w.map((s) =>
                s.step === data.step_index ? { ...s, k: failed ? "err" : "ok", detail: data.result } : s
              )
            );
            // The model's follow-up answer streams into the same bubble; keep it on its own line.
            patchMessage(ai, (m) => ({ ...m, content: m.content + "\n\n" }));
          } else if (event === "undo_available") {
            patchMessage(ai, (m) => ({ ...m, undo: { ...data, at: Date.now() } }));
          } else if (event === "workflow_step_requires_approval") {
            setWorkflow((w) =>
              w.map((s) => (s.step === data.step_index ? { ...s, k: "wait", detail: "Waiting for your approval" } : s))
            );
            patchMessage(ai, (m) => ({
              ...m,
              approval: { id: data.approval_id, tool: data.tool, args: data.args, status: "pending" },
            }));
          } else if (event === "error") {
            setWorkflow((w) => [...w, { step: `err-${w.length}`, tool: "error", k: "err", detail: data.message }]);
          }
        },
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        patchMessage(ai, (m) => ({ ...m, content: m.content || `⚠ ${err.message}` }));
      }
    } finally {
      setBusy(false);
      setTurn((t) => t + 1);
      abortRef.current = null;
      api.listSessions(token).then((r) => setSessions(r.sessions || [])).catch(() => {});
    }

    if (ttsOnRef.current && finalText.trim()) playTts(finalText);
  }

  // Cloud voice when configured, otherwise Windows' built-in voices (works offline).
  const playTts = (text) => speakText(token, text, { maxChars: 4000 });

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
          if (r.text) setInput((v) => (v ? v + " " : "") + r.text);
        } catch { /* STT unavailable */ } finally {
          setTranscribing(false);
          taRef.current?.focus();
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const canSend = !!input.trim() && !busy;

  const runningStep = busy ? [...workflow].reverse().find((s) => s.k === "run") : null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-[272px] flex-col border-r border-ink/10 bg-cream/50 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 pb-3 pt-6">
          <Logo size={34} />
          <button
            onClick={startNewChat}
            className="grid h-9 w-9 place-items-center rounded-full border border-ink/12 bg-white text-ink-soft shadow-soft transition hover:-translate-y-0.5 hover:border-clay/50 hover:text-clay-600"
            title="New chat"
          >
            <IconPlus />
          </button>
        </div>

        <div className="px-5 pb-2 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Recent
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {sessions.length === 0 && (
            <div className="px-3 py-3 text-sm text-ink-faint">No conversations yet.</div>
          )}
          {sessions.map((s) => {
            const active = s.session_id === conversationId;
            return (
              <div
                key={s.session_id}
                className={`group relative flex items-center rounded-xl pr-1 transition hover:bg-white/70 ${
                  active ? "bg-white shadow-soft" : ""
                }`}
              >
                <button
                  onClick={() => openSession(s.session_id)}
                  style={{ color: active ? INK : INK_MUTED }}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[0.9rem] ${
                    active ? "font-medium" : ""
                  }`}
                  title={s.title}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: active ? "#d97757" : "rgba(23,21,15,0.2)" }}
                  />
                  <span className="truncate">{s.title || "New chat"}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(s.session_id); }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint opacity-0 transition hover:bg-ink/5 hover:text-clay-600 focus:opacity-100 group-hover:opacity-100"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <IconTrash width={15} height={15} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-ink/10 px-4 py-4">
          <div
            className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-white shadow-clay"
            style={{ backgroundImage: CLAY }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" style={{ color: INK }}>
              {user?.display_name || user?.first_name || "You"}
            </div>
            <div className="truncate text-xs" style={{ color: INK_FAINT }}>{user?.email}</div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-ink/5 hover:text-ink"
            title="Settings"
          >
            <IconSettings />
          </button>
          <button
            onClick={signOut}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-ink/5 hover:text-clay-600"
            title="Log out"
          >
            <IconLogout />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-8 py-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-soft">
            <img src={LOGO_ICON} alt="" className="h-4 w-4" />
            JOI
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell unread={notif.unread} items={notif.items} markAllRead={notif.markAllRead} />
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white/70 px-4 py-2 text-sm font-medium text-ink-soft shadow-soft transition hover:border-clay/50 hover:text-clay-600"
            >
              <IconActivity width={16} height={16} />
              Activity{workflow.length ? ` · ${workflow.length}` : ""}
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="mx-auto w-full max-w-3xl">
            {messages.length === 0 ? (
              <div className="flex min-h-[56vh] flex-col items-center justify-center text-center">
                <img
                  src={LOGO_ICON}
                  alt="JOI"
                  className="mb-6 h-16 w-16 drop-shadow-lg"
                />
                <h1
                  className="font-display text-[3.25rem] font-semibold leading-none tracking-tight"
                  style={{ color: "#17150f" }}
                >
                  Good to see you{user?.first_name ? `, ${user.first_name}` : ""}.
                </h1>
                <p className="mt-5 max-w-md text-[0.98rem] text-ink-soft">
                  Ask anything — I can search the web, manage files, email, and more.
                </p>
                <div className="mt-9 flex flex-wrap justify-center gap-2.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-ink/12 bg-white/70 px-4 py-2 text-sm text-ink-soft shadow-soft transition hover:-translate-y-0.5 hover:border-clay/50 hover:text-clay-600"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5 py-8">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <img
                        src={LOGO_ICON}
                        alt="JOI"
                        className="mr-3 mt-0.5 h-8 w-8 shrink-0 drop-shadow-sm"
                      />
                    )}
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[76%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-ink px-5 py-3 text-[0.95rem] leading-relaxed text-cream shadow-soft"
                          : "max-w-[80%] rounded-[22px] rounded-tl-md border border-ink/10 bg-white/85 px-5 py-3 text-[0.95rem] leading-relaxed text-ink shadow-soft"
                      }
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : m.approval && !stripToolCalls(m.content) ? (
                        <ApprovalCard
                          approval={m.approval}
                          disabled={busy}
                          onDecide={(d) => decideApproval(i, d)}
                        />
                      ) : stripToolCalls(m.content) ? (
                        <>
                          <Markdown>{stripToolCalls(m.content)}</Markdown>
                          {m.approval && (
                            <ApprovalCard
                              approval={m.approval}
                              disabled={busy}
                              onDecide={(d) => decideApproval(i, d)}
                            />
                          )}
                        </>
                      ) : busy && i === messages.length - 1 ? (
                        <span className="inline-flex items-center gap-2.5">
                          <span className="inline-flex gap-1">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-clay/60 [animation-delay:-0.2s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-clay/60 [animation-delay:-0.1s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-clay/60" />
                          </span>
                          {runningStep && (
                            <span className="text-sm text-ink-faint">Using {toolLabel(runningStep.tool)}…</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink/60">
                          Sorry, I couldn't finish that one. Could you rephrase it?
                        </span>
                      )}
                      {m.undo && <UndoChip token={token} undo={m.undo} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="px-6 pb-6 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <MemorySuggestionBar token={token} turn={turn} />
            <div className="flex items-end gap-2 rounded-[26px] border border-ink/12 bg-white/90 p-2 pl-5 shadow-lift backdrop-blur-sm transition focus-within:border-clay/50 focus-within:ring-4 focus-within:ring-clay/12">
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={recording ? "Listening…" : transcribing ? "Transcribing…" : "Message JOI…"}
                className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-[0.98rem] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={() => setTtsOn((v) => !v)}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${
                  ttsOn ? "border-clay/40 bg-clay-50 text-clay-700" : "border-ink/12 bg-white text-ink-faint hover:text-ink"
                }`}
                title={ttsOn ? "Voice replies: on" : "Voice replies: off"}
                aria-label="Toggle spoken replies"
              >
                {ttsOn ? <IconSpeaker width={18} height={18} /> : <IconSpeakerOff width={18} height={18} />}
              </button>
              <button
                onClick={toggleRecording}
                disabled={transcribing}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${
                  recording ? "animate-pulse border-clay/50 bg-clay text-white" : "border-ink/12 bg-white text-ink-faint hover:text-ink"
                }`}
                title={recording ? "Stop recording" : "Voice input"}
                aria-label="Voice input"
              >
                {recording ? <IconStop width={18} height={18} /> : <IconMic width={18} height={18} />}
              </button>
              <button
                onClick={() => send()}
                disabled={!canSend}
                style={canSend ? { backgroundImage: CLAY } : { background: "rgba(23,21,15,0.14)" }}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-clay transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
                title="Send"
                aria-label="Send message"
              >
                <IconSend width={19} height={19} />
              </button>
            </div>
            <div className="mt-2.5 text-center text-xs text-ink-faint">
              Enter to send · Shift + Enter for a new line
            </div>
          </div>
        </div>

      </main>

      {/* Activity panel: docked beside the chat (it narrows the chat instead of covering it) */}
      {drawerOpen && (
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-ink/10 bg-cream animate-fade">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div>
              <div className="font-display text-lg font-semibold text-ink">Activity</div>
              <div className="text-xs text-ink-faint">What JOI did for your last message</div>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-ink/5 hover:text-ink"
              title="Close"
            >
              <IconClose />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
            {workflow.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-ink-faint">
                Actions appear here as JOI works.
              </div>
            ) : (
              <ol className="relative space-y-3 border-l border-ink/10 pl-5">
                {workflow.map((w) => (
                  <li key={w.step} className="relative">
                    <span
                      className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-cream ${
                        STEP_DOT[w.k]
                      } ${w.k === "run" ? "animate-pulse" : ""}`}
                    />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{toolLabel(w.tool)}</span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">
                        {STEP_STATUS[w.k]}
                      </span>
                    </div>
                    {w.detail && (
                      <div className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-ink-faint">
                        {String(w.detail)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      )}

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        token={token}
        user={user}
        onSignOut={signOut}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete conversation?"
        message="This conversation will be permanently removed. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => { doDelete(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />

      <Toasts toasts={notif.toasts} onDismiss={notif.dismissToast} />
    </div>
  );
}
