"""URL configuration for search API."""
from django.urls import path
from .views import UnifiedSearchView, SearchSuggestionsView

urlpatterns = [
    path('', UnifiedSearchView.as_view(), name='unified-search'),
    path('suggestions/', SearchSuggestionsView.as_view(), name='search-suggestions'),
]
