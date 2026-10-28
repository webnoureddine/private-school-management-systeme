from datetime import timedelta
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from core import services
from core.models import *


@override_settings(EMAIL_CONFIGURED=True, NOTIFY_ASYNC=False)
class AutomationTests(TestCase):
    def setUp(self):
        lvl = Level.objects.create(name="G9")
        self.t = User.objects.create_user("t", email="t@x.com", role="teacher", language="en")
        self.s = User.objects.create_user("s", email="s@x.com", role="student", language="fr")
        self.g = Group.objects.create(name="A", level=lvl, year="2026-2027"); self.g.students.add(self.s)
        self.m = Module.objects.create(name="Math", level=lvl)
        Subscription.objects.create(student=self.s, module=self.m)
        start = timezone.now().replace(hour=10, minute=0) + timedelta(days=1)
        self.sess = Session.objects.create(module=self.m, group=self.g, teacher=self.t,
                                           start=start, end=start + timedelta(hours=1))

    def test_reminder_sent_once(self):
        self.assertEqual(services.send_tomorrow_reminders(), 2)
        self.assertEqual(services.send_tomorrow_reminders(), 0)
        self.assertEqual(len(mail.outbox), 2)

    def test_cancel_notifies_everyone(self):
        services.cancel_session(self.sess, "Teacher sick")
        self.assertEqual(Notification.objects.filter(kind="cancel").count(), 2)
        self.assertIn("Teacher sick", mail.outbox[0].body)

    def test_closure_cancels_sessions(self):
        c = Closure.objects.create(date=self.sess.start.date(), reason="Snow")
        services.apply_closure(c)
        self.sess.refresh_from_db()
        self.assertEqual(self.sess.status, "cancelled")

    def test_conflict_detection(self):
        dup = Session(module=self.m, group=self.g, teacher=self.t, start=self.sess.start, end=self.sess.end)
        self.assertTrue(dup.conflicts().exists())


from rest_framework.test import APIClient
from core.profiles import student_profile


@override_settings(NOTIFY_ASYNC=False)
class ProfileTests(TestCase):
    def setUp(self):
        self.lvl = Level.objects.create(name="3AM", cycle="middle")
        self.m = Module.objects.create(name="Math", level=self.lvl)
        Module.objects.create(name="Fr", level=self.lvl)
        self.t = User.objects.create_user("t", role="teacher", first_name="Karim")
        self.s = User.objects.create_user("s", role="student")
        self.p = User.objects.create_user("p", role="parent"); self.p.children.add(self.s)
        self.o = User.objects.create_user("o", role="student")
        g = Group.objects.create(name="A", level=self.lvl, year="2026-2027"); g.students.add(self.s)
        Teaching.objects.create(group=g, module=self.m, teacher=self.t)
        Subscription.objects.create(student=self.s, module=self.m)
        Grade.objects.create(student=self.s, module=self.m, title="E1", score=15)
        Grade.objects.create(student=self.o, module=self.m, title="E1", score=10)

    def test_profile_modules_and_teachers(self):
        p = student_profile(self.s)
        mods = {m["name"]: m for m in p["groups"][0]["modules"]}
        self.assertEqual(p["groups"][0]["level"]["name"], "3AM")
        self.assertEqual(mods["Math"]["teacher"]["name"], "Karim")
        self.assertIsNone(mods["Fr"]["teacher"])

    def test_parent_sees_only_child_grades(self):
        c = APIClient(); c.force_authenticate(self.p)
        self.assertEqual(len(c.get("/api/grades/").json()), 1)
        self.assertEqual(c.get("/api/me/profile/").json()[0]["username"], "s")

    def test_parent_gets_class_reminders(self):
        g = self.s.class_groups.first()
        from datetime import timedelta
        st = timezone.now().replace(hour=10, minute=0) + timedelta(days=1)
        Session.objects.create(module=self.m, group=g, teacher=self.t, start=st, end=st + timedelta(hours=1))
        self.assertEqual(services.send_tomorrow_reminders(), 3)  # student + parent + teacher

    def test_wrong_level_module_rejected(self):
        other = Level.objects.create(name="4AM"); m2 = Module.objects.create(name="X", level=other)
        c = APIClient(); c.force_authenticate(User.objects.create_user("adm", role="admin"))
        g = self.s.class_groups.first()
        r = c.post("/api/teachings/", {"group": g.id, "module": m2.id, "teacher": self.t.id}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_seed_algeria(self):
        from core.algeria import seed_algeria
        seed_algeria()
        self.assertTrue(Level.objects.filter(name="3AS SE", cycle="secondary").exists())
        self.assertTrue(Module.objects.filter(level__name="3AM", name_ar="الرياضيات").exists())


@override_settings(NOTIFY_ASYNC=False)
class SubscriptionTests(TestCase):
    def setUp(self):
        self.lvl = Level.objects.create(name="3AM")
        self.math = Module.objects.create(name="Math", level=self.lvl)
        self.fr = Module.objects.create(name="Fr", level=self.lvl)
        self.t = User.objects.create_user("t", role="teacher")
        self.a = User.objects.create_user("a", role="student"); self.b = User.objects.create_user("b", role="student")
        self.p = User.objects.create_user("p", role="parent"); self.p.children.add(self.a)
        self.adm = User.objects.create_user("adm", role="admin")
        self.g = Group.objects.create(name="A", level=self.lvl, year="2026-2027"); self.g.students.add(self.a, self.b)
        Subscription.objects.create(student=self.a, module=self.math)
        Subscription.objects.create(student=self.b, module=self.fr)
        st = timezone.now().replace(hour=10, minute=0, second=0)
        self.s_math = Session.objects.create(module=self.math, group=self.g, teacher=self.t, start=st, end=st + timedelta(hours=1))
        self.s_fr = Session.objects.create(module=self.fr, group=self.g, teacher=self.t, start=st + timedelta(hours=2), end=st + timedelta(hours=3))

    def test_roster_only_subscribed(self):
        self.assertEqual(list(self.s_math.roster()), [self.a]); self.assertEqual(list(self.s_fr.roster()), [self.b])

    def test_inactive_or_ended_subscription_not_expected(self):
        Subscription.objects.filter(student=self.a).update(active=False)
        self.assertEqual(self.s_math.roster().count(), 0)

    def test_student_and_parent_see_only_subscribed_sessions(self):
        for u in (self.a, self.p):
            c = APIClient(); c.force_authenticate(u)
            self.assertEqual([x["id"] for x in c.get("/api/sessions/").json()], [self.s_math.id])

    def test_daily_endpoint(self):
        c = APIClient(); c.force_authenticate(self.adm)
        d = c.get("/api/daily/").json()
        self.assertEqual(d["summary"]["expected_students"], 2)
        self.assertEqual(len(d["sessions"]), 2)
        c.force_authenticate(self.a); self.assertEqual(c.get("/api/daily/").status_code, 403)

    def test_attendance_roundtrip(self):
        c = APIClient(); c.force_authenticate(self.adm)
        c.post(f"/api/sessions/{self.s_math.id}/attendance/", [{"student": self.a.id, "present": False}], format="json")
        d = c.get("/api/daily/").json()
        self.assertEqual(d["summary"]["absent"], 1)

    def test_bulk_subscribe_and_wrong_level(self):
        c = APIClient(); c.force_authenticate(self.adm)
        r = c.post("/api/subscriptions/bulk/", {"group": self.g.id, "modules": [self.math.id, self.fr.id], "monthly_fee": 2000}, format="json")
        self.assertEqual(r.json()["created"], 2)  # a+fr, b+math (the 2 others already existed)
        other = Module.objects.create(name="X", level=Level.objects.create(name="4AM"))
        r = c.post("/api/subscriptions/", {"student": self.a.id, "module": other.id}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_session_edit_conflict_detected(self):
        c = APIClient(); c.force_authenticate(self.adm)
        r = c.patch(f"/api/sessions/{self.s_fr.id}/", {"start": self.s_math.start.isoformat(), "end": self.s_math.end.isoformat()}, format="json")
        self.assertEqual(r.status_code, 400)


@override_settings(EMAIL_CONFIGURED=True, NOTIFY_ASYNC=False)
class TeacherMessagingTests(TestCase):
    """The core use-case: a teacher sees his students and messages / reminds them."""
    def setUp(self):
        lvl = Level.objects.create(name="3AM")
        self.math = Module.objects.create(name="Math", name_ar="الرياضيات", level=lvl)
        self.fr = Module.objects.create(name="Fr", level=lvl)
        self.t = User.objects.create_user("t", role="teacher", email="t@x.com")
        self.t2 = User.objects.create_user("t2", role="teacher")
        self.a = User.objects.create_user("a", role="student", email="a@x.com", phone="0555123456")
        self.b = User.objects.create_user("b", role="student", email="b@x.com")
        self.c = User.objects.create_user("c", role="student", email="c@x.com")  # not subscribed to math
        self.p = User.objects.create_user("p", role="parent", email="p@x.com"); self.p.children.add(self.a)
        self.g = Group.objects.create(name="A", level=lvl, year="2026-2027"); self.g.students.add(self.a, self.b, self.c)
        self.g2 = Group.objects.create(name="B", level=lvl, year="2026-2027")
        Teaching.objects.create(group=self.g, module=self.math, teacher=self.t)
        Teaching.objects.create(group=self.g, module=self.fr, teacher=self.t2)
        Teaching.objects.create(group=self.g2, module=self.math, teacher=self.t2)
        for st in (self.a, self.b): Subscription.objects.create(student=st, module=self.math)
        Subscription.objects.create(student=self.c, module=self.fr)
        st = timezone.now() + timedelta(days=1)
        self.s = Session.objects.create(module=self.math, group=self.g, teacher=self.t, start=st, end=st + timedelta(hours=1))
        self.api = APIClient(); self.api.force_authenticate(self.t)

    def test_teacher_sees_only_his_students(self):
        ids = [r["id"] for r in self.api.get("/api/me/students/").json()]
        self.assertEqual(sorted(ids), sorted([self.a.id, self.b.id]))

    def test_teacher_remind_session(self):
        r = self.api.post(f"/api/sessions/{self.s.id}/remind/", {"note": "أحضروا الكراريس", "channels": ["email"]}, format="json")
        self.assertEqual(r.json()["notified"], 3)  # a, b + parent of a
        self.assertEqual(len(mail.outbox), 3)
        self.assertIn("أحضروا الكراريس", Notification.objects.filter(user=self.a).first().body)

    def test_teacher_message_to_his_class(self):
        r = self.api.post("/api/announcements/", {"title": "غدا", "body": "لا تنسوا", "audience_group": self.g.id,
                                                  "audience_role": "student", "include_parents": True, "channels": "email"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        users = set(Notification.objects.filter(kind="message").values_list("user__username", flat=True))
        self.assertEqual(users, {"a", "b", "c", "p"})

    def test_teacher_message_to_selected_students(self):
        r = self.api.post("/api/announcements/", {"title": "x", "body": "y", "audience_users": [self.b.id]}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["recipients"], 1)

    def test_teacher_cannot_message_other_class_or_student(self):
        r = self.api.post("/api/announcements/", {"title": "x", "body": "y", "audience_group": self.g2.id}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.api.post("/api/announcements/", {"title": "x", "body": "y", "audience_users": [self.c.id]}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.api.post("/api/announcements/", {"title": "x", "body": "y"}, format="json")
        self.assertEqual(r.status_code, 400)  # whole school not allowed for a teacher

    def test_teacher_cannot_remind_other_session(self):
        other = Session.objects.create(module=self.fr, group=self.g, teacher=self.t2, start=self.s.start + timedelta(hours=2),
                                       end=self.s.end + timedelta(hours=2))
        self.assertEqual(self.api.post(f"/api/sessions/{other.id}/remind/", {}, format="json").status_code, 404)

    def test_absence_alert_only_once(self):
        url = f"/api/sessions/{self.s.id}/attendance/"
        self.api.post(url, [{"student": self.a.id, "present": False}], format="json")
        self.api.post(url, [{"student": self.a.id, "present": False}], format="json")
        self.assertEqual(Notification.objects.filter(kind="absence", user=self.a).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="absence", user=self.p).count(), 1)

    def test_teacher_grades_restricted(self):
        ok = self.api.post("/api/grades/", {"student": self.a.id, "module": self.math.id, "title": "E1", "score": 14}, format="json")
        self.assertEqual(ok.status_code, 201)
        bad = self.api.post("/api/grades/", {"student": self.c.id, "module": self.fr.id, "title": "E1", "score": 14}, format="json")
        self.assertEqual(bad.status_code, 403)
        over = self.api.post("/api/grades/", {"student": self.a.id, "module": self.math.id, "title": "E2", "score": 25}, format="json")
        self.assertEqual(over.status_code, 400)

    def test_admin_whole_school_message_and_preview(self):
        adm = User.objects.create_user("adm", role="admin"); c = APIClient(); c.force_authenticate(adm)
        pv = c.post("/api/announcements/preview/", {"audience_role": "parent"}, format="json").json()
        self.assertEqual(pv["total"], 1)
        r = c.post("/api/announcements/", {"title": "x", "body": "y"}, format="json")
        self.assertEqual(r.json()["recipients"], User.objects.count() - 1)


@override_settings(NOTIFY_ASYNC=False)
class MiscTests(TestCase):
    def setUp(self):
        self.adm = User.objects.create_user("adm", role="admin", password="pass12345")
        self.api = APIClient(); self.api.force_authenticate(self.adm)

    def test_login_and_me(self):
        c = APIClient()
        tok = c.post("/api/auth/login/", {"username": "adm", "password": "pass12345"}, format="json").json()["access"]
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")
        self.assertEqual(c.get("/api/users/me/").json()["role"], "admin")
        self.assertEqual(APIClient().get("/api/users/me/").status_code, 401)

    def test_telegram_link_flow(self):
        from core import views
        s = SchoolSettings.get(); s.telegram_bot_username = "my_school_bot"; s.save()
        link = self.api.get("/api/users/me/telegram/").json()["link"]
        token = link.split("start=")[1]
        import unittest.mock as um
        with um.patch("core.views.telegram_send"):
            views.handle_telegram_update({"message": {"text": f"/start {token}", "chat": {"id": 987}}}, "x")
        self.adm.refresh_from_db()
        self.assertEqual(self.adm.telegram_chat_id, "987"); self.assertTrue(self.adm.notify_telegram)

    def test_phone_normalization(self):
        from core.notify import normalize_phone
        self.assertEqual(normalize_phone("0555 12 34 56"), "213555123456")
        self.assertEqual(normalize_phone("+213555123456"), "213555123456")
        self.assertEqual(normalize_phone("0612345678", "212"), "212612345678")

    def test_settings_secret_masked(self):
        self.api.patch("/api/settings/", {"whatsapp_token": "abcdefSECRET"}, format="json")
        d = self.api.get("/api/settings/").json()
        self.assertTrue(d["whatsapp_token"].startswith("••••"))
        self.api.patch("/api/settings/", {"whatsapp_token": d["whatsapp_token"], "name": "X"}, format="json")
        self.assertEqual(SchoolSettings.get().whatsapp_token, "abcdefSECRET")

    def test_generate_payments_and_pay(self):
        lvl = Level.objects.create(name="3AM"); m = Module.objects.create(name="M", level=lvl)
        st = User.objects.create_user("s", role="student")
        Subscription.objects.create(student=st, module=m, monthly_fee=2000)
        r = self.api.post("/api/payments/generate/", {"label": "Nov", "due_date": "2026-11-05"}, format="json")
        self.assertEqual(r.json()["created"], 1)
        self.assertEqual(self.api.post("/api/payments/generate/", {"label": "Nov", "due_date": "2026-11-05"}, format="json").json()["created"], 0)
        p = Payment.objects.get(); self.assertEqual(p.amount, 2000)
        self.api.post(f"/api/payments/{p.id}/pay/"); p.refresh_from_db(); self.assertIsNotNone(p.paid_on)
        c = APIClient(); c.force_authenticate(st)
        self.assertEqual(len(c.get("/api/payments/").json()), 1)
        self.assertEqual(c.post("/api/payments/generate/", {}).status_code, 403)

    def test_repeat_weekly_sessions(self):
        lvl = Level.objects.create(name="3AM"); m = Module.objects.create(name="M", level=lvl)
        t = User.objects.create_user("t", role="teacher"); g = Group.objects.create(name="A", level=lvl, year="x")
        st = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=1)
        r = self.api.post("/api/sessions/", {"module": m.id, "group": g.id, "teacher": t.id, "start": st.isoformat(),
                                             "end": (st + timedelta(hours=1)).isoformat(), "repeat_weeks": 3}, format="json")
        self.assertEqual(r.json()["created"], 4)

    def test_staff_cannot_create_admin(self):
        staff = User.objects.create_user("sec", role="staff"); c = APIClient(); c.force_authenticate(staff)
        r = c.post("/api/users/", {"username": "boss", "role": "admin"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(c.post("/api/users/", {"username": "par", "role": "parent"}, format="json").status_code, 201)

    def test_daily_job_once_per_day(self):
        s = SchoolSettings.get(); s.reminder_hour = 0; s.save()
        self.assertIsNotNone(services.daily_job())
        self.assertIsNone(services.daily_job())


@override_settings(NOTIFY_ASYNC=False)
class PreviewTests(TestCase):
    def test_preview_chosen_people_only(self):
        adm = User.objects.create_user("adm", role="admin")
        s1 = User.objects.create_user("s1", role="student"); User.objects.create_user("s2", role="student")
        p = User.objects.create_user("p", role="parent"); p.children.add(s1)
        c = APIClient(); c.force_authenticate(adm)
        r = c.post("/api/announcements/preview/", {"audience_users": [s1.id], "include_parents": True}, format="json").json()
        self.assertEqual(r["total"], 2)
        r = c.post("/api/announcements/preview/", {"audience_users": [s1.id], "include_parents": False}, format="json").json()
        self.assertEqual(r["total"], 1)
