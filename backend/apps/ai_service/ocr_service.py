"""
OCR Service for Document Extraction using Claude Vision.
Extracts data from lease agreements, invoices, and other documents.
"""
import base64
import json
import logging
import re
from decimal import Decimal
from typing import Dict, Any, Optional
from django.conf import settings

logger = logging.getLogger(__name__)


class OCRService:
    """
    OCR service using Claude Vision API for document extraction.
    Supports lease agreements, invoices, and ID documents.
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

    def check_ocr_enabled(self) -> bool:
        """Check if OCR is enabled for the tenant."""
        if not self.tenant:
            return False
        return getattr(self.tenant, 'ai_ocr_enabled', False)

    def _encode_image(self, file_path: str) -> tuple:
        """Encode image to base64 and determine media type."""
        import mimetypes

        mime_type, _ = mimetypes.guess_type(file_path)
        media_type = mime_type or 'image/jpeg'

        with open(file_path, 'rb') as f:
            image_data = base64.standard_b64encode(f.read()).decode('utf-8')

        return image_data, media_type

    def _encode_image_from_bytes(self, file_bytes: bytes, filename: str) -> tuple:
        """Encode image bytes to base64."""
        import mimetypes

        mime_type, _ = mimetypes.guess_type(filename)
        media_type = mime_type or 'image/jpeg'
        image_data = base64.standard_b64encode(file_bytes).decode('utf-8')

        return image_data, media_type

    def extract_lease_data(self, image_path: str = None, image_bytes: bytes = None, filename: str = None) -> Dict[str, Any]:
        """
        Extract lease agreement data from an image/PDF.

        Returns:
            Dict with extracted fields:
            - tenant_name, tenant_email, tenant_phone, tenant_id_number
            - property_address, unit_number
            - start_date, end_date
            - monthly_rent, deposit_amount, currency
            - billing_day
            - special_conditions
        """
        if not self.client:
            return self._mock_lease_extraction()

        if not self.check_ocr_enabled():
            return {
                'success': False,
                'error': 'OCR feature is disabled for this tenant'
            }

        try:
            if image_path:
                image_data, media_type = self._encode_image(image_path)
            elif image_bytes and filename:
                image_data, media_type = self._encode_image_from_bytes(image_bytes, filename)
            else:
                return {'success': False, 'error': 'No image provided'}

            system_prompt = """You are an expert document parser for real estate lease agreements.
Extract the following information from the lease document image and return ONLY a valid JSON object:

{
    "tenant_name": "Full name of the tenant",
    "tenant_email": "Email address if visible",
    "tenant_phone": "Phone number if visible",
    "tenant_id_number": "ID/Passport number if visible",
    "tenant_type": "individual or company",
    "property_address": "Full property address",
    "unit_number": "Unit/apartment number",
    "start_date": "YYYY-MM-DD format",
    "end_date": "YYYY-MM-DD format",
    "monthly_rent": "Numeric value only",
    "deposit_amount": "Numeric value only",
    "currency": "USD or ZiG",
    "billing_day": "Day of month for billing (1-28)",
    "special_conditions": "Any special terms noted",
    "confidence": "high, medium, or low"
}

If a field is not visible or unclear, use null. Return ONLY the JSON object, no other text."""

            message = self.client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=2048,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data
                                }
                            },
                            {
                                "type": "text",
                                "text": "Extract the lease agreement information from this document."
                            }
                        ]
                    }
                ]
            )

            response_text = message.content[0].text

            # Parse JSON response
            try:
                data = json.loads(response_text)
            except json.JSONDecodeError:
                # Try to extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    return {
                        'success': False,
                        'error': 'Failed to parse response',
                        'raw_response': response_text
                    }

            return {
                'success': True,
                'data': data,
                'model': settings.AI_MODEL
            }

        except Exception as e:
            logger.error(f"Lease extraction failed: {e}")
            return {'success': False, 'error': str(e)}

    def extract_invoice_data(self, image_path: str = None, image_bytes: bytes = None, filename: str = None) -> Dict[str, Any]:
        """
        Extract invoice data from an image/PDF.

        Returns:
            Dict with extracted fields:
            - invoice_number, date, due_date
            - vendor_name, vendor_address
            - line_items (list of {description, quantity, unit_price, total})
            - subtotal, vat_amount, total_amount
            - currency
        """
        if not self.client:
            return self._mock_invoice_extraction()

        if not self.check_ocr_enabled():
            return {
                'success': False,
                'error': 'OCR feature is disabled for this tenant'
            }

        try:
            if image_path:
                image_data, media_type = self._encode_image(image_path)
            elif image_bytes and filename:
                image_data, media_type = self._encode_image_from_bytes(image_bytes, filename)
            else:
                return {'success': False, 'error': 'No image provided'}

            system_prompt = """You are an expert document parser for invoices and receipts.
Extract the following information from the invoice image and return ONLY a valid JSON object:

{
    "invoice_number": "Invoice reference number",
    "date": "YYYY-MM-DD format",
    "due_date": "YYYY-MM-DD format if visible",
    "vendor_name": "Name of the vendor/supplier",
    "vendor_address": "Address if visible",
    "line_items": [
        {
            "description": "Item description",
            "quantity": 1,
            "unit_price": 0.00,
            "total": 0.00
        }
    ],
    "subtotal": "Numeric value",
    "vat_rate": "VAT percentage if shown",
    "vat_amount": "Numeric value",
    "total_amount": "Numeric value",
    "currency": "USD or ZiG",
    "payment_terms": "Payment terms if visible",
    "confidence": "high, medium, or low"
}

If a field is not visible or unclear, use null. Return ONLY the JSON object, no other text."""

            message = self.client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=2048,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data
                                }
                            },
                            {
                                "type": "text",
                                "text": "Extract the invoice information from this document."
                            }
                        ]
                    }
                ]
            )

            response_text = message.content[0].text

            try:
                data = json.loads(response_text)
            except json.JSONDecodeError:
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    return {
                        'success': False,
                        'error': 'Failed to parse response',
                        'raw_response': response_text
                    }

            return {
                'success': True,
                'data': data,
                'model': settings.AI_MODEL
            }

        except Exception as e:
            logger.error(f"Invoice extraction failed: {e}")
            return {'success': False, 'error': str(e)}

    def extract_id_document(self, image_path: str = None, image_bytes: bytes = None, filename: str = None) -> Dict[str, Any]:
        """
        Extract ID document data (National ID, Passport, Driver's License).

        Returns:
            Dict with extracted fields:
            - document_type, id_number
            - full_name, date_of_birth
            - address (if on document)
            - expiry_date
        """
        if not self.client:
            return self._mock_id_extraction()

        if not self.check_ocr_enabled():
            return {
                'success': False,
                'error': 'OCR feature is disabled for this tenant'
            }

        try:
            if image_path:
                image_data, media_type = self._encode_image(image_path)
            elif image_bytes and filename:
                image_data, media_type = self._encode_image_from_bytes(image_bytes, filename)
            else:
                return {'success': False, 'error': 'No image provided'}

            system_prompt = """You are an expert document parser for identity documents.
Extract the following information from the ID document image and return ONLY a valid JSON object:

{
    "document_type": "national_id, passport, or drivers_license",
    "id_number": "Document number",
    "full_name": "Full name as shown",
    "date_of_birth": "YYYY-MM-DD format",
    "gender": "M or F if visible",
    "nationality": "If visible",
    "address": "Address if on document",
    "issue_date": "YYYY-MM-DD if visible",
    "expiry_date": "YYYY-MM-DD if visible",
    "confidence": "high, medium, or low"
}

If a field is not visible or unclear, use null. Return ONLY the JSON object, no other text.
IMPORTANT: This is for legitimate business KYC purposes only."""

            message = self.client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data
                                }
                            },
                            {
                                "type": "text",
                                "text": "Extract the identity document information for KYC verification."
                            }
                        ]
                    }
                ]
            )

            response_text = message.content[0].text

            try:
                data = json.loads(response_text)
            except json.JSONDecodeError:
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    return {
                        'success': False,
                        'error': 'Failed to parse response',
                        'raw_response': response_text
                    }

            return {
                'success': True,
                'data': data,
                'model': settings.AI_MODEL
            }

        except Exception as e:
            logger.error(f"ID extraction failed: {e}")
            return {'success': False, 'error': str(e)}

    def _mock_lease_extraction(self) -> Dict[str, Any]:
        """Return mock lease extraction for demo."""
        return {
            'success': True,
            'data': {
                'tenant_name': 'John Doe',
                'tenant_email': 'john.doe@email.com',
                'tenant_phone': '+263 77 123 4567',
                'tenant_id_number': '63-123456-A-12',
                'tenant_type': 'individual',
                'property_address': '123 Sample Street, Harare',
                'unit_number': 'A1',
                'start_date': '2024-01-01',
                'end_date': '2024-12-31',
                'monthly_rent': '800.00',
                'deposit_amount': '1600.00',
                'currency': 'USD',
                'billing_day': 1,
                'special_conditions': 'No pets allowed',
                'confidence': 'high'
            },
            'model': 'mock'
        }

    def _mock_invoice_extraction(self) -> Dict[str, Any]:
        """Return mock invoice extraction for demo."""
        return {
            'success': True,
            'data': {
                'invoice_number': 'INV-2024-001',
                'date': '2024-01-15',
                'due_date': '2024-02-15',
                'vendor_name': 'ABC Maintenance Services',
                'vendor_address': '456 Service Road, Harare',
                'line_items': [
                    {
                        'description': 'Plumbing repair',
                        'quantity': 1,
                        'unit_price': 150.00,
                        'total': 150.00
                    }
                ],
                'subtotal': '150.00',
                'vat_rate': '15',
                'vat_amount': '22.50',
                'total_amount': '172.50',
                'currency': 'USD',
                'payment_terms': 'Net 30',
                'confidence': 'high'
            },
            'model': 'mock'
        }

    def _mock_id_extraction(self) -> Dict[str, Any]:
        """Return mock ID extraction for demo."""
        return {
            'success': True,
            'data': {
                'document_type': 'national_id',
                'id_number': '63-123456-A-12',
                'full_name': 'John Doe',
                'date_of_birth': '1985-06-15',
                'gender': 'M',
                'nationality': 'Zimbabwean',
                'address': None,
                'issue_date': '2020-01-01',
                'expiry_date': '2030-01-01',
                'confidence': 'high'
            },
            'model': 'mock'
        }
