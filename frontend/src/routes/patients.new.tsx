import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/patients/new")({
  head: () => ({
    meta: [
      { title: "Add Patient — Base" },
      { name: "description", content: "Add a new patient to your CRM." },
    ],
  }),
  component: AddPatientPage,
});

function AddPatientPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = () => {
    if (!form.name || !form.email) {
      toast.error("Name and email are required");
      return;
    }
    toast.success("Patient added", { description: form.name });
    navigate({ to: "/patients" });
  };

  return (
    <AppShell title="Add Patient">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>New Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex justify-center">
              <button className="h-24 w-24 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Camera className="h-6 w-6" />
              </button>
            </div>

            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={form.name} onChange={set("name")} placeholder="Jane Doe" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="jane@company.com" />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" value={form.address} onChange={set("address")} rows={2} placeholder="Street, city, country" />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={set("notes")} rows={3} placeholder="Any relevant info..." />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => navigate({ to: "/patients" })}>Cancel</Button>
              <Button onClick={save}>Add Patient</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}