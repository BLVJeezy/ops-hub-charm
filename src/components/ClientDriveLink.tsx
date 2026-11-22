import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FolderOpen } from "lucide-react";
import { setClientDrive } from "@/lib/team.functions";

/** The client's Google Drive folder: one link that team members also see on their read-only client profile. */
export function ClientDriveLink({ clientId, value }: { clientId: string; value: string | null | undefined }) {
  const save = useServerFn(setClientDrive);
  const [url, setUrl] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setUrl(value ?? ""), [value]);
  const changed = url.trim() !== (value ?? "");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await save({ data: { client_id: clientId, drive_url: url.trim() } }); toast.success("Drive-link bewaard"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Bewaren lukte niet"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-3.5 mb-6 flex flex-col sm:flex-row gap-2 sm:items-center">
      <div className="flex items-center gap-2 text-sm font-medium shrink-0"><FolderOpen className="w-4 h-4 text-primary" />Drive-map</div>
      <input type="url" inputMode="url" placeholder="https://drive.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 min-w-0 h-10 rounded-lg border border-input bg-background px-3 text-base sm:text-sm" />
      <div className="flex gap-2">
        {value && <a href={value} target="_blank" rel="noopener noreferrer" className="h-10 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5">Open<ExternalLink className="w-3.5 h-3.5" /></a>}
        {changed && <button disabled={busy} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{busy ? "…" : "Bewaar"}</button>}
      </div>
    </form>
  );
}
