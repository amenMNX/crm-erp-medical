import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
  type ApiEmployee,
  type ContractType,
} from "@/lib/employees-api";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Employees - Base" },
      { name: "description", content: "Manage employees, roles, and access status." },
    ],
  }),
  component: EmployeesPage,
});

const contractTypes: ContractType[] = ["cdi", "cdd", "intern", "consultant"];
const statusOptions = ["active", "inactive"] as const;

const contractLabels: Record<ContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  intern: "Intern",
  consultant: "Consultant",
};

function employeeName(employee: ApiEmployee) {
  return `${employee.first_name} ${employee.last_name}`.trim();
}

function employeeStatus(employee: ApiEmployee) {
  return employee.is_active ? "active" : "inactive";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function statusClass(status: "active" | "inactive") {
  if (status === "active") return "bg-success/15 text-success border-0";
  return "bg-destructive/15 text-destructive border-0";
}

function displayDate(employee: ApiEmployee) {
  return employee.hire_date ?? employee.created_at.slice(0, 10);
}

function formatMoney(value: string | number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TND`;
}

function formatDays(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  });
}

function EmployeesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [contractFilter, setContractFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<ApiEmployee | null>(null);

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const employees = employeesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      // A new employee may have auto-provisioned a role from their job title —
      // invalidate so Roles & Permissions page reflects it immediately.
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setEditingEmployee(null);
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateEmployee>[1] }) =>
      updateEmployee(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      // Job title change may have auto-provisioned a new role.
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setEditingEmployee(null);
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return employees.filter((employee) => {
      const name = employeeName(employee).toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        name.includes(normalizedQuery) ||
        employee.employee_number.toLowerCase().includes(normalizedQuery) ||
        employee.email.toLowerCase().includes(normalizedQuery) ||
        employee.department.toLowerCase().includes(normalizedQuery) ||
        employee.job_title.toLowerCase().includes(normalizedQuery);

      const matchesContract =
        contractFilter === "all" || employee.contract_type === contractFilter;
      const matchesStatus =
        statusFilter === "all" || employeeStatus(employee) === statusFilter;

      return matchesQuery && matchesContract && matchesStatus;
    });
  }, [employees, query, contractFilter, statusFilter]);

  const activeCount = employees.filter((employee) => employee.is_active).length;
  const inactiveCount = employees.length - activeCount;
  const totalMonthlySalary = employees.reduce(
    (sum, employee) => sum + Number(employee.salary?.total_monthly_compensation ?? 0),
    0,
  );
  const totalLeaveRemaining = employees.reduce(
    (sum, employee) => sum + Number(employee.leave_days_remaining ?? 0),
    0,
  );
  const mutationPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const employeeNumber = String(formData.get("employee_number") ?? "").trim();
    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const dateNaissance = String(formData.get("date_naissance") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const jobTitle = String(formData.get("job_title") ?? "").trim();
    const department = String(formData.get("department") ?? "").trim();
    const hireDate = String(formData.get("hire_date") ?? "").trim();
    const contractType = String(formData.get("contract_type") ?? "cdi") as ContractType;
    const leaveCreditDays = String(formData.get("leave_credit_days") ?? "30").trim();
    const baseSalary = String(formData.get("base_salary") ?? "0").trim();
    const transportAllowance = String(formData.get("transport_allowance") ?? "0").trim();
    const mealAllowance = String(formData.get("meal_allowance") ?? "0").trim();
    const bonusPercentage = String(formData.get("bonus_percentage") ?? "0").trim();
    const bankName = String(formData.get("bank_name") ?? "").trim();
    const bankAccount = String(formData.get("bank_account") ?? "").trim();
    const isActive = String(formData.get("status") ?? "active") === "active";
    const notes = String(formData.get("notes") ?? "").trim();

    if (!employeeNumber || !firstName || !lastName || !jobTitle) return;

    const payload = {
      employee_number: employeeNumber,
      first_name: firstName,
      last_name: lastName,
      date_naissance: dateNaissance || null,
      email,
      phone,
      job_title: jobTitle,
      department,
      hire_date: hireDate || null,
      contract_type: contractType,
      leave_credit_days: leaveCreditDays || "30",
      base_salary: baseSalary || "0",
      transport_allowance: transportAllowance || "0",
      meal_allowance: mealAllowance || "0",
      bonus_percentage: bonusPercentage || "0",
      bank_name: bankName,
      bank_account: bankAccount,
      is_active: isActive,
      notes,
    };

    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDeleteEmployee(id: number) {
    deleteMutation.mutate(id);
  }

  return (
    <AppShell
      title="Employees"
      actions={
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) {
              setEditingEmployee(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditingEmployee(null)}>
              <Plus className="h-4 w-4" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <form
              key={editingEmployee?.id ?? "new-employee"}
              onSubmit={saveEmployee}
              className="space-y-5"
            >
              <DialogHeader>
                <DialogTitle>{editingEmployee ? "Edit employee" : "Add employee"}</DialogTitle>
                <DialogDescription>Create an employee profile and employment record.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Employee number</span>
                  <Input
                    name="employee_number"
                    placeholder="EMP-001"
                    defaultValue={editingEmployee?.employee_number ?? ""}
                    required
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Job title</span>
                  <Input
                    name="job_title"
                    placeholder="Radiotherapist"
                    defaultValue={editingEmployee?.job_title ?? ""}
                    required
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">First name</span>
                  <Input
                    name="first_name"
                    placeholder="Sarah"
                    defaultValue={editingEmployee?.first_name ?? ""}
                    required
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Last name</span>
                  <Input
                    name="last_name"
                    placeholder="Clark"
                    defaultValue={editingEmployee?.last_name ?? ""}
                    required
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Date of birth</span>
                  <Input
                    name="date_naissance"
                    type="date"
                    defaultValue={editingEmployee?.date_naissance ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <Input
                    name="email"
                    type="email"
                    placeholder="sarah@base.test"
                    defaultValue={editingEmployee?.email ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Phone</span>
                  <Input
                    name="phone"
                    placeholder="22123456"
                    defaultValue={editingEmployee?.phone ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Contract</span>
                  <Select name="contract_type" defaultValue={editingEmployee?.contract_type ?? "cdi"}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contractTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {contractLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Status</span>
                  <Select
                    name="status"
                    defaultValue={editingEmployee?.is_active === false ? "inactive" : "active"}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Department</span>
                  <Input
                    name="department"
                    placeholder="Clinical"
                    defaultValue={editingEmployee?.department ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Hire date</span>
                  <Input
                    name="hire_date"
                    type="date"
                    defaultValue={editingEmployee?.hire_date ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Salaire de base mensuel</span>
                  <Input
                    name="base_salary"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="1200.00"
                    defaultValue={editingEmployee?.salary?.base_salary ?? "0"}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Credit conge annuel</span>
                  <Input
                    name="leave_credit_days"
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="30"
                    defaultValue={editingEmployee?.leave_credit_days ?? "30"}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Prime transport</span>
                  <Input
                    name="transport_allowance"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={editingEmployee?.salary?.transport_allowance ?? "0"}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Prime repas</span>
                  <Input
                    name="meal_allowance"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={editingEmployee?.salary?.meal_allowance ?? "0"}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Bonus (%)</span>
                  <Input
                    name="bonus_percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={editingEmployee?.salary?.bonus_percentage ?? "0"}
                    className="mt-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Banque</span>
                  <Input
                    name="bank_name"
                    defaultValue={editingEmployee?.salary?.bank_name ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-foreground">Compte bancaire</span>
                  <Input
                    name="bank_account"
                    defaultValue={editingEmployee?.salary?.bank_account ?? ""}
                    className="mt-2"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-foreground">Notes</span>
                  <Textarea
                    name="notes"
                    placeholder="Internal HR notes"
                    defaultValue={editingEmployee?.notes ?? ""}
                    className="mt-2"
                  />
                </label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={mutationPending}>
                  {editingEmployee ? "Save Changes" : "Add Employee"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total employees</p>
                <p className="text-2xl font-semibold">{employees.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <UserX className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-semibold">{inactiveCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Masse salariale</p>
                <p className="text-2xl font-semibold">{formatMoney(totalMonthlySalary)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit conge</p>
                <p className="text-2xl font-semibold">{formatDays(totalLeaveRemaining)} j</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search employees..."
                  className="pl-9"
                />
              </div>
              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All contracts</SelectItem>
                  {contractTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {contractLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === "active" ? "Active" : "Inactive"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {employeesQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading employees...
              </div>
            )}

            {!employeesQuery.isLoading && employeesQuery.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Couldn't load employees. Please refresh the page.
              </div>
            )}

            {!employeesQuery.isLoading && !employeesQuery.error && (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Job title / Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Salaire</TableHead>
                      <TableHead>Conge</TableHead>
                      <TableHead>Date of birth</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((employee) => {
                      const name = employeeName(employee);
                      const status = employeeStatus(employee);

                      return (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                                  {initials(name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-medium">{name}</p>
                                <p className="text-xs text-muted-foreground">{employee.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p>{employee.job_title}</p>
                              {employee.role_name && (
                                <Badge variant="outline" className="mt-0.5 text-[10px] px-1.5 py-0">
                                  {employee.role_name}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {employee.department}
                          </TableCell>
                          <TableCell>{contractLabels[employee.contract_type]}</TableCell>
                          <TableCell>{formatMoney(employee.salary?.base_salary)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <span className="font-medium">
                                {formatDays(employee.leave_days_remaining)} j
                              </span>
                              <span className="text-muted-foreground">
                                {" "}restants / {formatDays(employee.leave_credit_days)} j
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {employee.date_naissance
                              ? new Date(employee.date_naissance).toLocaleDateString("fr-FR")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusClass(status)}>
                              {status === "active" ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {displayDate(employee)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingEmployee(employee);
                                  setOpen(true);
                                }}
                                aria-label={`Edit ${name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={deleteMutation.isPending}
                                onClick={() => handleDeleteEmployee(employee.id)}
                                aria-label={`Delete ${name}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                          No employees match these filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}