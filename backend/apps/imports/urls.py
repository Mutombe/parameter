"""URL routes for imports."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ImportJobViewSet

router = DefaultRouter()
router.register('jobs', ImportJobViewSet, basename='import-job')

urlpatterns = [
    path('', include(router.urls)),
]
