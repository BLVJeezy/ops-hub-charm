import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/action-planner")({
  component: ActionPlanner,
});

function ActionPlanner() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Action Planner</h1>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={ListChecks} title="Actions coming next"
          description="Task list with client filter, sort by due date, and overdue markers." />
      </div>
    </div>
  );
}
