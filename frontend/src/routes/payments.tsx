import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <AppShell title="Payments">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold">Comptabilité - Gestion des paiements</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ici on va enregistrer les paiements et les associer aux factures.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}