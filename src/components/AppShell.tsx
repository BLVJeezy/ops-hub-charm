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
  UserCog,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SolynLogo } from "./SolynLogo";
import { useAuth } from "@/hooks/use-auth";
import { togglePrivacy, usePrivacy } from "@/lib/privacy";
import { Assistant, toggleAssistant } from "@/components/Assistant";
import { NotificationBell, useNotes } from "@/components/Notifications";
import { VideoFeedbackBadge } from "@/components/VideoFeedbackBadge";
import { DeskRail, PlanRail, useRails } from "@/components/DeskRails";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      { to: "/teamleden", label: "Team", icon: UserCog },
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

/** Pages that get their own spot in the desktop top bar; everything else sits under "Meer", grouped. */
const TOP_PAGES = ["/brain", "/agenda", "/clients", "/pipeline", "/aanvragen", "/mails", "/invoices", "/finance", "/boekhouding"];

function TopNav() {
  const current = useRouterState({ select: (s) => s.location.pathname });
  const top = TOP_PAGES.map((to) => NAV_ITEMS.find((it) => it.to === to)!).filter(Boolean);
  const rest = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !TOP_PAGES.includes(it.to)) })).filter((g) => g.items.length);
  const moreActive = rest.some((g) => g.items.some((it) => matches(current, it)));
  const pill = (active: boolean) =>
    `h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap transition-colors ${
      active ? "bg-muted text-foreground font-medium shadow-[inset_0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
    }`;
  return (
    <nav aria-label="Pagina's" className="flex-1 min-w-0 flex items-center justify-center gap-0.5">
      {top.map((it) => {
        const Icon = it.icon;
        const active = matches(current, it);
        return (
          <Link key={it.to} to={it.to} title={it.label} aria-current={active ? "page" : undefined} className={pill(active)}>
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden min-[1400px]:inline">{it.label}</span>
            {it.to === "/clients" && <VideoFeedbackBadge />}
          </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger className={pill(moreActive)}>
          <MoreHorizontal className="w-4 h-4" />
          <span className="hidden min-[1400px]:inline">{moreActive ? itemOf(current)?.label ?? "Meer" : "Meer"}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-[420px] p-2 grid grid-cols-2 gap-x-2">
          {rest.map((g) => (
            <div key={g.key} className="py-1">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-medium py-1">{g.label}</DropdownMenuLabel>
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <DropdownMenuItem key={it.to} asChild>
                    <Link to={it.to} className={matches(current, it) ? "text-primary" : ""}>
                      <Icon className="w-4 h-4 mr-2" /> {it.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
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
    <>
      {/* phone: every section of the group in one row of icon buttons, nothing hidden off-screen */}
      <nav
        aria-label={g.label}
        className="sm:hidden grid gap-1 px-2 py-2 border-b"
        style={{
          borderColor: "hsl(var(--border))",
          gridTemplateColumns: `repeat(${g.items.length}, minmax(0, 1fr))`,
        }}
      >
        {g.items.map((it) => {
          const active = matches(current, it),
            Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? "page" : undefined}
              className={`press relative flex flex-col items-center justify-center gap-1 h-16 rounded-2xl transition-colors ${active ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="w-[22px] h-[22px]" />
              <span
                className={`text-[11px] leading-none max-w-full truncate px-0.5 ${active ? "font-semibold" : ""}`}
              >
                {it.label}
              </span>
              {it.to === "/clients" && (
                <span className="absolute top-1 right-1 scale-75 origin-top-right">
                  <VideoFeedbackBadge />
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div
        ref={bar}
        className="hidden sm:block lg:hidden border-b overflow-x-auto [scrollbar-width:none]"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div className="flex gap-1 sm:gap-2 lg:gap-1 px-2 sm:px-4 lg:px-6 min-w-max">
          {g.items.map((it) => {
            const active = matches(current, it),
              Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 lg:gap-1.5 px-3.5 sm:px-4 lg:px-3 h-14 sm:h-16 lg:h-11 text-base sm:text-[17px] lg:text-sm font-medium lg:font-normal whitespace-nowrap transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="hidden sm:block w-5 h-5 lg:w-4 lg:h-4" />
                {it.label}
                {it.to === "/clients" && <VideoFeedbackBadge />}
                {active && (
                  <span className="absolute left-2 right-2 bottom-0 h-[3px] lg:h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  useRememberTab();
  const [rails, toggleRail] = useRails();
  // custom gold cursor while you are in the Operations Center (not on the public client pages)
  useEffect(() => {
    document.documentElement.classList.add("hub-cursor");
    return () => document.documentElement.classList.remove("hub-cursor");
  }, []);

  const initial = (user?.email || "?").charAt(0).toUpperCase();

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (search.trim()) navigate({ to: "/search", search: { q: search.trim() } });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop top bar: every main page side by side, the rest under "Meer" */}
      <header
        className="hidden lg:flex fixed top-0 left-0 right-0 h-14 items-center gap-3 px-4 border-b bg-background/95 backdrop-blur z-20"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <Link to="/brain" className="flex items-center gap-2 shrink-0 mr-1" aria-label="Solyn Global, naar Brain">
          <SolynLogo size={28} />
          <span className="hidden 2xl:block text-sm font-semibold">Solyn Global</span>
        </Link>
        <TopNav />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <form onSubmit={onSearch} className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek klant…"
              aria-label="Zoek klant"
              className="w-36 min-[1400px]:w-44 pl-8 pr-2 h-9 rounded-full bg-card border border-input text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </form>
          <NotificationBell className="w-9 h-9 border border-border hover:bg-muted" />
          {role === "admin" && (
            <button
              type="button"
              onClick={toggleAssistant}
              title="Assistent"
              className="press h-9 px-3 rounded-full border border-[#C9A14A]/50 bg-[#C9A14A]/10 text-[#C9A14A] text-sm inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> <span className="hidden min-[1400px]:inline">Assistent</span>
            </button>
          )}
          <PrivacyButton className="lg:!px-0 lg:w-9 [&>span]:!hidden" />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}
              aria-label="Account"
            >
              {initial}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-xs font-medium truncate">{user?.email}</div>
                <div className="text-[10px] text-muted-foreground uppercase">{role || "no role"}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  await signOut();
                  navigate({ to: "/auth" });
                }}
              >
                <LogOut className="w-4 h-4 mr-2" /> Uitloggen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <DeskRail open={rails.left} onToggle={() => toggleRail("left")} />
      <PlanRail open={rails.right} onToggle={() => toggleRail("right")} />

      {/* Content */}
      <main
        className={`pt-[env(safe-area-inset-top)] lg:pt-14 pb-28 lg:pb-0 min-h-screen ${rails.left ? "min-[1400px]:ml-60" : "min-[1400px]:ml-11"} ${rails.right ? "min-[1400px]:mr-64" : "min-[1400px]:mr-11"}`}
      >
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
  const hidden = usePrivacy();
  const { unseen } = useNotes();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const here = groupOf(current);
  useEffect(() => setOpen(false), [current]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate({ to: "/search", search: { q: q.trim() } });
  };
  const glass = "backdrop-blur-xl border shadow-2xl shadow-black/40";
  const glassStyle = {
    backgroundColor: "hsl(var(--sidebar-background) / 0.88)",
    borderColor: "hsl(var(--sidebar-border))",
  };
  const extra =
    "press flex flex-col items-center justify-center gap-1 rounded-2xl h-16 text-[11px] bg-muted/40";
  const HereIcon = here?.icon ?? LayoutDashboard;
  return (
    <div className="lg:hidden">
      <div className="edge-fade" aria-hidden />
      {open && (
        <div className="fade-in fixed inset-0 z-30 bg-black/55" onClick={() => setOpen(false)} />
      )}

      {/* The sheet: four groups, then search and the extras */}
      {open && (
        <div
          className={`fixed z-40 left-1/2 -translate-x-1/2 w-[min(92vw,380px)] rounded-3xl p-3 pop-in ${glass}`}
          style={{ ...glassStyle, bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
        >
          <div className="grid grid-cols-2 gap-2">
            {NAV_GROUPS.map((g) => {
              const active = g === here,
                Icon = g.icon;
              return (
                <Link
                  key={g.key}
                  to={groupTarget(g)}
                  className="press relative rounded-2xl p-3.5 text-left"
                  style={{
                    backgroundColor: active
                      ? "hsl(var(--primary) / 0.15)"
                      : "hsl(var(--muted) / 0.4)",
                    color: active ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                  }}
                >
                  <Icon className="w-6 h-6" />
                  <div className="mt-2 text-[15px] font-semibold">{g.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {g.items.map((it) => it.label).join(", ")}
                  </div>
                  {g.items.some((it) => it.to === "/clients") && (
                    <span className="absolute top-2.5 right-2.5">
                      <VideoFeedbackBadge />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <form
            onSubmit={submit}
            className="mt-2 flex items-center gap-2 h-12 pl-4 pr-1.5 rounded-full bg-muted/40"
          >
            <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek klanten, steden, nummers…"
              className="flex-1 min-w-0 bg-transparent text-base outline-none"
            />
            {q.trim() && (
              <button
                type="submit"
                className="h-9 px-4 rounded-full text-sm font-medium"
                style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}
              >
                Zoek
              </button>
            )}
          </form>

          <div className={`mt-2 grid gap-2 ${assistant ? "grid-cols-4" : "grid-cols-3"}`}>
            <div className={extra}>
              <NotificationBell up className="w-9 h-9" />
              <span className="-mt-1.5">Meldingen</span>
            </div>
            {assistant && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toggleAssistant();
                }}
                className={`${extra} text-[#C9A14A]`}
              >
                <Sparkles className="w-5 h-5" /> Assistent
              </button>
            )}
            <button
              type="button"
              onClick={togglePrivacy}
              aria-pressed={hidden}
              className={`${extra} ${hidden ? "text-[#C9A14A]" : ""}`}
            >
              {hidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              {hidden ? "Cijfers aan" : "Cijfers uit"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
              className={`${extra} text-muted-foreground`}
            >
              <LogOut className="w-5 h-5" /> Uitloggen
            </button>
          </div>
        </div>
      )}

      {/* One button, bottom centre */}
      <button
        type="button"
        aria-label={open ? "Menu sluiten" : "Menu"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`press fixed z-40 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full flex items-center justify-center ${glass}`}
        style={{
          ...glassStyle,
          bottom: "calc(1rem + env(safe-area-inset-bottom))",
          color: open ? "hsl(var(--foreground))" : "hsl(var(--primary))",
        }}
      >
        {open ? <X className="w-6 h-6" /> : <HereIcon className="w-6 h-6" />}
        {!open && unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-[#C9A14A] text-black text-[11px] font-bold grid place-items-center">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
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
