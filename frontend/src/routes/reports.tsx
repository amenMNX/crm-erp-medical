import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <AppShell title="Reports">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold">Tableaux de bord et reporting</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ici on va afficher les KPI : tickets ouverts, tickets résolus, employés,
            congés, factures et paiements.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}