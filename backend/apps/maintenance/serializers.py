"""Serializers for maintenance module."""
from rest_framework import serializers
from .models import MaintenanceRequest, WorkOrder


class WorkOrderSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrder
        fields = [
            'id', 'request', 'assigned_to', 'assigned_to_name',
            'vendor_name', 'estimated_cost', 'actual_cost', 'currency',
            'scheduled_date', 'completed_date', 'notes', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.email
        return None


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    work_orders = WorkOrderSerializer(many=True, read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True, default=None)
    reported_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRequest
        fields = [
            'id', 'property', 'property_name', 'unit', 'unit_number',
            'reported_by', 'reported_by_name', 'title', 'description',
            'priority', 'status', 'photos', 'work_orders',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'reported_by']

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return obj.reported_by.get_full_name() or obj.reported_by.email
        return None


class MaintenanceRequestListSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True, default=None)
    work_order_count = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRequest
        fields = [
            'id', 'property', 'property_name', 'unit', 'unit_number',
            'title', 'priority', 'status', 'created_at', 'updated_at',
            'work_order_count',
        ]

    def get_work_order_count(self, obj):
        return obj.work_orders.count()
