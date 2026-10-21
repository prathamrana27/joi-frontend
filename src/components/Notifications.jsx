import { useEffect, useRef, useState } from "react";
import { api, BACKEND_BASE_URL } from "../lib/api.js";
import { IconBell, IconClose } from "./ui/Icons.jsx";

const WS_BASE = BACKEND_BASE_URL.replace(/^http/, "ws");

export function useNotifications(token) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    let retry = null;

    // Seed with existing notifications.
    api.listNotifications(token).then((r) => {
      if (!alive) return;
      const list = r.notifications || [];
      setItems(list);
      setUnread(list.filter((n) => !n.read).length);
    }).catch(() => {});

    const connect = () => {
      if (!alive) return;
      let ws;
      try {
        ws = new WebSocket(`${WS_BASE}/ws/notifications?token=${encodeURIComponent(token)}`);
      } catch {
        retry = setTimeout(connect, 4000);
        return;
      }
      wsRef.current = ws;
      ws.onmessage = (e) => {
        let d;
        try { d = JSON.parse(e.data); } catch { return; }
        if (d.type === "hello") {
          setUnread((u) => (typeof d.unread === "number" ? d.unread : u));
        } else if (d.type === "notification") {
          setItems((p) => [{ ...d, read: false }, ...p].slice(0, 60));
          setUnread((u) => u + 1);
          setToasts((t) => [...t, d]);
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== d.id)), 6500);
          // Best-effort desktop notification.
          if (window.Notification?.permission === "granted") {
            try { new Notification(d.title || "JOI", { body: d.body || "" }); } catch { /* ignore */ }
          }
        }
      };
      ws.onclose = () => { if (alive) retry = setTimeout(connect, 3000); };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };
    connect();

    // Ask for desktop-notification permission once.
    if (window.Notification && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      try { wsRef.current?.close(); } catch { /* ignore */ }
    };
  }, [token]);

  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const markAllRead = async () => {
    const unreadItems = items.filter((n) => !n.read);
    setItems((p) => p.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await Promise.all(unreadItems.map((n) => n.id && api.markNotificationRead(token, n.id).catch(() => {})));
  };

  return { items, unread, toasts, dismissToast, markAllRead };
}

export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto animate-rise rounded-2xl border border-ink/10 bg-cream/95 p-3.5 shadow-lift backdrop-blur-md"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-clay-50 text-clay-700">
              <IconBell width={15} height={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{t.title || "Notification"}</div>
              {t.body && <div className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{t.body}</div>}
            </div>
            <button onClick={() => onDismiss(t.id)} className="text-ink-faint hover:text-ink">
              <IconClose width={14} height={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationBell({ unread, items, markAllRead }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open && unread) markAllRead(); }}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-ink/12 bg-white/70 text-ink-soft shadow-soft transition hover:text-clay-600"
        title="Notifications"
      >
        <IconBell width={18} height={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[0.6rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-40 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-ink/10 bg-cream shadow-lift">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <div className="font-display text-sm font-semibold text-ink">Notifications</div>
              <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink"><IconClose width={15} height={15} /></button>
            </div>
            <div className="divide-y divide-ink/5">
              {items.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-ink-faint">You're all caught up.</div>
              ) : (
                items.slice(0, 40).map((n, i) => (
                  <div key={n.id || i} className="px-4 py-3">
                    <div className="text-sm font-medium text-ink">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-xs text-ink-muted">{n.body}</div>}
                    <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-ink-faint">{n.category || "system"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
