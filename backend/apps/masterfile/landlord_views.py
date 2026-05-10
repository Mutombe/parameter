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
        """Landlord dashboard summary — includes commission deductions
        per income type so the landlord sees exactly how much the
        agency took, broken down by sub-account.
        """
        from apps.billing.models import Invoice, Receipt
        from apps.reports.views import _commission_expr

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

        # Commission deductions — aggregate via the unified resolver so
        # rates respect per-(property, income_type) overrides.
        comm_expr = _commission_expr()
        total_commission = receipts.aggregate(t=Sum(comm_expr))['t'] or Decimal('0')
        commission_by_type = list(
            receipts.values(
                'income_type__id', 'income_type__name',
            ).annotate(commission=Sum(comm_expr))
            .order_by('income_type__name')
        )
        commission_breakdown = [
            {
                'income_type_id': r['income_type__id'],
                'income_type_name': r['income_type__name'] or 'Other',
                'amount': str(r['commission'] or Decimal('0')),
            }
            for r in commission_by_type
            if (r['commission'] or Decimal('0')) != 0
        ]

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

        # Net payable to landlord (gross income − commission − operating
        # expenses paid from trust). Captures what the agency actually
        # owes the landlord.
        from apps.billing.models import Expense
        operating_expenses = Expense.objects.filter(
            landlord=landlord, status='paid',
        ).exclude(expense_kind='non_cash').exclude(
            expense_type='landlord_payment',
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        net_payable = total_income - total_commission - operating_expenses

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
                'total_commission': str(total_commission),
                'operating_expenses': str(operating_expenses),
                'net_payable': str(net_payable),
            },
            'commission_breakdown': commission_breakdown,
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
        """Monthly income statements for landlord. Each row carries the
        commission deducted by the agency for that month so the landlord
        can see the gross-to-net flow at a glance.
        """
        from apps.billing.models import Receipt
        from apps.reports.views import _commission_expr
        from django.db.models.functions import TruncMonth

        landlord = self._get_landlord(request)
        comm_expr = _commission_expr()

        monthly = list(
            Receipt.objects.filter(
                invoice__unit__property__landlord=landlord
            ).annotate(
                month=TruncMonth('date')
            ).values('month').annotate(
                total=Sum('amount'),
                commission=Sum(comm_expr),
                count=Count('id'),
            ).order_by('-month')[:12]
        )

        return Response({
            'landlord': landlord.name,
            'statements': [
                {
                    'month': item['month'].isoformat() if item['month'] else None,
                    'total_income': str(item['total'] or Decimal('0')),
                    'commission': str(item['commission'] or Decimal('0')),
                    'net_income': str(
                        (item['total'] or Decimal('0'))
                        - (item['commission'] or Decimal('0'))
                    ),
                    'receipt_count': item['count'],
                }
                for item in monthly
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
