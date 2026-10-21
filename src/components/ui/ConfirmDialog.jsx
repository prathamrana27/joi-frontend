import { Button } from "./Glass.jsx";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message = "",
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4 backdrop-blur-sm animate-fade"
      onClick={onCancel}
    >
      <div
        className="w-[min(400px,100%)] animate-rise rounded-3xl border border-ink/10 bg-cream p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
        {message && <p className="mt-2 text-sm text-ink-muted">{message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            className="rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-clay transition hover:-translate-y-0.5"
            style={{
              backgroundImage: danger
                ? "linear-gradient(135deg,#e0674a 0%,#c4452a 120%)"
                : "linear-gradient(135deg,#e68a67,#d97757 55%,#c45f3d 120%)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
