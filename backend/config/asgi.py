"""ASGI config for Real Estate Accounting System with WebSocket support."""
import os
import json
import traceback
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')
django.setup()

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

from apps.notifications.routing import websocket_urlpatterns

django_asgi_app = get_asgi_application()


async def debug_health_app(scope, receive, send):
    """
    Raw ASGI app that bypasses ALL Django middleware.
    Handles /_debug/health and /_debug/info for production diagnostics.
    """
    if scope['type'] != 'http':
        return

    path = scope.get('path', '')

    if path == '/_debug/health':
        body = json.dumps({'status': 'ok', 'middleware': 'bypassed'}).encode()
        await send({
            'type': 'http.response.start',
            'status': 200,
            'headers': [[b'content-type', b'application/json']],
        })
        await send({'type': 'http.response.body', 'body': body})
        return

    if path == '/_debug/info':
        info = {}
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                info['db_connected'] = True
        except Exception as e:
            info['db_connected'] = False
            info['db_error'] = str(e)

        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SHOW search_path")
                info['search_path'] = cursor.fetchone()[0]
        except Exception as e:
            info['search_path_error'] = str(e)

        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM public.tenants_client")
                info['tenant_count'] = cursor.fetchone()[0]
        except Exception as e:
            info['tenant_count_error'] = str(e)

        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT id, domain, is_primary, tenant_id FROM public.tenants_domain")
                info['domains'] = [
                    {'id': r[0], 'domain': r[1], 'is_primary': r[2], 'tenant_id': r[3]}
                    for r in cursor.fetchall()
                ]
        except Exception as e:
            info['domains_error'] = str(e)

        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                )
                info['public_tables'] = [r[0] for r in cursor.fetchall()]
        except Exception as e:
            info['tables_error'] = str(e)

        try:
            from django.conf import settings
            info['middleware'] = settings.MIDDLEWARE
        except Exception as e:
            info['middleware_error'] = str(e)

        body = json.dumps(info, default=str, indent=2).encode()
        await send({
            'type': 'http.response.start',
            'status': 200,
            'headers': [
                [b'content-type', b'application/json'],
                [b'access-control-allow-origin', b'*'],
            ],
        })
        await send({'type': 'http.response.body', 'body': body})
        return


async def http_app(scope, receive, send):
    """HTTP app that routes debug endpoints directly, everything else to Django."""
    path = scope.get('path', '')

    # Debug endpoints bypass all Django middleware
    if path.startswith('/_debug/'):
        await debug_health_app(scope, receive, send)
        return

    # Everything else goes through Django
    try:
        await django_asgi_app(scope, receive, send)
    except Exception as e:
        # Catch ANY unhandled exception and return it as JSON instead of 500
        error_body = json.dumps({
            'error': str(e),
            'type': type(e).__name__,
            'traceback': traceback.format_exc(),
        }).encode()
        try:
            await send({
                'type': 'http.response.start',
                'status': 500,
                'headers': [
                    [b'content-type', b'application/json'],
                    [b'access-control-allow-origin', b'*'],
                ],
            })
            await send({'type': 'http.response.body', 'body': error_body})
        except Exception:
            pass  # Response may have already started


application = ProtocolTypeRouter({
    'http': http_app,
    'websocket': AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
