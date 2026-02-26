from django.apps import AppConfig


class MasterfileConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.masterfile'
    verbose_name = 'Masterfile'

    def ready(self):
        import apps.masterfile.signals  # noqa: F401
