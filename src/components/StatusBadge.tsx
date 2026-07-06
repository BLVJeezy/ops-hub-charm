import { STATUS_COLORS, STAGE_COLORS, ACTION_STATUS_COLORS } from "@/lib/constants";

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const color = STATUS_COLORS[status || "Prospect"] || "#B7BCC2";
  return <Badge color={color}>{status || "Prospect"}</Badge>;
}
export function StageBadge({ stage }: { stage?: string | null }) {
  const color = STAGE_COLORS[stage || "Found"] || "#B7BCC2";
  return <Badge color={color}>{stage || "Found"}</Badge>;
}
export function ActionStatusBadge({ status }: { status?: string | null }) {
  const color = ACTION_STATUS_COLORS[status || "Planned"] || "#94A3B8";
  return <Badge color={color}>{status || "Planned"}</Badge>;
}
