"""
AI Service with Claude Integration.
Implements RAG (Retrieval-Augmented Generation) pattern for tenant-isolated queries.
"""
import json
import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from django.conf import settings
from django.db.models import Sum, Count, Q, Avg
from django_tenants.utils import get_tenant_model

logger = logging.getLogger(__name__)


class AIService:
    """
    Pluggable AI service for the Real Estate Accounting System.
    Features:
    - Natural language querying
    - Semantic bank reconciliation
    - Report generation assistance
    - Tenant-isolated RAG context
    """

    def __init__(self, tenant=None):
        self.tenant = tenant
        self.client = None
        self._init_client()

    def _init_client(self):
        """Initialize the Anthropic client."""
        try:
            import anthropic
            api_key = settings.ANTHROPIC_API_KEY
            if api_key:
                self.client = anthropic.Anthropic(api_key=api_key)
        except ImportError:
            logger.warning("Anthropic library not installed")
        except Exception as e:
            logger.error(f"Failed to initialize AI client: {e}")

    def check_ai_enabled(self, module: str) -> bool:
        """
        Check if AI is enabled for a specific module.
        Controlled by Super Admin per tenant.
        """
        if not self.tenant:
            return False

        feature_map = {
            'accounting': 'ai_accounting_enabled',
            'reconciliation': 'ai_reconciliation_enabled',
            'reports': 'ai_reports_enabled',
            'ocr': 'ai_ocr_enabled',
        }

        attr = feature_map.get(module)
        if not attr:
            return False

        return getattr(self.tenant, attr, False)

    def _get_tenant_context(self) -> Dict[str, Any]:
        """
        Build tenant-specific context for RAG.
        This ensures AI only has access to current tenant's data.
        """
        from apps.masterfile.models import Landlord, Property, Unit, RentalTenant, LeaseAgreement
        from apps.billing.models import Invoice, Receipt
        from apps.accounting.models import ChartOfAccount, GeneralLedger

        context = {
            'tenant_name': self.tenant.name if self.tenant else 'Unknown',
            'statistics': {}
        }

        try:
            # Property statistics
            total_properties = Property.objects.count()
            total_units = Unit.objects.count()
            vacant_units = Unit.objects.filter(is_occupied=False).count()
            occupied_units = total_units - vacant_units

            context['statistics']['properties'] = {
                'total_properties': total_properties,
                'total_units': total_units,
                'vacant_units': vacant_units,
                'occupied_units': occupied_units,
                'vacancy_rate': round((vacant_units / total_units * 100), 2) if total_units else 0,
                'occupancy_rate': round((occupied_units / total_units * 100), 2) if total_units else 0
            }

            # Financial statistics
            total_invoiced = Invoice.objects.aggregate(Sum('total_amount'))['total_amount__sum'] or 0
            total_received = Receipt.objects.aggregate(Sum('amount'))['amount__sum'] or 0
            outstanding = total_invoiced - total_received

            context['statistics']['financial'] = {
                'total_invoiced': float(total_invoiced),
                'total_received': float(total_received),
                'outstanding_balance': float(outstanding),
                'collection_rate': round((float(total_received) / float(total_invoiced) * 100), 2) if total_invoiced else 0
            }

            # Get top landlords by property count
            top_landlords = Landlord.objects.annotate(
                property_count=Count('properties')
            ).order_by('-property_count')[:5]

            context['top_landlords'] = [
                {'name': l.name, 'properties': l.property_count}
                for l in top_landlords
            ]

            # Recent transactions
            recent_invoices = Invoice.objects.order_by('-date')[:5]
            context['recent_invoices'] = [
                {
                    'number': inv.invoice_number,
                    'tenant': inv.tenant.name,
                    'amount': float(inv.total_amount),
                    'status': inv.status
                }
                for inv in recent_invoices
            ]

            # Account balances summary
            account_summary = ChartOfAccount.objects.filter(
                is_active=True
            ).values('account_type').annotate(
                total_balance=Sum('current_balance')
            )

            context['statistics']['account_balances'] = {
                item['account_type']: float(item['total_balance'] or 0)
                for item in account_summary
            }

        except Exception as e:
            logger.error(f"Error building tenant context: {e}")

        return context

    def natural_language_query(self, question: str) -> Dict[str, Any]:
        """
        Answer natural language questions about the accounting data.
        Uses RAG pattern with tenant-isolated context.
        """
        if not self.client:
            return self._mock_response(question)

        if not self.check_ai_enabled('reports'):
            return {
                'success': False,
                'error': 'AI reports feature is disabled for this tenant'
            }

        # Build context
        context = self._get_tenant_context()

        # Create prompt
        system_prompt = """You are an AI assistant for a Real Estate Accounting System.
You have access to the following tenant-specific data context.
Only answer questions based on this data - never make up information.
Be concise and provide specific numbers when available.
Format currency values with proper formatting (e.g., $1,234.56).

TENANT CONTEXT:
""" + json.dumps(context, indent=2)

        try:
            message = self.client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=settings.AI_MAX_TOKENS,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": question}
                ]
            )

            return {
                'success': True,
                'answer': message.content[0].text,
                'context_used': list(context['statistics'].keys()),
                'model': settings.AI_MODEL
            }

        except Exception as e:
            logger.error(f"AI query failed: {e}")
            # Fall back to mock response on any error
            return self._mock_response(question)

    def semantic_bank_reconciliation(
        self,
        statement_ref: str,
        amount: Decimal,
        date: str = None
    ) -> Dict[str, Any]:
        """
        Match messy bank/EcoCash references to tenant records.
        Uses AI to understand variations in reference formats.
        """
        from apps.billing.models import Invoice
        from apps.masterfile.models import RentalTenant

        if not self.check_ai_enabled('reconciliation'):
            return {
                'success': False,
                'error': 'AI reconciliation feature is disabled'
            }

        # Get potential matches from database
        potential_invoices = Invoice.objects.filter(
            status__in=['sent', 'partial', 'overdue'],
            total_amount__gte=amount * Decimal('0.9'),
            total_amount__lte=amount * Decimal('1.1')
        ).select_related('tenant')[:20]

        potential_tenants = RentalTenant.objects.filter(is_active=True)[:50]

        # Build context for AI
        context = {
            'statement_reference': statement_ref,
            'amount': float(amount),
            'potential_matches': {
                'invoices': [
                    {
                        'id': inv.id,
                        'number': inv.invoice_number,
                        'tenant_name': inv.tenant.name,
                        'tenant_code': inv.tenant.code,
                        'amount': float(inv.total_amount),
                        'balance': float(inv.balance)
                    }
                    for inv in potential_invoices
                ],
                'tenants': [
                    {
                        'id': t.id,
                        'code': t.code,
                        'name': t.name,
                        'phone': t.phone
                    }
                    for t in potential_tenants
                ]
            }
        }

        if not self.client:
            return self._mock_reconciliation(context)

        system_prompt = """You are a bank reconciliation assistant.
Given a bank statement reference (which may be messy, abbreviated, or have typos),
match it to the most likely invoice or tenant.

Analyze the reference for:
- Tenant names or partial names
- Invoice numbers or partial numbers
- Phone numbers
- Account codes

Return a JSON response with:
{
    "match_type": "invoice" or "tenant" or "none",
    "match_id": the ID of the matched record,
    "confidence": 0-100,
    "reasoning": "explanation of the match"
}"""

        try:
            message = self.client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": json.dumps(context)}
                ]
            )

            response_text = message.content[0].text

            # Try to parse JSON from response
            try:
                result = json.loads(response_text)
            except json.JSONDecodeError:
                # Extract JSON if wrapped in other text
                import re
                json_match = re.search(r'\{[^{}]*\}', response_text)
                if json_match:
                    result = json.loads(json_match.group())
                else:
                    result = {
                        'match_type': 'none',
                        'confidence': 0,
                        'reasoning': response_text
                    }

            return {
                'success': True,
                **result
            }

        except Exception as e:
            logger.error(f"Reconciliation failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def _mock_response(self, question: str) -> Dict[str, Any]:
        """Generate mock response when AI is not configured."""
        context = self._get_tenant_context()
        stats = context.get('statistics', {})

        # Simple keyword-based responses for demo
        question_lower = question.lower()

        if 'vacancy' in question_lower or 'vacant' in question_lower:
            props = stats.get('properties', {})
            return {
                'success': True,
                'answer': f"The current vacancy rate is {props.get('vacancy_rate', 0)}%. "
                         f"There are {props.get('vacant_units', 0)} vacant units out of "
                         f"{props.get('total_units', 0)} total units.",
                'context_used': ['properties'],
                'model': 'mock'
            }

        if 'outstanding' in question_lower or 'owed' in question_lower or 'balance' in question_lower:
            fin = stats.get('financial', {})
            return {
                'success': True,
                'answer': f"The total outstanding balance is ${fin.get('outstanding_balance', 0):,.2f}. "
                         f"Total invoiced: ${fin.get('total_invoiced', 0):,.2f}, "
                         f"Total received: ${fin.get('total_received', 0):,.2f}.",
                'context_used': ['financial'],
                'model': 'mock'
            }

        if 'collection' in question_lower or 'collected' in question_lower:
            fin = stats.get('financial', {})
            return {
                'success': True,
                'answer': f"The collection rate is {fin.get('collection_rate', 0)}%. "
                         f"We have collected ${fin.get('total_received', 0):,.2f} "
                         f"out of ${fin.get('total_invoiced', 0):,.2f} invoiced.",
                'context_used': ['financial'],
                'model': 'mock'
            }

        if 'occupancy' in question_lower or 'occupied' in question_lower:
            props = stats.get('properties', {})
            return {
                'success': True,
                'answer': f"The occupancy rate is {props.get('occupancy_rate', 0)}%. "
                         f"{props.get('occupied_units', 0)} units are currently occupied.",
                'context_used': ['properties'],
                'model': 'mock'
            }

        # Default response
        return {
            'success': True,
            'answer': f"Based on the current data: We manage {stats.get('properties', {}).get('total_properties', 0)} properties "
                     f"with {stats.get('properties', {}).get('total_units', 0)} total units. "
                     f"The vacancy rate is {stats.get('properties', {}).get('vacancy_rate', 0)}% "
                     f"and we have ${stats.get('financial', {}).get('outstanding_balance', 0):,.2f} in outstanding balances.",
            'context_used': ['properties', 'financial'],
            'model': 'mock'
        }

    def _mock_reconciliation(self, context: Dict) -> Dict[str, Any]:
        """Generate mock reconciliation result."""
        invoices = context.get('potential_matches', {}).get('invoices', [])

        if invoices:
            # Return first match as demo
            match = invoices[0]
            return {
                'success': True,
                'match_type': 'invoice',
                'match_id': match['id'],
                'confidence': 75,
                'reasoning': f"Amount {context['amount']} matches invoice {match['number']} "
                           f"for tenant {match['tenant_name']}"
            }

        return {
            'success': True,
            'match_type': 'none',
            'confidence': 0,
            'reasoning': 'No matching records found'
        }
