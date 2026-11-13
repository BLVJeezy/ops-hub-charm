import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- tiny in-memory stand-in for the Supabase query builder (only what the scheduler uses) ----
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let rows: Row[] = [];
let nextNumber = 100;

function builder() {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "update" | "insert" = "select";
  let patch: Row = {};
  let inserted: Row | null = null;
  let wantSingle = false;
  const b: any = {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    select() {
      return b;
    },
    eq(c: string, v: unknown) {
      filters.push((r) => r[c] === v);
      return b;
    },
    in(c: string, v: unknown[]) {
      filters.push((r) => v.includes(r[c]));
      return b;
    },
    lte(c: string, v: string) {
      filters.push((r) => r[c] != null && r[c] <= v);
      return b;
    },
    lt(c: string, v: string) {
      filters.push((r) => r[c] != null && r[c] < v);
      return b;
    },
    not(c: string, _op: string, _v: null) {
      filters.push((r) => r[c] != null);
      return b;
    },
    or(expr: string) {
      const stale = expr.split("schedule_locked_at.lt.")[1];
      filters.push((r) => r.schedule_locked_at == null || r.schedule_locked_at < stale);
      return b;
    },
    update(p: Row) {
      op = "update";
      patch = p;
      return b;
    },
    insert(p: Row) {
      op = "insert";
      inserted = { id: `new-${nextNumber}`, invoice_number: nextNumber++, ...p };
      return b;
    },
    single() {
      wantSingle = true;
      return b;
    },
    then(resolve: (v: unknown) => void) {
      if (op === "insert") {
        rows.push(inserted!);
        return resolve({ data: wantSingle ? inserted : [inserted], error: null });
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      resolve({ data: hit.map((r) => ({ ...r })), error: null });
    },
  };
  return b;
}
const db = { from: () => builder() } as never;

// ---- mock the actual sending ----
const sent: string[] = [];
let failFor = new Set<string>();
vi.mock("@/lib/invoice-mail.server", () => ({
  deliverInvoice: vi.fn(async (_db: unknown, id: string) => {
    if (failFor.has(id)) throw new Error("Klant heeft geen e-mailadres");
    sent.push(id);
    const r = rows.find((x) => x.id === id)!;
    r.status = "Sent";
    r.scheduled_send_at = null;
    r.schedule_locked_at = null;
    if (r.repeat_monthly && !r.next_repeat_on) r.next_repeat_on = "2026-12-01";
    return { ok: true };
  }),
}));
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response("{}")),
); // alert emails

const { processScheduledInvoices } = await import("./invoice-scheduler.server");
const NOW = new Date("2026-11-01T09:00:00Z"); // 10:00 in Brussels

beforeEach(() => {
  rows = [];
  sent.length = 0;
  failFor = new Set();
  nextNumber = 100;
});

describe("scheduled one-off invoices", () => {
  it("sends drafts due today or earlier, not future ones", async () => {
    rows.push(
      { id: "a", status: "Draft", scheduled_send_at: "2026-11-01", invoice_number: 40 },
      { id: "b", status: "Draft", scheduled_send_at: "2026-10-30", invoice_number: 41 },
      { id: "c", status: "Draft", scheduled_send_at: "2026-11-02", invoice_number: 42 },
      { id: "d", status: "Draft", scheduled_send_at: null, invoice_number: 43 },
    );
    const s = await processScheduledInvoices(db, NOW);
    expect(sent.sort()).toEqual(["a", "b"]);
    expect(s.scheduledSent).toBe(2);
  });

  it("does not send twice when run twice", async () => {
    rows.push({ id: "a", status: "Draft", scheduled_send_at: "2026-11-01", invoice_number: 40 });
    await processScheduledInvoices(db, NOW);
    await processScheduledInvoices(db, NOW);
    expect(sent).toEqual(["a"]);
  });

  it("skips a row another run is currently sending", async () => {
    rows.push({
      id: "a",
      status: "Draft",
      scheduled_send_at: "2026-11-01",
      schedule_locked_at: new Date().toISOString(),
    });
    await processScheduledInvoices(db, NOW);
    expect(sent).toEqual([]);
  });

  it("records the error and keeps the draft for a retry", async () => {
    rows.push({ id: "a", status: "Draft", scheduled_send_at: "2026-11-01", invoice_number: 40 });
    failFor.add("a");
    const s = await processScheduledInvoices(db, NOW);
    expect(s.failed).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "Draft",
      scheduled_send_at: "2026-11-01",
      schedule_error: "Klant heeft geen e-mailadres",
      schedule_locked_at: null,
    });
  });
});

describe("monthly repeats", () => {
  const src = () => ({
    id: "src",
    status: "Sent",
    invoice_number: 39,
    client: "c1",
    client_name: "Riory BV",
    date: "2026-10-01",
    line_items: [{ description: "SEO Oktober 2026", qty: 1, unit_price: 650 }],
    total: 650,
    vat_note: "BTW verlegd",
    repeat_monthly: true,
    repeat_day: 1,
    next_repeat_on: "2026-11-01",
  });

  it("creates a new numbered invoice dated today, advances months, sends it and moves the repeat", async () => {
    rows.push(src());
    const s = await processScheduledInvoices(db, NOW);
    expect(s.repeatsSent).toBe(1);
    const copy = rows.find((r) => r.repeat_parent === "src")!;
    expect(copy).toMatchObject({
      date: "2026-11-01",
      invoice_number: 100,
      status: "Sent",
      repeat_monthly: true,
      total: 650,
    });
    expect(copy.line_items[0].description).toBe("SEO November 2026");
    expect(rows.find((r) => r.id === "src")).toMatchObject({
      repeat_monthly: false,
      next_repeat_on: null,
    });
    expect(sent).toEqual([copy.id]);
  });

  it("only repeats once even if run twice the same day", async () => {
    rows.push(src());
    await processScheduledInvoices(db, NOW);
    await processScheduledInvoices(db, NOW);
    expect(rows.filter((r) => r.repeat_parent)).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("waits until the repeat date", async () => {
    rows.push({ ...src(), next_repeat_on: "2026-11-15" });
    await processScheduledInvoices(db, NOW);
    expect(rows).toHaveLength(1);
  });

  it("does not repeat a draft that was never sent", async () => {
    rows.push({ ...src(), status: "Draft" });
    await processScheduledInvoices(db, NOW);
    expect(rows).toHaveLength(1);
  });

  it("if sending the copy fails, keeps one draft scheduled for retry and no duplicate tomorrow", async () => {
    rows.push(src());
    failFor.add("new-100");
    const s = await processScheduledInvoices(db, NOW);
    expect(s.failed).toHaveLength(1);
    const copy = rows.find((r) => r.id === "new-100")!;
    expect(copy).toMatchObject({
      status: "Draft",
      scheduled_send_at: "2026-11-01",
      repeat_monthly: true,
    });
    // next day: the copy is retried as a scheduled send, the source does not create another copy
    failFor.clear();
    await processScheduledInvoices(db, new Date("2026-11-02T09:00:00Z"));
    expect(rows.filter((r) => r.repeat_parent === "src")).toHaveLength(1);
    expect(sent).toEqual(["new-100"]);
  });
});
