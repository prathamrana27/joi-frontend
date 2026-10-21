// Warm "Clay & Cream" design-system primitives.
// (Export names kept stable so existing page imports keep working.)

export function BackgroundOrbs() {
  // Soft warm blooms — subtle, editorial, not neon.
  return (
    <>
      <div className="pointer-events-none fixed -right-32 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-clay/20 blur-[130px]" />
      <div className="pointer-events-none fixed -bottom-40 -left-32 -z-10 h-[460px] w-[460px] rounded-full bg-sage/15 blur-[130px]" />
    </>
  );
}

export function GlassCard({ as: Tag = "div", className = "", children, ...rest }) {
  return (
    <Tag
      className={`rounded-3xl border border-ink/10 bg-white/75 shadow-soft backdrop-blur-sm ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Button({ variant = "primary", className = "", children, ...rest }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98]";
  const variants = {
    primary:
      "bg-clay-gradient text-white shadow-clay hover:-translate-y-0.5 hover:brightness-[1.04] px-5 py-2.5 text-sm",
    ghost:
      "text-ink-soft hover:text-ink hover:bg-ink/5 px-4 py-2 text-sm",
    outline:
      "border border-ink/20 text-ink-soft hover:border-clay/60 hover:text-clay-600 bg-white/70 shadow-soft px-4 py-2 text-sm",
  };
  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

export function Input({ className = "", ...rest }) {
  return (
    <input
      className={`w-full rounded-2xl border border-ink/12 bg-cream-100/70 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-clay/60 focus:bg-white focus:ring-4 focus:ring-clay/12 ${className}`}
      {...rest}
    />
  );
}

export function TextArea({ className = "", ...rest }) {
  return (
    <textarea
      className={`w-full resize-none rounded-2xl border border-ink/12 bg-transparent px-2 py-2 text-[0.95rem] text-ink outline-none transition placeholder:text-ink-faint ${className}`}
      {...rest}
    />
  );
}
