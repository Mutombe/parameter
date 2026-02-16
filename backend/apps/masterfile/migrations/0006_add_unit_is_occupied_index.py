"""Add index on Unit.is_occupied for vacancy queries."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('masterfile', '0005_propertymanager_and_more'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='unit',
            index=models.Index(fields=['is_occupied'], name='mf_unit_occupied_idx'),
        ),
        migrations.AddIndex(
            model_name='unit',
            index=models.Index(fields=['property', 'is_occupied'], name='mf_unit_prop_occ_idx'),
        ),
    ]
