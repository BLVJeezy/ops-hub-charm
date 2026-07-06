import { createFileRoute } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: Pipeline,
});

function Pipeline() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Pipeline</h1>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={GitBranch} title="Kanban coming next"
          description="Drag prospects between the 8 stages. Realtime updates included." />
      </div>
    </div>
  );
}
