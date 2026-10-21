# JOI changelog

Every release of the JOI desktop app, newest first. The website shows the same notes at
https://joi-landing-one.vercel.app/changelog (from `Joi-Landing/src/content/releases.ts`).
Keep both in sync; `docs/RELEASING.md` has the steps.

## 1.2.0 — 22 October 2026
**JOI pops up right where you need it**

### New
- Quick assistant: the JOI shortcut, Ctrl + Alt + J and the tray icon open a small popup in
  the bottom-right corner instead of the full window.
- JOI's mascot: an animated character that listens, thinks, talks and celebrates.
- Talk to JOI: tap the mic and ask; spoken questions get spoken answers.
- Approve or deny actions right inside the popup.
- "Open full app" from the popup continues the same conversation in the big window.

### Improved
- When you're signed in, launching JOI goes straight to the popup.
- Tray icon: click for the popup, double-click (or the menu) for the full app.

## 1.1.0 — 21 October 2026
**Your phone, a one-step setup, and a lot more trust**

### New
- Reach JOI from your phone through your own Telegram bot (Settings → Connectors → Phone).
  Pair once with a code; only that chat is listened to.
- One-step setup: on first launch JOI checks the PC and downloads its AI engine (SHA-256
  verified, resumable) and model, with progress and time left.
- Everything runs on the PC: bundled private database, Redis no longer required.
- Approve or deny sensitive actions right in the chat; after approval JOI finishes the task.
- Routines really run in the background and notify with the result.
- Automatic updates from the `joi-release` S3 bucket (install on quit).
- Web search works without a Google key (DuckDuckGo fallback).
- New Clay & Cream look, new logo, redesigned Activity panel, branded splash screen.
- Ctrl + Alt + J opens JOI from anywhere.

### Improved
- New on-device model (qwen2.5:3b, fits a 4 GB GPU): first word in about 3 s.
- Reading email or calendar no longer needs approval; sending and changing still does.
- Emails are converted to clean text (no HTML/CSS), long ones trimmed.
- Asking the same question again always gets a fresh check.

### Fixed
- Invented emails or details; answers about personal data must come from a tool result.
- "Draft an email" could send it; drafts are now shown and sends are blocked.
- Sends to addresses the user never gave are blocked.
- Google sign-in stuck in the browser; "Token used too early".
- Raw tool-call text and empty replies in the chat; tools that don't exist.
- Gmail reported as "not connected" when connected (stale chat history, worker-thread credentials).
- Packaged builds silently missing the app files.

### Safety & security
- Requests from the phone always wait for approval on the PC.
- Installer never contains `.env`, `credentials.json` or tokens (build fails if it does).
- Tokens kept out of logs.

## 1.0.0 — 3 May 2026
**First release**

- Desktop chat, typed or spoken.
- Tools for files, email, calendar, apps and system information.
- Per-tool approval rules, assistant memory, local document knowledge.
- Sign in with email or Google.
