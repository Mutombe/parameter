"""Signals for masterfile module."""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Property


@receiver(post_save, sender=Property)
def auto_provision_income_accounts(sender, instance, created, **kwargs):
    """Auto-provision income accounts when a new property is created."""
    if created:
        from apps.accounting.income_provisioning import provision_income_accounts
        provision_income_accounts(instance)
