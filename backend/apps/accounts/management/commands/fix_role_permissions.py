# apps/accounts/management/commands/fix_role_permissions.py
"""
One-time (idempotent) management command that:

1. Renames every RolePermission.write_permissions entry that still uses an old
   English module name to the canonical French name that the frontend uses.
2. Re-seeds any built-in role whose RolePermission row is missing entirely.
3. Syncs CustomRole.write_permissions to match the RolePermission row (they
   must always be identical).

Run once after deploying the RBAC name-alignment fix:

    python manage.py fix_role_permissions

Safe to re-run: the command is fully idempotent.
"""
from django.core.management.base import BaseCommand
from django.db import transaction


# Mapping of every old English (or mixed) module name → canonical French name.
# Source of truth is src/routes/roles_permission.tsx MODULES array.
NAME_MIGRATIONS = {
    # ── English names from original get_default_permissions_for_role ──────
    "Appointments":               "Calendrier",
    "Complaints":                 "Réclamations",
    "Employees":                  "Employés",
    "Leaves & Absences":          "Congés",
    "Invoices & Payments":        "Factures",
    "CNAM Claims":                "CNAM",
    "Protocols":                  "Protocoles",
    "Stocks":                     "Stocks médicaux",
    "Formations":                 "Formations & Compétences",
    "Payroll":                    "Paie",
    # ── English names from original _DEPARTMENT_PERMISSIONS (hr/serializers.py) ──
    # (same roots as above, but listed explicitly for clarity)
    # "Appointments" → "Calendrier"   (already above)
    # "Protocols"    → "Protocoles"   (already above)
    # "Invoices & Payments" → "Factures"  (already above)
    # "CNAM Claims"  → "CNAM"         (already above)
    # "Employees"    → "Employés"     (already above)
    # "Leaves & Absences" → "Congés"  (already above)
    # "Formations"   → "Formations & Compétences"  (already above)
    # ── sync_employee_roles default: "Dashboard" is hasWrite:false — remove it ──
    "Dashboard":                  None,   # None = strip this entry entirely
    # ── Canonical French names — listed so the idempotent loop is a no-op ──
    "Patients":                   "Patients",
    "Tickets":                    "Tickets",
    "Messages":                   "Messages",
    "Incidents":                  "Incidents",
    "Traitements":                "Traitements",
    "Calendrier":                 "Calendrier",
    "Planning équipe":            "Planning équipe",
    "Réclamations":               "Réclamations",
    "Employés":                   "Employés",
    "Congés":                     "Congés",
    "Absences":                   "Absences",
    "Avances sur salaire":        "Avances sur salaire",
    "Formations & Compétences":   "Formations & Compétences",
    "Factures":                   "Factures",
    "Paiements":                  "Paiements",
    "CNAM":                       "CNAM",
    "Abonnements":                "Abonnements",
    "Paie":                       "Paie",
    "Recouvrement":               "Recouvrement",
    "Stocks médicaux":            "Stocks médicaux",
    "Équipements":                "Équipements",
    "Protocoles":                 "Protocoles",
}

# Built-in default permissions (must mirror get_default_permissions_for_role in views.py)
BUILT_IN_DEFAULTS = {
    "admin": [
        "Patients", "Traitements", "Protocoles", "Calendrier", "Planning équipe",
        "Tickets", "Incidents", "Réclamations", "Messages",
        "Employés", "Congés", "Absences", "Avances sur salaire",
        "Formations & Compétences",
        "Factures", "Paiements", "CNAM", "Abonnements", "Paie", "Recouvrement",
        "Stocks médicaux", "Équipements",
    ],
    "doctor": [
        "Patients", "Traitements", "Protocoles", "Calendrier", "Réclamations",
    ],
    "secretary": [
        "Patients", "Calendrier", "Planning équipe",
        "Tickets", "Réclamations",
        "Stocks médicaux",
    ],
    "accountant": [
        "Factures", "Paiements", "CNAM", "Abonnements", "Paie", "Recouvrement",
    ],
    "hr": [
        "Employés", "Congés", "Absences", "Avances sur salaire",
        "Formations & Compétences", "Paie",
    ],
    "support_client": ["Tickets", "Incidents", "Réclamations"],
    "manager": [
        "Patients", "Calendrier", "Planning équipe",
        "Réclamations", "Incidents",
        "Employés",
    ],
    "receptionist": ["Patients", "Calendrier"],
    "assistant": ["Patients", "Calendrier"],
    "user": [],
}


def migrate_perm_list(old_list: list) -> tuple[list, bool]:
    """
    Return (new_list, changed) where new_list has every name migrated to its
    canonical French form.  Entries with no mapping are left untouched.
    """
    new_list = []
    changed = False
    seen = set()
    for name in old_list:
        canonical = NAME_MIGRATIONS.get(name, name)
        if canonical not in seen:
            seen.add(canonical)
            new_list.append(canonical)
        if canonical != name:
            changed = True
    return new_list, changed


class Command(BaseCommand):
    help = (
        "Migrate RolePermission.write_permissions from old English names to "
        "canonical French names, and re-seed any missing built-in role rows."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would change without writing to the DB.",
        )

    def handle(self, *args, **options):
        from apps.accounts.models import RolePermission, CustomRole

        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        total_updated = 0
        total_seeded = 0

        with transaction.atomic():
            # ── Step 1: migrate existing RolePermission rows ──────────────────
            for rp in RolePermission.objects.all():
                new_perms, changed = migrate_perm_list(rp.write_permissions or [])
                if changed:
                    self.stdout.write(
                        f"  RolePermission '{rp.role_name}': "
                        f"{rp.write_permissions!r} → {new_perms!r}"
                    )
                    if not dry_run:
                        rp.write_permissions = new_perms
                        rp.save(update_fields=["write_permissions"])
                    total_updated += 1

            # ── Step 2: re-seed missing built-in rows ─────────────────────────
            existing_names = set(
                RolePermission.objects.values_list("role_name", flat=True)
            )
            for role_name, defaults in BUILT_IN_DEFAULTS.items():
                if role_name not in existing_names:
                    self.stdout.write(
                        f"  Seeding missing built-in role: '{role_name}' → {defaults!r}"
                    )
                    if not dry_run:
                        RolePermission.objects.create(
                            role_name=role_name,
                            is_built_in=True,
                            write_permissions=defaults,
                        )
                    total_seeded += 1

            # ── Step 3: sync CustomRole.write_permissions to match ────────────
            custom_synced = 0
            for cr in CustomRole.objects.all():
                try:
                    rp = RolePermission.objects.get(role_name=cr.name)
                    new_perms, _ = migrate_perm_list(cr.write_permissions or [])
                    if set(new_perms) != set(rp.write_permissions or []):
                        self.stdout.write(
                            f"  CustomRole '{cr.name}' synced to RolePermission"
                        )
                        if not dry_run:
                            cr.write_permissions = rp.write_permissions
                            cr.save(update_fields=["write_permissions"])
                        custom_synced += 1
                except RolePermission.DoesNotExist:
                    pass

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. "
                f"Updated {total_updated} role permission row(s), "
                f"seeded {total_seeded} missing built-in role(s), "
                f"synced CustomRole entries as needed."
            )
        )