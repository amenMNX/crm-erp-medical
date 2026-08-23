from __future__ import annotations
 
import secrets
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING
 
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
 
if TYPE_CHECKING:
    from .models import (
        Appointment,
        Patient,
        Room,
        Machine,
        DoctorAvailability,
        PatientSchedulingPreferences,
        SlotSuggestion,
        WaitingList,
        AppointmentExtension,
    )
 
User = get_user_model()
 
# ─── Durées par type ──────────────────────────────────────────────────────────
DURATION_MAP = {"simple": 15, "complex": 30, "followup": 45, "urgency": 30}
MIN_GAP_MINUTES = 5          # Délai minimum entre 2 RDV
MAX_RDV_PER_DAY = 10         # Maximum RDV par médecin par jour
CONFIRMATION_HOURS = 48      # Délai de confirmation patient
MIN_BOOKING_DAYS = 2         # Délai minimum avant RDV (sauf urgence)
 
 
def _score_slot(
    slot_dt: datetime,
    doctor_id: int,
    prefs: "PatientSchedulingPreferences | None",
    target_date: datetime | None,
) -> float:
    """
    Score = (Disponibilité médecin × 0.3) + (Préférences patient × 0.3)
           + (Disponibilité équipement × 0.2) + (Délai souhaité × 0.2)
    Retourne un score entre 0 et 10.
    """
    from .models import AppointmentExtension
 
    # 1. Disponibilité médecin : pas surchargé ce jour-là
    day_start = slot_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = slot_dt.replace(hour=23, minute=59, second=59)
    rdv_today = AppointmentExtension.objects.filter(
        doctor_id=doctor_id,
        appointment__appointment_date__range=(day_start, day_end),
        appointment__status__in=("scheduled", "confirmed"),
    ).count()
    doctor_score = max(0.0, 1.0 - rdv_today / MAX_RDV_PER_DAY)
 
    # 2. Préférences patient
    patient_score = 0.5  # neutre par défaut
    if prefs:
        hour = slot_dt.hour
        slot_ok = (
            (prefs.preferred_time_slot == "morning"   and 8  <= hour < 12) or
            (prefs.preferred_time_slot == "afternoon" and 12 <= hour < 17) or
            prefs.preferred_time_slot == "any"
        )
        day_ok = (
            not prefs.preferred_days or
            slot_dt.weekday() in (prefs.preferred_days or [])
        )
        doctor_ok = (
            prefs.preferred_doctor_id is None or
            prefs.preferred_doctor_id == doctor_id
        )
        patient_score = (0.5 * slot_ok + 0.3 * day_ok + 0.2 * doctor_ok)
 
    # 3. Disponibilité équipement : score fixe 1.0 (à affiner avec GMAO)
    equipment_score = 1.0
 
    # 4. Délai souhaité
    delay_score = 1.0
    if target_date:
        diff_days = abs((slot_dt.date() - target_date.date()).days)
        delay_score = max(0.0, 1.0 - diff_days / 30)
 
    raw = (
        doctor_score   * 0.3 +
        patient_score  * 0.3 +
        equipment_score* 0.2 +
        delay_score    * 0.2
    )
    return round(raw * 10, 2)  # 0–10
 
 
def _existing_slots_for_doctor(doctor_id: int, target_date: date):
    """Retourne les créneaux déjà pris pour un médecin un jour donné."""
    from .models import AppointmentExtension
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end   = datetime.combine(target_date, datetime.max.time())
    return list(
        AppointmentExtension.objects.filter(
            doctor_id=doctor_id,
            appointment__appointment_date__range=(
                timezone.make_aware(day_start),
                timezone.make_aware(day_end),
            ),
            appointment__status__in=("scheduled", "confirmed"),
        ).values_list("appointment__appointment_date", "duration_minutes")
    )
 
 
def _is_slot_free(
    doctor_id: int,
    proposed_dt: datetime,
    duration: int,
) -> bool:
    """Vérifie qu'un créneau est libre (pas de chevauchement)."""
    start = proposed_dt
    end   = proposed_dt + timedelta(minutes=duration + MIN_GAP_MINUTES)
    existing = _existing_slots_for_doctor(doctor_id, proposed_dt.date())
    for apt_dt, apt_dur in existing:
        apt_end = apt_dt + timedelta(minutes=apt_dur + MIN_GAP_MINUTES)
        # Chevauchement si start < apt_end ET end > apt_dt
        if start < apt_end and end > apt_dt:
            return False
    return True
 
 
def suggest_slots(
    patient: "Patient",
    doctor_id: int,
    appointment_type: str = "simple",
    priority: int = 2,
    target_date: datetime | None = None,
) -> list[dict]:
    """
    Retourne une liste de 3 suggestions de créneaux optimaux.
    Structure retournée : [{ type, datetime, duration, score }, ...]
    """
    from .models import PatientSchedulingPreferences
 
    duration = DURATION_MAP.get(appointment_type, 15)
    min_start_days = 0 if priority == 1 else MIN_BOOKING_DAYS  # urgences = J+0
 
    try:
        prefs = patient.scheduling_preferences
    except PatientSchedulingPreferences.DoesNotExist:
        prefs = None
 
    # Chercher jusqu'à 60 jours en avant
    now = timezone.now()
    slots_found: list[dict] = []
    check_date = (now + timedelta(days=min_start_days)).date()
    end_search  = check_date + timedelta(days=60)
 
    # Heures de travail candidates : 8h à 17h par tranches de 15 min
    candidate_hours = []
    h, m = 8, 0
    while h < 17:
        candidate_hours.append((h, m))
        m += 15
        if m >= 60:
            m = 0
            h += 1
 
    while check_date <= end_search and len(slots_found) < 9:
        # Sauter week-end
        if check_date.weekday() >= 6:
            check_date += timedelta(days=1)
            continue
 
        for h, m in candidate_hours:
            slot_dt = timezone.make_aware(
                datetime(check_date.year, check_date.month, check_date.day, h, m)
            )
            if slot_dt <= now:
                continue
            if not _is_slot_free(doctor_id, slot_dt, duration):
                continue
 
            score = _score_slot(slot_dt, doctor_id, prefs, target_date)
            slots_found.append({"datetime": slot_dt, "duration": duration, "score": score})
 
        check_date += timedelta(days=1)
 
    if not slots_found:
        return []
 
    # Trier par score desc
    slots_found.sort(key=lambda x: -x["score"])
 
    # Sélectionner les 3 meilleurs selon les types requis
    best  = slots_found[0]                            # Le plus adapté (score max)
    # Le plus proche = le plus tôt (premier en ordre chronologique)
    by_date = sorted(slots_found, key=lambda x: x["datetime"])
    closest  = by_date[0]
    # Le plus flexible = meilleur parmi ceux à une heure différente de best
    flexible = next(
        (s for s in slots_found if s["datetime"].hour != best["datetime"].hour),
        slots_found[min(1, len(slots_found)-1)],
    )
 
    result = [
        {"type": "closest",    **closest,  "score": closest["score"]},
        {"type": "best_match", **best,     "score": best["score"]},
        {"type": "flexible",   **flexible, "score": flexible["score"]},
    ]
    return result
 
 
def book_slot(
    patient: "Patient",
    doctor_id: int,
    slot_dt: datetime,
    appointment_type: str = "simple",
    priority: int = 2,
    room_id: int | None = None,
    machine_id: int | None = None,
    reason: str = "",
) -> "Appointment":
    """Crée le RDV + son extension + le token de confirmation."""
    from .models import Appointment
    from .models import AppointmentExtension
 
    duration = DURATION_MAP.get(appointment_type, 15)
 
    apt = Appointment.objects.create(
        patient=patient,
        title=f"RDV {appointment_type} — {patient}",
        appointment_date=slot_dt,
        status=Appointment.Status.SCHEDULED,
        reason=reason,
    )
 
    token = secrets.token_urlsafe(24)
    ext = AppointmentExtension.objects.create(
        appointment=apt,
        doctor_id=doctor_id,
        room_id=room_id,
        machine_id=machine_id,
        appointment_type=appointment_type,
        duration_minutes=duration,
        priority=priority,
        confirmation_token=token,
        confirmation_deadline=timezone.now() + timedelta(hours=CONFIRMATION_HOURS),
    )
    return apt
 
 
def handle_cancellation(appointment_id: int) -> list["WaitingList"]:
    """
    Gère un désistement : propose le créneau libéré à la liste d'attente.
    Retourne les entrées de liste d'attente notifiées.
    """
    from .models import Appointment
    from .models import AppointmentExtension, WaitingList
 
    try:
        apt = Appointment.objects.get(pk=appointment_id)
        ext = apt.extension
    except (Appointment.DoesNotExist, AppointmentExtension.DoesNotExist):
        return []
 
    # Marquer comme annulé
    apt.status = Appointment.Status.CANCELLED
    apt.save()
 
    # Chercher des candidats dans la liste d'attente
    candidates = WaitingList.objects.filter(
        doctor=ext.doctor,
        is_active=True,
        proposal_accepted__isnull=True,
    ).order_by("priority", "created_at")[:3]
 
    notified = []
    for entry in candidates:
        entry.proposed_slot    = apt.appointment_date
        entry.proposal_expires = timezone.now() + timedelta(hours=2)
        entry.save()
        # TODO: envoyer notification email/SMS au patient
        notified.append(entry)
 
    return notified
