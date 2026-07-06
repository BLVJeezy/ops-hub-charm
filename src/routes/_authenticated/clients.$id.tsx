import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to clients
      </Link>
      <h1 className="text-2xl font-semibold">Client detail</h1>
      <p className="mt-1 text-xs text-muted-foreground font-mono">{id}</p>
      <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Detail view (contact, business, status history, invoices, actions, contact log) coming next.
      </div>
    </div>
  );
}
