from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator

from apps.hr.models import Employee


class EmployeeSalary(models.Model):
    """
    Employee base salary configuration.
    Tracks salary history when changes occur.
    """
    employee = models.OneToOneField(
        Employee,
        on_delete=models.CASCADE,
        related_name="salary_config",
    )
    base_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Monthly base salary in TND"
    )
    bank_account = models.CharField(max_length=50, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    tax_id = models.CharField(max_length=50, blank=True, help_text="CIN or matricule fiscal")
    social_security_number = models.CharField(max_length=50, blank=True)
    
    # Salary components
    transport_allowance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Monthly transport allowance"
    )
    meal_allowance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Monthly meal allowance"
    )
    bonus_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Performance bonus percentage of base salary"
    )
    
    effective_date = models.DateField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_salary_configs"
    )

    class Meta:
        ordering = ["-effective_date"]
        verbose_name = "Employee Salary"
        verbose_name_plural = "Employee Salaries"

    def __str__(self):
        return f"{self.employee} - {self.base_salary} TND"

    @property
    def total_monthly_compensation(self):
        """Total monthly compensation including allowances and bonuses"""
        bonus = (self.base_salary * self.bonus_percentage) / 100
        return self.base_salary + self.transport_allowance + self.meal_allowance + bonus


class PayrollBatch(models.Model):
    """
    Represents a payroll run for a specific month.
    """
    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        GENERATED = "generated", "Généré"
        APPROVED = "approved", "Approuvé"
        PAID = "paid", "Payé"
        CANCELLED = "cancelled", "Annulé"

    month = models.DateField(help_text="First day of the payroll month")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    total_net_salary = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    total_deductions = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    total_earnings = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    employee_count = models.IntegerField(default=0)
    notes = models.TextField(blank=True)
    
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_payrolls"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="approved_payrolls"
    )
    generated_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month"]
        unique_together = [["month"]]  # One batch per month

    def __str__(self):
        return f"Payroll {self.month.strftime('%B %Y')} - {self.status}"


class Payroll(models.Model):
    """
    Individual employee payroll record.
    """
    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        GENERATED = "generated", "Généré"
        APPROVED = "approved", "Approuvé"
        PAID = "paid", "Payé"
        CANCELLED = "cancelled", "Annulé"

    payroll_batch = models.ForeignKey(
        PayrollBatch,
        on_delete=models.CASCADE,
        related_name="payrolls"
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="payrolls"
    )
    month = models.DateField(help_text="First day of the payroll month")
    
    # Summary fields
    base_salary = models.DecimalField(max_digits=12, decimal_places=2)
    transport_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    meal_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    bonus = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Deductions
    absence_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    advance_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    social_security = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Additional earnings
    overtime = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_earnings = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Results
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2)
    
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    payment_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(
        max_length=20,
        choices=[
            ("bank_transfer", "Virement bancaire"),
            ("check", "Chèque"),
            ("cash", "Espèces"),
        ],
        blank=True
    )
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_payroll_items"
    )

    class Meta:
        ordering = ["-month", "employee__last_name"]
        unique_together = [["payroll_batch", "employee"]]

    def __str__(self):
        return f"{self.employee} - {self.month.strftime('%B %Y')} - {self.net_salary} TND"

    def save(self, *args, **kwargs):
        """Auto-calculate totals before saving."""
        if not self.gross_salary:
            self.gross_salary = (
                self.base_salary +
                self.transport_allowance +
                self.meal_allowance +
                self.bonus +
                self.overtime +
                self.commission +
                self.other_earnings
            )
        
        self.total_deductions = (
            self.absence_deduction +
            self.advance_deduction +
            self.tax_deduction +
            self.social_security +
            self.other_deduction
        )
        
        self.net_salary = self.gross_salary - self.total_deductions
        
        super().save(*args, **kwargs)


class PayrollComponent(models.Model):
    """
    Individual payroll line items for detailed breakdown.
    """
    class ComponentType(models.TextChoices):
        EARNING = "earning", "Earning"
        DEDUCTION = "deduction", "Deduction"

    payroll = models.ForeignKey(
        Payroll,
        on_delete=models.CASCADE,
        related_name="components"
    )
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=ComponentType.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    source = models.CharField(
        max_length=50,
        blank=True,
        help_text="Source of this component (e.g., 'absence', 'advance', 'bonus')"
    )
    source_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="ID of the source record (e.g., Absence ID, SalaryAdvance ID)"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["type", "name"]

    def __str__(self):
        return f"{self.payroll.employee} - {self.name}: {self.amount} TND"