import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ChevronDown,
  ClipboardList,
  Filter,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react";
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

export const Route = createFileRoute("/roles _permission")({
  component: RolesPermissionsPage,
});

/* ------------------------------------------------------------------ */
/*  Types & mock data                                                  */
/* ------------------------------------------------------------------ */

type Role = {
  id: string;
  name: string;
  users: number;
  archived?: boolean;
};

type PermissionState = "allowed" | "denied" | "na";
type Action = "View" | "Create" | "Edit" | "Delete" | "Export" | "Approve";
type ModuleName =
  | "Dashboard"
  | "Patients"
  | "Studies"
  | "Images"
  | "Reports"
  | "AI Analysis"
  | "Billing"
  | "Analytics"
  | "Settings";

const actions: Action[] = ["View", "Create", "Edit", "Delete", "Export", "Approve"];
const modules: ModuleName[] = [
  "Dashboard",
  "Patients",
  "Studies",
  "Images",
  "Reports",
  "AI Analysis",
  "Billing",
  "Analytics",
  "Settings",
];

const initialRoles: Role[] = [
  { id: "radiologist", name: "Radiologist", users: 32 },
  { id: "technician", name: "Radiology Technician", users: 28 },
  { id: "resident", name: "Radiology Resident", users: 18 },
  { id: "physician", name: "Referring Physician", users: 22 },
  { id: "assistant", name: "Medical Assistant", users: 12 },
  { id: "billing", name: "Billing Coordinator", users: 8 },
  { id: "admin", name: "Administrator", users: 4 },
  { id: "readonly", name: "Read-Only User", users: 0 },
];

const defaultMatrix: Record<ModuleName, Record<Action, PermissionState>> = {
  Dashboard: { View: "allowed", Create: "allowed", Edit: "allowed", Delete: "denied", Export: "allowed", Approve: "allowed" },
  Patients: { View: "allowed", Create: "allowed", Edit: "allowed", Delete: "denied", Export: "allowed", Approve: "denied" },
  Studies: { View: "allowed", Create: "denied", Edit: "allowed", Delete: "denied", Export: "allowed", Approve: "denied" },
  Images: { View: "allowed", Create: "allowed", Edit: "allowed", Delete: "denied", Export: "allowed", Approve: "denied" },
  Reports: { View: "allowed", Create: "allowed", Edit: "allowed", Delete: "allowed", Export: "allowed", Approve: "allowed" },
  "AI Analysis": { View: "allowed", Create: "denied", Edit: "denied", Delete: "denied", Export: "allowed", Approve: "allowed" },
  Billing: { View: "allowed", Create: "denied", Edit: "denied", Delete: "denied", Export: "denied", Approve: "denied" },
  Analytics: { View: "allowed", Create: "denied", Edit: "denied", Delete: "denied", Export: "allowed", Approve: "denied" },
  Settings: { View: "na", Create: "na", Edit: "na", Delete: "na", Export: "na", Approve: "na" },
};

const assignedUsers = ["MK", "AS", "JB", "FR", "TN", "LC"];
const departments = ["Radiology", "Imaging", "Neuroradiology"];

const recentChanges = [
  {
    id: 1,
    icon: Shield,
    text: "Dr. Asma Bejdidi updated permissions for role Radiologist",
    time: "May 12, 2025 at 10:45 AM",
  },
  {
    id: 2,
    icon: Plus,
    text: "Sarah Ben Ali added new role \u201cRadiology Resident\u201d",
    time: "May 11, 2025 at 02:32 PM",
  },
  {
    id: 3,
    icon: Activity,
    text: "System updated permissions for AI Analysis module",
    time: "May 10, 2025 at 11:08 AM",
  },
];

const hierarchy = {
  root: { name: "Administrator" },
  mid: { name: "Clinical Roles" },
  leaves: [
    { name: "Radiologist", users: 32 },
    { name: "Technologist", users: 28 },
    { name: "Resident", users: 18 },
    { name: "Referring Physician", users: 22 },
  ],
};

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 96;
  const height = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24 overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  delta,
  sparkline,
  sparklineColor,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: string | number;
  delta: string;
  sparkline: number[];
  sparklineColor: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{delta}</p>
          </div>
        </div>
        <Sparkline data={sparkline} color={sparklineColor} />
      </CardContent>
    </Card>
  );
}

function Toggle({ state, onClick }: { state: PermissionState; onClick: () => void }) {
  if (state === "na") {
    return <span className="block text-center text-muted-foreground">—</span>;
  }

  const on = state === "allowed";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative mx-auto flex h-5 w-9 items-center rounded-full transition-colors ${
        on ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getDefaultUsersForRole(name: string) {
  const normalizedName = name.toLowerCase();
  const professionMap: Record<string, number> = {
    radiologist: 32,
    technician: 28,
    resident: 18,
    physician: 22,
    assistant: 12,
    billing: 8,
    admin: 4,
    "read-only": 0,
  };

  for (const [keyword, users] of Object.entries(professionMap)) {
    if (normalizedName.includes(keyword)) {
      return users;
    }
  }

  return 0;
}

function Donut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
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

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

function RolesPermissionsPage() {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState(initialRoles);
  const [selectedRoleId, setSelectedRoleId] = useState(initialRoles[0].id);
  const [roleQuery, setRoleQuery] = useState("");
  const [matrix, setMatrix] = useState(defaultMatrix);
  const [dirty, setDirty] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null,
    [roles, selectedRoleId],
  );

  const filteredRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return roles.filter((role) => !q || role.name.toLowerCase().includes(q));
  }, [roleQuery]);

  const distribution = useMemo(() => {
    let allowed = 0;
    let denied = 0;
    let na = 0;

    for (const module of modules) {
      for (const action of actions) {
        const state = matrix[module][action];
        if (state === "allowed") allowed += 1;
        else if (state === "denied") denied += 1;
        else na += 1;
      }
    }

    return { allowed, denied, na, total: allowed + denied + na };
  }, [matrix]);

  function addRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();

    if (!name) return;

    const id = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const newRole: Role = {
      id,
      name,
      users: getDefaultUsersForRole(name),
    };

    setRoles((current) => [newRole, ...current]);
    setSelectedRoleId(id);
    setOpen(false);
    event.currentTarget.reset();
  }

  function toggleCell(module: ModuleName, action: Action) {
    setMatrix((current) => {
      const cell = current[module][action];
      if (cell === "na") return current;
      return {
        ...current,
        [module]: {
          ...current[module],
          [action]: cell === "allowed" ? "denied" : "allowed",
        },
      };
    });
    setDirty(true);
  }

  function removeRole() {
    if (!selectedRole) return;

    const confirmed = window.confirm(`Remove role "${selectedRole.name}"?`);
    if (!confirmed) return;

    const remainingRoles = roles.filter((role) => role.id !== selectedRole.id);
    setRoles(remainingRoles);

    if (remainingRoles.length > 0) {
      setSelectedRoleId(remainingRoles[0].id);
    } else {
      setSelectedRoleId("");
    }

    setDirty(true);
  }

  const pct = (value: number) => Math.round((value / distribution.total) * 100);

  return (
    <AppShell
      title="Roles & Permissions"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Create Role
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addRole} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Create role</DialogTitle>
              </DialogHeader>

              <Input name="name" placeholder="Role name" required />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        {/* Stat summary row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            iconClass="bg-blue-100 text-blue-600"
            label="Total Roles"
            value={roles.length}
            delta="↗ 2 new this month"
            sparkline={[3, 5, 4, 6, 5, 7, 8]}
            sparklineColor="#2563eb"
          />
          <StatCard
            icon={Users}
            iconClass="bg-violet-100 text-violet-600"
            label="Active Users"
            value={124}
            delta="↗ 18 this week"
            sparkline={[80, 95, 88, 104, 96, 112, 124]}
            sparklineColor="#7c3aed"
          />
          <StatCard
            icon={ShieldAlert}
            iconClass="bg-emerald-100 text-emerald-600"
            label="High Privilege Roles"
            value={3}
            delta="View and review"
            sparkline={[2, 2, 3, 3, 3, 3, 3]}
            sparklineColor="#059669"
          />
          <StatCard
            icon={ClipboardList}
            iconClass="bg-amber-100 text-amber-600"
            label="Pending Requests"
            value={5}
            delta="↗ 2 awaiting approval"
            sparkline={[1, 3, 2, 4, 3, 5, 5]}
            sparklineColor="#d97706"
          />
        </div>

        {/* Main 3-column workspace */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr_320px]">
          {/* Roles list */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Roles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={roleQuery}
                    onChange={(event) => setRoleQuery(event.target.value)}
                    placeholder="Search roles..."
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" size="icon" aria-label="Filter roles">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1">
                {filteredRoles.map((role) => {
                  const active = role.id === selectedRole?.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`flex w-full items-center justify-between rounded-md border p-2.5 text-left transition-colors ${
                        active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium">
                          {initialsOf(role.name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-tight">{role.name}</p>
                          <p className="text-xs text-muted-foreground">{role.users} users</p>
                        </div>
                      </div>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Permissions matrix */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Permissions for</CardTitle>
                <Badge variant="outline" className="gap-1 font-medium">
                  {selectedRole?.name ?? "No role selected"} <ChevronDown className="h-3 w-3" />
                </Badge>
              </div>
              <Button variant="outline" size="sm">
                Bulk Actions
              </Button>
            </CardHeader>

            <CardContent className="space-y-3 p-4 pt-0">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="p-3 text-left font-medium text-muted-foreground">Module</th>
                      {actions.map((action) => (
                        <th key={action} className="p-3 text-center font-medium text-muted-foreground">
                          {action}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <tr key={module} className="border-b last:border-0">
                        <td className="p-3 font-medium">{module}</td>
                        {actions.map((action) => (
                          <td key={action} className="p-3">
                            <Toggle
                              state={matrix[module][action]}
                              onClick={() => toggleCell(module, action)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Allowed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" /> Denied
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">—</span> Not applicable
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Role details */}
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{selectedRole?.name ?? "No role selected"}</p>
                    <Badge variant="secondary" className="text-[10px]">System Role</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Full access to radiology workflows and clinical data.
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Assigned Users ({selectedRole?.users ?? 0})</p>
                  <button type="button" className="text-xs font-medium text-primary hover:underline">
                    View all
                  </button>
                </div>
                <div className="flex -space-x-2">
                  {assignedUsers.map((initials) => (
                    <div
                      key={initials}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium"
                    >
                      {initials}
                    </div>
                  ))}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium text-muted-foreground">
                    +{Math.max((selectedRole?.users ?? 0) - assignedUsers.length, 0)}
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Departments</p>
                <div className="flex flex-wrap gap-1.5">
                  {departments.map((department) => (
                    <Badge key={department} variant="outline">
                      {department}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> Risk Level
                  </span>
                  <Badge variant="destructive" className="text-[10px]">High</Badge>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-1.5 flex-1 rounded-full ${index < 7 ? "bg-destructive" : "bg-muted"}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-md border p-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                  AB
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Modified</p>
                  <p className="text-sm font-medium">May 12, 2025 at 10:45 AM</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Button className="w-full" disabled={!dirty}>
                  Save Changes
                </Button>
                <Button variant="destructive" className="w-full" onClick={removeRole} disabled={!selectedRole}>
                  Remove Role
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setMatrix(defaultMatrix)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom row: distribution / recent changes / hierarchy */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                  <p className="text-[10px] text-muted-foreground">Permissions</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  <span className="text-muted-foreground">Allowed</span>
                  <span className="ml-auto font-medium">
                    {pct(distribution.allowed)}% ({distribution.allowed})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-200" />
                  <span className="text-muted-foreground">Denied</span>
                  <span className="ml-auto font-medium">
                    {pct(distribution.denied)}% ({distribution.denied})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                  <span className="text-muted-foreground">Not Applicable</span>
                  <span className="ml-auto font-medium">
                    {pct(distribution.na)}% ({distribution.na})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Recent Changes</CardTitle>
              <button type="button" className="text-xs font-medium text-primary hover:underline">
                View all
              </button>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {recentChanges.map((change) => {
                const Icon = change.icon;
                return (
                  <div key={change.id} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm leading-snug">{change.text}</p>
                      <p className="text-xs text-muted-foreground">{change.time}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Role Hierarchy</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
                  {hierarchy.root.name}
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="rounded-md border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700">
                  {hierarchy.mid.name}
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="grid w-full grid-cols-2 gap-2">
                  {hierarchy.leaves.map((leaf) => (
                    <div
                      key={leaf.name}
                      className="rounded-md border bg-muted/30 px-2 py-2 text-center"
                    >
                      <p className="text-xs font-medium leading-tight">{leaf.name}</p>
                      <p className="text-[11px] text-muted-foreground">{leaf.users} users</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}