import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isSecretKey, parseEndpoints } from "@/lib/monitoring/checks";

export type SiteRow = {
  id?: string;
  client_id: string | null;
  name: string;
  url: string;
  hosting_provider: string;
  repo: string | null;
  db_provider: string;
  db_health_url: string | null;
  db_health_apikey: string | null;
  api_endpoints: unknown;
  email_domain: string | null;
  vercel_project_id: string | null;
  is_critical: boolean;
  check_interval_minutes: number;
  enabled: boolean;
  notes: string | null;
};

export const HOSTING = ["Vercel", "Lovable", "Netlify", "Other"];
export const DB_PROVIDERS: Record<string, string> = {
  lovable_cloud: "Lovable Cloud",
  supabase: "Supabase",
  firebase: "Firebase",
  vercel_blob: "Vercel Blob",
  none: "None",
};
const INTERVALS = [5, 10, 15, 30, 60, 360, 1440];

const EMPTY: SiteRow = {
  client_id: null,
  name: "",
  url: "https://",
  hosting_provider: "Vercel",
  repo: "",
  db_provider: "none",
  db_health_url: "",
  db_health_apikey: "",
  api_endpoints: [],
  email_domain: "",
  vercel_project_id: "",
  is_critical: false,
  check_interval_minutes: 15,
  enabled: true,
  notes: "",
};

function endpointsToText(raw: unknown): string {
  return parseEndpoints(raw)
    .map((e) => (e.label ? `${e.label} | ${e.url}` : e.url))
    .join("\n");
}
function textToEndpoints(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, b] = l.split("|").map((s) => s.trim());
      return b ? { label: a, url: b } : { url: a };
    });
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<SiteRow> & { id?: string };
  clients: { id: string; name: string }[];
  onSaved?: () => void;
};

export function SiteModal({ open, onOpenChange, initial, clients, onSaved }: Props) {
  const [form, setForm] = useState<SiteRow>({ ...EMPTY, ...(initial as SiteRow) });
  const [endpoints, setEndpoints] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const f = { ...EMPTY, ...(initial as SiteRow) };
      setForm(f);
      setEndpoints(endpointsToText(f.api_endpoints));
    }
  }, [open, initial]);

  const set = <K extends keyof SiteRow>(k: K, v: SiteRow[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return toast.error("Name required");
    if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(form.url))
      return toast.error("Enter a full website URL");
    if (form.db_health_url && !/^https:\/\//.test(form.db_health_url))
      return toast.error("Database health URL must be https://");
    if (form.db_health_apikey && isSecretKey(form.db_health_apikey.trim())) {
      return toast.error(
        "That is a secret/service-role key. Only use the public anon/publishable key.",
      );
    }
    const eps = textToEndpoints(endpoints);
    if (eps.some((e) => !/^https:\/\//.test(e.url)))
      return toast.error("API endpoints must start with https://");

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const clean = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const payload = {
        client_id: form.client_id,
        name: form.name.trim(),
        url: form.url.trim().replace(/\/$/, ""),
        hosting_provider: form.hosting_provider,
        repo: clean(form.repo),
        db_provider: form.db_provider,
        db_health_url: clean(form.db_health_url),
        db_health_apikey: clean(form.db_health_apikey),
        api_endpoints: eps,
        email_domain: clean(form.email_domain)?.toLowerCase() ?? null,
        vercel_project_id: clean(form.vercel_project_id),
        is_critical: form.is_critical,
        check_interval_minutes: form.check_interval_minutes,
        enabled: form.enabled,
        notes: clean(form.notes),
        ...(form.id ? {} : { created_by: u.user?.id }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new table not in generated types yet
      const t = (supabase as any).from("monitored_sites");
      const { error } = form.id
        ? await t.update(payload).eq("id", form.id)
        : await t.insert(payload);
      if (error) throw error;
      toast.success(form.id ? "Site updated" : "Site added");
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit monitored site" : "Add site to monitor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <F label="Client">
            <Select
              value={form.client_id ?? "none"}
              onValueChange={(v) => {
                const c = clients.find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  client_id: v === "none" ? null : v,
                  name: f.name || c?.name || "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Not linked —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Name *">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Riory website"
            />
          </F>
          <F label="Website URL *">
            <Input inputMode="url" value={form.url} onChange={(e) => set("url", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Hosting">
              <Select
                value={form.hosting_provider}
                onValueChange={(v) => set("hosting_provider", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOSTING.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="Check every">
              <Select
                value={String(form.check_interval_minutes)}
                onValueChange={(v) => set("check_interval_minutes", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m < 60 ? `${m} min` : `${m / 60} h`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          </div>
          <F label="GitHub repo">
            <Input
              value={form.repo ?? ""}
              onChange={(e) => set("repo", e.target.value)}
              placeholder="BLVJeezy/riory"
            />
          </F>

          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Database
          </div>
          <F label="Provider">
            <Select value={form.db_provider} onValueChange={(v) => set("db_provider", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DB_PROVIDERS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          {form.db_provider !== "none" && (
            <>
              <F label="Read-only health URL">
                <Input
                  value={form.db_health_url ?? ""}
                  onChange={(e) => set("db_health_url", e.target.value)}
                  placeholder="https://<project>.supabase.co/auth/v1/health"
                />
              </F>
              <F label="Public anon / publishable key (never the secret key)">
                <Input
                  value={form.db_health_apikey ?? ""}
                  onChange={(e) => set("db_health_apikey", e.target.value)}
                  placeholder="eyJ… or sb_publishable_…"
                />
              </F>
            </>
          )}

          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Extra checks
          </div>
          <F label="Important API endpoints (one per line, optional “Label | URL”)">
            <Textarea
              rows={3}
              value={endpoints}
              onChange={(e) => setEndpoints(e.target.value)}
              placeholder={"Availability | https://example.be/api/availability"}
            />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Resend sending domain">
              <Input
                value={form.email_domain ?? ""}
                onChange={(e) => set("email_domain", e.target.value)}
                placeholder="riory.be"
              />
            </F>
            <F label="Vercel project ID">
              <Input
                value={form.vercel_project_id ?? ""}
                onChange={(e) => set("vercel_project_id", e.target.value)}
                placeholder="prj_…"
              />
            </F>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Booking / critical system</div>
              <div className="text-xs text-muted-foreground">
                API & database failures become Critical alerts
              </div>
            </div>
            <Switch checked={form.is_critical} onCheckedChange={(v) => set("is_critical", v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="text-sm font-medium">Monitoring enabled</div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>
          <F label="Notes">
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </F>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
