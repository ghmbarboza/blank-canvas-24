import type { ReactNode } from "react";

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function PanelSection({ title, action, children }: Props) {
  return (
    <section className="border-t border-border px-5 py-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium tracking-widest text-subtle uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
