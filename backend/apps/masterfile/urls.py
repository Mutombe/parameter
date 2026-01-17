"""URL routes for masterfile module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LandlordViewSet, PropertyViewSet, UnitViewSet,
    RentalTenantViewSet, LeaseAgreementViewSet
)

router = DefaultRouter()
router.register('landlords', LandlordViewSet, basename='landlord')
router.register('properties', PropertyViewSet, basename='property')
router.register('units', UnitViewSet, basename='unit')
router.register('tenants', RentalTenantViewSet, basename='rental-tenant')
router.register('leases', LeaseAgreementViewSet, basename='lease')

urlpatterns = [
    path('', include(router.urls)),
]
