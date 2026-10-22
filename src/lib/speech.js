import { api } from "./api.js";
import { stripToolCalls } from "./toolText.js";

// Speaks JOI's answer. Uses the backend's cloud voice when one is configured; otherwise
// falls back to the voices built into Windows (speechSynthesis), so spoken answers work
// offline with no keys. Hindi text (Devanagari) gets a Hindi voice when one is installed.

let currentAudio = null;

const HINDI = /[ऀ-ॿ]/;

export function cleanForSpeech(text) {
  return stripToolCalls(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const base = lang.split("-")[0];
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang?.startsWith(base)) ||
    null
  );
}

function speakOffline(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const lang = HINDI.test(text) ? "hi-IN" : "en-IN";
  utterance.lang = lang;
  const voice = pickVoice(lang) || pickVoice("en-US");
  if (voice) utterance.voice = voice;
  utterance.rate = 1.02;
  synth.speak(utterance);
}

export function stopSpeaking() {
  currentAudio?.pause();
  currentAudio = null;
  window.speechSynthesis?.cancel();
}

export async function speakText(token, text, { maxChars = 1500 } = {}) {
  const clean = cleanForSpeech(text).slice(0, maxChars);
  if (!clean) return;
  stopSpeaking();
  try {
    const blob = await api.speak(token, clean);
    currentAudio = new Audio(URL.createObjectURL(blob));
    await currentAudio.play();
  } catch {
    speakOffline(clean);
  }
}
