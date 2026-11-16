import { useEffect, useRef, useState } from "react";
import type { BrainNeuron } from "@/components/BrainCanvas";

/** Logo for a client: a file in /public/logos named after the client id ("core" for Solyn). */
const logoUrl = (key: string) => `/logos/${key}.png`;
const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Emblem({ id, label, color, size, dim }: { id: string; label: string; color: string; size: number; dim?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="relative grid place-items-center rounded-full" style={{
      width: size, height: size,
      // metal rim in the client's colour, like a perk medal
      background: `conic-gradient(from 210deg, ${color}, #ffffff 18%, ${color} 38%, #0b0f1e 62%, ${color} 84%, ${color})`,
      boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 0 ${size * 0.35}px ${color}55, 0 10px 30px rgba(0,0,0,0.6)`,
      opacity: dim ? 0.6 : 1,
    }}>
      <span className="grid place-items-center rounded-full overflow-hidden" style={{ width: size - 8, height: size - 8, background: "radial-gradient(circle at 35% 28%, #1b2340, #05070f 75%)", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.8)" }}>
        {broken ? (
          <span className="font-semibold" style={{ color, fontSize: size * 0.3, letterSpacing: "-0.02em", textShadow: `0 0 14px ${color}88` }}>{initials(label)}</span>
        ) : (
          <img src={logoUrl(id)} alt="" draggable={false} onError={() => setBroken(true)} className="w-full h-full object-cover" />
        )}
      </span>
    </span>
  );
}

/** Solyn in the middle, every client evenly spread on one circle, each tied to the centre with a line. */
export function PerkRing({ neurons, coreLabel, coreValue, selected, onSelect }: {
  neurons: BrainNeuron[]; coreLabel: string; coreValue: string; selected: string | null; onSelect: (key: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const n = Math.max(1, neurons.length);
  // the label hangs under each medal, so the circle sits a little above the middle
  const cx = w / 2, cy = h / 2 - 18;
  const small = w < 520;
  const R = Math.max(60, Math.min((w / 2 - (small ? 30 : 56)) / 1.18, (h / 2 - 34) / 1.18));
  // medals as large as the circle allows without touching each other
  const perk = Math.round(Math.max(44, Math.min(R * 0.36, (2 * Math.PI * R) / n * 0.62, 132)));
  const core = Math.round(Math.max(72, Math.min(R * 0.62, 210)));
  const at = (i: number) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a }; };

  return (
    <div ref={box} className="absolute inset-0 select-none" onClick={() => onSelect(null)}>
      {w > 0 && (
        <>
          <svg className="absolute inset-0 w-full h-full" aria-hidden>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(160,190,255,0.10)" strokeWidth={1} strokeDasharray="2 7" />
            {neurons.map((p, i) => {
              const q = at(i), on = selected === p.key, off = selected && !on;
              const x1 = cx + Math.cos(q.a) * (core / 2 + 4), y1 = cy + Math.sin(q.a) * (core / 2 + 4);
              const x2 = q.x - Math.cos(q.a) * (perk / 2 + 2), y2 = q.y - Math.sin(q.a) * (perk / 2 + 2);
              return (
                <g key={p.key} style={{ opacity: off ? 0.25 : p.dim ? 0.75 : 1, transition: "opacity 200ms ease" }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.color} strokeOpacity={0.28} strokeWidth={on ? 3 : 1.5} strokeDasharray={p.dim ? "3 6" : undefined} />
                  {!p.dim && <line className="perk-flow" x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.color} strokeWidth={on ? 3 : 2} strokeLinecap="round" strokeDasharray="10 46" style={{ filter: `drop-shadow(0 0 4px ${p.color})`, animationDelay: `${-i * 0.37}s` }} />}
                </g>
              );
            })}
          </svg>

          <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: cx, top: cy }}>
            <Emblem id="core" label={coreLabel} color="#D8B45A" size={core} />
            <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ top: core + 6 }}>
              <div className="text-sm font-semibold text-white">{coreLabel}</div>
              <div className="text-xs text-white/60 money">{coreValue}</div>
            </div>
          </div>

          {neurons.map((p, i) => {
            const q = at(i), on = selected === p.key, off = selected && !on;
            return (
              <button key={p.key} type="button" aria-pressed={on} aria-label={`${p.label}, ${p.value}`}
                onClick={(e) => { e.stopPropagation(); onSelect(on ? null : p.key); }}
                className="perk absolute rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ left: q.x, top: q.y, opacity: off ? 0.4 : 1, transform: `translate(-50%,-50%) scale(${on ? 1.12 : 1})` }}>
                <Emblem id={p.key} label={p.label} color={p.color} size={perk} dim={p.dim} />
                {p.alert && <span className="absolute right-0 top-0 w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-[#05070f]" />}
                {p.badge ? <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-white text-black text-[11px] font-semibold grid place-items-center">{p.badge}</span> : null}
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none" style={{ top: perk + 6 }}>
                  <span className={`block font-medium text-white/90 ${small ? "text-[10px] max-w-[76px] truncate" : "text-[13px]"}`}>{p.label}</span>
                  {(!small || on) && <span className="block text-[11px] money" style={{ color: p.color }}>{p.value}</span>}
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
