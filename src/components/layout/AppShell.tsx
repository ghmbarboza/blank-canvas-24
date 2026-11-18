import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Logo } from "./Logo";
import { CommandMenu } from "./CommandMenu";
import { enabledModules } from "./modules";
import { useActiveIncidents, useMyQueueCount, useUnreadCount } from "./nav-counts";
import { NotificationsBell } from "@/features/notifications/NotificationsBell";
import { Softphone } from "@/features/telephony/softphone/Softphone";
import { SoftphoneProvider } from "@/features/telephony/softphone/SoftphoneProvider";
import { SetupProvider } from "@/features/setup/SetupWizard";
import { useIntegrations } from "@/features/integrations/api";
import { SetupPendingPill, SetupRailButton } from "@/features/setup/SetupEntry";
import { PresenceButton } from "@/features/queue/PresenceButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  CONFIG_GROUP,
  HELP_ITEM,
  NAV,
  SETTINGS_ITEM,
  meetsNeed,
  navGroupsFor,
  navItemsFor,
  type NavBadge,
  type NavItem,
} from "./nav";

export { NAV };

const RAIL_KEY = "nexus-rail-expanded";
const CONFIG_KEY = "nexus-rail-config-open";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) !== "0";
  } catch {
    return true;
  }
}

// Menu lateral expandido (ícone + nome, padrão) ou recolhido (só ícones); a escolha fica neste navegador.
function useRailExpanded() {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => setExpanded(readExpanded()), []);
  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      } catch {
        // sem armazenamento local: vale só nesta sessão
      }
      return next;
    });
  }, []);
  return { expanded, toggle };
}

function readConfigOpen(pathname: string): boolean {
  if (CONFIG_GROUP.items.some((i) => pathname.startsWith(i.to))) return true;
  try {
    return localStorage.getItem(CONFIG_KEY) === "1";
  } catch {
    return false;
  }
}

// Dica lateral só com o menu recolhido (expandido, o nome já está visível).
function RailTip({
  expanded,
  label,
  hint,
  children,
}: {
  expanded: boolean;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  if (expanded) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        {hint && <kbd className="font-mono text-[10px] opacity-60">{hint}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

const ITEM_BASE =
  "group relative flex h-10 shrink-0 items-center rounded-xl text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function itemShape(expanded: boolean) {
  return expanded ? "w-full gap-3 px-3" : "w-10 justify-center";
}

function RailLink({
  item,
  badge,
  expanded,
  alert = false,
  hideShortcut = false,
}: {
  item: NavItem;
  badge?: number | undefined;
  expanded: boolean;
  /** Contador em vermelho (algo quebrado agora), não em azul (algo esperando). */
  alert?: boolean;
  /** Sem a dica do atalho (subitem recuado: o nome inteiro vale mais que o atalho). */
  hideShortcut?: boolean;
}) {
  const Icon = item.icon;
  const count = badge && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;
  const tone = alert ? "bg-danger text-white" : "bg-primary text-primary-foreground";
  return (
    <RailTip expanded={expanded} label={item.label} hint={item.shortcut}>
      <Link
        to={item.to}
        aria-label={item.label}
        className={cn(ITEM_BASE, itemShape(expanded))}
        activeOptions={{ exact: item.exact === true }}
        activeProps={{
          className: "bg-surface text-foreground font-medium hover:bg-surface",
        }}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
        {expanded && (
          <span className="line-clamp-2 flex-1 text-[13px] leading-tight">{item.label}</span>
        )}
        {count &&
          (expanded ? (
            <span
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                tone,
              )}
            >
              {count}
            </span>
          ) : (
            <span
              className={cn(
                "absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] leading-none font-semibold tabular-nums ring-2 ring-background",
                tone,
              )}
            >
              {count}
            </span>
          ))}
        {expanded && !count && !hideShortcut && (
          <kbd className="font-mono text-[10px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">
            {item.shortcut}
          </kbd>
        )}
      </Link>
    </RailTip>
  );
}

function AccountSwitcher({ expanded }: { expanded: boolean }) {
  const { memberships, current, switchAccount } = useAccount();
  if (!current) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Conta: ${current.accountName}`}
          className={cn(
            "flex h-12 shrink-0 items-center rounded-xl transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            expanded ? "w-full gap-2.5 px-2.5" : "w-11 justify-center",
          )}
        >
          <Logo className="w-9 shrink-0" />
          {expanded && (
            <>
              <span className="min-w-0 flex-1 text-left leading-tight">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {current.accountName}
                </span>
                <span className="block text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">
                  Viver de IA
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-subtle" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-64">
        <DropdownMenuLabel className="text-[11px] tracking-widest text-subtle uppercase">
          Empresas
        </DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.accountId}
            onSelect={() => switchAccount(m.accountId)}
            className="gap-2"
          >
            <span className="grid size-6 place-items-center rounded-md bg-primary-soft text-[10px] font-bold text-primary">
              {initials(m.accountName)}
            </span>
            <span className="flex-1 truncate">{m.accountName}</span>
            {m.accountId === current.accountId && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/ajustes">
            <Settings className="size-4" /> Ajustes da empresa
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ expanded }: { expanded: boolean }) {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const email = user?.email ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sua conta"
          className={cn(
            "flex h-11 items-center rounded-xl transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            expanded ? "w-full gap-2.5 px-2" : "w-11 justify-center",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[12px] font-semibold text-foreground ring-1 ring-border">
            {initials(email.split("@")[0])}
          </span>
          {expanded && (
            <span className="min-w-0 flex-1 truncate text-left text-[12px] text-muted-foreground">
              {email}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-60">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(
          [
            ["light", "Claro", Sun],
            ["dark", "Escuro", Moon],
            ["system", "Do sistema", Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon className="size-4" /> {label}
            {theme === value && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            navigate({ to: "/entrar", replace: true });
          }}
        >
          <LogOut className="size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { current, isManager } = useAccount();
  const { user } = useAuth();
  const modules = useMemo(() => enabledModules(current?.settings), [current?.settings]);
  const integrations = useIntegrations(current!.accountId);
  // integração com erro também conta: a tela existe e mostra o erro para corrigir
  const connected = useMemo(
    () =>
      integrations.data
        ? new Set(integrations.data.filter((p) => p.status !== "off").map((p) => p.id as string))
        : null,
    [integrations.data],
  );
  const groups = useMemo(
    () => navGroupsFor(isManager, modules, connected),
    [isManager, modules, connected],
  );
  const reachable = useMemo(
    () => navItemsFor(isManager, modules, connected),
    [isManager, modules, connected],
  );
  const unread = useUnreadCount(current!.accountId);
  const myQueue = useMyQueueCount(current!.accountId, user?.id);
  const incidents = useActiveIncidents(current!.accountId, isManager && modules.has("incidentes"));
  const badges: Record<NavBadge, number> = { unread, myQueue, incidents };
  const [commandOpen, setCommandOpen] = useState(false);
  const { expanded: railExpanded, toggle: toggleRail } = useRailExpanded();
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  // No celular o menu vira gaveta (sempre com nomes) e fecha a cada navegação.
  const expanded = isMobile ? true : railExpanded;
  const toggle = useCallback(
    () => (isMobile ? setDrawer(false) : toggleRail()),
    [isMobile, toggleRail],
  );
  useEffect(() => setDrawer(false), [pathname]);
  const [configOpen, setConfigOpen] = useState(false);
  useEffect(() => setConfigOpen(readConfigOpen(pathname)), [pathname]);
  const toggleConfig = useCallback(() => {
    setConfigOpen((prev) => {
      try {
        localStorage.setItem(CONFIG_KEY, prev ? "0" : "1");
      } catch {
        // sem armazenamento local: vale só nesta sessão
      }
      return !prev;
    });
  }, []);
  const navigate = useNavigate();

  // ⌘K abre a paleta; ⌘B recolhe/expande o menu; "G" + letra navega (estilo Linear).
  useEffect(() => {
    let lastG = 0;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && !typing) {
        e.preventDefault();
        toggle();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 900) {
        const item = reachable.find((n) => n.shortcut.endsWith(e.key.toUpperCase()));
        if (item) {
          e.preventDefault();
          navigate({ to: item.to });
        }
        lastG = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggle, reachable]);

  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <SoftphoneProvider accountId={current!.accountId}>
      <SetupProvider>
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
          <nav
            aria-label="Navegação principal"
            className={cn(
              "flex shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto border-r border-border bg-background py-3 transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
              expanded ? "w-[236px] items-stretch px-3" : "w-[68px] items-center px-0",
              isMobile && "fixed inset-y-0 left-0 z-50 w-[272px] shadow-2xl",
              isMobile && (drawer ? "translate-x-0" : "-translate-x-full"),
            )}
          >
            <AccountSwitcher expanded={expanded} />
            {/* Presença do atendente: sempre à vista no topo (some para quem não está na fila). */}
            {!isMobile && (
              <div className="mt-2 shrink-0">
                <PresenceButton accountId={current!.accountId} compact={!expanded} />
              </div>
            )}
            <div className={cn("my-2 h-px shrink-0 bg-border", expanded ? "mx-1" : "w-8")} />
            {groups.map((group, gi) => (
              <div
                key={group.label}
                className={cn("flex flex-col gap-1", !expanded && "items-center")}
              >
                {expanded ? (
                  <p className={cn("ds-group-label pt-2", gi > 0 && "mt-5")}>{group.label}</p>
                ) : (
                  gi > 0 && <div className="my-1.5 h-px w-8 shrink-0 bg-border" />
                )}
                {group.items.map((item) => (
                  <RailLink
                    key={item.to}
                    item={item}
                    expanded={expanded}
                    badge={item.badge ? badges[item.badge] : undefined}
                    alert={item.badge === "incidents"}
                  />
                ))}
              </div>
            ))}
            <div className="flex-1" />
            <SetupRailButton expanded={expanded} />
            <NotificationsBell expanded={expanded} />
            <RailTip expanded={expanded} label="Buscar" hint="⌘K">
              <button
                type="button"
                aria-label="Buscar (⌘K)"
                onClick={() => setCommandOpen(true)}
                className={cn(ITEM_BASE, itemShape(expanded))}
              >
                <Search className="size-[18px] shrink-0" strokeWidth={1.75} />
                {expanded && (
                  <>
                    <span className="flex-1 text-left text-[13px]">Buscar</span>
                    <kbd className="rounded-md border border-border px-1.5 font-mono text-[10px] text-subtle">
                      ⌘K
                    </kbd>
                  </>
                )}
              </button>
            </RailTip>
            {isManager ? (
              <div className={cn("flex flex-col gap-1", !expanded && "items-center")}>
                <RailTip expanded={expanded} label="Configuração">
                  <button
                    type="button"
                    onClick={toggleConfig}
                    aria-label="Configuração"
                    aria-expanded={configOpen}
                    aria-controls="nav-config"
                    className={cn(ITEM_BASE, itemShape(expanded))}
                  >
                    <SlidersHorizontal className="size-[18px] shrink-0" strokeWidth={1.75} />
                    {expanded && (
                      <>
                        <span className="flex-1 text-left text-[13px]">Configuração</span>
                        <ChevronDown
                          className={cn(
                            "size-3.5 text-subtle transition-transform",
                            configOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </>
                    )}
                  </button>
                </RailTip>
                {configOpen && (
                  <div
                    id="nav-config"
                    className={cn(
                      "flex flex-col gap-1",
                      expanded ? "ml-3 border-l border-border pl-2" : "items-center",
                    )}
                  >
                    {CONFIG_GROUP.items.map((item) => (
                      <RailLink key={item.to} item={item} expanded={expanded} hideShortcut />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <RailLink item={SETTINGS_ITEM} expanded={expanded} />
            )}
            <RailLink item={HELP_ITEM} expanded={expanded} />
            <RailTip expanded={expanded} label="Expandir menu" hint="⌘B">
              <button
                type="button"
                aria-label={expanded ? "Recolher menu" : "Expandir menu"}
                aria-expanded={expanded}
                onClick={toggle}
                className={cn(ITEM_BASE, itemShape(expanded))}
              >
                <ToggleIcon className="size-[18px] shrink-0" strokeWidth={1.75} />
                {expanded && (
                  <>
                    <span className="flex-1 text-left text-[13px]">Recolher menu</span>
                    <kbd className="font-mono text-[10px] text-subtle">⌘B</kbd>
                  </>
                )}
              </button>
            </RailTip>
            <div
              className={cn("mt-1 shrink-0 border-t border-border pt-2", expanded ? "" : "w-11")}
            >
              <UserMenu expanded={expanded} />
            </div>
          </nav>
          {isMobile && drawer && (
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-[#0A1F3B]/40 backdrop-blur-[2px]"
            />
          )}
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {isMobile && (
              <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  aria-expanded={drawer}
                  onClick={() => setDrawer(true)}
                  className="grid size-10 place-items-center rounded-xl hover:bg-surface-2"
                >
                  <Menu className="size-5" />
                </button>
                <Logo className="w-8" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                  {current!.accountName}
                </span>
                <PresenceButton accountId={current!.accountId} compact />
                <button
                  type="button"
                  aria-label="Buscar"
                  onClick={() => setCommandOpen(true)}
                  className="grid size-10 place-items-center rounded-xl hover:bg-surface-2"
                >
                  <Search className="size-5" />
                </button>
              </div>
            )}
            {children}
          </main>
          <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
          <Softphone available={meetsNeed("zadarma", connected, false)} />
          <SetupPendingPill />
        </div>
      </SetupProvider>
    </SoftphoneProvider>
  );
}
