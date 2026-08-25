# apps/payroll/permissions.py 

from apps.accounts.permissions import ReadOnlyOrRole

class PayrollPermission(ReadOnlyOrRole):
    """Payroll module — salaries, bonuses, deductions."""
    allowed_roles = ["admin", "accountant", "hr"]
    module_label = "Payroll"


