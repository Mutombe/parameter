"""URL routes for maintenance module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MaintenanceRequestViewSet, WorkOrderViewSet

router = DefaultRouter()
router.register('requests', MaintenanceRequestViewSet, basename='maintenance-request')
router.register('work-orders', WorkOrderViewSet, basename='work-order')

urlpatterns = [
    path('', include(router.urls)),
]
