from django.core.management.base import BaseCommand
from core.algeria import seed_algeria

class Command(BaseCommand):
    help = "Create Algerian school levels (1AP..3AS + filieres) and their modules, in French + Arabic"
    def handle(self, *a, **o):
        l, m = seed_algeria()
        self.stdout.write(f"levels created: {l}, modules created: {m}")
