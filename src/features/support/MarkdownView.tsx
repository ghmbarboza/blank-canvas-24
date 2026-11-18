import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { parseMarkdown, type Inline } from "./markdown";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, i) => {
        switch (it.t) {
          case "bold":
            return <strong key={i}>{it.v}</strong>;
          case "italic":
            return <em key={i}>{it.v}</em>;
          case "code":
            return (
              <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
                {it.v}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={it.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                {it.v}
              </a>
            );
          default:
            return <Fragment key={i}>{it.v}</Fragment>;
        }
      })}
    </>
  );
}

// Renderiza o markdown da base de conhecimento como elementos React (sem HTML cru).
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={cn("space-y-3 text-[14px] leading-relaxed text-foreground", className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": {
            const cls =
              b.level === 1
                ? "font-display text-[22px] font-semibold"
                : b.level === 2
                  ? "font-display text-[18px] font-semibold pt-2"
                  : "text-[15px] font-semibold pt-1";
            return b.level === 1 ? (
              <h2 key={i} className={cls}>
                <Inlines items={b.inline} />
              </h2>
            ) : b.level === 2 ? (
              <h3 key={i} className={cls}>
                <Inlines items={b.inline} />
              </h3>
            ) : (
              <h4 key={i} className={cls}>
                <Inlines items={b.inline} />
              </h4>
            );
          }
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines items={it} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines items={it} />
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-border-strong pl-3 text-muted-foreground"
              >
                <Inlines items={b.inline} />
              </blockquote>
            );
          case "pre":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12px]"
              >
                {b.v}
              </pre>
            );
          default:
            return (
              <p key={i}>
                <Inlines items={b.inline} />
              </p>
            );
        }
      })}
    </div>
  );
}
