// The model invokes tools by writing `TOOL_CALL::{...json...}` in its reply. That syntax is
// for the backend, not the user, so strip it from what we display. The answer that follows a
// tool call is often glued onto the same line, so we remove just the JSON object (tracking
// strings and nested braces) rather than whole lines. A half-streamed call is removed too.
const MARKER = "TOOL_CALL::";

function endOfJsonObject(text, start) {
  let i = start;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] !== "{") return start;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length; // unterminated (still streaming): hide the rest
}

// "window_list" -> "Window list", for showing tool names to people.
export function toolLabel(tool) {
  const s = String(tool || "").replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Tool";
}

export function stripToolCalls(text) {
  let s = String(text || "");
  let idx = s.indexOf(MARKER);
  while (idx !== -1) {
    const end = endOfJsonObject(s, idx + MARKER.length);
    s = s.slice(0, idx) + s.slice(end);
    idx = s.indexOf(MARKER);
  }
  // A marker can arrive split across stream chunks ("TOOL_CA"…): hide a dangling prefix.
  for (let n = MARKER.length - 1; n > 0; n -= 1) {
    if (s.endsWith(MARKER.slice(0, n))) {
      s = s.slice(0, -n);
      break;
    }
  }
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
