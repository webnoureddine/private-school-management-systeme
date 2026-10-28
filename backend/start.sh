#!/bin/sh
# Production start: migrations, static files, reminder scheduler (background), web server.
set -e
python manage.py migrate --noinput
python manage.py seed_algeria
python manage.py collectstatic --noinput >/dev/null
python manage.py run_scheduler &
exec gunicorn school.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_WORKERS:-3} --timeout 60
