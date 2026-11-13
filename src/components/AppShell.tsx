import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, GitBranch, Users, Wallet,
  FileText, Search as SearchIcon, LogOut, Activity, Film, TrendingUp, BookOpen, MoreHorizontal, X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SolynLogo } from "./SolynLogo";
import { useAuth } from "@/hooks/use-auth";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/finance", label: "Finance", icon: TrendingUp },
  { to: "/boekhouding", label: "Boekhouding", icon: BookOpen },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/status", label: "Status", icon: Activity },
  { to: "/briefing", label: "Briefing", icon: Film },
] as const;

function useIsActive(path: string, exact = false) {
  const current = useRouterState({ select: (s) => s.location.pathname });
  if (exact) return current === path;
  return current === path || current.startsWith(path + "/");
}

function NavLink({ to, label, icon: Icon, exact, onClick }: {
  to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; onClick?: () => void;
}) {
  const active = useIsActive(to, exact);
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition"
      style={{
        backgroundColor: active ? "hsl(var(--sidebar-accent))" : "transparent",
        color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground))",
      }}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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
        style={{ backgroundColor: "hsl(var(--sidebar-background))", borderColor: "hsl(var(--sidebar-border))" }}
      >
        <div className="p-4 flex items-center gap-2 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <SolynLogo size={32} />
          <div className="text-sm">
            <div className="font-semibold">Solyn Global</div>
            <div className="text-xs text-muted-foreground">Ops Hub</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((it) => <NavLink key={it.to} {...it} />)}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}>
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.email}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{role || "no role"}</div>
            </div>
          </div>
          <button
            onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Top bar (desktop) */}
      <header className="hidden lg:flex fixed top-0 left-56 right-0 h-16 items-center px-6 border-b bg-background z-10" style={{ borderColor: "hsl(var(--border))" }}>
        <form onSubmit={onSearch} className="w-full max-w-md relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name, city, or phone…"
            className="w-full pl-9 pr-3 h-9 rounded-md bg-card border border-input text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </form>
      </header>

      {/* Content */}
      <main className="lg:ml-56 lg:pt-16 pb-28 lg:pb-0 min-h-screen">
        {children}
      </main>

      {/* Mobile: floating pill (search · current section · menu) */}
      <MobileNav />
    </div>
  );
}

function MobileNav() {
  const current = useRouterState({ select: (st) => st.location.pathname });
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const here = NAV_ITEMS.find((it) => current === it.to || current.startsWith(it.to + "/")) ?? NAV_ITEMS[0];
  const Here = here.icon;
  useEffect(() => { setMenu(false); setSearch(false); }, [current]);
  useEffect(() => { if (search) inputRef.current?.focus(); }, [search]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) { navigate({ to: "/search", search: { q: q.trim() } }); setSearch(false); }
  };
  const pill = "backdrop-blur-xl border shadow-2xl shadow-black/40";
  const pillStyle = { backgroundColor: "hsl(var(--sidebar-background) / 0.85)", borderColor: "hsl(var(--sidebar-border))" };
  return (
    <div className="lg:hidden">
      {(menu || search) && <div className="fixed inset-0 z-30 bg-black/40" onClick={() => { setMenu(false); setSearch(false); }} />}

      {menu && (
        <div className={`fixed z-40 left-1/2 -translate-x-1/2 bottom-[5.25rem] w-[min(92vw,360px)] rounded-3xl p-3 ${pill}`} style={pillStyle}>
          <div className="grid grid-cols-3 gap-2">
            {NAV_ITEMS.map((it) => {
              const active = it === here, Icon = it.icon;
              return (
                <Link key={it.to} to={it.to} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition"
                  style={{ backgroundColor: active ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted) / 0.4)", color: active ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px]">{it.label}</span>
                </Link>
              );
            })}
          </div>
          <button onClick={async () => { await signOut(); navigate({ to: "/auth" }); }} className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-2">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}

      {search && (
        <form onSubmit={submit} className={`fixed z-40 left-1/2 -translate-x-1/2 bottom-[5.25rem] w-[min(92vw,360px)] rounded-full flex items-center gap-2 pl-4 pr-1.5 h-12 ${pill}`} style={pillStyle}>
          <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek klanten, steden, nummers…" className="flex-1 bg-transparent text-sm outline-none" />
          <button type="submit" className="h-9 px-4 rounded-full text-sm font-medium" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}>Zoek</button>
        </form>
      )}

      <nav className={`fixed z-40 left-1/2 -translate-x-1/2 bottom-4 h-14 rounded-full flex items-center gap-1 px-1.5 ${pill}`} style={{ ...pillStyle, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button aria-label="Zoeken" onClick={() => { setSearch(!search); setMenu(false); }} className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ backgroundColor: search ? "hsl(var(--primary) / 0.15)" : "transparent", color: search ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
          {search ? <X className="w-5 h-5" /> : <SearchIcon className="w-5 h-5" />}
        </button>
        <button onClick={() => { setMenu(!menu); setSearch(false); }} className="h-11 px-4 rounded-full flex items-center gap-2 text-sm font-medium" style={{ backgroundColor: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}>
          <Here className="w-4 h-4" /> {here.label}
        </button>
        <button aria-label="Menu" onClick={() => { setMenu(!menu); setSearch(false); }} className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ backgroundColor: menu ? "hsl(var(--primary) / 0.15)" : "transparent", color: menu ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
          {menu ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
        </button>
      </nav>
    </div>
  );
}
