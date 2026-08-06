"""
Management command: check_sla

Scans all open tickets and:
  1. Backfills sla_deadline for old tickets that pre-date the SLA migration.
  2. Sets sla_breached=True for tickets past their deadline.
  3. Clears sla_breached for tickets that were re-opened or whose deadline
     was adjusted (defensive cleanup).

Intended to run every 15 minutes via cron or Celery beat:
  */15 * * * * python manage.py check_sla

Output (stdout) is structured so it can be piped to a log aggregator.
Exit code 0 always — a cron failure alert is more disruptive than a missed
SLA check.

Usage:
    python manage.py check_sla            # run once
    python manage.py check_sla --dry-run  # show what would change, no writes
"""

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Check ticket SLA deadlines and mark breached tickets."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would change without writing to the database.",
        )

    def handle(self, *args, **options):
        from apps.crm.models import Ticket

        dry_run: bool = options["dry_run"]
        now = timezone.now()

        open_statuses = [
            Ticket.Status.NOUVEAU,
            Ticket.Status.EN_COURS,
            Ticket.Status.EN_ATTENTE,
        ]

        open_tickets = Ticket.objects.filter(statut__in=open_statuses)

        backfilled = 0
        newly_breached = 0
        already_breached = 0
        cleared = 0

        for ticket in open_tickets:
            changed = False

            # ── 1. Backfill sla_deadline if missing ───────────────────────────
            if ticket.sla_deadline is None:
                deadline = ticket.created_at + timezone.timedelta(
                    hours=ticket.sla_hours
                )
                if not dry_run:
                    ticket.sla_deadline = deadline
                backfilled += 1
                changed = True
                self.stdout.write(
                    f"  [BACKFILL] {ticket.numero} → deadline {deadline.isoformat()}"
                )
            
            # ── 2. Mark breached ──────────────────────────────────────────────
            deadline = ticket.sla_deadline or (
                ticket.created_at + timezone.timedelta(hours=ticket.sla_hours)
            )

            if now > deadline and not ticket.sla_breached:
                if not dry_run:
                    ticket.sla_breached = True
                newly_breached += 1
                changed = True
                overdue_mins = int((now - deadline).total_seconds() / 60)
                self.stdout.write(
                    self.style.WARNING(
                        f"  [BREACH] {ticket.numero} ({ticket.priorite}) "
                        f"overdue by {overdue_mins} min — {ticket.titre[:60]}"
                    )
                )
            elif now > deadline and ticket.sla_breached:
                already_breached += 1

            # ── 3. Clear stale breach flag ────────────────────────────────────
            elif ticket.sla_breached and now <= deadline:
                if not dry_run:
                    ticket.sla_breached = False
                cleared += 1
                changed = True
                self.stdout.write(
                    f"  [CLEAR] {ticket.numero} — breach flag cleared (deadline extended?)"
                )

            if changed and not dry_run:
                # Use update_fields to skip Ticket.save() side-effects
                # (numero generation, resolved_at logic) — we only want to
                # update the SLA fields.
                update_fields = ["sla_breached"]
                if ticket.sla_deadline is not None:
                    update_fields.append("sla_deadline")
                Ticket.objects.filter(pk=ticket.pk).update(
                    **{f: getattr(ticket, f) for f in update_fields}
                )

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}SLA check complete — "
                f"backfilled={backfilled}, "
                f"newly_breached={newly_breached}, "
                f"already_breached={already_breached}, "
                f"cleared={cleared}"
            )
        )