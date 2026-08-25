// src/lib/permissions-api.ts
import { apiFetch } from "./api";

export type MyPermissions = {
  role: string;
  is_admin: boolean;
  /** Array of module names this user can write to, or ["__all__"] for admins. */
  write_permissions: string[];
};

export function fetchMyPermissions(): Promise<MyPermissions> {
  return apiFetch<MyPermissions>("/accounts/my-permissions/");
}

/**
 * Given a user's write_permissions list and a module name,
 * returns true if the user can VIEW that route.
 *
 * Logic:
 *  - Admins (__all__) → always true.
 *  - Modules with hasWrite=false → always viewable (Dashboard, Analytics, etc.)
 *  - Modules with hasWrite=true → viewable iff their name is in write_permissions
 *    OR the noview: denial is not set (we check write_permissions from backend
 *    but the noview: filtering is already done server-side in MyPermissionsView).
 */
export function canViewModule(
  permissions: MyPermissions | null | undefined,
  moduleName: string,
  hasWrite: boolean
): boolean {
  if (!permissions) return !hasWrite; 
  if (permissions.is_admin) return true;
  if (permissions.write_permissions.includes("__all__")) return true;
  // Modules without write are always viewable by any authenticated user
  if (!hasWrite) return true;
  // For write-capable modules: viewable only if they have at least read access.
  // The backend strips noview: entries and only returns the accessible modules.
  return permissions.write_permissions.includes(moduleName);
}