import { HEALTH_COLORS } from "@/lib/constants";

export function HealthDot({ health, size = 10 }: { health?: string | null; size?: number }) {
  const color = HEALTH_COLORS[health || "Not set"] || HEALTH_COLORS["Not set"];
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
      title={health || "Not set"}
    />
  );
}
