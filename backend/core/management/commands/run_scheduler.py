"""Long-running process that does the daily automation by itself (no cron needed).

    python manage.py run_scheduler

Every 5 minutes: marks finished sessions as done; once a day after the 'reminder hour'
(Settings page, default 18:00) sends tomorrow's class reminders and payment reminders.
When the school has a Telegram bot and no public HTTPS webhook, it also reads the bot's
messages continuously so users can link their accounts.
"""
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections, connection

from core import services
from core.notify import cfg
from core.views import poll_telegram_once


class Command(BaseCommand):
    help = "Run the daily reminders scheduler (+ Telegram polling when no webhook)"

    def add_arguments(self, p):
        p.add_argument("--interval", type=int, default=300)

    def handle(self, *a, **o):
        self.stdout.write(self.style.SUCCESS("scheduler started"))
        last, tg_state = 0, None
        while True:
            close_old_connections()
            if time.time() - last >= o["interval"]:
                last = time.time()
                try:
                    r = services.daily_job()
                    if r: self.stdout.write(f"daily job: {r}")
                except Exception as e:
                    self.stderr.write(f"daily job error: {e}")
            token = cfg()["tg_token"]
            if not token:
                if tg_state != "none": self.stdout.write("telegram: no bot token yet (Settings page)"); tg_state = "none"
                time.sleep(20); continue
            connection.close()  # don't hold a DB connection while waiting for Telegram
            state = poll_telegram_once(token, timeout=25)
            if state != tg_state:
                msg = {"ok": "telegram: listening for /start (users can link their accounts)",
                       "webhook": "telegram: webhook active, Telegram sends messages to the website directly"}.get(state, f"telegram {state}")
                self.stdout.write(msg); tg_state = state
            if state != "ok":
                time.sleep(30)
