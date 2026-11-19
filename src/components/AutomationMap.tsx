import { useCallback, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import {
  AlarmClock,
  Archive,
  BarChart3,
  BellRing,
  BookOpen,
  Calculator,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Clapperboard,
  Database,
  FileText,
  FileVideo,
  GitBranch,
  Globe,
  HardDriveDownload,
  LayoutDashboard,
  ListTodo,
  Mail,
  MapPin,
  Repeat,
  Inbox,
  Link2,
  Send,
  ShieldCheck,
  Stethoscope,
  Sunrise,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";
import {
  ago,
  fresh,
  LIVE,
  SOURCES,
  TARGETS,
  type Automation,
  type Source,
  type Target,
} from "@/lib/automations";

type Icon = ComponentType<{ className?: string }>;
const SRC_ICON: Record<Source, Icon> = {
  sites: Globe,
  invoices: FileText,
  recurring: Repeat,
  costs: Wallet,
  hubdata: Database,
  code: GitBranch,
  maps: MapPin,
  booking: CalendarPlus,
  requests: Link2,
};
const TGT_ICON: Record<Target, Icon> = {
  mailYou: Mail,
  mailClient: Send,
  hub: LayoutDashboard,
  agenda: CalendarDays,
  film: Clapperboard,
  backup: Archive,
  ledger: BookOpen,
};
const AUTO_ICON: Record<string, Icon> = {
  monitor: ShieldCheck,
  invoices: Send,
  tasks: ListTodo,
  backup: HardDriveDownload,
  stats: BarChart3,
  alerts: BellRing,
  reminders: AlarmClock,
  briefing: Sunrise,
  ledger: Calculator,
  progress: TrendingUp,
  reports: FileVideo,
  sitecheck: Stethoscope,
  booking: CalendarCheck,
  requests: Inbox,
};
/** a colour per automation, so you can follow one wire across the map */
const HUES = [160, 200, 265, 30, 340, 120, 185, 45, 290, 215, 0, 95, 245];
const hue = (i: number) => HUES[i % HUES.length];

export type Proof = Partial<
  Record<NonNullable<Automation["proof"]>, { at: string | null; note?: string }>
>;
const state = (a: Automation, proof: Proof) => {
  const p = a.proof ? proof[a.proof] : undefined;
  return { ok: a.proof ? fresh(p?.at, a.rhythm) : null, last: ago(p?.at), note: p?.note };
};

type Wire = { d: string; auto: string; hue: number };

/** Desktop: sources → automations → outcomes, drawn as a node canvas with live wires. Mobile: one chain per automation. */
export function AutomationMap({ proof }: { proof: Proof }) {
  const box = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [hover, setFocus] = useState<string | null>(null); // "a:id" | "s:id" | "t:id"
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = pinned ?? hover;

  const measure = useCallback(() => {
    const root = box.current;
    if (!root || root.offsetParent === null) return;
    const R = root.getBoundingClientRect();
    const port = (sel: string, side: "l" | "r") => {
      const el = root.querySelector<HTMLElement>(`[data-node="${sel}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: (side === "r" ? r.right : r.left) - R.left, y: r.top + r.height / 2 - R.top };
    };
    const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const k = Math.max(40, (b.x - a.x) * 0.5);
      return `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
    };
    const out: Wire[] = [];
    LIVE.forEach((a, i) => {
      const inL = port(`a:${a.id}`, "l"),
        inR = port(`a:${a.id}`, "r");
      if (!inL || !inR) return;
      a.from.forEach((s) => {
        const p = port(`s:${s}`, "r");
        if (p) out.push({ d: curve(p, inL), auto: a.id, hue: hue(i) });
      });
      a.to.forEach((t) => {
        const p = port(`t:${t}`, "l");
        if (p) out.push({ d: curve(inR, p), auto: a.id, hue: hue(i) });
      });
    });
    setWires(out);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const lit = (a: Automation) =>
    !focus ||
    focus === `a:${a.id}` ||
    (focus.startsWith("s:") && a.from.includes(focus.slice(2) as Source)) ||
    (focus.startsWith("t:") && a.to.includes(focus.slice(2) as Target));
  const litAuto = new Set(LIVE.filter(lit).map((a) => a.id));
  const litSrc = (s: Source) =>
    !focus ||
    focus === `s:${s}` ||
    LIVE.some((a) => litAuto.has(a.id) && focus.startsWith("a:") && a.from.includes(s)) ||
    (focus.startsWith("t:") && LIVE.some((a) => litAuto.has(a.id) && a.from.includes(s)));
  const litTgt = (t: Target) =>
    !focus ||
    focus === `t:${t}` ||
    LIVE.some(
      (a) =>
        litAuto.has(a.id) && (focus.startsWith("a:") || focus.startsWith("s:")) && a.to.includes(t),
    );
  const toggle = (k: string) => setPinned((f) => (f === k ? null : k));

  return (
    <>
      {/* desktop canvas */}
      <div
        ref={box}
        className="hidden md:grid relative grid-cols-[minmax(150px,1fr)_minmax(260px,1.5fr)_minmax(150px,1fr)] gap-x-20 lg:gap-x-28 rounded-3xl border border-border p-6 lg:p-8 overflow-hidden automap-grid"
        onMouseLeave={() => setFocus(null)}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {wires.map((w, i) => {
            const on =
              litAuto.has(w.auto) && (!focus || !focus.startsWith("a:") || focus === `a:${w.auto}`);
            return (
              <g key={i} style={{ opacity: on ? 1 : 0.08, transition: "opacity 200ms" }}>
                <path d={w.d} fill="none" stroke={`hsl(${w.hue} 70% 55% / 0.35)`} strokeWidth={2} />
                <path
                  d={w.d}
                  fill="none"
                  stroke={`hsl(${w.hue} 80% 62%)`}
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="automap-flow"
                />
              </g>
            );
          })}
        </svg>

        <Column title="Bronnen">
          {SOURCES.map((s) => {
            const I = SRC_ICON[s.id];
            return (
              <Pill
                key={s.id}
                id={`s:${s.id}`}
                icon={I}
                name={s.name}
                note={s.note}
                dim={!litSrc(s.id)}
                port="r"
                onFocus={() => setFocus(`s:${s.id}`)}
                onTap={() => toggle(`s:${s.id}`)}
              />
            );
          })}
        </Column>

        <Column title="Automations">
          {LIVE.map((a, i) => {
            const I = AUTO_ICON[a.id] ?? Workflow,
              st = state(a, proof),
              h = hue(i);
            return (
              <button
                key={a.id}
                type="button"
                data-node={`a:${a.id}`}
                onMouseEnter={() => setFocus(`a:${a.id}`)}
                onFocus={() => setFocus(`a:${a.id}`)}
                onClick={() => toggle(`a:${a.id}`)}
                className={`relative z-10 w-full text-left rounded-2xl border bg-card/95 backdrop-blur px-3 py-2.5 transition-[opacity,transform,border-color] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${lit(a) ? "opacity-100" : "opacity-25"} ${focus === `a:${a.id}` ? "border-foreground/40" : "border-border"}`}
                title={a.what}
                aria-pressed={pinned === `a:${a.id}`}
              >
                <PortDot side="l" h={h} />
                <PortDot side="r" h={h} />
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid place-items-center w-8 h-8 rounded-xl shrink-0"
                    style={{ background: `hsl(${h} 70% 50% / 0.16)`, color: `hsl(${h} 80% 65%)` }}
                  >
                    <I className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.ok === false ? "bg-amber-500" : "bg-emerald-500 automap-pulse"}`}
                      />
                      <span className="font-medium text-sm leading-tight truncate">{a.name}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {a.when}
                      {st.last ? ` · ${st.last}` : st.note ? ` · ${st.note}` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {a.runs}
                  </span>
                </div>
                {pinned === `a:${a.id}` && (
                  <p className="text-xs text-muted-foreground mt-2 leading-snug">
                    {a.what}
                    {a.yours ? (
                      <>
                        <br />
                        <span className="text-foreground">Jij: </span>
                        {a.yours}
                      </>
                    ) : null}
                  </p>
                )}
              </button>
            );
          })}
        </Column>

        <Column title="Uitkomst">
          {TARGETS.map((t) => {
            const I = TGT_ICON[t.id];
            return (
              <Pill
                key={t.id}
                id={`t:${t.id}`}
                icon={I}
                name={t.name}
                note={t.note}
                dim={!litTgt(t.id)}
                port="l"
                onFocus={() => setFocus(`t:${t.id}`)}
                onTap={() => toggle(`t:${t.id}`)}
              />
            );
          })}
        </Column>
      </div>

      {/* mobile chains */}
      <ul className="md:hidden space-y-2">
        {LIVE.map((a, i) => {
          const I = AUTO_ICON[a.id] ?? Workflow,
            st = state(a, proof),
            h = hue(i);
          return (
            <li key={a.id} className="rounded-2xl border border-border bg-card p-3 automap-grid">
              <div className="flex items-center gap-1.5 flex-wrap">
                {a.from.map((s) => {
                  const S = SRC_ICON[s];
                  return <Chip key={s} icon={S} label={SOURCES.find((x) => x.id === s)!.name} />;
                })}
              </div>
              <Link h={h} />
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/80 px-2.5 py-2">
                <span
                  className="grid place-items-center w-8 h-8 rounded-xl shrink-0"
                  style={{ background: `hsl(${h} 70% 50% / 0.16)`, color: `hsl(${h} 80% 65%)` }}
                >
                  <I className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.ok === false ? "bg-amber-500" : "bg-emerald-500 automap-pulse"}`}
                    />
                    <span className="font-medium text-sm truncate">{a.name}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {a.when}
                    {st.last ? ` · ${st.last}` : st.note ? ` · ${st.note}` : ""}
                  </div>
                </div>
                <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">
                  {a.runs}
                </span>
              </div>
              <Link h={h} />
              <div className="flex items-center gap-1.5 flex-wrap">
                {a.to.map((t) => {
                  const T = TGT_ICON[t];
                  return <Chip key={t} icon={T} label={TARGETS.find((x) => x.id === t)!.name} />;
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center gap-2 min-w-0">
      <div className="text-xs font-medium text-muted-foreground mb-1 px-1">{title}</div>
      {children}
    </div>
  );
}
function Pill({
  id,
  icon: I,
  name,
  note,
  dim,
  port,
  onFocus,
  onTap,
}: {
  id: string;
  icon: Icon;
  name: string;
  note: string;
  dim: boolean;
  port: "l" | "r";
  onFocus: () => void;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      data-node={id}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={onTap}
      className={`relative z-10 flex items-center gap-2.5 rounded-xl border border-border bg-card/95 backdrop-blur px-2.5 py-2 text-left transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dim ? "opacity-25" : "opacity-100"}`}
    >
      <PortDot side={port} />
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-muted shrink-0">
        <I className="w-3.5 h-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight truncate">{name}</span>
        <span className="block text-[11px] text-muted-foreground truncate">{note}</span>
      </span>
    </button>
  );
}
function PortDot({ side, h }: { side: "l" | "r"; h?: number }) {
  return (
    <span
      className={`absolute top-1/2 -translate-y-1/2 ${side === "l" ? "-left-[5px]" : "-right-[5px]"} w-2.5 h-2.5 rounded-full border-2 border-background`}
      style={{
        background:
          h === undefined ? "hsl(var(--muted-foreground, 0 0% 60%))" : `hsl(${h} 80% 62%)`,
      }}
    />
  );
}
function Chip({ icon: I, label }: { icon: Icon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 px-2 py-1 text-[11px]">
      <I className="w-3 h-3" />
      {label}
    </span>
  );
}
function Link({ h }: { h: number }) {
  return (
    <div
      className="ml-6 h-3.5 w-0.5 rounded-full automap-vflow"
      style={{ ["--c" as string]: `hsl(${h} 80% 62%)` }}
    />
  );
}
