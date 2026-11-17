// Sorting tasks into what a person asks first: what is late, what is today, what is this week.
export type AgendaTask = {
  id: string; client_id: string | null; title: string; assignee: string; due_date: string | null; done_at: string | null; recurring_id?: string | null;
  // the timer
  started_at?: string | null; seconds?: number | null; breaks?: number | null; steps_total?: number | null; steps_done?: number | null; laps?: number[] | null;
};

/** Seconds worked on a task so far: what was banked plus the run that is going on now. */
export function elapsed(t: Pick<AgendaTask, "started_at" | "seconds">, now: number): number {
  const run = t.started_at ? Math.max(0, Math.floor((now - Date.parse(t.started_at)) / 1000)) : 0;
  return Number(t.seconds || 0) + run;
}
/** A running clock: 4:07, 1:02:30. */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
/** Time in words for a finished or paused task: "45 sec", "32 min", "1 u 05". */
export function spent(sec: number): string {
  if (sec < 60) return `${sec} sec`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} u ${String(m % 60).padStart(2, "0")}`;
}
/** What one piece of a task is called: a task about videos counts videos, anything else counts steps. */
export const stepWord = (title: string) => (/video/i.test(title) ? "Video" : /post/i.test(title) ? "Post" : "Stap");
/** How long each finished piece took, from the clock readings at each finish. */
export const lapTimes = (laps: number[] | null | undefined) => (laps ?? []).map((v, i, a) => v - (i ? a[i - 1] : 0));
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

export type ClientGroup = { clientId: string | null; tasks: AgendaTask[]; late: number; today: number; week: number; open: number; next: string | null };
/**
 * Open tasks per client, the client that needs you first on top: most late tasks, then most for today,
 * then most for this week, then the nearest date. Tasks inside a client run by date; undated ones last.
 */
export function groupByClient(tasks: AgendaTask[], today: string): ClientGroup[] {
  const end = weekEnd(today), map = new Map<string | null, AgendaTask[]>();
  for (const t of tasks) { if (t.done_at) continue; const k = t.client_id ?? null; map.set(k, [...(map.get(k) ?? []), t]); }
  const out: ClientGroup[] = [...map.entries()].map(([clientId, list]) => {
    const ts = list.sort((a, b) => String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")) || a.title.localeCompare(b.title));
    const dated = ts.filter((t) => t.due_date).map((t) => t.due_date as string);
    return {
      clientId, tasks: ts, open: ts.length,
      late: dated.filter((d) => d < today).length, today: dated.filter((d) => d === today).length,
      week: dated.filter((d) => d > today && d <= end).length, next: dated.find((d) => d >= today) ?? null,
    };
  });
  return out.sort((a, b) => b.late - a.late || b.today - a.today || b.week - a.week || String(a.next ?? "9").localeCompare(String(b.next ?? "9")) || b.open - a.open);
}
/** Open tasks of one group split per day, for lists that show a heading for each date. */
export function byDay(tasks: AgendaTask[]): { day: string | null; tasks: AgendaTask[] }[] {
  const out: { day: string | null; tasks: AgendaTask[] }[] = [];
  for (const t of tasks) { const last = out[out.length - 1]; if (last && last.day === t.due_date) last.tasks.push(t); else out.push({ day: t.due_date, tasks: [t] }); }
  return out;
}
