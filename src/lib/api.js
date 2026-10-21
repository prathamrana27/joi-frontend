// Thin client for the JOI backend (FastAPI on 127.0.0.1:8000).

export const BACKEND_BASE_URL =
  import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000";

const TOKEN_KEY = "joi.auth.v1";

export function loadAuth() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parse(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// Compact helper for authed JSON endpoints.
async function parse2(url, token, method = "GET", body) {
  const opts = { method, headers: authHeaders(token) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return parse(await fetch(url, opts));
}

export const api = {
  async authConfig() {
    return parse(await fetch(`${BACKEND_BASE_URL}/auth/config`));
  },
  async login(email, password) {
    return parse(
      await fetch(`${BACKEND_BASE_URL}/auth/login`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, password }),
      })
    );
  },
  async signup(payload) {
    return parse(
      await fetch(`${BACKEND_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
    );
  },
  async googleSignIn(credential) {
    return parse(
      await fetch(`${BACKEND_BASE_URL}/auth/google`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ credential }),
      })
    );
  },
  async googleDesktopSignIn({ code, code_verifier, redirect_uri }) {
    return parse(
      await fetch(`${BACKEND_BASE_URL}/auth/google/desktop`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code, code_verifier, redirect_uri }),
      })
    );
  },
  async me(token) {
    return parse(await fetch(`${BACKEND_BASE_URL}/auth/me`, { headers: authHeaders(token) }));
  },

  // ---- Memory ----
  getMemory: (t) => parse2(`${BACKEND_BASE_URL}/memory`, t),
  saveMemory: (t, body) => parse2(`${BACKEND_BASE_URL}/memory`, t, "PUT", body),
  clearMemory: (t) => parse2(`${BACKEND_BASE_URL}/memory`, t, "DELETE"),

  // ---- Permissions & approvals ----
  getPermissions: (t) => parse2(`${BACKEND_BASE_URL}/permissions`, t),
  setPermission: (t, tool_name, mode) =>
    parse2(`${BACKEND_BASE_URL}/permissions`, t, "PUT", { tool_name, mode }),
  getApprovals: (t) => parse2(`${BACKEND_BASE_URL}/approvals/pending`, t),
  decideApproval: (t, id, decision, note = "") =>
    parse2(`${BACKEND_BASE_URL}/approvals/${encodeURIComponent(id)}/decision`, t, "POST", { decision, note }),

  // ---- Automations ----
  getRoutines: (t) => parse2(`${BACKEND_BASE_URL}/routines`, t),
  createRoutine: (t, body) => parse2(`${BACKEND_BASE_URL}/routines`, t, "POST", body),
  updateRoutine: (t, id, body) => parse2(`${BACKEND_BASE_URL}/routines/${encodeURIComponent(id)}`, t, "PATCH", body),
  deleteRoutine: (t, id) => parse2(`${BACKEND_BASE_URL}/routines/${encodeURIComponent(id)}`, t, "DELETE"),
  runRoutine: (t, id) => parse2(`${BACKEND_BASE_URL}/routines/${encodeURIComponent(id)}/run`, t, "POST"),
  getReminders: (t) => parse2(`${BACKEND_BASE_URL}/reminders`, t),
  createReminder: (t, body) => parse2(`${BACKEND_BASE_URL}/reminders`, t, "POST", body),
  deleteReminder: (t, id) => parse2(`${BACKEND_BASE_URL}/reminders/${encodeURIComponent(id)}`, t, "DELETE"),

  // ---- Knowledge (RAG) ----
  ragIndex: (t, body) => parse2(`${BACKEND_BASE_URL}/rag/index`, t, "POST", body),
  ragQuery: (t, body) => parse2(`${BACKEND_BASE_URL}/rag/query`, t, "POST", body),

  // ---- Audit ----
  getAudit: (t) => parse2(`${BACKEND_BASE_URL}/audit`, t),

  // ---- Notifications ----
  listNotifications: (t, unreadOnly = false) =>
    parse2(`${BACKEND_BASE_URL}/notifications${unreadOnly ? "?unread_only=true" : ""}`, t),
  markNotificationRead: (t, id) =>
    parse2(`${BACKEND_BASE_URL}/notifications/${encodeURIComponent(id)}/read`, t, "POST"),

  // ---- Integrations (per-user OAuth) ----
  integrationStatus: (t, provider) => parse2(`${BACKEND_BASE_URL}/integrations/${provider}/status`, t),
  integrationConnectUrl: (t, provider) => parse2(`${BACKEND_BASE_URL}/integrations/${provider}/connect`, t),
  integrationDisconnect: (t, provider) => parse2(`${BACKEND_BASE_URL}/integrations/${provider}/disconnect`, t, "POST"),
  telegramConnect: (t, botToken) =>
    parse2(`${BACKEND_BASE_URL}/integrations/telegram/connect`, t, "POST", { bot_token: botToken }),
  telegramNewCode: (t) => parse2(`${BACKEND_BASE_URL}/integrations/telegram/pairing`, t, "POST"),

  // ---- Daily Briefing ----
  getBriefing: (t) => parse2(`${BACKEND_BASE_URL}/briefing`, t),
  setBriefing: (t, body) => parse2(`${BACKEND_BASE_URL}/briefing`, t, "PUT", body),
  runBriefing: (t) => parse2(`${BACKEND_BASE_URL}/briefing/run`, t, "POST"),

  // ---- Voice ----
  async transcribeAudio(token, blob, filename = "audio.webm") {
    const fd = new FormData();
    fd.append("file", blob, filename);
    const res = await fetch(`${BACKEND_BASE_URL}/audio/transcribe`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    return parse(res);
  },
  async speak(token, text) {
    const res = await fetch(`${BACKEND_BASE_URL}/audio/speak`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `TTS failed (${res.status})`);
    }
    return res.blob();
  },
  async listSessions(token) {
    return parse(await fetch(`${BACKEND_BASE_URL}/sessions`, { headers: authHeaders(token) }));
  },
  async getSession(token, sessionId) {
    return parse(
      await fetch(`${BACKEND_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
        headers: authHeaders(token),
      })
    );
  },
  async deleteSession(token, sessionId) {
    return parse(
      await fetch(`${BACKEND_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      })
    );
  },

  /**
   * Stream a chat response over SSE. Calls onEvent(eventName, data) for each
   * server-sent event. Returns when the stream ends.
   */
  streamChat({ token, conversationId, message, history, signal, onEvent }) {
    return streamSSE(
      `${BACKEND_BASE_URL}/chat/stream`,
      token,
      { conversation_id: conversationId, message, model: "joi", history: history || [] },
      signal,
      onEvent
    );
  },

  /** Run a just-approved tool call and stream JOI finishing the task. */
  resumeChat({ token, conversationId, approvalId, signal, onEvent }) {
    return streamSSE(
      `${BACKEND_BASE_URL}/chat/resume`,
      token,
      { conversation_id: conversationId, approval_id: approvalId },
      signal,
      onEvent
    );
  },
};

async function streamSSE(url, token, body, signal, onEvent) {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let detail = "";
      try { detail = (await res.json()).detail || ""; } catch { /* not JSON */ }
      throw new Error(detail || `Chat stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Parse the "event: X\ndata: {...}\n\n" SSE framing.
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let eventName = "message";
        const dataLines = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        let data = {};
        try {
          data = JSON.parse(dataLines.join("\n"));
        } catch {
          data = { raw: dataLines.join("\n") };
        }
        onEvent?.(eventName, data);
      }
    }
}
