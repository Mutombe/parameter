"""Landlord self-service portal views."""
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, BasePermission
from django.db.models import Sum, Count, Q
from .models import Landlord, Property, Unit, LeaseAgreement, RentalTenant
from .serializers import PropertyListSerializer, LeaseAgreementSerializer


class IsLandlordPortalUser(BasePermission):
    """Only allow users with landlord_portal role who have a linked landlord."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.role != 'landlord_portal':
            return False
        return hasattr(request.user, 'landlord_profile') and request.user.landlord_profile is not None


class LandlordPortalViewSet(viewsets.ViewSet):
    """Read-only views for landlord portal users."""
    permission_classes = [IsAuthenticated, IsLandlordPortalUser]

    def _get_landlord(self, request):
        return request.user.landlord_profile

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Landlord dashboard summary."""
        from apps.billing.models import Invoice, Receipt

        landlord = self._get_landlord(request)
        properties = Property.objects.filter(landlord=landlord, is_active=True)

        total_units = Unit.objects.filter(property__landlord=landlord).count()
        occupied_units = Unit.objects.filter(
            property__landlord=landlord, is_occupied=True
        ).count()
        occupancy_rate = (
            Decimal(occupied_units) / Decimal(total_units) * 100
        ) if total_units > 0 else Decimal('0')

        # Income summary
        receipts = Receipt.objects.filter(
            invoice__unit__property__landlord=landlord
        )
        total_income = receipts.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Outstanding
        invoices = Invoice.objects.filter(
            unit__property__landlord=landlord,
            status__in=['sent', 'partial', 'overdue'],
        )
        total_outstanding = invoices.aggregate(
            total=Sum('balance')
        )['total'] or Decimal('0')

        active_leases = LeaseAgreement.objects.filter(
            unit__property__landlord=landlord,
            status='active',
        ).count()

        return Response({
            'landlord': {
                'id': landlord.id,
                'name': landlord.name,
                'code': landlord.code,
            },
            'summary': {
                'total_properties': properties.count(),
                'total_units': total_units,
                'occupied_units': occupied_units,
                'occupancy_rate': str(occupancy_rate),
                'active_leases': active_leases,
                'total_income': str(total_income),
                'total_outstanding': str(total_outstanding),
            },
        })

    @action(detail=False, methods=['get'])
    def properties(self, request):
        """List landlord's properties with occupancy info."""
        landlord = self._get_landlord(request)
        properties = Property.objects.filter(
            landlord=landlord, is_active=True
        ).annotate(
            _unit_count=Count('units'),
            _vacant_units=Count('units', filter=Q(units__is_occupied=False)),
        )

        data = []
        for prop in properties:
            data.append({
                'id': prop.id,
                'code': prop.code,
                'name': prop.name,
                'property_type': prop.property_type,
                'address': prop.address,
                'city': prop.city,
                'total_units': prop._unit_count,
                'vacant_units': prop._vacant_units,
                'occupancy_rate': str(prop.occupancy_rate),
            })

        return Response(data)

    @action(detail=False, methods=['get'])
    def statements(self, request):
        """Monthly income statements for landlord."""
        from apps.billing.models import Receipt
        from django.db.models.functions import TruncMonth

        landlord = self._get_landlord(request)

        monthly_income = list(
            Receipt.objects.filter(
                invoice__unit__property__landlord=landlord
            ).annotate(
                month=TruncMonth('date')
            ).values('month').annotate(
                total=Sum('amount'),
                count=Count('id'),
            ).order_by('-month')[:12]
        )

        return Response({
            'landlord': landlord.name,
            'statements': [
                {
                    'month': item['month'].isoformat() if item['month'] else None,
                    'total_income': str(item['total']),
                    'receipt_count': item['count'],
                }
                for item in monthly_income
            ],
        })

    @action(detail=False, methods=['get'])
    def tenants(self, request):
        """List tenants in landlord's properties."""
        landlord = self._get_landlord(request)

        leases = LeaseAgreement.objects.filter(
            unit__property__landlord=landlord,
            status='active',
        ).select_related('tenant', 'unit', 'unit__property')

        data = []
        for lease in leases:
            data.append({
                'tenant_name': lease.tenant.name,
                'tenant_code': lease.tenant.code,
                'property': lease.unit.property.name,
                'unit': lease.unit.unit_number,
                'monthly_rent': str(lease.monthly_rent),
                'currency': lease.currency,
                'lease_start': lease.start_date.isoformat(),
                'lease_end': lease.end_date.isoformat(),
            })

        return Response(data)
