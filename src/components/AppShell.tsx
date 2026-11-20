import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  GitBranch,
  Users,
  Wallet,
  FileText,
  Search as SearchIcon,
  LogOut,
  Activity,
  Film,
  Workflow,
  TrendingUp,
  BookOpen,
  MoreHorizontal,
  X,
  BrainCircuit,
  Eye,
  EyeOff,
  Sparkles,
  CalendarDays,
  Inbox,
  PencilRuler,
  History,
  MailCheck,
  Sun,
  Clapperboard,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SolynLogo } from "./SolynLogo";
import { useAuth } from "@/hooks/use-auth";
import { togglePrivacy, usePrivacy } from "@/lib/privacy";
import { Assistant, toggleAssistant } from "@/components/Assistant";
import { NotificationBell } from "@/components/Notifications";
import { VideoFeedbackBadge } from "@/components/VideoFeedbackBadge";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { key: string; label: string; icon: typeof LayoutDashboard; items: NavItem[] };

/** Four groups instead of one long list. Every page keeps its own URL; inside a group you switch with tabs. */
const NAV_GROUPS: NavGroup[] = [
  {
    key: "vandaag",
    label: "Vandaag",
    icon: Sun,
    items: [
      { to: "/brain", label: "Brain", icon: BrainCircuit },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/briefing", label: "Briefing", icon: Film },
    ],
  },
  {
    key: "klanten",
    label: "Klanten",
    icon: Users,
    items: [
      { to: "/clients", label: "Clients", icon: Users },
      { to: "/pipeline", label: "Pipeline", icon: GitBranch },
      { to: "/aanvragen", label: "Aanvragen", icon: Inbox },
      { to: "/mails", label: "Mails", icon: MailCheck },
      { to: "/videos", label: "Video's", icon: Clapperboard },
    ],
  },
  {
    key: "beheer",
    label: "Beheer",
    icon: PencilRuler,
    items: [
      { to: "/klantbeheer", label: "Klantbeheer", icon: PencilRuler },
      { to: "/wijzigingen", label: "Wijzigingen", icon: History },
      { to: "/status", label: "Status", icon: Activity },
      { to: "/automations", label: "Automations", icon: Workflow },
    ],
  },
  {
    key: "geld",
    label: "Geld",
    icon: Wallet,
    items: [
      { to: "/invoices", label: "Facturen", icon: FileText },
      { to: "/finance", label: "Finance", icon: TrendingUp },
      { to: "/boekhouding", label: "Boekhouding", icon: BookOpen },
      { to: "/expenses", label: "Uitgaven", icon: Wallet },
    ],
  },
];
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const matches = (current: string, it: NavItem) =>
  it.exact ? current === it.to : current === it.to || current.startsWith(it.to + "/");
const groupOf = (current: string) =>
  NAV_GROUPS.find((g) => g.items.some((it) => matches(current, it)));
const itemOf = (current: string) => NAV_ITEMS.find((it) => matches(current, it));

/** The tab you were last on in each group, so a group opens where you left it. */
const LAST_KEY = "hub-nav-last";
function readLast(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
  } catch {
    return {};
  }
}
function groupTarget(g: NavGroup) {
  const last = typeof window === "undefined" ? undefined : readLast()[g.key];
  return last && g.items.some((it) => it.to === last) ? last : g.items[0].to;
}
function useRememberTab() {
  const current = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const g = groupOf(current),
      it = itemOf(current);
    if (!g || !it) return;
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), [g.key]: it.to }));
    } catch {
      /* storage unavailable: groups just open on their first tab */
    }
  }, [current]);
}

function GroupLink({ group }: { group: NavGroup }) {
  const current = useRouterState({ select: (s) => s.location.pathname });
  const active = groupOf(current) === group;
  const Icon = group.icon;
  return (
    <Link
      to={groupTarget(group)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition"
      style={{
        backgroundColor: active ? "hsl(var(--sidebar-accent))" : "transparent",
        color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground))",
      }}
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1">{group.label}</span>
      {group.items.some((it) => it.to === "/videos") && <VideoFeedbackBadge />}
    </Link>
  );
}

/** Tabs of the group you are in, above the page. */
function GroupTabs() {
  const current = useRouterState({ select: (s) => s.location.pathname });
  const g = groupOf(current);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // keep the active tab in view on narrow screens
    bar.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  if (!g) return null;
  return (
    <div
      ref={bar}
      className="border-b overflow-x-auto [scrollbar-width:none]"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <div className="flex gap-1 px-3 lg:px-6 min-w-max">
        {g.items.map((it) => {
          const active = matches(current, it),
            Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 h-11 text-sm whitespace-nowrap transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="hidden sm:block w-4 h-4" />
              {it.label}
              {it.to === "/videos" && <VideoFeedbackBadge />}
              {active && (
                <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  useRememberTab();

  const initial = (user?.email || "?").charAt(0).toUpperCase();

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (search.trim()) navigate({ to: "/search", search: { q: search.trim() } });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex fixed top-0 left-0 h-screen w-56 flex-col border-r"
        style={{
          backgroundColor: "hsl(var(--sidebar-background))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        <div
          className="p-4 flex items-center gap-2 border-b"
          style={{ borderColor: "hsl(var(--sidebar-border))" }}
        >
          <SolynLogo size={32} />
          <div className="text-sm">
            <div className="font-semibold">Solyn Global</div>
            <div className="text-xs text-muted-foreground">Ops Hub</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_GROUPS.map((g) => (
            <GroupLink key={g.key} group={g} />
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.email}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{role || "no role"}</div>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Top bar (desktop) */}
      <header
        className="hidden lg:flex fixed top-0 left-56 right-0 h-16 items-center px-6 border-b bg-background z-10"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <form onSubmit={onSearch} className="w-full max-w-md relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name, city, or phone…"
            className="w-full pl-9 pr-3 h-9 rounded-md bg-card border border-input text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </form>
        <div className="ml-auto mr-2">
          <NotificationBell className="w-9 h-9 border border-border hover:bg-muted" />
        </div>
        {role === "admin" && (
          <button
            type="button"
            onClick={toggleAssistant}
            className="press mr-2 h-9 px-3 rounded-full border border-[#C9A14A]/50 bg-[#C9A14A]/10 text-[#C9A14A] text-sm inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Assistent
          </button>
        )}
        <PrivacyButton />
      </header>

      {/* Content */}
      <main className="lg:ml-56 pt-[env(safe-area-inset-top)] lg:pt-16 pb-28 lg:pb-0 min-h-screen">
        <GroupTabs />
        {children}
      </main>

      {/* Mobile: floating pill (search · current section · menu) */}
      <MobileNav assistant={role === "admin"} />
      {role === "admin" && <Assistant />}
    </div>
  );
}

function MobileNav({ assistant }: { assistant: boolean }) {
  const current = useRouterState({ select: (st) => st.location.pathname });
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const here = itemOf(current) ?? NAV_ITEMS[0];
  const Here = here.icon;
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [current]);
  useEffect(() => {
    if (search) inputRef.current?.focus();
  }, [search]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      navigate({ to: "/search", search: { q: q.trim() } });
      setSearch(false);
    }
  };
  const pill = "backdrop-blur-xl border shadow-2xl shadow-black/40";
  const pillStyle = {
    backgroundColor: "hsl(var(--sidebar-background) / 0.85)",
    borderColor: "hsl(var(--sidebar-border))",
  };
  return (
    <div className="lg:hidden">
      <div className="edge-fade" aria-hidden />
      {(menu || search) && (
        <div
          className="fade-in fixed inset-0 z-30 bg-black/50"
          onClick={() => {
            setMenu(false);
            setSearch(false);
          }}
        />
      )}

      {menu && (
        <div
          className={`fixed z-40 left-1/2 -translate-x-1/2 w-[min(92vw,360px)] rounded-3xl p-3 pop-in ${pill}`}
          style={{ ...pillStyle, bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
        >
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {NAV_GROUPS.map((g) => (
              <div key={g.key}>
                <div className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                  {g.label}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {g.items.map((it) => {
                    const active = it === here,
                      Icon = it.icon;
                    return (
                      <Link
                        key={it.to}
                        to={it.to}
                        className="press relative flex flex-col items-center gap-1 rounded-2xl py-2.5"
                        style={{
                          backgroundColor: active
                            ? "hsl(var(--primary) / 0.15)"
                            : "hsl(var(--muted) / 0.4)",
                          color: active ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                        }}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-[10.5px] leading-tight text-center px-0.5 [overflow-wrap:anywhere]">
                          {it.label}
                        </span>
                        {it.to === "/videos" && <VideoFeedbackBadge />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground min-h-11 rounded-2xl"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}

      {search && (
        <form
          onSubmit={submit}
          className={`fixed z-40 left-1/2 -translate-x-1/2 w-[min(92vw,360px)] rounded-full flex items-center gap-2 pl-4 pr-1.5 h-12 pop-in ${pill}`}
          style={{ ...pillStyle, bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
        >
          <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek klanten, steden, nummers…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="submit"
            className="h-9 px-4 rounded-full text-sm font-medium"
            style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}
          >
            Zoek
          </button>
        </form>
      )}

      <nav
        className={`fixed z-40 left-1/2 -translate-x-1/2 h-14 rounded-full flex items-center gap-1 px-1.5 ${pill}`}
        style={{ ...pillStyle, bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <button
          aria-label="Zoeken"
          onClick={() => {
            setSearch(!search);
            setMenu(false);
          }}
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: search ? "hsl(var(--primary) / 0.15)" : "transparent",
            color: search ? "hsl(var(--primary))" : "hsl(var(--foreground))",
          }}
        >
          {search ? <X className="w-5 h-5" /> : <SearchIcon className="w-5 h-5" />}
        </button>
        <button
          onClick={() => {
            setMenu(!menu);
            setSearch(false);
          }}
          className="h-11 px-4 rounded-full flex items-center gap-2 text-sm font-medium whitespace-nowrap"
          style={{ backgroundColor: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
        >
          <Here className="w-4 h-4" /> {here.label}
        </button>
        {assistant && (
          <button
            type="button"
            aria-label="Assistent"
            onClick={() => {
              setMenu(false);
              setSearch(false);
              toggleAssistant();
            }}
            className="press w-11 h-11 rounded-full flex items-center justify-center text-[#C9A14A]"
          >
            <Sparkles className="w-5 h-5" />
          </button>
        )}
        <NotificationBell up className="w-11 h-11" />
        <PrivacyButton className="w-11 h-11" />
        <button
          aria-label="Menu"
          aria-expanded={menu}
          onClick={() => {
            setMenu(!menu);
            setSearch(false);
          }}
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: menu ? "hsl(var(--primary) / 0.15)" : "transparent",
            color: menu ? "hsl(var(--primary))" : "hsl(var(--foreground))",
          }}
        >
          {menu ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
        </button>
      </nav>
    </div>
  );
}

function PrivacyButton({ className = "" }: { className?: string }) {
  const hidden = usePrivacy();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={togglePrivacy}
      aria-pressed={hidden}
      aria-label={hidden ? "Cijfers tonen" : "Cijfers verbergen"}
      title={hidden ? "Cijfers tonen" : "Cijfers verbergen"}
      className={`press hit shrink-0 rounded-full flex items-center justify-center gap-2 lg:h-9 lg:px-3 lg:border lg:border-border text-sm transition-colors ${hidden ? "text-[#C9A14A] lg:border-[#C9A14A]/50 lg:bg-[#C9A14A]/10" : "text-foreground lg:text-muted-foreground hover:text-foreground"} ${className}`}
    >
      <Icon className="w-5 h-5 lg:w-4 lg:h-4" />
      <span className="hidden lg:inline">{hidden ? "Cijfers verborgen" : "Cijfers verbergen"}</span>
    </button>
  );
}
