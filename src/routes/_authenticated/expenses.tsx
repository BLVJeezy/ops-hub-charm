import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: Expenses,
});

function Expenses() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Expenses</h1>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={Wallet} title="Expenses coming next"
          description="Total fixed monthly costs, business-wide and client-linked expenses." />
      </div>
    </div>
  );
}
