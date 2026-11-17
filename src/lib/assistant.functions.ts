import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { brusselsToday } from "@/lib/invoice-schedule";
import { TOOLS, checkLink, checkRead, checkTask, cleanMessages, systemPrompt, type ChatMessage, type HubLink } from "@/lib/assistant";

const API = "https://api.anthropic.com/v1";
const MAX_STEPS = 10;          // look-ups per question
const MAX_RESULT_CHARS = 40000; // per look-up, so one wide table cannot fill the conversation

export type AssistantReply =
  | { ok: true; text: string; did: string[]; links: HubLink[] }
  | { ok: false; reason: "no_key" | "bad_key" | "not_staff" | "error"; message: string };

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

let cachedModel: string | null = null;

/** The model to use: the ASSISTANT_MODEL secret if set, otherwise the newest Sonnet the key can use. */
async function pickModel(headers: Record<string, string>): Promise<string> {
  if (process.env.ASSISTANT_MODEL) return process.env.ASSISTANT_MODEL;
  if (cachedModel) return cachedModel;
  const res = await fetch(`${API}/models?limit=100`, { headers });
  if (res.status === 401 || res.status === 403) throw new KeyError();
  if (!res.ok) throw new Error(`Could not list Claude models (${res.status}).`);
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);   // newest first
  const model = ids.find((id) => id.includes("sonnet")) ?? ids[0];
  if (!model) throw new Error("This Claude API key has no models available.");
  cachedModel = model;
  return model;
}

class KeyError extends Error {}

async function readTable(db: Db, input: unknown): Promise<string> {
  const checked = checkRead(input);
  if (!checked.ok) return checked.error;
  const r = checked.request;
  let q = r.countOnly ? db.from(r.table).select(r.columns[0], { count: "exact", head: true }) : db.from(r.table).select(r.columns.join(","));
  for (const f of r.filters) {
    if (f.op === "is_null") q = q.is(f.column, null);
    else if (f.op === "not_null") q = q.not(f.column, "is", null);
    else if (f.op === "in") q = q.in(f.column, f.value as unknown[]);
    else q = q[f.op](f.column, f.value);
  }
  if (r.countOnly) {
    const { count, error } = await q;
    return error ? `Could not count: ${error.message}` : JSON.stringify({ count });
  }
  if (r.orderBy) q = q.order(r.orderBy, { ascending: r.ascending, nullsFirst: false });
  const { data, error } = await q.limit(r.limit);
  if (error) return `Could not read ${r.table}: ${error.message}`;
  const rows = data ?? [];
  const json = JSON.stringify(rows);
  if (json.length > MAX_RESULT_CHARS) return `Too much data (${rows.length} rows). Ask for fewer columns, add filters or lower the limit.`;
  return JSON.stringify({ rows, note: rows.length === r.limit ? `Limit of ${r.limit} rows reached; there may be more.` : undefined });
}

async function createTask(db: Db, userId: string, input: unknown, did: string[]): Promise<string> {
  const checked = checkTask(input);
  if (!checked.ok) return checked.error;
  const { data, error } = await db.from("client_tasks").insert({ ...checked.task, created_by: userId }).select("id,title,due_date,client_id").single();
  if (error) return `The task was not added: ${error.message}`;
  did.push(`Task added: ${data.title} (due ${data.due_date})`);
  return JSON.stringify({ added: data });
}

async function remember(db: Db, userId: string, input: unknown, today: string, did: string[]): Promise<string> {
  const note = typeof (input as { note?: unknown })?.note === "string" ? (input as { note: string }).note.trim().slice(0, 1000) : "";
  if (!note) return "Nothing to remember: the note is empty.";
  const { data: row, error: readError } = await db.from("assistant_knowledge").select("body").eq("key", "company").maybeSingle();
  if (readError) return `Could not save: ${readError.message}`;
  const body = `${(row?.body ?? "").trimEnd()}\n- ${today}: ${note}`.trimStart();
  const { error } = await db.from("assistant_knowledge").upsert({ key: "company", body, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) return `Could not save: ${error.message}`;
  did.push(`Remembered: ${note}`);
  return "Saved to the company knowledge.";
}

function showInHub(input: unknown, links: HubLink[]): string {
  const checked = checkLink(input);
  if (!checked.ok) return checked.error;
  if (!links.some((l) => l.path === checked.link.path)) links.push(checked.link);
  return "A button to it is shown under your answer.";
}

/** One question to the Hub assistant. It reads the Hub with the signed-in person's own rights, so it sees what they may see. */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: ChatMessage[]; page?: string }) => ({
    messages: cleanMessages(input?.messages),
    page: typeof input?.page === "string" ? input.page.slice(0, 200) : null,
  }))
  .handler(async ({ data, context }): Promise<AssistantReply> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, reason: "no_key", message: "The assistant has no Claude API key yet. Add the secret ANTHROPIC_API_KEY in Lovable Cloud → Secrets." };

    const db = context.supabase as Db;
    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", context.userId);
    if (!roles?.length) return { ok: false, reason: "not_staff", message: "Only team members can use the assistant." };

    const today = brusselsToday();
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Brussels" }).format(new Date());
    const { data: knowledge } = await db.from("assistant_knowledge").select("body").eq("key", "company").maybeSingle();
    const system = systemPrompt({ today, weekday, knowledge: knowledge?.body ?? "", page: data.page, userEmail: (context.claims as { email?: string })?.email ?? null });

    const headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
    const messages: { role: "user" | "assistant"; content: unknown }[] = [...data.messages];
    const did: string[] = [];
    const links: HubLink[] = [];

    try {
      const model = await pickModel(headers);
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await fetch(`${API}/messages`, { method: "POST", headers, body: JSON.stringify({ model, max_tokens: 2000, system, tools: TOOLS, messages }) });
        if (res.status === 401 || res.status === 403) throw new KeyError();
        if (!res.ok) {
          const detail = await res.json().then((j) => j?.error?.message as string | undefined, () => undefined);
          throw new Error(res.status === 429 || res.status === 529 ? "Claude is busy right now. Try again in a moment." : `Claude answered with an error (${res.status})${detail ? `: ${detail}` : ""}.`);
        }
        const reply = (await res.json()) as { content: Block[]; stop_reason: string };
        const text = reply.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
        if (reply.stop_reason !== "tool_use") {
          return { ok: true, text: text || "I have no answer to that.", did, links };
        }
        messages.push({ role: "assistant", content: reply.content });
        const results = [];
        for (const b of reply.content.filter((x) => x.type === "tool_use")) {
          const out =
            b.name === "read_table" ? await readTable(db, b.input)
            : b.name === "create_task" ? await createTask(db, context.userId, b.input, did)
            : b.name === "remember" ? await remember(db, context.userId, b.input, today, did)
            : b.name === "show_in_hub" ? showInHub(b.input, links)
            : `Unknown tool ${b.name}.`;
          results.push({ type: "tool_result", tool_use_id: b.id, content: out });
        }
        messages.push({ role: "user", content: results });
      }
      return { ok: true, text: "I needed more look-ups than I am allowed for one question. Ask it in smaller parts and I will get there.", did, links };
    } catch (e) {
      if (e instanceof KeyError) return { ok: false, reason: "bad_key", message: "Claude refused the API key. Check the secret ANTHROPIC_API_KEY in Lovable Cloud → Secrets." };
      console.error("[assistant]", e);
      const done = did.length ? ` Before that happened, this was done: ${did.join("; ")}.` : "";
      return { ok: false, reason: "error", message: (e instanceof Error ? e.message : "Something went wrong.") + done };
    }
  });
