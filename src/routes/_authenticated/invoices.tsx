import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: Invoices,
});

function Invoices() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Invoices</h1>
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={FileText} title="Invoices coming next"
          description="Auto-numbered from 26, jsPDF export in FACTUUR format, status filter." />
      </div>
    </div>
  );
}
