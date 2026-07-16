import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Base" },
      { name: "description", content: "Overview of your business performance, reports and top doctors." },
    ],
  }),
  component: DashboardPage,
});

const stats = [
  { label: "Total Customers", value: "178+", change: "+12%", trend: "up", icon: Users, tint: "text-primary bg-primary/10" },
  { label: "Total Doctors", value: "20+", change: "+3%", trend: "up", icon: ShoppingBag, tint: "text-info bg-info/10" },
  { label: "Total Revenue", value: "$100k+", change: "+8.4%", trend: "up", icon: DollarSign, tint: "text-success bg-success/10" },
  { label: "Total Suppliers", value: "12+", change: "-2%", trend: "down", icon: TrendingUp, tint: "text-warning bg-warning/10" },
];

const chartData = [
  { name: "Jan", value: 32 },
  { name: "Feb", value: 45 },
  { name: "Mar", value: 38 },
  { name: "Apr", value: 62 },
  { name: "May", value: 55 },
  { name: "Jun", value: 78 },
  { name: "Jul", value: 68 },
  { name: "Aug", value: 82 },
  { name: "Sep", value: 71 },
  { name: "Oct", value: 90 },
  { name: "Nov", value: 84 },
  { name: "Dec", value: 96 },
];

const pieData = [
  { name: "Direct", value: 80, color: "var(--chart-1)" },
  { name: "Referral", value: 12, color: "var(--chart-2)" },
  { name: "Organic", value: 8, color: "var(--chart-4)" },
];

const orders = [
  { id: "#4712", customer: "Bailey Wonger", type: "Standard", date: "12 Feb 2024", total: "$248.00", status: "Completed" },
  { id: "#4713", customer: "Casey Turner", type: "Standard", date: "12 Feb 2024", total: "$186.00", status: "Pending" },
  { id: "#4714", customer: "Nika Kova", type: "Premium", date: "13 Feb 2024", total: "$520.00", status: "Completed" },
  { id: "#4715", customer: "Marina Lee", type: "Standard", date: "13 Feb 2024", total: "$92.00", status: "Cancelled" },
];

const topDoctors = [
  { name: "Dr. Amina Ben Ali", patients: 214, specialty: "Radiotherapy", rating: "4.8" },
  { name: "Dr. Karim Haddad", patients: 180, specialty: "Oncology", rating: "4.9" },
  { name: "Dr. Sara Mansour", patients: 156, specialty: "Immunotherapy", rating: "4.7" },
  { name: "Dr. Yasmine Farhat", patients: 132, specialty: "Hematology", rating: "4.6" },
];

function statusColor(status: string) {
  if (status === "Completed") return "bg-success/15 text-success border-0";
  if (status === "Pending") return "bg-warning/15 text-warning border-0";
  return "bg-destructive/15 text-destructive border-0";
}

function DashboardPage() {
  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-semibold mt-2">{s.value}</p>
                    <div className={`flex items-center gap-1 mt-2 text-xs ${s.trend === "up" ? "text-success" : "text-destructive"}`}>
                      {s.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {s.change} this month
                    </div>
                  </div>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.tint}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#fill)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((e) => (
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-semibold">80%</span>
                  <span className="text-xs text-muted-foreground">Direct</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 justify-center text-xs">
                {pieData.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    {p.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.id}</TableCell>
                      <TableCell>{o.customer}</TableCell>
                      <TableCell className="text-muted-foreground">{o.date}</TableCell>
                      <TableCell>{o.total}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(o.status)}>{o.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Doctors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topDoctors.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.patients} patients · {p.specialty} · ★ {p.rating}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
