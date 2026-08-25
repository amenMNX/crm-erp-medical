# apps/hr/serializers.py
import re
from datetime import datetime, time
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .models import Absence, Employee, LeaveRequest, SalaryAdvance, Shift
from apps.accounts.models import RolePermission

User = get_user_model()


def _build_username(first_name: str, last_name: str) -> str:
    """
    Build a clean ASCII username from the employee's name.
    e.g. "Jean-Pierre" "Dupont" → "jean-pierre.dupont"
    Collisions are resolved by appending _2, _3, …
    """
    def slugify(s: str) -> str:
        s = s.lower().strip()
        replacements = {
            "é": "e", "è": "e", "ê": "e", "ë": "e",
            "à": "a", "â": "a", "ä": "a",
            "ù": "u", "û": "u", "ü": "u",
            "î": "i", "ï": "i",
            "ô": "o", "ö": "o",
            "ç": "c", "ñ": "n",
        }
        for src, dst in replacements.items():
            s = s.replace(src, dst)
        s = re.sub(r"[^a-z0-9.\-_]", "", s)
        return s

    base = f"{slugify(first_name)}.{slugify(last_name)}"
    if not base.strip("."):
        base = "employee"

    username = base
    counter = 2
    while User.objects.filter(username=username).exists():
        username = f"{base}_{counter}"
        counter += 1
    return username


class EmployeeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, write_only=True)
    bank_account = serializers.CharField(required=False, allow_blank=True, write_only=True)
    bank_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    transport_allowance = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    meal_allowance = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    bonus_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, write_only=True)
    salary = serializers.SerializerMethodField()
    leave_credit_days = serializers.SerializerMethodField()
    leave_days_used = serializers.SerializerMethodField()
    leave_days_remaining = serializers.SerializerMethodField()
    notes = serializers.CharField(source="address", required=False, allow_blank=True)

    role_name = serializers.CharField(source="role.role_name", read_only=True, default=None)
    role_id = serializers.IntegerField(source="role.id", read_only=True, default=None)
    role_is_built_in = serializers.BooleanField(source="role.is_built_in", read_only=True, default=None)

    class Meta:
        model = Employee
        fields = [
            "id",
            "user",
            "username",
            "password",
            "employee_number",
            "first_name",
            "last_name",
            "date_naissance",
            "job_title",
            "department",
            "phone",
            "email",
            "hire_date",
            "contract_type",
            "leave_credit_days",
            "leave_days_used",
            "leave_days_remaining",
            "salary",
            "base_salary",
            "bank_account",
            "bank_name",
            "transport_allowance",
            "meal_allowance",
            "bonus_percentage",
            "is_active",
            "notes",
            "role",
            "role_name",
            "role_id",
            "role_is_built_in",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "username", "created_at", "updated_at"]

    # ── Helpers ──────────────────────────────────────────────────────────────

    def get_salary(self, obj):
        try:
            salary = obj.salary_config
        except Exception:
            return {
                "base_salary": "0.00",
                "bank_account": "",
                "bank_name": "",
                "transport_allowance": "0.00",
                "meal_allowance": "0.00",
                "bonus_percentage": "0.00",
                "total_monthly_compensation": "0.00",
            }
        return {
            "base_salary": str(salary.base_salary),
            "bank_account": salary.bank_account,
            "bank_name": salary.bank_name,
            "transport_allowance": str(salary.transport_allowance),
            "meal_allowance": str(salary.meal_allowance),
            "bonus_percentage": str(salary.bonus_percentage),
            "total_monthly_compensation": str(salary.total_monthly_compensation),
        }

    def get_leave_credit_days(self, obj):
        return "30.0"

    def get_leave_days_used(self, obj):
        today = timezone.now().date()
        start = today.replace(month=1, day=1)
        total = 0
        for leave in obj.leave_requests.filter(status=LeaveRequest.Status.ACCEPTEE, start_date__year=today.year):
            date_debut = max(leave.start_date, start)
            date_fin = min(leave.end_date, today.replace(month=12, day=31))
            total += max((date_fin - date_debut).days + 1, 0)
        return float(total)

    def get_leave_days_remaining(self, obj):
        return max(30.0 - self.get_leave_days_used(obj), 0.0)

    def _salary_payload(self, validated_data):
        keys = (
            "base_salary",
            "bank_account",
            "bank_name",
            "transport_allowance",
            "meal_allowance",
            "bonus_percentage",
        )
        return {key: validated_data.pop(key) for key in keys if key in validated_data}

    def _discard_legacy_payload(self, validated_data):
        validated_data.pop("leave_credit_days", None)

    def _save_salary(self, employee, salary_data):
        if not salary_data:
            return
        from apps.payroll.models import EmployeeSalary
        create_defaults = {"base_salary": salary_data.get("base_salary", 0), **salary_data}
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            create_defaults["created_by"] = request.user
        salary, _ = EmployeeSalary.objects.get_or_create(employee=employee, defaults=create_defaults)
        for field, value in salary_data.items():
            setattr(salary, field, value)
        salary.save()

    # ── Department inference ──────────────────────────────────────────────────
    #
    # Maps keyword fragments in a job title → department slug.
    # Order matters: first match wins. Extend this list to add new departments
    # without touching any other code.
    _DEPARTMENT_KEYWORDS: list[tuple[list[str], str]] = [
        (
            [
                "médecin", "doctor", "chirurgien", "radiologue", "oncologue",
                "infirmier", "infirmière", "aide-soignant", "kiné", "pharmacien",
                "radiothérapeute", "radiotherapist", "physicien médical",
                "technicien de radiologie", "manipulateur radio",
            ],
            "medical",
        ),
        (
            [
                "comptable", "accountant", "finance", "trésorier", "auditeur",
                "contrôleur de gestion", "analyste financier",
            ],
            "finance",
        ),
        (
            [
                "support", "service client", "agent", "chargé de relation",
                "secrétaire", "secretary", "réceptionniste", "receptionist",
                "assistante médicale", "accueil",
            ],
            "support",
        ),
        (
            [
                "rh", "hr", "ressources humaines", "chargé rh",
                "responsable rh", "recruteur", "formation",
            ],
            "hr",
        ),
    ]

    # Department slug → the closest built-in UserProfile.Role value.
    # Used when creating the Django User so the profile gets a sensible
    # built-in role instead of always defaulting to ASSISTANT.
    _DEPARTMENT_TO_PROFILE_ROLE: dict[str, str] = {
        "medical": "radiotherapist",
        "finance": "accountant",
        "support": "support_client",
        "hr": "hr",
    }

    # Department slug → module write-permissions that any sub-role in this
    # department inherits on creation.  A new department (not in this map)
    # gets an EMPTY permission set — an admin must configure it explicitly,
    # which avoids silently granting wrong access.
    _DEPARTMENT_PERMISSIONS: dict[str, list[str]] = {
        "medical": ["Patients", "Appointments", "Protocols"],
        "finance": ["Invoices & Payments", "CNAM Claims"],
        "support": ["Tickets", "Patients", "Appointments"],
        "hr": ["Employees", "Leaves & Absences", "Formations"],
    }

    @classmethod
    def _infer_department(cls, job_title: str) -> str | None:
        """
        Return the department slug that best matches *job_title*, or None.

        Matching is case-insensitive and substring-based:
            "Infirmier en chef" → "medical"
            "Comptable Junior"  → "finance"
            "Physicien XYZ"     → None  (admin configures permissions manually)
        """
        lower = job_title.lower()
        for keywords, dept in cls._DEPARTMENT_KEYWORDS:
            if any(kw in lower for kw in keywords):
                return dept
        return None

    def _get_or_create_role_from_job_title(
        self, job_title: str, department: str = ""
    ) -> "RolePermission | None":
        """
        Get or create a RolePermission.

        Role name priority:
          1. department (if provided by the caller) — e.g. "Phy"
          2. job_title fallback — e.g. "Testerphy"

        This means the Roles & Permissions screen shows the department name,
        not the individual job title, which is what the admin expects.

        Existing roles are returned unchanged (permissions are never overwritten
        — the admin owns them after initial creation).

        New roles start with write_permissions inherited from the known department
        map, or empty [] if the department is custom/unknown — the superadmin
        assigns permissions manually in that case.
        """
        from django.db import IntegrityError

        if not job_title and not department:
            return None

        # Use department as the role name when available; fall back to job_title
        role_label = department.strip() if department and department.strip() else job_title
        normalized = Employee.normalize_role_name(role_label)
        if not normalized:
            return None

        role = RolePermission.objects.filter(role_name__iexact=normalized).first()
        if role:
            # Normalise casing only — never touch permissions on existing roles
            if role.role_name != normalized:
                role.role_name = normalized
                role.save(update_fields=["role_name"])
            return role

        # Brand-new role: inherit permissions from the known department map, or start empty
        dept_key = self._infer_department(department or job_title)
        inherited_perms = list(self._DEPARTMENT_PERMISSIONS.get(dept_key, []))

        try:
            role, _ = RolePermission.objects.get_or_create(
                role_name=normalized,
                defaults={
                    "is_built_in": False,
                    "write_permissions": inherited_perms,
                },
            )
            return role
        except IntegrityError:
            return RolePermission.objects.filter(role_name__iexact=normalized).first()

    def _get_or_create_django_user(
        self,
        first_name: str,
        last_name: str,
        email: str,
        password: str | None,
        job_title: str | None,
    ) -> User:
        """
        Return an existing linked Django User or create a fresh one.

        • If a User with the same email already exists, reuse it.
        • Otherwise create a new User and populate UserProfile.role and
          UserProfile.department from the *job_title*'s inferred department.
          If no department can be resolved the profile role stays ASSISTANT
          (lowest privilege) — it is never silently promoted to a wrong role.
        """
        import secrets as _secrets
        from apps.accounts.models import UserProfile

        if email:
            existing = User.objects.filter(email__iexact=email).first()
            if existing:
                return existing

        username = _build_username(first_name, last_name)
        raw_password = password if password else _secrets.token_urlsafe(16)

        user = User.objects.create_user(
            username=username,
            email=email or "",
            first_name=first_name,
            last_name=last_name,
            password=raw_password,
        )

        # Resolve department + profile role from job_title
        dept = self._infer_department(job_title or "")
        profile_role = UserProfile.Role.ASSISTANT  # safe default

        if dept:
            built_in_role_name = self._DEPARTMENT_TO_PROFILE_ROLE.get(dept)
            if built_in_role_name:
                try:
                    profile_role = UserProfile.Role(built_in_role_name)
                except ValueError:
                    pass  # unrecognised value → keep ASSISTANT

        try:
            profile = user.profile
            profile.role = profile_role
            profile.department = dept or ""
            profile.save(update_fields=["role", "department"])
        except UserProfile.DoesNotExist:
            UserProfile.objects.create(user=user, role=profile_role, department=dept or "")

        return user

    # ── create / update ──────────────────────────────────────────────────────

    def _superuser_only_password(self, validated_data) -> str | None:
        """
        Pop and return the password only when the requesting user is a superadmin.
        Non-superusers have their password field silently discarded; the
        auto-generated random password is used instead.
        """
        password = validated_data.pop("password", None)
        request = self.context.get("request")
        if request and getattr(request.user, "is_superuser", False):
            return password
        return None

    @transaction.atomic
    def create(self, validated_data):
        self._discard_legacy_payload(validated_data)
        job_title = validated_data.get("job_title", "")
        department = validated_data.get("department", "")
        password = self._superuser_only_password(validated_data)

        # 1. Resolve / create the RolePermission — use department as role name when set
        role = self._get_or_create_role_from_job_title(job_title, department)
        if role:
            validated_data["role"] = role

        # 2. Auto-create Django User (unless the caller explicitly provided one)
        if not validated_data.get("user"):
            user = self._get_or_create_django_user(
                first_name=validated_data.get("first_name", ""),
                last_name=validated_data.get("last_name", ""),
                email=validated_data.get("email", ""),
                password=password,
                job_title=job_title,
            )
            validated_data["user"] = user

        salary_data = self._salary_payload(validated_data)
        employee = super().create(validated_data)
        self._save_salary(employee, salary_data)
        return employee

    @transaction.atomic
    def update(self, instance, validated_data):
        self._discard_legacy_payload(validated_data)
        password = self._superuser_only_password(validated_data)

        # If job title or department changed, refresh the role
        job_title = validated_data.get("job_title", instance.job_title)
        department = validated_data.get("department", instance.department)
        if job_title != instance.job_title or department != instance.department:
            role = self._get_or_create_role_from_job_title(job_title, department)
            if role:
                validated_data["role"] = role

        if password and instance.user_id:
            instance.user.set_password(password)
            instance.user.save(update_fields=["password"])

        # Sync first/last name & email on the linked User
        if instance.user_id:
            user_fields_changed = {}
            for field in ("first_name", "last_name", "email"):
                new_val = validated_data.get(field)
                if new_val is not None and getattr(instance, field) != new_val:
                    user_fields_changed[field] = new_val
            if user_fields_changed:
                User.objects.filter(pk=instance.user_id).update(**user_fields_changed)

        salary_data = self._salary_payload(validated_data)
        employee = super().update(instance, validated_data)
        self._save_salary(employee, salary_data)
        return employee


# ── Leave / Absence / SalaryAdvance / Shift ──────────────────────────────────

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    date_debut = serializers.DateField(source="start_date")
    date_fin = serializers.DateField(source="end_date")
    motif = serializers.CharField(source="reason", required=False, allow_blank=True)
    statut = serializers.CharField(source="status", required=False)
    notes = serializers.SerializerMethodField()
    approved_by = serializers.PrimaryKeyRelatedField(source="reviewed_by", read_only=True)
    approved_by_name = serializers.CharField(source="reviewed_by.username", read_only=True, default=None)
    duration_days = serializers.SerializerMethodField()
    employee_leave_credit_days = serializers.SerializerMethodField()
    employee_leave_days_remaining = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "employee",
            "employee_name",
            "date_debut",
            "date_fin",
            "motif",
            "statut",
            "notes",
            "duration_days",
            "employee_leave_credit_days",
            "employee_leave_days_remaining",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_name",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]

    def get_notes(self, obj):
        return ""

    def get_duration_days(self, obj):
        return max((obj.end_date - obj.start_date).days + 1, 0)

    def get_employee_leave_credit_days(self, obj):
        return "30.0"

    def get_employee_leave_days_remaining(self, obj):
        return EmployeeSerializer().get_leave_days_remaining(obj.employee)


class AbsenceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    motif = serializers.CharField(source="justification", required=False, allow_blank=True)

    class Meta:
        model = Absence
        fields = [
            "id",
            "employee",
            "employee_name",
            "date",
            "motif",
            "created_at",
        ]
        read_only_fields = ["id", "employee_name", "created_at"]

    def create(self, validated_data):
        validated_data.setdefault("absence_type", Absence.AbsenceType.INJUSTIFIE)
        return super().create(validated_data)


class SalaryAdvanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    request_date = serializers.SerializerMethodField()
    statut = serializers.CharField(source="status", required=False)
    repayment_date = serializers.SerializerMethodField()
    amount_repaid = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    approved_by = serializers.PrimaryKeyRelatedField(source="reviewed_by", read_only=True)
    approved_by_name = serializers.CharField(source="reviewed_by.username", read_only=True, default=None)

    class Meta:
        model = SalaryAdvance
        fields = [
            "id",
            "employee",
            "employee_name",
            "amount",
            "request_date",
            "reason",
            "statut",
            "repayment_date",
            "amount_repaid",
            "notes",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_name",
            "approved_by",
            "approved_by_name",
            "created_at",
            "updated_at",
        ]

    def get_request_date(self, obj):
        return obj.created_at.date() if obj.created_at else None

    def get_repayment_date(self, obj):
        return None

    def get_amount_repaid(self, obj):
        return str(obj.amount if obj.status == "Remboursée" else 0)

    def get_notes(self, obj):
        return ""


class ShiftSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    title = serializers.CharField(required=False, allow_blank=True)
    start_datetime = serializers.DateTimeField(required=False)
    end_datetime = serializers.DateTimeField(required=False)
    location = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False, default="planned")
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            "id",
            "employee",
            "employee_name",
            "title",
            "start_datetime",
            "end_datetime",
            "location",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "employee_name", "created_at", "updated_at"]

    def to_representation(self, instance):
        start_dt = timezone.make_aware(datetime.combine(instance.date, instance.start_time))
        end_dt = timezone.make_aware(datetime.combine(instance.date, instance.end_time))
        return {
            "id": instance.id,
            "employee": instance.employee_id,
            "employee_name": str(instance.employee),
            "title": "Shift",
            "start_datetime": start_dt.isoformat(),
            "end_datetime": end_dt.isoformat(),
            "location": "",
            "status": "planned",
            "notes": instance.notes,
            "created_at": instance.created_at,
            "updated_at": instance.created_at,
        }

    def get_updated_at(self, obj):
        return obj.created_at

    def _apply_datetime_payload(self, validated_data):
        start_dt = validated_data.pop("start_datetime", None)
        end_dt = validated_data.pop("end_datetime", None)
        validated_data.pop("title", None)
        validated_data.pop("location", None)
        validated_data.pop("status", None)

        if start_dt:
            validated_data["date"] = start_dt.date()
            validated_data["start_time"] = start_dt.time()
        if end_dt:
            validated_data.setdefault("date", end_dt.date())
            validated_data["end_time"] = end_dt.time()
        validated_data.setdefault("date", timezone.now().date())
        validated_data.setdefault("start_time", time(9, 0))
        validated_data.setdefault("end_time", time(17, 0))
        return validated_data

    def create(self, validated_data):
        return super().create(self._apply_datetime_payload(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._apply_datetime_payload(validated_data))


# ─── US-RH-01 : Compétences & Formations ─────────────────────────────────────

from .models import Skill, EmployeeSkill, TrainingSession, TrainingEnrollment


class SkillSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    category_label = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Skill
        fields = ["id", "name", "category", "category_label", "description", "is_active", "created_at"]
        read_only_fields = ["id", "category_label", "created_at"]

    def get_category_label(self, obj):
        return "Autre"

    def get_category(self, obj):
        return "other"

    def get_is_active(self, obj):
        return True


class EmployeeSkillSerializer(serializers.ModelSerializer):
    skill_name = serializers.CharField(source="skill.name", read_only=True)
    skill_category = serializers.SerializerMethodField()
    level_label = serializers.CharField(source="get_level_display", read_only=True)
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    acquired_date = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeSkill
        fields = [
            "id", "employee", "employee_name",
            "skill", "skill_name", "skill_category",
            "level", "level_label", "acquired_date", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "skill_name", "skill_category", "level_label",
            "employee_name", "created_at", "updated_at",
        ]

    def get_skill_category(self, obj):
        return "other"

    def get_updated_at(self, obj):
        return obj.created_at

    def get_acquired_date(self, obj):
        return None



class TrainingEnrollmentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.__str__", read_only=True)
    result = serializers.SerializerMethodField()
    result_label = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()
    certificate_issued = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = TrainingEnrollment
        fields = [
            "id", "session", "employee", "employee_name",
            "result", "result_label", "score",
            "certificate_issued", "notes",
            "enrolled_at", "updated_at",
        ]
        read_only_fields = ["id", "employee_name", "result_label", "enrolled_at", "updated_at"]

    def get_result(self, obj):
        return "passed" if obj.completed else "pending"

    def get_result_label(self, obj):
        return "Reussi" if obj.completed else "En attente"

    def get_score(self, obj):
        return None

    def get_certificate_issued(self, obj):
        return bool(obj.certificate)

    def get_notes(self, obj):
        return ""

    def get_updated_at(self, obj):
        return obj.enrolled_at


class TrainingSessionSerializer(serializers.ModelSerializer):
    skill = serializers.SerializerMethodField()
    skill_name = serializers.SerializerMethodField()
    status = serializers.CharField(required=False)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    enrollments = TrainingEnrollmentSerializer(many=True, read_only=True)
    enrolled_count = serializers.SerializerMethodField()
    duration_hours = serializers.SerializerMethodField()
    max_participants = serializers.SerializerMethodField()
    cost = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    created_by = serializers.IntegerField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSession
        fields = [
            "id", "title", "skill", "skill_name", "description",
            "trainer", "location", "start_date", "end_date",
            "duration_hours", "status", "status_label",
            "max_participants", "enrolled_count", "cost", "notes",
            "enrollments", "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "skill_name", "status_label", "enrolled_count",
            "enrollments", "created_by", "created_by_name", "created_at", "updated_at",
        ]

    def get_enrolled_count(self, obj):
        return obj.enrollments.count()

    def get_skill_name(self, obj):
        return ""

    def get_skill(self, obj):
        return None

    def get_duration_hours(self, obj):
        return "0.0"

    def get_max_participants(self, obj):
        return 0

    def get_cost(self, obj):
        return "0.00"

    def get_notes(self, obj):
        return ""

    def get_created_by_name(self, obj):
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        status_map = {
            TrainingSession.Status.PLANIFIE: "planned",
            TrainingSession.Status.EN_COURS: "ongoing",
            TrainingSession.Status.TERMINE: "completed",
            TrainingSession.Status.ANNULE: "cancelled",
        }
        data["status"] = status_map.get(instance.status, instance.status)
        data["skill"] = None
        data["duration_hours"] = data.get("duration_hours") or "0.0"
        data["max_participants"] = data.get("max_participants") or 0
        data["cost"] = data.get("cost") or "0.00"
        data["notes"] = data.get("notes") or ""
        data["created_by"] = None
        return data

    def _normalize_payload(self, validated_data):
        status_map = {
            "planned": TrainingSession.Status.PLANIFIE,
            "ongoing": TrainingSession.Status.EN_COURS,
            "completed": TrainingSession.Status.TERMINE,
            "cancelled": TrainingSession.Status.ANNULE,
        }
        if "status" in validated_data:
            validated_data["status"] = status_map.get(validated_data["status"], validated_data["status"])
        for key in ("skill", "duration_hours", "max_participants", "cost", "notes"):
            validated_data.pop(key, None)
        return validated_data

    def create(self, validated_data):
        return super().create(self._normalize_payload(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._normalize_payload(validated_data))

# ── S3: Document Request Serializer ──────────────────────────────────────────

from .models import DocumentRequest

class DocumentRequestSerializer(serializers.ModelSerializer):
    employee_name          = serializers.SerializerMethodField()
    handled_by_name        = serializers.SerializerMethodField()
    document_type_display  = serializers.CharField(source="get_document_type_display", read_only=True)

    class Meta:
        model = DocumentRequest
        fields = [
            "id", "employee", "employee_name", "document_type", "document_type_display",
            "motif", "statut", "notes_rh", "handled_by", "handled_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "employee_name", "handled_by_name", "document_type_display", "created_at", "updated_at"]

    def get_employee_name(self, obj):
        return str(obj.employee)

    def get_handled_by_name(self, obj):
        if obj.handled_by:
            return obj.handled_by.get_full_name() or obj.handled_by.username
        return None


# ── S6: Recruitment Serializers ───────────────────────────────────────────────

from .models import JobPost, Application, RecruitmentComment


class JobPostSerializer(serializers.ModelSerializer):
    created_by_name          = serializers.CharField(source="created_by.username", read_only=True)
    application_count        = serializers.IntegerField(read_only=True)
    status_display           = serializers.CharField(source="get_status_display", read_only=True)
    contract_type_display    = serializers.CharField(source="get_contract_type_display", read_only=True)
    experience_level_display = serializers.CharField(source="get_experience_level_display", read_only=True)

    class Meta:
        model = JobPost
        fields = [
            "id", "title", "department", "contract_type", "contract_type_display",
            "experience_level", "experience_level_display", "location",
            "salary_range_min", "salary_range_max", "description", "requirements",
            "benefits", "responsibilities", "posted_at", "closing_date", "start_date",
            "status", "status_display", "is_internal", "application_count",
            "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "posted_at", "application_count", "created_by", "created_at", "updated_at"]


class ApplicationSerializer(serializers.ModelSerializer):
    job_title        = serializers.CharField(source="job_post.title", read_only=True)
    candidate_name   = serializers.SerializerMethodField()
    referred_by_name = serializers.SerializerMethodField()
    status_display   = serializers.CharField(source="get_status_display", read_only=True)
    source_display   = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "job_post", "job_title", "candidate", "candidate_name",
            "referred_by", "referred_by_name", "status", "status_display",
            "source", "source_display", "first_name", "last_name", "email",
            "phone", "cover_letter_text", "rating", "interview_notes", "feedback",
            "applied_at", "reviewed_at", "interview_date", "offer_sent_at",
            "accepted_at", "rejected_at", "reviewed_by", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "applied_at", "reviewed_at", "accepted_at", "rejected_at",
            "offer_sent_at", "reviewed_by", "created_at", "updated_at",
        ]

    def get_candidate_name(self, obj):
        return str(obj.candidate) if obj.candidate else None

    def get_referred_by_name(self, obj):
        return str(obj.referred_by) if obj.referred_by else None


class RecruitmentCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = RecruitmentComment
        fields = "__all__"
        read_only_fields = ["id", "author", "created_at"]


# ── S7: Social Events & Motivations Serializers ───────────────────────────────

from .models import SocialEvent, SocialEventComment, EmployeeRecognition, EmployeeBirthday


class SocialEventSerializer(serializers.ModelSerializer):
    organized_by_name  = serializers.CharField(source="organized_by.username", read_only=True)
    participant_count  = serializers.IntegerField(read_only=True)
    is_full            = serializers.BooleanField(read_only=True)
    event_type_display = serializers.CharField(source="get_event_type_display", read_only=True)
    status_display     = serializers.CharField(source="get_status_display", read_only=True)
    participants_list  = serializers.SerializerMethodField()

    class Meta:
        model = SocialEvent
        fields = [
            "id", "title", "event_type", "event_type_display", "description",
            "event_date", "start_time", "end_time", "location",
            "participants", "participants_list", "participant_count",
            "max_participants", "is_full", "organized_by", "organized_by_name",
            "budget", "status", "status_display", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "participant_count", "is_full", "created_at", "updated_at"]

    def get_participants_list(self, obj):
        return [f"{p.first_name} {p.last_name}" for p in obj.participants.all()[:10]]


class SocialEventCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = SocialEventComment
        fields = "__all__"
        read_only_fields = ["id", "author", "created_at"]


class EmployeeRecognitionSerializer(serializers.ModelSerializer):
    employee_name            = serializers.SerializerMethodField()
    awarded_by_name          = serializers.CharField(source="awarded_by.username", read_only=True)
    recognition_type_display = serializers.CharField(source="get_recognition_type_display", read_only=True)

    class Meta:
        model = EmployeeRecognition
        fields = "__all__"
        read_only_fields = ["id", "awarded_at", "created_at", "awarded_by"]

    def get_employee_name(self, obj):
        return str(obj.employee)


class EmployeeBirthdaySerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    next_birthday = serializers.DateField(read_only=True)
    age           = serializers.IntegerField(read_only=True)

    class Meta:
        model = EmployeeBirthday
        fields = "__all__"
        read_only_fields = ["id", "created_at"]

    def get_employee_name(self, obj):
        return str(obj.employee)
