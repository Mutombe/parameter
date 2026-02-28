"""
Custom DRF exception handler for user-friendly error messages.
"""
from rest_framework.views import exception_handler
from rest_framework.exceptions import (
    ValidationError,
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied,
    NotFound,
    MethodNotAllowed,
    Throttled,
)
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
import logging

logger = logging.getLogger(__name__)

# Field name mappings for user-friendly messages
FIELD_NAMES = {
    'email': 'Email address',
    'phone': 'Phone number',
    'name': 'Name',
    'password': 'Password',
    'password1': 'Password',
    'password2': 'Password confirmation',
    'username': 'Username',
    'first_name': 'First name',
    'last_name': 'Last name',
    'commission_rate': 'Commission rate',
    'amount': 'Amount',
    'date': 'Date',
    'due_date': 'Due date',
    'tenant': 'Tenant',
    'landlord': 'Landlord',
    'property': 'Property',
    'unit': 'Unit',
    'lease': 'Lease',
    'invoice': 'Invoice',
    'receipt': 'Receipt',
    'account': 'Account',
    'start_date': 'Start date',
    'end_date': 'End date',
    'rent_amount': 'Rent amount',
    'deposit_amount': 'Deposit amount',
    'address': 'Address',
    'company_name': 'Company name',
    'registration_number': 'Registration number',
    'non_field_errors': '',
}

# Common validation error patterns and their friendly messages
ERROR_MESSAGES = {
    'blank': 'This field cannot be empty.',
    'required': 'This field is required.',
    'null': 'This field cannot be empty.',
    'invalid': 'Please enter a valid value.',
    'max_length': 'This value is too long.',
    'min_length': 'This value is too short.',
    'max_value': 'This value is too large.',
    'min_value': 'This value is too small.',
    'invalid_choice': 'Please select a valid option.',
    'does_not_exist': 'The selected item was not found.',
    'unique': 'This value already exists.',
}


def get_friendly_field_name(field_name: str) -> str:
    """Convert a field name to a user-friendly label."""
    return FIELD_NAMES.get(field_name, field_name.replace('_', ' ').title())


def format_error_message(field_name: str, error_message: str) -> str:
    """Format a single error message to be user-friendly."""
    friendly_field = get_friendly_field_name(field_name)

    # Check for common error patterns
    error_lower = error_message.lower()

    if 'blank' in error_lower or 'may not be blank' in error_lower:
        return f'{friendly_field} cannot be empty.'

    if 'required' in error_lower:
        return f'{friendly_field} is required.'

    if 'already exists' in error_lower or 'unique' in error_lower:
        return f'{friendly_field} already exists. Please use a different value.'

    if 'does not exist' in error_lower or 'not found' in error_lower:
        return f'The selected {friendly_field.lower()} was not found.'

    if 'invalid' in error_lower:
        if 'email' in field_name.lower():
            return 'Please enter a valid email address.'
        if 'phone' in field_name.lower():
            return 'Please enter a valid phone number.'
        if 'date' in field_name.lower():
            return 'Please enter a valid date.'
        # Preserve detailed messages (longer than DRF's default short patterns)
        if len(error_message) > 50:
            return error_message if not friendly_field else f'{friendly_field}: {error_message}'
        return f'{friendly_field} has an invalid value.'

    if 'too long' in error_lower or 'max_length' in error_lower:
        return f'{friendly_field} is too long.'

    if 'too short' in error_lower or 'min_length' in error_lower:
        return f'{friendly_field} is too short.'

    if 'positive' in error_lower or 'greater than' in error_lower:
        return f'{friendly_field} must be a positive number.'

    if 'negative' in error_lower or 'less than' in error_lower:
        return f'{friendly_field} must be a negative number.'

    # If no pattern matched, return the original with friendly field name
    if not friendly_field:
        return error_message

    if error_message.lower().startswith('this field'):
        return f'{friendly_field} {error_message[11:]}'

    return f'{friendly_field}: {error_message}'


def format_validation_errors(errors: dict) -> dict:
    """Format validation errors to be user-friendly."""
    formatted = {}

    for field, messages in errors.items():
        if isinstance(messages, list):
            formatted[field] = [format_error_message(field, str(msg)) for msg in messages]
        elif isinstance(messages, dict):
            # Nested errors
            formatted[field] = format_validation_errors(messages)
        else:
            formatted[field] = [format_error_message(field, str(messages))]

    return formatted


def get_first_error_message(errors: dict) -> str:
    """Get the first error message from validation errors."""
    for field, messages in errors.items():
        if isinstance(messages, list) and messages:
            return format_error_message(field, str(messages[0]))
        elif isinstance(messages, str):
            return format_error_message(field, messages)
        elif isinstance(messages, dict):
            return get_first_error_message(messages)
    return 'An error occurred. Please try again.'


def custom_exception_handler(exc, context):
    """
    Custom exception handler that returns user-friendly error messages.
    """
    # Call DRF's default exception handler first
    response = exception_handler(exc, context)

    if response is not None:
        # Log the error for debugging
        view = context.get('view')
        request = context.get('request')
        logger.warning(
            f"API Error: {exc.__class__.__name__} in {view.__class__.__name__ if view else 'Unknown'} "
            f"- {request.method if request else 'Unknown'} {request.path if request else 'Unknown'}"
        )

        if isinstance(exc, ValidationError):
            # DEBUG: Log raw validation error detail
            logger.warning(f"ValidationError detail type={type(exc.detail).__name__}: {exc.detail}")

            # Format validation errors
            if isinstance(exc.detail, dict):
                formatted_errors = format_validation_errors(exc.detail)
                first_error = get_first_error_message(exc.detail)
                response.data = {
                    'message': first_error,
                    'errors': formatted_errors,
                    'code': 'validation_error'
                }
            elif isinstance(exc.detail, list):
                response.data = {
                    'message': str(exc.detail[0]) if exc.detail else 'Validation error',
                    'errors': exc.detail,
                    'code': 'validation_error'
                }
            else:
                response.data = {
                    'message': str(exc.detail),
                    'code': 'validation_error'
                }

        elif isinstance(exc, NotAuthenticated):
            response.data = {
                'message': 'Please log in to continue.',
                'code': 'not_authenticated'
            }

        elif isinstance(exc, AuthenticationFailed):
            response.data = {
                'message': 'Invalid credentials. Please check your email and password.',
                'code': 'authentication_failed'
            }

        elif isinstance(exc, PermissionDenied):
            response.data = {
                'message': 'You don\'t have permission to perform this action.',
                'code': 'permission_denied'
            }

        elif isinstance(exc, NotFound):
            response.data = {
                'message': 'The requested resource was not found.',
                'code': 'not_found'
            }

        elif isinstance(exc, MethodNotAllowed):
            response.data = {
                'message': 'This action is not allowed.',
                'code': 'method_not_allowed'
            }

        elif isinstance(exc, Throttled):
            wait = exc.wait
            if wait:
                response.data = {
                    'message': f'Too many requests. Please wait {int(wait)} seconds.',
                    'code': 'throttled'
                }
            else:
                response.data = {
                    'message': 'Too many requests. Please slow down.',
                    'code': 'throttled'
                }

    return response
