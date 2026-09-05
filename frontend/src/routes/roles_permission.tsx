// src/routes/roles_permission.tsx
//
// Dynamic RBAC — every toggle calls PATCH /accounts/role-permissions/{id}/
// and every role assignment calls PATCH /accounts/users/{id}/ (built-in roles)
// or PATCH /hr/employees/{id}/ (custom / job-title roles).
//
// The backend (accounts/permissions.py) re-evaluates write_permissions from
// the DB on every request, so changes take effect on the NEXT API call with
// no server restart or code change needed.

import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Edit2,
  Eye,
  Loader2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
  XCircle,
  Check,
  Zap,
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
import { fetchEmployees, updateEmployee, type ApiEmployee } from "@/lib/employees-api";

export const Route = createFileRoute("/roles_permission")({
  component: RolesPermissionsPage,
});

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Types & Constants                                                           */
/* ──────────────────────────────────────────────────────────────────────────── */

type RoleDef = { id: string; name: string; builtIn: boolean };

// Unified member shape
type RoleMember =
  | { kind: "user"; id: number; name: string; email: string; username: string; is_active: boolean; is_superuser: boolean; raw: ApiUser }
  | { kind: "employee"; id: number; name: string; email: string; username: string; is_active: boolean; is_superuser: false; jobTitle: string; raw: ApiEmployee };

const DEFAULT_ROLE_ID = "user";

const BUILT_IN_ROLE_DEFS: RoleDef[] = [
  { id: "user", name: "User", builtIn: true },
  { id: "admin", name: "Admin", builtIn: true },
  { id: "doctor", name: "Doctor", builtIn: true },
  { id: "secretary", name: "Secretary", builtIn: true },
  { id: "accountant", name: "Accountant", builtIn: true },
  { id: "hr", name: "HR", builtIn: true },
  { id: "support_client", name: "Support Client", builtIn: true },
  { id: "manager", name: "Manager", builtIn: true },
  { id: "receptionist", name: "Receptionist", builtIn: true },
  { id: "assistant", name: "Assistant", builtIn: true },
];

const BUILT_IN_ROLE_IDS = new Set(BUILT_IN_ROLE_DEFS.map((r) => r.id));

function effectiveRoleId(u: ApiUser) {
  if (u.is_superuser) return "admin";
  return u.profile?.role || DEFAULT_ROLE_ID;
}

const HIGH_PRIVILEGE_ROLES = new Set(["admin", "manager"]);

type PermissionState = "allowed" | "denied" | "na";

type ModuleGroup = {
  label: string;
  icon: string;
  modules: ModuleDef[];
};

type ModuleDef = {
  name: string;
  hasWrite: boolean;
  icon: string;
  description: string;
  defaultWriteRoles: string[];
};

// Grouped for bulk operations
const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "CRM — Patient Pathway",
    icon: "🏥",
    modules: [
      { name: "Patients", hasWrite: true, icon: "🧑‍⚕️", description: "Patient records & history", defaultWriteRoles: ["admin", "doctor", "secretary"] },
      { name: "Traitements", hasWrite: true, icon: "⚕️", description: "Treatment plans & sessions", defaultWriteRoles: ["admin", "doctor"] },
      { name: "Protocoles", hasWrite: true, icon: "🔬", description: "Treatment protocols", defaultWriteRoles: ["admin", "doctor"] },
      { name: "Calendrier", hasWrite: true, icon: "📅", description: "Scheduling & calendars (/calendar, /doctor-availability)", defaultWriteRoles: ["admin", "doctor", "secretary"] },
      { name: "Planning équipe", hasWrite: true, icon: "👥", description: "Team scheduling (/team-schedule)", defaultWriteRoles: ["admin", "manager", "secretary"] },
      { name: "Schedule", hasWrite: true, icon: "🗓️", description: "Appointment schedule (/schedule)", defaultWriteRoles: ["admin", "doctor", "secretary"] },
    ],
  },
  {
    label: "Support & Tickets",
    icon: "🎫",
    modules: [
      { name: "Tickets", hasWrite: true, icon: "🎫", description: "Support tickets (/tickets)", defaultWriteRoles: ["admin", "support_client", "secretary"] },
      { name: "Board", hasWrite: true, icon: "🗂️", description: "Ticket kanban board (/board)", defaultWriteRoles: ["admin", "support_client", "manager"] },
      { name: "Incidents", hasWrite: true, icon: "⚠️", description: "Incident management (/incidents)", defaultWriteRoles: ["admin", "manager"] },
      { name: "Réclamations", hasWrite: true, icon: "📋", description: "Patient complaints (/complaints)", defaultWriteRoles: ["admin", "doctor", "secretary"] },
      { name: "Messages", hasWrite: true, icon: "💬", description: "Internal messages (/messages)", defaultWriteRoles: ["admin", "hr", "doctor", "secretary"] },
    ],
  },
  {
    label: "HR — Human Resources",
    icon: "👤",
    modules: [
      { name: "Employés", hasWrite: true, icon: "👤", description: "Staff management (/employees)", defaultWriteRoles: ["admin", "hr"] },
      { name: "Congés", hasWrite: true, icon: "🏖️", description: "Leave requests (/leaves)", defaultWriteRoles: ["admin", "hr"] },
      { name: "Absences", hasWrite: true, icon: "🚫", description: "Absence tracking (/absences)", defaultWriteRoles: ["admin", "hr"] },
      { name: "Avances sur salaire", hasWrite: true, icon: "💰", description: "Salary advances (/salary-advances)", defaultWriteRoles: ["admin", "hr", "accountant"] },
      { name: "Formations & Compétences", hasWrite: true, icon: "🎓", description: "Training & skills (/formations)", defaultWriteRoles: ["admin", "hr"] },
      { name: "Demandes de documents", hasWrite: true, icon: "📄", description: "Document requests (/document-requests)", defaultWriteRoles: ["admin", "hr"] },
      { name: "Recrutement", hasWrite: true, icon: "🧑‍💼", description: "Job posts & applications (/recruitment)", defaultWriteRoles: ["admin", "hr"] },
    ],
  },
  {
    label: "Accounting & Finance",
    icon: "📄",
    modules: [
      { name: "Factures", hasWrite: true, icon: "📄", description: "Invoices management (/invoices)", defaultWriteRoles: ["admin", "accountant"] },
      { name: "Paiements", hasWrite: true, icon: "💳", description: "Payment tracking (/payments)", defaultWriteRoles: ["admin", "accountant"] },
      { name: "CNAM", hasWrite: true, icon: "🛡️", description: "Insurance claims (/cnam)", defaultWriteRoles: ["admin", "accountant"] },
      { name: "Abonnements", hasWrite: true, icon: "🔄", description: "Subscriptions (/abonnements)", defaultWriteRoles: ["admin", "accountant"] },
      { name: "Paie", hasWrite: true, icon: "💵", description: "Payroll management (/payroll)", defaultWriteRoles: ["admin", "accountant", "hr"] },
      { name: "Recouvrement", hasWrite: true, icon: "📉", description: "Debt recovery (/recouvrement)", defaultWriteRoles: ["admin", "accountant"] },
      { name: "Comptabilité", hasWrite: true, icon: "🧾", description: "Accounting journal & entries (/accounting)", defaultWriteRoles: ["admin", "accountant"] },
    ],
  },
  {
    label: "Stock & Equipment",
    icon: "📦",
    modules: [
      { name: "Stocks médicaux", hasWrite: true, icon: "📦", description: "Medical inventory", defaultWriteRoles: ["admin", "secretary"] },
      { name: "Équipements", hasWrite: true, icon: "🔧", description: "Equipment management", defaultWriteRoles: ["admin", "manager"] },
      { name: "Salles", hasWrite: true, icon: "🚪", description: "Room management & bookings", defaultWriteRoles: ["admin", "manager", "secretary"] },
    ],
  },
  {
    label: "Read-only Modules",
    icon: "📊",
    modules: [
      { name: "Dashboard", hasWrite: false, icon: "📊", description: "Overview & analytics", defaultWriteRoles: [] },
      { name: "Notifications", hasWrite: false, icon: "🔔", description: "System notifications", defaultWriteRoles: [] },
      { name: "Analytics", hasWrite: false, icon: "📈", description: "Business analytics", defaultWriteRoles: [] },
      { name: "Rapports", hasWrite: false, icon: "📊", description: "Reports & exports", defaultWriteRoles: [] },
      { name: "Rôles & Permissions", hasWrite: false, icon: "🔐", description: "Admin only", defaultWriteRoles: [] },
      { name: "Journal d'audit", hasWrite: false, icon: "📋", description: "System audit trail", defaultWriteRoles: [] },
      { name: "Paramètres", hasWrite: false, icon: "⚙️", description: "System settings", defaultWriteRoles: [] },
    ],
  },
];

// Flat list for backward-compat lookups
const MODULES: ModuleDef[] = MODULE_GROUPS.flatMap((g) => g.modules);

/* ──────────────────────────────────────────────────────────────────────────── */
/*  API helpers                                                                */
/* ──────────────────────────────────────────────────────────────────────────── */

type ApiRolePermission = {
  id: number;
  role_name: string;
  write_permissions: string[];
  view_permissions: string[];
  is_built_in: boolean;
  created_at: string;
  updated_at: string;
};

function fetchAllRolePermissions(): Promise<ApiRolePermission[]> {
  return apiFetch<ApiRolePermission[] | { results: ApiRolePermission[] }>(
    "/accounts/all-role-permissions/"
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

function createRole(payload: { role_name: string; write_permissions: string[] }): Promise<ApiRolePermission> {
  return apiFetch("/accounts/role-permissions/", { method: "POST", body: payload });
}

function deleteRole(id: number): Promise<void> {
  return apiFetch(`/accounts/role-permissions/${id}/`, { method: "DELETE" });
}

function updateRolePermissions(id: number, payload: { write_permissions: string[], view_permissions: string[] }): Promise<ApiRolePermission> {
  return apiFetch<ApiRolePermission>(`/accounts/role-permissions/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Permission logic                                                            */
/* ──────────────────────────────────────────────────────────────────────────── */

function resolvePermKey(rp: ApiRolePermission): string {
  return rp.is_built_in ? rp.role_name.toLowerCase() : String(rp.id);
}

function buildWritePermissionsMap(rolePermissions: ApiRolePermission[]) {
  const map: Record<string, string[]> = {};
  for (const rp of rolePermissions) {
    const key = resolvePermKey(rp);
    for (const perm of rp.write_permissions) {
      if (perm.startsWith("noview:")) continue;
      if (!map[perm]) map[perm] = [];
      map[perm] = Array.from(new Set([...map[perm], key]));
    }
  }
  return map;
}

function buildViewDenialsMap(rolePermissions: ApiRolePermission[]) {
  const map: Record<string, string[]> = {};
  for (const rp of rolePermissions) {
    const key = resolvePermKey(rp);
    for (const perm of rp.write_permissions) {
      if (!perm.startsWith("noview:")) continue;
      const moduleName = perm.slice(7);
      if (!map[moduleName]) map[moduleName] = [];
      map[moduleName] = Array.from(new Set([...map[moduleName], key]));
    }
  }
  return map;
}

function permissionsForRole(
  roleId: string,
  rolePermissions: ApiRolePermission[]
): Record<string, { view: PermissionState; write: PermissionState }> {
  const result: Record<string, { view: PermissionState; write: PermissionState }> = {};
  const rp = rolePermissions.find(r => resolvePermKey(r) === roleId);
  const writePerms = rp?.write_permissions || [];
  const viewPerms = rp?.view_permissions || [];
  
  for (const mod of MODULES) {
    if (!mod.hasWrite) {
      result[mod.name] = { view: "allowed", write: "na" };
    } else {
      const writeAllowed = writePerms.includes(mod.name);
      const viewAllowed = viewPerms.includes(mod.name);
      
      result[mod.name] = {
        view: viewAllowed ? "allowed" : "denied",
        write: writeAllowed ? "allowed" : "denied",
      };
    }
  }
  return result;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Small UI helpers                                                            */
/* ──────────────────────────────────────────────────────────────────────────── */

function initialsOf(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function displayName(u: ApiUser) {
  return `${u.first_name} ${u.last_name}`.trim() || u.username;
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string) {
  const code = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  PermCell — toggle switch for a single permission cell                      */
/* ──────────────────────────────────────────────────────────────────────────── */

function PermCell({
  state,
  onClick,
  disabled = false,
  saving = false,
}: {
  state: PermissionState;
  onClick?: () => void;
  disabled?: boolean;
  saving?: boolean;
}) {
  if (state === "na")
    return (
      <span className="flex items-center justify-center text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
      </span>
    );

  const on = state === "allowed";

  if (saving) {
    return (
      <span className="mx-auto flex h-5 w-9 items-center justify-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </span>
    );
  }

  if (!onClick || disabled) {
    return (
      <span
        className={`mx-auto flex h-5 w-9 items-center rounded-full ${on ? "bg-emerald-500" : "bg-muted"} opacity-50 cursor-not-allowed`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? "Granted — click to revoke" : "Denied — click to grant"}
      aria-label={on ? "Revoke permission" : "Grant permission"}
      className={`mx-auto flex h-5 w-9 items-center rounded-full transition-colors ${on ? "bg-emerald-500 hover:bg-emerald-600" : "bg-muted hover:bg-muted-foreground/30"} cursor-pointer`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  StatCard                                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */

function StatCard({ icon: Icon, iconClass, label, value, sub }: {
  icon: React.ElementType; iconClass: string; label: string; value: string | number; sub: string;
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

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Donut chart                                                                 */
/* ──────────────────────────────────────────────────────────────────────────── */

function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-muted" strokeWidth={14} />
      {segments.map((seg) => {
        const length = (seg.value / total) * circumference;
        const dashArray = `${length} ${circumference - length}`;
        const dashOffset = -offset;
        offset += length;
        return (
          <circle key={seg.label} cx="60" cy="60" r={radius} fill="none" stroke={seg.color}
            strokeWidth={14} strokeDasharray={dashArray} strokeDashoffset={dashOffset} />
        );
      })}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  UserDetailDialog                                                            */
/* ──────────────────────────────────────────────────────────────────────────── */

function UserDetailDialog({ user, roleDefs, open, onClose }: {
  user: ApiUser | null; roleDefs: RoleDef[]; open: boolean; onClose: () => void;
}) {
  if (!user) return null;
  const name = displayName(user);
  const roleName = roleDefs.find((r) => r.id === effectiveRoleId(user))?.name ?? "User";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold ${avatarColor(name)}`}>
              {initialsOf(name)}
            </div>
            <div>
              <p className="text-base font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
              <Badge variant={user.is_active ? "outline" : "destructive"} className="mt-1 text-[10px]">
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          <div className="rounded-lg border divide-y text-sm">
            {[
              { label: "Email", value: user.email || "—" },
              { label: "Role", value: <Badge variant="secondary">{roleName}</Badge> },
              { label: "Department", value: user.profile?.department || "—" },
              { label: "Phone", value: user.profile?.phone || "—" },
              { label: "Staff", value: user.is_staff ? "Yes" : "No" },
              { label: "Superuser", value: user.is_superuser ? "Yes" : "No" },
              { label: "Joined", value: new Date(user.date_joined).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  AssignRoleDialog — dynamic: pick user AND role, works for both built-in    */
/*  (Django User) and custom (Employee) assignment                             */
/* ──────────────────────────────────────────────────────────────────────────── */

function AssignRoleDialog({
  open, onClose, roleDefs, users, employees, rolePermissions,
  onAssignUser, onAssignEmployee, isPending, preselectedRoleId,
}: {
  open: boolean;
  onClose: () => void;
  roleDefs: RoleDef[];
  users: ApiUser[];
  employees: ApiEmployee[];
  rolePermissions: ApiRolePermission[];
  onAssignUser: (userId: number, role: string) => void;
  onAssignEmployee: (employeeId: number, rolePermissionId: number) => void;
  isPending: boolean;
  preselectedRoleId?: string;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(preselectedRoleId ?? "admin");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [assignMode, setAssignMode] = useState<"user" | "employee">("user");

  useEffect(() => {
    if (open) {
      setSelectedRoleId(preselectedRoleId ?? "admin");
      setSelectedUserId("");
      setSelectedEmployeeId("");
    }
  }, [open, preselectedRoleId]);

  // Determine if selected role is built-in or custom
  const selectedRoleDef = roleDefs.find((r) => r.id === selectedRoleId);
  const isBuiltIn = selectedRoleDef?.builtIn ?? true;

  // For custom role — find the backing RolePermission record
  const backingRp = isBuiltIn
    ? null
    : rolePermissions.find((rp) => !rp.is_built_in && String(rp.id) === selectedRoleId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isBuiltIn) {
      if (!selectedUserId) return;
      onAssignUser(Number(selectedUserId), selectedRoleId);
    } else {
      if (!selectedEmployeeId || !backingRp) return;
      onAssignEmployee(Number(selectedEmployeeId), backingRp.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4" /> Assign Role
            </DialogTitle>
          </DialogHeader>

          {/* Role selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role to assign</label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Built-in</div>
                {roleDefs.filter((r) => r.builtIn && r.id !== "user").map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
                {roleDefs.some((r) => !r.builtIn) && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Custom / Job title</div>
                    {roleDefs.filter((r) => !r.builtIn).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Assignee — changes based on role type */}
          {isBuiltIn ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User account</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {users.filter((u) => u.is_active).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {displayName(u)}{" "}
                      <span className="text-muted-foreground text-xs">
                        — currently {roleDefs.find((r) => r.id === effectiveRoleId(u))?.name ?? "User"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Built-in roles are assigned to Django user accounts and control API write access immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Employee</label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {employees.filter((e) => e.is_active).map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {`${e.first_name} ${e.last_name}`.trim() || e.email}
                      {e.role_name && (
                        <span className="text-muted-foreground text-xs"> — currently {e.role_name}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Custom roles are assigned to employee records. The employee's write permissions update on their next API request.
              </p>
            </div>
          )}

          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Permission changes take effect on the assignee's next API request — no restart needed.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={isPending || (isBuiltIn ? !selectedUserId : !selectedEmployeeId)}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  EditMemberRoleDialog — change the role of an existing member               */
/* ──────────────────────────────────────────────────────────────────────────── */

function EditMemberRoleDialog({
  member, roleDefs, rolePermissions, open, onClose, onSaveUser, onSaveEmployee, isPending,
}: {
  member: RoleMember | null;
  roleDefs: RoleDef[];
  rolePermissions: ApiRolePermission[];
  open: boolean;
  onClose: () => void;
  onSaveUser: (userId: number, role: string) => void;
  onSaveEmployee: (employeeId: number, rolePermissionId: number | null) => void;
  isPending: boolean;
}) {
  const [selectedRole, setSelectedRole] = useState("");

  useEffect(() => {
    if (!member) return;
    if (member.kind === "user") {
      setSelectedRole(effectiveRoleId(member.raw));
    } else {
      const rp = rolePermissions.find((r) => !r.is_built_in && r.id === member.raw.role_id);
      setSelectedRole(rp ? String(rp.id) : "");
    }
  }, [member, rolePermissions]);

  if (!member) return null;

  function handleSave() {
    if (!member) return;
    if (member.kind === "user") {
      // Built-in roles only for Django users
      const role = roleDefs.find((r) => r.id === selectedRole);
      if (role?.builtIn) onSaveUser(member.id, selectedRole);
    } else {
      // Custom roles for employees (null = unassign)
      const rolePermId = selectedRole ? Number(selectedRole) : null;
      onSaveEmployee(member.id, rolePermId);
    }
  }

  const isUser = member.kind === "user";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Role — {member.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isUser
              ? "User accounts can only be assigned built-in roles."
              : "Employees can be assigned any custom or built-in role via the employee record."}
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New role</label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {isUser ? (
                  roleDefs.filter((r) => r.builtIn && r.id !== "user").map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="">— No custom role —</SelectItem>
                    {rolePermissions.filter((rp) => !rp.is_built_in).map((rp) => (
                      <SelectItem key={rp.id} value={String(rp.id)}>{rp.role_name}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  ViewRoleDialog                                                              */
/* ──────────────────────────────────────────────────────────────────────────── */

function ViewRoleDialog({ role, matrix, userCount, open, onClose }: {
  role: RoleDef | null;
  matrix: Record<string, { view: PermissionState; write: PermissionState }>;
  userCount: number;
  open: boolean;
  onClose: () => void;
}) {
  if (!role) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {role.name}
            {!role.builtIn && <Badge variant="outline" className="text-[10px]">Custom</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {userCount} member{userCount !== 1 ? "s" : ""} assigned •{" "}
            {role.builtIn ? "Built-in role" : "Custom role"}
          </p>
          <div className="overflow-x-auto rounded-md border max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b bg-muted/40">
                  <th className="p-2.5 text-left font-medium text-muted-foreground">Module</th>
                  <th className="p-2.5 text-center font-medium text-muted-foreground">View</th>
                  <th className="p-2.5 text-center font-medium text-muted-foreground">Write</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod) => (
                  <tr key={mod.name} className="border-b last:border-0">
                    <td className="p-2.5"><span className="mr-1.5">{mod.icon}</span>{mod.name}</td>
                    <td className="p-2.5 text-center"><PermCell state={matrix[mod.name]?.view ?? "denied"} /></td>
                    <td className="p-2.5 text-center"><PermCell state={matrix[mod.name]?.write ?? "denied"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Page guard — allow authenticated users to view, only admins can edit      */
/* ──────────────────────────────────────────────────────────────────────────── */
function RolesPermissionsPage() {
  const navigate = useNavigate();

  const meQuery = useQuery({ queryKey: ["current-user"], queryFn: fetchCurrentUser, retry: false });
  const isSuperadmin = meQuery.data?.is_superuser === true;
  const isAuthenticated = meQuery.data?.id !== undefined;

  // Block non-superadmins entirely
  useEffect(() => {
    if (meQuery.isLoading) return;
    if (!isAuthenticated) {
      toast.error("Please login first");
      navigate({ to: "/login", replace: true });
    } else if (!isSuperadmin) {
      toast.error("Superadmin access required");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [meQuery.isLoading, isAuthenticated, isSuperadmin, navigate]);

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verifying access…
      </div>
    );
  }
  if (!isAuthenticated) return null;
  
  // Pass isAdmin to content for edit controls
  return <RolesPermissionsContent isAdmin={isSuperadmin} />;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Main content                                                               */
/* ──────────────────────────────────────────────────────────────────────────── */

function RolesPermissionsContent({ isAdmin = false }: { isAdmin?: boolean }) {
  const queryClient = useQueryClient();

  /* ── Data fetching ────────────────────────────────────────────────────── */

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers, refetchOnWindowFocus: true });
  const leavesQuery = useQuery({ queryKey: ["leave-requests"], queryFn: fetchLeaveRequests, refetchOnWindowFocus: true });
  const rolePermissionsQuery = useQuery({
    queryKey: ["role-permissions"],
    queryFn: fetchAllRolePermissions,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees, refetchOnWindowFocus: true });

  useEffect(() => {
    if (!rolePermissionsQuery.error) return;
    const err = rolePermissionsQuery.error as any;
    if (err?.status === 403 || err?.status === 401) {
      toast.error("You don't have permission to view role permissions.");
    } else {
      toast.error("Failed to load role permissions.");
    }
  }, [rolePermissionsQuery.error]);

  const rolePermissions = rolePermissionsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  /* ── Role definitions (built-in + custom from DB) ─────────────────────── */

  const roleDefs: RoleDef[] = useMemo(() => {
    const builtIn = BUILT_IN_ROLE_DEFS.map((r) => ({ ...r }));
    const custom = rolePermissions
      .filter((rp) => !rp.is_built_in)
      .map((rp) => ({ id: String(rp.id), name: rp.role_name, builtIn: false }));
    return [...builtIn, ...custom];
  }, [rolePermissions]);

  /* ── UI state ─────────────────────────────────────────────────────────── */

  const [selectedRoleId, setSelectedRoleId] = useState("admin");
  const [roleQuery, setRoleQuery] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"permissions" | "users">("permissions");

  // Collapsible groups in the permission matrix
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["Read-only Modules"]));
  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Dialogs
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleModules, setNewRoleModules] = useState<Set<string>>(new Set());

  const [assignOpen, setAssignOpen] = useState(false);

  const [roleToRemove, setRoleToRemove] = useState<RoleDef | null>(null);
  const [viewRoleOpen, setViewRoleOpen] = useState(false);
  const [viewRoleTarget, setViewRoleTarget] = useState<RoleDef | null>(null);

  const [viewUserOpen, setViewUserOpen] = useState(false);
  const [viewUserTarget, setViewUserTarget] = useState<ApiUser | null>(null);

  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [editMemberTarget, setEditMemberTarget] = useState<RoleMember | null>(null);

  const [deleteUserTarget, setDeleteUserTarget] = useState<ApiUser | null>(null);

  // Track which module is currently being saved (for per-cell spinner)
  const [savingModules, setSavingModules] = useState<Set<string>>(new Set());

  /* ── Derived data ─────────────────────────────────────────────────────── */

  const roles = useMemo(
    () =>
      roleDefs.map((r) => {
        if (r.builtIn) {
          return { ...r, users: users.filter((u) => effectiveRoleId(u) === r.id).length };
        }
        const rp = rolePermissions.find((p) => !p.is_built_in && String(p.id) === r.id);
        const count = rp ? employees.filter((e) => e.role_id === rp.id).length : 0;
        return { ...r, users: count };
      }),
    [roleDefs, users, employees, rolePermissions]
  );

  const filteredRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return roles.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [roles, roleQuery]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  const roleMembers = useMemo((): RoleMember[] => {
    const role = roles.find((r) => r.id === selectedRoleId);
    if (!role) return [];

    if (role.builtIn) {
      return users
        .filter((u) => effectiveRoleId(u) === selectedRoleId)
        .map((u) => ({
          kind: "user" as const,
          id: u.id,
          name: displayName(u),
          email: u.email ?? "",
          username: u.username,
          is_active: u.is_active,
          is_superuser: u.is_superuser,
          raw: u,
        }));
    }

    const rp = rolePermissions.find((r) => !r.is_built_in && String(r.id) === selectedRoleId);
    if (!rp) return [];

    return employees
      .filter((e) => e.role_id === rp.id)
      .map((e) => ({
        kind: "employee" as const,
        id: e.id,
        name: `${e.first_name} ${e.last_name}`.trim() || e.email,
        email: e.email,
        username: e.employee_number,
        is_active: e.is_active,
        is_superuser: false as const,
        jobTitle: e.job_title,
        raw: e,
      }));
  }, [roles, selectedRoleId, users, employees, rolePermissions]);

  const filteredRoleMembers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return roleMembers.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [roleMembers, userSearch]);

  /* ── Permission maps ──────────────────────────────────────────────────── */

  const matrix = useMemo(
    () => permissionsForRole(selectedRoleId, rolePermissions),
    [selectedRoleId, rolePermissions]
  );

  const viewRoleMatrix = useMemo(() => {
    if (!viewRoleTarget) return {};
    return permissionsForRole(viewRoleTarget.id, rolePermissions);
  }, [viewRoleTarget, rolePermissions]);

  const viewRoleUserCount = useMemo(() => {
    if (!viewRoleTarget) return 0;
    if (viewRoleTarget.builtIn) return users.filter((u) => effectiveRoleId(u) === viewRoleTarget.id).length;
    const rp = rolePermissions.find((r) => !r.is_built_in && String(r.id) === viewRoleTarget.id);
    return rp ? employees.filter((e) => e.role_id === rp.id).length : 0;
  }, [viewRoleTarget, users, employees, rolePermissions]);

  const selectedRolePermission = useMemo(() => {
    if (!selectedRole) return undefined;
    if (selectedRole.builtIn) {
      return rolePermissions.find((rp) => rp.is_built_in && rp.role_name.toLowerCase() === selectedRole.id);
    }
    return rolePermissions.find((rp) => !rp.is_built_in && String(rp.id) === selectedRole.id);
  }, [selectedRole, rolePermissions]);

  const canTogglePermissions = isAdmin && Boolean(selectedRolePermission);

  /* ── Stats ────────────────────────────────────────────────────────────── */

  const distribution = useMemo(() => {
    let allowed = 0, denied = 0, na = 0;
    for (const mod of MODULES) {
      const cell = matrix[mod.name];
      if (cell?.view === "allowed") allowed++;
      else if (cell?.view === "denied") denied++;
      else na++;
      if (cell?.write === "allowed") allowed++;
      else if (cell?.write === "denied") denied++;
      else na++;
    }
    return { allowed, denied, na, total: allowed + denied + na };
  }, [matrix]);

  const pendingLeaves = (leavesQuery.data ?? []).filter((l) => l.statut === "En attente").length;
  const writeCapableModules = MODULES.filter((m) => m.hasWrite);

  /* ── Mutations ────────────────────────────────────────────────────────── */

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
    queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
  };

  // Update role permissions (PATCH /accounts/role-permissions/{id}/)
  const togglePermMutation = useMutation({
    mutationFn: ({ id, write_permissions, view_permissions }: { id: number; write_permissions: string[]; view_permissions: string[] }) =>
      updateRolePermissions(id, { write_permissions, view_permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
      setSavingModules(new Set());
    },
    onError: () => {
      toast.error("Failed to update permissions");
      setSavingModules(new Set());
    },
  });

  // Assign role to a Django user (PATCH /accounts/users/{id}/)
  const assignUserMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) => updateUserRole(userId, role),
    onSuccess: () => {
      invalidateAll();
      toast.success("Role assigned successfully");
      setAssignOpen(false);
      setEditMemberOpen(false);
      setEditMemberTarget(null);
    },
    onError: (err: any) => toast.error(err?.data?.detail || "Failed to assign role"),
  });

  // Assign custom role to an employee (PATCH /hr/employees/{id}/)
  const assignEmployeeMutation = useMutation({
    mutationFn: ({ employeeId, rolePermissionId }: { employeeId: number; rolePermissionId: number | null }) =>
      updateEmployee(employeeId, { role: rolePermissionId }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Employee role updated");
      setAssignOpen(false);
      setEditMemberOpen(false);
      setEditMemberTarget(null);
    },
    onError: (err: any) => toast.error(err?.data?.detail || "Failed to update employee role"),
  });

  // Create custom role
  const addRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      await queryClient.refetchQueries({ queryKey: ["role-permissions"] });
      invalidateAll();
      setAddRoleOpen(false);
      setNewRoleName("");
      setNewRoleModules(new Set());
      toast.success(`Role "${created.role_name}" created`);
      setSelectedRoleId(String(created.id));
    },
    onError: (err: any) => toast.error(err?.data?.detail || err?.data?.role_name?.[0] || "Failed to create role"),
  });

  // Delete custom role
  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      invalidateAll();
      if (roleToRemove && selectedRoleId === String(roleToRemove.id)) setSelectedRoleId("admin");
      toast.success(`Role "${roleToRemove?.name}" deleted`);
      setRoleToRemove(null);
    },
    onError: (err: any) => toast.error(err?.data?.detail || "Failed to delete role"),
  });

  // Deactivate user
  const deactivateUserMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/accounts/users/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deactivated");
      setDeleteUserTarget(null);
    },
    onError: () => toast.error("Failed to deactivate user"),
  });

  /* ── Permission toggle handlers ───────────────────────────────────────── */

  function toggleViewPermission(moduleName: string) {
    if (!selectedRolePermission) return;
    const currentWrite = new Set(selectedRolePermission.write_permissions);
    const currentView = new Set(selectedRolePermission.view_permissions || []);

    if (currentView.has(moduleName)) {
      // Turning view OFF → also strip write
      currentView.delete(moduleName);
      currentWrite.delete(moduleName);
    } else {
      // Turning view ON → view only, don't touch write
      currentView.add(moduleName);
    }

    setSavingModules((prev) => new Set([...prev, `view:${moduleName}`]));
    togglePermMutation.mutate({
      id: selectedRolePermission.id,
      write_permissions: Array.from(currentWrite),
      view_permissions: Array.from(currentView),
    });
  }

  function toggleWritePermission(moduleName: string) {
    if (!selectedRolePermission) return;
    const currentWrite = new Set(selectedRolePermission.write_permissions);
    const currentView = new Set(selectedRolePermission.view_permissions || []);

    if (currentWrite.has(moduleName)) {
      // Turning write OFF → keep view if it was on
      currentWrite.delete(moduleName);
    } else {
      // Turning write ON → also ensure view is on
      currentWrite.add(moduleName);
      currentView.add(moduleName);
    }

    setSavingModules((prev) => new Set([...prev, `write:${moduleName}`]));
    togglePermMutation.mutate({
      id: selectedRolePermission.id,
      write_permissions: Array.from(currentWrite),
      view_permissions: Array.from(currentView),
    });
  }

  // Bulk: grant all write permissions in a group
  function grantGroupWrite(group: ModuleGroup) {
    if (!selectedRolePermission) return;
    const current = new Set(selectedRolePermission.write_permissions);
    let changed = false;
    for (const mod of group.modules) {
      if (!mod.hasWrite) continue;
      const viewKey = `noview:${mod.name}`;
      if (current.has(viewKey)) continue; // skip view-denied modules
      if (!current.has(mod.name)) { current.add(mod.name); changed = true; }
    }
    if (!changed) { toast.info("All modules in this group already have write access."); return; }
    const currentView4 = new Set(selectedRolePermission.view_permissions || []);
    for (const mod of group.modules) { if (mod.hasWrite) currentView4.add(mod.name); }
    togglePermMutation.mutate({ id: selectedRolePermission.id, write_permissions: Array.from(current), view_permissions: Array.from(currentView4) });
    toast.success(`Write access granted for all "${group.label}" modules`);
  }

  // Bulk: revoke all write permissions in a group
  function revokeGroupWrite(group: ModuleGroup) {
    if (!selectedRolePermission) return;
    const current = new Set(selectedRolePermission.write_permissions);
    let changed = false;
    for (const mod of group.modules) {
      if (current.has(mod.name)) { current.delete(mod.name); changed = true; }
    }
    if (!changed) { toast.info("No write permissions to revoke in this group."); return; }
    const currentView5 = new Set(selectedRolePermission.view_permissions || []);
    togglePermMutation.mutate({ id: selectedRolePermission.id, write_permissions: Array.from(current), view_permissions: Array.from(currentView5) });
    toast.success(`Write access revoked for all "${group.label}" modules`);
  }

  /* ── Dialog submit handlers ───────────────────────────────────────────── */

  function submitAddRole(e: FormEvent) {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return toast.error("Please provide a role name");
    if (roleDefs.some((r) => r.name.toLowerCase() === name.toLowerCase()))
      return toast.error("A role with this name already exists");
    addRoleMutation.mutate({ role_name: name, write_permissions: Array.from(newRoleModules) });
  }

  function confirmDeleteRole() {
    if (!roleToRemove || roleToRemove.builtIn) return;
    const id = Number(roleToRemove.id);
    if (!isNaN(id) && id > 0) deleteRoleMutation.mutate(id);
  }

  const removeUsersBlocking = useMemo(() => {
    if (!roleToRemove) return 0;
    if (roleToRemove.builtIn) return users.filter((u) => effectiveRoleId(u) === roleToRemove.id).length;
    const rp = rolePermissions.find((r) => !r.is_built_in && String(r.id) === roleToRemove.id);
    return rp ? employees.filter((e) => e.role_id === rp.id).length : 0;
  }, [roleToRemove, users, employees, rolePermissions]);

  const pct = (v: number) => Math.round((v / distribution.total) * 100);
  const isLoading = usersQuery.isLoading || rolePermissionsQuery.isLoading;
  const isMutating = togglePermMutation.isPending;
  const isAssigning = assignUserMutation.isPending || assignEmployeeMutation.isPending;

  /* ────────────────────────────────────────────────────────────────────── */
  /*  Render                                                                */
  /* ────────────────────────────────────────────────────────────────────── */

  return (
    <AppShell
      title="Rôles & Permissions"
      actions={
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:flex items-center gap-1 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
            <Lock className="h-3 w-3" /> {isAdmin ? "Admin" : "Read-Only"}
          </Badge>
          <Button
            variant="outline" size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["users"] });
              queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
              queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
              queryClient.invalidateQueries({ queryKey: ["employees"] });
              queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
              toast.success("Data refreshed");
            }}
            disabled={usersQuery.isFetching || rolePermissionsQuery.isFetching || employeesQuery.isFetching}
          >
            {usersQuery.isFetching || rolePermissionsQuery.isFetching || employeesQuery.isFetching
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddRoleOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">New Role</span>
              </Button>
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <UserCog className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Assign Role</span>
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      <ViewRoleDialog
        role={viewRoleTarget} matrix={viewRoleMatrix} userCount={viewRoleUserCount}
        open={viewRoleOpen} onClose={() => { setViewRoleOpen(false); setViewRoleTarget(null); }}
      />

      <UserDetailDialog
        user={viewUserTarget} roleDefs={roleDefs}
        open={viewUserOpen} onClose={() => { setViewUserOpen(false); setViewUserTarget(null); }}
      />

      {/* Dynamic Assign Role Dialog */}
      <AssignRoleDialog
        open={assignOpen} onClose={() => setAssignOpen(false)}
        roleDefs={roleDefs} users={users} employees={employees}
        rolePermissions={rolePermissions}
        onAssignUser={(userId, role) => assignUserMutation.mutate({ userId, role })}
        onAssignEmployee={(employeeId, rolePermissionId) =>
          assignEmployeeMutation.mutate({ employeeId, rolePermissionId })
        }
        isPending={isAssigning}
        preselectedRoleId={selectedRole?.builtIn ? selectedRoleId : undefined}
      />

      {/* Edit member role */}
      <EditMemberRoleDialog
        member={editMemberTarget} roleDefs={roleDefs} rolePermissions={rolePermissions}
        open={editMemberOpen} onClose={() => { setEditMemberOpen(false); setEditMemberTarget(null); }}
        onSaveUser={(userId, role) => assignUserMutation.mutate({ userId, role })}
        onSaveEmployee={(employeeId, rolePermissionId) =>
          assignEmployeeMutation.mutate({ employeeId, rolePermissionId })
        }
        isPending={isAssigning}
      />

      {/* Deactivate User Confirm */}
      <Dialog open={deleteUserTarget !== null} onOpenChange={(o) => !o && setDeleteUserTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deactivate user?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will deactivate <strong>{deleteUserTarget ? displayName(deleteUserTarget) : ""}</strong>.
            They will immediately lose access but their data will be preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deactivateUserMutation.isPending}
              onClick={() => { if (deleteUserTarget) deactivateUserMutation.mutate(deleteUserTarget.id); }}>
              {deactivateUserMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirm */}
      <Dialog open={roleToRemove !== null} onOpenChange={(o) => !o && setRoleToRemove(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete "{roleToRemove?.name}"?</DialogTitle></DialogHeader>
          {roleToRemove?.builtIn ? (
            <p className="text-sm text-muted-foreground">Built-in roles cannot be deleted.</p>
          ) : removeUsersBlocking > 0 ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <strong>{removeUsersBlocking}</strong> employee{removeUsersBlocking !== 1 ? "s are" : " is"} still
                assigned to this role. Reassign them first, then delete the role.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This will permanently delete the role and all its permission entries. No members are currently assigned.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleToRemove(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={Boolean(roleToRemove?.builtIn) || removeUsersBlocking > 0 || deleteRoleMutation.isPending}
              onClick={confirmDeleteRole}>
              {deleteRoleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" /> Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Role Dialog */}
      <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={submitAddRole} className="space-y-4">
            <DialogHeader><DialogTitle>Create new role</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role name</label>
              <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. Lab Technician" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Write access</label>
              <p className="text-xs text-muted-foreground">
                Read access is granted to all roles by default. Select modules this role can create, edit, or delete.
              </p>
              <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3 max-h-[200px] overflow-y-auto">
                {writeCapableModules.map((mod) => (
                  <label key={mod.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-0.5">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded"
                      checked={newRoleModules.has(mod.name)}
                      onChange={() => {
                        setNewRoleModules((prev) => {
                          const next = new Set(prev);
                          if (next.has(mod.name)) next.delete(mod.name); else next.add(mod.name);
                          return next;
                        });
                      }} />
                    <span>{mod.icon}</span>
                    <span className="text-xs">{mod.name}</span>
                  </label>
                ))}
              </div>
              {newRoleModules.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {newRoleModules.size} module{newRoleModules.size > 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddRoleOpen(false); setNewRoleName(""); setNewRoleModules(new Set()); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={addRoleMutation.isPending || !newRoleName.trim()}>
                {addRoleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create role
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roles & users…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Shield} iconClass="bg-blue-100 text-blue-600" label="Total roles"
              value={roles.length} sub={`${BUILT_IN_ROLE_DEFS.length} built-in • ${rolePermissions.filter((r) => !r.is_built_in).length} custom`} />
            <StatCard icon={Users} iconClass="bg-violet-100 text-violet-600" label="Active users"
              value={users.filter((u) => u.is_active).length} sub={`${users.length} accounts total`} />
            <StatCard icon={ShieldAlert} iconClass="bg-emerald-100 text-emerald-600" label="Superusers"
              value={users.filter((u) => u.is_superuser).length} sub="Full Django access" />
            <StatCard icon={ShieldCheck} iconClass="bg-amber-100 text-amber-600" label="Pending leaves"
              value={pendingLeaves} sub="Awaiting approval" />
          </div>

          {/* 3-column workspace */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_1fr_280px]">

            {/* ── Roles list ────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Roles</CardTitle>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => setAddRoleOpen(true)} title="Add role">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)}
                    placeholder="Search roles…" className="pl-9" />
                  {roleQuery && (
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setRoleQuery("")}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Built-in section */}
                <div>
                  <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Built-in
                  </p>
                  <div className="space-y-0.5">
                    {filteredRoles.filter((r) => r.builtIn).map((role) => (
                      <RoleListItem key={role.id} role={role} active={role.id === selectedRole?.id}
                        onSelect={() => setSelectedRoleId(role.id)}
                        onView={() => { setViewRoleTarget(role); setViewRoleOpen(true); }}
                        onDelete={null} />
                    ))}
                  </div>
                </div>

                {/* Custom section */}
                {filteredRoles.some((r) => !r.builtIn) && (
                  <div>
                    <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Custom
                    </p>
                    <div className="space-y-0.5">
                      {filteredRoles.filter((r) => !r.builtIn).map((role) => (
                        <RoleListItem key={role.id} role={role} active={role.id === selectedRole?.id}
                          onSelect={() => setSelectedRoleId(role.id)}
                          onView={() => { setViewRoleTarget(role); setViewRoleOpen(true); }}
                          onDelete={isAdmin ? () => setRoleToRemove(role) : null} />
                      ))}
                    </div>
                  </div>
                )}

                {filteredRoles.length === 0 && (
                  <p className="p-2.5 text-xs text-muted-foreground">No roles match "{roleQuery}".</p>
                )}
              </CardContent>
            </Card>

            {/* ── Permissions matrix + Members tab ────────────────────── */}
            <Card>
              <CardHeader className="space-y-0 pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{selectedRole?.name ?? "—"}</CardTitle>
                    {selectedRole && HIGH_PRIVILEGE_ROLES.has(selectedRole.id) && (
                      <Badge variant="destructive" className="text-[10px]">High privilege</Badge>
                    )}
                    {selectedRole && !selectedRole.builtIn && (
                      <Badge variant="outline" className="text-[10px]">Custom</Badge>
                    )}
                    {isMutating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                      <UserCog className="h-3.5 w-3.5" />
                      <span className="ml-1.5 hidden sm:inline">Assign user</span>
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex border-b">
                  {(["permissions", "users"] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      {tab === "permissions" ? "Permissions" : `Members (${roleMembers.length})`}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-3">
                {/* ── Permissions tab ──────────────────────────────────── */}
                {activeTab === "permissions" && (
                  <div className="space-y-3">
                    {!canTogglePermissions && isAdmin && (
                      <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        No permission record found for this role — permissions are read-only until the backend initializes one
                        (visit this page while logged in as admin to auto-initialize).
                      </div>
                    )}

                    {!isAdmin && (
                      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        You are viewing permissions in read-only mode. Only admins can modify permissions.
                      </div>
                    )}

                    {/* Grouped permission matrix */}
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="p-3 text-left font-medium text-muted-foreground">Module</th>
                            <th className="p-3 text-center font-medium text-muted-foreground w-20">Read</th>
                            <th className="p-3 text-center font-medium text-muted-foreground w-28">
                              Create / Edit / Delete
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {MODULE_GROUPS.map((group) => {
                            const isCollapsed = collapsedGroups.has(group.label);
                            const writableInGroup = group.modules.filter((m) => m.hasWrite);
                            const grantedCount = writableInGroup.filter(
                              (m) => matrix[m.name]?.write === "allowed"
                            ).length;
                            const allGranted = writableInGroup.length > 0 && grantedCount === writableInGroup.length;
                            const someGranted = grantedCount > 0 && !allGranted;

                            return (
                              <>
                                {/* Group header row */}
                                <tr key={`group-${group.label}`} className="bg-muted/20 border-b">
                                  <td colSpan={3} className="p-0">
                                    <div className="flex items-center justify-between px-3 py-2">
                                      <button type="button"
                                        onClick={() => toggleGroup(group.label)}
                                        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                                        <span>{group.icon}</span>
                                        <span className="uppercase tracking-wider">{group.label}</span>
                                        <ChevronDown className={`h-3 w-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                                        {writableInGroup.length > 0 && (
                                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                            {grantedCount}/{writableInGroup.length} write
                                          </span>
                                        )}
                                      </button>

                                      {/* Bulk grant/revoke for writable groups - admin only */}
                                      {writableInGroup.length > 0 && canTogglePermissions && (
                                        <div className="flex items-center gap-1">
                                          <button type="button" title="Grant all write in group"
                                            onClick={() => grantGroupWrite(group)}
                                            disabled={allGranted || isMutating}
                                            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${allGranted ? "text-muted-foreground/40 cursor-not-allowed" : "text-emerald-700 hover:bg-emerald-50 cursor-pointer"}`}>
                                            <Check className="h-3 w-3" /> All
                                          </button>
                                          <button type="button" title="Revoke all write in group"
                                            onClick={() => revokeGroupWrite(group)}
                                            disabled={grantedCount === 0 || isMutating}
                                            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${grantedCount === 0 ? "text-muted-foreground/40 cursor-not-allowed" : "text-rose-600 hover:bg-rose-50 cursor-pointer"}`}>
                                            <Minus className="h-3 w-3" /> None
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {/* Module rows */}
                                {!isCollapsed && group.modules.map((mod) => (
                                  <tr key={mod.name} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                    <td className="p-3">
                                      <div>
                                        <span className="mr-1.5">{mod.icon}</span>
                                        <span className="font-medium">{mod.name}</span>
                                        <p className="text-xs text-muted-foreground">{mod.description}</p>
                                      </div>
                                    </td>
                                    <td className="p-3 text-center">
                                      <PermCell
                                        state={matrix[mod.name]?.view ?? "denied"}
                                        onClick={mod.hasWrite && canTogglePermissions ? () => toggleViewPermission(mod.name) : undefined}
                                        disabled={!canTogglePermissions || !mod.hasWrite}
                                        saving={savingModules.has(`view:${mod.name}`)}
                                      />
                                    </td>
                                    <td className="p-3 text-center">
                                      <PermCell
                                        state={matrix[mod.name]?.write ?? "denied"}
                                        onClick={mod.hasWrite && canTogglePermissions ? () => toggleWritePermission(mod.name) : undefined}
                                        disabled={!canTogglePermissions || !mod.hasWrite}
                                        saving={savingModules.has(`write:${mod.name}`)}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {canTogglePermissions
                        ? "Toggle read or write access for this role. Changes are saved immediately and take effect on the next API request."
                        : isAdmin 
                          ? "Permissions are read-only for this role — no DB record exists yet."
                          : "Permissions are read-only for non-admin users."}
                    </p>
                  </div>
                )}

                {/* ── Members tab ──────────────────────────────────────── */}
                {activeTab === "users" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Search members…" className="pl-9" />
                        {userSearch && (
                          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setUserSearch("")}>
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} title="Add member">
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {filteredRoleMembers.length === 0 ? (
                      <div className="py-8 text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                          {roleMembers.length === 0
                            ? selectedRole?.builtIn
                              ? "No users have this role."
                              : "No employees assigned — create an employee with this job title or assign from here."
                            : "No members match your search."}
                        </p>
                        {roleMembers.length === 0 && isAdmin && (
                          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAssignOpen(true)}>
                            <UserCog className="h-4 w-4 mr-1.5" /> Assign someone
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-[420px] overflow-y-auto">
                        {filteredRoleMembers.map((m) => (
                          <div key={`${m.kind}-${m.id}`}
                            className="group flex items-center gap-3 rounded-md border p-2.5 hover:bg-muted/40 transition-colors">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(m.name)}`}>
                              {initialsOf(m.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {m.kind === "employee"
                                  ? `${m.jobTitle} · ${m.email || m.username}`
                                  : m.email || `@${m.username}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {!m.is_active && <Badge variant="destructive" className="text-[9px]">Inactive</Badge>}
                              {m.kind === "employee" && <Badge variant="outline" className="text-[9px]">Employee</Badge>}
                              {m.kind === "user" && m.is_superuser && <Badge variant="secondary" className="text-[9px]">Superuser</Badge>}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {m.kind === "user" && (
                                <button type="button" title="View user"
                                  onClick={() => { setViewUserTarget(m.raw); setViewUserOpen(true); }}
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {/* Edit role button — works for BOTH users and employees */}
                              {isAdmin && (
                                <button type="button" title="Change role"
                                  onClick={() => { setEditMemberTarget(m); setEditMemberOpen(true); }}
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-blue-600">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {m.kind === "user" && m.is_active && !m.is_superuser && isAdmin && (
                                <button type="button" title="Deactivate user"
                                  onClick={() => setDeleteUserTarget(m.raw)}
                                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Role details sidebar ─────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Role Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedRole?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedRole?.builtIn ? "Built-in role" : "Custom role / job title"}
                    </p>
                    {selectedRole && !selectedRole.builtIn && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Auto-assigned when an employee with this job title is created.
                      </p>
                    )}
                  </div>
                </div>

                {/* DB record status */}
                <div className="rounded-md border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">DB record</span>
                    {canTogglePermissions ? (
                      <span className="flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                        <XCircle className="h-3 w-3" /> {isAdmin ? "Pending" : "Read-Only"}
                      </span>
                    )}
                  </div>
                  {canTogglePermissions && selectedRolePermission && (
                    <div className="mt-1.5 text-muted-foreground space-y-0.5">
                      <div>ID: #{selectedRolePermission.id}</div>
                      <div>Updated: {new Date(selectedRolePermission.updated_at).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>

                {/* Member avatar stack */}
                <div>
                  <p className="mb-2 text-sm font-medium">Members ({roleMembers.length})</p>
                  {roleMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No members assigned.</p>
                  ) : (
                    <div className="flex flex-wrap -space-x-2">
                      {roleMembers.slice(0, 8).map((m) => (
                        <button key={`${m.kind}-${m.id}`} type="button" title={m.name}
                          onClick={() => {
                            if (m.kind === "user") { setViewUserTarget(m.raw); setViewUserOpen(true); }
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold transition-transform hover:z-10 hover:scale-110 ${avatarColor(m.name)} ${m.kind === "employee" ? "cursor-default" : "cursor-pointer"}`}>
                          {initialsOf(m.name)}
                        </button>
                      ))}
                      {roleMembers.length > 8 && (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium text-muted-foreground">
                          +{roleMembers.length - 8}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Permission summary */}
                <div>
                  <p className="mb-2 text-sm font-medium">Permission summary</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Read access", count: MODULES.filter((m) => matrix[m.name]?.view === "allowed").length, color: "text-emerald-600" },
                      { label: "Write access", count: MODULES.filter((m) => matrix[m.name]?.write === "allowed").length, color: "text-blue-600" },
                      { label: "Read denied", count: MODULES.filter((m) => matrix[m.name]?.view === "denied").length, color: "text-rose-500" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className={`font-medium ${item.color}`}>{item.count}/{MODULES.length}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Button className="w-full" variant="outline" size="sm"
                    onClick={() => { setViewRoleTarget(selectedRole ?? null); setViewRoleOpen(true); }}>
                    <Eye className="h-4 w-4" /> View all permissions
                  </Button>
                  {isAdmin && (
                    <Button className="w-full" variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                      <UserCog className="h-4 w-4" /> Assign user
                    </Button>
                  )}
                  {isAdmin && (
                    <Button className="w-full" variant="outline" size="sm"
                      disabled={!selectedRole || selectedRole.builtIn}
                      title={selectedRole?.builtIn ? "Built-in roles cannot be deleted" : "Delete this role"}
                      onClick={() => { if (selectedRole && !selectedRole.builtIn) setRoleToRemove(selectedRole); }}>
                      <Trash2 className={`h-4 w-4 ${!selectedRole || selectedRole.builtIn ? "" : "text-destructive"}`} />
                      <span className={!selectedRole || selectedRole.builtIn ? "" : "text-destructive"}>Delete role</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Bottom row ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Permission distribution — {selectedRole?.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6 p-4 pt-0">
                <div className="relative shrink-0">
                  <Donut segments={[
                    { label: "Allowed", value: distribution.allowed, color: "#10b981" },
                    { label: "Denied", value: distribution.denied, color: "#f43f5e" },
                    { label: "N/A", value: distribution.na, color: "#e5e7eb" },
                  ]} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-semibold">{distribution.total}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Allowed", color: "bg-emerald-500", value: distribution.allowed },
                    { label: "Denied", color: "bg-rose-400", value: distribution.denied },
                    { label: "N/A", color: "bg-gray-200", value: distribution.na },
                  ].map(({ label, color, value }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                      <span className="text-muted-foreground">{label}</span>
                      <span className="ml-auto font-medium">{pct(value)}% ({value})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Members — {selectedRole?.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2 max-h-[220px] overflow-y-auto">
                {roleMembers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {selectedRole?.builtIn ? "No users have this role." : "No employees assigned."}
                  </p>
                ) : (
                  <>
                    {roleMembers.slice(0, 6).map((m) => (
                      <div key={`${m.kind}-${m.id}`} className="group flex items-center gap-3 rounded-md p-1.5 hover:bg-muted/40 transition-colors">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColor(m.name)}`}>
                          {initialsOf(m.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.kind === "employee" ? m.jobTitle : m.email || `@${m.username}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {m.kind === "user" && (
                            <button type="button" title="View" onClick={() => { setViewUserTarget(m.raw); setViewUserOpen(true); }}
                              className="rounded p-1 text-muted-foreground hover:text-foreground">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button type="button" title="Change role" onClick={() => { setEditMemberTarget(m); setEditMemberOpen(true); }}
                              className="rounded p-1 text-muted-foreground hover:text-blue-600">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {m.kind === "employee" && <Badge variant="outline" className="text-[9px]">Employee</Badge>}
                        </div>
                      </div>
                    ))}
                    {roleMembers.length > 6 && (
                      <p className="text-xs text-center text-muted-foreground pt-1">
                        +{roleMembers.length - 6} more — see Members tab above
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  RoleListItem — extracted for readability                                   */
/* ──────────────────────────────────────────────────────────────────────────── */

function RoleListItem({ role, active, onSelect, onView, onDelete }: {
  role: { id: string; name: string; builtIn: boolean; users: number };
  active: boolean;
  onSelect: () => void;
  onView: () => void;
  onDelete: (() => void) | null;
}) {
  return (
    <div className={`group flex w-full items-center justify-between rounded-md border p-2 transition-colors ${active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted"}`}>
      <button type="button" onClick={onSelect} className="flex flex-1 items-center gap-2 text-left min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium">
          {initialsOf(role.name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{role.name}</p>
          <p className="text-xs text-muted-foreground">
            {role.users} {role.builtIn ? "user" : "employee"}{role.users !== 1 ? "s" : ""}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" title="View permissions" onClick={(e) => { e.stopPropagation(); onView(); }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Eye className="h-3.5 w-3.5" />
        </button>
        {onDelete ? (
          <button type="button" title="Delete role" onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="p-1 text-muted-foreground/20 cursor-not-allowed" title="Built-in roles cannot be deleted">
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}