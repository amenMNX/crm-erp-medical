"""
CRM post-save signals.

Registered in CrmConfig.ready() (apps.py).
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="crm.TreatmentSession")
def missed_session_auto_ticket(sender, instance, created, **kwargs):
    """
    When a TreatmentSession is saved with status='missed', automatically open
    a follow-up Ticket so the care team can reschedule or follow up.
    """
    from .models import Ticket

    if created:
        return
    if instance.status != "missed":
        return

    titre = f"Séance manquée — {instance.patient} (S{instance.session_number})"

    if Ticket.objects.filter(client=instance.patient, titre=titre).exists():
        return

    description = (
        f"La séance n°{instance.session_number} du plan "
        f"« {instance.treatment_plan.name} » "
        f"prévue le {instance.scheduled_datetime.strftime('%d/%m/%Y à %H:%M')} "
        f"a été marquée comme manquée.\n\n"
        f"Action requise : replanifier ou contacter le patient."
    )

    Ticket.objects.create(
        client=instance.patient,
        titre=titre,
        description=description,
        priorite=Ticket.Priority.ELEVEE,
        statut=Ticket.Status.NOUVEAU,
    )


@receiver(post_save, sender="crm.Ticket")
def ticket_resolved_notify_agents(sender, instance, created, **kwargs):
    """
    When a Ticket transitions to 'Résolu' or 'Fermé', send an in-app
    Notification to every agent assigned to it.
    """
    from apps.messaging.models import Notification

    if created:
        return
    if instance.statut not in ("Résolu", "Fermé"):
        return

    agents = instance.agents.select_related("profile").all()
    if not agents.exists():
        return

    title = f"Ticket {instance.numero} — {instance.statut}"
    body = (
        f"Le ticket « {instance.titre} » (client : {instance.client}) "
        f"a été marqué comme {instance.statut}. "
        f"Vous pouvez contacter le patient pour confirmation."
    )

    for agent in agents:
        Notification.objects.get_or_create(
            recipient=agent,
            title=title,
            defaults={
                "body": body,
                "level": Notification.Level.SUCCESS,
            },
        )


@receiver(post_save, sender="crm.Ticket")
def ticket_critical_notify_supervisors(sender, instance, created, **kwargs):
    """
    When a Ticket with priority 'Critique' is created or updated,
    immediately notify all admin users.
    """
    from django.contrib.auth.models import User
    from apps.messaging.models import Notification

    if instance.priorite != "Critique":
        return

    if instance.statut in ("Résolu", "Fermé"):
        return

    # Use a stable title (no 'ouvert'/'mis à jour') so get_or_create deduplicates
    # across both the creation save and any subsequent update saves.
    title = f"🚨 Ticket Critique — {instance.numero}"
    body = (
        f"Ticket de priorité Critique : "
        f"« {instance.titre} » (client : {instance.client}). "
        f"Statut actuel : {instance.statut}. Intervention immédiate requise."
    )

    admins = User.objects.filter(profile__role="admin").distinct()
    for admin in admins:
        notif, created_notif = Notification.objects.get_or_create(
            recipient=admin,
            title=title,
            defaults={"body": body, "level": Notification.Level.ERROR},
        )
        # If the notification already existed, refresh its body in case the
        # ticket status changed (e.g. Nouveau → En cours) so admins see the
        # latest state without receiving a duplicate notification.
        if not created_notif and notif.body != body:
            notif.body = body
            notif.save(update_fields=["body"])