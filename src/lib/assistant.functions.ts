import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TABLES, TOOLS, VIRTUAL, checkQuery, matches, systemPrompt, totals, trimHistory, type ChatMessage, type Filter, type Query } from "./assistant";

type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Reads rows for a checked query, with the signed-in user's own rights (row level security applies). */
async function readRows(db: Db, q: Query, max: number): Promise<Record<string, unknown>[]> {
  const virtual = VIRTUAL[q.table] ?? [];
  const real = (c: string) => !virtual.includes(c);
  const needed = [...new Set([...q.columns, ...q.filters.map((f) => f.column), ...(q.orderBy ? [q.orderBy] : [])])];
  let select = needed.filter(real).join(",") || "id";
  if (q.table === "bank_transactions" && needed.includes("account_name")) select += ",ledger_accounts:category_account_id(name)";
  let req = db.from(q.table).select(select);
  for (const f of q.filters.filter((x: Filter) => real(x.column))) {
    if (f.op === "is_null") req = req.is(f.column, null);
    else if (f.op === "not_null") req = req.not(f.column, "is", null);
    else if (f.op === "in") req = req.in(f.column, f.value as unknown[]);
    else if (f.op === "ilike") req = req.ilike(f.column, String(f.value).includes("%") ? String(f.value) : `%${f.value}%`);
    else req = req[f.op](f.column, f.value);
  }
  if (q.orderBy && real(q.orderBy)) req = req.order(q.orderBy, { ascending: !q.descending });
  const later = q.filters.filter((x: Filter) => !real(x.column));
  const { data, error } = await req.limit(later.length ? 5000 : max);
  if (error) throw new Error(error.message);
  let rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    if (!("ledger_accounts" in r)) return r;
    const { ledger_accounts, ...rest } = r as { ledger_accounts: { name: string } | null };
    return { ...rest, account_name: ledger_accounts?.name ?? null };
  });
  for (const f of later) rows = rows.filter((r) => matches(r, f));
  return rows.slice(0, max);
}

async function runTool(db: Db, name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "query") {
    const q = checkQuery(input);
    const rows = await readRows(db, q, q.limit);
    return { rows: rows.map((r) => Object.fromEntries(q.columns.map((c) => [c, r[c] ?? null]))), count: rows.length, limit: q.limit };
  }
  if (name === "total") {
    const column = String(input.column ?? ""), groupBy = input.group_by ? String(input.group_by) : null;
    const q = checkQuery({ table: input.table, filters: input.filters, columns: [column, ...(groupBy ? [groupBy] : [])] }, 5000);
    const rows = await readRows(db, q, 5000);
    return { groups: totals(rows, column, groupBy, !!input.per_month), rows_read: rows.length, capped: rows.length >= 5000 };
  }
  throw new Error(`Unknown tool ${name}`);
}

/**
 * One question to the Hub assistant. It looks up live data with read-only tools and answers in a few spoken sentences.
 * Admins only. Needs the ANTHROPIC_API_KEY secret; the model can be set with ASSISTANT_MODEL.
 */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: ChatMessage[] }) => {
    const messages = trimHistory(Array.isArray(input?.messages) ? input.messages : []);
    if (!messages.length || messages[messages.length - 1].role !== "user") throw new Error("Geen vraag");
    return { messages };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return { ok: false as const, reason: "no-access" as const };
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false as const, reason: "no-key" as const };

    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);
    const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", weekday: "long" }).format(now);
    const messages: { role: "user" | "assistant"; content: unknown }[] = data.messages.map((m) => ({ role: m.role, content: m.text }));
    const looked: string[] = [];

    for (let round = 0; round < 8; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.ASSISTANT_MODEL || "claude-haiku-5-5", max_tokens: 1024, system: systemPrompt(today, weekday), tools: TOOLS, messages }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error(`[assistant] model call failed: ${res.status} ${detail}`);
        return { ok: false as const, reason: res.status === 401 ? ("bad-key" as const) : res.status === 404 ? ("bad-model" as const) : res.status === 429 || res.status === 529 ? ("busy" as const) : ("failed" as const) };
      }
      const out = (await res.json()) as { content: Block[]; stop_reason: string };
      const uses = out.content.filter((b) => b.type === "tool_use");
      if (out.stop_reason !== "tool_use" || !uses.length) {
        const text = out.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
        return { ok: true as const, text: text || "Daar heb ik geen antwoord op gevonden.", looked };
      }
      messages.push({ role: "assistant", content: out.content });
      const results = [];
      for (const u of uses) {
        const table = String(u.input?.table ?? "");
        if (TABLES[table] && !looked.includes(table)) looked.push(table);
        try {
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(await runTool(supabase, u.name ?? "", u.input ?? {})).slice(0, 60000) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: e instanceof Error ? e.message : "failed" });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return { ok: false as const, reason: "too-long" as const };
  });
