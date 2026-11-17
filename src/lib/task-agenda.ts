// Sorting tasks into what a person asks first: what is late, what is today, what is this week.
export type AgendaTask = { id: string; client_id: string | null; title: string; assignee: string; due_date: string | null; done_at: string | null; recurring_id?: string | null };
export type GroupKey = "late" | "today" | "week" | "next" | "later" | "none";
export type AgendaGroup = { key: GroupKey; label: string; range?: string; tasks: AgendaTask[] };

const add = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"], MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
/** The Sunday that ends the week of this day (weeks run Monday to Sunday). */
export const weekEnd = (iso: string) => add(iso, (7 - new Date(iso + "T12:00:00Z").getUTCDay()) % 7);

/**
 * Late, today, the rest of this week, next week, later, undated — in that order, empty groups left out.
 * Done tasks stay under today, after the open ones, so a slip can be undone; a done task that was late is not "late" any more.
 */
export function groupTasks(tasks: AgendaTask[], today: string): AgendaGroup[] {
  const thisEnd = weekEnd(today), nextEnd = add(thisEnd, 7);
  const g: Record<GroupKey, AgendaTask[]> = { late: [], today: [], week: [], next: [], later: [], none: [] };
  for (const t of tasks) {
    if (t.done_at) { g.today.push(t); continue; }
    if (!t.due_date) g.none.push(t);
    else if (t.due_date < today) g.late.push(t);
    else if (t.due_date === today) g.today.push(t);
    else if (t.due_date <= thisEnd) g.week.push(t);
    else if (t.due_date <= nextEnd) g.next.push(t);
    else g.later.push(t);
  }
  const order = (a: AgendaTask, b: AgendaTask) => Number(!!a.done_at) - Number(!!b.done_at) || String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")) || a.title.localeCompare(b.title);
  const label: Record<GroupKey, string> = { late: "Te laat", today: "Vandaag", week: "Deze week", next: "Volgende week", later: "Later", none: "Zonder datum" };
  const range: Partial<Record<GroupKey, string>> = { today: `${DAYS[new Date(today + "T12:00:00Z").getUTCDay()]} ${dm(today)}`, week: today < thisEnd ? `t/m zo ${dm(thisEnd)}` : undefined, next: `ma ${dm(add(thisEnd, 1))} – zo ${dm(nextEnd)}` };
  return (["late", "today", "week", "next", "later", "none"] as const).filter((k) => g[k].length).map((k) => ({ key: k, label: label[k], range: range[k], tasks: g[k].sort(order) }));
}
/** "wo" — the weekday of a date, for lists where the week is already clear. */
export const weekday = (iso: string) => DAYS[new Date(iso + "T12:00:00Z").getUTCDay()];

export function dueLabel(due: string | null, today: string): string {
  if (!due) return "geen datum";
  if (due === today) return "vandaag";
  if (due === add(today, 1)) return "morgen";
  if (due === add(today, -1)) return "gisteren";
  const d = new Date(due + "T12:00:00Z");
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
