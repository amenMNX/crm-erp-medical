# apps/hr/management/commands/sync_employee_roles.py
"""
Management command to backfill RolePermission assignments for existing employees.

Usage:
    python manage.py sync_employee_roles
    python manage.py sync_employee_roles --dry-run
"""
from django.core.management.base import BaseCommand
from django.db import IntegrityError

from apps.accounts.models import RolePermission
from apps.hr.models import Employee


DEFAULT_WRITE_PERMISSIONS = [
    "Dashboard",
    "Patients",
    "Appointments",
]


def _get_or_create_role(job_title: str) -> RolePermission | None:
    """Idempotently get or create a RolePermission for the given job title."""
    normalized = Employee.normalize_role_name(job_title)
    if not normalized:
        return None

    role = RolePermission.objects.filter(role_name__iexact=normalized).first()
    if role:
        if role.role_name != normalized:
            role.role_name = normalized
            role.save(update_fields=["role_name"])
        return role

    try:
        role, _ = RolePermission.objects.get_or_create(
            role_name=normalized,
            defaults={
                "is_built_in": False,
                "write_permissions": DEFAULT_WRITE_PERMISSIONS,
            },
        )
        return role
    except IntegrityError:
        return RolePermission.objects.filter(role_name__iexact=normalized).first()


class Command(BaseCommand):
    help = (
        "Backfill RolePermission entries for all employees whose job title "
        "has no corresponding role yet, and assign those roles to the employees."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would change without writing to the database.",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        employees = Employee.objects.select_related("role").all()
        total = employees.count()
        roles_created = 0
        employees_updated = 0
        skipped = 0

        self.stdout.write(f"Processing {total} employees…\n")

        for emp in employees:
            job_title = emp.job_title.strip() if emp.job_title else ""
            if not job_title:
                self.stdout.write(
                    self.style.WARNING(f"  SKIP  {emp} — no job title")
                )
                skipped += 1
                continue

            normalized = Employee.normalize_role_name(job_title)

            if emp.role and emp.role.role_name == normalized:
                self.stdout.write(f"  OK    {emp} → already has role "{normalized}"")
                continue

            if not dry_run:
                existing_count = RolePermission.objects.filter(
                    role_name__iexact=normalized
                ).count()
                role = _get_or_create_role(job_title)
                if role is None:
                    self.stdout.write(
                        self.style.ERROR(f"  ERR   {emp} — could not resolve role for "{job_title}"")
                    )
                    skipped += 1
                    continue

                if existing_count == 0:
                    roles_created += 1
                    self.stdout.write(
                        self.style.SUCCESS(f"  CREATE role "{normalized}" for {emp}")
                    )
                else:
                    self.stdout.write(f"  FOUND role "{normalized}" for {emp}")

                emp.role = role
                emp.save(update_fields=["role"])
                employees_updated += 1
            else:
                self.stdout.write(
                    f"  WOULD assign role "{normalized}" to {emp}"
                )
                employees_updated += 1

        self.stdout.write("\n" + "─" * 50)
        self.stdout.write(
            self.style.SUCCESS(
                f"Done.  Roles created: {roles_created}  |  "
                f"Employees updated: {employees_updated}  |  "
                f"Skipped: {skipped}"
            )
        )
        if dry_run:
            self.stdout.write(
                self.style.WARNING("(dry-run — nothing was written)")
            )