import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { Button, Input, TextArea, Field } from "./ui/Glass.jsx";
import { IconClose, IconTrash, IconLogout } from "./ui/Icons.jsx";

const TABS = [
  { k: "profile", label: "Profile" },
  { k: "connectors", label: "Connectors" },
  { k: "memory", label: "Assistant Memory" },
  { k: "permissions", label: "Permissions" },
  { k: "automations", label: "Automations" },
  { k: "knowledge", label: "Knowledge" },
  { k: "audit", label: "Activity Log" },
];

function Note({ children, tone = "ok" }) {
  if (!children) return null;
  const c = tone === "err" ? "border-clay/30 bg-clay-50 text-clay-700" : "border-sage/30 bg-sage/10 text-sage";
  return <div className={`rounded-xl border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

function ProfilePanel({ user, onSignOut }) {
  const initials = (user?.first_name?.[0] || user?.email?.[0] || "U").toUpperCase();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="grid h-16 w-16 place-items-center rounded-2xl text-xl font-semibold text-white shadow-clay"
          style={{ backgroundImage: "linear-gradient(135deg,#e68a67,#d97757 55%,#c45f3d 120%)" }}
        >
          {initials}
        </div>
        <div>
          <div className="font-display text-xl font-semibold text-ink">
            {user?.display_name || `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "You"}
          </div>
          <div className="text-sm text-ink-muted">{user?.email}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-faint">First name</div>
          <div className="mt-1 text-ink">{user?.first_name || "—"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-faint">Last name</div>
          <div className="mt-1 text-ink">{user?.last_name || "—"}</div>
        </div>
      </div>
      <Button variant="outline" onClick={onSignOut} className="gap-2">
        <IconLogout width={16} height={16} /> Log out
      </Button>
    </div>
  );
}

function ConnectorRow({ token, provider, name, desc }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const load = () => api.integrationStatus(token, provider).then(setStatus).catch(() => {});
  useEffect(() => {
    load();
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [token]);

  async function connect() {
    setBusy(true);
    try {
      const { authorize_url } = await api.integrationConnectUrl(token, provider);
      // Desktop: use the system browser (Google blocks sign-in inside embedded app windows).
      if (window.joiDesktop?.openExternal) window.joiDesktop.openExternal(authorize_url);
      else window.open(authorize_url, "_blank", "noopener");
      // Poll for connection for ~60s while the user authorizes in the other tab.
      let tries = 0;
      pollRef.current = setInterval(async () => {
        tries += 1;
        const s = await api.integrationStatus(token, provider).catch(() => null);
        if (s) setStatus(s);
        if (s?.connected || tries > 30) { clearInterval(pollRef.current); setBusy(false); }
      }, 2000);
    } catch (e) {
      setStatus({ error: e.message });
      setBusy(false);
    }
  }
  async function disconnect() {
    await api.integrationDisconnect(token, provider).catch(() => {});
    load();
  }

  const connected = status?.connected;
  const configured = status?.configured;
  const detail = status?.email || status?.team || "";

  return (
    <div className="card flex items-center justify-between p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{name}</span>
          {connected && (
            <span className="rounded-full bg-sage/15 px-2 py-0.5 text-xs font-medium text-sage">Connected</span>
          )}
        </div>
        <div className="truncate text-sm text-ink-muted">{connected && detail ? detail : desc}</div>
        {status && !configured && (
          <div className="mt-1 text-xs text-clay-700">Not configured on the server yet.</div>
        )}
      </div>
      {connected ? (
        <Button variant="ghost" onClick={disconnect}>Disconnect</Button>
      ) : (
        <Button onClick={connect} disabled={busy || (status && !configured)} className="px-4 py-2">
          {busy ? "Waiting…" : "Connect"}
        </Button>
      )}
    </div>
  );
}

// Phone access through the user's own Telegram bot: paste the bot token, then send the
// pairing code from the phone. Only that one chat can talk to JOI afterwards.
function TelegramConnector({ token }) {
  const [status, setStatus] = useState(null);
  const [botToken, setBotToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.integrationStatus(token, "telegram").then(setStatus).catch(() => {});
  useEffect(() => {
    load();
  }, [token]);

  // While waiting for the phone to send the code, check every few seconds.
  useEffect(() => {
    if (!status?.connected || status?.paired) return undefined;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [status?.connected, status?.paired]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      setStatus(await api.telegramConnect(token, botToken.trim()));
      setBotToken("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function newCode() {
    setError("");
    try {
      setStatus(await api.telegramNewCode(token));
    } catch (e) {
      setError(e.message);
    }
  }

  async function disconnect() {
    await api.integrationDisconnect(token, "telegram").catch(() => {});
    load();
  }

  const header = (
    <div className="flex items-center gap-2">
      <span className="font-medium text-ink">Phone (Telegram)</span>
      {status?.paired && (
        <span className="rounded-full bg-sage/15 px-2 py-0.5 text-xs font-medium text-sage">Connected</span>
      )}
    </div>
  );

  if (status?.paired) {
    return (
      <div className="card flex items-center justify-between p-4">
        <div className="min-w-0">
          {header}
          <div className="truncate text-sm text-ink-muted">
            Message {status.bot || "your bot"} from your phone. Sensitive actions wait for your approval here.
          </div>
        </div>
        <Button variant="ghost" onClick={disconnect}>Disconnect</Button>
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="card space-y-3 p-4">
        {header}
        {status.pairing_code ? (
          <>
            <p className="text-sm text-ink-muted">
              On your phone, open <span className="font-medium text-ink">{status.bot}</span> in Telegram and send this code:
            </p>
            <div className="font-display text-3xl font-semibold tracking-[0.3em] text-clay-700">{status.pairing_code}</div>
            <p className="flex items-center gap-2 text-xs text-ink-faint">
              <span className="h-2 w-2 animate-ping rounded-full bg-clay" /> Waiting for your phone… (the code works for 15 minutes)
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-muted">The pairing code expired.</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={newCode} className="px-4 py-2">New code</Button>
          <Button variant="ghost" onClick={disconnect}>Cancel</Button>
        </div>
        <Note tone="err">{error}</Note>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      {header}
      <p className="text-sm text-ink-muted">Reach JOI from your phone through your own Telegram bot.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>In Telegram, message <span className="font-medium text-ink">@BotFather</span> and send <code>/newbot</code>.</li>
        <li>Pick any name. BotFather replies with a token like <code>123456:ABC-…</code>.</li>
        <li>Paste that token here.</li>
      </ol>
      <div className="flex gap-2">
        <Input
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="Bot token from @BotFather"
          className="flex-1"
          type="password"
          autoComplete="off"
        />
        <Button onClick={connect} disabled={busy || botToken.trim().length < 20} className="px-4 py-2">
          {busy ? "Checking…" : "Connect"}
        </Button>
      </div>
      <Note tone="err">{error}</Note>
    </div>
  );
}

function ConnectorsPanel({ token }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Connect your own accounts. Each connection uses your personal authorization — JOI never shares accounts between users.
      </p>
      <ConnectorRow token={token} provider="google" name="Google Workspace"
        desc="Gmail, Calendar, Drive, Docs, Sheets, Contacts" />
      <ConnectorRow token={token} provider="slack" name="Slack"
        desc="Send and read messages in your workspace" />
      <TelegramConnector token={token} />
    </div>
  );
}

function MemoryPanel({ token }) {
  const [prefs, setPrefs] = useState("");
  const [notes, setNotes] = useState("");
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getMemory(token).then((r) => {
      setPrefs(r.memory?.preferences || "");
      setNotes(r.memory?.notes || "");
    }).catch(() => {});
  }, [token]);

  async function save() {
    setBusy(true);
    try {
      await api.saveMemory(token, { preferences: prefs, notes });
      setNote({ t: "Saved.", tone: "ok" });
    } catch (e) {
      setNote({ t: e.message, tone: "err" });
    } finally {
      setBusy(false);
    }
  }
  async function clearAll() {
    if (!window.confirm("Clear all stored memory?")) return;
    await api.clearMemory(token).catch(() => {});
    setPrefs(""); setNotes(""); setNote({ t: "Cleared.", tone: "ok" });
  }

  return (
    <div className="space-y-5">
      <Field label="Assistant preferences">
        <TextArea rows={4} value={prefs} onChange={(e) => setPrefs(e.target.value)}
          placeholder='How should JOI behave? e.g. "be concise", "use Python for math"'
          className="rounded-2xl border border-ink/12 bg-cream-100/70 px-4 py-3" />
      </Field>
      <Field label="Personal notes">
        <TextArea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Facts JOI should remember about you."
          className="rounded-2xl border border-ink/12 bg-cream-100/70 px-4 py-3" />
      </Field>
      {note && <Note tone={note.tone}>{note.t}</Note>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        <Button variant="ghost" onClick={clearAll}>Clear all</Button>
      </div>
    </div>
  );
}

const TOOLS = [
  { key: "email", name: "Email", desc: "Send and read email via Gmail" },
  { key: "whatsapp", name: "WhatsApp", desc: "Send WhatsApp messages" },
  { key: "fs_write", name: "Write files", desc: "Create/overwrite files in the workspace" },
  { key: "app", name: "Open apps", desc: "Launch applications" },
  { key: "calendar", name: "Calendar & Tasks", desc: "Manage Google Calendar and Tasks" },
  { key: "open_path", name: "Open files / URLs", desc: "Open a file, folder, or website" },
  { key: "clipboard_write", name: "Write clipboard", desc: "Copy text to the clipboard" },
  { key: "window_close", name: "Close windows", desc: "Close application windows" },
  { key: "type_text", name: "Type text", desc: "Simulate keyboard typing" },
  { key: "press_keys", name: "Keyboard shortcuts", desc: "Send hotkeys (e.g. Ctrl+C)" },
  { key: "mouse_click", name: "Mouse control", desc: "Move and click the mouse" },
  { key: "power", name: "Power actions", desc: "Lock, sleep, restart, shut down" },
  { key: "shell", name: "Shell / Terminal", desc: "Run terminal commands (high risk)" },
];
const MODES = [
  { v: "allow", l: "Allow" },
  { v: "require_approval", l: "Ask every time" },
  { v: "deny", l: "Deny" },
];

function PermissionsPanel({ token }) {
  const [rules, setRules] = useState({});
  const [approvals, setApprovals] = useState([]);

  const load = () => {
    api.getPermissions(token).then((r) => setRules(r.rules || {})).catch(() => {});
    api.getApprovals(token).then((r) => setApprovals(r.approvals || [])).catch(() => {});
  };
  useEffect(load, [token]);

  async function change(tool, mode) {
    setRules((r) => ({ ...r, [tool]: mode }));
    await api.setPermission(token, tool, mode).catch(() => {});
  }
  async function decide(id, decision) {
    await api.decideApproval(token, id, decision).catch(() => {});
    load();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {TOOLS.map((t) => (
          <div key={t.key} className="card flex items-center justify-between p-4">
            <div>
              <div className="font-medium text-ink">{t.name}</div>
              <div className="text-sm text-ink-muted">{t.desc}</div>
            </div>
            <select
              value={rules[t.key] || "require_approval"}
              onChange={(e) => change(t.key, e.target.value)}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay/60"
            >
              {MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold text-ink">Pending approvals</div>
        {approvals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 px-4 py-5 text-center text-sm text-ink-faint">
            Nothing waiting for approval.
          </div>
        ) : (
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.approval_id} className="card flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{a.tool_name}</div>
                  <div className="truncate text-xs text-ink-muted">{JSON.stringify(a.tool_args)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button onClick={() => decide(a.approval_id, "approved")} className="px-3 py-1.5">Approve</Button>
                  <Button variant="ghost" onClick={() => decide(a.approval_id, "denied")}>Deny</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BriefingCard({ token }) {
  const [prefs, setPrefs] = useState({ enabled: false, time: "08:00", city: "" });
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getBriefing(token).then((r) => r.briefing && setPrefs(r.briefing)).catch(() => {});
  }, [token]);

  async function save(next) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    await api.setBriefing(token, { enabled: merged.enabled, time: merged.time, city: merged.city }).catch(() => {});
  }
  async function runNow() {
    setBusy(true); setNote(null);
    try {
      await api.runBriefing(token);
      setNote({ t: "Briefing sent — check your notifications.", tone: "ok" });
    } catch (e) {
      setNote({ t: e.message, tone: "err" });
    } finally { setBusy(false); }
  }

  return (
    <section>
      <div className="mb-3 font-display text-base font-semibold text-ink">Daily Briefing</div>
      <div className="card space-y-3 p-4">
        <p className="text-sm text-ink-muted">A morning summary — weather, your schedule, and unread email — pushed to your notifications.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={prefs.city} onChange={(e) => save({ city: e.target.value })} placeholder="Your city (for weather)" className="min-w-[160px] flex-1" />
          <input type="time" value={prefs.time} onChange={(e) => save({ time: e.target.value })}
            className="rounded-2xl border border-ink/12 bg-cream-100/70 px-3 py-2.5 text-sm text-ink outline-none focus:border-clay/60" />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={prefs.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
            Daily
          </label>
        </div>
        {note && <Note tone={note.tone}>{note.t}</Note>}
        <Button onClick={runNow} disabled={busy} className="px-4 py-2">{busy ? "Preparing…" : "Run briefing now"}</Button>
      </div>
    </section>
  );
}

function AutomationsPanel({ token }) {
  const [routines, setRoutines] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [rName, setRName] = useState("");
  const [rPrompt, setRPrompt] = useState("");
  const [rInterval, setRInterval] = useState(1440);
  const [remTitle, setRemTitle] = useState("");
  const [remDue, setRemDue] = useState("");

  const load = () => {
    api.getRoutines(token).then((r) => setRoutines(r.routines || [])).catch(() => {});
    api.getReminders(token).then((r) => setReminders(r.reminders || [])).catch(() => {});
  };
  useEffect(load, [token]);

  async function addRoutine() {
    if (!rName.trim() || rPrompt.trim().length < 3) return;
    await api.createRoutine(token, { name: rName, prompt: rPrompt, interval_minutes: Number(rInterval), enabled: true }).catch(() => {});
    setRName(""); setRPrompt(""); load();
  }
  async function addReminder() {
    if (!remTitle.trim() || !remDue) return;
    await api.createReminder(token, { title: remTitle, message: "", due_at: new Date(remDue).toISOString() }).catch(() => {});
    setRemTitle(""); setRemDue(""); load();
  }

  return (
    <div className="space-y-8">
      <BriefingCard token={token} />
      <section>
        <div className="mb-3 font-display text-base font-semibold text-ink">Routines</div>
        <div className="card space-y-2 p-4">
          <Input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Routine name" />
          <TextArea rows={2} value={rPrompt} onChange={(e) => setRPrompt(e.target.value)} placeholder="Prompt to run on a schedule"
            className="rounded-2xl border border-ink/12 bg-cream-100/70 px-4 py-2.5" />
          <div className="flex items-center gap-2">
            <Input type="number" min="5" value={rInterval} onChange={(e) => setRInterval(e.target.value)} className="w-28" />
            <span className="text-sm text-ink-muted">minutes</span>
            <Button onClick={addRoutine} className="ml-auto px-4 py-2">Create</Button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {routines.map((r) => (
            <div key={r.id} className="card flex items-center justify-between p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{r.name}</div>
                <div className="text-xs text-ink-muted">every {r.interval_minutes}m · {r.enabled ? "enabled" : "disabled"}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" onClick={() => api.runRoutine(token, r.id).catch(() => {})}>Run</Button>
                <Button variant="ghost" onClick={async () => { await api.updateRoutine(token, r.id, { enabled: !r.enabled }).catch(() => {}); load(); }}>
                  {r.enabled ? "Disable" : "Enable"}
                </Button>
                <button onClick={async () => { await api.deleteRoutine(token, r.id).catch(() => {}); load(); }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-clay-600" title="Delete">
                  <IconTrash width={15} height={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 font-display text-base font-semibold text-ink">Reminders</div>
        <div className="card flex flex-wrap items-center gap-2 p-4">
          <Input value={remTitle} onChange={(e) => setRemTitle(e.target.value)} placeholder="Reminder title" className="min-w-[180px] flex-1" />
          <Input type="datetime-local" value={remDue} onChange={(e) => setRemDue(e.target.value)} className="w-56" />
          <Button onClick={addReminder} className="px-4 py-2">Add</Button>
        </div>
        <div className="mt-3 space-y-2">
          {reminders.map((r) => (
            <div key={r.id} className="card flex items-center justify-between p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{r.title}</div>
                <div className="text-xs text-ink-muted">{new Date(r.due_at).toLocaleString()} · {r.status}</div>
              </div>
              <button onClick={async () => { await api.deleteReminder(token, r.id).catch(() => {}); load(); }}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-clay-600" title="Delete">
                <IconTrash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KnowledgePanel({ token }) {
  const [path, setPath] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  async function index() {
    if (!path.trim()) return;
    setBusy(true); setNote(null);
    try {
      const r = await api.ragIndex(token, { root_path: path, max_files: 100, max_bytes_per_file: 500000 });
      setNote({ t: `Indexed ${r.indexed_files} files · ${r.chunk_count} chunks.`, tone: "ok" });
    } catch (e) {
      setNote({ t: e.message, tone: "err" });
    } finally { setBusy(false); }
  }
  async function search() {
    if (query.trim().length < 2) return;
    try {
      const r = await api.ragQuery(token, { query, top_k: 5 });
      setResults(r.results || []);
    } catch (e) { setNote({ t: e.message, tone: "err" }); }
  }

  return (
    <div className="space-y-5">
      <Field label="Index a folder (inside your home directory)">
        <div className="flex gap-2">
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="e.g. Documents/notes" className="flex-1" />
          <Button onClick={index} disabled={busy}>{busy ? "Indexing…" : "Index"}</Button>
        </div>
      </Field>
      {note && <Note tone={note.tone}>{note.t}</Note>}
      <Field label="Test search">
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask across indexed files" className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button variant="outline" onClick={search}>Search</Button>
        </div>
      </Field>
      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className="card p-3">
            <div className="truncate text-xs text-ink-faint">{r.file_path} · chunk {r.chunk_index}</div>
            <div className="mt-1 text-sm text-ink-soft">{r.snippet}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditPanel({ token }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.getAudit(token).then((r) => setLogs(r.logs || [])).catch(() => {}); }, [token]);
  return (
    <div className="space-y-2">
      {logs.length === 0 && <div className="text-sm text-ink-faint">No activity yet.</div>}
      {logs.map((l) => (
        <div key={l.id} className="card flex items-center justify-between p-3">
          <div>
            <div className="text-sm font-medium text-ink">{l.action}</div>
            <div className="text-xs text-ink-muted">{l.status}</div>
          </div>
          <div className="text-xs text-ink-faint">{l.created_at ? new Date(l.created_at).toLocaleString() : ""}</div>
        </div>
      ))}
    </div>
  );
}

export default function Settings({ open, onClose, token, user, onSignOut }) {
  const [tab, setTab] = useState("profile");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/20 p-4 backdrop-blur-sm animate-fade" onClick={onClose}>
      <div
        className="flex h-[680px] max-h-[92vh] w-[min(920px,100%)] overflow-hidden rounded-3xl border border-ink/10 bg-cream shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="flex w-56 shrink-0 flex-col border-r border-ink/10 bg-cream/60 p-4">
          <div className="px-2 pb-4 font-display text-lg font-semibold text-ink">Settings</div>
          <nav className="space-y-1">
            {TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  tab === t.k ? "bg-white font-medium text-ink shadow-soft" : "text-ink-muted hover:bg-white/60 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-ink">{TABS.find((t) => t.k === tab)?.label}</h2>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-ink/5 hover:text-ink">
              <IconClose />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-6">
            {tab === "profile" && <ProfilePanel user={user} onSignOut={onSignOut} />}
            {tab === "connectors" && <ConnectorsPanel token={token} />}
            {tab === "memory" && <MemoryPanel token={token} />}
            {tab === "permissions" && <PermissionsPanel token={token} />}
            {tab === "automations" && <AutomationsPanel token={token} />}
            {tab === "knowledge" && <KnowledgePanel token={token} />}
            {tab === "audit" && <AuditPanel token={token} />}
          </div>
        </div>
      </div>
    </div>
  );
}
