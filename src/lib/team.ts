/** Team members (employee, freelancer, someone hired for a month): shared types and rules. */

export type TeamMember = {
  user_id: string;
  full_name: string;
  email: string;
  title: string | null;
  access_until: string | null;
  active: boolean;
  auto_kinds: string[];
  client_ids: string[] | null;
  invited_at?: string;
  last_seen_at?: string | null;
};

/** Access is open while the member is active and the end date (if any) has not passed. */
export function memberOpen(m: Pick<TeamMember, "active" | "access_until">, today: string): boolean {
  return m.active && (!m.access_until || m.access_until >= today);
}

/** Whether this member may see this client. No list means all clients. */
export function memberSeesClient(m: Pick<TeamMember, "client_ids">, clientId: string | null | undefined): boolean {
  if (!m.client_ids || m.client_ids.length === 0) return true;
  return !!clientId && m.client_ids.includes(clientId);
}

/**
 * Who gets a new request automatically: an open member whose kinds include this kind and who
 * sees this client. With several, the one with a client list naming this client wins (the most
 * specific), then the one with the fewest open items. Nobody matches → null (it stays with you).
 */
export function pickAssignee(
  members: (TeamMember & { open_items?: number })[],
  req: { kind: string; clientId: string | null },
  today: string,
): string | null {
  const fit = members.filter(
    (m) => memberOpen(m, today) && m.auto_kinds.includes(req.kind) && memberSeesClient(m, req.clientId),
  );
  if (!fit.length) return null;
  fit.sort((a, b) => {
    const sa = a.client_ids?.length ? 0 : 1, sb = b.client_ids?.length ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (a.open_items ?? 0) - (b.open_items ?? 0);
  });
  return fit[0].user_id;
}

export function accessLabel(m: Pick<TeamMember, "active" | "access_until">, today: string): string {
  if (!m.active) return "Gestopt";
  if (!m.access_until) return "Toegang zonder einddatum";
  if (m.access_until < today) return "Toegang verlopen";
  return `Toegang tot ${new Date(m.access_until + "T12:00:00").toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })}`;
}
