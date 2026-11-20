import {
  diffContent,
  flagsFor,
  FLAG_LABEL,
  summary,
  type SiteContent,
  type Where,
} from "./site-changes";

type Log = {
  site: string;
  siteName: string;
  clientId: string | null;
  prev: SiteContent | null;
  next: SiteContent;
  versionId: string | null;
  prevVersionId: string | null;
  action: "publish" | "restore" | "undo";
  byWhom: "klant" | "solyn";
  where?: Where;
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const cut = (s: string | null, n = 2000) =>
  s == null ? null : s.length > n ? `${s.slice(0, n)}…` : s;

/**
 * Records one publish: a batch with its flags and a row per changed field. Mails me only when the batch has a red flag;
 * everything else waits quietly in Wijzigingen until I mark it as checked. Never throws: logging must not break publishing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logSiteChanges(db: any, l: Log) {
  try {
    const changes = diffContent(l.prev, l.next, l.where);
    if (!changes.length) return null;
    const since = new Date(Date.now() - 864e5).toISOString();
    const { data: recent } = await db
      .from("site_change_batches")
      .select("changes")
      .eq("site", l.site)
      .eq("by_whom", "klant")
      .gte("created_at", since);
    const today = {
      fields: ((recent ?? []) as { changes: number }[]).reduce((s, r) => s + r.changes, 0),
      publishes: (recent ?? []).length,
    };
    const flags = l.byWhom === "klant" ? flagsFor(changes, today) : [];
    const { data: batch, error } = await db
      .from("site_change_batches")
      .insert({
        site: l.site,
        client_id: l.clientId,
        version_id: l.versionId,
        prev_version_id: l.prevVersionId,
        action: l.action,
        by_whom: l.byWhom,
        changes: changes.length,
        flags,
        reviewed_at: l.byWhom === "solyn" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const rows = changes.map((c) => ({
      batch_id: batch.id,
      kind: c.kind,
      key: cut(c.key, 600),
      page: c.page,
      tag: c.tag,
      before: cut(c.before),
      after: cut(c.after),
      seo: c.seo,
      why: c.why,
    }));
    for (let i = 0; i < rows.length; i += 200)
      await db.from("site_changes").insert(rows.slice(i, i + 200));

    if (flags.length && process.env.RESEND_API_KEY) {
      const hub = (process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "");
      const top = changes
        .filter((c) => c.seo)
        .concat(changes.filter((c) => !c.seo))
        .slice(0, 8);
      const list = top
        .map(
          (c) =>
            `<li style="margin:0 0 8px"><span style="color:#666">${esc(c.kind === "contact" ? c.key : c.page ? `${c.page}${c.tag ? ` · ${c.tag}` : ""}` : c.kind === "img" ? "foto" : "tekst")}</span><br><s style="color:#a33">${esc((c.before ?? "").slice(0, 140))}</s><br><span style="color:#1e7a4f">${esc((c.after ?? "(leeg)").slice(0, 140))}</span>${c.why.length ? `<br><em style="color:#b07a00">${esc(c.why.join(", "))}</em>` : ""}</li>`,
        )
        .join("");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
          to: [process.env.ALERT_EMAIL_TO || "jason@solynglobal.be"],
          subject: `Rode vlag: ${summary(l.siteName, changes, flags)}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:580px;color:#111"><h2 style="margin:0 0 6px">${esc(l.siteName)} paste de website aan</h2><p style="margin:0 0 14px;color:#b07a00"><strong>${esc(flags.map((f) => FLAG_LABEL[f]).join(" · "))}</strong></p><ul style="padding-left:18px">${list}</ul>${changes.length > top.length ? `<p style="color:#666">en nog ${changes.length - top.length}…</p>` : ""}<p><a href="${hub}/wijzigingen" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Bekijk en draai terug in de Hub</a></p></div>`,
          text: `${summary(l.siteName, changes, flags)}\n\n${top.map((c) => `- ${c.kind === "contact" ? c.key : (c.page ?? c.kind)}: "${(c.before ?? "").slice(0, 80)}" → "${(c.after ?? "").slice(0, 80)}"${c.why.length ? ` (${c.why.join(", ")})` : ""}`).join("\n")}\n\n${hub}/wijzigingen`,
        }),
      }).catch(() => undefined);
    }
    return { batchId: batch.id as string, changes: changes.length, flags };
  } catch (e) {
    console.error("[site-changes]", l.site, e instanceof Error ? e.message : e);
    return null;
  }
}
