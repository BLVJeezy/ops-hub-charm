export type Role = "admin" | "sales" | "ops" | "member";

/** Hub staff see the whole Hub; members only their own portal at /team. */
export function isStaffRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "sales" || role === "ops";
}

export function canEditClient(role: Role | null | undefined, _status?: string | null): boolean {
  // Any signed-in team member can edit client details; database rules stay authoritative.
  return role === "admin" || role === "sales" || role === "ops";
}

export function canEditActions(role: Role | null | undefined, _status?: string | null): boolean {
  return role === "admin" || role === "sales" || role === "ops";
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "admin";
}
