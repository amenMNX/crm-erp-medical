import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Mail, Phone, MapPin, Loader2, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { deletePatient, fetchPatients, type ApiPatient } from "@/lib/patients-api";
import { fetchInvoices } from "@/lib/invoices-api";

export const Route = createFileRoute("/patients/")({
  head: () => ({
    meta: [
      { title: "Patients — Base" },
      { name: "description", content: "Browse your patient list and details." },
    ],
  }),
  component: PatientsPage,
});

function initials(patient: ApiPatient) {
  return `${patient.first_name[0] ?? ""}${patient.last_name[0] ?? ""}`.toUpperCase();
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function PatientsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: () => fetchPatients() });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });

  const patients = patientsQuery.data?.results ?? [];
  const invoices = invoicesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: deletePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient deleted");
      setSelectedId(null);
    },
    onError: () => toast.error("Failed to delete patient"),
  });

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients.filter(
      (p) =>
        !q ||
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.medical_record_number.toLowerCase().includes(q),
    );
  }, [patients, query]);

  const selected = patients.find((p) => p.id === selectedId) ?? filteredPatients[0] ?? null;

  const selectedInvoices = useMemo(
    () => (selected ? invoices.filter((invoice) => invoice.patient === selected.id) : []),
    [invoices, selected],
  );

  const totalBilled = selectedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);

  const isLoading = patientsQuery.isLoading;
  const loadError = patientsQuery.error;

  return (
    <AppShell
      title="Patients List"
      actions={
        <Button asChild>
          <Link to="/patients/new">
            <Plus className="h-4 w-4" /> Add Patient
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search patient..."
                  className="pl-9"
                />
              </div>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading patients...
              </div>
            )}

            {!isLoading && loadError && (
              <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Couldn't load patients. Please refresh the page.
              </div>
            )}

            {!isLoading && !loadError && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Record No.</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((p) => (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer ${selected?.id === p.id ? "bg-accent/50" : ""}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                              {initials(p)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.medical_record_number}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" asChild aria-label={`Dossier ${p.first_name} ${p.last_name}`}>
                          <Link to="/patients/$patientId" params={{ patientId: String(p.id) }}>
                            <Eye className="h-4 w-4 text-primary" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(p.id)}
                          aria-label={`Delete ${p.first_name} ${p.last_name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No patients found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        <Card className="h-fit">
          <CardContent className="p-6 text-center space-y-4">
            {selected ? (
              <>
                <Avatar className="h-20 w-20 mx-auto">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {initials(selected)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selected.first_name} {selected.last_name}</h3>
                  <p className="text-xs text-muted-foreground">{selected.medical_record_number}</p>
                </div>

                <div className="text-left space-y-3 pt-2 border-t">
                  <p className="text-xs uppercase text-muted-foreground pt-3">Contact Info</p>
                  <div className="flex items-start gap-2 text-sm">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <span>{selected.email || "—"}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <span>{selected.phone || "—"}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <span>{selected.address || "—"}</span>
                  </div>
                </div>

                {selected.diagnosis && (
                  <div className="text-left space-y-1 pt-3 border-t">
                    <p className="text-xs uppercase text-muted-foreground">Diagnosis</p>
                    <p className="text-sm">{selected.diagnosis}</p>
                  </div>
                )}

                <div className="text-left space-y-3 pt-3 border-t">
                  <p className="text-xs uppercase text-muted-foreground">Billing</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Invoices</p>
                      <p className="text-lg font-semibold">{selectedInvoices.length}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Total Billed</p>
                      <p className="text-lg font-semibold">{formatMoney(totalBilled)}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-8 text-sm text-muted-foreground">Select a patient to view details.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}