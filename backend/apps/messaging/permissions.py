# apps/messaging/permissions.py 

from apps.accounts.permissions import ReadOnlyOrRole


class MessagingPermission(ReadOnlyOrRole):
    """Messaging module — notifications, emails, SMS."""
    allowed_roles = ["admin", "hr", "doctor", "secretary"]
    module_label = "Messages"