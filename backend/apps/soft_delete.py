"""
Soft-delete infrastructure shared across masterfile and billing apps.

Provides SoftDeleteModel (abstract base class), custom managers,
and SoftDeleteMixin (ViewSet mixin replacing hard delete with soft delete).
"""
from django.db import models
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response


class SoftDeleteManager(models.Manager):
    """Default manager - excludes soft-deleted items."""
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager):
    """Includes all objects (for code generation, admin, migrations)."""
    pass


class DeletedManager(models.Manager):
    """Returns only soft-deleted objects."""
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=False)


class SoftDeleteModel(models.Model):
    """Abstract base class adding soft-delete fields and managers."""
    deleted_at = models.DateTimeField(null=True, blank=True, default=None, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()
    deleted_objects = DeletedManager()

    class Meta:
        abstract = True
        default_manager_name = 'objects'
        base_manager_name = 'all_objects'

    def soft_delete(self, user=None):
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=['deleted_at', 'deleted_by'])

    def restore(self):
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=['deleted_at', 'deleted_by'])


class SoftDeleteMixin:
    """ViewSet mixin - replaces hard delete with soft delete."""
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.soft_delete(user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
