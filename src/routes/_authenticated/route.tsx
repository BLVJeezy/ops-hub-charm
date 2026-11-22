import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
    // team members (freelancer, employee) only get their own portal
    else if (!loading && role === "member") navigate({ to: "/team", replace: true });
  }, [user, role, loading, navigate]);

  if (loading || !user || role === "member") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-xs text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return <AppShell><Outlet /></AppShell>;
}
