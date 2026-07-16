import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Mail, Phone, MapPin } from "lucide-react";

export const Route = createFileRoute("/patients/")({
  head: () => ({
    meta: [
      { title: "Patients — Base" },
      { name: "description", content: "Browse your patient list and details." },
    ],
  }),
  component: PatientsPage,
});

const patients = [
  { id: 1, name: "John Doe", email: "john.doe@example.com", phone: "+1 (555) 010-1101", location: "1234 Elm Street, Springfield", orders: 12, spent: "$2,340" },
  { id: 2, name: "Ann Vetrov", email: "ann.vetrov@example.com", phone: "+1 (555) 010-1102", location: "42 Baker St, London", orders: 7, spent: "$1,120" },
  { id: 3, name: "Casey Turner", email: "casey.t@example.com", phone: "+1 (555) 010-1103", location: "88 Ocean Ave, Miami", orders: 4, spent: "$540" },
  { id: 4, name: "Sofia Martins", email: "s.martins@example.com", phone: "+1 (555) 010-1104", location: "Rua Augusta 500, Lisbon", orders: 21, spent: "$4,890" },
  { id: 5, name: "Nika Kova", email: "nika@example.com", phone: "+1 (555) 010-1105", location: "12 Central Sq, NYC", orders: 3, spent: "$310" },
  { id: 6, name: "Marina Lee", email: "marina.lee@example.com", phone: "+1 (555) 010-1106", location: "701 King St, Toronto", orders: 9, spent: "$1,780" },
  { id: 7, name: "Fabricio Souza", email: "fabricio@example.com", phone: "+1 (555) 010-1107", location: "Av. Paulista 1500, São Paulo", orders: 2, spent: "$220" },
  { id: 8, name: "Riko Hakim", email: "riko.h@example.com", phone: "+1 (555) 010-1108", location: "Jl. Sudirman 1, Jakarta", orders: 15, spent: "$3,412" },
];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

function PatientsPage() {
  const [selected, setSelected] = useState(patients[0]);

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
                <Input placeholder="Search patient..." className="pl-9" />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox /></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow
                    key={p.id}
                    className={`cursor-pointer ${selected.id === p.id ? "bg-accent/50" : ""}`}
                    onClick={() => setSelected(p)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}><Checkbox /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                            {initials(p.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.email}</TableCell>
                    <TableCell className="text-muted-foreground">{p.phone}</TableCell>
                    <TableCell>{p.orders}</TableCell>
                    <TableCell className="font-medium">{p.spent}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail */}
        <Card className="h-fit">
          <CardContent className="p-6 text-center space-y-4">
            <Avatar className="h-20 w-20 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {initials(selected.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{selected.name}</h3>
              <p className="text-xs text-muted-foreground">Patient</p>
            </div>

            <div className="text-left space-y-3 pt-2 border-t">
              <p className="text-xs uppercase text-muted-foreground pt-3">Contact Info</p>
              <div className="flex items-start gap-2 text-sm">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{selected.email}</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{selected.phone}</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{selected.location}</span>
              </div>
            </div>

            <div className="text-left space-y-3 pt-3 border-t">
              <p className="text-xs uppercase text-muted-foreground">Performance</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="text-lg font-semibold">{selected.orders}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Spent</p>
                  <p className="text-lg font-semibold">{selected.spent}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}