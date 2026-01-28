"""Serializers for import API."""
from rest_framework import serializers
from .models import ImportJob, ImportError


class ImportErrorSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportError
        fields = ['id', 'sheet_name', 'row_number', 'field_name', 'error_message', 'row_data']


class ImportJobSerializer(serializers.ModelSerializer):
    errors = ImportErrorSerializer(many=True, read_only=True)
    progress_percent = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = ImportJob
        fields = [
            'id', 'import_type', 'status', 'file_name', 'file',
            'total_rows', 'processed_rows', 'success_count', 'error_count',
            'preview_data', 'error_message', 'progress_percent',
            'created_by', 'created_by_name', 'created_at', 'started_at', 'completed_at',
            'errors'
        ]
        read_only_fields = [
            'status', 'total_rows', 'processed_rows', 'success_count',
            'error_count', 'preview_data', 'error_message', 'created_by',
            'created_at', 'started_at', 'completed_at'
        ]


class ImportJobListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views."""
    progress_percent = serializers.ReadOnlyField()
    error_count_display = serializers.SerializerMethodField()

    class Meta:
        model = ImportJob
        fields = [
            'id', 'import_type', 'status', 'file_name',
            'total_rows', 'processed_rows', 'success_count', 'error_count',
            'progress_percent', 'error_count_display',
            'created_at', 'completed_at'
        ]

    def get_error_count_display(self, obj):
        if obj.error_count > 0:
            return f"{obj.error_count} errors"
        return None


class FileUploadSerializer(serializers.Serializer):
    """Serializer for file upload."""
    file = serializers.FileField()
    import_type = serializers.ChoiceField(
        choices=ImportJob.ImportType.choices,
        required=False,
        help_text="Optional. Will be auto-detected if not provided."
    )

    def validate_file(self, value):
        # Check file extension
        ext = value.name.lower().split('.')[-1]
        if ext not in ['csv', 'xlsx', 'xls']:
            raise serializers.ValidationError(
                "Unsupported file type. Please upload CSV or Excel (.xlsx) files."
            )

        # Check file size (max 10MB)
        if value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError(
                "File too large. Maximum size is 10MB."
            )

        return value
