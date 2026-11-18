import { Check, Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SettingsCard } from "./SettingsCard";

// Prévia em miniatura com cores fixas: mostra o tema mesmo quando o app está no outro.
const PALETTE = {
  light: {
    bg: "#f7f8fa",
    surface: "#ffffff",
    line: "#e4e7ec",
    text: "#001f35",
    muted: "#98a2b3",
    brand: "#001f35",
    brandFg: "#ffffff",
  },
  dark: {
    bg: "#0b1220",
    surface: "#131c30",
    line: "#222d43",
    text: "#f4f6fa",
    muted: "#6b778c",
    brand: "#f4f6fa",
    brandFg: "#001f35",
  },
};

function Preview({ mode }: { mode: "light" | "dark" }) {
  const c = PALETTE[mode];
  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: c.bg }} aria-hidden>
      <div className="w-1/4 space-y-1.5 p-2" style={{ borderRight: `1px solid ${c.line}` }}>
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: c.muted }} />
        <div className="h-1.5 w-full rounded-full" style={{ background: c.brand }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.muted }} />
      </div>
      <div className="flex-1 space-y-1.5 p-2">
        <div
          className="rounded-md p-1.5"
          style={{ background: c.surface, border: `1px solid ${c.line}` }}
        >
          <div className="h-1.5 w-1/2 rounded-full" style={{ background: c.text }} />
          <div className="mt-1 h-1 w-3/4 rounded-full" style={{ background: c.muted }} />
        </div>
        <div className="ml-auto w-2/3 rounded-md p-1.5" style={{ background: c.brand }}>
          <div className="h-1 w-3/4 rounded-full opacity-80" style={{ background: c.brandFg }} />
        </div>
      </div>
    </div>
  );
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Igual ao sistema", icon: Monitor },
];

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsCard title="Aparência" description="Vale só para este navegador.">
      <div role="radiogroup" aria-label="Tema" className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "group overflow-hidden rounded-xl border bg-surface text-left transition-[border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
                selected ? "border-primary" : "border-border hover:border-border-strong",
              )}
            >
              <div className="aspect-[16/10] border-b border-border">
                {value === "system" ? (
                  <div className="flex h-full">
                    <div className="w-1/2 overflow-hidden">
                      <Preview mode="light" />
                    </div>
                    <div className="w-1/2 overflow-hidden">
                      <Preview mode="dark" />
                    </div>
                  </div>
                ) : (
                  <Preview mode={value} />
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {label}
                {selected && <Check className="ml-auto size-4 text-primary" aria-hidden />}
              </div>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}
