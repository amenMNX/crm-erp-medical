// /home/claude/src/routes/roles_permission.tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Eye,
  Loader2,
  Lock,
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
import { fetchEmployees, type ApiEmployee } from "@/lib/employees-api";

export const Route = createFileRoute("/roles_permission")({
  component: RolesPermissionsPage,
});

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Types & Constants                                                           */
/* ──────────────────────────────────────────────────────────────────────────── */

type RoleDef = { id: string; name: string; builtIn: boolean };

// Unified member shape for rendering in the Users tab
type RoleMember =
  | { kind: "user"; id: number; name: string; email: string; username: string; is_active: boolean; is_superuser: boolean; raw: ApiUser }
  | { kind: "employee"; id: number; name: string; email: string; username: string; is_active: boolean; is_superuser: false; jobTitle: string };

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

function effectiveRoleId(u: ApiUser) {
  if (u.is_superuser) return "admin";
  return u.profile?.role || DEFAULT_ROLE_ID;
}

const HIGH_PRIVILEGE_ROLES = new Set(["admin", "manager"]);

type PermissionState = "allowed" | "denied" | "na";

type ModuleDef = {
  name: string;
  hasWrite: boolean;
  icon: string;
  description: string;
  defaultWriteRoles: string[];
};

const MODULES: ModuleDef[] = [
  { name: "Dashboard", hasWrite: false, icon: "📊", description: "Overview & analytics", defaultWriteRoles: [] },
  { name: "Patients", hasWrite: true, icon: "🧑‍⚕️", description: "Patient records & history", defaultWriteRoles: ["admin", "doctor", "secretary"] },
  { name: "Appointments", hasWrite: true, icon: "📅", description: "Scheduling & calendars", defaultWriteRoles: ["admin", "doctor", "secretary"] },
  { name: "Complaints", hasWrite: true, icon: "📋", description: "Patient complaints", defaultWriteRoles: ["admin", "doctor", "secretary"] },
  { name: "Tickets", hasWrite: true, icon: "🎫", description: "Support tickets", defaultWriteRoles: ["admin", "support_client", "secretary"] },
  { name: "Employees", hasWrite: true, icon: "👥", description: "Staff management", defaultWriteRoles: ["admin", "hr"] },
  { name: "Leaves & Absences", hasWrite: true, icon: "🏖️", description: "Leave requests", defaultWriteRoles: ["admin", "hr"] },
  { name: "Invoices & Payments", hasWrite: true, icon: "💳", description: "Billing & finance", defaultWriteRoles: ["admin", "accountant"] },
  { name: "CNAM Claims", hasWrite: true, icon: "📑", description: "Insurance claims", defaultWriteRoles: ["admin", "accountant"] },
  { name: "Protocols", hasWrite: true, icon: "🔬", description: "Treatment protocols", defaultWriteRoles: ["admin", "doctor"] },
  { name: "Stocks", hasWrite: true, icon: "📦", description: "Inventory management", defaultWriteRoles: ["admin", "secretary"] },
  { name: "Formations", hasWrite: true, icon: "🎓", description: "Training sessions", defaultWriteRoles: ["admin", "hr"] },
  { name: "Payroll", hasWrite: true, icon: "💰", description: "Salary & payroll", defaultWriteRoles: ["admin", "accountant", "hr"] },
  { name: "Roles & Permissions", hasWrite: false, icon: "🔐", description: "Admin only", defaultWriteRoles: [] },
  { name: "Audit Log", hasWrite: false, icon: "📋", description: "System audit trail", defaultWriteRoles: [] },
];

/* ──────────────────────────────────────────────────────────────────────────── */
/*  API helpers                                                                */
/* ──────────────────────────────────────────────────────────────────────────── */

type ApiRolePermission = {
  id: number;
  role_name: string;
  write_permissions: string[];
  is_built_in: boolean;
  created_at: string;
  updated_at: string;
};

function fetchAllRolePermissions(): Promise<ApiRolePermission[]> {
  return apiFetch<ApiRolePermission[] | { results: ApiRolePermission[] }>(
    "/accounts/all-role-permissions/"
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

function createRole(payload: {
  role_name: string;
  write_permissions: string[];
}): Promise<ApiRolePermission> {
  return apiFetch("/accounts/role-permissions/", { 
    method: "POST", 
    body: payload 
  });
}

function deleteRole(id: number): Promise<void> {
  return apiFetch(`/accounts/role-permissions/${id}/`, { method: "DELETE" });
}

function updateRolePermissions(
  id: number,
  payload: { write_permissions: string[] }
): Promise<ApiRolePermission> {
  return apiFetch<ApiRolePermission>(`/accounts/role-permissions/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Permission logic                                                            */
/* ──────────────────────────────────────────────────────────────────────────── */

function buildWritePermissionsMap(rolePermissions: ApiRolePermission[]) {
  const map: Record<string, string[]> = {};
  for (const role of rolePermissions) {
    const roleId = role.is_built_in ? role.role_name.toLowerCase() : String(role.id);
    for (const moduleName of role.write_permissions) {
      // Skip view denial entries for write map
      if (moduleName.startsWith('noview:')) continue;
      if (!map[moduleName]) map[moduleName] = [];
      map[moduleName] = Array.from(
        new Set([...map[moduleName], roleId])
      );
    }
  }
  return map;
}

function buildViewDenialsMap(rolePermissions: ApiRolePermission[]) {
  const map: Record<string, string[]> = {};
  for (const role of rolePermissions) {
    const roleId = role.is_built_in ? role.role_name.toLowerCase() : String(role.id);
    for (const perm of role.write_permissions) {
      if (perm.startsWith('noview:')) {
        const moduleName = perm.substring(7); // remove 'noview:' prefix
        if (!map[moduleName]) map[moduleName] = [];
        map[moduleName] = Array.from(
          new Set([...map[moduleName], roleId])
        );
      }
    }
  }
  return map;
}

function permissionsForRole(
  roleId: string,
  writePermissions: Record<string, string[]>,
  viewDenials: Record<string, string[]>
): Record<string, { view: PermissionState; write: PermissionState }> {
  const result: Record<
    string,
    { view: PermissionState; write: PermissionState }
  > = {};
  for (const mod of MODULES) {
    if (!mod.hasWrite) {
      // For modules without write, view is always allowed
      result[mod.name] = { view: "allowed", write: "na" };
    } else {
      const writeAllowed = (writePermissions[mod.name] ?? []).includes(roleId);
      const viewDenied = (viewDenials[mod.name] ?? []).includes(roleId);
      result[mod.name] = {
        view: viewDenied ? "denied" : "allowed",
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
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
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
/*  Sub-components                                                              */
/* ──────────────────────────────────────────────────────────────────────────── */

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
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
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

function Donut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-muted"
        strokeWidth={14}
      />
      {segments.map((seg) => {
        const length = (seg.value / total) * circumference;
        const dashArray = `${length} ${circumference - length}`;
        const dashOffset = -offset;
        offset += length;
        return (
          <circle
            key={seg.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={14}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </svg>
  );
}

function PermCell({
  state,
  onClick,
  disabled = false,
}: {
  state: PermissionState;
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (state === "na")
    return (
      <span className="flex items-center justify-center text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
      </span>
    );

  const on = state === "allowed";

  if (!onClick || disabled) {
    return (
      <span
        className={`mx-auto flex h-5 w-9 items-center rounded-full ${
          on ? "bg-emerald-500" : "bg-muted"
        } opacity-50 cursor-not-allowed`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? "Granted — click to revoke" : "Denied — click to grant"}
      className={`mx-auto flex h-5 w-9 items-center rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-muted"
      } cursor-pointer hover:opacity-80`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Dialogs                                                                     */
/* ──────────────────────────────────────────────────────────────────────────── */

function UserDetailDialog({
  user,
  roleDefs,
  open,
  onClose,
}: {
  user: ApiUser | null;
  roleDefs: RoleDef[];
  open: boolean;
  onClose: () => void;
}) {
  if (!user) return null;
  const name = displayName(user);
  const roleName =
    roleDefs.find((r) => r.id === effectiveRoleId(user))?.name ?? "User";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold ${avatarColor(name)}`}
            >
              {initialsOf(name)}
            </div>
            <div>
              <p className="text-base font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
              <Badge
                variant={user.is_active ? "outline" : "destructive"}
                className="mt-1 text-[10px]"
              >
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          <div className="rounded-lg border divide-y text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email || "—"}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="secondary">{roleName}</Badge>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Department</span>
              <span className="font-medium">
                {user.profile?.department || "—"}
              </span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">
                {user.profile?.phone || "—"}
              </span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Staff</span>
              <span className="font-medium">
                {user.is_staff ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Superuser</span>
              <span className="font-medium">
                {user.is_superuser ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Joined</span>
              <span className="font-medium">
                {new Date(user.date_joined).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserRoleDialog({
  user,
  roleDefs,
  open,
  onClose,
  onSave,
  isPending,
}: {
  user: ApiUser | null;
  roleDefs: RoleDef[];
  open: boolean;
  onClose: () => void;
  onSave: (userId: number, role: string) => void;
  isPending: boolean;
}) {
  const [selectedRole, setSelectedRole] = useState("");

  useEffect(() => {
    if (user) setSelectedRole(effectiveRoleId(user));
  }, [user]);

  if (!user) return null;
  const name = displayName(user);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Role — {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current role:{" "}
            <strong>
              {roleDefs.find((r) => r.id === effectiveRoleId(user))?.name ??
                "User"}
            </strong>
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New role</label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roleDefs
                  .filter((r) => r.id !== "user")
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {!r.builtIn && " (custom)"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedRole) onSave(user.id, selectedRole);
            }}
            disabled={isPending || !selectedRole}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewRoleDialog({
  role,
  matrix,
  userCount,
  open,
  onClose,
}: {
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
            {!role.builtIn && (
              <Badge variant="outline" className="text-[10px]">
                Custom
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {userCount} user{userCount !== 1 ? "s" : ""} assigned •{" "}
            {role.builtIn ? "Built-in role" : "Custom role"}
          </p>
          <div className="overflow-x-auto rounded-md border max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b bg-muted/40">
                  <th className="p-2.5 text-left font-medium text-muted-foreground">
                    Module
                  </th>
                  <th className="p-2.5 text-center font-medium text-muted-foreground">
                    View
                  </th>
                  <th className="p-2.5 text-center font-medium text-muted-foreground">
                    Write
                  </th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod) => (
                  <tr key={mod.name} className="border-b last:border-0">
                    <td className="p-2.5">
                      <span className="mr-1.5">{mod.icon}</span>
                      {mod.name}
                    </td>
                    <td className="p-2.5 text-center">
                      <PermCell
                        state={matrix[mod.name]?.view ?? "denied"}
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      <PermCell state={matrix[mod.name]?.write ?? "denied"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Page Component                                                              */
/* ──────────────────────────────────────────────────────────────────────────── */

function RolesPermissionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const meQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    retry: false,
  });

  const isSuperadmin = meQuery.data?.is_superuser === true;
  const isStaff = meQuery.data?.is_staff === true;
  const isAdmin = isSuperadmin || isStaff;

  useEffect(() => {
    if (meQuery.isLoading) return;
    if (!isAdmin) {
      toast.error("Access denied — admin only.");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [meQuery.isLoading, isAdmin, navigate]);

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verifying access…
      </div>
    );
  }
  if (!isAdmin) return null;

  return <RolesPermissionsContent />;
}

/* Inner component */
function RolesPermissionsContent() {
  const queryClient = useQueryClient();

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
  const rolePermissionsQuery = useQuery({
    queryKey: ["role-permissions"],
    queryFn: fetchAllRolePermissions,
    retry: false,
    refetchOnWindowFocus: true,
    onError: (error: any) => {
      if (error?.status === 403 || error?.status === 401) {
        toast.error("You don't have permission to view role permissions.");
      } else {
        toast.error("Failed to load role permissions.");
      }
    },
  });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    refetchOnWindowFocus: true,
  });

  const rolePermissions = rolePermissionsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const roleDefs: RoleDef[] = useMemo(() => {
    const builtIn = BUILT_IN_ROLE_DEFS.map(r => ({
      ...r,
      id: r.id,
    }));
    const custom = rolePermissions
      .filter(r => !r.is_built_in)
      .map(r => ({
        id: String(r.id),
        name: r.role_name,
        builtIn: false,
      }));
    return [...builtIn, ...custom];
  }, [rolePermissions]);

  const [selectedRoleId, setSelectedRoleId] = useState("admin");
  const [roleQuery, setRoleQuery] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"permissions" | "users">("permissions");

  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleModules, setNewRoleModules] = useState<Set<string>>(new Set());

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");

  const [roleToRemove, setRoleToRemove] = useState<RoleDef | null>(null);
  const [viewRoleOpen, setViewRoleOpen] = useState(false);
  const [viewRoleTarget, setViewRoleTarget] = useState<RoleDef | null>(null);

  const [viewUserOpen, setViewUserOpen] = useState(false);
  const [viewUserTarget, setViewUserTarget] = useState<ApiUser | null>(null);
  const [editUserRoleOpen, setEditUserRoleOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<ApiUser | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<ApiUser | null>(null);

  const roles = useMemo(
    () =>
      roleDefs.map((r) => {
        if (r.builtIn) {
          // Built-in roles: count Django users whose profile.role matches
          return { ...r, users: users.filter((u) => effectiveRoleId(u) === r.id).length };
        } else {
          // Custom / auto-provisioned roles: count employees whose role_id matches
          const rolePermission = rolePermissions.find(p => String(p.id) === r.id);
          const count = rolePermission
            ? employees.filter((e) => e.role_id === rolePermission.id).length
            : 0;
          return { ...r, users: count };
        }
      }),
    [roleDefs, users, employees, rolePermissions]
  );

  const filteredRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return roles.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [roles, roleQuery]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  // For built-in roles: members are Django users matched by profile.role.
  // For custom/auto-provisioned roles: members are employees matched by role_id.
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

    // Custom role: find the RolePermission record that backs this role
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
      }));
  }, [roles, selectedRoleId, users, employees, rolePermissions]);

  // Keep a plain ApiUser list for dialogs that need the raw user shape (view/edit)
  const roleUsers = useMemo(
    () => users.filter((u) => effectiveRoleId(u) === selectedRoleId),
    [users, selectedRoleId]
  );

  const filteredRoleMembers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return roleMembers.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
    );
  }, [roleMembers, userSearch]);

  const writePermissionsMap = useMemo(() => {
    return buildWritePermissionsMap(rolePermissions);
  }, [rolePermissions]);

  const viewDenialsMap = useMemo(() => {
    return buildViewDenialsMap(rolePermissions);
  }, [rolePermissions]);

  const matrix = useMemo(
    () => permissionsForRole(selectedRoleId, writePermissionsMap, viewDenialsMap),
    [selectedRoleId, writePermissionsMap, viewDenialsMap]
  );

  const viewRoleMatrix = useMemo(() => {
    if (!viewRoleTarget) return {};
    return permissionsForRole(viewRoleTarget.id, writePermissionsMap, viewDenialsMap);
  }, [viewRoleTarget, writePermissionsMap, viewDenialsMap]);

  const viewRoleUserCount = useMemo(() => {
    if (!viewRoleTarget) return 0;
    if (viewRoleTarget.builtIn) {
      return users.filter((u) => effectiveRoleId(u) === viewRoleTarget.id).length;
    }
    const rp = rolePermissions.find((r) => !r.is_built_in && String(r.id) === viewRoleTarget.id);
    return rp ? employees.filter((e) => e.role_id === rp.id).length : 0;
  }, [viewRoleTarget, users, employees, rolePermissions]);

  const distribution = useMemo(() => {
    let allowed = 0;
    let denied = 0;
    let na = 0;
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

  const pendingLeaves = (leavesQuery.data ?? []).filter(
    (l) => l.statut === "En attente"
  ).length;

  const writeCapableModules = MODULES.filter((m) => m.hasWrite);

  const selectedRolePermission = useMemo(() => {
    if (selectedRole?.builtIn) {
      return rolePermissions.find(
        r => r.is_built_in && r.role_name.toLowerCase() === selectedRole.id
      );
    }
    return rolePermissions.find(
      r => !r.is_built_in && String(r.id) === selectedRole?.id
    );
  }, [selectedRole, rolePermissions]);

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      updateUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Role updated successfully");
      setEditUserRoleOpen(false);
      setEditUserTarget(null);
      setAssignOpen(false);
      setAssignUserId("");
    },
    onError: (err: any) => {
      const msg = err?.data?.detail || "Failed to update role";
      toast.error(msg);
    },
  });

  const togglePermMutation = useMutation({
    mutationFn: ({
      id,
      write_permissions,
    }: {
      id: number;
      write_permissions: string[];
    }) => updateRolePermissions(id, { write_permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Permissions updated");
    },
    onError: () => toast.error("Failed to update permissions"),
  });

  const addRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: async (created) => {
      // Invalidate queries to trigger refetch
      await queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      // Wait for the queries to refetch
      await queryClient.refetchQueries({ queryKey: ["role-permissions"] });
      await queryClient.refetchQueries({ queryKey: ["users"] });
      // Close the dialog and reset form
      setAddRoleOpen(false);
      setNewRoleName("");
      setNewRoleModules(new Set());
      toast.success(`Role "${created.role_name}" created successfully`);
      // Set selected role after refetch
      setSelectedRoleId(String(created.id));
    },
    onError: (err: any) => {
      const msg = err?.data?.detail || err?.data?.role_name?.[0] || "Failed to create role";
      toast.error(msg);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      if (roleToRemove && selectedRoleId === String(roleToRemove.id))
        setSelectedRoleId("admin");
      toast.success(`Role "${roleToRemove?.name}" deleted`);
      setRoleToRemove(null);
    },
    onError: (err: any) => {
      const msg = err?.data?.detail || "Failed to delete role";
      toast.error(msg);
    },
  });

  const deactivateUserMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/accounts/users/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deactivated");
      setDeleteUserTarget(null);
    },
    onError: () => toast.error("Failed to deactivate user"),
  });

  function toggleWritePermission(moduleName: string) {
    if (!selectedRole || !selectedRolePermission) return;
    const currentPerms = new Set(selectedRolePermission.write_permissions);
    // Remove any view denial entries for this module
    const viewKey = `noview:${moduleName}`;
    if (currentPerms.has(viewKey)) {
      // If view is denied, don't allow write
      toast.error("Cannot grant write access. View is denied for this module.");
      return;
    }
    if (currentPerms.has(moduleName)) {
      currentPerms.delete(moduleName);
    } else {
      currentPerms.add(moduleName);
    }
    togglePermMutation.mutate({
      id: selectedRolePermission.id,
      write_permissions: Array.from(currentPerms),
    });
  }

  function toggleViewPermission(moduleName: string) {
    if (!selectedRole || !selectedRolePermission) return;
    const currentPerms = new Set(selectedRolePermission.write_permissions);
    const viewKey = `noview:${moduleName}`;
    const viewDenied = currentPerms.has(viewKey);
    
    if (viewDenied) {
      // Enable view: remove the denial
      currentPerms.delete(viewKey);
    } else {
      // Disable view: add denial and also remove write
      currentPerms.add(viewKey);
      currentPerms.delete(moduleName);
    }
    
    togglePermMutation.mutate({
      id: selectedRolePermission.id,
      write_permissions: Array.from(currentPerms),
    });
  }

  function submitAddRole(e: FormEvent) {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return toast.error("Please provide a role name");
    if (roleDefs.some((r) => r.name.toLowerCase() === name.toLowerCase()))
      return toast.error("A role with this name already exists");
    addRoleMutation.mutate({
      role_name: name,
      write_permissions: Array.from(newRoleModules),
    });
  }

  function submitAssign(e: FormEvent) {
    e.preventDefault();
    if (!assignUserId) return;
    updateRoleMutation.mutate({
      userId: Number(assignUserId),
      role: selectedRoleId,
    });
  }

  function confirmDeleteRole() {
    if (!roleToRemove) return;
    if (roleToRemove.builtIn) {
      toast.error("Built-in roles cannot be deleted");
      return;
    }
    const id = Number(roleToRemove.id);
    if (!isNaN(id) && id > 0) deleteRoleMutation.mutate(id);
  }

  const removeUsersBlocking = useMemo(() => {
    if (!roleToRemove) return 0;
    if (roleToRemove.builtIn) {
      return users.filter((u) => effectiveRoleId(u) === roleToRemove.id).length;
    }
    const rp = rolePermissions.find((r) => !r.is_built_in && String(r.id) === roleToRemove.id);
    return rp ? employees.filter((e) => e.role_id === rp.id).length : 0;
  }, [roleToRemove, users, employees, rolePermissions]);

  const pct = (v: number) => Math.round((v / distribution.total) * 100);
  const isLoading = usersQuery.isLoading || rolePermissionsQuery.isLoading;

  return (
    <AppShell
      title="Roles & Permissions"
      actions={
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:flex items-center gap-1 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
            <Lock className="h-3 w-3" /> Admin Only
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["users"] });
              queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
              queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
              toast.success("Data refreshed");
            }}
            disabled={
              usersQuery.isFetching ||
              leavesQuery.isFetching ||
              rolePermissionsQuery.isFetching
            }
          >
            {usersQuery.isFetching ||
            leavesQuery.isFetching ||
            rolePermissionsQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>

          <Button variant="outline" size="sm" onClick={() => setAddRoleOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Add Role</span>
          </Button>

          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <UserCog className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Assign Role</span>
          </Button>
        </div>
      }
    >
      {/* Dialogs */}
      <ViewRoleDialog
        role={viewRoleTarget}
        matrix={viewRoleMatrix}
        userCount={viewRoleUserCount}
        open={viewRoleOpen}
        onClose={() => { setViewRoleOpen(false); setViewRoleTarget(null); }}
      />

      <UserDetailDialog
        user={viewUserTarget}
        roleDefs={roleDefs}
        open={viewUserOpen}
        onClose={() => { setViewUserOpen(false); setViewUserTarget(null); }}
      />

      <EditUserRoleDialog
        user={editUserTarget}
        roleDefs={roleDefs}
        open={editUserRoleOpen}
        onClose={() => { setEditUserRoleOpen(false); setEditUserTarget(null); }}
        onSave={(userId, role) => updateRoleMutation.mutate({ userId, role })}
        isPending={updateRoleMutation.isPending}
      />

      {/* Deactivate User Confirm */}
      <Dialog
        open={deleteUserTarget !== null}
        onOpenChange={(o) => !o && setDeleteUserTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate user?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will deactivate{" "}
            <strong>{deleteUserTarget ? displayName(deleteUserTarget) : ""}</strong>.
            They will lose access immediately but their data is preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deactivateUserMutation.isPending}
              onClick={() => {
                if (deleteUserTarget)
                  deactivateUserMutation.mutate(deleteUserTarget.id);
              }}
            >
              {deactivateUserMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirm */}
      <Dialog
        open={roleToRemove !== null}
        onOpenChange={(o) => !o && setRoleToRemove(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{roleToRemove?.name}"?</DialogTitle>
          </DialogHeader>
          {roleToRemove?.builtIn ? (
            <p className="text-sm text-muted-foreground">
              This is a built-in role and cannot be deleted.
            </p>
          ) : removeUsersBlocking > 0 ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <strong>{removeUsersBlocking}</strong>{" "}
                {roleToRemove && !roleToRemove.builtIn ? "employee" : "user"}
                {removeUsersBlocking !== 1 ? "s are" : " is"} assigned to this
                role. Reassign them first, then delete the role.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This will permanently delete the role and all its permission
              entries. No members are currently assigned to it.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                Boolean(roleToRemove?.builtIn) ||
                removeUsersBlocking > 0 ||
                deleteRoleMutation.isPending
              }
              onClick={confirmDeleteRole}
            >
              {deleteRoleMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <Trash2 className="h-4 w-4" /> Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Role Dialog */}
      <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
        <DialogContent className="max-w-md">
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
                View access is granted to every role by default. Select which
                modules this role can create, edit, or delete.
              </p>
              <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3 max-h-[200px] overflow-y-auto">
                {writeCapableModules.map((mod) => (
                  <label
                    key={mod.name}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-0.5"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded"
                      checked={newRoleModules.has(mod.name)}
                      onChange={() => {
                        setNewRoleModules((prev) => {
                          const next = new Set(prev);
                          if (next.has(mod.name)) next.delete(mod.name);
                          else next.add(mod.name);
                          return next;
                        });
                      }}
                    />
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
              <Button type="submit" disabled={addRoleMutation.isPending || !newRoleName.trim()}>
                {addRoleMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Role
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Role Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <form onSubmit={submitAssign} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Assign a role to a user</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Select user</label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {displayName(u)} — currently{" "}
                      {roleDefs.find((r) => r.id === effectiveRoleId(u))?.name ??
                        "User"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Will assign role:{" "}
              <strong className="text-foreground">{selectedRole?.name}</strong>
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateRoleMutation.isPending || !assignUserId}
              >
                {updateRoleMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Assign
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
            <StatCard
              icon={Shield}
              iconClass="bg-blue-100 text-blue-600"
              label="Total Roles"
              value={roles.length}
              sub={`${BUILT_IN_ROLE_DEFS.length} built-in • ${rolePermissions.filter(r => !r.is_built_in).length} custom`}
            />
            <StatCard
              icon={Users}
              iconClass="bg-violet-100 text-violet-600"
              label="Active Users"
              value={users.filter((u) => u.is_active).length}
              sub={`${users.length} total accounts`}
            />
            <StatCard
              icon={ShieldAlert}
              iconClass="bg-emerald-100 text-emerald-600"
              label="Superusers"
              value={users.filter((u) => u.is_superuser).length}
              sub="Full Django access"
            />
            <StatCard
              icon={ShieldCheck}
              iconClass="bg-amber-100 text-amber-600"
              label="Pending Leaves"
              value={pendingLeaves}
              sub="Awaiting approval"
            />
          </div>

          {/* 3-column workspace */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr_300px]">
            {/* ── Roles list ────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Roles</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddRoleOpen(true)}
                  title="Add role"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={roleQuery}
                    onChange={(e) => setRoleQuery(e.target.value)}
                    placeholder="Search roles…"
                    className="pl-9"
                  />
                  {roleQuery && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setRoleQuery("")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-[460px] overflow-y-auto pr-0.5">
                  {filteredRoles.map((role) => {
                    const active = role.id === selectedRole?.id;
                    return (
                      <div
                        key={role.id}
                        className={`group flex w-full items-center justify-between rounded-md border p-2.5 transition-colors ${
                          active
                            ? "border-primary/40 bg-primary/5"
                            : "border-transparent hover:bg-muted"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedRoleId(role.id)}
                          className="flex flex-1 items-center gap-2.5 text-left"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium">
                            {initialsOf(role.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium leading-tight">
                                {role.name}
                              </p>
                              {!role.builtIn && (
                                <Badge
                                  variant="outline"
                                  className="px-1 py-0 text-[9px] leading-4"
                                >
                                  Custom
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {role.users} user{role.users !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </button>

                        {/* Action buttons - always visible */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            title="View permissions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewRoleTarget(role);
                              setViewRoleOpen(true);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title={role.builtIn ? "Built-in roles cannot be deleted" : "Delete role"}
                            disabled={role.builtIn}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!role.builtIn) setRoleToRemove(role);
                            }}
                            className={`rounded p-1 transition-colors ${
                              role.builtIn
                                ? "cursor-not-allowed text-muted-foreground/30"
                                : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredRoles.length === 0 && (
                    <p className="p-2.5 text-xs text-muted-foreground">
                      No roles match "{roleQuery}".
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Permissions matrix + Users tab ───────────────────────── */}
            <Card>
              <CardHeader className="space-y-0 pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">
                      {selectedRole?.name ?? "—"}
                    </CardTitle>
                    {selectedRole && HIGH_PRIVILEGE_ROLES.has(selectedRole.id) && (
                      <Badge variant="destructive" className="text-[10px]">
                        High privilege
                      </Badge>
                    )}
                    {selectedRole && !selectedRole.builtIn && (
                      <Badge variant="outline" className="text-[10px]">
                        Custom
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssignOpen(true)}
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    <span className="ml-1.5 hidden sm:inline">Assign User</span>
                  </Button>
                </div>
                <div className="mt-3 flex border-b">
                  {(["permissions", "users"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "permissions"
                        ? `Permissions`
                        : `Members (${roleMembers.length})`}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-3">
                {activeTab === "permissions" && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="p-3 text-left font-medium text-muted-foreground">
                              Module
                            </th>
                            <th className="p-3 text-center font-medium text-muted-foreground">
                              View
                            </th>
                            <th className="p-3 text-center font-medium text-muted-foreground">
                              Create / Edit / Delete
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {MODULES.map((mod) => (
                            <tr
                              key={mod.name}
                              className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                            >
                              <td className="p-3">
                                <div>
                                  <span className="mr-1.5">{mod.icon}</span>
                                  <span className="font-medium">{mod.name}</span>
                                  <p className="text-xs text-muted-foreground">
                                    {mod.description}
                                  </p>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <PermCell
                                  state={matrix[mod.name]?.view ?? "denied"}
                                  onClick={
                                    mod.hasWrite && selectedRolePermission
                                      ? () => toggleViewPermission(mod.name)
                                      : undefined
                                  }
                                  disabled={!selectedRolePermission || !mod.hasWrite}
                                />
                              </td>
                              <td className="p-3 text-center">
                                <PermCell
                                  state={matrix[mod.name]?.write ?? "denied"}
                                  onClick={
                                    mod.hasWrite && selectedRolePermission
                                      ? () => toggleWritePermission(mod.name)
                                      : undefined
                                  }
                                  disabled={!selectedRolePermission || !mod.hasWrite}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Toggle view or write access for this role. Changes persist to the backend immediately.
                    </p>
                  </div>
                )}

                {activeTab === "users" && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search members…"
                        className="pl-9"
                      />
                      {userSearch && (
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setUserSearch("")}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {filteredRoleMembers.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {roleMembers.length === 0
                          ? selectedRole?.builtIn
                            ? "No users have this role."
                            : "No employees have been assigned this role yet. Add an employee with a matching job title."
                          : "No members match your search."}
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-[380px] overflow-y-auto">
                        {filteredRoleMembers.map((m) => (
                          <div
                            key={`${m.kind}-${m.id}`}
                            className="group flex items-center gap-3 rounded-md border p-2.5 hover:bg-muted/40 transition-colors"
                          >
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(m.name)}`}
                            >
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
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!m.is_active && (
                                <Badge variant="destructive" className="text-[9px]">
                                  Inactive
                                </Badge>
                              )}
                              {m.kind === "employee" && (
                                <Badge variant="outline" className="text-[9px]">
                                  Employee
                                </Badge>
                              )}
                              {m.kind === "user" && m.is_superuser && (
                                <Badge variant="secondary" className="text-[9px]">
                                  Superuser
                                </Badge>
                              )}
                              {m.kind === "user" && (
                                <>
                                  <button
                                    type="button"
                                    title="View user"
                                    onClick={() => {
                                      setViewUserTarget(m.raw);
                                      setViewUserOpen(true);
                                    }}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Edit role"
                                    onClick={() => {
                                      setEditUserTarget(m.raw);
                                      setEditUserRoleOpen(true);
                                    }}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-blue-600"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  {m.is_active && !m.is_superuser && (
                                    <button
                                      type="button"
                                      title="Deactivate user"
                                      onClick={() => setDeleteUserTarget(m.raw)}
                                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
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
                      {selectedRole?.builtIn
                        ? "Built-in role"
                        : "Custom role (editable)"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">
                    Members ({roleMembers.length})
                  </p>
                  {roleMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No members assigned.
                    </p>
                  ) : (
                    <div className="flex flex-wrap -space-x-2">
                      {roleMembers.slice(0, 8).map((m) => (
                        <button
                          key={`${m.kind}-${m.id}`}
                          type="button"
                          title={m.name}
                          onClick={() => {
                            if (m.kind === "user") {
                              setViewUserTarget(m.raw);
                              setViewUserOpen(true);
                            }
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold transition-transform hover:z-10 hover:scale-110 ${avatarColor(m.name)} ${m.kind === "employee" ? "cursor-default" : "cursor-pointer"}`}
                        >
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

                <div>
                  <p className="mb-2 text-sm font-medium">
                    Permission Summary
                  </p>
                  <div className="space-y-1.5">
                    {[
                      {
                        label: "View access",
                        count: MODULES.filter(m => matrix[m.name]?.view === "allowed").length,
                        color: "text-emerald-600",
                      },
                      {
                        label: "Write access",
                        count: MODULES.filter(m => matrix[m.name]?.write === "allowed").length,
                        color: "text-blue-600",
                      },
                      {
                        label: "View denied",
                        count: MODULES.filter(m => matrix[m.name]?.view === "denied").length,
                        color: "text-rose-500",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground">
                          {item.label}
                        </span>
                        <span className={`font-medium ${item.color}`}>
                          {item.count}/{MODULES.length}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewRoleTarget(selectedRole ?? null);
                    setViewRoleOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4" /> View Full Permissions
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignOpen(true)}
                >
                  <UserCog className="h-4 w-4" /> Assign a user
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  disabled={!selectedRole || selectedRole.builtIn}
                  title={selectedRole?.builtIn ? "Built-in roles cannot be deleted" : "Delete this role"}
                  onClick={() => {
                    if (selectedRole && !selectedRole.builtIn)
                      setRoleToRemove(selectedRole);
                  }}
                >
                  <Trash2 className={`h-4 w-4 ${!selectedRole || selectedRole.builtIn ? "" : "text-destructive"}`} />
                  <span className={!selectedRole || selectedRole.builtIn ? "" : "text-destructive"}>
                    Delete role
                  </span>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Permission Distribution — {selectedRole?.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6 p-4 pt-0">
                <div className="relative shrink-0">
                  <Donut
                    segments={[
                      {
                        label: "Allowed",
                        value: distribution.allowed,
                        color: "#10b981",
                      },
                      {
                        label: "Denied",
                        value: distribution.denied,
                        color: "#f43f5e",
                      },
                      {
                        label: "N/A",
                        value: distribution.na,
                        color: "#e5e7eb",
                      },
                    ]}
                  />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-semibold">{distribution.total}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Allowed</span>
                    <span className="ml-auto font-medium">
                      {pct(distribution.allowed)}% ({distribution.allowed})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="text-muted-foreground">Denied</span>
                    <span className="ml-auto font-medium">
                      {pct(distribution.denied)}% ({distribution.denied})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                    <span className="text-muted-foreground">N/A</span>
                    <span className="ml-auto font-medium">
                      {pct(distribution.na)}% ({distribution.na})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Members — {selectedRole?.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2 max-h-[220px] overflow-y-auto">
                {roleMembers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {selectedRole?.builtIn
                      ? "No users have this role."
                      : "No employees assigned — add an employee with a matching job title."}
                  </p>
                ) : (
                  <>
                    {roleMembers.slice(0, 6).map((m) => (
                      <div
                        key={`${m.kind}-${m.id}`}
                        className="group flex items-center gap-3 rounded-md p-1.5 hover:bg-muted/40 transition-colors"
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColor(m.name)}`}
                        >
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
                            <>
                              <button
                                type="button"
                                title="View"
                                onClick={() => {
                                  setViewUserTarget(m.raw);
                                  setViewUserOpen(true);
                                }}
                                className="rounded p-1 text-muted-foreground hover:text-foreground"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Edit role"
                                onClick={() => {
                                  setEditUserTarget(m.raw);
                                  setEditUserRoleOpen(true);
                                }}
                                className="rounded p-1 text-muted-foreground hover:text-blue-600"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {m.kind === "employee" && (
                            <Badge variant="outline" className="text-[9px]">
                              Employee
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    {roleMembers.length > 6 && (
                      <p className="text-xs text-center text-muted-foreground pt-1">
                        +{roleMembers.length - 6} more — use the Members tab above to see all
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