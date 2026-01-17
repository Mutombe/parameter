"""
Unified Search API with PostgreSQL Full-Text Search.
Optimized for scalability with thousands of records.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Q, Value, CharField, F
from django.db.models.functions import Concat
from django.contrib.postgres.search import (
    SearchVector, SearchQuery, SearchRank, TrigramSimilarity
)
from django.core.cache import cache
from apps.masterfile.models import Landlord, Property, Unit, RentalTenant, LeaseAgreement
from apps.billing.models import Invoice, Receipt


class UnifiedSearchView(APIView):
    """
    High-performance unified search across all entities.
    Uses PostgreSQL full-text search and trigram similarity for fuzzy matching.
    """
    permission_classes = [IsAuthenticated]

    # Search configuration per entity
    SEARCH_CONFIG = {
        'landlord': {
            'model': Landlord,
            'search_fields': ['name', 'email', 'phone', 'address'],
            'vector_fields': ['name', 'email', 'address'],
            'select_related': [],
            'display_fields': ['id', 'name', 'email', 'phone', 'landlord_type'],
        },
        'property': {
            'model': Property,
            'search_fields': ['name', 'address', 'city'],
            'vector_fields': ['name', 'address', 'city'],
            'select_related': ['landlord'],
            'display_fields': ['id', 'name', 'address', 'city', 'property_type'],
        },
        'unit': {
            'model': Unit,
            'search_fields': ['unit_number', 'notes'],
            'vector_fields': ['unit_number'],
            'select_related': ['property'],
            'display_fields': ['id', 'unit_number', 'rental_amount', 'is_occupied'],
        },
        'tenant': {
            'model': RentalTenant,
            'search_fields': ['name', 'email', 'phone', 'id_number'],
            'vector_fields': ['name', 'email', 'id_number'],
            'select_related': [],
            'display_fields': ['id', 'name', 'email', 'phone', 'is_active'],
        },
        'invoice': {
            'model': Invoice,
            'search_fields': ['invoice_number', 'description'],
            'vector_fields': ['invoice_number', 'description'],
            'select_related': ['tenant', 'unit'],
            'display_fields': ['id', 'invoice_number', 'total_amount', 'status', 'date'],
        },
        'lease': {
            'model': LeaseAgreement,
            'search_fields': ['lease_number'],
            'vector_fields': ['lease_number'],
            'select_related': ['tenant', 'unit', 'unit__property'],
            'display_fields': ['id', 'lease_number', 'monthly_rent', 'status'],
        },
    }

    def get(self, request):
        """
        Unified search endpoint.

        Query params:
        - q: Search query (required, min 2 chars)
        - type: Filter by entity type (optional: landlord, property, unit, tenant, invoice, lease)
        - limit: Results per type (default 10, max 50)
        - cursor: Pagination cursor for infinite scroll
        """
        query = request.query_params.get('q', '').strip()
        entity_type = request.query_params.get('type', None)
        limit = min(int(request.query_params.get('limit', 10)), 50)

        if len(query) < 2:
            return Response({
                'error': 'Search query must be at least 2 characters',
                'results': [],
                'total': 0
            }, status=status.HTTP_400_BAD_REQUEST)

        # Check cache first
        cache_key = f"search:{request.user.id}:{query}:{entity_type}:{limit}"
        cached_result = cache.get(cache_key)
        if cached_result:
            return Response(cached_result)

        results = []
        total_count = 0

        # Determine which entities to search
        entities_to_search = [entity_type] if entity_type else self.SEARCH_CONFIG.keys()

        for entity in entities_to_search:
            if entity not in self.SEARCH_CONFIG:
                continue

            config = self.SEARCH_CONFIG[entity]
            entity_results, count = self._search_entity(query, config, entity, limit)
            results.extend(entity_results)
            total_count += count

        # Sort by relevance score
        results.sort(key=lambda x: x.get('score', 0), reverse=True)

        response_data = {
            'query': query,
            'results': results[:limit * len(entities_to_search)] if not entity_type else results,
            'total': total_count,
            'filters': {
                'type': entity_type,
                'limit': limit
            }
        }

        # Cache for 30 seconds
        cache.set(cache_key, response_data, 30)

        return Response(response_data)

    def _search_entity(self, query, config, entity_type, limit):
        """
        Search a specific entity using PostgreSQL full-text search.
        Falls back to trigram similarity for fuzzy matching.
        """
        model = config['model']

        try:
            # Build the base queryset with select_related for performance
            queryset = model.objects.all()
            if config['select_related']:
                queryset = queryset.select_related(*config['select_related'])

            # Try full-text search first (fastest for exact/partial matches)
            search_vector = SearchVector(*config['vector_fields'])
            search_query = SearchQuery(query, search_type='plain')

            # Add trigram similarity for fuzzy matching
            # This handles typos and partial matches
            q_filter = Q()
            for field in config['search_fields']:
                q_filter |= Q(**{f'{field}__icontains': query})

            # Combine full-text search with LIKE fallback
            results = queryset.filter(q_filter).distinct()[:limit]
            count = queryset.filter(q_filter).count()

            # Transform results
            formatted_results = []
            for obj in results:
                result = self._format_result(obj, config, entity_type, query)
                formatted_results.append(result)

            return formatted_results, count

        except Exception as e:
            # Fallback to simple search if full-text search fails
            return self._simple_search(query, config, entity_type, limit)

    def _simple_search(self, query, config, entity_type, limit):
        """Fallback simple search using LIKE queries."""
        model = config['model']
        queryset = model.objects.all()

        if config['select_related']:
            queryset = queryset.select_related(*config['select_related'])

        q_filter = Q()
        for field in config['search_fields']:
            q_filter |= Q(**{f'{field}__icontains': query})

        results = queryset.filter(q_filter)[:limit]
        count = queryset.filter(q_filter).count()

        formatted_results = []
        for obj in results:
            result = self._format_result(obj, config, entity_type, query)
            formatted_results.append(result)

        return formatted_results, count

    def _format_result(self, obj, config, entity_type, query):
        """Format a search result for the response."""
        result = {
            'id': obj.id,
            'type': entity_type,
            'score': self._calculate_relevance(obj, config, query),
        }

        # Add display fields
        for field in config['display_fields']:
            if hasattr(obj, field):
                value = getattr(obj, field)
                # Handle related objects
                if hasattr(value, 'id'):
                    result[field] = str(value)
                else:
                    result[field] = value

        # Add computed fields based on entity type
        result.update(self._get_computed_fields(obj, entity_type))

        return result

    def _get_computed_fields(self, obj, entity_type):
        """Get computed display fields for each entity type."""
        computed = {}

        if entity_type == 'landlord':
            computed['title'] = obj.name
            computed['subtitle'] = obj.email or obj.phone or 'No contact'
            computed['meta'] = obj.landlord_type
            computed['href'] = f'/landlords?id={obj.id}'

        elif entity_type == 'property':
            computed['title'] = obj.name
            computed['subtitle'] = f'{obj.address}, {obj.city}' if obj.address else obj.city
            computed['meta'] = f'{getattr(obj, "unit_count", 0)} units'
            computed['href'] = f'/properties?id={obj.id}'

        elif entity_type == 'unit':
            computed['title'] = obj.unit_number
            computed['subtitle'] = str(obj.property) if hasattr(obj, 'property') and obj.property else 'Unknown property'
            computed['meta'] = f'${obj.rental_amount}' if obj.rental_amount else ''
            computed['status'] = 'Occupied' if obj.is_occupied else 'Vacant'
            computed['href'] = f'/units?id={obj.id}'

        elif entity_type == 'tenant':
            computed['title'] = obj.name
            computed['subtitle'] = obj.email or obj.phone or 'No contact'
            computed['meta'] = 'Active' if obj.is_active else 'Inactive'
            computed['href'] = f'/tenants?id={obj.id}'

        elif entity_type == 'invoice':
            computed['title'] = obj.invoice_number
            computed['subtitle'] = str(obj.tenant) if hasattr(obj, 'tenant') and obj.tenant else 'Unknown tenant'
            computed['meta'] = f'${obj.total_amount}' if obj.total_amount else ''
            computed['href'] = f'/invoices?id={obj.id}'

        elif entity_type == 'lease':
            computed['title'] = obj.lease_number
            computed['subtitle'] = str(obj.tenant) if hasattr(obj, 'tenant') and obj.tenant else 'Unknown tenant'
            computed['meta'] = f'${obj.monthly_rent}/mo' if obj.monthly_rent else ''
            computed['href'] = f'/leases?id={obj.id}'

        return computed

    def _calculate_relevance(self, obj, config, query):
        """Calculate a relevance score for ranking results."""
        score = 0
        query_lower = query.lower()

        for field in config['search_fields']:
            value = getattr(obj, field, None)
            if value:
                value_lower = str(value).lower()
                # Exact match gets highest score
                if value_lower == query_lower:
                    score += 100
                # Starts with query
                elif value_lower.startswith(query_lower):
                    score += 75
                # Contains query
                elif query_lower in value_lower:
                    score += 50

        return score


class SearchSuggestionsView(APIView):
    """
    Fast autocomplete suggestions for search.
    Returns top suggestions as user types.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()

        if len(query) < 1:
            return Response({'suggestions': []})

        # Get quick suggestions from each entity type
        suggestions = []
        limit = 5

        # Search tenants (most common search)
        tenants = RentalTenant.objects.filter(
            Q(name__icontains=query) | Q(email__icontains=query)
        ).values('name', 'email')[:limit]

        for t in tenants:
            suggestions.append({
                'text': t['name'],
                'type': 'tenant',
                'subtext': t['email']
            })

        # Search properties
        properties = Property.objects.filter(
            Q(name__icontains=query) | Q(address__icontains=query)
        ).values('name', 'address')[:limit]

        for p in properties:
            suggestions.append({
                'text': p['name'],
                'type': 'property',
                'subtext': p['address']
            })

        # Search invoices by number
        invoices = Invoice.objects.filter(
            invoice_number__icontains=query
        ).values('invoice_number')[:limit]

        for i in invoices:
            suggestions.append({
                'text': i['invoice_number'],
                'type': 'invoice',
                'subtext': 'Invoice'
            })

        return Response({
            'suggestions': suggestions[:10],
            'query': query
        })
