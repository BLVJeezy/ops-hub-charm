import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/lib/permissions";

interface Props {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders children only when the current user has one of the allowed roles. */
export function RoleGate({ allow, children, fallback = null }: Props) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!role || !allow.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}

/** Convenience: admin-only wrapper. */
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGate allow={["admin"]} fallback={fallback}>{children}</RoleGate>;
}
