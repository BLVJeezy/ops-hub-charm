export type Role = "admin" | "sales" | "ops";

export function canEditClient(role: Role | null | undefined, status?: string | null): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (role === "sales" && (status === "Prospect" || status === "Write-off")) return true;
  if (role === "ops" && (status === "Active" || status === "Paused")) return true;
  return false;
}

export function canEditActions(role: Role | null | undefined, status?: string | null): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (role === "ops" && (status === "Active" || status === "Paused")) return true;
  return false;
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "admin";
}
