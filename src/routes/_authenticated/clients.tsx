import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Clients</h1>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={Users} title="Client list coming next"
          description="Filterable table (Active / Paused / All) with revenue, MRR, margin, renewal warnings." />
      </div>
    </div>
  );
}
