from django.contrib.auth.models import User
from rest_framework import serializers
from .models import (
    Patient,
    Appointment,
    TreatmentPlan,
    TreatmentSession,
    Ticket,
    Complaint,
    Incident,
    Machine,
    Room,
    RoomBooking,
    OperationBooking,
    OperationStaff,
    TicketComment,
    PatientPortalAccount,
    PatientRating,
    PortalMessage,
    AppointmentExtension,
    DoctorAvailability,
    PatientSchedulingPreferences,
    SlotSuggestion,
    WaitingList,
    PatientDocument,
    TreatmentProtocol,
    ProtocolChangeLog,
    DoseDeviation,
    MaintenanceLog,
)


class PatientSerializer(serializers.ModelSerializer):
    cnam_scheme_display = serializers.CharField(
        source="get_cnam_scheme_display", read_only=True
    )

    class Meta:
        model = Patient
        fields = [
            "id",
            "first_name",
            "last_name",
            "cin",
            "phone",
            "email",
            "birth_date",
            "address",
            "medical_record_number",
            "diagnosis",
            "notes",
            "cnam_scheme",
            "cnam_scheme_display",
            "cnam_affiliation_number",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "medical_record_number", "cnam_scheme_display", "created_at", "updated_at"]


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)

    doctor_id = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    appointment_type = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id", "patient", "patient_name", "title", "appointment_date",
            "status", "reason", "notes", "created_at", "updated_at",
            "doctor_id", "doctor_name", "appointment_type",
            "duration_minutes", "room_name",
        ]
        read_only_fields = ["id", "patient_name", "created_at", "updated_at"]

    def _get_extension(self, obj):
        try:
            return obj.extension
        except AppointmentExtension.DoesNotExist:
            return None

    def get_doctor_id(self, obj):
        ext = self._get_extension(obj)
        return ext.doctor_id if ext else None

    def get_doctor_name(self, obj):
        ext = self._get_extension(obj)
        if ext and ext.doctor:
            return f"{ext.doctor.first_name} {ext.doctor.last_name}".strip() or ext.doctor.username
        return None

    def get_appointment_type(self, obj):
        ext = self._get_extension(obj)
        return ext.appointment_type if ext else None

    def get_duration_minutes(self, obj):
        ext = self._get_extension(obj)
        return ext.duration_minutes if ext else None

    def get_room_name(self, obj):
        ext = self._get_extension(obj)
        return ext.room.name if ext and ext.room else None
    
    
class MaintenanceLogSerializer(serializers.ModelSerializer):
    duration_hours = serializers.ReadOnlyField()
    machine_name   = serializers.CharField(source="machine.name", read_only=True)

    class Meta:
        model = MaintenanceLog
        fields = [
            "id", "machine", "machine_name",
            "intervention_type", "start_datetime", "end_datetime",
            "technician", "description", "result", "cost",
            "next_service_date", "notes", "duration_hours",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "duration_hours", "created_at", "updated_at"]


class MachineSerializer(serializers.ModelSerializer):
    disponibilite      = serializers.ReadOnlyField()
    annual_depreciation = serializers.ReadOnlyField()
    book_value         = serializers.ReadOnlyField()
    calibration_overdue = serializers.ReadOnlyField()
    recent_logs        = serializers.SerializerMethodField()
    room_name          = serializers.SerializerMethodField()

    class Meta:
        model = Machine
        fields = [
            "id", "name", "model", "serial_number", "manufacturer",
            "status", "room", "room_name", "location",
            # Lifecycle
            "purchase_date", "purchase_cost", "useful_life_years", "residual_value",
            # Calibration
            "last_calibration_date", "next_calibration_date", "calibration_interval_days",
            # Reliability
            "mtbf_hours", "mttr_hours",
            # Computed
            "disponibilite", "annual_depreciation", "book_value", "calibration_overdue",
            # Logs preview
            "recent_logs",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "mtbf_hours", "mttr_hours",
            "disponibilite", "annual_depreciation", "book_value", "calibration_overdue",
            "created_at", "updated_at",
        ]

    def get_room_name(self, obj):
        if obj.room_id:
            return str(obj.room.name)
        return obj.location or None

    def get_recent_logs(self, obj):
        logs = obj.maintenance_logs.all()[:5]
        return MaintenanceLogSerializer(logs, many=True).data


class RoomSerializer(serializers.ModelSerializer):
    is_available     = serializers.BooleanField(read_only=True)
    bookings_allowed = serializers.BooleanField(read_only=True)
    active_bookings  = serializers.SerializerMethodField()
    machines_count   = serializers.SerializerMethodField()

    class Meta:
        model  = Room
        fields = [
            "id", "name", "usage", "specialty", "location", "capacity",
            "status", "is_available", "bookings_allowed", "active_bookings",
            "machines_count",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_active_bookings(self, obj):
        from django.utils import timezone
        return obj.bookings.filter(
            status__in=["confirmed", "pending"],
            end_datetime__gte=timezone.now(),
        ).count()

    def get_machines_count(self, obj):
        return obj.machines.count()


class RoomBookingSerializer(serializers.ModelSerializer):
    patient_name   = serializers.SerializerMethodField()
    room_name      = serializers.CharField(source="room.name", read_only=True)
    room_capacity  = serializers.IntegerField(source="room.capacity", read_only=True)
    booked_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = RoomBooking
        fields = [
            "id",
            "room", "room_name", "room_capacity",
            "patient", "patient_name",
            "occupants", "notes_companions",
            "start_datetime", "end_datetime",
            "status", "reason", "notes",
            "booked_by", "booked_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "booked_by", "created_at", "updated_at"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()

    def get_booked_by_name(self, obj):
        if not obj.booked_by:
            return None
        return (
            f"{obj.booked_by.first_name} {obj.booked_by.last_name}".strip()
            or obj.booked_by.username
        )

    def validate(self, attrs):
        room      = attrs.get("room",           getattr(self.instance, "room", None))
        occupants = attrs.get("occupants",      getattr(self.instance, "occupants", 1))
        start     = attrs.get("start_datetime", getattr(self.instance, "start_datetime", None))
        end       = attrs.get("end_datetime",   getattr(self.instance, "end_datetime", None))

        if end and start and end <= start:
            raise serializers.ValidationError("La fin doit être postérieure au début.")
        if room and not room.bookings_allowed:
            raise serializers.ValidationError(
                f"La salle « {room.name} » est de type « {room.get_usage_display()} » "
                f"et n'accepte pas de réservations patients. "
                f"Seules les chambres médicalisées et les salles de rendez-vous sont réservables."
            )
        if room and occupants and room.bookings_allowed and occupants > room.capacity:
            raise serializers.ValidationError(
                f"Le nombre d'occupants ({occupants}) dépasse la capacité "
                f"de la salle ({room.capacity})."
            )
        return attrs

class OperationStaffSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_job  = serializers.CharField(source="employee.job_title", read_only=True)

    class Meta:
        model  = OperationStaff
        fields = ["id", "employee", "employee_name", "employee_job", "role"]

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}".strip()


class OperationBookingSerializer(serializers.ModelSerializer):
    patient_name      = serializers.SerializerMethodField()
    donor_patient_name = serializers.SerializerMethodField()
    room_name         = serializers.CharField(source="room.name", read_only=True)
    booked_by_name    = serializers.SerializerMethodField()
    # Nested staff — read as list, write via separate endpoint or writable nested
    staff_assignments = OperationStaffSerializer(many=True, read_only=True)
    # Write-only convenience: accept staff list on create/update
    staff             = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        help_text='[{"employee": <id>, "role": "Chirurgien principal"}, …]',
    )

    class Meta:
        model  = OperationBooking
        fields = [
            "id",
            "room", "room_name",
            "patient", "patient_name",
            "with_donor", "donor_patient", "donor_patient_name",
            "start_datetime", "end_datetime",
            "status", "operation_type", "notes",
            "booked_by", "booked_by_name",
            "staff_assignments",
            "staff",          # write-only
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "booked_by", "created_at", "updated_at"]

    # ── field-level helpers ───────────────────────────────────────────────────

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()

    def get_donor_patient_name(self, obj):
        if obj.donor_patient:
            return f"{obj.donor_patient.first_name} {obj.donor_patient.last_name}".strip()
        return None

    def get_booked_by_name(self, obj):
        if not obj.booked_by:
            return None
        return (
            f"{obj.booked_by.first_name} {obj.booked_by.last_name}".strip()
            or obj.booked_by.username
        )

    # ── validation ────────────────────────────────────────────────────────────

    def validate(self, attrs):
        from crm.models import Room
        room        = attrs.get("room",           getattr(self.instance, "room", None))
        start       = attrs.get("start_datetime", getattr(self.instance, "start_datetime", None))
        end         = attrs.get("end_datetime",   getattr(self.instance, "end_datetime", None))
        with_donor  = attrs.get("with_donor",     getattr(self.instance, "with_donor", False))
        donor       = attrs.get("donor_patient",  getattr(self.instance, "donor_patient", None))
        patient     = attrs.get("patient",        getattr(self.instance, "patient", None))

        if end and start and end <= start:
            raise serializers.ValidationError("La fin doit être postérieure au début.")

        if room and room.usage != Room.Usage.OPERATION_ROOM:
            raise serializers.ValidationError(
                f"La salle « {room.name} » n'est pas une salle d'opération."
            )

        if with_donor and not donor:
            raise serializers.ValidationError(
                "Sélectionnez un patient donneur quand 'opération avec donneur' est activé."
            )

        if donor and patient and donor.pk == patient.pk:
            raise serializers.ValidationError(
                "Le patient et le donneur ne peuvent pas être la même personne."
            )

        return attrs

    # ── create / update (handle nested staff) ────────────────────────────────

    def _sync_staff(self, instance, staff_data):
        """Recreate staff assignments from the provided list."""
        from crm.models import OperationStaff
        from hr.models import Employee

        instance.staff_assignments.all().delete()
        for item in staff_data:
            emp_id = item.get("employee")
            role   = item.get("role", "").strip()
            if not emp_id or not role:
                continue
            try:
                emp = Employee.objects.get(pk=emp_id)
            except Employee.DoesNotExist:
                continue
            OperationStaff.objects.create(operation=instance, employee=emp, role=role)

    def create(self, validated_data):
        staff_data = validated_data.pop("staff", [])
        instance   = super().create(validated_data)
        if staff_data:
            self._sync_staff(instance, staff_data)
        return instance

    def update(self, instance, validated_data):
        staff_data = validated_data.pop("staff", None)
        instance   = super().update(instance, validated_data)
        if staff_data is not None:
            self._sync_staff(instance, staff_data)
        return instance

class TreatmentPlanSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    cumulative_dose = serializers.SerializerMethodField()
    sessions_completed = serializers.SerializerMethodField()
    dose_percentage = serializers.SerializerMethodField()
    # Add these as computed fields
    number_of_sessions = serializers.SerializerMethodField()
    frequency = serializers.SerializerMethodField()

    class Meta:
        model = TreatmentPlan
        fields = [
            "id",
            "patient",
            "patient_name",
            "name",
            "diagnosis",
            "protocol",
            "total_dose",
            "dose_per_session",
            "total_sessions",  # This is the actual model field
            "number_of_sessions",  # Computed from total_sessions
            "frequency",  # Computed
            "start_date",
            "end_date",
            "status",
            "cumulative_dose",
            "sessions_completed",
            "dose_percentage",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_name",
            "cumulative_dose",
            "sessions_completed",
            "dose_percentage",
            "number_of_sessions",
            "frequency",
            "created_at",
            "updated_at",
        ]

    def get_cumulative_dose(self, obj):
        from django.db.models import Sum
        from .models import TreatmentSession
        result = obj.sessions.filter(
            status=TreatmentSession.Status.COMPLETED
        ).aggregate(total=Sum("dose_delivered"))["total"]
        return float(result) if result else 0.0

    def get_sessions_completed(self, obj):
        from .models import TreatmentSession
        return obj.sessions.filter(status=TreatmentSession.Status.COMPLETED).count()

    def get_dose_percentage(self, obj):
        if not obj.total_dose or float(obj.total_dose) == 0:
            return 0.0
        cumulative = self.get_cumulative_dose(obj)
        return round((cumulative / float(obj.total_dose)) * 100, 1)

    def get_number_of_sessions(self, obj):
        """Return the total number of sessions (alias for total_sessions)."""
        return obj.total_sessions

    def get_frequency(self, obj):
        """Calculate frequency based on session schedule."""
        # Default frequency if not specified
        if hasattr(obj, 'sessions') and obj.sessions.exists():
            # Check if sessions are daily or weekly
            first_session = obj.sessions.order_by('scheduled_datetime').first()
            if first_session:
                # Try to determine frequency from session dates
                sessions = obj.sessions.order_by('scheduled_datetime')[:5]
                if sessions.count() > 1:
                    # Check if sessions are on consecutive days
                    from django.utils import timezone
                    date_diff = (sessions[1].scheduled_datetime.date() - sessions[0].scheduled_datetime.date()).days
                    if date_diff == 1:
                        return "Quotidienne"
                    elif date_diff == 7:
                        return "Hebdomadaire"
                    elif date_diff == 14:
                        return "Bi-hebdomadaire"
        return "Standard"  # Default


class TreatmentSessionSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True)
    treatment_plan_name = serializers.CharField(source="treatment_plan.name", read_only=True)
    machine_name = serializers.CharField(source="machine.__str__", read_only=True, default=None)
    room_name = serializers.CharField(source="room.__str__", read_only=True, default=None)

    class Meta:
        model = TreatmentSession
        fields = [
            "id",
            "patient",
            "patient_name",
            "treatment_plan",
            "treatment_plan_name",
            "session_number",
            "scheduled_datetime",
            "actual_datetime",
            "status",
            "machine",
            "machine_name",
            "room",
            "room_name",
            "dose_delivered",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_name",
            "treatment_plan_name",
            "machine_name",
            "room_name",
            "created_at",
            "updated_at",
        ]


class AgentSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name"]

    def get_name(self, obj):
        full_name = obj.get_full_name()
        return full_name or obj.username


class TicketSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.__str__", read_only=True)
    agents = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False
    )
    agent_details = AgentSerializer(source="agents", many=True, read_only=True)
    sla_status = serializers.CharField(read_only=True)
    sla_remaining_minutes = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Ticket
        fields = [
            "id",
            "numero",
            "titre",
            "description",
            "priorite",
            "statut",
            "client",
            "client_name",
            "agents",
            "agent_details",
            "sla_deadline",
            "sla_breached",
            "sla_status",
            "sla_remaining_minutes",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "numero", "client_name", "agent_details",
            "sla_deadline", "sla_breached", "sla_status",
            "sla_remaining_minutes", "resolved_at", "created_at", "updated_at",
        ]


class ComplaintSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.__str__", read_only=True)

    class Meta:
        model = Complaint
        fields = [
            "id",
            "description",
            "statut",
            "client",
            "client_name",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = ["id", "client_name", "created_at", "resolved_at"]


class PublicTicketSubmitSerializer(serializers.Serializer):
    medical_record_number = serializers.CharField()
    last_name = serializers.CharField()
    titre = serializers.CharField(max_length=255)
    description = serializers.CharField()
    priorite = serializers.ChoiceField(
        choices=Ticket.Priority.choices, required=False, default=Ticket.Priority.FAIBLE
    )

    def validate(self, attrs):
        try:
            attrs["patient"] = Patient.objects.get(
                medical_record_number__iexact=attrs["medical_record_number"],
                last_name__iexact=attrs["last_name"],
            )
        except Patient.DoesNotExist:
            raise serializers.ValidationError(
                "Dossier patient introuvable. Vérifiez le numéro de dossier et le nom."
            )
        return attrs

    def create(self, validated_data):
        patient = validated_data.pop("patient")
        validated_data.pop("medical_record_number")
        validated_data.pop("last_name")
        return Ticket.objects.create(client=patient, **validated_data)


class PublicTicketStatusSerializer(serializers.Serializer):
    numero = serializers.CharField()
    medical_record_number = serializers.CharField()


class IncidentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.__str__", read_only=True, default=None)
    reported_by_name = serializers.CharField(source="reported_by.get_full_name", read_only=True, default=None)
    agents = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False
    )
    agent_details = AgentSerializer(source="agents", many=True, read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id",
            "numero",
            "titre",
            "description",
            "priorite",
            "statut",
            "patient",
            "patient_name",
            "equipment_or_location",
            "reported_by",
            "reported_by_name",
            "agents",
            "agent_details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "numero", "patient_name", "reported_by_name",
            "agent_details", "created_at", "updated_at"
        ]


class PublicComplaintSubmitSerializer(serializers.Serializer):
    medical_record_number = serializers.CharField()
    last_name = serializers.CharField()
    description = serializers.CharField()

    def validate(self, attrs):
        try:
            attrs["patient"] = Patient.objects.get(
                medical_record_number__iexact=attrs["medical_record_number"],
                last_name__iexact=attrs["last_name"],
            )
        except Patient.DoesNotExist:
            raise serializers.ValidationError(
                "Dossier patient introuvable. Vérifiez le numéro de dossier et le nom."
            )
        return attrs

    def create(self, validated_data):
        patient = validated_data.pop("patient")
        validated_data.pop("medical_record_number")
        validated_data.pop("last_name")
        return Complaint.objects.create(client=patient, description=validated_data["description"])


class PublicComplaintStatusSerializer(serializers.Serializer):
    numero = serializers.CharField()
    medical_record_number = serializers.CharField()


class TicketCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketComment
        fields = [
            "id",
            "ticket",
            "author",
            "author_name",
            "body",
            "is_intervention",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "author_name", "created_at", "updated_at"]

    def get_author_name(self, obj):
        if obj.author is None:
            return "Unknown"
        full = obj.author.get_full_name()
        return full or obj.author.username
 
# ─── Auth ─────────────────────────────────────────────────────────────────────
 
class PortalLoginSerializer(serializers.Serializer):
    last_name = serializers.CharField()
    cin = serializers.CharField()
    medical_record_number = serializers.CharField()
    # Optional: if omitted the backend sends a one-time password by email
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
 
 
class PortalRegisterSerializer(serializers.Serializer):
    """Création du compte portail par le staff (secrétaire/admin)."""
    patient_id = serializers.IntegerField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
 
    def validate_patient_id(self, value):
        try:
            return Patient.objects.get(pk=value)
        except Patient.DoesNotExist:
            raise serializers.ValidationError("Patient introuvable.")
 
    def validate_email(self, value):
        if PatientPortalAccount.objects.filter(email=value).exists():
            raise serializers.ValidationError("Cet email est déjà utilisé.")
        return value
 
    def create(self, validated_data):
        patient = validated_data["patient_id"]  # already a Patient instance
        account = PatientPortalAccount(
            patient=patient,
            email=validated_data["email"],
        )
        account.set_password(validated_data["password"])
        account.save()
        return account
 
 
class PortalPasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
 
    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError("Les mots de passe ne correspondent pas.")
        return data
 
 
class PortalPasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
 
 
class PortalPasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
 
 
# ─── Patient Profile ──────────────────────────────────────────────────────────
 
class PortalPatientProfileSerializer(serializers.ModelSerializer):
    """Lecture + mise à jour des coordonnées du patient depuis le portail."""

    date_of_birth = serializers.DateField(source="birth_date", allow_null=True, required=False)
    class Meta:
        model = Patient
        fields = [
            "id", "first_name", "last_name", "email", "phone",
            "address", "date_of_birth", "medical_record_number",
        ]
        read_only_fields = ["id", "medical_record_number", "date_of_birth"]
 
 
class PortalAccountSerializer(serializers.ModelSerializer):
    """Préférences du compte portail."""
    class Meta:
        model = PatientPortalAccount
        fields = ["email", "notify_email", "notify_sms", "last_login", "is_active"]
        read_only_fields = ["email", "last_login", "is_active"]
 
 
# ─── Appointments ─────────────────────────────────────────────────────────────
 
class PortalAppointmentSerializer(serializers.ModelSerializer):
    date = serializers.DateTimeField(source="appointment_date", read_only=True)
    type = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
 
    class Meta:
        model = Appointment
        fields = [
            "id", "date", "status", "type", "duration_minutes",
            "doctor_name", "room_name", "notes",
        ]
 
    def _extension(self, obj):
        try:
            return obj.extension
        except AppointmentExtension.DoesNotExist:
            return None

    def get_type(self, obj):
        extension = self._extension(obj)
        return extension.appointment_type if extension else obj.title

    def get_duration_minutes(self, obj):
        extension = self._extension(obj)
        return extension.duration_minutes if extension else None

    def get_doctor_name(self, obj):
        extension = self._extension(obj)
        if extension and extension.doctor:
            return f"{extension.doctor.first_name} {extension.doctor.last_name}".strip() or extension.doctor.username
        return None
 
    def get_room_name(self, obj):
        extension = self._extension(obj)
        if extension and extension.room:
            return extension.room.name
        return None
 
 
# ─── Treatment Plans & Sessions ───────────────────────────────────────────────
 
class PortalTreatmentSessionSerializer(serializers.ModelSerializer):
    scheduled_date = serializers.DateTimeField(source="scheduled_datetime", read_only=True)
    dose_delivered_gy = serializers.DecimalField(
        source="dose_delivered",
        max_digits=6,
        decimal_places=2,
        read_only=True,
    )
    machine_name = serializers.SerializerMethodField()
 
    class Meta:
        model = TreatmentSession
        fields = [
            "id", "session_number", "scheduled_date", "status",
            "dose_delivered_gy", "machine_name", "notes",
        ]
 
    def get_machine_name(self, obj):
        if obj.machine:
            return obj.machine.name
        return None
 
 
class PortalTreatmentPlanSerializer(serializers.ModelSerializer):
    sessions = PortalTreatmentSessionSerializer(many=True, read_only=True)
    total_dose_gy = serializers.DecimalField(
        source="total_dose",
        max_digits=7,
        decimal_places=2,
        read_only=True,
    )
    number_of_fractions = serializers.IntegerField(source="total_sessions", read_only=True)
    progress_pct = serializers.SerializerMethodField()
 
    class Meta:
        model = TreatmentPlan
        fields = [
            "id", "diagnosis", "status", "total_dose_gy",
            "number_of_fractions", "start_date", "end_date",
            "sessions", "progress_pct",
        ]
 
    def get_progress_pct(self, obj):
        total = obj.total_sessions or 0
        if total == 0:
            return 0
        done = obj.sessions.filter(status="completed").count()
        return round((done / total) * 100)
 
 
# ─── Messages ─────────────────────────────────────────────────────────────────
 
class PortalMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
 
    class Meta:
        model = PortalMessage
        fields = [
            "id", "direction", "subject", "content",
            "is_read", "read_at", "created_at", "sender_name",
        ]
        read_only_fields = ["id", "direction", "is_read", "read_at", "created_at", "sender_name"]
 
    def get_sender_name(self, obj):
        if obj.direction == PortalMessage.Direction.STAFF_TO_PATIENT and obj.staff_author:
            return f"{obj.staff_author.first_name} {obj.staff_author.last_name}".strip() or obj.staff_author.username
        return "Vous"
 
 
class PortalMessageCreateSerializer(serializers.Serializer):
    """Patient envoie un message vers le staff."""
    subject = serializers.CharField(max_length=200, required=False, allow_blank=True)
    content = serializers.CharField(min_length=5)
 
 
class StaffReplySerializer(serializers.Serializer):
    """Staff répond à un patient via le portail (vue interne)."""
    patient_id = serializers.IntegerField()
    subject = serializers.CharField(max_length=200, required=False, allow_blank=True)
    content = serializers.CharField(min_length=1)
 
 
# ─── Ratings ─────────────────────────────────────────────────────────────────
 
class PortalRatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientRating
        fields = ["id", "score", "comment", "treatment_session", "created_at"]
        read_only_fields = ["id", "created_at"]
 
    def validate_score(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError("Le score doit être entre 1 et 5.")
        return value
 
 
# ─── Documents ────────────────────────────────────────────────────────────────
 
class PatientDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
 
    class Meta:
        model = PatientDocument
        fields = [
            "id", "document_type", "title", "file_path",
            "file_size_kb", "uploaded_by_name", "created_at",
        ]
 
    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None
 
 
# ─── Dashboard Summary ────────────────────────────────────────────────────────
 
class PortalDashboardSerializer(serializers.Serializer):
    """Agrégat pour le widget de tableau de bord patient."""
    patient = PortalPatientProfileSerializer()
    upcoming_appointments = PortalAppointmentSerializer(many=True)
    active_treatment = PortalTreatmentPlanSerializer(allow_null=True)
    unread_messages = serializers.IntegerField()
    unpaid_invoices_count = serializers.IntegerField()
    unpaid_invoices_total = serializers.DecimalField(max_digits=10, decimal_places=3)
    
class DoctorAvailabilitySerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    room_name   = serializers.SerializerMethodField()
 
    class Meta:
        model = DoctorAvailability
        fields = ["id", "doctor", "doctor_name", "day_of_week", "start_time", "end_time", "is_active", "room", "room_name"]
 
    def get_doctor_name(self, obj):
        return f"{obj.doctor.first_name} {obj.doctor.last_name}".strip() or obj.doctor.username

    def get_room_name(self, obj):
        return obj.room.name if obj.room_id else None
 
 
class PatientPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientSchedulingPreferences
        fields = ["id", "patient", "preferred_time_slot", "preferred_days", "preferred_doctor"]
 
 
class AppointmentExtensionSerializer(serializers.ModelSerializer):
    doctor_name  = serializers.SerializerMethodField()
    room_name    = serializers.SerializerMethodField()
    machine_name = serializers.SerializerMethodField()
 
    class Meta:
        model = AppointmentExtension
        fields = [
            "id", "appointment", "doctor", "doctor_name",
            "room", "room_name", "machine", "machine_name",
            "appointment_type", "duration_minutes", "priority",
            "relevance_score", "confirmation_deadline", "confirmed_at",
            "reminder_7d_sent", "reminder_3d_sent", "reminder_1d_sent",
        ]
        read_only_fields = ["confirmed_at", "reminder_7d_sent", "reminder_3d_sent", "reminder_1d_sent"]
 
    def get_doctor_name(self, obj):
        if obj.doctor:
            return f"{obj.doctor.first_name} {obj.doctor.last_name}".strip() or obj.doctor.username
        return None
 
    def get_room_name(self, obj):
        return obj.room.name if obj.room else None
 
    def get_machine_name(self, obj):
        return obj.machine.name if obj.machine else None
 
 
class SlotSuggestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlotSuggestion
        fields = [
            "id", "suggestion_type", "proposed_date", "duration_minutes",
            "relevance_score", "is_accepted", "is_expired", "expires_at",
        ]
 
 
class WaitingListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
 
    class Meta:
        model = WaitingList
        fields = [
            "id", "patient", "patient_name", "doctor", "appointment_type",
            "priority", "earliest_date", "latest_date",
            "proposed_slot", "proposal_expires", "proposal_accepted",
            "is_active", "created_at",
        ]
 
    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()
 
 
# ─── Request serializers ──────────────────────────────────────────────────────
 
class SmartSuggestRequestSerializer(serializers.Serializer):
    patient_id       = serializers.IntegerField()
    doctor_id        = serializers.IntegerField()
    appointment_type = serializers.ChoiceField(
        choices=["simple", "complex", "followup", "urgency"],
        default="simple",
    )
    priority         = serializers.ChoiceField(choices=[1, 2, 3], default=2)
    target_date      = serializers.DateTimeField(required=False, allow_null=True)
 
 
class SmartBookRequestSerializer(serializers.Serializer):
    patient_id       = serializers.IntegerField()
    doctor_id        = serializers.IntegerField()
    slot_datetime    = serializers.DateTimeField()
    appointment_type = serializers.ChoiceField(
        choices=["simple", "complex", "followup", "urgency"],
        default="simple",
    )
    priority         = serializers.ChoiceField(choices=[1, 2, 3], default=2)
    room_id          = serializers.IntegerField(required=False, allow_null=True)
    machine_id       = serializers.IntegerField(required=False, allow_null=True)
    reason           = serializers.CharField(required=False, allow_blank=True, default="")

# ─────────────────────────────────────────────────────────────────────────────
# US-TRT-05 — Protocoles de Traitement : sérialiseurs
# À coller à la fin de backend/apps/crm/serializers.py
# ET ajouter dans l'import models en tête de fichier :
#   TreatmentProtocol, ProtocolChangeLog, DoseDeviation,
# ─────────────────────────────────────────────────────────────────────────────


class ProtocolChangeLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = ProtocolChangeLog
        fields = [
            "id", "action", "performed_by_name",
            "changes", "comment", "created_at",
        ]

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return f"{obj.performed_by.first_name} {obj.performed_by.last_name}".strip() \
                   or obj.performed_by.username
        return None


class TreatmentProtocolSerializer(serializers.ModelSerializer):
    created_by_name  = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    changelog        = ProtocolChangeLogSerializer(many=True, read_only=True)
    versions_count   = serializers.SerializerMethodField()
    computed_total_dose   = serializers.CharField(read_only=True)
    computed_duration_days = serializers.IntegerField(read_only=True)

    class Meta:
        model  = TreatmentProtocol
        fields = [
            "id", "name", "version", "parent",
            "icd10_code", "icd10_label", "cancer_type",
            "radiation_type", "total_dose_gy", "dose_per_fraction_gy",
            "number_of_fractions", "fraction_interval", "total_duration_days",
            "international_reference", "description",
            "preparation_instructions", "contraindications",
            "status",
            "created_by", "created_by_name",
            "approved_by", "approved_by_name", "approved_at",
            "created_at", "updated_at",
            "computed_total_dose", "computed_duration_days",
            "changelog", "versions_count",
        ]
        read_only_fields = [
            "version", "status", "approved_by", "approved_at",
            "created_at", "updated_at",
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() \
                   or obj.created_by.username
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip() \
                   or obj.approved_by.username
        return None

    def get_versions_count(self, obj):
        """Remonte jusqu'à la racine et compte toutes les versions."""
        root = obj
        while root.parent_id:
            root = root.parent
        def _count(node):
            return 1 + sum(_count(c) for c in node.children.all())
        return _count(root)


class TreatmentProtocolListSerializer(serializers.ModelSerializer):
    """Version allégée pour le listing (sans changelog)."""
    created_by_name  = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    computed_total_dose = serializers.CharField(read_only=True)

    class Meta:
        model  = TreatmentProtocol
        fields = [
            "id", "name", "version", "parent",
            "icd10_code", "icd10_label", "cancer_type",
            "radiation_type", "total_dose_gy", "dose_per_fraction_gy",
            "number_of_fractions", "fraction_interval",
            "status",
            "created_by_name", "approved_by_name", "approved_at",
            "created_at", "computed_total_dose",
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() \
                   or obj.created_by.username
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip() \
                   or obj.approved_by.username
        return None


class DoseDeviationSerializer(serializers.ModelSerializer):
    reviewed_by_name = serializers.SerializerMethodField()
    session_info     = serializers.SerializerMethodField()

    class Meta:
        model  = DoseDeviation
        fields = [
            "id", "session", "session_info",
            "protocol",
            "expected_dose_gy", "delivered_dose_gy", "deviation_pct",
            "severity", "notes",
            "reviewed", "reviewed_by", "reviewed_by_name", "reviewed_at",
            "created_at",
        ]
        read_only_fields = [
            "deviation_pct", "severity", "created_at",
        ]

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip() \
                   or obj.reviewed_by.username
        return None

    def get_session_info(self, obj):
        s = obj.session
        return {
            "id": s.id,
            "session_number": s.session_number,
            "patient_name": f"{s.patient.first_name} {s.patient.last_name}".strip(),
            "scheduled_datetime": s.scheduled_datetime.isoformat(),
        }