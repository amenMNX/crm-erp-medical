from django.apps import AppConfig


class HrConfig(AppConfig):
    name = 'apps.hr'

    def ready(self):
        import apps.hr.signals  # noqa: F401