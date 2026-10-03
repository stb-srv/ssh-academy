"use client";
import { useRef, useState, type ComponentProps } from "react";

/** Codeblock mit Kopieren-Knopf (ersetzt <pre> in MDX) */
export function CodeBlock(props: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.innerText ?? "";
    await navigator.clipboard.writeText(text.replace(/\n$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative my-4">
      <pre
        ref={ref}
        {...props}
        className="overflow-x-auto rounded-lg bg-terminal p-4 pr-20 font-mono text-sm leading-relaxed text-slate-200"
      />
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 opacity-80 hover:opacity-100"
      >
        {copied ? "Kopiert" : "Kopieren"}
      </button>
    </div>
  );
}
