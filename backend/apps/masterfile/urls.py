"""URL routes for masterfile module."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LandlordViewSet, PropertyViewSet, UnitViewSet,
    RentalTenantViewSet, LeaseAgreementViewSet, PropertyManagerViewSet
)
from .landlord_views import LandlordPortalViewSet

router = DefaultRouter()
router.register('landlords', LandlordViewSet, basename='landlord')
router.register('properties', PropertyViewSet, basename='property')
router.register('units', UnitViewSet, basename='unit')
router.register('tenants', RentalTenantViewSet, basename='rental-tenant')
router.register('leases', LeaseAgreementViewSet, basename='lease')
router.register('property-managers', PropertyManagerViewSet, basename='property-manager')

landlord_portal_router = DefaultRouter()
landlord_portal_router.register('', LandlordPortalViewSet, basename='landlord-portal')

urlpatterns = [
    path('', include(router.urls)),
    path('landlord-portal/', include(landlord_portal_router.urls)),
]
