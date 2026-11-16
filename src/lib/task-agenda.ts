// Sorting tasks into what a person asks first: what is late, what is today, what is this week.
export type AgendaTask = { id: string; client_id: string | null; title: string; assignee: string; due_date: string | null; done_at: string | null; recurring_id?: string | null };
export type AgendaGroup = { key: "late" | "today" | "week" | "later" | "none"; label: string; tasks: AgendaTask[] };

const add = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"], MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** Done tasks stay where they were ticked (today's list), so a slip can be undone; a done task that was late is not "late" any more. */
export function groupTasks(tasks: AgendaTask[], today: string): AgendaGroup[] {
  const weekEnd = add(today, 6);
  const g: Record<AgendaGroup["key"], AgendaTask[]> = { late: [], today: [], week: [], later: [], none: [] };
  for (const t of tasks) {
    if (t.done_at) { g.today.push(t); continue; }
    if (!t.due_date) g.none.push(t);
    else if (t.due_date < today) g.late.push(t);
    else if (t.due_date === today) g.today.push(t);
    else if (t.due_date <= weekEnd) g.week.push(t);
    else g.later.push(t);
  }
  const order = (a: AgendaTask, b: AgendaTask) => Number(!!a.done_at) - Number(!!b.done_at) || String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")) || a.title.localeCompare(b.title);
  const label: Record<AgendaGroup["key"], string> = { late: "Te laat", today: "Vandaag", week: "Deze week", later: "Later", none: "Zonder datum" };
  return (["late", "today", "week", "later", "none"] as const).filter((k) => g[k].length).map((k) => ({ key: k, label: label[k], tasks: g[k].sort(order) }));
}

export function dueLabel(due: string | null, today: string): string {
  if (!due) return "geen datum";
  if (due === today) return "vandaag";
  if (due === add(today, 1)) return "morgen";
  if (due === add(today, -1)) return "gisteren";
  const d = new Date(due + "T12:00:00Z");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
