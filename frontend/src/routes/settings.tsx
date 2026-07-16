import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Base" },
      { name: "description", content: "Manage your profile, workspace, and preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [profile, setProfile] = useState({
    name: "Evie Johnson",
    email: "evie@base.app",
    role: "Product Manager",
    bio: "Building beautiful SaaS at Base.",
  });
  const [notifs, setNotifs] = useState({ email: true, push: false, weekly: true, product: true });

  return (
    <AppShell title="Settings">
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">EJ</AvatarFallback>
                </Avatar>
                <div className="space-x-2">
                  <Button size="sm">Upload</Button>
                  <Button size="sm" variant="outline">Remove</Button>
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="n">Full name</Label>
                  <Input id="n" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="e">Email</Label>
                  <Input id="e" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="r">Role</Label>
                  <Input id="r" value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="b">Bio</Label>
                <Textarea id="b" rows={3} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => toast.success("Profile saved")}>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspace">
          <Card>
            <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Workspace name</Label>
                <Input defaultValue="Base HQ" />
              </div>
              <div>
                <Label>Workspace URL</Label>
                <Input defaultValue="base.app/hq" />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => toast.success("Workspace updated")}>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "email", label: "Email notifications", desc: "Receive important updates via email" },
                { key: "push", label: "Push notifications", desc: "Real-time browser notifications" },
                { key: "weekly", label: "Weekly digest", desc: "A summary every Monday morning" },
                { key: "product", label: "Product updates", desc: "News about new Base features" },
              ].map((n) => (
                <div key={n.key} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch
                    checked={notifs[n.key as keyof typeof notifs]}
                    onCheckedChange={(v) => setNotifs({ ...notifs, [n.key]: v })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">Pro plan</p>
                  <p className="text-sm text-muted-foreground">$29 / month • renews Aug 3</p>
                </div>
                <Button variant="outline">Manage</Button>
              </div>
              <div className="rounded-lg border p-4">
                <p className="font-semibold mb-2">Payment method</p>
                <p className="text-sm text-muted-foreground">Visa ending in 4242</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
