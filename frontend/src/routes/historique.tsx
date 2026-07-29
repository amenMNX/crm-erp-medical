import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAuditLog, type AuditAction } from "@/lib/audit-api";

export const Route = createFileRoute("/historique")({
  component: HistoriquePage,
});

function actionVariant(action: AuditAction): "default" | "secondary" | "destructive" | "outline" {
  if (action === "create" || action === "login") return "default";
  if (action === "delete" || action === "login_failed") return "destructive";
  return "secondary";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function HistoriquePage() {
  const [query, setQuery] = useState("");

  const logQuery = useQuery({ queryKey: ["audit-log"], queryFn: fetchAuditLog });
  const entries = logQuery.data ?? [];

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        entry.object_repr.toLowerCase().includes(q) ||
        (entry.actor_username ?? "").toLowerCase().includes(q) ||
        (entry.model_name ?? "").toLowerCase().includes(q) ||
        entry.action_display.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const isForbidden = logQuery.error && (logQuery.error as { status?: number }).status === 403;

  return (
    <AppShell title="Historique">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher dans l'historique..."
              className="pl-9"
            />
          </div>

          {logQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'historique...
            </div>
          )}

          {!logQuery.isLoading && isForbidden && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              L'historique est réservé aux administrateurs.
            </div>
          )}

          {!logQuery.isLoading && logQuery.error && !isForbidden && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Impossible de charger l'historique. Veuillez rafraîchir la page.
            </div>
          )}

          {!logQuery.isLoading && !logQuery.error && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Objet</TableHead>
                    <TableHead>Utilisateur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">{formatDate(entry.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(entry.action)}>{entry.action_display}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{entry.model_name ?? "—"}</TableCell>
                      <TableCell>{entry.object_repr || "—"}</TableCell>
                      <TableCell>{entry.actor_username ?? "Système"}</TableCell>
                    </TableRow>
                  ))}

                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Aucune entrée dans l'historique.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
