from django.apps import AppConfig


class CrmConfig(AppConfig):
    name = 'apps.crm'

    def ready(self):
        import apps.crm.signals  # noqa: F401