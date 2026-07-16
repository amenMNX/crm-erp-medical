import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Users, DollarSign, ShoppingCart, Eye } from "lucide-react";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Base" },
      { name: "description", content: "Insights, KPIs and performance analytics." },
    ],
  }),
  component: AnalyticsPage,
});

const traffic = [
  { m: "Jan", visits: 4200, signups: 1200 },
  { m: "Feb", visits: 5100, signups: 1500 },
  { m: "Mar", visits: 4800, signups: 1350 },
  { m: "Apr", visits: 6200, signups: 1900 },
  { m: "May", visits: 7300, signups: 2400 },
  { m: "Jun", visits: 6900, signups: 2200 },
  { m: "Jul", visits: 8100, signups: 2800 },
];

const channels = [
  { name: "Organic", value: 42 },
  { name: "Direct", value: 28 },
  { name: "Referral", value: 15 },
  { name: "Social", value: 10 },
  { name: "Email", value: 5 },
];

const kpis = [
  { label: "Revenue", value: "$84,120", delta: "+12.4%", up: true, icon: DollarSign },
  { label: "Visitors", value: "48,392", delta: "+8.2%", up: true, icon: Eye },
  { label: "New Users", value: "2,841", delta: "-3.1%", up: false, icon: Users },
  { label: "Orders", value: "1,204", delta: "+5.7%", up: true, icon: ShoppingCart },
];

function AnalyticsPage() {
  return (
    <AppShell title="Analytics">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <k.icon className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="outline" className={k.up ? "text-success" : "text-destructive"}>
                    {k.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {k.delta}
                  </Badge>
                </div>
                <p className="text-2xl font-bold mt-3">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Traffic & signups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={traffic}>
                    <defs>
                      <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="m" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="visits" stroke="hsl(var(--primary))" fill="url(#v)" />
                    <Area type="monotone" dataKey="signups" stroke="hsl(var(--warning))" fill="hsl(var(--warning) / 0.2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channels} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="name" type="category" className="text-xs" width={70} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
