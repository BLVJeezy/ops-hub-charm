import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { brusselsToday } from "./invoice-schedule";
import { memberSeesClient, type TeamMember } from "./team";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const kinds = z.array(z.enum(["wijziging", "nieuwe-pagina", "seo", "social", "probleem", "andere"])).max(6);

async function staffOnly(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Alleen voor beheerders.");
}
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

/* ───────────── Staff: manage the team ───────────── */

export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context);
    const db = await admin();
    const [{ data: members }, { data: clients }, { data: tasks }, { data: reqs }] = await Promise.all([
      db.from("team_members").select("*").order("created_at"),
      db.from("clients").select("id, name, status, is_internal").order("name"),
      db.from("client_tasks").select("id, title, client_id, due_date, assignee_user_id, done_at").not("assignee_user_id", "is", null).or(`done_at.is.null,done_at.gte.${new Date(Date.now() - 14 * 864e5).toISOString()}`),
      db.from("client_requests").select("id, title, client_id, kind, status, priority, assignee_user_id, review_ready_at, created_at").not("status", "in", "(afgewezen,klaar)").order("priority").order("created_at"),
    ]);
    return {
      members: (members ?? []) as TeamMember[],
      clients: (clients ?? []).filter((c: any) => !c.is_internal && c.status !== "Write-off").map((c: any) => ({ id: c.id as string, name: c.name as string })) as { id: string; name: string }[],
      tasks: (tasks ?? []) as { id: string; title: string; client_id: string | null; due_date: string | null; assignee_user_id: string; done_at: string | null }[],
      requests: (reqs ?? []) as { id: string; title: string; client_id: string | null; kind: string; status: string; priority: number | null; assignee_user_id: string | null; review_ready_at: string | null; created_at: string }[],
    };
  });

const memberFields = z.object({
  full_name: z.string().trim().min(2).max(80),
  title: z.string().trim().max(60).nullable().optional(),
  access_until: day,
  auto_kinds: kinds.default([]),
  client_ids: z.array(uuid).max(200).nullable().optional(),
});

/** Makes the account (no password), gives it the member role and mails a one-time link to set a password. */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(memberFields.extend({ email: z.string().trim().toLowerCase().email().max(120) }))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const db = await admin();
    const { HUB, teamMail } = await import("./team.server");
    let link = await db.auth.admin.generateLink({ type: "invite", email: data.email, options: { data: { full_name: data.full_name } } });
    if (link.error && /already|registered|exists/i.test(link.error.message)) link = await db.auth.admin.generateLink({ type: "magiclink", email: data.email });
    if (link.error || !link.data?.user) throw new Error("Het account kon niet aangemaakt worden: " + (link.error?.message ?? "onbekend"));
    const user = link.data.user;
    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
    if ((roles ?? []).some((r: any) => r.role !== "member")) throw new Error("Dit e-mailadres is al een beheerder van de Hub.");
    if (!(roles ?? []).length) {
      const r = await db.from("user_roles").insert({ user_id: user.id, role: "member" });
      if (r.error) throw new Error("Rol toekennen lukte niet: " + r.error.message);
    }
    const row = await db.from("team_members").upsert({
      user_id: user.id, email: data.email, full_name: data.full_name, title: data.title || null,
      access_until: data.access_until || null, auto_kinds: data.auto_kinds, client_ids: data.client_ids?.length ? data.client_ids : null,
      active: true, invited_by: context.userId, invited_at: new Date().toISOString(),
    });
    if (row.error) throw new Error("Opslaan lukte niet: " + row.error.message);
    const type = link.data.properties?.verification_type ?? "invite";
    const href = `${HUB()}/team?th=${encodeURIComponent(link.data.properties.hashed_token)}&t=${type}`;
    const sent = await teamMail(data.email, "Je toegang tot Solyn Global", `Hoi ${data.full_name.split(" ")[0]}, welkom bij Solyn Global`, [
      ["Wat", "Je krijgt toegang tot je eigen overzicht: je taken, aanvragen en de klanten waaraan je werkt."],
      ["Eerste keer", "Klik op de knop en kies een wachtwoord. De link werkt één keer en vervalt na 24 uur."],
      ...(data.access_until ? [["Toegang tot", new Date(data.access_until + "T12:00:00").toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })] as [string, string]] : []),
    ], { href, label: "Wachtwoord kiezen" });
    return { ok: true, mailed: sent };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(memberFields.partial().extend({ user_id: uuid, active: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const db = await admin();
    const { user_id, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if ("client_ids" in rest) patch.client_ids = rest.client_ids?.length ? rest.client_ids : null;
    if ("access_until" in rest) patch.access_until = rest.access_until || null;
    const r = await db.from("team_members").update(patch).eq("user_id", user_id);
    if (r.error) throw new Error(r.error.message);
    // stopped or past the end date: every portal call checks this, so access ends right away
    return { ok: true };
  });

/** New one-time login link (forgotten password, or the first link expired). */
export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: uuid }))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const db = await admin();
    const { HUB, teamMail } = await import("./team.server");
    const { data: m } = await db.from("team_members").select("email, full_name").eq("user_id", data.user_id).maybeSingle();
    if (!m) throw new Error("Onbekend teamlid");
    const link = await db.auth.admin.generateLink({ type: "magiclink", email: m.email });
    if (link.error) throw new Error(link.error.message);
    const href = `${HUB()}/team?th=${encodeURIComponent(link.data.properties.hashed_token)}&t=magiclink`;
    const sent = await teamMail(m.email, "Je nieuwe inloglink voor Solyn Global", `Hoi ${m.full_name.split(" ")[0]}, hier is je nieuwe link`, [["Wat", "Klik op de knop en kies (opnieuw) een wachtwoord. De link werkt één keer."]], { href, label: "Inloggen" });
    return { ok: true, mailed: sent };
  });

/** Give a task or request to a member (or take it back with user_id null). */
export const assignItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ type: z.enum(["task", "request"]), id: uuid, user_id: uuid.nullable() }))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const db = await admin();
    const table = data.type === "task" ? "client_tasks" : "client_requests";
    const { data: item } = await db.from(table).select(data.type === "task" ? "title, client_id, due_date" : "title, client_id").eq("id", data.id).maybeSingle();
    if (!item) throw new Error("Niet gevonden");
    if (data.user_id) {
      const { data: m } = await db.from("team_members").select("*").eq("user_id", data.user_id).maybeSingle();
      if (!m) throw new Error("Onbekend teamlid");
      if (!memberSeesClient(m, item.client_id)) throw new Error(`${m.full_name} heeft geen toegang tot deze klant.`);
    }
    const r = await db.from(table).update({ assignee_user_id: data.user_id }).eq("id", data.id);
    if (r.error) throw new Error(r.error.message);
    if (data.user_id) {
      const { notifyAssigned } = await import("./team.server");
      const { data: c } = item.client_id ? await db.from("clients").select("name").eq("id", item.client_id).maybeSingle() : { data: null };
      await notifyAssigned(data.user_id, { type: data.type === "task" ? "taak" : "aanvraag", title: item.title, client: c?.name, due: item.due_date });
    }
    return { ok: true };
  });

export const createTaskFor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: uuid, title: z.string().trim().min(2).max(200), client_id: uuid.nullable(), due_date: day }))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const db = await admin();
    const { data: m } = await db.from("team_members").select("*").eq("user_id", data.user_id).maybeSingle();
    if (!m) throw new Error("Onbekend teamlid");
    if (data.client_id && !memberSeesClient(m, data.client_id)) throw new Error(`${m.full_name} heeft geen toegang tot deze klant.`);
    const r = await db.from("client_tasks").insert({ title: data.title, client_id: data.client_id, due_date: data.due_date || null, assignee: "me", assignee_user_id: data.user_id, created_by: context.userId }).select("id").single();
    if (r.error) throw new Error(r.error.message);
    const { notifyAssigned } = await import("./team.server");
    const { data: c } = data.client_id ? await db.from("clients").select("name").eq("id", data.client_id).maybeSingle() : { data: null };
    await notifyAssigned(data.user_id, { type: "taak", title: data.title, client: c?.name, due: data.due_date });
    return { ok: true };
  });

/* ───────────── Member: their own portal ───────────── */

export type PortalTask = { id: string; title: string; client_id: string | null; due_date: string | null; done_at: string | null; created_at: string; client: string | null };
export type PortalRequest = { id: string; title: string; details: string | null; client_id: string | null; kind: string; status: string; priority: number | null; wished_date: string | null; review_ready_at: string | null; created_at: string; client: string | null };
export type PortalClient = { id: string; name: string; sector: string | null; location: string | null; brand_color: string | null };

type SiteView = { name: string; url: string; repo: string | null; last_status: string | null; last_checked_at: string | null; ssl_ok: boolean | null; last_response_ms: number | null; last_deploy_state: string | null; last_deploy_at: string | null };

export const myPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireMember } = await import("./team.server");
    const me = await requireMember(context.userId);
    const db = await admin();
    await db.from("team_members").update({ last_seen_at: new Date().toISOString() }).eq("user_id", me.user_id);
    let cq = db.from("clients").select("id, name, sector, location, status, brand_color, is_internal").eq("status", "Active").order("name");
    if (me.client_ids?.length) cq = cq.in("id", me.client_ids);
    const [{ data: tasks }, { data: reqs }, { data: clients }] = await Promise.all([
      db.from("client_tasks").select("id, title, client_id, due_date, done_at, created_at").eq("assignee_user_id", me.user_id).or(`done_at.is.null,done_at.gte.${new Date(Date.now() - 7 * 864e5).toISOString()}`).order("due_date", { ascending: true, nullsFirst: false }),
      db.from("client_requests").select("id, title, details, client_id, kind, status, priority, wished_date, review_ready_at, created_at").eq("assignee_user_id", me.user_id).not("status", "in", "(afgewezen)").order("priority").order("created_at"),
      cq,
    ]);
    const names = new Map<string, string>((clients ?? []).map((c: any) => [c.id, c.name]));
    // a task can name a client outside the list; show its name anyway
    return {
      me: { name: me.full_name, title: me.title, access_until: me.access_until, email: me.email },
      today: brusselsToday(),
      tasks: (tasks ?? []).map((t: any) => ({ ...t, client: names.get(t.client_id) ?? null })) as PortalTask[],
      requests: (reqs ?? []).filter((r: any) => r.status !== "klaar" || Date.now() - Date.parse(r.created_at) < 30 * 864e5).map((r: any) => ({ ...r, client: names.get(r.client_id) ?? null })) as PortalRequest[],
      clients: (clients ?? []).filter((c: any) => !c.is_internal).map((c: any) => ({ id: c.id, name: c.name, sector: c.sector, location: c.location, brand_color: c.brand_color })) as PortalClient[],
    };
  });

/** Read-only client profile: status, sites and their health, GitHub, Drive, files. No money, no contact details. */
export const myClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ client_id: uuid }))
  .handler(async ({ data, context }) => {
    const { requireMember } = await import("./team.server");
    const me = await requireMember(context.userId);
    if (!memberSeesClient(me, data.client_id)) throw new Error("Geen toegang tot deze klant.");
    const db = await admin();
    const [{ data: c }, { data: sites }, { data: docs }] = await Promise.all([
      db.from("clients").select("id, name, sector, location, status, contact_name, drive_url, brand_color, seo_package, website_needed, social_videos_per_month").eq("id", data.client_id).maybeSingle(),
      db.from("monitored_sites").select("name, url, repo, last_status, last_checked_at, ssl_ok, last_response_ms, last_deploy_state, last_deploy_at").eq("client_id", data.client_id).eq("enabled", true),
      db.from("client_documents").select("id, title, file_name, content_type, file_size, created_at").eq("client", data.client_id).order("created_at", { ascending: false }).limit(60),
    ]);
    if (!c) throw new Error("Klant niet gevonden.");
    const services = [c.website_needed ? "Website" : null, c.seo_package ? "SEO" : null, c.social_videos_per_month ? `Social (${c.social_videos_per_month} video's/maand)` : null].filter(Boolean);
    return {
      client: { id: c.id, name: c.name, sector: c.sector, location: c.location, status: c.status, contact_name: c.contact_name, drive_url: c.drive_url, brand_color: c.brand_color, services },
      sites: (sites ?? []) as SiteView[],
      docs: docs ?? [],
    };
  });

export const myDocLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ doc_id: uuid }))
  .handler(async ({ data, context }) => {
    const { requireMember } = await import("./team.server");
    const me = await requireMember(context.userId);
    const db = await admin();
    const { data: d } = await db.from("client_documents").select("client, storage_path, file_name").eq("id", data.doc_id).maybeSingle();
    if (!d || !memberSeesClient(me, d.client)) throw new Error("Geen toegang tot dit bestand.");
    const r = await db.storage.from("client-documents").createSignedUrl(d.storage_path, 600, { download: d.file_name });
    if (r.error) throw new Error("Bestand kon niet geopend worden.");
    return { url: r.data.signedUrl };
  });

export const myTaskDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, done: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { requireMember } = await import("./team.server");
    const me = await requireMember(context.userId);
    const db = await admin();
    const r = await db.from("client_tasks").update({ done_at: data.done ? new Date().toISOString() : null }).eq("id", data.id).eq("assignee_user_id", me.user_id).select("id");
    if (r.error || !r.data?.length) throw new Error("Deze taak staat niet op jouw naam.");
    return { ok: true };
  });

/** A member never mails the client: they hand the request back to Jason, who checks it and closes it in Aanvragen. */
export const myRequestReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, note: z.string().trim().max(2000).default("") }))
  .handler(async ({ data, context }) => {
    const { requireMember, teamMail, HUB } = await import("./team.server");
    const me = await requireMember(context.userId);
    const db = await admin();
    const { data: r } = await db.from("client_requests").select("id, title, note, client_id").eq("id", data.id).eq("assignee_user_id", me.user_id).maybeSingle();
    if (!r) throw new Error("Deze aanvraag staat niet op jouw naam.");
    const stamp = new Date().toLocaleString("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const note = [r.note, `${me.full_name} (${stamp}): klaar voor controle${data.note ? ` — ${data.note}` : ""}`].filter(Boolean).join("\n");
    const u = await db.from("client_requests").update({ review_ready_at: new Date().toISOString(), note }).eq("id", r.id);
    if (u.error) throw new Error(u.error.message);
    const { data: c } = r.client_id ? await db.from("clients").select("name").eq("id", r.client_id).maybeSingle() : { data: null };
    await teamMail(process.env.ALERT_EMAIL_TO || "jason@solynglobal.be", `Klaar voor controle: ${r.title}`.slice(0, 140), `${me.full_name} is klaar met een aanvraag`, [["Aanvraag", r.title], ...(c ? [["Klant", c.name] as [string, string]] : []), ...(data.note ? [["Notitie", data.note] as [string, string]] : [])], { href: `${HUB()}/aanvragen`, label: "Nakijken in Aanvragen" });
    return { ok: true };
  });

/* ───────────── Staff: client links ───────────── */

export const setClientDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ client_id: uuid, drive_url: z.string().trim().max(500).url().or(z.literal("")) }))
  .handler(async ({ data, context }) => {
    await staffOnly(context);
    const db = await admin();
    const r = await db.from("clients").update({ drive_url: data.drive_url || null }).eq("id", data.client_id);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
