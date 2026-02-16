"""Utility functions for pushing notifications via WebSocket and branded HTML emails."""
import logging
import threading
from html import escape

from django.core.mail import EmailMultiAlternatives
from django.conf import settings

logger = logging.getLogger(__name__)

# ─── Brand constants ────────────────────────────────────────────────────────
PRIMARY = '#0ea5e9'        # sky-500
PRIMARY_DARK = '#0284c7'   # sky-600
PRIMARY_LIGHT = '#e0f2fe'  # sky-100
PRIMARY_BG = '#f0f9ff'     # sky-50
WHITE = '#ffffff'
BLACK = '#1a1a1a'          # 10% black
GRAY = '#64748b'           # slate-500
GRAY_LIGHT = '#f1f5f9'     # slate-100
BORDER = '#e2e8f0'         # slate-200


def _get_logo_url():
    site = getattr(settings, 'SITE_URL', 'https://parameter.co.zw')
    return f"{site.rstrip('/')}/logo.png"


def _get_company_name():
    """Get the tenant company name from thread-local request context."""
    try:
        from middleware.tenant_middleware import get_current_tenant
        tenant = get_current_tenant()
        if tenant:
            return tenant.name
    except Exception:
        pass
    return None


# ─── HTML email template ────────────────────────────────────────────────────

def build_html_email(subject, body_text, recipient_name=None, company_name=None, accent_color=None):
    """
    Build a branded HTML email with the Parameter design system.

    Args:
        subject: Email subject (also used as header)
        body_text: Plain text body (newlines converted to <br>, --- to <hr>)
        recipient_name: Optional name shown in greeting
        company_name: Company/tenant org name for footer
        accent_color: Override accent color (default: PRIMARY)

    Returns:
        (html_body, plain_text) tuple
    """
    accent = accent_color or PRIMARY
    logo_url = _get_logo_url()
    company = company_name or _get_company_name() or 'Property Management'
    site_url = getattr(settings, 'SITE_URL', 'https://parameter.co.zw')
    year = '2026'

    # Convert plain text body to HTML paragraphs
    html_body_content = _text_to_html(body_text)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:{GRAY_LIGHT};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{GRAY_LIGHT};padding:32px 16px;">
<tr><td align="center">

<!-- Email container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:{WHITE};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

  <!-- Header with gradient -->
  <tr>
    <td style="background:linear-gradient(135deg, {accent} 0%, {PRIMARY_DARK} 100%);padding:32px 40px;text-align:center;">
      <img src="{logo_url}" alt="Parameter" width="48" height="48" style="display:block;margin:0 auto 16px;border-radius:12px;background:{WHITE};padding:8px;width:48px;height:48px;">
      <h1 style="margin:0;color:{WHITE};font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">{escape(subject)}</h1>
      {f'<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;">{escape(company)}</p>' if company else ''}
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px 28px;">
      {html_body_content}
    </td>
  </tr>

  <!-- Divider -->
  <tr>
    <td style="padding:0 40px;">
      <hr style="border:none;border-top:1px solid {BORDER};margin:0;">
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:24px 40px 32px;text-align:center;">
      <p style="margin:0 0 8px;color:{GRAY};font-size:12px;line-height:1.5;">
        Sent by <strong style="color:{BLACK};">{escape(company)}</strong> via <a href="{site_url}" style="color:{accent};text-decoration:none;font-weight:600;">Parameter.co.zw</a>
      </p>
      <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5;">
        Real Estate Accounting Platform &bull; &copy; {year} Parameter
      </p>
    </td>
  </tr>

</table>
<!-- /Email container -->

</td></tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>"""

    return html, body_text


def _text_to_html(text):
    """Convert plain-text email body into styled HTML paragraphs."""
    lines = text.strip().split('\n')
    html_parts = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        # Empty line = paragraph break
        if not stripped:
            if in_list:
                in_list = False
            html_parts.append('<div style="height:12px;"></div>')
            continue

        # Section headers (=== HEADER ===)
        if stripped.startswith('===') and stripped.endswith('==='):
            title = stripped.strip('= ')
            html_parts.append(
                f'<div style="margin:20px 0 12px;padding:10px 16px;background:{PRIMARY_BG};'
                f'border-left:4px solid {PRIMARY};border-radius:0 8px 8px 0;">'
                f'<strong style="color:{PRIMARY_DARK};font-size:14px;text-transform:uppercase;'
                f'letter-spacing:0.5px;">{escape(title)}</strong></div>'
            )
            continue

        # Horizontal rule
        if stripped.startswith('---'):
            html_parts.append(f'<hr style="border:none;border-top:1px solid {BORDER};margin:16px 0;">')
            continue

        # List items (- item)
        if stripped.startswith('- '):
            content = stripped[2:]
            # Check for key: value pattern
            if ':' in content and not content.startswith('http'):
                key, _, val = content.partition(':')
                item_html = (
                    f'<strong style="color:{BLACK};">{escape(key.strip())}:</strong>'
                    f'<span style="color:{GRAY};">{escape(val.strip())}</span>'
                )
            else:
                item_html = f'<span style="color:{BLACK};">{escape(content)}</span>'

            html_parts.append(
                f'<div style="padding:6px 0 6px 20px;position:relative;font-size:14px;line-height:1.6;">'
                f'<span style="position:absolute;left:0;color:{PRIMARY};font-weight:bold;">&#8226;</span>'
                f'{item_html}</div>'
            )
            in_list = True
            continue

        # Indented sub-items (  - item or    - item)
        if stripped.startswith('  ') and line.strip().startswith('- '):
            content = line.strip()[2:]
            html_parts.append(
                f'<div style="padding:4px 0 4px 40px;font-size:13px;line-height:1.5;color:{GRAY};">'
                f'<span style="color:{PRIMARY};">&#9702;</span> {escape(content)}</div>'
            )
            continue

        # "Dear Name," greeting
        if stripped.startswith('Dear '):
            html_parts.append(
                f'<p style="margin:0 0 16px;color:{BLACK};font-size:15px;line-height:1.6;">'
                f'{escape(stripped)}</p>'
            )
            continue

        # "Best regards," closing
        if stripped in ('Best regards,', 'Thank you.', 'Thank you,'):
            html_parts.append(
                f'<p style="margin:20px 0 4px;color:{GRAY};font-size:14px;">{escape(stripped)}</p>'
            )
            continue

        # Signature lines (Property Management, Powered by, Parameter System)
        if stripped in ('Property Management', 'Parameter System') or stripped.startswith('Powered by'):
            html_parts.append(
                f'<p style="margin:0;color:{GRAY};font-size:13px;font-weight:500;">{escape(stripped)}</p>'
            )
            continue

        # Regular paragraph
        html_parts.append(
            f'<p style="margin:0 0 12px;color:{BLACK};font-size:14px;line-height:1.7;">'
            f'{escape(stripped)}</p>'
        )

    return '\n'.join(html_parts)


# ─── WebSocket push ─────────────────────────────────────────────────────────

def _do_push(group_name, message):
    """Execute the actual channel layer push in a daemon thread."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(group_name, message)
    except Exception as e:
        logger.debug(f"WebSocket push failed for {group_name}: {e}")


def push_notification_to_user(user_id, notification_data):
    """
    Push a notification to a specific user via WebSocket.
    Fire-and-forget using a daemon thread to prevent blocking.
    """
    try:
        group_name = f'notifications_{user_id}'
        t = threading.Thread(
            target=_do_push,
            args=(group_name, {
                'type': 'notification_new',
                'notification': notification_data,
            }),
            daemon=True,
        )
        t.start()
    except Exception as e:
        logger.debug(f"WebSocket push failed for user {user_id}: {e}")


def push_unread_count_to_user(user_id, count):
    """
    Push updated unread count to a specific user via WebSocket.
    Fire-and-forget using a daemon thread to prevent blocking.
    """
    try:
        group_name = f'notifications_{user_id}'
        t = threading.Thread(
            target=_do_push,
            args=(group_name, {
                'type': 'notification_count_update',
                'count': count,
            }),
            daemon=True,
        )
        t.start()
    except Exception as e:
        logger.debug(f"WebSocket count push failed for user {user_id}: {e}")


# ─── Email sending ──────────────────────────────────────────────────────────

def _do_send_email(subject, plain_text, recipient_list, html_body=None):
    """Send email in a daemon thread to avoid blocking."""
    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=plain_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipient_list,
        )
        if html_body:
            msg.attach_alternative(html_body, 'text/html')
        msg.send(fail_silently=False)
        logger.info(f"Email sent to {recipient_list}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_list}: {e}")


def _send_threaded(subject, message, recipient_list, blocking=False, company_name=None):
    """Build branded HTML email and send, optionally in a daemon thread."""
    full_subject = f"[Parameter] {subject}"
    html_body, plain_text = build_html_email(subject, message, company_name=company_name)

    if blocking:
        _do_send_email(full_subject, plain_text, recipient_list, html_body)
    else:
        t = threading.Thread(
            target=_do_send_email,
            args=(full_subject, plain_text, recipient_list, html_body),
            daemon=True,
        )
        t.start()


def send_tenant_email(tenant, subject, message, blocking=False):
    """
    Send a branded HTML email to a RentalTenant.
    Uses a daemon thread by default to prevent blocking the caller.
    """
    if not tenant or not getattr(tenant, 'email', None):
        logger.debug(f"No email for tenant {getattr(tenant, 'name', '?')}, skipping")
        return
    _send_threaded(subject, message, [tenant.email], blocking)


def send_landlord_email(landlord, subject, message, blocking=False):
    """Send a branded HTML email to a Landlord."""
    if not landlord or not getattr(landlord, 'email', None):
        logger.debug(f"No email for landlord {getattr(landlord, 'name', '?')}, skipping")
        return
    _send_threaded(subject, message, [landlord.email], blocking)


def send_staff_email(subject, message, roles=None, blocking=False):
    """
    Send a branded HTML email to all active staff members (Admin/Accountant by default).
    Uses daemon threads to prevent blocking.
    """
    try:
        from apps.accounts.models import User
        if roles is None:
            roles = [User.Role.ADMIN, User.Role.ACCOUNTANT]
        staff = User.objects.filter(
            role__in=roles, is_active=True, notifications_enabled=True
        ).values_list('email', flat=True)
        emails = [e for e in staff if e]
        if not emails:
            return
        _send_threaded(subject, message, emails, blocking)
    except Exception as e:
        logger.error(f"Failed to send staff email: {e}")


def send_email(recipient_email, subject, message, blocking=False):
    """Send a branded HTML email to any single email address."""
    if not recipient_email:
        return
    _send_threaded(subject, message, [recipient_email], blocking)
