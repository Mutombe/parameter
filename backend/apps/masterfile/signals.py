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


@receiver(post_save, sender=Property)
def seed_landlord_subsidiary_accounts(sender, instance, created, **kwargs):
    """Seed the full set of category sub-accounts for the landlord once a
    property establishes the management type (rental: 12, levy: 10).

    Runs on every Property save so that if the first property is added later
    or the management_type is corrected, the landlord ends up with the full
    expected slate. get_or_create inside seed_for_landlord keeps this idempotent.
    """
    if not instance.landlord_id:
        return
    from apps.accounting.models import SubsidiaryAccount
    try:
        SubsidiaryAccount.seed_for_landlord(
            instance.landlord, management_type=instance.management_type
        )
    except Exception:
        # Don't block property save if seeding fails; a later save will retry.
        pass
