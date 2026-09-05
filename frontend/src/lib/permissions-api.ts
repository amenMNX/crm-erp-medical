// src/lib/permissions-api.ts
import { apiFetch } from "./api";

export type MyPermissions = {
  role: string;
  is_admin: boolean;
  /**
   * Modules this user can CREATE / UPDATE / DELETE, or ["__all__"] for admins.
   * A module being absent here means the user is read-only for that module.
   */
  write_permissions: string[];
  /**
   * Modules this user can at least VIEW (read).
   * Superset of write_permissions.
   * Absent from this list = page is hidden entirely (noview: denial in DB).
   * ["__all__"] for admins.
   *
   * Populated by the backend's MyPermissionsView since 2026-08-25.
   * Falls back gracefully: if the backend hasn't returned this field yet
   * (old server), canViewModule() falls back to the old write_permissions
   * behaviour so nothing breaks during a rolling deploy.
   */
  view_permissions?: string[];
};

export function fetchMyPermissions(): Promise<MyPermissions> {
  return apiFetch<MyPermissions>("/accounts/my-permissions/");
}

/**
 * Returns true if the user can VIEW (navigate to) a route/module.
 *
 * Resolution order:
 *  1. No permissions object yet → read-only modules visible, write-capable hidden.
 *  2. Admin or __all__ sentinel → always true.
 *  3. Module has no write capability (Dashboard, Analytics…) → always visible.
 *  4. Check view_permissions list from the backend.
 *     • If the backend returned view_permissions, use it — this correctly
 *       separates "can see page" from "can mutate data".
 *     • If view_permissions is absent (old backend), fall back to
 *       write_permissions for backwards compatibility.
 *
 * WHY THIS MATTERS:
 *   A role can have view toggled ON and write toggled OFF in the Roles &
 *   Permissions UI.  The backend stores this as: no write entry, no noview:
 *   entry.  The backend now returns the module in view_permissions but NOT in
 *   write_permissions.  This function must check view_permissions to let the
 *   page appear in the sidebar.
 */
export function canViewModule(
  permissions: MyPermissions | null | undefined,
  moduleName: string,
  hasWrite: boolean
): boolean {
  // 1. No data yet — show only non-write modules to avoid flicker
  if (!permissions) return !hasWrite;

  // 2. Admins see everything
  if (permissions.is_admin) return true;
  if (permissions.write_permissions.includes("__all__")) return true;
  if (permissions.view_permissions?.includes("__all__")) return true;

  // 3. Read-only modules (Dashboard, Analytics, Notifications…) are always visible
  if (!hasWrite) return true;

  // 4a. Use view_permissions if the backend returned it (new behaviour)
  if (permissions.view_permissions !== undefined) {
    return permissions.view_permissions.includes(moduleName);
  }

  // 4b. Fallback: old backend — use write_permissions (original behaviour)
  return permissions.write_permissions.includes(moduleName);
}

/**
 * Returns true if the user can WRITE (create / update / delete) in a module.
 *
 * Kept separate from canViewModule so the UI can show a module as read-only
 * (visible in nav, form fields disabled / POST buttons hidden) rather than
 * hiding it entirely.
 */
export function canWriteModule(
  permissions: MyPermissions | null | undefined,
  moduleName: string
): boolean {
  if (!permissions) return false;
  if (permissions.is_admin) return true;
  if (permissions.write_permissions.includes("__all__")) return true;
  return permissions.write_permissions.includes(moduleName);
}