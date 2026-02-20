from django.urls import path
from . import views

urlpatterns = [
    path('', views.trash_list, name='trash-list'),
    path('restore/', views.trash_restore, name='trash-restore'),
    path('purge/', views.trash_purge, name='trash-purge'),
    path('purge-all/', views.trash_purge_all, name='trash-purge-all'),
]
