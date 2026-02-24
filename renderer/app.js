const STORAGE_KEY_PREFIX = "joi_desktop_state_v1";
const LEGACY_STORAGE_KEY = "joi_desktop_state_v1";
const AUTH_STORAGE_KEY = "joi_auth_state_v1";
const BACKEND_BASE_URL = "http://localhost:8000";

const elements = {
  authScreen: document.getElementById("authScreen"),
  authTabs: document.querySelectorAll("[data-auth-tab]"),
  authSignInPanel: document.getElementById("authSignInPanel"),
  authSignUpPanel: document.getElementById("authSignUpPanel"),
  authStatus: document.getElementById("authStatus"),
  signInForm: document.getElementById("signInForm"),
  signUpForm: document.getElementById("signUpForm"),
  signInEmail: document.getElementById("signInEmail"),
  signInPassword: document.getElementById("signInPassword"),
  signUpFirstName: document.getElementById("signUpFirstName"),
  signUpLastName: document.getElementById("signUpLastName"),
  signUpEmail: document.getElementById("signUpEmail"),
  signUpPassword: document.getElementById("signUpPassword"),
  signUpConfirmPassword: document.getElementById("signUpConfirmPassword"),
  googleButtonWrap: document.getElementById("googleButtonWrap"),
  currentUserName: document.getElementById("currentUserName"),
  logoutBtn: document.getElementById("logoutBtn"),
  memoryBtn: document.getElementById("memoryBtn"),
  opsBtn: document.getElementById("opsBtn"),
  memoryModal: document.getElementById("memoryModal"),
  memoryCloseBtn: document.getElementById("memoryCloseBtn"),
  memorySaveBtn: document.getElementById("memorySaveBtn"),
  memoryClearBtn: document.getElementById("memoryClearBtn"),
  memoryPreferences: document.getElementById("memoryPreferences"),
  memoryNotes: document.getElementById("memoryNotes"),
  opsModal: document.getElementById("opsModal"),
  opsCloseBtn: document.getElementById("opsCloseBtn"),
  opsRefreshBtn: document.getElementById("opsRefreshBtn"),
  opsStatus: document.getElementById("opsStatus"),
  permToolName: document.getElementById("permToolName"),
  permMode: document.getElementById("permMode"),
  permSaveBtn: document.getElementById("permSaveBtn"),
  permList: document.getElementById("permList"),
  ragPathInput: document.getElementById("ragPathInput"),
  ragMaxFilesInput: document.getElementById("ragMaxFilesInput"),
  ragIndexBtn: document.getElementById("ragIndexBtn"),
  ragQueryInput: document.getElementById("ragQueryInput"),
  ragTopKInput: document.getElementById("ragTopKInput"),
  ragQueryBtn: document.getElementById("ragQueryBtn"),
  ragResults: document.getElementById("ragResults"),
  routineNameInput: document.getElementById("routineNameInput"),
  routinePromptInput: document.getElementById("routinePromptInput"),
  routineIntervalInput: document.getElementById("routineIntervalInput"),
  routineEnabledInput: document.getElementById("routineEnabledInput"),
  routineCreateBtn: document.getElementById("routineCreateBtn"),
  routineList: document.getElementById("routineList"),
  reminderTitleInput: document.getElementById("reminderTitleInput"),
  reminderMessageInput: document.getElementById("reminderMessageInput"),
  reminderDueInput: document.getElementById("reminderDueInput"),
  reminderCreateBtn: document.getElementById("reminderCreateBtn"),
  reminderList: document.getElementById("reminderList"),
  jobTypeInput: document.getElementById("jobTypeInput"),
  jobPayloadInput: document.getElementById("jobPayloadInput"),
  jobRunAtInput: document.getElementById("jobRunAtInput"),
  jobCreateBtn: document.getElementById("jobCreateBtn"),
  jobList: document.getElementById("jobList"),
  auditRefreshBtn: document.getElementById("auditRefreshBtn"),
  auditList: document.getElementById("auditList"),
  approvalList: document.getElementById("approvalList"),
  quickCommandOverlay: document.getElementById("quickCommandOverlay"),
  quickCommandForm: document.getElementById("quickCommandForm"),
  quickCommandInput: document.getElementById("quickCommandInput"),
  quickCommandRunBtn: document.getElementById("quickCommandRunBtn"),
  quickCommandCloseBtn: document.getElementById("quickCommandCloseBtn"),
  appShell: document.getElementById("appShell"),
  workflowPanel: document.getElementById("workflowPanel"),
  historyList: document.getElementById("historyList"),
  chatMessages: document.getElementById("chatMessages"),
  workflowList: document.getElementById("workflowList"),
  promptInput: document.getElementById("promptInput"),
  composerShell: document.getElementById("composerShell"),
  composerActions: document.getElementById("composerActions"),
  recordingShell: document.getElementById("recordingShell"),
  recordingActions: document.getElementById("recordingActions"),
  attachBtn: document.getElementById("attachBtn"),
  ttsToggleBtn: document.getElementById("ttsToggleBtn"),
  micBtn: document.getElementById("micBtn"),
  sendBtn: document.getElementById("sendBtn"),
  recordingCancelBtn: document.getElementById("recordingCancelBtn"),
  recordingConfirmBtn: document.getElementById("recordingConfirmBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  closeWorkflowBtn: document.getElementById("closeWorkflowBtn"),
  clearWorkflowBtn: document.getElementById("clearWorkflowBtn"),
  connectionBadge: document.getElementById("connectionBadge"),
  modelSelect: document.getElementById("modelSelect"),
  buildTag: document.getElementById("buildTag")
};

const state = {
  connected: false,
  model: "openai",
  conversations: [],
  activeConversationId: null,
  sessionsSyncInFlight: false,
  streamingMessageId: null,
  requestInFlight: false,
  transcribeInFlight: false,
  ttsEnabled: true,
  currentAudio: null,
  speakingMessageId: null,
  speakRequestInFlight: false,
  isRecording: false,
  recordingAction: "none",
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
  streamTextQueue: [],
  streamTimer: null,
  streamDonePending: false,
  auth: {
    accessToken: "",
    user: null,
    googleClientId: ""
  },
  approvals: [],
  memory: {
    preferences: "",
    notes: ""
  },
  ops: {
    permissions: {},
    routines: [],
    reminders: [],
    jobs: [],
    auditLogs: [],
    ragResults: []
  },
  notificationCursor: null,
  desktopEventUnsubscribe: null,
  notificationTimer: null
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getConversationStorageKey() {
  const userId = String(state.auth?.user?.id || "").trim();
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : LEGACY_STORAGE_KEY;
}

function getAuthDisplayName(user) {
  if (!user || typeof user !== "object") {
    return "Signed in";
  }
  const first = String(user.first_name || "").trim();
  const last = String(user.last_name || "").trim();
  const display = `${first} ${last}`.trim();
  if (display) {
    return display;
  }
  return String(user.email || "Signed in").trim() || "Signed in";
}

async function parseErrorResponse(response, fallbackMessage) {
  let message = fallbackMessage;
  try {
    const payload = await response.json();
    if (payload?.detail) {
      message = String(payload.detail);
    }
  } catch (_err) {
    // noop
  }
  return message;
}

async function authorizedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.auth.accessToken) {
    headers.set("Authorization", `Bearer ${state.auth.accessToken}`);
  }
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && state.auth.accessToken) {
    clearAuthSession();
    updateAuthUI();
    setAuthStatus("Your session expired. Please sign in again.", "error");
  }
  return response;
}

async function getActiveAppContext() {
  if (!window.joiDesktop?.getActiveAppContext) {
    return { app: "", title: "", pid: 0 };
  }
  try {
    const ctx = await window.joiDesktop.getActiveAppContext();
    return {
      app: String(ctx?.app || ""),
      title: String(ctx?.title || ""),
      pid: Number(ctx?.pid || 0)
    };
  } catch (_err) {
    return { app: "", title: "", pid: 0 };
  }
}

function openQuickCommandOverlay() {
  if (!elements.quickCommandOverlay) {
    return;
  }
  elements.quickCommandOverlay.classList.add("open");
  elements.quickCommandOverlay.setAttribute("aria-hidden", "false");
  if (elements.quickCommandInput) {
    elements.quickCommandInput.focus();
    elements.quickCommandInput.select();
  }
}

function closeQuickCommandOverlay() {
  if (!elements.quickCommandOverlay) {
    return;
  }
  elements.quickCommandOverlay.classList.remove("open");
  elements.quickCommandOverlay.setAttribute("aria-hidden", "true");
}

function upsertDraftFromQuickCommand(command) {
  const text = String(command || "").trim();
  if (!text) {
    return;
  }
  elements.promptInput.value = text;
  autoResizeInput();
  updateBusyState();
}

async function handleQuickCommandSubmit(event) {
  event.preventDefault();
  const text = String(elements.quickCommandInput?.value || "").trim();
  if (!text) {
    return;
  }
  upsertDraftFromQuickCommand(text);
  elements.quickCommandInput.value = "";
  closeQuickCommandOverlay();
  await sendMessage();
}

async function fetchMemory() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/memory`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Memory fetch failed (${response.status})`));
  }
  const payload = await response.json();
  state.memory.preferences = String(payload?.memory?.preferences || "");
  state.memory.notes = String(payload?.memory?.notes || "");
}

function openMemoryModal() {
  if (!elements.memoryModal) {
    return;
  }
  elements.memoryPreferences.value = state.memory.preferences || "";
  elements.memoryNotes.value = state.memory.notes || "";
  elements.memoryModal.classList.add("open");
  elements.memoryModal.setAttribute("aria-hidden", "false");
}

function closeMemoryModal() {
  if (!elements.memoryModal) {
    return;
  }
  elements.memoryModal.classList.remove("open");
  elements.memoryModal.setAttribute("aria-hidden", "true");
}

async function saveMemory() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      preferences: String(elements.memoryPreferences?.value || ""),
      notes: String(elements.memoryNotes?.value || "")
    })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Memory save failed (${response.status})`));
  }
  const payload = await response.json();
  state.memory.preferences = String(payload?.memory?.preferences || "");
  state.memory.notes = String(payload?.memory?.notes || "");
}

async function clearMemory() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/memory`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Memory clear failed (${response.status})`));
  }
  state.memory.preferences = "";
  state.memory.notes = "";
  if (elements.memoryPreferences) {
    elements.memoryPreferences.value = "";
  }
  if (elements.memoryNotes) {
    elements.memoryNotes.value = "";
  }
}

function setOpsStatus(message, tone = "neutral") {
  if (!elements.opsStatus) {
    return;
  }
  elements.opsStatus.textContent = String(message || "");
  elements.opsStatus.classList.remove("is-error", "is-success");
  if (tone === "error") {
    elements.opsStatus.classList.add("is-error");
  } else if (tone === "success") {
    elements.opsStatus.classList.add("is-success");
  }
}

function openOpsModal() {
  if (!elements.opsModal) {
    return;
  }
  elements.opsModal.classList.add("open");
  elements.opsModal.setAttribute("aria-hidden", "false");
  void refreshOpsData({ showProgress: true, successMessage: "Controls loaded." });
}

function closeOpsModal() {
  if (!elements.opsModal) {
    return;
  }
  elements.opsModal.classList.remove("open");
  elements.opsModal.setAttribute("aria-hidden", "true");
}

function toIsoOrEmpty(localDateTimeValue) {
  const raw = String(localDateTimeValue || "").trim();
  if (!raw) {
    return "";
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date/time value.");
  }
  return parsed.toISOString();
}

function parseObjectJson(text) {
  const source = String(text || "").trim();
  if (!source) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (_err) {
    throw new Error("Payload must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object.");
  }
  return parsed;
}

async function fetchPermissions() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/permissions`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Permissions fetch failed (${response.status})`));
  }
  const payload = await response.json();
  const rawRules = payload?.rules && typeof payload.rules === "object" ? payload.rules : {};
  state.ops.permissions = {};
  for (const [toolName, mode] of Object.entries(rawRules)) {
    const tool = String(toolName || "").trim();
    const normalizedMode = String(mode || "").trim();
    if (!tool) {
      continue;
    }
    if (normalizedMode === "allow" || normalizedMode === "deny" || normalizedMode === "require_approval") {
      state.ops.permissions[tool] = normalizedMode;
    }
  }
}

async function savePermissionRule(toolName, mode) {
  const tool = String(toolName || "").trim();
  const normalizedMode = String(mode || "").trim();
  if (!tool) {
    throw new Error("Tool name is required.");
  }
  if (!["allow", "deny", "require_approval"].includes(normalizedMode)) {
    throw new Error("Permission mode is invalid.");
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_name: tool, mode: normalizedMode })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Permission save failed (${response.status})`));
  }

  const payload = await response.json();
  const rawRules = payload?.rules && typeof payload.rules === "object" ? payload.rules : {};
  state.ops.permissions = {};
  for (const [ruleTool, ruleMode] of Object.entries(rawRules)) {
    const safeTool = String(ruleTool || "").trim();
    const safeMode = String(ruleMode || "").trim();
    if (safeTool && (safeMode === "allow" || safeMode === "deny" || safeMode === "require_approval")) {
      state.ops.permissions[safeTool] = safeMode;
    }
  }
}

async function fetchRoutines() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/routines`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Routines fetch failed (${response.status})`));
  }
  const payload = await response.json();
  state.ops.routines = Array.isArray(payload?.routines) ? payload.routines : [];
}

async function createRoutine() {
  const name = String(elements.routineNameInput?.value || "").trim();
  const prompt = String(elements.routinePromptInput?.value || "").trim();
  const intervalMinutes = Number.parseInt(String(elements.routineIntervalInput?.value || "60"), 10);
  const enabled = Boolean(elements.routineEnabledInput?.checked);
  if (!name || !prompt) {
    throw new Error("Routine name and prompt are required.");
  }
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 10080) {
    throw new Error("Interval must be between 5 and 10080 minutes.");
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/routines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      prompt,
      interval_minutes: intervalMinutes,
      enabled
    })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Routine create failed (${response.status})`));
  }
}

async function updateRoutine(routineId, patchPayload) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/routines/${encodeURIComponent(routineId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patchPayload || {})
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Routine update failed (${response.status})`));
  }
}

async function deleteRoutine(routineId) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/routines/${encodeURIComponent(routineId)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Routine delete failed (${response.status})`));
  }
}

async function runRoutineNow(routineId) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/routines/${encodeURIComponent(routineId)}/run`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Routine run failed (${response.status})`));
  }
}

async function fetchReminders() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/reminders`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Reminders fetch failed (${response.status})`));
  }
  const payload = await response.json();
  state.ops.reminders = Array.isArray(payload?.reminders) ? payload.reminders : [];
}

async function createReminder() {
  const title = String(elements.reminderTitleInput?.value || "").trim();
  const message = String(elements.reminderMessageInput?.value || "").trim();
  const dueAt = toIsoOrEmpty(elements.reminderDueInput?.value || "");
  if (!title || !dueAt) {
    throw new Error("Reminder title and due date/time are required.");
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, message, due_at: dueAt })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Reminder create failed (${response.status})`));
  }
}

async function updateReminder(reminderId, patchPayload) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/reminders/${encodeURIComponent(reminderId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patchPayload || {})
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Reminder update failed (${response.status})`));
  }
}

async function deleteReminder(reminderId) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/reminders/${encodeURIComponent(reminderId)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Reminder delete failed (${response.status})`));
  }
}

async function fetchJobs() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/jobs`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Jobs fetch failed (${response.status})`));
  }
  const payload = await response.json();
  state.ops.jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
}

async function createJob() {
  const jobType = String(elements.jobTypeInput?.value || "").trim();
  const payloadObj = parseObjectJson(elements.jobPayloadInput?.value || "");
  const runAtRaw = String(elements.jobRunAtInput?.value || "").trim();
  const runAt = runAtRaw ? toIsoOrEmpty(runAtRaw) : "";
  if (!jobType) {
    throw new Error("Job type is required.");
  }

  const body = { job_type: jobType, payload: payloadObj };
  if (runAt) {
    body.run_at = runAt;
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Job queue failed (${response.status})`));
  }
}

async function fetchAuditLogs() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/audit`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Audit fetch failed (${response.status})`));
  }
  const payload = await response.json();
  state.ops.auditLogs = Array.isArray(payload?.logs) ? payload.logs : [];
}

async function runRagIndex() {
  const rootPath = String(elements.ragPathInput?.value || "").trim();
  const maxFiles = Number.parseInt(String(elements.ragMaxFilesInput?.value || "100"), 10);
  if (!rootPath) {
    throw new Error("RAG root path is required.");
  }
  if (!Number.isFinite(maxFiles) || maxFiles < 1 || maxFiles > 1000) {
    throw new Error("max_files must be between 1 and 1000.");
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/rag/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root_path: rootPath, max_files: maxFiles })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `RAG index failed (${response.status})`));
  }
  const payload = await response.json();
  return payload;
}

async function runRagQuery() {
  const query = String(elements.ragQueryInput?.value || "").trim();
  const topK = Number.parseInt(String(elements.ragTopKInput?.value || "5"), 10);
  if (!query) {
    throw new Error("RAG query text is required.");
  }
  if (!Number.isFinite(topK) || topK < 1 || topK > 15) {
    throw new Error("top_k must be between 1 and 15.");
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK })
  });
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `RAG query failed (${response.status})`));
  }
  const payload = await response.json();
  state.ops.ragResults = Array.isArray(payload?.results) ? payload.results : [];
}

function fillEmptyOpsList(container, message) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  container.appendChild(empty);
}

function renderPermissionsList() {
  if (!elements.permList) {
    return;
  }
  const entries = Object.entries(state.ops.permissions || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    fillEmptyOpsList(elements.permList, "No permission rules yet.");
    return;
  }

  elements.permList.innerHTML = "";
  for (const [toolName, mode] of entries) {
    const item = document.createElement("div");
    item.className = "ops-item";

    const title = document.createElement("div");
    title.className = "ops-item-title";
    title.textContent = toolName;

    const meta = document.createElement("div");
    meta.className = "ops-item-meta";
    meta.textContent = `mode: ${mode}`;

    const actions = document.createElement("div");
    actions.className = "ops-item-actions";

    ["allow", "require_approval", "deny"].forEach((rule) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${rule === mode ? "btn-primary" : "btn-ghost"}`;
      btn.textContent = rule;
      btn.addEventListener("click", async () => {
        try {
          await savePermissionRule(toolName, rule);
          renderPermissionsList();
          setOpsStatus(`Updated ${toolName} -> ${rule}`, "success");
        } catch (err) {
          setOpsStatus(err instanceof Error ? err.message : String(err), "error");
        }
      });
      actions.appendChild(btn);
    });

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(actions);
    elements.permList.appendChild(item);
  }
}

function renderRoutinesList() {
  if (!elements.routineList) {
    return;
  }
  const rows = Array.isArray(state.ops.routines) ? state.ops.routines : [];
  if (!rows.length) {
    fillEmptyOpsList(elements.routineList, "No routines created.");
    return;
  }

  elements.routineList.innerHTML = "";
  for (const routine of rows) {
    const routineId = String(routine?.id || "");
    const item = document.createElement("div");
    item.className = "ops-item";

    const title = document.createElement("div");
    title.className = "ops-item-title";
    title.textContent = String(routine?.name || "Routine");

    const meta = document.createElement("div");
    meta.className = "ops-item-meta";
    meta.textContent = [
      `interval=${Number(routine?.interval_minutes || 0)}m`,
      `enabled=${routine?.enabled ? "yes" : "no"}`,
      `next=${routine?.next_run_at ? formatDateTime(routine.next_run_at) : "-"}`
    ].join(" | ");

    const code = document.createElement("div");
    code.className = "ops-code";
    code.textContent = String(routine?.prompt || "");

    const actions = document.createElement("div");
    actions.className = "ops-item-actions";

    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "btn btn-primary";
    runBtn.textContent = "Run now";
    runBtn.addEventListener("click", async () => {
      try {
        await runRoutineNow(routineId);
        await refreshOpsData({ successMessage: "Routine queued." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-ghost";
    toggleBtn.textContent = routine?.enabled ? "Disable" : "Enable";
    toggleBtn.addEventListener("click", async () => {
      try {
        await updateRoutine(routineId, { enabled: !routine?.enabled });
        await refreshOpsData({ successMessage: "Routine updated." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteRoutine(routineId);
        await refreshOpsData({ successMessage: "Routine deleted." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });

    actions.appendChild(runBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(code);
    item.appendChild(actions);
    elements.routineList.appendChild(item);
  }
}

function renderRemindersList() {
  if (!elements.reminderList) {
    return;
  }
  const rows = Array.isArray(state.ops.reminders) ? state.ops.reminders : [];
  if (!rows.length) {
    fillEmptyOpsList(elements.reminderList, "No reminders created.");
    return;
  }

  elements.reminderList.innerHTML = "";
  for (const reminder of rows) {
    const reminderId = String(reminder?.id || "");
    const status = String(reminder?.status || "pending");

    const item = document.createElement("div");
    item.className = "ops-item";

    const title = document.createElement("div");
    title.className = "ops-item-title";
    title.textContent = String(reminder?.title || "Reminder");

    const meta = document.createElement("div");
    meta.className = "ops-item-meta";
    meta.textContent = `status=${status} | due=${formatDateTime(String(reminder?.due_at || ""))}`;

    const note = document.createElement("div");
    note.className = "ops-code";
    note.textContent = String(reminder?.message || "");

    const actions = document.createElement("div");
    actions.className = "ops-item-actions";

    if (status === "pending") {
      const doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.className = "btn btn-primary";
      doneBtn.textContent = "Mark done";
      doneBtn.addEventListener("click", async () => {
        try {
          await updateReminder(reminderId, { status: "done" });
          await refreshOpsData({ successMessage: "Reminder updated." });
        } catch (err) {
          setOpsStatus(err instanceof Error ? err.message : String(err), "error");
        }
      });
      actions.appendChild(doneBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", async () => {
        try {
          await updateReminder(reminderId, { status: "cancelled" });
          await refreshOpsData({ successMessage: "Reminder cancelled." });
        } catch (err) {
          setOpsStatus(err instanceof Error ? err.message : String(err), "error");
        }
      });
      actions.appendChild(cancelBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-ghost";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteReminder(reminderId);
        await refreshOpsData({ successMessage: "Reminder deleted." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
    actions.appendChild(deleteBtn);

    item.appendChild(title);
    item.appendChild(meta);
    if (String(reminder?.message || "").trim()) {
      item.appendChild(note);
    }
    item.appendChild(actions);
    elements.reminderList.appendChild(item);
  }
}

function renderJobsList() {
  if (!elements.jobList) {
    return;
  }
  const rows = Array.isArray(state.ops.jobs) ? state.ops.jobs : [];
  if (!rows.length) {
    fillEmptyOpsList(elements.jobList, "No jobs queued yet.");
    return;
  }

  elements.jobList.innerHTML = "";
  for (const job of rows) {
    const item = document.createElement("div");
    item.className = "ops-item";

    const title = document.createElement("div");
    title.className = "ops-item-title";
    title.textContent = `${String(job?.job_type || "job")} [${String(job?.status || "pending")}]`;

    const meta = document.createElement("div");
    meta.className = "ops-item-meta";
    meta.textContent = `run_at=${formatDateTime(String(job?.run_at || ""))} | updated=${formatDateTime(String(job?.updated_at || ""))}`;

    const payloadView = document.createElement("div");
    payloadView.className = "ops-code";
    payloadView.textContent = JSON.stringify(job?.payload || {}, null, 2);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(payloadView);
    elements.jobList.appendChild(item);
  }
}

function renderAuditLogs() {
  if (!elements.auditList) {
    return;
  }
  const rows = Array.isArray(state.ops.auditLogs) ? state.ops.auditLogs : [];
  if (!rows.length) {
    fillEmptyOpsList(elements.auditList, "No audit events yet.");
    return;
  }

  elements.auditList.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "ops-item";

    const title = document.createElement("div");
    title.className = "ops-item-title";
    title.textContent = `${String(row?.action || "action")} [${String(row?.status || "")}]`;

    const meta = document.createElement("div");
    meta.className = "ops-item-meta";
    meta.textContent = formatDateTime(String(row?.created_at || ""));

    const details = document.createElement("div");
    details.className = "ops-code";
    details.textContent = JSON.stringify(row?.metadata || {}, null, 2);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(details);
    elements.auditList.appendChild(item);
  }
}

function renderRagResults() {
  if (!elements.ragResults) {
    return;
  }
  const rows = Array.isArray(state.ops.ragResults) ? state.ops.ragResults : [];
  if (!rows.length) {
    fillEmptyOpsList(elements.ragResults, "No RAG query results yet.");
    return;
  }

  elements.ragResults.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "ops-item";

    const title = document.createElement("div");
    title.className = "ops-item-title";
    title.textContent = String(row?.file_path || "Unknown file");

    const meta = document.createElement("div");
    meta.className = "ops-item-meta";
    meta.textContent = `score=${Number(row?.score || 0).toFixed(3)} | chunk=${Number(row?.chunk_index || 0)}`;

    const snippet = document.createElement("div");
    snippet.className = "ops-code";
    snippet.textContent = String(row?.snippet || "");

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(snippet);
    elements.ragResults.appendChild(item);
  }
}

function renderOpsPanel() {
  renderPermissionsList();
  renderRoutinesList();
  renderRemindersList();
  renderJobsList();
  renderAuditLogs();
  renderRagResults();
}

async function refreshOpsData(options = {}) {
  if (!state.auth.accessToken) {
    return;
  }
  const showProgress = Boolean(options.showProgress);
  const successMessage = String(options.successMessage || "").trim();
  if (showProgress) {
    setOpsStatus("Refreshing controls...", "neutral");
  }

  const results = await Promise.allSettled([
    fetchPermissions(),
    fetchRoutines(),
    fetchReminders(),
    fetchJobs(),
    fetchAuditLogs()
  ]);

  renderOpsPanel();

  const failed = results.find((item) => item.status === "rejected");
  if (failed && failed.reason) {
    const message = failed.reason instanceof Error ? failed.reason.message : String(failed.reason);
    setOpsStatus(message, "error");
    addWorkflowEvent("warning", `Controls refresh issue: ${message}`);
    return;
  }
  if (showProgress || successMessage) {
    setOpsStatus(successMessage || "Controls refreshed.", "success");
  }
}

async function fetchPendingApprovals() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/approvals/pending`);
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Approvals fetch failed (${response.status})`));
  }
  const payload = await response.json();
  state.approvals = Array.isArray(payload?.approvals) ? payload.approvals : [];
}

async function decideApproval(approvalId, decision) {
  const response = await authorizedFetch(
    `${BACKEND_BASE_URL}/approvals/${encodeURIComponent(approvalId)}/decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: "" })
    }
  );
  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, `Approval decision failed (${response.status})`));
  }
}

function renderApprovals() {
  if (!elements.approvalList) {
    return;
  }
  elements.approvalList.innerHTML = "";
  if (!state.approvals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No pending approvals.";
    elements.approvalList.appendChild(empty);
    return;
  }

  state.approvals.forEach((approval) => {
    const item = document.createElement("div");
    item.className = "approval-item";

    const title = document.createElement("div");
    title.className = "approval-title";
    title.textContent = `Tool: ${String(approval.tool_name || "tool")} (${String(approval.approval_id || "")})`;

    const args = document.createElement("div");
    args.className = "workflow-content";
    args.textContent = JSON.stringify(approval.tool_args || {}, null, 2);

    const actions = document.createElement("div");
    actions.className = "approval-actions";

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn btn-primary";
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", async () => {
      try {
        await decideApproval(String(approval.approval_id || ""), "approved");
        await fetchPendingApprovals();
        renderApprovals();
      } catch (err) {
        addWorkflowEvent("warning", err instanceof Error ? err.message : String(err));
      }
    });

    const denyBtn = document.createElement("button");
    denyBtn.type = "button";
    denyBtn.className = "btn btn-ghost";
    denyBtn.textContent = "Deny";
    denyBtn.addEventListener("click", async () => {
      try {
        await decideApproval(String(approval.approval_id || ""), "denied");
        await fetchPendingApprovals();
        renderApprovals();
      } catch (err) {
        addWorkflowEvent("warning", err instanceof Error ? err.message : String(err));
      }
    });

    actions.appendChild(approveBtn);
    actions.appendChild(denyBtn);
    item.appendChild(title);
    item.appendChild(args);
    item.appendChild(actions);
    elements.approvalList.appendChild(item);
  });
}

async function pollNotifications() {
  if (!state.auth.accessToken) {
    return;
  }
  try {
    const response = await authorizedFetch(`${BACKEND_BASE_URL}/notifications?unread_only=true`);
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const notifications = Array.isArray(payload?.notifications) ? payload.notifications : [];
    for (const item of notifications) {
      const id = String(item?.id || "");
      if (!id || state.notificationCursor === id) {
        continue;
      }

      const title = String(item?.title || "JOI");
      const body = String(item?.body || "");
      if (window.joiDesktop?.showDesktopNotification) {
        await window.joiDesktop.showDesktopNotification(title, body);
      }
      state.notificationCursor = id;

      await authorizedFetch(`${BACKEND_BASE_URL}/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST"
      });
    }
  } catch (_err) {
    // Polling failures should not break chat flow.
  }
}

function startNotificationPolling() {
  if (state.notificationTimer) {
    clearInterval(state.notificationTimer);
  }
  state.notificationTimer = setInterval(() => {
    void pollNotifications();
  }, 15000);
}

function stopNotificationPolling() {
  if (state.notificationTimer) {
    clearInterval(state.notificationTimer);
    state.notificationTimer = null;
  }
}

function bindDesktopEventBridge() {
  if (!window.joiDesktop?.onDesktopEvent) {
    return;
  }
  if (typeof state.desktopEventUnsubscribe === "function") {
    state.desktopEventUnsubscribe();
  }
  state.desktopEventUnsubscribe = window.joiDesktop.onDesktopEvent((event) => {
    const name = String(event?.name || "");
    if (name === "quick_command_toggle") {
      openQuickCommandOverlay();
    } else if (name === "voice_toggle") {
      void toggleVoiceRecording();
    }
  });
}

function normalizeAssistantText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/^TOOL_CALL::.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInlineFormatting(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function formatTextBlock(block) {
  const lines = block.split("\n");
  const html = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      closeList();
      const level = Math.min(headingMatch[1].length + 2, 5);
      const text = applyInlineFormatting(escapeHtml(headingMatch[2]));
      html.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    if (numberedMatch) {
      const itemHtml = applyInlineFormatting(escapeHtml(numberedMatch[2]));
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${itemHtml}</li>`);
      continue;
    }

    if (bulletMatch) {
      const itemHtml = applyInlineFormatting(escapeHtml(bulletMatch[1]));
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${itemHtml}</li>`);
      continue;
    }

    closeList();
    const paragraph = applyInlineFormatting(escapeHtml(line));
    html.push(`<p>${paragraph}</p>`);
  }

  closeList();
  return html.join("");
}

function formatStructuredMessage(text, streaming = false) {
  const normalized = normalizeAssistantText(text);
  if (!normalized) {
    return streaming ? '<span class="stream-cursor"></span>' : "";
  }

  const parts = normalized.split(/```/g);
  let output = "";
  for (let i = 0; i < parts.length; i += 1) {
    const segment = parts[i];
    if (!segment.trim()) {
      continue;
    }
    if (i % 2 === 1) {
      output += `<pre><code>${escapeHtml(segment.trim())}</code></pre>`;
    } else {
      output += formatTextBlock(segment);
    }
  }

  if (streaming) {
    output += '<span class="stream-cursor"></span>';
  }
  return output;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (_err) {
    return iso;
  }
}

function getActiveConversation() {
  return state.conversations.find((c) => c.id === state.activeConversationId) || null;
}

function normalizeMessageRecord(message, fallbackTimestamp = nowIso()) {
  const role = String(message?.role || "").toLowerCase();
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const content = String(message?.content || "");
  if (!content.trim()) {
    return null;
  }
  return {
    id: String(message?.id || uid("msg")),
    role,
    content,
    timestamp: String(message?.timestamp || fallbackTimestamp),
    streaming: false,
    awaitingFirstChunk: false,
    feedback: message?.feedback === "like" || message?.feedback === "dislike" ? message.feedback : null
  };
}

function normalizeConversationRecord(conversation = {}) {
  const title = String(conversation.title || "New chat");
  const createdAt = String(conversation.createdAt || conversation.created_at || nowIso());
  const updatedAt = String(conversation.updatedAt || conversation.updated_at || createdAt);
  const rawMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const messages = rawMessages
    .map((message) => normalizeMessageRecord(message, updatedAt))
    .filter(Boolean);

  return {
    id: String(conversation.id || conversation.session_id || uid("conv")),
    title,
    titleGenerated:
      typeof conversation.titleGenerated === "boolean"
        ? conversation.titleGenerated
        : title !== "New chat",
    titleGenerating: false,
    createdAt,
    updatedAt,
    model: String(conversation.model || "openai"),
    messages,
    workflow: Array.isArray(conversation.workflow) ? conversation.workflow : [],
    preview: String(conversation.preview || ""),
    messageCount: Number.isFinite(conversation.messageCount)
      ? conversation.messageCount
      : Number(conversation.message_count || messages.length || 0),
    remoteAvailable: Boolean(conversation.remoteAvailable),
    messagesLoaded: Boolean(conversation.messagesLoaded || messages.length),
    workflowRunning: Boolean(conversation.workflowRunning),
    workflowCompleted: Boolean(conversation.workflowCompleted),
    workflowManuallyOpened: Boolean(conversation.workflowManuallyOpened)
  };
}

function sortConversationsByUpdated(conversations) {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function updateConversationSummary(conversation) {
  if (!conversation) {
    return;
  }

  const visible = (conversation.messages || []).filter((msg) => !msg.streaming);
  conversation.messageCount = visible.length;
  const latestUser = [...visible].reverse().find((msg) => msg.role === "user");
  conversation.preview = latestUser ? String(latestUser.content || "").slice(0, 120) : "";
}

function saveState() {
  if (!state.auth.user?.id) {
    return;
  }

  localStorage.setItem(
    getConversationStorageKey(),
    JSON.stringify({
      model: state.model,
      ttsEnabled: state.ttsEnabled,
      conversations: state.conversations,
      activeConversationId: state.activeConversationId
    })
  );
}

function loadState() {
  const storageKey = getConversationStorageKey();
  let raw = localStorage.getItem(storageKey);
  if (!raw && storageKey !== LEGACY_STORAGE_KEY) {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  }

  state.conversations = [];
  state.activeConversationId = null;
  state.model = "openai";
  state.ttsEnabled = true;

  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.conversations)) {
      state.conversations = parsed.conversations.map((conv) => normalizeConversationRecord(conv));
    }
    if (typeof parsed.activeConversationId === "string") {
      state.activeConversationId = parsed.activeConversationId;
    }
    if (typeof parsed.model === "string") {
      state.model = parsed.model;
    }
    if (typeof parsed.ttsEnabled === "boolean") {
      state.ttsEnabled = parsed.ttsEnabled;
    }
  } catch (_err) {
    localStorage.removeItem(storageKey);
  }
}

function saveAuthState() {
  if (!state.auth.accessToken || !state.auth.user?.id) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      accessToken: state.auth.accessToken,
      user: state.auth.user
    })
  );
}

function loadAuthState() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const token = String(parsed?.accessToken || "").trim();
    const user = parsed?.user && typeof parsed.user === "object" ? parsed.user : null;
    if (token && user?.id) {
      state.auth.accessToken = token;
      state.auth.user = user;
      return;
    }
  } catch (_err) {
    // noop
  }

  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function clearConversationState() {
  state.conversations = [];
  state.activeConversationId = null;
  state.streamingMessageId = null;
  state.streamTextQueue = [];
  state.streamDonePending = false;
  stopStreamTypingLoop();
}

function setAuthSession(payload) {
  state.auth.accessToken = String(payload?.access_token || "").trim();
  state.auth.user = payload?.user && typeof payload.user === "object" ? payload.user : null;
  saveAuthState();
}

function clearAuthSession() {
  state.auth.accessToken = "";
  state.auth.user = null;
  state.approvals = [];
  state.memory = { preferences: "", notes: "" };
  state.ops = { permissions: {}, routines: [], reminders: [], jobs: [], auditLogs: [], ragResults: [] };
  state.notificationCursor = null;
  saveAuthState();
  clearConversationState();
}

function setAuthStatus(message, tone = "neutral") {
  if (!elements.authStatus) {
    return;
  }
  elements.authStatus.textContent = String(message || "");
  elements.authStatus.classList.remove("is-error", "is-success");
  if (tone === "error") {
    elements.authStatus.classList.add("is-error");
  } else if (tone === "success") {
    elements.authStatus.classList.add("is-success");
  }
}

function setAuthTab(tabName) {
  const isSignUp = tabName === "signup";
  elements.authTabs.forEach((btn) => {
    const isActive = btn.dataset.authTab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  if (elements.authSignInPanel) {
    elements.authSignInPanel.classList.toggle("active", !isSignUp);
  }
  if (elements.authSignUpPanel) {
    elements.authSignUpPanel.classList.toggle("active", isSignUp);
  }
  setAuthStatus("");
}

function updateAuthUI() {
  const authenticated = Boolean(state.auth.accessToken && state.auth.user?.id);
  if (elements.authScreen) {
    elements.authScreen.classList.toggle("hidden", authenticated);
  }
  if (elements.currentUserName) {
    elements.currentUserName.textContent = authenticated
      ? getAuthDisplayName(state.auth.user)
      : "Not signed in";
  }

  if (!authenticated) {
    setConnection(false);
    stopNotificationPolling();
    clearConversationState();
    closeQuickCommandOverlay();
    closeMemoryModal();
    closeOpsModal();
    renderAll();
    autoResizeInput();
    updateBusyState();
  }
}

function createConversation() {
  const userSuffix = String(state.auth.user?.id || "anon")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8) || "anon";

  const conversation = normalizeConversationRecord({
    id: uid(`conv_${userSuffix}`),
    title: "New chat",
    titleGenerated: false,
    titleGenerating: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
    workflow: [],
    remoteAvailable: false,
    messagesLoaded: true,
    workflowRunning: false,
    workflowCompleted: false,
    workflowManuallyOpened: false
  });
  state.conversations.unshift(conversation);
  state.activeConversationId = conversation.id;
  saveState();
  return conversation;
}

function ensureConversation() {
  if (!state.conversations.length) {
    createConversation();
  }
  const exists = state.conversations.some((c) => c.id === state.activeConversationId);
  if (!exists) {
    state.activeConversationId = state.conversations[0].id;
  }
}

function setConnection(connected) {
  state.connected = connected;
  elements.connectionBadge.textContent = connected ? "Connected" : "Disconnected";
  elements.connectionBadge.classList.remove("badge-online", "badge-offline");
  elements.connectionBadge.classList.add(connected ? "badge-online" : "badge-offline");
}

function updateBusyState() {
  const busy = state.requestInFlight || state.transcribeInFlight;
  const hasDraft = Boolean(elements.promptInput.value.trim());
  const conversation = getActiveConversation();
  const signedIn = Boolean(state.auth.accessToken);

  elements.sendBtn.disabled = busy || !hasDraft || state.isRecording;
  elements.sendBtn.classList.toggle("show", hasDraft && !state.isRecording);
  elements.newChatBtn.disabled = busy || state.isRecording;

  elements.attachBtn.disabled = busy || state.isRecording;
  elements.micBtn.disabled = state.requestInFlight || state.transcribeInFlight;
  elements.ttsToggleBtn.disabled = state.transcribeInFlight || state.isRecording;
  elements.ttsToggleBtn.classList.toggle("active", state.ttsEnabled);
  elements.ttsToggleBtn.setAttribute("aria-pressed", state.ttsEnabled ? "true" : "false");

  elements.promptInput.disabled = state.isRecording;
  elements.composerShell.classList.toggle("is-recording", state.isRecording);
  elements.recordingShell.setAttribute("aria-hidden", state.isRecording ? "false" : "true");
  elements.recordingCancelBtn.disabled = busy;
  elements.recordingConfirmBtn.disabled = busy;
  elements.closeWorkflowBtn.disabled = !conversation || conversation.workflowRunning;
  if (elements.memoryBtn) {
    elements.memoryBtn.disabled = !signedIn;
  }
  if (elements.opsBtn) {
    elements.opsBtn.disabled = !signedIn;
  }
}

function addWorkflowEvent(type, content) {
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }
  conversation.workflow = conversation.workflow || [];
  conversation.workflow.unshift({
    id: uid("flow"),
    type,
    content: String(content || ""),
    timestamp: nowIso()
  });
  conversation.workflow = conversation.workflow.slice(0, 200);
  conversation.updatedAt = nowIso();
  saveState();
  renderWorkflow();
  renderHistory();
}

function isWorkflowPanelVisible(conversation) {
  return Boolean(conversation && (conversation.workflowRunning || conversation.workflowManuallyOpened));
}

function syncWorkflowPanelVisibility() {
  const conversation = getActiveConversation();
  const visible = isWorkflowPanelVisible(conversation);
  elements.appShell.classList.toggle("workflow-open", visible);
}

function showWorkflowPanelFromChat() {
  const conversation = getActiveConversation();
  if (!conversation || !conversation.workflow.length) {
    return;
  }
  conversation.workflowManuallyOpened = true;
  saveState();
  renderAll();
}

function closeWorkflowPanel() {
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }
  if (conversation.workflowRunning) {
    addWorkflowEvent("warning", "Workflow is running. You can close it after completion.");
    return;
  }
  conversation.workflowManuallyOpened = false;
  saveState();
  renderAll();
}

function renderHistory() {
  const sorted = sortConversationsByUpdated(state.conversations);
  elements.historyList.innerHTML = "";

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No conversations yet.";
    elements.historyList.appendChild(empty);
    return;
  }

  sorted.forEach((conversation) => {
    const item = document.createElement("article");
    item.className = "history-item";
    item.tabIndex = 0;
    if (conversation.id === state.activeConversationId) {
      item.classList.add("active");
    }

    const row = document.createElement("div");
    row.className = "history-row";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = conversation.title || "New chat";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "history-delete";
    deleteBtn.title = "Delete session";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      void removeConversation(conversation.id);
    });

    row.appendChild(title);
    row.appendChild(deleteBtn);

    const preview = document.createElement("div");
    preview.className = "history-preview";
    preview.textContent = conversation.preview || "No messages yet.";

    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = formatDateTime(conversation.updatedAt);

    item.appendChild(row);
    item.appendChild(preview);
    item.appendChild(time);
    item.addEventListener("click", () => {
      void openConversation(conversation.id);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void openConversation(conversation.id);
      }
    });

    elements.historyList.appendChild(item);
  });
}

async function openConversation(conversationId) {
  if (state.requestInFlight) {
    addWorkflowEvent("warning", "Wait for current stream to finish before switching chats.");
    return;
  }

  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return;
  }

  state.activeConversationId = conversationId;
  saveState();
  renderAll();

  const shouldHydrate = state.connected && conversation.remoteAvailable && !conversation.messagesLoaded;
  if (!shouldHydrate) {
    return;
  }

  try {
    const remoteSession = await fetchSessionById(conversation.id);
    conversation.title = String(remoteSession.title || conversation.title || "New chat");
    conversation.model = String(remoteSession.model || conversation.model || "openai");
    conversation.createdAt = String(remoteSession.created_at || conversation.createdAt || nowIso());
    conversation.updatedAt = String(remoteSession.updated_at || conversation.updatedAt || nowIso());
    conversation.remoteAvailable = true;
    conversation.messages = (Array.isArray(remoteSession.messages) ? remoteSession.messages : [])
      .map((message) => normalizeMessageRecord(message, conversation.updatedAt))
      .filter(Boolean);
    conversation.messagesLoaded = true;
    updateConversationSummary(conversation);
    saveState();
    renderAll();
    addWorkflowEvent("status", "Loaded session history from backend");
  } catch (err) {
    addWorkflowEvent(
      "warning",
      err instanceof Error ? `Failed to load session: ${err.message}` : "Failed to load session"
    );
  }
}

async function removeConversation(conversationId) {
  if (state.requestInFlight) {
    addWorkflowEvent("warning", "Wait for current stream to finish before deleting chats.");
    return;
  }

  const index = state.conversations.findIndex((item) => item.id === conversationId);
  if (index === -1) {
    return;
  }

  const conversation = state.conversations[index];
  const shouldDelete = window.confirm(`Delete "${conversation.title || "New chat"}"?`);
  if (!shouldDelete) {
    return;
  }

  if (state.connected && conversation.remoteAvailable) {
    try {
      await deleteSessionById(conversationId);
    } catch (err) {
      addWorkflowEvent(
        "warning",
        err instanceof Error ? `Backend delete failed: ${err.message}` : "Backend delete failed"
      );
    }
  }

  state.conversations.splice(index, 1);
  if (!state.conversations.length) {
    createConversation();
  }

  if (!state.conversations.some((item) => item.id === state.activeConversationId)) {
    const nextConversation = sortConversationsByUpdated(state.conversations)[0];
    state.activeConversationId = nextConversation?.id || null;
  }

  saveState();
  renderAll();
  addWorkflowEvent("status", "Session deleted");
}

function renderMessages() {
  const conversation = getActiveConversation();
  elements.chatMessages.innerHTML = "";

  if (!conversation || !conversation.messages.length) {
    const welcome = document.createElement("div");
    welcome.className = "welcome-shell";
    welcome.innerHTML = `
      <h2 class="welcome-title">What can I help with?</h2>
      <p class="welcome-subtitle">
        Welcome to JOI. Ask anything in natural language and I will stream the response in real time.
      </p>
      <div class="welcome-hints">
        <span class="welcome-chip">Summarize a topic</span>
        <span class="welcome-chip">Search the web</span>
        <span class="welcome-chip">Workspace files</span>
        <span class="welcome-chip">Email and calendar</span>
        <span class="welcome-chip">Memory and approvals</span>
        <span class="welcome-chip">RAG over local docs</span>
        <span class="welcome-chip">Routines and reminders</span>
        <span class="welcome-chip">Jobs and notifications</span>
      </div>
    `;
    elements.chatMessages.appendChild(welcome);
    return;
  }

  conversation.messages.forEach((message) => {
    const bubble = document.createElement("article");
    bubble.className = `message ${message.role === "user" ? "user" : "assistant"}${message.streaming ? " streaming" : ""}`;

    const content = document.createElement("div");
    content.className = "message-body";
    if (message.role === "assistant") {
      if (message.streaming && message.awaitingFirstChunk) {
        content.innerHTML = `
          <div class="thinking-wrap">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-label">AI is thinking...</span>
          </div>
        `;
      } else {
        content.innerHTML = formatStructuredMessage(message.content, message.streaming);
      }
    } else {
      content.textContent = message.content;
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = formatDateTime(message.timestamp);

    bubble.appendChild(content);
    bubble.appendChild(meta);

    if (message.role === "assistant" && !message.streaming && String(message.content || "").trim()) {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "message-action";
      if (state.speakingMessageId === message.id) {
        speakBtn.classList.add("active");
      }
      speakBtn.title = state.speakingMessageId === message.id ? "Stop speaking" : "Speak response";
      speakBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 6 8 9H5v6h3l3 3V6Z"></path>
          <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
          <path d="M17.8 6a8.5 8.5 0 0 1 0 12"></path>
        </svg>
      `;
      speakBtn.addEventListener("click", () => {
        void speakAssistantMessage(message.id);
      });

      const likeBtn = document.createElement("button");
      likeBtn.type = "button";
      likeBtn.className = "message-action";
      if (message.feedback === "like") {
        likeBtn.classList.add("active");
      }
      likeBtn.title = "Like response";
      likeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 10V5a2 2 0 0 0-2-2l-1 5-3 4v8h9a2 2 0 0 0 2-2l1-6a2 2 0 0 0-2-2h-4Z"></path>
          <path d="M3 12h5v8H3z"></path>
        </svg>
      `;
      likeBtn.addEventListener("click", () => {
        void setMessageFeedback(message.id, "like");
      });

      const dislikeBtn = document.createElement("button");
      dislikeBtn.type = "button";
      dislikeBtn.className = "message-action";
      if (message.feedback === "dislike") {
        dislikeBtn.classList.add("active");
      }
      dislikeBtn.title = "Dislike response";
      dislikeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 14v5a2 2 0 0 0 2 2l1-5 3-4V4h-9a2 2 0 0 0-2 2l-1 6a2 2 0 0 0 2 2h4Z"></path>
          <path d="M21 4h-5v8h5z"></path>
        </svg>
      `;
      dislikeBtn.addEventListener("click", () => {
        void setMessageFeedback(message.id, "dislike");
      });

      actions.appendChild(speakBtn);
      actions.appendChild(likeBtn);
      actions.appendChild(dislikeBtn);
      bubble.appendChild(actions);
    }

    elements.chatMessages.appendChild(bubble);
  });

  if (
    conversation.workflowCompleted
    && !conversation.workflowRunning
    && !conversation.workflowManuallyOpened
    && conversation.workflow.length
  ) {
    const restore = document.createElement("div");
    restore.className = "workflow-restore";
    restore.innerHTML = `
      <button type="button" class="workflow-restore-btn">View workflow steps</button>
    `;
    restore.querySelector("button")?.addEventListener("click", showWorkflowPanelFromChat);
    elements.chatMessages.appendChild(restore);
  }

  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function renderWorkflow() {
  const conversation = getActiveConversation();
  elements.workflowList.innerHTML = "";

  const events = conversation?.workflow || [];
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Workflow steps will appear during agentic execution.";
    elements.workflowList.appendChild(empty);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement("article");
    item.className = "workflow-item";

    const type = document.createElement("div");
    type.className = "workflow-type";
    type.textContent = event.type;

    const content = document.createElement("div");
    content.className = "workflow-content";
    content.textContent = event.content;

    const time = document.createElement("div");
    time.className = "workflow-time";
    time.textContent = formatDateTime(event.timestamp);

    item.appendChild(type);
    item.appendChild(content);
    item.appendChild(time);
    elements.workflowList.appendChild(item);
  });
}

function renderAll() {
  syncWorkflowPanelVisibility();
  renderHistory();
  renderMessages();
  renderWorkflow();
  renderApprovals();
}

function normalizeConversationTitle(text) {
  const source = String(text || "").toLowerCase().replace(/[^\w\s]/g, " ");
  const normalized = source.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New chat";
  }

  if (/(what|which).*(can|do).*(you|joi)/.test(normalized)) {
    return "JOI capabilities";
  }
  if (/(summarize|summary)/.test(normalized)) {
    return "Summary request";
  }
  if (/(email|mail)/.test(normalized)) {
    return "Email assistance";
  }
  if (/(calendar|task|schedule|meeting)/.test(normalized)) {
    return "Calendar and tasks";
  }

  const ignore = new Set([
    "hey", "hi", "hello", "joi", "please", "basically", "actually", "just",
    "can", "could", "would", "you", "help", "with", "what", "how", "the",
    "a", "an", "to", "for", "me", "i", "my", "on", "in", "of", "is", "are"
  ]);

  const words = normalized.split(" ").filter((w) => w && !ignore.has(w));
  const phrase = (words.length ? words : normalized.split(" ")).slice(0, 6).join(" ");
  const title = phrase.trim();
  if (!title) {
    return "New chat";
  }
  return title.charAt(0).toUpperCase() + title.slice(1, 46);
}

function maybeScheduleTitleGeneration(conversation) {
  if (!conversation || conversation.titleGenerated || conversation.titleGenerating) {
    return;
  }

  const userMsgs = (conversation.messages || []).filter((m) => m.role === "user" && !m.streaming);
  const assistantMsgs = (conversation.messages || []).filter((m) => m.role === "assistant" && !m.streaming);
  if (!userMsgs.length || !assistantMsgs.length) {
    return;
  }

  conversation.titleGenerating = true;
  saveState();
  void generateConversationTitle(conversation.id);
}

async function generateConversationTitle(conversationId) {
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    return;
  }

  const history = (conversation.messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && !m.streaming)
    .slice(0, 8)
    .map((m) => ({ role: m.role, content: String(m.content || "") }));

  const fallbackText = history.find((m) => m.role === "user")?.content || "";

  try {
    const response = await authorizedFetch(`${BACKEND_BASE_URL}/chat/title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, fallback_text: fallbackText })
    });

    if (response.ok) {
      const data = await response.json();
      const remoteTitle = String(data?.title || "").trim();
      if (remoteTitle) {
        conversation.title = remoteTitle.slice(0, 48);
      } else {
        conversation.title = normalizeConversationTitle(fallbackText);
      }
    } else {
      conversation.title = normalizeConversationTitle(fallbackText);
    }
  } catch (_err) {
    conversation.title = normalizeConversationTitle(fallbackText);
  } finally {
    conversation.titleGenerating = false;
    conversation.titleGenerated = true;
    conversation.updatedAt = nowIso();
    saveState();
    renderHistory();
  }
}

function ensureStreamingMessage() {
  const conversation = getActiveConversation();
  if (!conversation) {
    return null;
  }

  if (!state.streamingMessageId) {
    const streamingMessage = {
      id: uid("msg"),
      role: "assistant",
      content: "",
      timestamp: nowIso(),
      streaming: true,
      awaitingFirstChunk: true,
      feedback: null
    };
    conversation.messages.push(streamingMessage);
    state.streamingMessageId = streamingMessage.id;
  }

  return conversation.messages.find((msg) => msg.id === state.streamingMessageId) || null;
}

function finalizeStreamingMessage() {
  const conversation = getActiveConversation();
  if (!conversation || !state.streamingMessageId) {
    return;
  }

  const index = conversation.messages.findIndex((msg) => msg.id === state.streamingMessageId);
  if (index !== -1) {
    const message = conversation.messages[index];
    message.content = normalizeAssistantText(message.content);
    message.streaming = false;
    message.awaitingFirstChunk = false;
    if (!message.content) {
      conversation.messages.splice(index, 1);
    }
  }

  state.streamingMessageId = null;
  conversation.updatedAt = nowIso();
  conversation.messagesLoaded = true;
  conversation.remoteAvailable = true;
  updateConversationSummary(conversation);
  saveState();
  renderAll();
  maybeScheduleTitleGeneration(conversation);
}

function getSpeechFriendlyText(text) {
  return normalizeAssistantText(text)
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[_#>*-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTTSAudioBlob(text) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/audio/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: "alloy"
    })
  });

  if (!response.ok) {
    let reason = `TTS failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        reason = payload.detail;
      }
    } catch (_err) {
      // noop
    }
    throw new Error(reason);
  }

  return response.blob();
}

function stopCurrentSpeechPlayback() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.src = "";
    state.currentAudio = null;
  }
  state.speakingMessageId = null;
}

function getMessageById(conversation, messageId) {
  if (!conversation) {
    return null;
  }
  return conversation.messages.find((msg) => msg.id === messageId) || null;
}

async function speakAssistantMessage(messageId) {
  const conversation = getActiveConversation();
  const message = getMessageById(conversation, messageId);
  if (!conversation || !message || message.role !== "assistant" || message.streaming) {
    return;
  }

  if (state.speakingMessageId === messageId && state.currentAudio) {
    stopCurrentSpeechPlayback();
    renderMessages();
    return;
  }

  if (!state.ttsEnabled) {
    addWorkflowEvent("warning", "Enable voice playback first to use speak button.");
    return;
  }

  if (state.speakRequestInFlight) {
    return;
  }

  const speechText = getSpeechFriendlyText(message.content).slice(0, 2000);
  if (!speechText) {
    return;
  }

  state.speakRequestInFlight = true;
  stopCurrentSpeechPlayback();
  state.speakingMessageId = messageId;
  renderMessages();

  try {
    const blob = await fetchTTSAudioBlob(speechText);
    const audioUrl = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      state.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (state.currentAudio === audio) {
          state.currentAudio = null;
        }
        state.speakingMessageId = null;
        renderMessages();
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        if (state.currentAudio === audio) {
          state.currentAudio = null;
        }
        state.speakingMessageId = null;
        renderMessages();
        reject(new Error("Audio playback failed"));
      };

      audio.play().catch((err) => {
        URL.revokeObjectURL(audioUrl);
        if (state.currentAudio === audio) {
          state.currentAudio = null;
        }
        state.speakingMessageId = null;
        renderMessages();
        reject(err);
      });
    });
  } catch (err) {
    addWorkflowEvent("warning", err instanceof Error ? err.message : String(err));
  } finally {
    state.speakRequestInFlight = false;
  }
}

async function submitFeedback(conversationId, message, feedback) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      message_id: message.id,
      feedback,
      message_text: String(message.content || ""),
      model: state.model
    })
  });
  if (!response.ok) {
    throw new Error(`Feedback failed (${response.status})`);
  }
}

async function setMessageFeedback(messageId, targetFeedback) {
  const conversation = getActiveConversation();
  const message = getMessageById(conversation, messageId);
  if (!conversation || !message || message.role !== "assistant") {
    return;
  }

  const nextFeedback = message.feedback === targetFeedback ? null : targetFeedback;
  message.feedback = nextFeedback;
  saveState();
  renderMessages();

  if (!state.connected) {
    return;
  }

  try {
    await submitFeedback(conversation.id, message, nextFeedback || "clear");
  } catch (err) {
    addWorkflowEvent("warning", err instanceof Error ? err.message : String(err));
  }
}

function toggleTTS() {
  state.ttsEnabled = !state.ttsEnabled;
  if (!state.ttsEnabled) {
    stopCurrentSpeechPlayback();
    renderMessages();
  }
  saveState();
  updateBusyState();
  addWorkflowEvent("status", state.ttsEnabled ? "Voice playback enabled" : "Voice playback disabled");
}

function stopStreamTypingLoop() {
  if (state.streamTimer) {
    clearInterval(state.streamTimer);
    state.streamTimer = null;
  }
}

function startStreamTypingLoop() {
  if (state.streamTimer) {
    return;
  }

  state.streamTimer = setInterval(() => {
    const conversation = getActiveConversation();
    if (!conversation) {
      stopStreamTypingLoop();
      return;
    }

    if (!state.streamTextQueue.length) {
      if (state.streamDonePending) {
        state.streamDonePending = false;
        stopStreamTypingLoop();
        finalizeStreamingMessage();
      }
      return;
    }

    const current = state.streamTextQueue[0];
    const step = Math.max(1, Math.min(6, Math.ceil(current.length / 10)));
    const nextPart = current.slice(0, step);
    const remaining = current.slice(step);

    if (remaining.length) {
      state.streamTextQueue[0] = remaining;
    } else {
      state.streamTextQueue.shift();
    }

    const message = ensureStreamingMessage();
    if (!message) {
      return;
    }
    message.awaitingFirstChunk = false;
    message.content += nextPart;
    renderMessages();
  }, 18);
}

function enqueueStreamText(text) {
  const chunkText = String(text || "");
  if (!chunkText) {
    return;
  }
  state.streamTextQueue.push(chunkText);
  startStreamTypingLoop();
}

function markStreamDone() {
  state.streamDonePending = true;
  if (!state.streamTextQueue.length) {
    state.streamDonePending = false;
    stopStreamTypingLoop();
    finalizeStreamingMessage();
  }
}

function parseSSEFrames(chunk, stateBuffer, onFrame) {
  let buffer = (stateBuffer + chunk).replace(/\r\n/g, "\n");
  let separatorIndex = buffer.indexOf("\n\n");

  while (separatorIndex !== -1) {
    const frame = buffer.slice(0, separatorIndex).trim();
    buffer = buffer.slice(separatorIndex + 2);
    separatorIndex = buffer.indexOf("\n\n");

    if (!frame) {
      continue;
    }

    const lines = frame.split("\n");
    let eventName = "message";
    const dataParts = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataParts.push(line.slice(5).trimStart());
      }
    }

    const dataValue = dataParts.join("\n");
    if (dataValue) {
      try {
        onFrame(eventName, JSON.parse(dataValue));
      } catch (_err) {
        onFrame("error", { message: "Invalid SSE JSON payload" });
      }
    }
  }

  return buffer;
}

function handleSSEEvent(eventName, payload) {
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  if (eventName === "ai_chunk") {
    enqueueStreamText(String(payload.chunk || ""));
    return;
  }

  if (eventName === "workflow_started") {
    conversation.workflowRunning = true;
    conversation.workflowCompleted = false;
    conversation.workflowManuallyOpened = false;
    addWorkflowEvent("workflow_start", String(payload.message || "Workflow started"));
    syncWorkflowPanelVisibility();
    return;
  }

  if (eventName === "workflow_step_started") {
    conversation.workflowRunning = true;
    const argsText = JSON.stringify(payload.args || {});
    addWorkflowEvent(
      "step_started",
      `Step ${Number(payload.step_index || 0)}: ${String(payload.tool || "tool")}\nargs: ${argsText}`
    );
    syncWorkflowPanelVisibility();
    return;
  }

  if (eventName === "workflow_step_completed") {
    const details = [
      `Step ${Number(payload.step_index || 0)} completed: ${String(payload.tool || "tool")}`,
      "",
      String(payload.result || "")
    ].join("\n");
    addWorkflowEvent("step_completed", details);
    return;
  }

  if (eventName === "workflow_step_requires_approval") {
    const details = [
      `Approval required for tool: ${String(payload.tool || "tool")}`,
      `Approval ID: ${String(payload.approval_id || "")}`,
      "",
      JSON.stringify(payload.args || {}, null, 2)
    ].join("\n");
    addWorkflowEvent("approval_required", details);
    void fetchPendingApprovals()
      .then(() => renderApprovals())
      .catch(() => {});
    return;
  }

  if (eventName === "workflow_step_blocked") {
    const details = [
      `Tool blocked: ${String(payload.tool || "tool")}`,
      String(payload.reason || "Blocked by policy")
    ].join("\n");
    addWorkflowEvent("step_blocked", details);
    return;
  }

  if (eventName === "workflow_completed") {
    conversation.workflowRunning = false;
    conversation.workflowCompleted = true;
    conversation.workflowManuallyOpened = false;
    addWorkflowEvent("workflow_completed", String(payload.message || "Workflow completed"));
    saveState();
    renderAll();
    return;
  }

  if (eventName === "workflow_failed") {
    conversation.workflowRunning = false;
    conversation.workflowCompleted = false;
    conversation.workflowManuallyOpened = true;
    addWorkflowEvent("workflow_failed", String(payload.message || "Workflow failed"));
    saveState();
    renderAll();
    return;
  }

  if (eventName === "warning" && conversation.workflowRunning) {
    addWorkflowEvent("warning", String(payload.message || ""));
    return;
  }

  if (eventName === "error") {
    if (conversation.workflowRunning) {
      conversation.workflowRunning = false;
      conversation.workflowManuallyOpened = true;
      addWorkflowEvent("error", String(payload.message || "Unknown SSE error"));
      saveState();
      renderAll();
    }
    markStreamDone();
    return;
  }

  if (eventName === "done" || eventName === "end") {
    markStreamDone();
    return;
  }
}

async function streamAssistantResponse(userText) {
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  const history = conversation.messages
    .filter((msg) => (msg.role === "user" || msg.role === "assistant") && !msg.streaming)
    .map((msg) => ({ role: msg.role, content: msg.content }));
  const activeContext = await getActiveAppContext();
  if (activeContext.app || activeContext.title) {
    history.unshift({
      role: "system",
      content: `Active desktop context: app=${activeContext.app || "unknown"}, title=${activeContext.title || ""}`
    });
  }

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversation.id,
      message: userText,
      model: state.model,
      history
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed (${response.status})`);
  }

  conversation.remoteAvailable = true;
  conversation.messagesLoaded = true;
  setConnection(true);

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer = parseSSEFrames("\n\n", buffer, handleSSEEvent);
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    buffer = parseSSEFrames(chunk, buffer, handleSSEEvent);
  }
}

async function sendMessage() {
  if (!state.auth.accessToken) {
    updateAuthUI();
    setAuthStatus("Please sign in to continue.", "error");
    return;
  }

  const text = elements.promptInput.value.trim();
  if (!text) {
    return;
  }

  if (state.requestInFlight) {
    addWorkflowEvent("warning", "A response is already streaming.");
    return;
  }

  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  if (state.streamingMessageId) {
    finalizeStreamingMessage();
  }

  state.streamTextQueue = [];
  state.streamDonePending = false;
  stopStreamTypingLoop();
  conversation.workflow = [];
  conversation.workflowRunning = false;
  conversation.workflowCompleted = false;
  conversation.workflowManuallyOpened = false;

  conversation.messages.push({
    id: uid("msg"),
    role: "user",
    content: text,
    timestamp: nowIso(),
    streaming: false,
    awaitingFirstChunk: false,
    feedback: null
  });
  conversation.messagesLoaded = true;

  if (conversation.title === "New chat") {
    conversation.title = normalizeConversationTitle(text);
    conversation.titleGenerated = false;
  }

  ensureStreamingMessage();
  conversation.updatedAt = nowIso();
  updateConversationSummary(conversation);
  saveState();
  renderAll();

  elements.promptInput.value = "";
  autoResizeInput();

  state.requestInFlight = true;
  updateBusyState();

  try {
    await streamAssistantResponse(text);
  } catch (err) {
    setConnection(false);
    addWorkflowEvent("error", err instanceof Error ? err.message : String(err));
    markStreamDone();
  } finally {
    state.requestInFlight = false;
    updateBusyState();
    markStreamDone();
  }
}

async function transcribeAudioBlob(blob) {
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
  const form = new FormData();
  form.append("file", file);
  form.append("model", "whisper-1");

  const response = await authorizedFetch(`${BACKEND_BASE_URL}/audio/transcribe`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    let reason = `Transcription failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.detail) {
        reason = data.detail;
      }
    } catch (_err) {
      // noop
    }
    throw new Error(reason);
  }

  const payload = await response.json();
  return String(payload?.text || "").trim();
}

function cleanupRecorderResources() {
  if (state.mediaStream) {
    for (const track of state.mediaStream.getTracks()) {
      track.stop();
    }
  }
  state.mediaRecorder = null;
  state.mediaStream = null;
  state.audioChunks = [];
  state.recordingAction = "none";
}

async function toggleVoiceRecording() {
  if (state.transcribeInFlight || state.requestInFlight) {
    addWorkflowEvent("warning", "Please wait for the current operation to complete.");
    return;
  }

  if (state.isRecording) {
    confirmVoiceRecording();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    addWorkflowEvent("error", "Voice input is not supported in this desktop environment.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;
    state.audioChunks = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    state.mediaRecorder = recorder;
    state.recordingAction = "none";

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const action = state.recordingAction === "cancel" ? "cancel" : "transcribe";
      try {
        if (action === "cancel") {
          addWorkflowEvent("status", "Voice recording cancelled.");
          return;
        }

        const blob = new Blob(state.audioChunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          addWorkflowEvent("warning", "No audio captured. Please try again.");
          return;
        }

        state.transcribeInFlight = true;
        updateBusyState();
        const transcript = await transcribeAudioBlob(blob);

        if (!transcript) {
          addWorkflowEvent("warning", "No speech recognized from audio.");
          return;
        }

        addWorkflowEvent("status", `Voice recognized: ${transcript.slice(0, 80)}`);
        elements.promptInput.value = transcript;
        autoResizeInput();
        await sendMessage();
      } catch (err) {
        addWorkflowEvent("error", err instanceof Error ? err.message : String(err));
      } finally {
        state.transcribeInFlight = false;
        cleanupRecorderResources();
        updateBusyState();
      }
    };

    recorder.start(250);
    state.isRecording = true;
    updateBusyState();
    addWorkflowEvent("status", "Recording voice input...");
  } catch (err) {
    cleanupRecorderResources();
    state.isRecording = false;
    updateBusyState();
    addWorkflowEvent("error", err instanceof Error ? err.message : String(err));
  }
}

function stopRecorderWithAction(action) {
  if (!state.isRecording || !state.mediaRecorder) {
    return false;
  }
  state.recordingAction = action;
  state.isRecording = false;
  updateBusyState();
  try {
    state.mediaRecorder.stop();
  } catch (err) {
    cleanupRecorderResources();
    addWorkflowEvent("error", err instanceof Error ? err.message : String(err));
    return false;
  }
  return true;
}

function cancelVoiceRecording() {
  stopRecorderWithAction("cancel");
}

function confirmVoiceRecording() {
  const stopped = stopRecorderWithAction("transcribe");
  if (stopped) {
    addWorkflowEvent("status", "Stopped recording. Transcribing...");
  }
}

function startNewChat() {
  if (state.requestInFlight) {
    addWorkflowEvent("warning", "Wait for current stream to finish before starting a new chat.");
    return;
  }
  const conversation = createConversation();
  renderAll();
  addWorkflowEvent("status", `Started new chat (${conversation.id.slice(-8)})`);
}

function autoResizeInput() {
  elements.promptInput.style.height = "auto";
  elements.promptInput.style.height = `${Math.min(elements.promptInput.scrollHeight, 160)}px`;
}

async function fetchSessionList() {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/sessions`);
  if (!response.ok) {
    throw new Error(`Session list failed (${response.status})`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.sessions) ? payload.sessions : [];
}

async function fetchSessionById(sessionId) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error(`Session load failed (${response.status})`);
  }
  return response.json();
}

async function deleteSessionById(sessionId) {
  const response = await authorizedFetch(`${BACKEND_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Session delete failed (${response.status})`);
  }
}

function mergeSessionSummaries(sessionSummaries) {
  const conversationMap = new Map();
  for (const conversation of state.conversations) {
    conversationMap.set(conversation.id, normalizeConversationRecord(conversation));
  }

  for (const summary of sessionSummaries) {
    const sessionId = String(summary?.session_id || "").trim();
    if (!sessionId) {
      continue;
    }

    const existing = conversationMap.get(sessionId);
    const remoteUpdatedAt = String(summary?.updated_at || nowIso());
    const mergedUpdatedAt =
      existing && new Date(existing.updatedAt).getTime() > new Date(remoteUpdatedAt).getTime()
        ? existing.updatedAt
        : remoteUpdatedAt;

    const merged = normalizeConversationRecord({
      id: sessionId,
      title: String(summary?.title || existing?.title || "New chat"),
      model: String(summary?.model || existing?.model || "openai"),
      createdAt: String(summary?.created_at || existing?.createdAt || nowIso()),
      updatedAt: mergedUpdatedAt,
      preview: String(summary?.preview || existing?.preview || ""),
      messageCount: Number(summary?.message_count || existing?.messageCount || 0),
      messages: Array.isArray(existing?.messages) ? existing.messages : [],
      workflow: Array.isArray(existing?.workflow) ? existing.workflow : [],
      remoteAvailable: true,
      messagesLoaded:
        Boolean(existing?.messagesLoaded) ||
        Number(summary?.message_count || 0) === 0 ||
        Number(existing?.messageCount || 0) > 0
    });

    if (merged.messagesLoaded) {
      updateConversationSummary(merged);
    } else {
      merged.messageCount = Number(summary?.message_count || existing?.messageCount || 0);
      merged.preview = String(summary?.preview || existing?.preview || "");
    }

    if (summary?.preview && !merged.preview) {
      merged.preview = String(summary.preview).slice(0, 120);
    }

    conversationMap.set(sessionId, merged);
  }

  state.conversations = sortConversationsByUpdated(Array.from(conversationMap.values()));
  ensureConversation();
}

async function syncSessionsFromBackend() {
  if (!state.connected || state.sessionsSyncInFlight || !state.auth.accessToken) {
    return;
  }

  state.sessionsSyncInFlight = true;
  try {
    const summaries = await fetchSessionList();
    mergeSessionSummaries(summaries);
    saveState();
    renderAll();
  } catch (err) {
    addWorkflowEvent(
      "warning",
      err instanceof Error ? `Session sync failed: ${err.message}` : "Session sync failed"
    );
  } finally {
    state.sessionsSyncInFlight = false;
  }
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/health`);
    setConnection(response.ok);
    if (!response.ok) {
      addWorkflowEvent("warning", "Backend health check failed.");
    }
    return response.ok;
  } catch (_err) {
    setConnection(false);
    addWorkflowEvent("warning", "Backend is not reachable. Start api_server.py first.");
    return false;
  }
}

async function fetchAuthConfig() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/auth/config`);
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    state.auth.googleClientId = String(payload?.google_client_id || "").trim();
  } catch (_err) {
    state.auth.googleClientId = "";
  }
}

async function restoreAuthSession() {
  if (!state.auth.accessToken) {
    return false;
  }

  try {
    const response = await authorizedFetch(`${BACKEND_BASE_URL}/auth/me`);
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    if (!payload?.user?.id) {
      return false;
    }
    state.auth.user = payload.user;
    saveAuthState();
    return true;
  } catch (_err) {
    return false;
  }
}

function initGoogleSignInButton() {
  if (!elements.googleButtonWrap) {
    return;
  }

  elements.googleButtonWrap.innerHTML = "";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "google-desktop-btn";
  button.innerHTML = `
    <span class="google-desktop-mark" aria-hidden="true">G</span>
    <span>Continue with Google</span>
  `;

  const hasClientId = Boolean(String(state.auth.googleClientId || "").trim());
  const hasBridge = Boolean(window.joiDesktop?.startGoogleDesktopOAuth);

  if (!hasClientId || !hasBridge) {
    button.disabled = true;
    button.title = !hasClientId
      ? "Google OAuth is not configured in backend."
      : "Desktop OAuth bridge is unavailable.";
  } else {
    button.addEventListener("click", () => {
      void handleGoogleDesktopSignIn();
    });
  }

  elements.googleButtonWrap.appendChild(button);
}

async function initializeAuthenticatedApp() {
  loadState();
  ensureConversation();
  elements.modelSelect.value = state.model;
  await fetchMemory().catch(() => {});
  await fetchPendingApprovals().catch(() => {});
  await refreshOpsData().catch(() => {});
  updateAuthUI();
  renderAll();
  autoResizeInput();
  updateBusyState();
  startNotificationPolling();
  void pollNotifications();

  const healthy = await checkBackendHealth();
  if (healthy) {
    await syncSessionsFromBackend();
  }
}

async function handleSignInSubmit(event) {
  event.preventDefault();
  setAuthStatus("");

  const email = String(elements.signInEmail.value || "").trim();
  const password = String(elements.signInPassword.value || "");
  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      setAuthStatus(await parseErrorResponse(response, "Unable to sign in."), "error");
      return;
    }

    const payload = await response.json();
    setAuthSession(payload);
    setAuthStatus("Sign-in successful.", "success");
    await initializeAuthenticatedApp();
  } catch (_err) {
    setAuthStatus("Unable to sign in right now. Please try again.", "error");
  }
}

async function handleSignUpSubmit(event) {
  event.preventDefault();
  setAuthStatus("");

  const firstName = String(elements.signUpFirstName.value || "").trim();
  const lastName = String(elements.signUpLastName.value || "").trim();
  const email = String(elements.signUpEmail.value || "").trim();
  const password = String(elements.signUpPassword.value || "");
  const confirmPassword = String(elements.signUpConfirmPassword.value || "");

  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    setAuthStatus("Please fill all sign-up fields.", "error");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        confirm_password: confirmPassword
      })
    });

    if (!response.ok) {
      setAuthStatus(await parseErrorResponse(response, "Unable to create account."), "error");
      return;
    }

    const payload = await response.json();
    setAuthSession(payload);
    setAuthStatus("Account created successfully.", "success");
    await initializeAuthenticatedApp();
  } catch (_err) {
    setAuthStatus("Unable to create account right now. Please try again.", "error");
  }
}

async function handleGoogleDesktopSignIn() {
  if (!window.joiDesktop?.startGoogleDesktopOAuth) {
    setAuthStatus("Desktop OAuth bridge is unavailable.", "error");
    return;
  }

  if (!state.auth.googleClientId) {
    setAuthStatus("Google OAuth is not configured on backend.", "error");
    return;
  }

  setAuthStatus("Signing in with Google...");
  try {
    const oauthPayload = await window.joiDesktop.startGoogleDesktopOAuth(state.auth.googleClientId);
    if (!oauthPayload?.code || !oauthPayload?.code_verifier || !oauthPayload?.redirect_uri) {
      setAuthStatus("Google OAuth callback was incomplete.", "error");
      return;
    }

    const authResponse = await fetch(`${BACKEND_BASE_URL}/auth/google/desktop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(oauthPayload)
    });

    if (!authResponse.ok) {
      setAuthStatus(await parseErrorResponse(authResponse, "Google sign-in failed."), "error");
      return;
    }

    const payload = await authResponse.json();
    setAuthSession(payload);
    setAuthStatus("Google sign-in successful.", "success");
    await initializeAuthenticatedApp();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
    setAuthStatus(msg, "error");
  }
}

function handleLogout() {
  stopCurrentSpeechPlayback();
  stopNotificationPolling();
  clearAuthSession();
  updateAuthUI();
  setAuthTab("signin");
  setAuthStatus("You have been signed out.");
}

async function initDesktopMeta() {
  if (!window.joiDesktop?.getAppVersion) {
    return;
  }
  try {
    const version = await window.joiDesktop.getAppVersion();
    elements.buildTag.textContent = `v${version}`;
  } catch (_err) {
    elements.buildTag.textContent = "v-";
  }
}

function bindEvents() {
  elements.authTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setAuthTab(btn.dataset.authTab === "signup" ? "signup" : "signin");
    });
  });

  if (elements.signInForm) {
    elements.signInForm.addEventListener("submit", (event) => {
      void handleSignInSubmit(event);
    });
  }

  if (elements.signUpForm) {
    elements.signUpForm.addEventListener("submit", (event) => {
      void handleSignUpSubmit(event);
    });
  }

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", handleLogout);
  }

  if (elements.memoryBtn) {
    elements.memoryBtn.addEventListener("click", openMemoryModal);
  }
  if (elements.memoryCloseBtn) {
    elements.memoryCloseBtn.addEventListener("click", closeMemoryModal);
  }
  if (elements.memorySaveBtn) {
    elements.memorySaveBtn.addEventListener("click", async () => {
      try {
        await saveMemory();
        addWorkflowEvent("status", "Memory saved.");
        closeMemoryModal();
      } catch (err) {
        addWorkflowEvent("warning", err instanceof Error ? err.message : String(err));
      }
    });
  }
  if (elements.memoryClearBtn) {
    elements.memoryClearBtn.addEventListener("click", async () => {
      try {
        await clearMemory();
        addWorkflowEvent("status", "Memory cleared.");
      } catch (err) {
        addWorkflowEvent("warning", err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (elements.opsBtn) {
    elements.opsBtn.addEventListener("click", openOpsModal);
  }
  if (elements.opsCloseBtn) {
    elements.opsCloseBtn.addEventListener("click", closeOpsModal);
  }
  if (elements.opsModal) {
    elements.opsModal.addEventListener("click", (event) => {
      if (event.target === elements.opsModal) {
        closeOpsModal();
      }
    });
  }
  if (elements.opsRefreshBtn) {
    elements.opsRefreshBtn.addEventListener("click", () => {
      void refreshOpsData({ showProgress: true });
    });
  }
  if (elements.permSaveBtn) {
    elements.permSaveBtn.addEventListener("click", async () => {
      try {
        const toolName = String(elements.permToolName?.value || "").trim();
        const mode = String(elements.permMode?.value || "allow").trim();
        await savePermissionRule(toolName, mode);
        renderPermissionsList();
        setOpsStatus(`Saved permission for ${toolName}.`, "success");
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }
  if (elements.ragIndexBtn) {
    elements.ragIndexBtn.addEventListener("click", async () => {
      try {
        setOpsStatus("Indexing files...", "neutral");
        const summary = await runRagIndex();
        setOpsStatus(
          `Indexed ${Number(summary?.indexed_files || 0)} files, chunks=${Number(summary?.chunk_count || 0)}.`,
          "success"
        );
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }
  if (elements.ragQueryBtn) {
    elements.ragQueryBtn.addEventListener("click", async () => {
      try {
        await runRagQuery();
        renderRagResults();
        setOpsStatus(`RAG returned ${state.ops.ragResults.length} results.`, "success");
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }
  if (elements.routineCreateBtn) {
    elements.routineCreateBtn.addEventListener("click", async () => {
      try {
        await createRoutine();
        if (elements.routineNameInput) {
          elements.routineNameInput.value = "";
        }
        if (elements.routinePromptInput) {
          elements.routinePromptInput.value = "";
        }
        await refreshOpsData({ successMessage: "Routine created." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }
  if (elements.reminderCreateBtn) {
    elements.reminderCreateBtn.addEventListener("click", async () => {
      try {
        await createReminder();
        if (elements.reminderTitleInput) {
          elements.reminderTitleInput.value = "";
        }
        if (elements.reminderMessageInput) {
          elements.reminderMessageInput.value = "";
        }
        await refreshOpsData({ successMessage: "Reminder created." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }
  if (elements.jobCreateBtn) {
    elements.jobCreateBtn.addEventListener("click", async () => {
      try {
        await createJob();
        await refreshOpsData({ successMessage: "Job queued." });
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }
  if (elements.auditRefreshBtn) {
    elements.auditRefreshBtn.addEventListener("click", async () => {
      try {
        await fetchAuditLogs();
        renderAuditLogs();
        setOpsStatus("Audit logs refreshed.", "success");
      } catch (err) {
        setOpsStatus(err instanceof Error ? err.message : String(err), "error");
      }
    });
  }

  if (elements.quickCommandForm) {
    elements.quickCommandForm.addEventListener("submit", (event) => {
      void handleQuickCommandSubmit(event);
    });
  }
  if (elements.quickCommandCloseBtn) {
    elements.quickCommandCloseBtn.addEventListener("click", closeQuickCommandOverlay);
  }
  if (elements.quickCommandOverlay) {
    elements.quickCommandOverlay.addEventListener("click", (event) => {
      if (event.target === elements.quickCommandOverlay) {
        closeQuickCommandOverlay();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeQuickCommandOverlay();
      closeMemoryModal();
      closeOpsModal();
    }
  });

  elements.sendBtn.addEventListener("click", () => {
    void sendMessage();
  });

  elements.attachBtn.addEventListener("click", () => {
    addWorkflowEvent("status", "Attachment picker is not configured yet.");
  });

  elements.newChatBtn.addEventListener("click", startNewChat);
  elements.ttsToggleBtn.addEventListener("click", toggleTTS);
  elements.micBtn.addEventListener("click", () => {
    void toggleVoiceRecording();
  });
  elements.recordingCancelBtn.addEventListener("click", cancelVoiceRecording);
  elements.recordingConfirmBtn.addEventListener("click", confirmVoiceRecording);

  elements.clearWorkflowBtn.addEventListener("click", () => {
    const conversation = getActiveConversation();
    if (!conversation) {
      return;
    }
    conversation.workflow = [];
    conversation.workflowRunning = false;
    conversation.workflowCompleted = false;
    conversation.workflowManuallyOpened = false;
    conversation.updatedAt = nowIso();
    saveState();
    renderAll();
  });
  elements.closeWorkflowBtn.addEventListener("click", closeWorkflowPanel);

  elements.modelSelect.addEventListener("change", (event) => {
    state.model = event.target.value;
    saveState();
    addWorkflowEvent("status", `Model switched to ${state.model}`);
  });

  elements.promptInput.addEventListener("input", autoResizeInput);
  elements.promptInput.addEventListener("input", updateBusyState);
  elements.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });
}

async function bootstrap() {
  bindEvents();
  bindDesktopEventBridge();
  setAuthTab("signin");
  setConnection(false);
  loadAuthState();
  await fetchAuthConfig();
  initGoogleSignInButton();

  const restored = await restoreAuthSession();
  if (restored) {
    await initializeAuthenticatedApp();
  } else {
    updateAuthUI();
    renderAll();
    autoResizeInput();
    updateBusyState();
    await checkBackendHealth();
  }

  initGoogleSignInButton();
  updateAuthUI();
  renderAll();
  void initDesktopMeta();
}

void bootstrap();
