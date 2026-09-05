from django.db import migrations, models
 
 
class Migration(migrations.Migration):
 
    dependencies = [
        ('hr', '0003_salaryadvance'),
    ]
 
    operations = [
        migrations.AddField(
            model_name='employee',
            name='date_naissance',
            field=models.DateField(blank=True, null=True),
        ),
    ]
 