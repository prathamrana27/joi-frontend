import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ className, children }) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? "").replace(/\n$/, "");

  // react-markdown v9 no longer passes `inline`. Fenced blocks carry a language class
  // or contain a newline; `like this` inline code has neither.
  if (!className && !String(children ?? "").includes("\n")) {
    return (
      <code className="rounded-md bg-ink/8 px-1.5 py-0.5 font-mono text-[0.85em] text-clay-700">
        {children}
      </code>
    );
  }

  const lang = (className || "").replace("language-", "");
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-ink/12 bg-[#1c1a17]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-xs text-white/50">{lang || "code"}</span>
        <button
          onClick={copy}
          className="text-xs text-white/60 transition hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[0.85rem] leading-relaxed">
        <code className="font-mono text-[#e8e2d6]">{text}</code>
      </pre>
    </div>
  );
}

export default function Markdown({ children }) {
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          p: (p) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
          h1: (p) => <h1 className="mb-2 mt-3 font-display text-xl font-semibold" {...p} />,
          h2: (p) => <h2 className="mb-2 mt-3 font-display text-lg font-semibold" {...p} />,
          h3: (p) => <h3 className="mb-1.5 mt-2 font-semibold" {...p} />,
          ul: (p) => <ul className="my-1.5 ml-5 list-disc space-y-1" {...p} />,
          ol: (p) => <ol className="my-1.5 ml-5 list-decimal space-y-1" {...p} />,
          li: (p) => <li className="pl-0.5" {...p} />,
          a: (p) => <a className="text-clay-700 underline underline-offset-2 hover:text-clay-600" target="_blank" rel="noreferrer" {...p} />,
          strong: (p) => <strong className="font-semibold text-ink" {...p} />,
          blockquote: (p) => <blockquote className="my-2 border-l-2 border-clay/40 pl-3 text-ink-muted" {...p} />,
          table: (p) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-sm" {...p} /></div>,
          th: (p) => <th className="border border-ink/15 bg-ink/5 px-2 py-1 text-left font-semibold" {...p} />,
          td: (p) => <td className="border border-ink/12 px-2 py-1" {...p} />,
          hr: () => <hr className="my-3 border-ink/10" />,
        }}
      >
        {String(children || "")}
      </ReactMarkdown>
    </div>
  );
}
