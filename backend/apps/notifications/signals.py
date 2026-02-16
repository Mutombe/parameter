"""
Django signals for automatic notification creation.
Tracks masterfile changes and creates notifications for relevant users.
"""
import logging
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


def get_request_context():
    """Get current request context from thread local storage."""
    from middleware.tenant_middleware import get_current_user
    return get_current_user()


def get_changed_fields(instance, old_instance):
    """Compare two instances and return changed fields."""
    changes = {}
    if old_instance is None:
        return changes

    for field in instance._meta.fields:
        field_name = field.name
        if field_name in ['updated_at', 'created_at']:
            continue

        old_value = getattr(old_instance, field_name, None)
        new_value = getattr(instance, field_name, None)

        if old_value != new_value:
            # Handle related objects
            if hasattr(old_value, 'pk'):
                old_value = str(old_value)
            if hasattr(new_value, 'pk'):
                new_value = str(new_value)

            changes[field_name] = {
                'old': str(old_value) if old_value is not None else None,
                'new': str(new_value) if new_value is not None else None
            }

    return changes


def create_masterfile_notification(entity_type, entity_id, entity_name, change_type, changes=None, user=None):
    """Create notification for masterfile changes."""
    from apps.notifications.models import Notification, MasterfileChangeLog
    from apps.masterfile.models import PropertyManager

    # Get all admin and accountant users
    notify_users = User.objects.filter(
        role__in=[User.Role.ADMIN, User.Role.ACCOUNTANT],
        is_active=True,
        notifications_enabled=True
    )

    # Also notify property managers if entity is property-related
    if entity_type in ('property', 'unit', 'tenant', 'lease'):
        property_id = None
        if entity_type == 'property':
            property_id = entity_id
        elif entity_type in ('unit', 'lease'):
            try:
                from apps.masterfile.models import Unit, LeaseAgreement
                if entity_type == 'unit':
                    unit = Unit.objects.filter(pk=entity_id).select_related('property').first()
                    if unit:
                        property_id = unit.property_id
                elif entity_type == 'lease':
                    lease = LeaseAgreement.objects.filter(pk=entity_id).select_related('unit__property').first()
                    if lease and lease.unit:
                        property_id = lease.unit.property_id
            except Exception:
                pass

        if property_id:
            manager_user_ids = PropertyManager.objects.filter(
                property_id=property_id
            ).values_list('user_id', flat=True)
            manager_users = User.objects.filter(
                id__in=manager_user_ids,
                is_active=True,
                notifications_enabled=True
            )
            notify_users = (notify_users | manager_users).distinct()

    # Exclude the user who made the change
    if user:
        notify_users = notify_users.exclude(id=user.id)

    notification_type_map = {
        'created': Notification.NotificationType.MASTERFILE_CREATED,
        'updated': Notification.NotificationType.MASTERFILE_UPDATED,
        'deleted': Notification.NotificationType.MASTERFILE_DELETED,
    }

    title_map = {
        'created': f'New {entity_type.title()} Added',
        'updated': f'{entity_type.title()} Updated',
        'deleted': f'{entity_type.title()} Deleted',
    }

    message_map = {
        'created': f'{entity_name} has been added to the system.',
        'updated': f'{entity_name} has been modified.',
        'deleted': f'{entity_name} has been removed from the system.',
    }

    # Create notification for each user
    for notify_user in notify_users:
        try:
            notification = Notification.objects.create(
                user=notify_user,
                notification_type=notification_type_map.get(change_type, 'masterfile_updated'),
                title=title_map.get(change_type, 'Masterfile Change'),
                message=message_map.get(change_type, f'{entity_name} was changed.'),
                data={
                    'entity_type': entity_type,
                    'entity_id': entity_id,
                    'entity_name': entity_name,
                    'change_type': change_type,
                    'changes': changes or {},
                    'changed_by': user.email if user else 'System'
                }
            )
            # Push via WebSocket
            try:
                from apps.notifications.utils import push_notification_to_user
                push_notification_to_user(notify_user.id, {
                    'id': notification.id,
                    'title': notification.title,
                    'message': notification.message,
                    'notification_type': notification.notification_type,
                    'created_at': notification.created_at.isoformat(),
                })
            except Exception:
                pass  # WebSocket push is best-effort
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")

    # Send email for important masterfile events
    if change_type == 'created' and entity_type in ('tenant', 'landlord'):
        try:
            from apps.notifications.utils import send_staff_email
            changed_by = user.get_full_name() or user.email if user else 'System'
            send_staff_email(
                f'New {entity_type.title()} Created: {entity_name}',
                f"""A new {entity_type} has been added to the system.

Details:
- Name: {entity_name}
- Created By: {changed_by}

Please review in the masterfile section.

Best regards,
Parameter System
"""
            )
        except Exception:
            pass

    # Log the change
    try:
        MasterfileChangeLog.objects.create(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            change_type=change_type,
            changes=changes or {},
            changed_by=user,
            changed_by_email=user.email if user else 'system@parameter.co.zw'
        )
    except Exception as e:
        logger.error(f"Failed to log masterfile change: {e}")


# Store old instances for comparison
_old_instances = {}


@receiver(pre_save)
def store_old_instance(sender, instance, **kwargs):
    """Store the old instance before save for comparison."""
    model_name = sender.__name__
    if model_name in ['Landlord', 'Property', 'Unit', 'RentalTenant', 'LeaseAgreement']:
        if instance.pk:
            try:
                _old_instances[f"{model_name}_{instance.pk}"] = sender.objects.get(pk=instance.pk)
            except sender.DoesNotExist:
                pass


@receiver(post_save)
def handle_masterfile_save(sender, instance, created, **kwargs):
    """Handle masterfile entity creation/update."""
    model_name = sender.__name__

    entity_type_map = {
        'Landlord': 'landlord',
        'Property': 'property',
        'Unit': 'unit',
        'RentalTenant': 'tenant',
        'LeaseAgreement': 'lease',
    }

    if model_name not in entity_type_map:
        return

    entity_type = entity_type_map[model_name]
    entity_name = str(instance)
    user = get_request_context()

    if created:
        create_masterfile_notification(
            entity_type=entity_type,
            entity_id=instance.pk,
            entity_name=entity_name,
            change_type='created',
            user=user
        )
    else:
        # Get changes
        old_key = f"{model_name}_{instance.pk}"
        old_instance = _old_instances.pop(old_key, None)
        changes = get_changed_fields(instance, old_instance)

        if changes:  # Only notify if there are actual changes
            create_masterfile_notification(
                entity_type=entity_type,
                entity_id=instance.pk,
                entity_name=entity_name,
                change_type='updated',
                changes=changes,
                user=user
            )


@receiver(post_delete)
def handle_masterfile_delete(sender, instance, **kwargs):
    """Handle masterfile entity deletion."""
    model_name = sender.__name__

    entity_type_map = {
        'Landlord': 'landlord',
        'Property': 'property',
        'Unit': 'unit',
        'RentalTenant': 'tenant',
        'LeaseAgreement': 'lease',
    }

    if model_name not in entity_type_map:
        return

    entity_type = entity_type_map[model_name]
    entity_name = str(instance)
    user = get_request_context()

    create_masterfile_notification(
        entity_type=entity_type,
        entity_id=instance.pk,
        entity_name=entity_name,
        change_type='deleted',
        user=user
    )
