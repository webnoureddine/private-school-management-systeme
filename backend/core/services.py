"""Business automation: reminders, cancellations, closures, payments, messages."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .models import Announcement, Payment, Session, SchoolSettings, Subscription, User
from .notify import cfg, channel_status, notify, notify_many

MSG = {
    "reminder": {
        "ar": ("تذكير بالحصة", "نذكّركم بأن غدا {date} حصة {module} على الساعة {time} مع الأستاذ(ة) {teacher}.{topic}"),
        "fr": ("Rappel de cours", "Rappel : demain {date}, cours de {module} à {time} avec {teacher}.{topic}"),
        "en": ("Class reminder", "Reminder: tomorrow {date}, {module} at {time} with {teacher}.{topic}"),
    },
    "teacher_reminder": {
        "ar": ("تذكير بحصصك", "لديك غدا {count} حصة: {list}"),
        "fr": ("Rappel de vos cours", "Vous avez demain {count} cours : {list}"),
        "en": ("Your classes tomorrow", "You have {count} class(es) tomorrow: {list}"),
    },
    "session_reminder": {
        "ar": ("تذكير من الأستاذ(ة) {teacher}", "حصة {module} يوم {date} على الساعة {time}.{topic}{note}"),
        "fr": ("Rappel de {teacher}", "Cours de {module} le {date} à {time}.{topic}{note}"),
        "en": ("Reminder from {teacher}", "{module} on {date} at {time}.{topic}{note}"),
    },
    "cancel": {
        "ar": ("إلغاء حصة", "تم إلغاء حصة {module} ليوم {date} على الساعة {time}. السبب: {reason}"),
        "fr": ("Cours annulé", "Le cours {module} du {date} à {time} est annulé. Motif : {reason}"),
        "en": ("Class cancelled", "{module} on {date} at {time} is cancelled. Reason: {reason}"),
    },
    "closure": {
        "ar": ("إغلاق المدرسة", "المدرسة مغلقة يوم {date} ولن تكون هناك دروس{scope}. السبب: {reason}"),
        "fr": ("École fermée", "L'école sera fermée le {date}, pas de cours{scope}. Motif : {reason}"),
        "en": ("School closed", "The school will be closed on {date}, no classes{scope}. Reason: {reason}"),
    },
    "payment": {
        "ar": ("تذكير بالدفع", "الدفعة «{label}» للتلميذ(ة) {student} بمبلغ {amount} {cur} مستحقة بتاريخ {date}."),
        "fr": ("Rappel de paiement", "Le paiement « {label} » de {student} ({amount} {cur}) est dû le {date}."),
        "en": ("Payment reminder", "Payment '{label}' for {student} ({amount} {cur}) is due on {date}."),
    },
    "absence": {
        "ar": ("إشعار غياب", "التلميذ(ة) {student} غائب(ة) عن حصة {module} يوم {date} على الساعة {time}."),
        "fr": ("Absence", "{student} était absent(e) au cours de {module} le {date} à {time}."),
        "en": ("Absence", "{student} was absent from {module} on {date} at {time}."),
    },
}


def _fmt(user, kind, **ctx):
    title, body = MSG[kind].get(user.language, MSG[kind]["ar"])
    return title.format(**ctx), body.format(**ctx)


def _send(user, kind, channels=None, **ctx):
    title, body = _fmt(user, kind, **ctx)
    return notify(user, title, body, kind if kind in ("cancel", "closure", "payment", "absence") else "reminder", channels)


def _module_name(module, user):
    return module.name_ar if user.language == "ar" and module.name_ar else module.name


def _ctx(session, user):
    local = timezone.localtime(session.start)
    return dict(module=_module_name(session.module, user), date=local.strftime("%d/%m/%Y"), time=local.strftime("%H:%M"),
                teacher=session.teacher.display_name(), topic=f" ({session.topic})" if session.topic else "")


def parents_of(students):
    return list(User.objects.filter(children__in=students, is_active=True).distinct())


def session_audience(session, include_parents=True):
    """Students expected at the session (class + subscribed to the module) + their parents."""
    students = list(session.roster().filter(is_active=True))
    return students + (parents_of(students) if include_parents else [])


def send_tomorrow_reminders():
    """Run daily (default 18:00). Students + parents get one message per class, teachers one summary."""
    tomorrow = timezone.localdate() + timedelta(days=1)
    qs = Session.objects.filter(status="planned", reminder_sent=False, start__date=tomorrow) \
        .select_related("module", "teacher", "group")
    n, per_teacher = 0, {}
    for s in qs:
        # atomic claim -> never sent twice even if two schedulers run
        if not Session.objects.filter(pk=s.pk, reminder_sent=False).update(reminder_sent=True):
            continue
        for u in session_audience(s):
            _send(u, "reminder", **_ctx(s, u)); n += 1
        per_teacher.setdefault(s.teacher, []).append(s)
    for t, sessions in per_teacher.items():
        items = ", ".join(f"{timezone.localtime(s.start):%H:%M} {_module_name(s.module, t)} ({s.group.name})" for s in sessions)
        _send(t, "teacher_reminder", count=len(sessions), list=items); n += 1
    return n


def remind_session(session, note="", channels=None, include_parents=True):
    """A teacher/admin manually reminds the students of one session (e.g. 'don't forget tomorrow')."""
    people = session_audience(session, include_parents)
    for u in people:
        ctx = _ctx(session, u)
        _send(u, "session_reminder", channels=channels, note=f"\n{note}" if note else "", **ctx)
    return len(people)


def cancel_session(session, reason, channels=None):
    session.status = "cancelled"; session.cancel_reason = reason; session.save()
    people = session_audience(session) + [session.teacher]
    for u in people:
        _send(u, "cancel", channels=channels, reason=reason, **_ctx(session, u))
    return len(people)


def apply_closure(closure):
    """Cancels every planned session of that day and notifies everyone concerned."""
    sessions = Session.objects.filter(status="planned", start__date=closure.date)
    if closure.group_id:
        sessions = sessions.filter(group=closure.group)
        students = list(closure.group.students.filter(is_active=True))
        people = set(students) | {s.teacher for s in sessions} | set(parents_of(students))
    else:
        people = set(User.objects.filter(is_active=True).exclude(role="admin").exclude(is_superuser=True))
    sessions.update(status="cancelled", cancel_reason=closure.reason)
    for u in people:
        scope = f" ({closure.group.name})" if closure.group_id else ""
        _send(u, "closure", date=closure.date.strftime("%d/%m/%Y"), reason=closure.reason, scope=scope)
    closure.notified = True; closure.save(update_fields=["notified"])
    return len(people)


def send_payment_reminders(days_before=None):
    s = SchoolSettings.get()
    days_before = s.payment_reminder_days if days_before is None else days_before
    today = timezone.localdate()
    qs = list(Payment.objects.filter(paid_on__isnull=True, due_date__lte=today + timedelta(days=days_before))
              .filter(Q(last_reminder__isnull=True) | Q(last_reminder__lt=today - timedelta(days=7)))
              .select_related("student"))
    for p in qs:
        for u in [p.student, *p.student.parents.filter(is_active=True)]:
            _send(u, "payment", label=p.label, amount=f"{p.amount:.0f}", cur=s.currency,
                  student=p.student.display_name(), date=p.due_date.strftime("%d/%m/%Y"))
        p.last_reminder = today; p.save(update_fields=["last_reminder"])
    return len(qs)


def mark_done_sessions():
    return Session.objects.filter(status="planned", end__lt=timezone.now()).update(status="done")


def daily_job(force=False):
    """Everything that must happen once a day. Safe to call often: it only runs once per day after reminder_hour."""
    s = SchoolSettings.get()
    now = timezone.localtime()
    done = mark_done_sessions()
    if not force and (now.hour < s.reminder_hour or s.last_daily_run == now.date()):
        return None
    if not force and not SchoolSettings.objects.filter(pk=s.pk).exclude(last_daily_run=now.date()).update(last_daily_run=now.date()):
        return None
    return {"reminders": send_tomorrow_reminders(), "payments": send_payment_reminders(), "done": done}


# ---------------------------------------------------------------- messages
def message_audience(a, chosen=None):
    """Resolve an Announcement's audience to a set of users. `chosen` = explicit users (before the message is saved)."""
    users = set()
    if chosen is None:
        chosen = list(a.audience_users.filter(is_active=True)) if a.pk else []
    targeted = bool(a.audience_group_id or a.audience_session_id or chosen)
    if a.audience_session_id:
        users |= set(a.audience_session.roster().filter(is_active=True))
    if a.audience_group_id:
        qs = User.objects.filter(is_active=True)
        role = a.audience_role
        if role in ("", "student", "parent"):
            users |= set(qs.filter(class_groups=a.audience_group))
        if role in ("", "teacher"):
            users |= set(qs.filter(teachings__group=a.audience_group))
    users |= set(chosen)
    if not targeted:  # whole school (optionally one role)
        qs = User.objects.filter(is_active=True)
        users = set(qs.filter(role=a.audience_role) if a.audience_role else qs)
    if a.audience_role == "parent" and targeted:  # parents of the targeted students only
        users = set(parents_of([u for u in users if u.role == "student"]))
    elif a.include_parents:
        users |= set(parents_of([u for u in users if u.role == "student"]))
    if a.created_by_id:
        users.discard(a.created_by)
    return users


def send_message(a):
    users = message_audience(a)
    channels = [c for c in (a.channels or "").split(",") if c]
    notify_many(sorted(users, key=lambda u: u.id), a.title, a.body, "message", channels or [], announcement=a)
    a.sent = True; a.recipients = len(users); a.save(update_fields=["sent", "recipients"])
    return len(users)


broadcast = send_message  # backward compatibility


def absence_alert(attendance):
    s, st = attendance.session, attendance.student
    for u in [st, *st.parents.filter(is_active=True)]:
        ctx = _ctx(s, u)
        _send(u, "absence", student=st.display_name(), module=ctx["module"], date=ctx["date"], time=ctx["time"])


# ---------------------------------------------------------------- payments
def generate_monthly_payments(label, due_date, group=None):
    """One payment per student = sum of the monthly fees of his active subscriptions. Skips duplicates."""
    subs = Subscription.objects.filter(active=True, monthly_fee__gt=0)
    if group:
        subs = subs.filter(student__class_groups=group)
    totals = subs.values("student").annotate(total=Sum("monthly_fee"))
    created = 0
    for row in totals:
        _, c = Payment.objects.get_or_create(student_id=row["student"], label=label,
                                             defaults={"amount": row["total"] or Decimal(0), "due_date": due_date})
        created += c
    return created


def send_welcome(user, password, site_url):
    """Welcome message by WhatsApp + email (+ in-app): login details and the school's Telegram bot link."""
    c = cfg()
    lines = [f"مرحبا {user.display_name()} 👋", f"تم تسجيلك في {c['name']}.", "",
             f"🌐 المنصة: {site_url}", f"👤 اسم المستخدم: {user.username}"]
    if password: lines.append(f"🔑 كلمة المرور: {password}")
    if c["tg_username"]:
        lines += ["", "📲 لاستقبال إشعارات الحصص والغيابات على تيليغرام، افتح الرابط واضغط Start ثم «مشاركة رقم هاتفي»:",
                  f"https://t.me/{c['tg_username'].lstrip('@')}"]
    stored = "\n".join(l if not l.startswith("🔑") else "🔑 كلمة المرور: ••••••" for l in lines)
    n = notify(user, f"مرحبا بك في {c['name']}", stored, "message", channels=["whatsapp", "email"], external_body="\n".join(lines))
    return [ch for ch in (n.channels_ok + "," + n.channels_pending).split(",") if ch and ch != "app"]
