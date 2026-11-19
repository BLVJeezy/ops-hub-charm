/**
 * The clock on a client request. worked_seconds holds the stretches already done;
 * run_started_at is set while the clock runs. Pausing banks the running stretch.
 */
export type Clock = {
  status: string;
  worked_seconds: number | null;
  run_started_at: string | null;
};
type Now = number;

export function workedSeconds(c: Clock, now: Now = Date.now()): number {
  const banked = Math.max(0, c.worked_seconds ?? 0);
  if (!c.run_started_at) return banked;
  return banked + Math.max(0, Math.floor((now - Date.parse(c.run_started_at)) / 1000));
}
export const running = (c: Clock) => !!c.run_started_at;

/** 0:05:09, 3:12:00, or "2d 04:10" once past a day. */
export function clockLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec)),
    d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    x = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d ? `${d}d ${pad(h)}:${pad(m)}` : `${h}:${pad(m)}:${pad(x)}`;
}

/** 90 → "1 uur 30 min"; 30 → "30 min"; 2880 → "2 dagen". */
export function estimateLabel(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null;
  if (min >= 1440 && min % 1440 === 0) return `${min / 1440} ${min === 1440 ? "dag" : "dagen"}`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return [h ? `${h} uur` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}
/** Choices for the estimate in the start dialog, in minutes. */
export const ESTIMATES = [15, 30, 60, 120, 240, 480, 1440, 2880, 7200];

/** What to write to the database for each step. */
export function startPatch(c: Clock, now: Now = Date.now()) {
  const iso = new Date(now).toISOString();
  return {
    status: "bezig",
    run_started_at: iso,
    worked_seconds: Math.max(0, c.worked_seconds ?? 0),
  };
}
export function pausePatch(c: Clock, now: Now = Date.now()) {
  return { status: "gepauzeerd", run_started_at: null, worked_seconds: workedSeconds(c, now) };
}
export function backPatch(c: Clock, now: Now = Date.now()) {
  return { status: "nieuw", run_started_at: null, worked_seconds: workedSeconds(c, now) };
}
export function donePatch(c: Clock, now: Now = Date.now()) {
  return {
    status: "klaar",
    run_started_at: null,
    worked_seconds: workedSeconds(c, now),
    done_at: new Date(now).toISOString(),
  };
}
