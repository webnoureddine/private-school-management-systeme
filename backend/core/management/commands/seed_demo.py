"""Demo data in Arabic: teachers, classes, students with module subscriptions, parents,
timetable (today included), attendance history, grades and payments.
Safe to run several times (no duplicates).

Logins: admin/admin12345 · teacher1..6 / student1..24 / parent1..12 : demo12345
"""
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.algeria import seed_algeria
from core.models import *

TEACHERS = [  # (first, last, [module name_ar])
    ("كريم", "بن علي", ["اللغة العربية", "التربية الإسلامية"]),
    ("سارة", "منصوري", ["الرياضيات", "الإعلام الآلي"]),
    ("ياسين", "بوزيد", ["اللغة الفرنسية", "التربية المدنية"]),
    ("أمينة", "حدّاد", ["اللغة الإنجليزية", "التربية البدنية"]),
    ("عبد الرحمان", "شريف", ["علوم الطبيعة والحياة", "الفيزياء والتكنولوجيا"]),
    ("نادية", "زيتوني", ["التاريخ والجغرافيا", "التربية الفنية"]),
]
FIRST_M = ["محمد", "أحمد", "يوسف", "إسلام", "أنس", "رياض", "عمر", "بلال", "ياسر", "حمزة", "زكرياء", "إلياس"]
FIRST_F = ["فاطمة", "مريم", "ليلى", "إيمان", "خديجة", "سلمى", "نور الهدى", "آسيا", "ريم", "هاجر", "أميرة", "شيماء"]
LAST = ["بن عمر", "مرابط", "قاسمي", "بوعلام", "سعداوي", "جباري", "عمراني", "بلقاسم", "تواتي", "حمداني",
        "رحماني", "لعرابي", "بن يوسف", "مغربي", "قريشي", "خليفي"]
TOPICS = {  # realistic lesson titles by module (Arabic name)
    "اللغة العربية": ["النص الأدبي: وصف الطبيعة", "الإعراب: المبتدأ والخبر", "التعبير الكتابي: رسالة إلى صديق", "الصرف: الفعل المعتل", "قواعد الإملاء: الهمزة"],
    "الرياضيات": ["المعادلات من الدرجة الأولى", "نظرية فيثاغورس", "الهندسة: الزوايا والمثلثات", "الحساب على الجذور", "الإحصاء: المتوسط الحسابي"],
    "اللغة الفرنسية": ["Le présent de l'indicatif", "Compréhension de l'écrit", "Le récit au passé", "Production écrite : le dialogue", "Le vocabulaire de la ville"],
    "اللغة الإنجليزية": ["Present perfect", "Reading: My school life", "Writing a short email", "Vocabulary: Jobs", "Listening practice"],
    "علوم الطبيعة والحياة": ["الجهاز التنفسي", "التغذية والهضم", "الخلية: بنيتها ووظيفتها", "التوازن البيئي"],
    "الفيزياء والتكنولوجيا": ["الدارات الكهربائية", "قانون أوم", "الضوء وانتشاره", "الذرة والجزيئات"],
    "التاريخ والجغرافيا": ["الثورة التحريرية الجزائرية", "التضاريس الجزائرية", "الموارد الطبيعية في الجزائر", "الحرب العالمية الثانية"],
    "التربية الإسلامية": ["سورة الحجرات وآدابها", "السيرة النبوية: الهجرة", "أخلاق المسلم: الصدق", "أحكام الصلاة"],
    "التربية المدنية": ["حقوق الطفل", "المواطنة والمشاركة", "احترام القانون", "التضامن الاجتماعي"],
    "الإعلام الآلي": ["مكونات الحاسوب", "معالج النصوص", "الجداول والحسابات", "الإنترنت وأمن المعلومات"],
    "التربية البدنية": ["الجري المتوسط", "كرة اليد: التمرير", "الجمباز الأرضي", "اللياقة البدنية"],
    "التربية الفنية": ["الرسم بالألوان المائية", "التشكيل بالخط العربي", "تركيب الألوان", "الزخرفة الإسلامية"],
}
ROOMS = ["القاعة 1", "القاعة 2", "القاعة 3", "القاعة 4"]
GROUPS = [("3AM", "السنة الثالثة متوسط - فوج أ"), ("3AM", "السنة الثالثة متوسط - فوج ب"),
          ("4AM", "السنة الرابعة متوسط - فوج أ")]
CORE = {"اللغة العربية", "الرياضيات", "اللغة الفرنسية", "اللغة الإنجليزية"}  # every student takes these
SLOTS = [8, 9, 10, 11]  # starting hours (1h sessions)
YEAR = "2026-2027"


class Command(BaseCommand):
    help = "بيانات تجريبية بالعربية (admin/admin12345 · teacherN/studentN/parentN : demo12345)"

    def handle(self, *a, **o):
        rnd = random.Random(2026)
        seed_algeria()
        SchoolSettings.objects.get_or_create(pk=1, defaults={"name": "مدرسة النجاح الخاصة", "phone": "0550 12 34 56",
                                                             "address": "حي 500 مسكن، الجزائر العاصمة"})
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@school.dz", "admin12345", role="admin",
                                          first_name="مدير", last_name="المدرسة", language="ar")

        teachers = [self._user(f"teacher{i}", "teacher", f, l) for i, (f, l, _) in enumerate(TEACHERS, 1)]
        self._user("secretary", "staff", "سعاد", "بلعيد")
        rooms = [Room.objects.get_or_create(name=n, defaults={"capacity": 30})[0] for n in ROOMS]

        groups, students, n = [], [], 0
        for lvl_name, g_name in GROUPS:
            lvl = Level.objects.get(name=lvl_name)
            g, _ = Group.objects.get_or_create(name=g_name, level=lvl, year=YEAR)
            gs = []
            for _k in range(8):
                n += 1
                female = rnd.random() < 0.5
                first = rnd.choice(FIRST_F if female else FIRST_M)
                gs.append(self._user(f"student{n}", "student", first, LAST[(n * 5) % len(LAST)]))
            g.students.add(*gs)
            groups.append(g); students += gs

        for i in range(0, len(students), 2):  # one parent per two students
            p = self._user(f"parent{i // 2 + 1}", "parent", rnd.choice(FIRST_M), students[i].last_name)
            p.children.add(*students[i:i + 2])

        teachings = {}  # each teacher teaches his modules to every class of the level
        for g in groups:
            for t, (_, _, mod_names) in zip(teachers, TEACHERS):
                for m in Module.objects.filter(level=g.level, name_ar__in=mod_names):
                    Teaching.objects.get_or_create(group=g, module=m, defaults={"teacher": t})
                    m.teachers.add(t)
                    teachings.setdefault(g.id, []).append((m, t))

        # subscriptions: core modules for everybody, the others only for some students
        today = timezone.localdate()
        since = date(today.year if today.month >= 9 else today.year - 1, 9, 15)
        for st in students:
            for g in st.class_groups.all():
                for m, _t in teachings[g.id]:
                    if m.name_ar in CORE or rnd.random() < 0.6:
                        Subscription.objects.get_or_create(
                            student=st, module=m,
                            defaults={"start_date": since, "monthly_fee": Decimal(rnd.choice([1500, 2000, 2500]))})

        # timetable: past days + today + next days (Sun..Thu; today is always filled for the demo)
        busy, sessions = set(), []
        for off in range(-4, 8):
            day = today + timedelta(days=off)
            if day.weekday() in (4, 5) and off != 0:  # Friday / Saturday = weekend in Algeria
                continue
            for gi, g in enumerate(groups):
                pool = teachings[g.id][:]
                rnd.shuffle(pool)
                for h in SLOTS:
                    start = timezone.make_aware(datetime.combine(day, datetime.min.time()).replace(hour=h))
                    pick = next(((m, t) for m, t in pool if (t.id, start) not in busy), None)
                    if not pick: continue
                    m, t = pick
                    busy.add((t.id, start)); pool.remove(pick)
                    s, _ = Session.objects.get_or_create(
                        module=m, group=g, teacher=t, start=start,
                        defaults=dict(end=start + timedelta(minutes=60), room=rooms[gi],
                                      topic=rnd.choice(TOPICS.get(m.name_ar, ["مراجعة ومتابعة"]))))
                    sessions.append(s)

        future = [s for s in sessions if s.start > timezone.now() and s.status == "planned"]
        if future:  # one cancelled session
            s = future[3 % len(future)]
            s.status, s.cancel_reason = "cancelled", "غياب الأستاذ لظروف صحية"; s.save()
        for s in sessions:  # attendance history
            if s.end < timezone.now() and s.status == "planned":
                s.status = "done"; s.save(update_fields=["status"])
                for st in s.roster():
                    absent = rnd.random() < 0.1
                    late = 0 if absent or rnd.random() > 0.15 else rnd.choice([5, 10, 15])
                    Attendance.objects.get_or_create(session=s, student=st, defaults={"present": not absent, "late_minutes": late})

        for sub in Subscription.objects.select_related("student", "module"):  # grades for subscribed modules only
            for title in ("فرض المحروسة 1", "اختبار الفصل الأول"):
                Grade.objects.get_or_create(student=sub.student, module=sub.module, title=title,
                                            defaults={"score": Decimal(rnd.randint(60, 190)) / 10})

        MONTHS = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
        for st in students:  # tuition = sum of the monthly fees of the subscribed modules
            total = sum(s.monthly_fee for s in st.subscriptions.all())
            for k in range(2):  # current month + next month
                y, m = (today.year, today.month + k) if today.month + k <= 12 else (today.year + 1, 1)
                label = f"رسوم شهر {MONTHS[m - 1]} {y}"
                due = date(y, m, 5)
                paid = due if (k == 0 and rnd.random() < 0.75) else None
                Payment.objects.get_or_create(student=st, label=label, defaults={"amount": total, "due_date": due, "paid_on": paid})

        Announcement.objects.get_or_create(
            title="مرحبا بكم في الموسم الدراسي الجديد",
            defaults={"body": "نتمنى لكم موسما دراسيا موفقا. يرجى الاطلاع على جدول الحصص والمواد المشترك فيها.",
                      "created_by": User.objects.get(username="admin")})
        self.stdout.write(self.style.SUCCESS(
            f"تم: {len(teachers)} أساتذة، {len(students)} تلميذا، {Subscription.objects.count()} اشتراكا، {Session.objects.count()} حصة"))

    def _user(self, username, role, first, last):
        u, c = User.objects.get_or_create(username=username, defaults=dict(
            role=role, first_name=first, last_name=last, language="ar", email=f"{username}@school.dz",
            phone=f"+2135{random.Random(username).randint(50000000, 79999999)}"))
        if c: u.set_password("demo12345"); u.save()
        return u
