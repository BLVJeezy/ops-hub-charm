import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { brusselsToday } from "./invoice-schedule";
import { memberOpen, pickAssignee, type TeamMember } from "./team";

const db = supabaseAdmin as any;
export const HUB = () => (process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The member row for this user, only while access is open. Staff are never members. */
export async function openMember(userId: string): Promise<TeamMember | null> {
  const [{ data: row }, { data: roles }] = await Promise.all([
    db.from("team_members").select("*").eq("user_id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const r = (roles ?? []).map((x: { role: string }) => x.role);
  if (!row || !r.includes("member") || r.some((x: string) => x !== "member")) return null;
  return memberOpen(row, brusselsToday()) ? (row as TeamMember) : null;
}

export async function requireMember(userId: string): Promise<TeamMember> {
  const m = await openMember(userId);
  if (!m) throw new Error("Je toegang is niet (meer) actief. Vraag Jason om toegang.");
  return m;
}

/** A plain mail to a team member or to Jason. Not recorded as client mail. */
export async function teamMail(to: string, subject: string, title: string, lines: [string, string][], link: { href: string; label: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111"><h2 style="margin:0 0 12px">${esc(title)}</h2><table style="border-collapse:collapse;font-size:14px">${lines.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join("")}</table><p style="margin-top:18px"><a href="${link.href}" style="display:inline-block;background:#111;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none">${esc(link.label)}</a></p><p style="color:#888;font-size:12px">Solyn Global</p></div>`;
  const text = `${title}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${link.label}: ${link.href}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
      to: [to],
      reply_to: process.env.ALERT_EMAIL_TO || "jason@solynglobal.be",
      subject,
      html,
      text,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

/** Tell a member something landed on their list. Failing mail never blocks the assignment. */
export async function notifyAssigned(userId: string, what: { type: "taak" | "aanvraag"; title: string; client?: string | null; due?: string | null }) {
  const { data: m } = await db.from("team_members").select("email, full_name").eq("user_id", userId).maybeSingle();
  if (!m) return;
  const lines: [string, string][] = [["Wat", what.title]];
  if (what.client) lines.push(["Klant", what.client]);
  if (what.due) lines.push(["Tegen", new Date(what.due + "T12:00:00").toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })]);
  await teamMail(m.email, `Nieuwe ${what.type} voor jou: ${what.title}`.slice(0, 140), `Hoi ${m.full_name.split(" ")[0]}, er staat een nieuwe ${what.type} voor je klaar`, lines, { href: `${HUB()}/team`, label: "Open je overzicht" });
}

/** New client request: hand it to the matching team member, if any. Returns who got it. */
export async function autoAssignRequest(requestId: string, kind: string, clientId: string | null, title: string, clientName?: string) {
  try {
    const { data: members } = await db.from("team_members").select("*").eq("active", true);
    if (!members?.length) return null;
    const ids = members.map((m: TeamMember) => m.user_id);
    const [{ data: t }, { data: r }] = await Promise.all([
      db.from("client_tasks").select("assignee_user_id").in("assignee_user_id", ids).is("done_at", null),
      db.from("client_requests").select("assignee_user_id").in("assignee_user_id", ids).not("status", "in", "(klaar,afgewezen)"),
    ]);
    const load: Record<string, number> = {};
    for (const x of [...(t ?? []), ...(r ?? [])]) load[x.assignee_user_id] = (load[x.assignee_user_id] ?? 0) + 1;
    const pick = pickAssignee(members.map((m: TeamMember) => ({ ...m, open_items: load[m.user_id] ?? 0 })), { kind, clientId }, brusselsToday());
    if (!pick) return null;
    await db.from("client_requests").update({ assignee_user_id: pick }).eq("id", requestId);
    await notifyAssigned(pick, { type: "aanvraag", title, client: clientName });
    return pick;
  } catch (e) {
    console.error("[team] auto-assign failed", e instanceof Error ? e.message : e);
    return null;
  }
}
