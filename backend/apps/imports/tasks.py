"""Background tasks for import processing."""
import os
import tempfile
from django.db import connection
from django.utils import timezone


def process_import_job(job_id):
    """
    Process an import job in the background.

    This function is called synchronously for now but can be
    converted to use Django-Q async_task for larger imports.

    Uses the current tenant schema from the DB connection. Ensures
    the schema stays consistent throughout processing even if
    signal handlers or other code touches the connection.
    """
    from .models import ImportJob
    from .services import parse_file, process_import

    # Capture the current schema so we can restore it after processing
    # (entity creation signals can sometimes alter the connection state)
    current_schema = connection.schema_name

    try:
        job = ImportJob.objects.get(id=job_id)
    except ImportJob.DoesNotExist:
        return

    # Update status
    job.status = ImportJob.Status.PROCESSING
    job.started_at = timezone.now()
    job.save()

    try:
        # Save file to temp location for processing
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{job.file_name.split(".")[-1]}') as tmp:
            for chunk in job.file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            # Parse file
            data_frames = parse_file(tmp_path, job.file_name)

            # Process import
            success_count, error_count = process_import(job, data_frames)

            # Restore schema before final save (signals may have changed it)
            if connection.schema_name != current_schema:
                connection.set_schema(current_schema)

            # Update job status
            job.status = ImportJob.Status.COMPLETED
            job.completed_at = timezone.now()
            job.save()

        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        # Restore schema before error save
        try:
            if connection.schema_name != current_schema:
                connection.set_schema(current_schema)
        except Exception:
            pass

        job.status = ImportJob.Status.FAILED
        job.error_message = str(e)
        job.completed_at = timezone.now()
        job.save()


def process_import_job_async(job_id):
    """
    Queue import job for async processing using Django-Q.

    Use this for large imports to avoid timeout issues.
    """
    try:
        from django_q.tasks import async_task
        async_task(
            'apps.imports.tasks.process_import_job',
            job_id,
            task_name=f'import_job_{job_id}'
        )
    except ImportError:
        # Django-Q not available, process synchronously
        process_import_job(job_id)
