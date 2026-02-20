"""
Trash API — list, restore, and permanently delete soft-deleted items.
"""
from django.apps import apps
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

TRASHABLE_MODELS = {
    'landlord':  ('masterfile', 'Landlord'),
    'property':  ('masterfile', 'Property'),
    'unit':      ('masterfile', 'Unit'),
    'tenant':    ('masterfile', 'RentalTenant'),
    'lease':     ('masterfile', 'LeaseAgreement'),
    'invoice':   ('billing', 'Invoice'),
    'receipt':   ('billing', 'Receipt'),
    'expense':   ('billing', 'Expense'),
}

TRASH_PURGE_DAYS = 30


def _get_model(type_key):
    """Resolve a trashable model by its key."""
    entry = TRASHABLE_MODELS.get(type_key)
    if not entry:
        return None
    return apps.get_model(entry[0], entry[1])


def _serialize_item(obj, type_key):
    """Serialize a trashed item for the API response."""
    age = (timezone.now() - obj.deleted_at).days
    days_remaining = max(TRASH_PURGE_DAYS - age, 0)
    deleted_by_name = ''
    if obj.deleted_by:
        deleted_by_name = obj.deleted_by.get_full_name() or obj.deleted_by.email
    return {
        'id': obj.id,
        'type': type_key,
        'display_name': str(obj),
        'deleted_at': obj.deleted_at.isoformat(),
        'deleted_by': deleted_by_name,
        'days_remaining': days_remaining,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def trash_list(request):
    """List all trashed items, optionally filtered by ?type=landlord."""
    type_filter = request.query_params.get('type')
    items = []

    models_to_query = TRASHABLE_MODELS.items()
    if type_filter and type_filter in TRASHABLE_MODELS:
        models_to_query = [(type_filter, TRASHABLE_MODELS[type_filter])]

    for type_key, (app_label, model_name) in models_to_query:
        Model = apps.get_model(app_label, model_name)
        qs = Model.deleted_objects.select_related('deleted_by').order_by('-deleted_at')
        for obj in qs:
            items.append(_serialize_item(obj, type_key))

    # Sort all items by deleted_at descending
    items.sort(key=lambda x: x['deleted_at'], reverse=True)
    return Response(items)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trash_restore(request):
    """Restore items from trash. Body: { type: str, ids: [int] }"""
    type_key = request.data.get('type')
    ids = request.data.get('ids', [])

    if not type_key or not ids:
        return Response(
            {'error': 'type and ids are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    Model = _get_model(type_key)
    if not Model:
        return Response(
            {'error': f'Unknown type: {type_key}'},
            status=status.HTTP_400_BAD_REQUEST
        )

    restored = 0
    for obj in Model.deleted_objects.filter(id__in=ids):
        obj.restore()
        restored += 1

    return Response({'restored': restored})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def trash_purge(request):
    """Permanently delete specific items. Body: { type: str, ids: [int] }"""
    type_key = request.data.get('type')
    ids = request.data.get('ids', [])

    if not type_key or not ids:
        return Response(
            {'error': 'type and ids are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    Model = _get_model(type_key)
    if not Model:
        return Response(
            {'error': f'Unknown type: {type_key}'},
            status=status.HTTP_400_BAD_REQUEST
        )

    deleted, _ = Model.deleted_objects.filter(id__in=ids).delete()
    return Response({'deleted': deleted})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def trash_purge_all(request):
    """Permanently delete ALL trashed items."""
    total_deleted = 0
    for app_label, model_name in TRASHABLE_MODELS.values():
        Model = apps.get_model(app_label, model_name)
        count, _ = Model.deleted_objects.all().delete()
        total_deleted += count

    return Response({'deleted': total_deleted})
