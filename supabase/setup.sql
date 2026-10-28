-- =====================================================================
-- Supabase setup. Run AFTER `python manage.py migrate` (Django creates the tables).
-- Supabase Dashboard > SQL Editor > paste > Run.
-- =====================================================================

-- 1) Security: Django is the only API. Block Supabase's public REST/GraphQL access
--    to every table (RLS on + no policies = deny for anon/authenticated roles).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND (tablename LIKE 'core\_%' OR tablename LIKE 'django\_%' OR tablename LIKE 'auth\_%')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2) Performance indexes for the most frequent queries
CREATE INDEX IF NOT EXISTS idx_session_start        ON core_session (start);
CREATE INDEX IF NOT EXISTS idx_session_status_start ON core_session (status, start);
CREATE INDEX IF NOT EXISTS idx_session_teacher      ON core_session (teacher_id, start);
CREATE INDEX IF NOT EXISTS idx_session_group        ON core_session (group_id, start);
CREATE INDEX IF NOT EXISTS idx_payment_unpaid       ON core_payment (due_date) WHERE paid_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_user_unread    ON core_notification (user_id, created_at DESC) WHERE read = false;

-- 3) Handy reporting views
CREATE OR REPLACE VIEW v_tomorrow_sessions AS
SELECT s.id, s.start, s."end", m.name AS module, g.name AS class_group,
       u.first_name || ' ' || u.last_name AS teacher, s.status, s.reminder_sent
FROM core_session s
JOIN core_module m ON m.id = s.module_id
JOIN core_group  g ON g.id = s.group_id
JOIN core_user   u ON u.id = s.teacher_id
WHERE (s.start AT TIME ZONE 'Africa/Algiers')::date = (now() AT TIME ZONE 'Africa/Algiers')::date + 1
ORDER BY s.start;

CREATE OR REPLACE VIEW v_unpaid_fees AS
SELECT p.id, u.first_name || ' ' || u.last_name AS student, p.label, p.amount, p.due_date,
       (CURRENT_DATE - p.due_date) AS days_late
FROM core_payment p JOIN core_user u ON u.id = p.student_id
WHERE p.paid_on IS NULL ORDER BY p.due_date;

CREATE OR REPLACE VIEW v_absence_rate AS
SELECT u.id AS student_id, u.first_name || ' ' || u.last_name AS student,
       count(*) AS total, count(*) FILTER (WHERE NOT a.present) AS absences,
       round(100.0 * count(*) FILTER (WHERE NOT a.present) / count(*), 1) AS absence_pct
FROM core_attendance a JOIN core_user u ON u.id = a.student_id
GROUP BY u.id, u.first_name, u.last_name ORDER BY absence_pct DESC;

CREATE OR REPLACE VIEW v_student_averages AS
SELECT g.student_id, m.name AS module,
       round(avg(g.score / g.out_of * 20), 2) AS avg_out_of_20
FROM core_grade g JOIN core_module m ON m.id = g.module_id
GROUP BY g.student_id, m.name;

CREATE OR REPLACE VIEW v_student_modules AS
SELECT s.id AS student_id, s.first_name || ' ' || s.last_name AS student,
       g.name AS class_group, l.name AS level, l.cycle, m.name AS module, m.name_ar AS module_ar,
       COALESCE(t.first_name || ' ' || t.last_name, '-') AS teacher
FROM core_group_students gs
JOIN core_user  s ON s.id = gs.user_id
JOIN core_group g ON g.id = gs.group_id
JOIN core_level l ON l.id = g.level_id
JOIN core_module m ON m.level_id = l.id
LEFT JOIN core_teaching th ON th.group_id = g.id AND th.module_id = m.id
LEFT JOIN core_user t ON t.id = th.teacher_id
ORDER BY s.id, m.name;

-- 4) Optional: auto-mark finished lessons as "done" every hour (needs pg_cron:
--    Dashboard > Database > Extensions > enable pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('mark-sessions-done', '0 * * * *',
  $$UPDATE core_session SET status = 'done' WHERE status = 'planned' AND "end" < now()$$);
