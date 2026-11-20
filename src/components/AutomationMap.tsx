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
export type HealthMap = Record<
  string,
  { status: "ok" | "stale" | "unknown"; detail: string | null; checked_at: string }
>;
/** ok: true = ran on time, false = too long quiet or failed, null = cannot tell. The hourly check wins over the page's own guess. */
const state = (a: Automation, proof: Proof, health?: HealthMap) => {
  const p = a.proof ? proof[a.proof] : undefined;
  const h = health?.[a.id];
  const ok = h
    ? h.status === "ok"
      ? true
      : h.status === "stale"
        ? false
        : null
    : a.proof
      ? fresh(p?.at, a.rhythm)
      : null;
  return { ok, last: ago(p?.at), note: p?.note, check: h?.detail ?? null };
};
const dotClass = (ok: boolean | null) =>
  ok === false
    ? "bg-amber-500"
    : ok === null
      ? "bg-muted-foreground/50"
      : "bg-emerald-500 automap-pulse";

type Wire = { d: string; auto: string; hue: number };

/** Measures the node ports inside `box` and draws a bezier per source→automation and automation→outcome. */
function useWires(box: React.RefObject<HTMLDivElement | null>, minBend: number) {
  const [wires, setWires] = useState<Wire[]>([]);
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
      const k = Math.max(minBend, (b.x - a.x) * 0.5);
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
  }, [box, minBend]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, box]);
  return wires;
}

/** Sources → automations → outcomes, drawn as a node canvas with live wires: roomy on desktop, icon-only sides on phones. */
export function AutomationMap({ proof, health }: { proof: Proof; health?: HealthMap }) {
  const box = useRef<HTMLDivElement>(null);
  const phoneBox = useRef<HTMLDivElement>(null);
  const wires = useWires(box, 40);
  const phoneWires = useWires(phoneBox, 8);
  const [hover, setFocus] = useState<string | null>(null); // "a:id" | "s:id" | "t:id"
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = pinned ?? hover;

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
  const wireOn = (w: Wire) =>
    litAuto.has(w.auto) && (!focus || !focus.startsWith("a:") || focus === `a:${w.auto}`);

  return (
    <>
      {/* desktop canvas */}
      <div
        ref={box}
        className="hidden md:grid relative grid-cols-[minmax(150px,1fr)_minmax(260px,1.5fr)_minmax(150px,1fr)] gap-x-20 lg:gap-x-28 rounded-3xl border border-border p-6 lg:p-8 overflow-hidden automap-grid"
        onMouseLeave={() => setFocus(null)}
      >
        <Wires wires={wires} on={wireOn} />

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
              st = state(a, proof, health),
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
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(st.ok)}`} />
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
                    {st.check ? (
                      <>
                        <br />
                        <span className={st.ok === false ? "text-amber-500" : ""}>
                          Controle: {st.check}
                        </span>
                      </>
                    ) : null}
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

      {/* phone canvas: same map, sources and outcomes as icons */}
      <div className="md:hidden space-y-2">
        <div
          ref={phoneBox}
          className="relative grid grid-cols-[40px_minmax(0,1fr)_40px] gap-x-6 rounded-3xl border border-border p-2.5 overflow-hidden automap-grid"
        >
          <Wires wires={phoneWires} on={wireOn} thin />
          <div className="flex flex-col justify-center gap-2">
            {SOURCES.map((s) => (
              <IconNode
                key={s.id}
                id={`s:${s.id}`}
                icon={SRC_ICON[s.id]}
                label={s.name}
                port="r"
                dim={!litSrc(s.id)}
                active={pinned === `s:${s.id}`}
                onTap={() => toggle(`s:${s.id}`)}
              />
            ))}
          </div>
          <div className="flex flex-col justify-center gap-1.5 min-w-0">
            {LIVE.map((a, i) => {
              const I = AUTO_ICON[a.id] ?? Workflow,
                st = state(a, proof, health),
                h = hue(i);
              return (
                <button
                  key={a.id}
                  type="button"
                  data-node={`a:${a.id}`}
                  onClick={() => toggle(`a:${a.id}`)}
                  aria-pressed={pinned === `a:${a.id}`}
                  className={`relative z-10 w-full min-w-0 text-left rounded-xl border bg-card/95 backdrop-blur px-2 py-1.5 transition-opacity duration-200 active:scale-[0.98] ${lit(a) ? "opacity-100" : "opacity-25"} ${pinned === `a:${a.id}` ? "border-foreground/50" : "border-border"}`}
                >
                  <PortDot side="l" h={h} />
                  <PortDot side="r" h={h} />
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="grid place-items-center w-6 h-6 rounded-lg shrink-0"
                      style={{ background: `hsl(${h} 70% 50% / 0.16)`, color: `hsl(${h} 80% 65%)` }}
                    >
                      <I className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(st.ok)}`} />
                        <span className="text-[12px] font-medium leading-tight truncate">
                          {a.name}
                        </span>
                      </span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {a.when}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col justify-center gap-2">
            {TARGETS.map((t) => (
              <IconNode
                key={t.id}
                id={`t:${t.id}`}
                icon={TGT_ICON[t.id]}
                label={t.name}
                port="l"
                dim={!litTgt(t.id)}
                active={pinned === `t:${t.id}`}
                onTap={() => toggle(`t:${t.id}`)}
              />
            ))}
          </div>
        </div>
        <PhoneDetail
          pinned={pinned}
          proof={proof}
          health={health}
          onClose={() => setPinned(null)}
        />
      </div>
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

function Wires({ wires, on, thin }: { wires: Wire[]; on: (w: Wire) => boolean; thin?: boolean }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
      {wires.map((w, i) => (
        <g key={i} style={{ opacity: on(w) ? 1 : 0.07, transition: "opacity 200ms" }}>
          <path
            d={w.d}
            fill="none"
            stroke={`hsl(${w.hue} 70% 55% / 0.35)`}
            strokeWidth={thin ? 1.5 : 2}
          />
          <path
            d={w.d}
            fill="none"
            stroke={`hsl(${w.hue} 80% 62%)`}
            strokeWidth={thin ? 1.5 : 2}
            strokeLinecap="round"
            className="automap-flow"
          />
        </g>
      ))}
    </svg>
  );
}
function IconNode({
  id,
  icon: I,
  label,
  port,
  dim,
  active,
  onTap,
}: {
  id: string;
  icon: Icon;
  label: string;
  port: "l" | "r";
  dim: boolean;
  active: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      data-node={id}
      onClick={onTap}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`relative z-10 grid place-items-center w-10 h-10 rounded-xl border bg-card/95 backdrop-blur transition-opacity duration-200 active:scale-95 ${active ? "border-foreground/50" : "border-border"} ${dim ? "opacity-25" : "opacity-100"}`}
    >
      <PortDot side={port} />
      <I className="w-4 h-4" />
    </button>
  );
}
/** Under the phone canvas: what the tapped block is and how it is wired, in words. */
function PhoneDetail({
  pinned,
  proof,
  health,
  onClose,
}: {
  pinned: string | null;
  proof: Proof;
  health?: HealthMap;
  onClose: () => void;
}) {
  if (!pinned)
    return (
      <p className="text-xs text-muted-foreground px-1">
        Tik op een blok of een icoon om te zien wat het doet en waaraan het vastzit.
      </p>
    );
  const [kind, id] = [pinned.slice(0, 1), pinned.slice(2)];
  const name = (list: { id: string; name: string }[], x: string) =>
    list.find((y) => y.id === x)?.name ?? x;
  if (kind === "a") {
    const i = LIVE.findIndex((a) => a.id === id),
      a = LIVE[i];
    if (!a) return null;
    const I = AUTO_ICON[a.id] ?? Workflow,
      st = state(a, proof, health),
      h = hue(i);
    return (
      <div className="rounded-2xl border border-border bg-card p-3" aria-live="polite">
        <div className="flex items-center gap-2.5">
          <span
            className="grid place-items-center w-8 h-8 rounded-xl shrink-0"
            style={{ background: `hsl(${h} 70% 50% / 0.16)`, color: `hsl(${h} 80% 65%)` }}
          >
            <I className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm">{a.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {a.when}
              {st.last ? ` · ${st.last}` : st.note ? ` · ${st.note}` : ""} · {a.runs}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground px-2 h-8"
          >
            Sluit
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-snug">{a.what}</p>
        {st.check && (
          <p
            className={`text-xs mt-1.5 leading-snug ${st.ok === false ? "text-amber-500" : "text-muted-foreground"}`}
          >
            Laatste controle: {st.check}
          </p>
        )}
        {a.yours && (
          <p className="text-xs mt-1.5 leading-snug">
            <span className="font-medium">Jij: </span>
            {a.yours}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {a.from.map((x) => (
            <Chip key={x} icon={SRC_ICON[x]} label={name(SOURCES, x)} />
          ))}
          <span className="text-muted-foreground text-xs">→</span>
          {a.to.map((x) => (
            <Chip key={x} icon={TGT_ICON[x]} label={name(TARGETS, x)} />
          ))}
        </div>
      </div>
    );
  }
  const src = kind === "s",
    node = (src ? SOURCES : TARGETS).find((x) => x.id === id);
  if (!node) return null;
  const I = src ? SRC_ICON[id as Source] : TGT_ICON[id as Target];
  const autos = LIVE.filter((a) =>
    src ? a.from.includes(id as Source) : a.to.includes(id as Target),
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-3" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-8 h-8 rounded-xl bg-muted shrink-0">
          <I className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">{node.name}</div>
          <div className="text-[11px] text-muted-foreground">{node.note}</div>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground px-2 h-8">
          Sluit
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {src ? "Wordt gebruikt door" : "Krijgt iets van"} {autos.length} automation
        {autos.length === 1 ? "" : "s"}:
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {autos.map((a) => (
          <Chip key={a.id} icon={AUTO_ICON[a.id] ?? Workflow} label={a.name} />
        ))}
      </div>
    </div>
  );
}
