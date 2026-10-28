# 🏫 School Platform — Django + React + Supabase

```
backend/    Django REST API, automation engine, tests, deploy files (Procfile, render.yaml)
frontend/   React (Vite) admin / teacher / student interface
supabase/   setup.sql  (RLS security, indexes, reporting views, pg_cron job)
```

## 1. Supabase (free database)
1. Create a project at supabase.com → Project Settings → Database → copy the **Connection string (URI)**
   (use the "Session pooler" one if direct connection fails on IPv4).
2. You will paste it as `DATABASE_URL`.

## 2. Backend (local test)
```bash
cd backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # set DATABASE_URL (empty = local SQLite)
python manage.py migrate                              # creates all tables in Supabase
python manage.py seed_demo                            # demo users + sessions (optional)
python manage.py test                                 # 4 automation tests
python manage.py runserver
```
Demo logins: `admin / admin12345`, `teacher1 / demo12345`, `student1 / demo12345`.

## 3. Supabase SQL
After `migrate`, open Supabase → SQL Editor → run `supabase/setup.sql`
(enables RLS so only Django can access data, adds indexes, views, hourly "mark done" job).

## 4. Frontend
```bash
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:8000/api
npm install && npm run dev  # http://localhost:5173
```

## 5. Free deployment
- **API:** Render (uses `render.yaml`) or Koyeb. Set env: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS=https://your-frontend.vercel.app`, `DEBUG=0`.
- **Frontend:** Vercel/Netlify, root `frontend`, env `VITE_API_URL=https://your-api.onrender.com/api`.
- **Daily reminders:** push the repo to GitHub and add the secrets used in `backend/.github/workflows/daily.yml`
  (the workflow is already at the repo root). Runs every day at 17:00 UTC.

## Notifications
Email works with any SMTP (Brevo free tier). Telegram: create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN`,
users store their chat id. WhatsApp: Meta Cloud API token + phone id.
Every message is logged in-app with the channels that succeeded/failed.

## Upgrade notes (v2)
- New: Algerian levels (1AP–5AP, 1AM–4AM, 1AS + 2AS/3AS filières) with Arabic names, `Teaching` (teacher per module per class),
  per-student file (level, class, modules, teachers), parents linked to children, Arabic/French/English interface.
- After copying the new files: `python manage.py migrate` → `python manage.py seed_algeria` → re-run `supabase/setup.sql`.
- Workflow: Levels (seeded) → Classes (create + add students) → Teaching assignments (teacher per module) → students see everything in "My modules".
- Module hours and coefficients are neutral defaults: edit them to match the official programme.
