from django.core.management.base import BaseCommand

from core import services


class Command(BaseCommand):
    help = "Daily automation: tomorrow's class reminders + payment reminders (use with cron, e.g. 0 18 * * *)"

    def handle(self, *a, **o):
        self.stdout.write(str(services.daily_job(force=True)))
