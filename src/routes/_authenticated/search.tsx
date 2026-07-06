import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Search as SearchIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: searchSchema,
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Search</h1>
      {q && <p className="text-sm text-muted-foreground mb-6">Query: <span className="text-foreground">{q}</span></p>}
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={SearchIcon} title="Search coming next"
          description="Match by client name, city, or normalized phone." />
      </div>
    </div>
  );
}
