import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserCog,
  Users,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchUsers, updateUserRole, type ApiUser } from "@/lib/users-api";
import { fetchCurrentUser } from "@/lib/me-api";
import { apiFetch } from "@/lib/api";
import { fetchLeaveRequests } from "@/lib/leaves-api";

export const Route = createFileRoute("/roles_permission")({
  component: RolesPermissionsPage,
});

/* ------------------------------------------------------------------ */
/*   Real role & permission model — mirrors backend/apps/accounts and   */
/*   backend/apps/{crm,accounting,hr}/views.py permission classes.      */
/*                                                                      */
/*   Built-in roles map 1:1 to backend permission classes and can't be  */
/*   removed here. Custom roles created on this page (and any write     */
/*   permissions granted to them) are stored locally in the browser —   */
/*   wire `persistRole` / `persistPermissions` up to a real roles API   */
/*   once the backend exposes one, and this becomes the source of truth.*/
/* ------------------------------------------------------------------ */
type RoleDef = { id: string; name: string; builtIn: boolean };

// Every account starts here: creating an account just makes you "a user" on
// the site, nothing more, until an admin assigns a real role. It's built-in
// and protected like the others, and it's the fallback for anyone whose
// profile.role is empty — see `effectiveRoleId` below.
const DEFAULT_ROLE_ID = "user";

const BUILT_IN_ROLE_DEFS: RoleDef[] = [
  { id: "user", name: "User", builtIn: true },
  { id: "admin", name: "Admin", builtIn: true },
  { id: "doctor", name: "Doctor", builtIn: true },
  { id: "radiotherapist", name: "Radiotherapist", builtIn: true },
  { id: "secretary", name: "Secretary", builtIn: true },
  { id: "accountant", name: "Accountant", builtIn: true },
  { id: "hr", name: "HR", builtIn: true },
  { id: "support_client", name: "Support Client", builtIn: true },
  { id: "manager", name: "Manager", builtIn: true },
  { id: "receptionist", name: "Receptionist", builtIn: true },
  { id: "assistant", name: "Assistant", builtIn: true },
];

function effectiveRoleId(u: ApiUser) {
  return u.profile?.role || DEFAULT_ROLE_ID;
}

const HIGH_PRIVILEGE_ROLES = new Set(["admin", "manager"]);

type PermissionState = "allowed" | "denied" | "na";
type ModuleDef = { name: string; hasWrite: boolean };

// hasWrite = false -> read-only module (View for everyone, no write concept)
const MODULES: ModuleDef[] = [
  { name: "Dashboard", hasWrite: false },
  { name: "Patients", hasWrite: true },
  { name: "Appointments", hasWrite: true },
  { name: "Complaints", hasWrite: true },
  { name: "Tickets", hasWrite: true },
  { name: "Employees", hasWrite: true },
  { name: "Leaves & Absences", hasWrite: true },
  { name: "Invoices & Payments", hasWrite: true },
  { name: "CNAM Claims", hasWrite: true },
];

// Default write access for built-in roles — same mapping the previous
// static version encoded, just expressed as editable state now.
const DEFAULT_WRITE_PERMISSIONS: Record<string, string[]> = {
  Patients: ["admin", "doctor", "secretary", "radiotherapist"],
  Appointments: ["admin", "doctor", "secretary", "radiotherapist"],
  Complaints: ["admin", "doctor", "secretary", "radiotherapist"],
  Tickets: ["admin", "support_client", "secretary"],
  Employees: ["admin", "hr"],
  "Leaves & Absences": ["admin", "hr"],
  "Invoices & Payments": ["admin", "accountant"],
  "CNAM Claims": ["admin", "accountant"],
};

// ── Backend-persisted custom roles ──────────────────────────────────────────
// Custom roles are now stored in /api/accounts/custom-roles/ instead of
// localStorage. Built-in roles still come from BUILT_IN_ROLE_DEFS.
type ApiCustomRole = { id: number; name: string; write_permissions: string[] };

function fetchCustomRoles(): Promise<ApiCustomRole[]> {
  return apiFetch<ApiCustomRole[] | { results: ApiCustomRole[] }>("/accounts/custom-roles/").then(
    (data) => (Array.isArray(data) ? data : data.results)
  );
}

function createCustomRole(payload: { name: string; write_permissions: string[] }): Promise<ApiCustomRole> {
  return apiFetch("/accounts/custom-roles/", { method: "POST", body: payload });
}

function deleteCustomRole(id: number): Promise<void> {
  return apiFetch(`/accounts/custom-roles/${id}/`, { method: "DELETE" });
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with hyphens
    .replace(/^-+|-+$/g, "");    // Remove leading/trailing hyphens
}

function permissionsForRole(
  roleId: string,
  writePermissions: Record<string, string[]>,
): Record<string, { view: PermissionState; write: PermissionState }> {
  const result: Record<string, { view: PermissionState; write: PermissionState }> = {};
  for (const mod of MODULES) {
    if (!mod.hasWrite) {
      result[mod.name] = { view: "allowed", write: "na" };
    } else {
      const allowed = (writePermissions[mod.name] ?? []).includes(roleId);
      result[mod.name] = { view: "allowed", write: allowed ? "allowed" : "denied" };
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function displayName(u: ApiUser) {
  return `${u.first_name} ${u.last_name}`.trim() || u.username;
}

function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-muted" strokeWidth={14} />
      {segments.map((segment) => {
        const length = (segment.value / total) * circumference;
        const dashArray = `${length} ${circumference - length}`;
        const dashOffset = -offset;
        offset += length;
        return (
          <circle
            key={segment.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={14}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </svg>
  );
}

function Cell({ state, onClick }: { state: PermissionState; onClick?: () => void }) {
  if (state === "na") return <span className="block text-center text-muted-foreground">—</span>;
  const on = state === "allowed";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`mx-auto flex h-5 w-9 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"} ${ onClick ? "cursor-pointer" : "cursor-default" }`}
      title={onClick ? (on ? "Allowed — click to revoke" : "Denied — click to grant") : on ? "Allowed" : "Denied"}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */
function RolesPermissionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Access Guard ──────────────────────────────────────────────────────────
  // Only admin (profile.role === "admin") and superuser (is_staff === true)
  // may access this page. Everyone else is redirected to /dashboard.
  const meQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
  });

  const isAllowed =
    meQuery.data?.is_staff === true ||
    meQuery.data?.profile?.role === "admin";

  useEffect(() => {
    // Wait until the /me response has loaded before deciding
    if (meQuery.isLoading) return;
    
    if (!isAllowed) {
      toast.error("Accès refusé — réservé aux administrateurs.");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [meQuery.isLoading, isAllowed, navigate]);

  // While checking permissions, show nothing (prevents a brief flash of content).
  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Vérification des droits…
      </div>
    );
  }

  if (!isAllowed) return null;
  // ─────────────────────────────────────────────────────────────────────────

  // Added refetchOnWindowFocus to help keep data fresh if you switch tabs
  const usersQuery = useQuery({ 
    queryKey: ["users"], 
    queryFn: fetchUsers,
    refetchOnWindowFocus: true,
  });
  
  const leavesQuery = useQuery({ 
    queryKey: ["leave-requests"], 
    queryFn: fetchLeaveRequests,
    refetchOnWindowFocus: true,
  });

  // Custom roles come from the backend; built-in roles are always prepended.
  const customRolesQuery = useQuery({
    queryKey: ["custom-roles"],
    queryFn: fetchCustomRoles,
  });

  const apiCustomRoles = customRolesQuery.data ?? [];
  const roleDefs: RoleDef[] = [
    ...BUILT_IN_ROLE_DEFS,
    ...apiCustomRoles.map((r) => ({ id: String(r.id), name: r.name, builtIn: false })),
  ];

  const [writePermissions, setWritePermissions] = useState<Record<string, string[]>>(DEFAULT_WRITE_PERMISSIONS);
  const [selectedRoleId, setSelectedRoleId] = useState("admin");
  const [roleQuery, setRoleQuery] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleModules, setNewRoleModules] = useState<Set<string>>(new Set());
  const [roleToRemove, setRoleToRemove] = useState<RoleDef | null>(null);

  // Custom roles are now persisted to the backend; no localStorage needed.
  const users = usersQuery.data ?? [];
  const isLoading = usersQuery.isLoading;

  const roles = useMemo(
    () => roleDefs.map((r) => ({ ...r, users: users.filter((u) => effectiveRoleId(u) === r.id).length })),
    [roleDefs, users],
  );

  const filteredRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return roles.filter((role) => !q || role.name.toLowerCase().includes(q));
  }, [roles, roleQuery]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];
  const roleUsers = useMemo(
    () => users.filter((u) => effectiveRoleId(u) === selectedRoleId),
    [users, selectedRoleId],
  );

  const departments = useMemo(
    () => Array.from(new Set(roleUsers.map((u) => u.profile?.department).filter((d): d is string => Boolean(d)))),
    [roleUsers],
  );

  const matrix = useMemo(() => permissionsForRole(selectedRoleId, writePermissions), [selectedRoleId, writePermissions]);

  const distribution = useMemo(() => {
    let allowed = 0;
    let denied = 0;
    let na = 0;
    for (const mod of MODULES) {
      const cell = matrix[mod.name];
      if (cell.view === "allowed") allowed += 1; // view column
      if (cell.write === "allowed") allowed += 1;
      else if (cell.write === "denied") denied += 1;
      else na += 1;
    }
    return { allowed, denied, na, total: allowed + denied + na };
  }, [matrix]);

  const pendingLeaves = (leavesQuery.data ?? []).filter((l) => l.statut === "En attente").length;

  const recentUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.date_joined).getTime() - new Date(a.date_joined).getTime()).slice(0, 4),
    [users],
  );

  const assignMutation = useMutation({
    mutationFn: () => updateUserRole(Number(assignUserId), selectedRoleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Role updated");
      setAssignOpen(false);
      setAssignUserId("");
    },
    onError: () => toast.error("Couldn't update the user's role — admin access required"),
  });

  function assignUser(event: FormEvent) {
    event.preventDefault();
    if (!assignUserId) return;
    assignMutation.mutate();
  }

  function toggleWritePermission(moduleName: string, roleId: string) {
    setWritePermissions((prev) => {
      const current = new Set(prev[moduleName] ?? []);
      if (current.has(roleId)) {
        current.delete(roleId);
      } else {
        current.add(roleId);
      }
      return { ...prev, [moduleName]: Array.from(current) };
    });
  }

  function toggleNewRoleModule(moduleName: string) {
    setNewRoleModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleName)) next.delete(moduleName);
      else next.add(moduleName);
      return next;
    });
  }

  const addRoleMutation = useMutation({
    mutationFn: (payload: { name: string; write_permissions: string[] }) => createCustomRole(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      setSelectedRoleId(String(created.id));
      setAddRoleOpen(false);
      setNewRoleName("");
      setNewRoleModules(new Set());
      toast.success(`Rôle "${created.name}" créé`);
    },
    onError: () => toast.error("Impossible de créer le rôle"),
  });

  function submitAddRole(event: FormEvent) {
    event.preventDefault();
    const name = newRoleName.trim();
    if (!name) {
      toast.error("Donnez un nom au rôle");
      return;
    }
    if (roleDefs.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Un rôle avec ce nom existe déjà");
      return;
    }
    addRoleMutation.mutate({ name, write_permissions: Array.from(newRoleModules) });
  }

  function requestRemoveRole(role: RoleDef, event?: React.MouseEvent) {
    event?.stopPropagation();
    setRoleToRemove(role);
  }

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => deleteCustomRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      if (roleToRemove && selectedRoleId === String(roleToRemove.id)) {
        setSelectedRoleId("admin");
      }
      toast.success(`Rôle "${roleToRemove?.name}" supprimé`);
      setRoleToRemove(null);
    },
    onError: () => toast.error("Impossible de supprimer le rôle"),
  });

  function confirmRemoveRole() {
    if (!roleToRemove) return;
    // Built-in roles have string ids like "admin"; custom ones have numeric ids from the DB.
    const numericId = Number(roleToRemove.id);
    if (!isNaN(numericId) && numericId > 0) {
      deleteRoleMutation.mutate(numericId);
    } else {
      // Should never happen — built-in roles have builtIn:true and the UI prevents deletion.
      toast.error("Les rôles intégrés ne peuvent pas être supprimés.");
    }
  }

  const writeCapableModules = MODULES.filter((m) => m.hasWrite);
  const removeUsersBlocking = roleToRemove
    ? users.filter((u) => effectiveRoleId(u) === roleToRemove.id).length
    : 0;

  const pct = (value: number) => Math.round((value / distribution.total) * 100);

  return (
    <AppShell
      title="Roles & Permissions"
      actions={
        <div className="flex items-center gap-2">
          {/* REFRESH BUTTON ADDED HERE */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["users"] });
              queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
            }}
            disabled={usersQuery.isFetching || leavesQuery.isFetching}
          >
            {(usersQuery.isFetching || leavesQuery.isFetching) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Refresh Data</span>
          </Button>
          <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Add Role
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={submitAddRole} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Create a new role</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role name</label>
                  <Input
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Lab Technician"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Write access</label>
                  <p className="text-xs text-muted-foreground">
                    View access is available to every role by default. Choose which modules this role can create,
                    edit, or delete in.
                  </p>
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-2.5">
                    {writeCapableModules.map((mod) => (
                      <label key={mod.name} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-muted-foreground/40"
                          checked={newRoleModules.has(mod.name)}
                          onChange={() => toggleNewRoleModule(mod.name)}
                        />
                        {mod.name}
                      </label>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddRoleOpen(false);
                      setNewRoleName("");
                      setNewRoleModules(new Set());
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Create role</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserCog className="h-4 w-4" /> Assign Role
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={assignUser} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Assign a role to a user</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Select value={assignUserId} onValueChange={setAssignUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {displayName(u)} ({roleDefs.find((r) => r.id === effectiveRoleId(u))?.name ?? "User"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  Will be set to <span className="font-medium text-foreground">{selectedRole?.name}</span>.
                  Only admins can change roles.
                </p>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={assignMutation.isPending}>
                    {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Assign
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      {/* Remove-role confirmation */}
      <Dialog open={roleToRemove !== null} onOpenChange={(open) => !open && setRoleToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove "{roleToRemove?.name}"?</DialogTitle>
          </DialogHeader>
          {roleToRemove?.builtIn ? (
            <p className="text-sm text-muted-foreground">
              {roleToRemove.id === DEFAULT_ROLE_ID
                ? "\"User\" is the default every account gets before an admin assigns something more specific — it can't be removed."
                : "This is a built-in role that mirrors a backend permission class — it can't be removed here."}
            </p>
          ) : removeUsersBlocking > 0 ? (
            <p className="text-sm text-muted-foreground">
              This role still has <span className="font-medium text-foreground">{removeUsersBlocking}</span> user
              {removeUsersBlocking === 1 ? "" : "s"} assigned to it. Reassign them to a different role first, then
              come back to remove this one.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              This will delete the role and its permission entries. This can't be undone, but it won't affect users —
              none are currently assigned to it.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleToRemove(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(roleToRemove?.builtIn) || removeUsersBlocking > 0}
              onClick={confirmRemoveRole}
            >
              <Trash2 className="h-4 w-4" /> Remove role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users & roles...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stat summary row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Shield} iconClass="bg-blue-100 text-blue-600" label="Total Roles" value={roles.length} sub="Built-in + custom" />
            <StatCard icon={Users} iconClass="bg-violet-100 text-violet-600" label="Active Users" value={users.filter((u) => u.is_active).length} sub={`${users.length} total accounts`} />
            <StatCard
              icon={ShieldAlert}
              iconClass="bg-emerald-100 text-emerald-600"
              label="High Privilege Roles"
              value={roles.filter((r) => HIGH_PRIVILEGE_ROLES.has(r.id) && r.users > 0).length}
              sub="Admin & Manager"
            />
            <StatCard icon={Users} iconClass="bg-amber-100 text-amber-600" label="Pending Leave Requests" value={pendingLeaves} sub="Awaiting approval" />
          </div>

          {/* Main 3-column workspace */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr_320px]">
            {/* Roles list */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Roles</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setAddRoleOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)} placeholder="Search roles..." className="pl-9" />
                </div>
                <div className="space-y-1">
                  {filteredRoles.map((role) => {
                    const active = role.id === selectedRole?.id;
                    return (
                      <div
                        key={role.id}
                        className={`group flex w-full items-center justify-between rounded-md border p-2.5 text-left transition-colors ${
                          active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted"
                        }`}
                      >
                        <button type="button" onClick={() => setSelectedRoleId(role.id)} className="flex flex-1 items-center gap-2.5 text-left">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium">
                            {initialsOf(role.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium leading-tight">{role.name}</p>
                              {!role.builtIn && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px] leading-4">
                                  Custom
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{role.users} users</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => requestRemoveRole(role, e)}
                          title="Remove role"
                          className="ml-1 shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {filteredRoles.length === 0 && (
                    <p className="p-2.5 text-xs text-muted-foreground">No roles match "{roleQuery}".</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Permissions matrix */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Permissions for</CardTitle>
                  <Badge variant="outline" className="font-medium">{selectedRole?.name ?? "No role selected"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="p-3 text-left font-medium text-muted-foreground">Module</th>
                        <th className="p-3 text-center font-medium text-muted-foreground">View</th>
                        <th className="p-3 text-center font-medium text-muted-foreground">Create / Edit / Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map((mod) => (
                        <tr key={mod.name} className="border-b last:border-0">
                          <td className="p-3 font-medium">{mod.name}</td>
                          <td className="p-3"><Cell state={matrix[mod.name].view} /></td>
                          <td className="p-3">
                            <Cell
                              state={matrix[mod.name].write}
                              onClick={
                                mod.hasWrite && selectedRole
                                  ? () => toggleWritePermission(mod.name, selectedRole.id)
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click a toggle to grant or revoke write access for this role. View access is available to every
                  role, and Dashboard stays read-only for everyone. Changes save to this browser — connect a roles
                  API to sync them to the backend permission classes.
                </p>
              </CardContent>
            </Card>

            {/* Role details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Role Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{selectedRole?.name ?? "No role selected"}</p>
                        {selectedRole && HIGH_PRIVILEGE_ROLES.has(selectedRole.id) && (
                          <Badge variant="destructive" className="text-[10px]">High privilege</Badge>
                        )}
                        {selectedRole && !selectedRole.builtIn && (
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedRole?.builtIn ? "Built-in — mirrors a backend permission class" : "Created on this page"}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Assigned Users ({roleUsers.length})</p>
                  {roleUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No users currently have this role.</p>
                  ) : (
                    <div className="flex flex-wrap -space-x-2">
                      {roleUsers.slice(0, 8).map((u) => (
                        <div
                          key={u.id}
                          title={displayName(u)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium"
                        >
                          {initialsOf(displayName(u))}
                        </div>
                      ))}
                      {roleUsers.length > 8 && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium text-muted-foreground">
                          +{roleUsers.length - 8}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {departments.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Departments</p>
                    <div className="flex flex-wrap gap-1.5">
                      {departments.map((d) => (
                        <Badge key={d} variant="outline">{d}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Button className="w-full" variant="outline" onClick={() => setAssignOpen(true)}>
                  <UserCog className="h-4 w-4" /> Assign a user to this role
                </Button>
                {selectedRole && (
                  <Button
                    className="w-full text-destructive hover:text-destructive"
                    variant="outline"
                    onClick={() => requestRemoveRole(selectedRole)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove this role
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Permission Distribution</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6 p-4 pt-0">
                <div className="relative shrink-0">
                  <Donut
                    segments={[
                      { label: "Allowed", value: distribution.allowed, color: "#2563eb" },
                      { label: "Denied", value: distribution.denied, color: "#c7d2fe" },
                      { label: "Not applicable", value: distribution.na, color: "#e5e7eb" },
                    ]}
                  />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-semibold">{distribution.total}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                    <span className="text-muted-foreground">Allowed</span>
                    <span className="ml-auto font-medium">{pct(distribution.allowed)}% ({distribution.allowed})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-200" />
                    <span className="text-muted-foreground">Denied</span>
                    <span className="ml-auto font-medium">{pct(distribution.denied)}% ({distribution.denied})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                    <span className="text-muted-foreground">Not Applicable</span>
                    <span className="ml-auto font-medium">{pct(distribution.na)}% ({distribution.na})</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recently Added Users</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                {recentUsers.length === 0 && <p className="text-sm text-muted-foreground">No users yet.</p>}
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {initialsOf(displayName(u))}
                    </div>
                    <div>
                      <p className="text-sm leading-snug">{displayName(u)} <span className="text-muted-foreground">— {roleDefs.find((r) => r.id === effectiveRoleId(u))?.name ?? "User"}</span></p>
                      <p className="text-xs text-muted-foreground">{new Date(u.date_joined).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}