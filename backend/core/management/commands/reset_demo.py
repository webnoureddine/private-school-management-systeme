"""Wipe everything that was inserted (levels, modules, classes, sessions, students, payments...) and
re-insert the Arabic demo scenario. Superusers (your admin accounts) are kept.

    python manage.py reset_demo --yes
    python manage.py reset_demo --yes --empty     # wipe only, no demo data (just the Algerian levels/modules)
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import *


class Command(BaseCommand):
    help = "حذف كل البيانات المُدرجة وإعادة إدراج سيناريو واقعي بالعربية (حسابات superuser تبقى)"

    def add_arguments(self, p):
        p.add_argument("--yes", action="store_true", help="do not ask for confirmation")
        p.add_argument("--empty", action="store_true", help="wipe only, then load levels/modules without demo people")

    @transaction.atomic
    def _wipe(self):
        # order matters: PROTECT foreign keys (module/level/teacher) must be freed first
        for m in (Notification, Attendance, Session, Grade, Payment, Subscription, Announcement, Closure,
                  Teaching, Group, Module, Level, Room):
            m.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()

    def handle(self, *a, **o):
        if not o["yes"]:
            if input("This DELETES all school data (superusers kept). Type 'yes' to continue: ") != "yes":
                raise CommandError("cancelled")
        self._wipe()
        self.stdout.write("old data deleted")
        if o["empty"]:
            from core.algeria import seed_algeria
            l, m = seed_algeria()
            self.stdout.write(f"levels: {l}, modules: {m}")
        else:
            call_command("seed_demo")
