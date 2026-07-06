import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/onboarding-queue")({
  component: OnboardingQueue,
});

function OnboardingQueue() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Onboarding Queue</h1>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={ClipboardList} title="Submission review coming next"
          description="Approve or reject public onboarding forms. Approved submissions become client records." />
      </div>
    </div>
  );
}
