const STORAGE_KEY = "joi_desktop_state_v1";
const BACKEND_BASE_URL = "http://localhost:8000";

const elements = {
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
  streamDonePending: false
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
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
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      model: state.model,
      ttsEnabled: state.ttsEnabled,
      conversations: state.conversations,
      activeConversationId: state.activeConversationId
    })
  );
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.removeItem(STORAGE_KEY);
  }
}

function createConversation() {
  const conversation = normalizeConversationRecord({
    id: uid("conv"),
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
        <span class="welcome-chip">Manage files</span>
        <span class="welcome-chip">Plan tasks</span>
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
    const response = await fetch(`${BACKEND_BASE_URL}/chat/title`, {
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
  const response = await fetch(`${BACKEND_BASE_URL}/audio/speak`, {
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
  const response = await fetch(`${BACKEND_BASE_URL}/feedback`, {
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

  const response = await fetch(`${BACKEND_BASE_URL}/chat/stream`, {
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

  const response = await fetch(`${BACKEND_BASE_URL}/audio/transcribe`, {
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
  const response = await fetch(`${BACKEND_BASE_URL}/sessions`);
  if (!response.ok) {
    throw new Error(`Session list failed (${response.status})`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.sessions) ? payload.sessions : [];
}

async function fetchSessionById(sessionId) {
  const response = await fetch(`${BACKEND_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error(`Session load failed (${response.status})`);
  }
  return response.json();
}

async function deleteSessionById(sessionId) {
  const response = await fetch(`${BACKEND_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
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
  if (!state.connected || state.sessionsSyncInFlight) {
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
  loadState();
  ensureConversation();
  elements.modelSelect.value = state.model;
  setConnection(false);
  bindEvents();
  renderAll();
  autoResizeInput();
  updateBusyState();
  const healthy = await checkBackendHealth();
  if (healthy) {
    await syncSessionsFromBackend();
  }
  void initDesktopMeta();
}

void bootstrap();
