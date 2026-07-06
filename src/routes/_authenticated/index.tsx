import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon={LayoutDashboard}
          title="Dashboard coming next"
          description="This week's tasks, MRR, revenue report, pipeline overview, and client health will appear here."
        />
      </div>
    </div>
  );
}
