import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, GitBranch, Users, Wallet, ListChecks,
  FileText, ClipboardList, Search as SearchIcon, LogOut,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SolynLogo } from "./SolynLogo";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/action-planner", label: "Actions", icon: ListChecks },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/expenses", label: "Expenses", icon: Wallet },
] as const;

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/expenses", label: "Costs", icon: Wallet },
  { to: "/action-planner", label: "Actions", icon: ListChecks },
  { to: "/invoices", label: "Invoices", icon: FileText },
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
  const [pendingCount, setPendingCount] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (role !== "admin") return;
    async function load() {
      const { count } = await supabase
        .from("onboarding_submissions")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "Pending");
      setPendingCount(count || 0);
    }
    load();
    const channel = supabase
      .channel("onboarding-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "onboarding_submissions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [role]);

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
          {role === "admin" && (
            <Link
              to="/onboarding-queue"
              className="flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-[hsl(var(--sidebar-accent))]"
              style={{ color: "hsl(var(--sidebar-foreground))" }}
            >
              <span className="flex items-center gap-3">
                <ClipboardList className="w-4 h-4" />
                Onboarding
              </span>
              {pendingCount > 0 && (
                <span className="text-xs rounded-full px-2 py-0.5" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}>
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
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
      <main className="lg:ml-56 lg:pt-16 pb-20 lg:pb-0 min-h-screen">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 border-t grid z-20"
        style={{
          backgroundColor: "hsl(var(--sidebar-background))",
          borderColor: "hsl(var(--sidebar-border))",
          gridTemplateColumns: role === "admin" ? "repeat(7, 1fr)" : "repeat(6, 1fr)",
        }}
      >
        {MOBILE_NAV.map((it) => (
          <MobileNavLink key={it.to} {...it} />
        ))}
        {role === "admin" && (
          <MobileNavLink to="/onboarding-queue" label="Signup" icon={ClipboardList} badge={pendingCount} />
        )}
      </nav>
    </div>
  );
}

function MobileNavLink({ to, label, icon: Icon, exact, badge }: {
  to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; badge?: number;
}) {
  const active = useIsActive(to, exact);
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-0.5 relative"
      style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px]">{label}</span>
      {badge && badge > 0 ? (
        <span className="absolute top-1 right-1/4 text-[9px] rounded-full px-1" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
