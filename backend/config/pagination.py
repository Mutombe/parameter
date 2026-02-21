from rest_framework.pagination import PageNumberPagination


class StandardPageNumberPagination(PageNumberPagination):
    """Custom pagination that allows clients to set page_size via query param."""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100
